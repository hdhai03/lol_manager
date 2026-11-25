// Ban huấn luyện, lộ trình phát triển cá nhân, học viện ↔ hạng 2, cho mượn tuyển thủ.
import { S, addNews, addFinance, userTeam, teamPlayers, autoLineup } from './state';
import { clamp, gauss, pick, rand, computeOvr } from './util';
import { traitsOf } from './attrs';
import { tierList } from './runes';
import { signPlayer, removeFromTeam } from './season';
import { ledgerAdd } from './career';
import type { Attr, Player } from './types';

// ---------- ban huấn luyện ----------
export type StaffKind = 'assistant' | 'analyst' | 'psych' | 'fitness';
export const STAFF: StaffKind[] = ['assistant', 'analyst', 'psych', 'fitness'];
export const STAFF_COST = [0, 5, 11, 20]; // nghìn $ / lượt (≈ 50 lượt/mùa)
export const STAFF_HIRE = [0, 40, 90, 160]; // phí ký hợp đồng
export const staffLv = (k: StaffKind): number => S.staff?.[k] ?? 0;
export function setStaff(k: StaffKind, lv: number): boolean {
  S.staff ??= { assistant: 0, analyst: 0, psych: 0, fitness: 0 };
  const cur = S.staff[k];
  lv = clamp(Math.round(lv), 0, 3);
  if (lv > cur) {
    const fee = STAFF_HIRE[lv];
    if (userTeam().budget < fee) return false;
    addFinance('fin.staffHire', -fee, { role: { $t: 'stf.' + k } });
  }
  S.staff[k] = lv;
  return true;
}
/** mỗi ngày: chi phí + hiệu ứng tâm lý / thể lực */
export function staffDay(): void {
  const ut = userTeam();
  const cost = STAFF.reduce((s, k) => s + STAFF_COST[staffLv(k)], 0);
  if (cost) { ut.budget -= cost; ledgerAdd('staff', -cost); }
  const ps = staffLv('psych'), ft = staffLv('fitness');
  for (const p of teamPlayers(ut)) {
    if (ps) p.morale = clamp((p.morale ?? 70) + (72 + ps * 3 - (p.morale ?? 70)) * 0.04 * ps, 20, 100);
    if (ft) p.cond = clamp((p.cond ?? 100) + ft * 1.6, 20, 100);
  }
}
/** hệ số tốc độ tập luyện (trợ lý HLV) */
export const trainMul = (): number => 1 + staffLv('assistant') * 0.2;
/** phong độ trong trận nhờ nhà phân tích (chuẩn bị cấm/chọn & đối thủ) */
export const analystDay = (): number => staffLv('analyst') * 0.25;

// ---------- lộ trình phát triển cá nhân ----------
export type DevFocus = 'laning' | 'mechanics' | 'macro' | 'mental' | 'leader' | 'pool';
export const DEV_FOCUS: DevFocus[] = ['laning', 'mechanics', 'macro', 'mental', 'leader', 'pool'];
const DEV_ATTRS: Record<Exclude<DevFocus, 'pool'>, Attr[]> = {
  laning: ['farm', 'accuracy'], mechanics: ['dodge', 'positioning'], macro: ['awareness', 'judgment'], mental: ['focus', 'composure'], leader: ['leadership', 'teamwork'],
};
export const devOf = (pid: string) => S.dev?.[pid];
export function setDev(pid: string, focus: DevFocus | null): void {
  S.dev ??= {};
  if (!focus) { delete S.dev[pid]; return; }
  const cur = S.dev[pid];
  S.dev[pid] = { focus, prog: cur && cur.focus === focus ? cur.prog : 0 };
}
const ageF = (age: number) => (age <= 21 ? 1.4 : age <= 24 ? 1.1 : age <= 27 ? 0.75 : 0.45);
export function devRate(p: Player): number {
  return +(((2.2 + staffLv('assistant') * 0.7) * ageF(p.age) * (p.potential > p.ovr ? 1 : 0.55))).toFixed(2);
}
export function devDay(): void {
  for (const [pid, d] of Object.entries(S.dev || {})) {
    const p = S.players[pid];
    if (!p || p.retired || (p.teamId !== S.userTeam && p.academyOf !== S.userTeam)) { delete S.dev![pid]; continue; }
    d.prog += devRate(p);
    if (d.prog < 100) continue;
    d.prog -= 100;
    const before = new Set(traitsOf(p));
    if (d.focus === 'pool') {
      const meta = tierList(p.role).slice(0, 12).filter((x) => !p.pool.some((c) => c.c === x.id));
      const c = meta.length ? pick(meta).id : null;
      if (c) { p.pool.push({ c, g: 4, w: 2 }); p.pool.sort((a, b) => b.g - a.g); if (p.pool.length > 12) p.pool.length = 12; }
      addNews('news.devPool', { player: p.ign, champ: c || '-' });
    } else {
      for (const a of DEV_ATTRS[d.focus]) p.stats[a] = clamp(p.stats[a] + (rand() < 0.5 ? 2 : 1), 30, 99);
      p.ovr = computeOvr(p);
      p.potential = Math.max(p.potential, p.ovr);
      addNews('news.devDone', { player: p.ign, focus: { $t: 'dev.' + d.focus } });
    }
    const gained = traitsOf(p).filter((x) => !before.has(x));
    if (gained.length) addNews('news.traitGain', { player: p.ign, trait: { $t: 'trait.' + gained[0] } }, true);
  }
}

