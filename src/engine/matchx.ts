// Chiều sâu trận đấu: kế hoạch đầu trận (cấp 1 / hướng đi rừng / cắm mắt), nói chuyện với đội,
// chọn tướng đa vị trí, và AI thích nghi với thói quen của người chơi.
import { DB } from './data';
import { S, lineupPlayers } from './state';
import { clamp, pick, rand } from './util';
import { coachStyle } from './world';
import type { Draft, GameResult, Player, Role, Side } from './types';

// ---------- kế hoạch đầu trận ----------
export type Lvl1 = 'invade' | 'standard' | 'defend';
export type Path = 'top' | 'bot';
export type Ward = 'river' | 'deep' | 'lane';
export interface EarlyPlan { lvl1: Lvl1; path: Path; ward: Ward }
export const LVL1: Lvl1[] = ['invade', 'standard', 'defend'];
export const PATHS: Path[] = ['top', 'bot'];
export const WARDS: Ward[] = ['river', 'deep', 'lane'];
export const defaultEarly = (): EarlyPlan => ({ lvl1: 'standard', path: 'top', ward: 'river' });
// xâm lăng thắng mặc định, mặc định thắng phòng thủ, phòng thủ phản công xâm lăng
const BEATS: Record<Lvl1, Lvl1> = { invade: 'standard', standard: 'defend', defend: 'invade' };

/** kế hoạch của đội AI: theo cá tính HLV; gặp người chơi thì đôi khi bắt bài thói quen */
export function aiEarly(teamId: string, oppId: string): EarlyPlan {
  const st = coachStyle(teamId);
  let lvl1: Lvl1 = st === 'aggressive' ? (rand() < 0.65 ? 'invade' : 'standard') : st === 'safe' ? (rand() < 0.6 ? 'defend' : 'standard') : pick(LVL1);
  if (oppId === S.userTeam && S.habits) {
    const top = Object.entries(S.habits.lvl1 || {}).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2.5 && rand() < 0.55) lvl1 = (Object.keys(BEATS) as Lvl1[]).find((k) => BEATS[k] === top[0])!;
  }
  return { lvl1, path: pick(PATHS), ward: st === 'safe' ? 'deep' : pick(WARDS) };
}

export interface EarlyRes { B: number; R: number; lvl1: Side | null; path: Partial<Record<Side, Path>>; read: Partial<Record<Side, boolean>> }
/** so kế hoạch hai bên → điểm phong độ đầu trận cộng vào hệ số "trong ngày" của mỗi đội */
export function earlyEdge(b: EarlyPlan, r: EarlyPlan): EarlyRes {
  const out: EarlyRes = { B: 0, R: 0, lvl1: null, path: { B: b.path, R: r.path }, read: {} };
  if (BEATS[b.lvl1] === r.lvl1) { out.B += 0.9; out.R -= 0.4; out.lvl1 = 'B'; }
  else if (BEATS[r.lvl1] === b.lvl1) { out.R += 0.9; out.B -= 0.4; out.lvl1 = 'R'; }
  // cắm mắt sâu đọc được hướng đi rừng đối phương → né gank, dễ phản công
  if (b.ward === 'deep') { out.B += 0.35; out.read.B = true; }
  if (r.ward === 'deep') { out.R += 0.35; out.read.R = true; }
  // mắt đường: an toàn khi đi đường, nhưng hụt kiểm soát sông
  if (b.ward === 'lane') out.B += 0.2;
  if (r.ward === 'lane') out.R += 0.2;
  if (b.ward === 'river' && r.ward !== 'river') out.B += 0.15;
  if (r.ward === 'river' && b.ward !== 'river') out.R += 0.15;
  // đi rừng ngược hướng: mỗi bên có lợi ở phía mình; đối phương đọc được thì mất lợi thế
  if (b.path !== r.path) { if (!out.read.R) out.B += 0.3; if (!out.read.B) out.R += 0.3; }
  return out;
}

// ---------- chọn tướng đa vị trí ----------
/** tướng đa vị trí: chơi được ≥ 2 vị trí và ít nhất 2 người trong đội dùng được → đối thủ khó đoán */
export function isFlex(champ: string, teamId: string): boolean {
  const c = DB.champions[champ];
  if (!c || c.roles.length < 2) return false;
  const line = lineupPlayers(S.teams[teamId]);
  const can = line.filter(({ role, p }) => p && c.roles.includes(role) && (p.pool.some((x) => x.c === champ) || role === p.role));
  return can.length >= 2;
}
/** thưởng cho các tướng đa vị trí được chọn sớm (3 lượt chọn đầu): đối phương khó chọn khắc chế */
export function flexBonus(d: Draft, side: Side): { bonus: number; champs: string[] } {
  const tid = side === 'B' ? d.blue : d.red;
  const early = d.log.filter((x) => x.side === side && x.type === 'pick').slice(0, 3).map((x) => x.champ);
  const champs = early.filter((c) => isFlex(c, tid));
  return { bonus: Math.min(0.03, champs.length * 0.011), champs };
}

