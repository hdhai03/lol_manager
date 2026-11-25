// Quản lý CLB: chấn thương & kiệt sức, nhiệm vụ ban lãnh đạo, cơ sở vật chất, nhà tài trợ có điều kiện, kỳ chuyển nhượng & tranh mua.
import { S, addNews, userTeam, teamPlayers, teamOvr, autoLineup } from './state';
import { paySellOn } from './club2';
import { clamp, pick, rand, randInt } from './util';
import { signPlayer } from './season';
import { teamChem, sqOrder } from './life';
import { ledgerAdd } from './career';
import type { Phase, Player } from './types';

// ---------- cơ sở vật chất ----------
export type FacKind = 'house' | 'training' | 'gym' | 'analysis';
export const FACS: FacKind[] = ['house', 'training', 'gym', 'analysis'];
export const FAC_COST = [0, 300, 700, 1400]; // nghìn $, nâng cấp một lần
export const FAC_UPKEEP = [0, 4, 8, 14]; // nghìn $ / lượt
export const facLv = (k: FacKind): number => S.fac?.[k] ?? 0;
export function upgradeFac(k: FacKind): boolean {
  S.fac ??= { house: 0, training: 0, gym: 0, analysis: 0 };
  const lv = S.fac[k];
  if (lv >= 3) return false;
  const cost = FAC_COST[lv + 1];
  const ut = userTeam();
  if (ut.budget < cost) return false;
  ut.budget -= cost;
  ledgerAdd('staff', -cost);
  S.finance.unshift({ key: 'fin.facility', amount: -cost, params: { f: { $t: 'fac.' + k } }, day: S.day, season: S.season });
  S.fac[k] = lv + 1;
  return true;
}

// ---------- chấn thương & kiệt sức ----------
export type InjKind = 'wrist' | 'back' | 'burnout';
export function injuryRisk(p: Player): number {
  let r = 0.0012;
  if ((p.cond ?? 100) < 50) r += 0.004;
  if ((p.cond ?? 100) < 35) r += 0.006;
  if (p.teamId === S.userTeam && sqOrder(p.id) === 'grind') r += 0.002;
  if (p.age >= 27) r += 0.0008;
  r *= 1 - facLv('gym') * 0.18 - (S.staff?.fitness ?? 0) * 0.12;
  return Math.max(0.0002, r);
}
function injure(p: Player): void {
  const burnout = (p.cond ?? 100) < 40 && rand() < 0.5;
  const kind: InjKind = burnout ? 'burnout' : rand() < 0.6 ? 'wrist' : 'back';
  const days = kind === 'burnout' ? randInt(10, 20) : kind === 'wrist' ? randInt(7, 28) : randInt(5, 14);
  p.injury = { kind, until: S.day + days };
  if (kind === 'burnout') p.morale = clamp((p.morale ?? 70) - 15, 20, 100);
  const t = p.teamId ? S.teams[p.teamId] : null;
  if (t) {
    // thay người cùng vị trí nếu có
    if (Object.values(t.lineup).includes(p.id)) autoLineup(t);
    if (t.id === S.userTeam) addNews('news.injury', { player: p.ign, kind: { $t: 'inj.' + kind }, n: days }, true);
  }
}
export function injuryDay(): void {
  for (const p of Object.values(S.players)) {
    if (p.retired || (!p.teamId && !p.academyOf)) continue;
    if (p.injury) {
      p.cond = Math.min(p.cond ?? 100, 40);
      if (S.day >= p.injury.until) {
        delete p.injury;
        p.cond = 75;
        if (p.teamId) { autoLineup(S.teams[p.teamId]); if (p.teamId === S.userTeam) addNews('news.recovered', { player: p.ign }); }
      }
      continue;
    }
    const mine = p.teamId === S.userTeam;
    if (rand() < injuryRisk(p) * (mine ? 1 : 0.6)) injure(p);
  }
}