// ---------- học viện ↔ hạng 2 ----------
/** sau mỗi loạt Bo3 hạng 2 của đội học viện: ghi số liệu cho tuyển thủ học viện */
export function academyT2Game(win: boolean, games: number): void {
  const acad = Object.values(S.players).filter((p) => p.academyOf === S.userTeam && !p.retired).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
  for (const p of acad) {
    p.t2 ??= { g: 0, w: 0, r: 0 };
    p.t2.g += games; if (win) p.t2.w += 1;
    p.t2.r += (p.ovr + gauss() * 4 + (win ? 3 : -2)) * games;
    // thi đấu thật giúp tiến bộ
    if (p.potential > p.ovr && rand() < 0.12) { const a = pick(['farm', 'accuracy', 'awareness', 'judgment', 'composure'] as Attr[]); p.stats[a] = clamp(p.stats[a] + 1, 30, 99); p.ovr = computeOvr(p); }
  }
}
/** đưa tuyển thủ đội chính xuống học viện */
export function sendDown(pid: string): boolean {
  const p = S.players[pid];
  const ut = userTeam();
  if (!p || p.teamId !== ut.id || ut.roster.length <= 5) return false;
  removeFromTeam(p);
  S.freeAgents = S.freeAgents.filter((x) => x !== p.id);
  p.academyOf = ut.id;
  autoLineup(ut);
  addNews('news.sentDown', { player: p.ign });
  return true;
}

// ---------- cho mượn ----------
/** các đội sẽ cho tuyển thủ đá chính (đá chính của họ ở vị trí đó yếu hơn) */
export function loanTargets(p: Player): string[] {
  const lg = S.teams[S.userTeam].league;
  return Object.values(S.teams)
    .filter((t) => t.id !== S.userTeam && (t.league === lg || rand() < 0.3) && t.roster.length < 10)
    .map((t) => ({ t, cur: t.lineup[p.role] ? S.players[t.lineup[p.role]!]?.ovr ?? 0 : 0 }))
    .filter((x) => x.cur < p.ovr)
    .sort((a, b) => a.cur - b.cur).slice(0, 6).map((x) => x.t.id);
}
export function loanOut(pid: string, to: string): boolean {
  const p = S.players[pid];
  const ut = userTeam();
  if (!p || (p.teamId !== ut.id && p.academyOf !== ut.id)) return false;
  if (p.teamId === ut.id) { if (ut.roster.length <= 5) return false; removeFromTeam(p); autoLineup(ut); }
  p.academyOf = null;
  S.freeAgents = S.freeAgents.filter((x) => x !== p.id);
  p.loan = { from: ut.id, until: S.season };
  signPlayer(S.teams[to], p, p.contractUntil);
  S.teams[to].lineup[p.role] = p.id;
  addNews('news.loanOut', { player: p.ign, team: S.teams[to].name }, true);
  return true;
}
/** cuối mùa: tuyển thủ cho mượn trở về */
export function returnLoans(): void {
  for (const p of Object.values(S.players)) {
    if (!p.loan || p.loan.until >= S.season + 1) continue;
    const from = S.teams[p.loan.from];
    delete p.loan;
    if (!from) continue;
    const host = p.teamId ? S.teams[p.teamId] : null;
    if (host) { removeFromTeam(p); autoLineup(host); }
    S.freeAgents = S.freeAgents.filter((x) => x !== p.id);
    if (from.roster.length < 10) signPlayer(from, p, Math.max(p.contractUntil, S.season + 1)); else p.academyOf = from.id;
    if (from.id === S.userTeam) addNews('news.loanBack', { player: p.ign }, true);
  }
}
/** mỗi ngày: tuyển thủ được cho mượn đá chính tiến bộ nhanh hơn */
export function loanDay(playing: Set<string>): void {
  for (const p of Object.values(S.players)) {
    if (!p.loan || !p.teamId || !playing.has(p.teamId)) continue;
    if (p.potential > p.ovr && rand() < 0.1) { const a = pick(['farm', 'accuracy', 'dodge', 'awareness', 'judgment'] as Attr[]); p.stats[a] = clamp(p.stats[a] + 1, 30, 99); p.ovr = computeOvr(p); }
  }
}