// ---------- nói chuyện với đội ----------
export type Tone = 'calm' | 'fire' | 'demand' | 'praise';
export const TONES: Tone[] = ['calm', 'fire', 'demand', 'praise'];
export type Temper = 'steady' | 'fiery' | 'fragile' | 'proud';
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const temperOf = (p: Player): Temper => (['steady', 'fiery', 'fragile', 'proud'] as Temper[])[hash(p.id + 'tmp') % 4];
const REACT: Record<Tone, Record<Temper, number>> = {
  calm: { steady: 0.3, fiery: -0.3, fragile: 0.9, proud: 0.1 },
  fire: { steady: 0.3, fiery: 1, fragile: -0.5, proud: 0.4 },
  demand: { steady: 0.4, fiery: 0.5, fragile: -1, proud: -0.7 },
  praise: { steady: 0.1, fiery: 0, fragile: 0.6, proud: 0.9 },
};
export interface TalkReact { pid: string; ign: string; d: number }
/** ctx: 'pre' trước loạt, 'lead' đang dẫn, 'trail' đang bị dẫn, 'even' hòa */
export function teamTalk(teamId: string, tone: Tone, ctx: 'pre' | 'lead' | 'trail' | 'even'): TalkReact[] {
  const out: TalkReact[] = [];
  for (const { p } of lineupPlayers(S.teams[teamId])) {
    if (!p) continue;
    let d = REACT[tone][temperOf(p)];
    if (ctx === 'trail' && (tone === 'demand' || tone === 'fire')) d += 0.35;
    if (ctx === 'trail' && tone === 'praise') d -= 0.3;
    if (ctx === 'lead' && tone === 'praise' && temperOf(p) !== 'proud') d -= 0.35; // tự mãn
    if (ctx === 'lead' && tone === 'calm') d += 0.25;
    // tâm lý vững (mental) giảm biên độ
    d *= clamp(1.25 - ((p.stats.composure ?? 60) - 50) / 120, 0.6, 1.3);
    d = +d.toFixed(2);
    p.form = clamp((p.form || 0) + d * 0.7, -5, 5);
    p.morale = clamp((p.morale ?? 70) + d * 3, 20, 100);
    out.push({ pid: p.id, ign: p.ign, d });
  }
  return out;
}

// ---------- thói quen người chơi (AI thích nghi) ----------
/** sau mỗi ván của người chơi: ghi lại tướng hay chọn, kiểu cấp 1, nhịp độ (phai dần) */
export function trackHabits(g: GameResult): void {
  const sd: Side | null = g.blue === S.userTeam ? 'B' : g.red === S.userTeam ? 'R' : null;
  if (!sd) return;
  const h = (S.habits ??= { picks: {}, lvl1: {}, tempo: {} });
  for (const m of [h.picks, h.lvl1, h.tempo]) for (const k of Object.keys(m)) { m[k] = +(m[k] * 0.9).toFixed(2); if (m[k] < 0.2) delete m[k]; }
  for (const c of Object.values(g.picks[sd])) if (c) h.picks[c] = (h.picks[c] || 0) + 1;
  const e = S.tactics?.early?.lvl1;
  if (e) h.lvl1[e] = (h.lvl1[e] || 0) + 1;
  const tp = S.tactics?.tempo;
  if (tp) h.tempo[tp] = (h.tempo[tp] || 0) + 1;
}
/** điểm cấm thêm cho tướng người chơi hay dùng (AI đã "nghiên cứu băng hình") */
export const habitBan = (champ: string, oppId: string): number => (oppId === S.userTeam && S.habits ? Math.min(3, S.habits.picks[champ] || 0) * 9 : 0);
/** tướng người chơi hay dùng nhất (để hiển thị cảnh báo) */
export const topHabits = (n = 3): string[] => Object.entries(S.habits?.picks || {}).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 2).slice(0, n).map(([k]) => k);
/** AI chỉnh nhịp độ để bắt bài: người chơi hay đánh sớm → AI chơi chắc chờ cuối trận và ngược lại */
export function counterTempo(oppId: string): 'early' | 'late' | null {
  if (oppId !== S.userTeam || !S.habits) return null;
  const top = Object.entries(S.habits.tempo).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 3 || rand() > 0.6) return null;
  return top[0] === 'early' ? 'late' : top[0] === 'late' ? 'early' : null;
}
export type { Role };