// ---------- nhiệm vụ ban lãnh đạo ----------
export type MisKind = 'win3' | 'top3' | 'chem' | 'promote' | 'sign' | 'fans';
export interface Mission { id: string; kind: MisKind; start: number; deadline: number; target: number; base: number; reward: number; done?: boolean; failed?: boolean }
const userSeriesWins = (from: number) => Object.values(S.comps).flatMap((c) => c.matches).filter((m) => m.done && m.day >= from && (m.a === S.userTeam || m.b === S.userTeam) && m.winner === S.userTeam).length;
function leagueRank(): number {
  const comps = Object.values(S.comps).filter((c) => c.id.startsWith(`${S.season}-`) && c.league === userTeam().league && c.type === 'league' && !c.done);
  const c = comps[0];
  if (!c) return 99;
  const rec: Record<string, number> = {};
  for (const m of c.matches) if (m.done && m.winner) rec[m.winner] = (rec[m.winner] || 0) + 1;
  const order = c.teams.slice().sort((a, b) => (rec[b] || 0) - (rec[a] || 0));
  return order.indexOf(S.userTeam) + 1;
}
export function missionProgress(m: Mission): number {
  const ut = userTeam();
  switch (m.kind) {
    case 'win3': return userSeriesWins(m.start);
    case 'top3': return leagueRank() <= 3 ? 1 : 0;
    case 'chem': return Math.round(teamChem(ut.id));
    case 'promote': return Object.values(ut.lineup).some((id) => id && (S.news || []).some((n) => n.key === 'news.promotedYouth' && n.day >= m.start && n.params?.player === S.players[id]?.ign)) ? 1 : 0;
    case 'sign': return teamPlayers(ut).some((p) => (S.news || []).some((n) => (n.key === 'news.transfer' || n.key === 'news.signedFA') && n.day >= m.start && n.params?.player === p.ign) && p.ovr >= m.target) ? 1 : 0;
    case 'fans': return Math.round(S.brand?.fans ?? 0);
  }
}
const goalOf = (m: Mission) => (m.kind === 'win3' ? 3 : m.kind === 'chem' ? m.target : m.kind === 'fans' ? m.target : 1);
export const missionGoal = goalOf;
function newMission(): void {
  const ut = userTeam();
  const kinds: MisKind[] = ['win3', 'top3', 'chem', 'promote', 'sign', 'fans'];
  const active = new Set((S.missions || []).filter((m) => !m.done && !m.failed).map((m) => m.kind));
  const avail = kinds.filter((k) => !active.has(k) && !(k === 'top3' && leagueRank() === 99) && !(k === 'promote' && !Object.values(S.players).some((p) => p.academyOf === ut.id)));
  if (!avail.length) return;
  const kind = pick(avail);
  const chem = Math.round(teamChem(ut.id));
  const fans = Math.round(S.brand?.fans ?? 0);
  const target = kind === 'chem' ? Math.min(95, chem + 6) : kind === 'fans' ? Math.round(fans * 1.05) : kind === 'sign' ? Math.max(75, teamOvr(ut) - 2) : 0;
  const m: Mission = { id: 'm' + randInt(1e5, 1e6), kind, start: S.day, deadline: S.day + (kind === 'top3' ? 28 : 21), target, base: kind === 'chem' ? chem : kind === 'fans' ? fans : 0, reward: kind === 'sign' || kind === 'promote' ? 250 : 180 };
  (S.missions ??= []).unshift(m);
  if (S.missions.length > 12) S.missions.length = 12;
  addNews('news.mission', { m: { $t: 'mis.' + kind } }, true);
}
export function missionDay(): void {
  for (const m of S.missions || []) {
    if (m.done || m.failed) continue;
    if ((m.kind !== 'top3' || S.day >= m.deadline) && missionProgress(m) >= goalOf(m)) {
      m.done = true;
      userTeam().budget += m.reward; ledgerAdd('other', m.reward);
      if (S.career) S.career.conf = clamp(S.career.conf + 6, 0, 100);
      addNews('news.missionDone', { m: { $t: 'mis.' + m.kind }, money: m.reward }, true);
    } else if (S.day > m.deadline) {
      m.failed = true;
      if (S.career) S.career.conf = clamp(S.career.conf - 4, 0, 100);
      addNews('news.missionFail', { m: { $t: 'mis.' + m.kind } });
    }
  }
  const active = (S.missions || []).filter((m) => !m.done && !m.failed).length;
  if (S.phase !== 'offseason' && active < 2 && (S.missionDay == null || S.day - S.missionDay >= 10)) { S.missionDay = S.day; newMission(); }
}

