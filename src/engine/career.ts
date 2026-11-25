// Sự nghiệp HLV (uy tín, niềm tin ban lãnh đạo, mục tiêu mùa, bị sa thải / lời mời), thương hiệu – người hâm mộ, sổ thu chi theo tuần.
import { S, addNews, userTeam, teamOvr, teamPlayers } from './state';
import { clamp, logistic, rand } from './util';
import type { Comp, Match } from './types';

// ---------- sổ thu chi theo tuần ----------
export type LedgerCat = 'salary' | 'staff' | 'sponsor' | 'merch' | 'prize' | 'transfer' | 'other';
export const LEDGER_CATS: LedgerCat[] = ['sponsor', 'merch', 'prize', 'transfer', 'salary', 'staff', 'other'];
export const weekIdx = (): number => Math.max(0, Math.floor((S.day - (S.seasonStartDay ?? 0)) / 7));
export function ledgerAdd(cat: LedgerCat, amount: number): void {
  if (!amount) return;
  S.ledger ??= [];
  const key = `${S.season}-${weekIdx()}`;
  let row = S.ledger[0];
  if (!row || row.key !== key) { row = { key, season: S.season, week: weekIdx() + 1 }; S.ledger.unshift(row); if (S.ledger.length > 20) S.ledger.length = 20; }
  (row as Record<string, number | string>)[cat] = +(((row as Record<string, number>)[cat] || 0) + amount).toFixed(2);
}
export const ledgerCatOf = (key: string): LedgerCat => (/prize/.test(key) ? 'prize' : /transfer|release/.test(key) ? 'transfer' : /academy|brand/.test(key) ? 'staff' : /sponsor/.test(key) ? 'sponsor' : 'other');

// ---------- thương hiệu ----------
const LG_FANS: Record<string, number> = { LCK: 1.4, LPL: 1.5, LEC: 1.0, LCS: 0.8, LCP: 0.75, CBLOL: 0.75, VCS: 0.85 };
export interface Brand { fans: number; hype: number; content: number; merch: number; fansStart: number }
export function ensureBrand(): Brand {
  if (S.brand) return S.brand;
  const ut = userTeam();
  const fans = Math.round((80 + Math.max(0, teamOvr(ut) - 70) * 45) * (LG_FANS[ut.league] || 1));
  S.brand = { fans, hype: 45, content: 0, merch: 0, fansStart: fans };
  return S.brand;
}
// tài chính chạy theo 'ngày thi đấu' (~50 lượt/mùa) như lương & tài trợ
export const TICKS = 50;
export const CONTENT_COST = [0, 8, 18, 32]; // nghìn $/lượt
export const MERCH_UPGRADE = [0, 120, 260, 450]; // nghìn $ một lần
export const FEST_COST = 90;
export const merchPerDay = (b: Brand): number => b.fans * 0.02 * (1 + b.merch * 0.55) * (0.7 + b.hype / 150);
export function setContent(level: number): void { ensureBrand().content = clamp(Math.round(level), 0, 3); }
export function upgradeMerch(): boolean {
  const b = ensureBrand();
  if (b.merch >= 3) return false;
  const cost = MERCH_UPGRADE[b.merch + 1];
  const ut = userTeam();
  if (ut.budget < cost) return false;
  b.merch++;
  ut.budget -= cost;
  S.finance.unshift({ key: 'fin.brandMerch', amount: -cost, params: { n: b.merch }, day: S.day, season: S.season });
  ledgerAdd('staff', -cost);
  return true;
}
export function fanFestival(): boolean {
  const b = ensureBrand();
  const ut = userTeam();
  if (ut.budget < FEST_COST || (S.festDay != null && S.day - S.festDay < 30)) return false;
  ut.budget -= FEST_COST;
  S.festDay = S.day;
  b.hype = clamp(b.hype + 18, 0, 100);
  b.fans = Math.round(b.fans * 1.02);
  for (const p of teamPlayers(ut)) p.morale = clamp((p.morale ?? 70) + 3, 20, 100);
  S.finance.unshift({ key: 'fin.brandFest', amount: -FEST_COST, day: S.day, season: S.season });
  ledgerAdd('staff', -FEST_COST);
  return true;
}
export function brandDay(): void {
  const b = ensureBrand();
  const ut = userTeam();
  const merch = merchPerDay(b);
  const content = CONTENT_COST[b.content];
  ut.budget += merch - content;
  ledgerAdd('merch', merch);
  if (content) ledgerAdd('staff', -content);
  // người hâm mộ: nội dung + độ nóng
  b.fans = +(b.fans * (1 + 0.0015 * b.content + (b.hype - 40) / 100 * 0.006)).toFixed(1);
  b.hype = clamp(b.hype + (35 + b.content * 4 - b.hype) * 0.08, 0, 100);
}
function hypeOn(win: boolean, intl: boolean): void {
  const b = ensureBrand();
  b.hype = clamp(b.hype + (win ? (intl ? 6 : 3) : (intl ? -4 : -2)), 0, 100);
}

