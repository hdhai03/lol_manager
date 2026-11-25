// Thông thạo tướng (M1–M10), phần thưởng mùa xếp hạng, vinh danh sau trận.
import { S, addNews, userTeam } from './state';
import { clamp } from './util';
import { addChem } from './life';
import type { Match, Player, Role, SoloAccount } from './types';

// ---------- thông thạo tướng ----------
const MLV = [0, 2, 5, 10, 18, 30, 45, 65, 90, 120]; // điểm cần cho M1..M10 (đơn vị: trận thi đấu tương đương)
let accIdx: { day: number; season: number; map: Record<string, SoloAccount> } | null = null;
function accOf(pid: string): SoloAccount | undefined {
  if (!accIdx || accIdx.day !== S.day || accIdx.season !== S.season) {
    const map: Record<string, SoloAccount> = {};
    for (const srv of Object.values(S.soloq?.servers || {})) for (const a of srv.acc) if (a.pid) map[a.pid] = a;
    accIdx = { day: S.day, season: S.season, map };
  }
  return accIdx.map[pid];
}
/** điểm thông thạo = trận thi đấu/scrim (+ trận xếp hạng tính 1/4) */
export function masteryPts(p: Player | null | undefined, champ: string): number {
  if (!p) return 0;
  const pe = p.pool.find((x) => x.c === champ);
  const sq = accOf(p.id)?.ch[champ] ?? 0;
  return (pe?.g ?? 0) + sq * 0.25 + (p.mastery?.[champ] ?? 0);
}
export function masteryLv(p: Player | null | undefined, champ: string): number {
  const pts = masteryPts(p, champ);
  let lv = 0;
  for (let i = 0; i < MLV.length; i++) if (pts >= MLV[i] && (i > 0 || pts > 0)) lv = i + 1;
  return pts <= 0 ? 0 : Math.min(10, lv);
}
export const masteryNext = (lv: number): number | null => (lv >= 10 ? null : MLV[lv]);
/** cộng độ hợp tướng theo cấp thông thạo (0..~6) */
export const masteryFit = (p: Player | null | undefined, champ: string): number => Math.max(0, masteryLv(p, champ) - 2) * 0.75;
/** tướng tủ theo thông thạo */
export function topMastery(p: Player, n = 8): { c: string; lv: number; pts: number }[] {
  const ids = new Set([...p.pool.map((x) => x.c), ...Object.keys(accOf(p.id)?.ch || {}), ...Object.keys(p.mastery || {})]);
  return [...ids].map((c) => ({ c, pts: masteryPts(p, c), lv: masteryLv(p, c) })).sort((a, b) => b.pts - a.pts).slice(0, n);
}
/** mùa mới: điểm thông thạo được lưu lại (bể tướng bị cắt bớt không làm mất thông thạo) */
export function bankMastery(): void {
  for (const p of Object.values(S.players)) {
    if (p.retired) continue;
    for (const x of p.pool) { p.mastery ??= {}; p.mastery[x.c] = +((p.mastery[x.c] || 0) + x.g * 0.15).toFixed(2); }
  }
}

// ---------- phần thưởng mùa xếp hạng ----------
export function rankRewards(ladder: (sv: string) => SoloAccount[], servers: string[]): void {
  for (const sv of servers) {
    ladder(sv).slice(0, 10).forEach((a, i) => {
      const p = a.pid ? S.players[a.pid] : null;
      if (!p) return;
      p.morale = clamp((p.morale ?? 70) + (10 - i) * 0.6, 20, 100);
      p.hype = clamp((p.hype ?? 50) + (10 - i) * 0.5, 0, 100);
      (p.rankHist ??= []).unshift({ season: S.season, server: sv, rank: i + 1, lp: a.lp });
      if (p.rankHist.length > 6) p.rankHist.length = 6;
      if (p.teamId === S.userTeam) addNews('news.rankReward', { player: p.ign, rank: i + 1, server: sv }, true);
    });
  }
}

// ---------- vinh danh ----------
export type HonorKind = 'cool' | 'shotcall' | 'gg';
export const HONORS: HonorKind[] = ['cool', 'shotcall', 'gg'];
export interface HonorGiven { kind: HonorKind; to: string; from: string }
export const honorLv = (p: Player): number => Math.min(5, Math.floor((p.honor ?? 0) / 8));
/** sau loạt đấu của đội người chơi: mỗi loại vinh danh trao cho người xứng đáng nhất */
export function honorSeries(m: Match): HonorGiven[] {
  const ut = userTeam();
  if (!m.done || (m.a !== ut.id && m.b !== ut.id)) return [];
  const ps = (['Top', 'Jungle', 'Mid', 'Bot', 'Support'] as Role[]).map((r) => (ut.lineup[r] ? S.players[ut.lineup[r]!] : null)).filter(Boolean) as Player[];
  if (ps.length < 2) return [];
  const won = m.winner === ut.id;
  const last = (p: Player) => p.fh?.at(-1) ?? 5;
  const pickBy = (f: (p: Player) => number, not?: string) => ps.filter((p) => p.id !== not).sort((a, b) => f(b) - f(a))[0];
  const cool = pickBy((p) => p.stats.composure + (won ? 0 : 6) + last(p) * 2);
  const shot = pickBy((p) => p.stats.leadership + last(p) * 1.5, cool.id);
  const gg = pickBy((p) => p.stats.teamwork + (p.role === 'Support' ? 6 : 0) + last(p) * 1.5, shot.id);
  const out: HonorGiven[] = [];
  for (const [kind, to] of [['cool', cool], ['shotcall', shot], ['gg', gg]] as [HonorKind, Player][]) {
    const from = ps.filter((p) => p.id !== to.id).sort((a, b) => b.stats.teamwork - a.stats.teamwork)[0];
    const before = honorLv(to);
    to.honor = (to.honor ?? 0) + 1;
    to.morale = clamp((to.morale ?? 70) + 2, 20, 100);
    addChem(to.id, from.id, 0.6);
    if (honorLv(to) > before) addNews('news.honorUp', { player: to.ign, lv: honorLv(to) }, true);
    out.push({ kind, to: to.id, from: from.id });
  }
  S.lastHonor = { match: m.id, list: out };
  return out;
}

/** bậc xếp hạng hiện tại của tuyển thủ (theo LP tài khoản) */
export function playerTier(pid: string): { tier: string; lp: number } | null {
  const a = accOf(pid);
  if (!a) return null;
  const tier = a.lp >= 1100 ? 'challenger' : a.lp >= 800 ? 'grandmaster' : a.lp >= 500 ? 'master' : 'diamond';
  return { tier, lp: a.lp };
}