// ---------- nhà tài trợ có điều kiện ----------
const BRANDS = ['NovaTech', 'Hyperion Energy', 'Lumen Bank', 'Kestrel Gear', 'Orbit Mobile', 'Vanta Foods', 'Aster Motors', 'Pulse Drinks', 'Zenith Cloud', 'Polar Air'];
export type DealCond = 'worlds' | 'title' | 'fans' | 'stream';
export interface Deal { id: string; brand: string; base: number; bonus: number; cond: DealCond; target: number; season: number }
export function sponsorOffers(): Deal[] {
  if (S.dealOffers && S.dealOffers[0]?.season === S.season) return S.dealOffers;
  const ut = userTeam();
  const scale = Math.max(300, ut.sponsor * 0.25);
  const fans = S.brand?.fans ?? 500;
  const conds: DealCond[] = ['worlds', 'title', 'fans', 'stream'];
  const brands = [...BRANDS].sort(() => rand() - 0.5);
  S.dealOffers = conds.sort(() => rand() - 0.5).slice(0, 3).map((cond, i) => ({
    id: 'd' + i, brand: brands[i], season: S.season, cond,
    base: Math.round(scale * (cond === 'stream' ? 0.9 : cond === 'fans' ? 0.75 : 0.6)),
    bonus: Math.round(scale * (cond === 'worlds' ? 1.2 : cond === 'title' ? 0.9 : cond === 'fans' ? 0.6 : 0.2)),
    target: cond === 'fans' ? Math.round(fans * 1.15) : 0,
  }));
  return S.dealOffers;
}
export function signDeal(id: string): boolean {
  const d = sponsorOffers().find((x) => x.id === id);
  if (!d || (S.deal && S.deal.season === S.season)) return false;
  S.deal = { ...d };
  addNews('news.deal', { brand: d.brand });
  return true;
}
export function dealDay(): void {
  const d = S.deal;
  if (!d || d.season !== S.season) return;
  const per = d.base / 50;
  userTeam().budget += per; ledgerAdd('sponsor', per);
  // điều khoản stream: tuyển thủ mất chút thể lực mỗi ngày
  if (d.cond === 'stream') for (const p of teamPlayers(userTeam())) p.cond = clamp((p.cond ?? 100) - 0.6, 20, 100);
}
/** cuối mùa: xét thưởng */
export function dealSeasonEnd(): void {
  const d = S.deal;
  if (!d || d.season !== S.season) return;
  const ut = userTeam();
  const y = String(S.season);
  const titles = ut.trophies.filter((x) => x.endsWith(y));
  const ok = d.cond === 'worlds' ? Object.values(S.comps).some((c) => c.id.startsWith(`${S.season}-`) && /worlds/i.test(c.id) && c.teams.includes(ut.id))
    : d.cond === 'title' ? titles.length > 0 : d.cond === 'fans' ? (S.brand?.fans ?? 0) >= d.target : true;
  if (ok) { ut.budget += d.bonus; ledgerAdd('sponsor', d.bonus); addNews('news.dealBonus', { brand: d.brand, money: d.bonus }, true); }
  else addNews('news.dealMiss', { brand: d.brand });
  S.deal = null;
}

// ---------- kỳ chuyển nhượng & tranh mua ----------
const WINDOW_DAYS = 14;
export function windowOpen(): boolean {
  if (!S.phase || S.phase === 'offseason') return true;
  const ps = S.phaseStart || {};
  for (const ph of ['spring', 'summer'] as Phase[]) if (S.phase === ph && ps[ph] != null && S.day - ps[ph]! <= WINDOW_DAYS) return true;
  return false;
}
/** đội AI tranh mua: trả về giá đối thủ đưa ra nếu có */
export function rivalBid(p: Player, fee: number): { team: string; amount: number } | null {
  S.rivalBids ??= {};
  const cur = S.rivalBids[p.id];
  if (cur && S.day - cur.day <= 6) return fee >= cur.amount * 1.05 ? null : { team: cur.team, amount: cur.amount };
  if (p.ovr < 84 || rand() > 0.35) return null;
  const rivals = Object.values(S.teams).filter((t) => t.id !== S.userTeam && t.id !== p.teamId && t.budget > fee * 1.1 && teamOvr(t) >= p.ovr - 12);
  if (!rivals.length) return null;
  const r = pick(rivals);
  const amount = Math.round(fee * (1.08 + rand() * 0.15));
  S.rivalBids[p.id] = { team: r.id, amount, day: S.day };
  addNews('news.rivalBid', { team: r.name, player: p.ign }, true);
  return { team: r.id, amount };
}
export function transferDay(): void {
  // tranh mua quá hạn: đội đối thủ hoàn tất thương vụ
  for (const [pid, b] of Object.entries(S.rivalBids || {})) {
    if (S.day - b.day <= 6) continue;
    const p = S.players[pid];
    delete S.rivalBids![pid];
    if (!p || p.teamId === S.userTeam || !windowOpen() || S.teams[b.team].roster.length >= 10) continue;
    const seller = p.teamId ? S.teams[p.teamId] : null;
    if (seller) { seller.budget += b.amount; }
    S.teams[b.team].budget -= b.amount;
    paySellOn(p, b.amount);
    signPlayer(S.teams[b.team], p, S.season + 2);
    if (seller) autoLineup(seller);
    autoLineup(S.teams[b.team]);
    addNews('news.transfer', { player: p.ign, from: seller ? seller.name : '—', to: S.teams[b.team].name, fee: b.amount }, true);
  }
  // tin đồn chuyển nhượng trong kỳ mở cửa
  if (windowOpen() && rand() < 0.18) {
    const stars = Object.values(S.players).filter((p) => p.teamId && p.teamId !== S.userTeam && p.ovr >= 86);
    const p = stars.length ? pick(stars) : null;
    const t = p ? pick(Object.values(S.teams).filter((x) => x.id !== p.teamId && x.id !== S.userTeam)) : null;
    if (p && t) addNews('news.rumor', { player: p.ign, team: t.name });
  }
}
export const injuredIn = (teamId: string) => teamPlayers(S.teams[teamId]).filter((p) => p.injury);