// ---------- sự nghiệp HLV ----------
export type ObjKind = 'title' | 'contend' | 'playoffs' | 'develop';
export interface CareerSeason { season: number; team: string; league: string; best: number | null; w: number; l: number; titles: string[]; conf: number }
export interface Career { rep: number; conf: number; obj: ObjKind; w: number; l: number; sw: number; sl: number; hist: CareerSeason[]; offers: { team: string; day: number }[]; sacked?: boolean; best?: number | null }
const leagueRank = (teamId: string): { rank: number; n: number } => {
  const lg = S.teams[teamId].league;
  const list = Object.values(S.teams).filter((t) => t.league === lg).sort((a, b) => teamOvr(b) - teamOvr(a));
  return { rank: list.findIndex((t) => t.id === teamId) + 1, n: list.length };
};
export function objFor(teamId: string): ObjKind {
  const { rank } = leagueRank(teamId);
  return rank <= 2 ? 'title' : rank <= 4 ? 'contend' : rank <= 6 ? 'playoffs' : 'develop';
}
/** thứ hạng cần đạt trong giải quốc nội để hoàn thành mục tiêu */
export const objTarget = (o: ObjKind, n: number): number => (o === 'title' ? 1 : o === 'contend' ? 3 : o === 'playoffs' ? Math.ceil(n / 2) : n - 2);
export function ensureCareer(): Career {
  if (S.career) return S.career;
  S.career = { rep: 40, conf: 70, obj: objFor(S.userTeam), w: 0, l: 0, sw: 0, sl: 0, hist: [], offers: [], best: null };
  return S.career;
}
/** sau mỗi loạt đấu của đội người chơi */
export function careerOnSeries(m: Match): void {
  const ut = S.userTeam;
  if (!m.done || (m.a !== ut && m.b !== ut)) return;
  const c = ensureCareer();
  const opp = m.a === ut ? m.b : m.a;
  const win = m.winner === ut;
  const exp = logistic((teamOvr(S.teams[ut]) - teamOvr(S.teams[opp])) / 4);
  const intl = S.comps[m.comp]?.league === 'INTL';
  const k = intl ? 2 : 1;
  c.conf = clamp(c.conf + ((win ? 1 : 0) - exp) * 7 * k, 0, 100);
  c.rep = clamp(c.rep + ((win ? 1 : 0) - exp) * 1.4 * k, 0, 100);
  if (win) { c.w++; c.sw++; } else { c.l++; c.sl++; }
  hypeOn(win, intl);
  if (c.conf < 25 && !win) addNews('news.boardWarn', {}, true);
}
/** khi một giải có cúp kết thúc: đánh giá theo thứ hạng */
export function careerOnComp(comp: Comp, order: string[]): void {
  const ut = S.userTeam;
  const pos = order.indexOf(ut);
  if (pos < 0) return;
  const c = ensureCareer();
  const intl = comp.league === 'INTL';
  const b = ensureBrand();
  if (pos === 0) { c.conf = clamp(c.conf + (intl ? 25 : 15), 0, 100); c.rep = clamp(c.rep + (intl ? 14 : 7), 0, 100); b.hype = clamp(b.hype + (intl ? 30 : 18), 0, 100); b.fans = Math.round(b.fans * (intl ? 1.12 : 1.05)); }
  if (!intl) {
    const n = order.length;
    const target = objTarget(c.obj, n);
    c.conf = clamp(c.conf + (pos + 1 <= target ? 6 : -10 * Math.min(2, (pos + 1 - target) / Math.max(2, n / 4))), 0, 100);
    c.best = c.best == null ? pos + 1 : Math.min(c.best, pos + 1);
  } else if (pos <= 3) c.rep = clamp(c.rep + 3, 0, 100);
}
/** chuyển sang dẫn dắt đội khác (sau khi bị sa thải hoặc nhận lời mời) */
export function switchTeam(teamId: string): void {
  const c = ensureCareer();
  const from = S.userTeam;
  S.userTeam = teamId;
  S.sqOrder = {}; S.scrimPlan = { on: false, opp: null }; S.listed = []; S.offers = []; S.boostActive = null; S.tasks = undefined;
  c.obj = objFor(teamId);
  c.conf = 65; c.sacked = false; c.offers = [];
  S.brand = undefined;
  ensureBrand();
  S.goal = 'goal.' + c.obj;
  addNews('news.newJob', { team: S.teams[teamId].name, from: S.teams[from].name }, true);
}
/** cuối mùa (trước khi sang mùa mới): ghi lịch sử, xét sa thải và lời mời */
export function careerNewSeason(): void {
  const c = ensureCareer();
  const ut = userTeam();
  const y = S.season;
  c.hist.unshift({ season: y, team: ut.id, league: ut.league, best: c.best ?? null, w: c.sw, l: c.sl, titles: ut.trophies.filter((x) => x.endsWith(String(y))), conf: Math.round(c.conf) });
  c.sw = 0; c.sl = 0; c.best = null;
  // tài trợ theo lượng người hâm mộ
  const b = ensureBrand();
  ut.sponsor = Math.round(ut.sponsor * clamp(1 + (b.fans / b.fansStart - 1) * 0.35, 0.9, 1.25));
  b.fansStart = b.fans;
  if (c.conf < 20) {
    c.sacked = true;
    c.rep = clamp(c.rep - 8, 0, 100);
    const mine = teamOvr(ut);
    c.offers = Object.values(S.teams).filter((t) => t.id !== ut.id && teamOvr(t) < mine - 1).sort(() => rand() - 0.5).slice(0, 3).map((t) => ({ team: t.id, day: S.day }));
    addNews('news.sacked', { team: ut.name }, true);
  } else {
    c.obj = objFor(ut.id);
    S.goal = 'goal.' + c.obj;
    // HLV uy tín được các đội mạnh hơn mời
    if (c.rep >= 58) {
      const mine = teamOvr(ut);
      c.offers = Object.values(S.teams).filter((t) => t.id !== ut.id && teamOvr(t) > mine + 1 && rand() < 0.5 + (c.rep - 58) / 60).sort((a, b2) => teamOvr(b2) - teamOvr(a)).slice(0, 2).map((t) => ({ team: t.id, day: S.day }));
      if (c.offers.length) addNews('news.jobOffer', { n: c.offers.length }, true);
    } else c.offers = [];
    c.conf = clamp(c.conf * 0.6 + 30, 0, 100);
  }
}
