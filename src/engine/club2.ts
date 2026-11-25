// Câu lạc bộ (mở rộng): hội đồng quản trị có cá tính, đầu tư dài hạn (trung tâm tuyển trạch, vay vốn, nguy cơ phá sản),
// điều khoản hợp đồng (gia hạn tùy chọn, thưởng trung thành, phần trăm bán lại), cột mốc sự nghiệp.
import { S, addNews, addFinance, userTeam, teamPlayers, lineupPlayers } from './state';
import { clamp, pick, rand, ROLES } from './util';
import { ledgerAdd } from './career';
import type { GameResult, Player } from './types';

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// ---------- hội đồng quản trị ----------
export type Board = 'winNow' | 'youth' | 'profit' | 'patient';
export const BOARDS: Board[] = ['winNow', 'youth', 'profit', 'patient'];
export function boardOf(teamId: string): Board {
  return (S.board?.[teamId] as Board) || BOARDS[hash(teamId + 'brd') % 4];
}
/** hệ số biến động độ tín nhiệm sau mỗi loạt */
export const boardConfMul = (teamId: string): number => ({ winNow: 1.4, youth: 0.9, profit: 1, patient: 0.7 })[boardOf(teamId)];
/** ngưỡng sa thải cuối mùa */
export const sackLine = (teamId: string): number => ({ winNow: 28, youth: 20, profit: 20, patient: 12 })[boardOf(teamId)];
/** mỗi ngày: hội đồng đánh giá theo ưu tiên riêng */
export function boardDay(): void {
  const c = S.career;
  if (!c || c.sacked) return;
  const ut = userTeam();
  const b = boardOf(ut.id);
  if (b === 'youth') {
    const young = lineupPlayers(ut).filter(({ p }) => p && p.age <= 21).length;
    c.conf = clamp(c.conf + (young >= 2 ? 0.05 : young === 0 ? -0.02 : 0), 0, 100);
  }
  if (b === 'profit') c.conf = clamp(c.conf + (ut.budget >= 0 ? 0.02 : -0.06), 0, 100);
  // ham thắng ngay: tín nhiệm quá thấp giữa mùa → sa thải ngay
  if (b === 'winNow' && c.conf < 6 && S.phase !== 'offseason') {
    c.sacked = true;
    c.rep = clamp(c.rep - 6, 0, 100);
    c.offers = [];
    addNews('news.sackedMid', { team: ut.name }, true);
  }
}
/** mùa mới: thỉnh thoảng CLB đổi chủ → hội đồng có ưu tiên mới */
export function boardSeason(): void {
  const ut = userTeam();
  if (rand() > 0.12) return;
  const nb = pick(BOARDS.filter((x) => x !== boardOf(ut.id)));
  (S.board ??= {})[ut.id] = nb;
  addNews('news.newOwner', { team: ut.name, board: { $t: 'brd.' + nb } }, true);
}

// ---------- đầu tư: trung tâm tuyển trạch ----------
export const HUB_COST = 450, HUB_UPKEEP = 3;
export const hasHub = (sv: string): boolean => (S.hubs || []).includes(sv);
export function buildHub(sv: string): boolean {
  const ut = userTeam();
  if (hasHub(sv) || ut.budget < HUB_COST) return false;
  ut.budget -= HUB_COST;
  ledgerAdd('staff', -HUB_COST);
  S.finance.unshift({ key: 'fin.hub', amount: -HUB_COST, params: { sv }, day: S.day, season: S.season });
  S.hubs = [...(S.hubs || []), sv];
  addNews('news.hub', { sv }, true);
  return true;
}

