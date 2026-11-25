// Trần lương & thuế xa xỉ (theo kiểu LCK), đồng điệu đội hình (team color), giá trị CLB.
import { S, addNews, userTeam, teamPlayers, teamSalary } from './state';
import { ROLES } from './util';
import { chemOf } from './life';
import { ledgerAdd } from './career';
import type { Player, Team } from './types';

// ---------- trần lương ----------
/** trần & sàn lương của giải (nghìn $/năm), tính theo mặt bằng lương các đội trong giải lúc đầu mùa */
export function salaryCap(league: string): { cap: number; floor: number } {
  S.caps ??= {};
  const c = S.caps[league];
  if (c && c.season === S.season) return c;
  const pays = Object.values(S.teams).filter((t) => t.league === league).map(teamSalary).sort((a, b) => a - b);
  const avg = pays.reduce((s, x) => s + x, 0) / Math.max(1, pays.length);
  const out = { cap: Math.round(avg * 1.3 / 10) * 10, floor: Math.round(avg * 0.5 / 10) * 10, season: S.season };
  S.caps[league] = out;
  return out;
}
export const LUX_RATE = 0.25;
/** ký thêm lương này có vượt trần cứng (trần + 15%) không */
export function capBlocks(extraSalary: number, replaceSalary = 0): boolean {
  const ut = userTeam();
  const { cap } = salaryCap(ut.league);
  const now = teamSalary(ut), next = now - replaceSalary + extraSalary;
  // trần cứng: không được vượt trần + 15%; đội đã vượt sẵn thì chỉ không được tăng thêm
  return next > cap * 1.15 && next > now;
}
/** mỗi lượt: thuế xa xỉ nếu vượt trần, phạt nếu dưới sàn */
export function capDay(): void {
  const ut = userTeam();
  const { cap, floor } = salaryCap(ut.league);
  const pay = teamSalary(ut);
  const per = 1 / 50;
  if (pay > cap) { const tax = (pay - cap) * LUX_RATE * per; ut.budget -= tax; ledgerAdd('other', -tax); S.luxTax = (S.luxTax || 0) + tax; }
  else if (pay < floor) { const fine = (floor - pay) * 0.3 * per; ut.budget -= fine; ledgerAdd('other', -fine); }
}
export function capSeasonEnd(): void {
  if (S.luxTax && S.luxTax > 1) addNews('news.luxTax', { money: Math.round(S.luxTax) }, true);
  S.luxTax = 0;
}

// ---------- đồng điệu đội hình (team color) ----------
export type TcKind = 'nation' | 'champs' | 'academy' | 'duo';
export interface TcItem { kind: TcKind; level: number; who: string[] }
export function teamColor(t: Team): { items: TcItem[]; bonus: number } {
  const ps = ROLES.map((r) => (t.lineup[r] ? S.players[t.lineup[r]!] : null)).filter(Boolean) as Player[];
  const items: TcItem[] = [];
  // cùng quốc tịch
  const byC: Record<string, Player[]> = {};
  for (const p of ps) (byC[p.country || '?'] ??= []).push(p);
  const big = Object.values(byC).sort((a, b) => b.length - a.length)[0] || [];
  if (big.length >= 3) items.push({ kind: 'nation', level: big.length >= 5 ? 3 : big.length === 4 ? 2 : 1, who: big.map((p) => p.ign) });
  // từng vô địch cùng nhau
  const shared = new Set<string>();
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const ti = new Set(ps[i].titles || []);
    if ((ps[j].titles || []).some((x) => ti.has(x))) { shared.add(ps[i].ign); shared.add(ps[j].ign); }
  }
  if (shared.size >= 2) items.push({ kind: 'champs', level: shared.size >= 4 ? 2 : 1, who: [...shared] });
  // cùng lò học viện
  const acad = ps.filter((p) => p.fromAcademy === t.id);
  if (acad.length >= 2) items.push({ kind: 'academy', level: acad.length >= 3 ? 2 : 1, who: acad.map((p) => p.ign) });
  // cặp chơi chung lâu năm
  const duo: string[] = [];
  for (const [a, b] of [['Jungle', 'Mid'], ['Bot', 'Support']] as const) {
    const x = t.lineup[a], y = t.lineup[b];
    if (x && y && chemOf(x, y) >= 75) duo.push(S.players[x].ign, S.players[y].ign);
  }
  if (duo.length) items.push({ kind: 'duo', level: duo.length / 2, who: duo });
  const bonus = items.reduce((s, x) => s + x.level, 0) * 0.35; // phong độ trong ngày (≈ OVR)
  return { items, bonus: Math.min(2.2, bonus) };
}

// ---------- giá trị CLB ----------
export function clubValue(t: Team): number {
  const players = teamPlayers(t).reduce((s, p) => s + p.value, 0);
  const brand = t.id === S.userTeam && S.brand ? S.brand.fans * 3 : t.sponsor * 1.5;
  const fac = t.id === S.userTeam ? Object.values(S.fac || {}).reduce((s, lv) => s + [0, 300, 1000, 2400][lv], 0) : 0;
  return Math.round(players + brand + fac + Math.max(0, t.budget) * 0.5 + t.trophies.length * 400);
}
export function valueRank(t: Team): number {
  const list = Object.values(S.teams).map((x) => ({ id: x.id, v: clubValue(x) })).sort((a, b) => b.v - a.v);
  return list.findIndex((x) => x.id === t.id) + 1;
}
/** ghi giá trị CLB theo giai đoạn để vẽ biểu đồ */
export function valueSnap(): void {
  const ut = userTeam();
  const v = clubValue(ut);
  const key = `${S.season}-${S.phase}`;
  S.valueHist ??= [];
  if (S.valueHist[0]?.key === key) S.valueHist[0].v = v;
  else S.valueHist.unshift({ key, season: S.season, phase: String(S.phase), v });
  if (S.valueHist.length > 24) S.valueHist.length = 24;
}
