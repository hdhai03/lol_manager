// Trinh sát đối thủ: tướng tủ, lối chơi, người nguy hiểm, gợi ý cấm & chiến thuật khắc chế.
// Họp báo trước/sau trận: chọn giọng điệu → tinh thần, độ nóng, niềm tin.
import { DB } from './data';
import { S, lineupPlayers, userTeam, teamOvr } from './state';
import { clamp, rand } from './util';
import { opggPos } from './runes';
import { traitsOf } from './attrs';
import type { Player, Role, Tactics } from './types';

export type OppStyle = 'early' | 'teamfight' | 'pick' | 'split' | 'scaling';
export interface ScoutPlayer { role: Role; p: Player; danger: number; champs: { c: string; g: number; wr: number; tier: number }[] }
export interface ScoutReport { team: string; style: OppStyle; styleWhy: string; players: ScoutPlayer[]; bans: string[]; tactics: Partial<Tactics>; recent: { w: number; l: number }; depth: number }

/** độ sâu trinh sát theo nhà phân tích (0..3) */
const depth = (): number => 3 + (S.staff?.analyst ?? 0);
export function scoutReport(teamId: string): ScoutReport {
  const tm = S.teams[teamId];
  const lp = lineupPlayers(tm).filter((x) => x.p) as { role: Role; p: Player }[];
  const avg = (f: (p: Player) => number) => lp.reduce((s, x) => s + f(x.p), 0) / Math.max(1, lp.length);
  const ag = avg((p) => p.stats.aggression), tw = avg((p) => p.stats.teamwork), cr = avg((p) => (p.stats.creativity + p.stats.awareness) / 2), pa = avg((p) => p.stats.patience);
  const top = lp.find((x) => x.role === 'Top')?.p;
  let style: OppStyle = 'teamfight';
  let why = 'teamwork';
  const scores: [OppStyle, number, string][] = [
    ['early', ag - 64, 'aggression'], ['teamfight', tw - 70, 'teamwork'], ['pick', cr - 72, 'creativity'],
    ['split', top ? (top.stats.farm + top.stats.aggression) / 2 - 76 : -9, 'top'], ['scaling', pa - 70, 'patience'],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  [style, , why] = scores[0];
  const n = depth();
  const players: ScoutPlayer[] = lp.map(({ role, p }) => ({
    role, p,
    danger: Math.round(p.ovr + (p.form || 0) * 1.5 + (traitsOf(p).some((x) => ['outplayer', 'clutch', 'carry'].includes(x)) ? 2 : 0)),
    champs: p.pool.slice(0, n).map((x) => ({ c: x.c, g: Math.round(x.g), wr: x.g ? x.w / x.g : 0.5, tier: opggPos(x.c, role)?.tier ?? 4 })),
  })).sort((a, b) => b.danger - a.danger);
  // gợi ý cấm: tướng tủ của người nguy hiểm, ưu tiên tướng meta
  const cand: Record<string, number> = {};
  for (const sp of players) for (const ch of sp.champs) {
    if (!DB.champions[ch.c]) continue;
    cand[ch.c] = (cand[ch.c] || 0) + (sp.danger - 70) * 0.6 + Math.min(ch.g, 20) * 0.4 + (ch.wr - 0.5) * 10 + (6 - ch.tier) * 1.5;
  }
  const bans = Object.entries(cand).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const counter: Record<OppStyle, Partial<Tactics>> = {
    early: { tempo: 'late', style: 'teamfight', obj: 'dragon' },
    teamfight: { tempo: 'balanced', style: 'pick', obj: 'top' },
    pick: { tempo: 'balanced', style: 'teamfight', obj: 'dragon' },
    split: { tempo: 'early', style: 'teamfight', obj: 'top' },
    scaling: { tempo: 'early', style: 'teamfight', obj: 'top' },
  };
  const ms = Object.values(S.comps).flatMap((c) => c.matches).filter((m) => m.done && (m.a === teamId || m.b === teamId)).sort((a, b) => b.day - a.day).slice(0, 8);
  const w = ms.filter((m) => m.winner === teamId).length;
  return { team: teamId, style, styleWhy: why, players, bans, tactics: counter[style], recent: { w, l: ms.length - w }, depth: n };
}
/** áp dụng gợi ý: cộng thẻ nhỏ "đã nghiên cứu" cho trận này (phong độ trong ngày) */
export function applyScout(rep: ScoutReport): void {
  S.tactics = { ...S.tactics, ...rep.tactics };
  S.scouted = { team: rep.team, day: S.day, bans: rep.bans };
}
export const scoutedBans = (opp: string): string[] => (S.scouted && S.scouted.team === opp && S.day - S.scouted.day <= 3 ? S.scouted.bans : []);

// ---------- họp báo ----------
export type PressTone = 'confident' | 'humble' | 'provoke';
export type PressCtx = 'pre' | 'win' | 'loss';
export const PRESS_Q: Record<PressCtx, string[]> = { pre: ['pre1', 'pre2', 'pre3'], win: ['win1', 'win2', 'win3'], loss: ['loss1', 'loss2', 'loss3'] };
export function pressQuestion(ctx: PressCtx, seed: number): string { const q = PRESS_Q[ctx]; return q[seed % q.length]; }
/** trả lời họp báo; trả về khoá kết quả */
export function pressAnswer(ctx: PressCtx, tone: PressTone, opp: string): string {
  const ut = userTeam();
  const ps = lineupPlayers(ut).map((x) => x.p).filter(Boolean) as Player[];
  const mor = (d: number) => ps.forEach((p) => { p.morale = clamp((p.morale ?? 70) + d, 20, 100); });
  const hype = (d: number) => { if (S.brand) S.brand.hype = clamp(S.brand.hype + d, 0, 100); };
  const conf = (d: number) => { if (S.career) S.career.conf = clamp(S.career.conf + d, 0, 100); };
  const stronger = teamOvr(ut) >= teamOvr(S.teams[opp]);
  let out = `${ctx}.${tone}`;
  if (tone === 'confident') { mor(ctx === 'loss' ? 2 : 3); hype(3); if (ctx === 'loss') conf(-1); }
  if (tone === 'humble') { mor(1); conf(1); if (ctx === 'loss') mor(2); }
  if (tone === 'provoke') {
    hype(6);
    // khiêu khích đội mạnh hơn: đối thủ có động lực; đội yếu hơn: họ mất bình tĩnh
    const good = stronger ? rand() < 0.6 : rand() < 0.35;
    if (good) { mor(4); for (const p of lineupPlayers(S.teams[opp]).map((x) => x.p).filter(Boolean) as Player[]) p.morale = clamp((p.morale ?? 70) - 4, 20, 100); out += '.ok'; }
    else { mor(-3); conf(-2); out += '.bad'; }
  }
  S.pressDay = S.day;
  return out;
}