// ---------- vay vốn & phá sản ----------
export const LOAN_OPTS = [1000, 2500, 5000];
export const LOAN_RATE = 0.12; // lãi cho cả khoản vay, trả dần trong 120 ngày
export function takeLoan(amount: number): boolean {
  if (S.bankLoan && S.bankLoan.left > 0) return false;
  const total = Math.round(amount * (1 + LOAN_RATE));
  S.bankLoan = { left: total, per: Math.ceil(total / 120), amount };
  userTeam().budget += amount;
  addFinance('fin.loanIn', amount, {});
  return true;
}
export function clubDay(): void {
  const ut = userTeam();
  // phí duy trì trung tâm tuyển trạch
  const hubs = (S.hubs || []).length;
  if (hubs) { ut.budget -= hubs * HUB_UPKEEP; ledgerAdd('staff', -hubs * HUB_UPKEEP); }
  // trả góp
  const L = S.bankLoan;
  if (L && L.left > 0) { const pay = Math.min(L.left, L.per); L.left -= pay; ut.budget -= pay; ledgerAdd('salary', -pay); if (L.left <= 0) { S.bankLoan = undefined; addNews('news.loanPaid', {}, true); } }
  // nợ nặng: cảnh báo → ban lãnh đạo buộc bán tuyển thủ giá trị nhất
  if (ut.budget < -1500) {
    S.debtDays = (S.debtDays || 0) + 1;
    if (S.debtDays === 1) addNews('news.debtWarn', { team: ut.name }, true);
    if (S.career) S.career.conf = clamp(S.career.conf - 0.4, 0, 100);
    if (S.debtDays >= 14) {
      const star = teamPlayers(ut).sort((a, b) => b.value - a.value)[0];
      const buyer = Object.values(S.teams).filter((t) => t.id !== ut.id && t.budget > star.value * 0.6).sort((a, b) => b.budget - a.budget)[0];
      if (star && buyer && ut.roster.length > 5) {
        (S.offers ??= []).push({ id: 'fs' + S.day, pid: star.id, from: buyer.id, amount: Math.round(star.value * 0.75), day: S.day });
        S.forceSale = S.offers[S.offers.length - 1].id;
        addNews('news.forceSale', { player: star.ign, team: buyer.name }, true);
      }
      S.debtDays = 0;
    }
  } else S.debtDays = 0;
}

// ---------- điều khoản hợp đồng ----------
/** bán tuyển thủ kèm phần trăm bán lại: lần sau tuyển thủ chuyển đi, CLB cũ nhận phần trăm phí */
export function setSellOn(pid: string, pct: number): void { (S.sellOn ??= {})[pid] = { pct, from: S.userTeam }; }
export function paySellOn(p: Player, fee: number): void {
  const so = S.sellOn?.[p.id];
  if (!so || so.from !== S.userTeam || p.teamId === S.userTeam) return;
  const amt = Math.round(fee * so.pct);
  delete S.sellOn![p.id];
  if (amt <= 0) return;
  userTeam().budget += amt;
  addFinance('fin.sellOn', amt, { player: p.ign });
  addNews('news.sellOn', { player: p.ign, amount: amt }, true);
}
/** cuối mùa với tuyển thủ hết hạn: dùng quyền gia hạn 1 năm / trả thưởng trung thành */
export function contractExpiry(p: Player): boolean {
  if (p.loyal) { const b = Math.round(p.salary * 0.2); userTeam().budget -= b; addFinance('fin.loyalty', -b, { player: p.ign }); p.loyal = undefined; }
  if (p.option) { p.option = undefined; p.contractUntil = S.season + 1; addNews('news.optionUsed', { player: p.ign }, true); return true; }
  return false;
}

// ---------- cột mốc sự nghiệp ----------
const MILES: [keyof Player['career'] | 'penta', number[]][] = [['g', [100, 200, 300, 500]], ['k', [500, 1000, 1500, 2000]], ['w', [100, 200, 300]], ['mvp', [10, 25, 50, 100]], ['penta', [1]]];
/** sau mỗi ván: kiểm tra pentakill và các cột mốc của tuyển thủ (đội bạn + ngôi sao các đội) */
export function milestones(g: GameResult): void {
  // pentakill: một tuyển thủ hạ 5 mạng trong chuỗi 10 giây liên tiếp
  const pent = new Set<string>();
  const ks = g.events.filter((e) => e.type === 'kill' || e.type === 'firstblood');
  for (const sd of ['B', 'R'] as const) for (const r of ROLES) {
    const ts = ks.filter((e) => e.side === sd && e.killer === r).map((e) => e.s as number).sort((a, b) => a - b);
    let run = 1;
    for (let i = 1; i < ts.length; i++) { run = ts[i] - ts[i - 1] <= 10 ? run + 1 : 1; if (run >= 5) { const pl = g.players.find((x) => x.side === sd && x.role === r); if (pl?.pid) pent.add(pl.pid); } }
  }
  for (const x of g.players) {
    const p = x.pid ? S.players[x.pid] : null;
    if (!p) continue;
    const mine = p.teamId === S.userTeam;
    if (!mine && p.ovr < 85) continue;
    p.miles ??= [];
    if (pent.has(p.id)) p.pentas = (p.pentas || 0) + 1;
    for (const [k, steps] of MILES) {
      const v = k === 'penta' ? (p.pentas || 0) : (p.career[k] as number) || 0;
      for (const s of steps) {
        const id = `${k}${s}`;
        if (v >= s && !p.miles.includes(id)) {
          p.miles.push(id);
          addNews('news.milestone', { player: p.ign, what: { $t: `mile.${k}` }, n: s }, mine);
          if (mine) (S.mileFeed ??= []).unshift({ pid: p.id, id, day: S.day });
        }
      }
    }
  }
  if (S.mileFeed && S.mileFeed.length > 12) S.mileFeed.length = 12;
}
