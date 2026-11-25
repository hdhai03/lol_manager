// Thế giới sống: mạng xã hội & độ nổi tiếng tuyển thủ, đối thủ truyền kiếp, cá tính HLV các đội AI.
import { S, addNews, userTeam } from './state';
import { clamp, gauss, pick, rand } from './util';
import type { Match, Player, Tactics, Role } from './types';

// ---------- đối thủ truyền kiếp ----------
const RIVALS: [string, string][] = [
  ['T1', 'Gen.G'], ['T1', 'Hanwha Life Esports'], ['Gen.G', 'Hanwha Life Esports'], ['T1', 'Dplus Kia'], ['KT Rolster', 'T1'],
  ['Bilibili Gaming', 'JD Gaming'], ['Bilibili Gaming', 'Top Esports'], ['JD Gaming', 'Top Esports'], ['EDward Gaming', 'Invictus Gaming'], ['Anyone\'s Legend', 'Bilibili Gaming'],
  ['G2 Esports', 'Fnatic'], ['G2 Esports', 'Karmine Corp'], ['Fnatic', 'Team Vitality'], ['Movistar KOI', 'G2 Esports'],
  ['Team Liquid', 'Cloud9'], ['FlyQuest', 'Team Liquid'], ['Cloud9', 'FlyQuest'],
  ['CTBC Flying Oyster', 'Team Secret Whales'], ['GAM Esports', 'Team Secret Whales'], ['GAM Esports', 'MVK Esports'],
  ['LOUD', 'paiN Gaming'], ['FURIA', 'paiN Gaming'], ['Saigon Dino', 'Saigon Warriors'],
];
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const RIVAL_SET = new Set(RIVALS.map(([a, b]) => key(a, b)));
/** cặp kình địch: có sẵn, hoặc hình thành sau nhiều lần đụng độ căng thẳng */
export function isRival(a: string, b: string): boolean {
  if (RIVAL_SET.has(key(a, b))) return true;
  return (S.rivalry?.[key(a, b)] ?? 0) >= 4;
}
export function h2h(a: string, b: string): { w: number; l: number } {
  const ms = Object.values(S.comps).flatMap((c) => c.matches).filter((m) => m.done && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));
  const w = ms.filter((m) => m.winner === a).length;
  return { w, l: ms.length - w };
}
/** phong độ trong ngày của trận derby: cảm xúc dâng cao → biên độ lớn hơn */
export const derbySwing = (a: string, b: string): number => (isRival(a, b) ? gauss() * 1.4 : 0);

// ---------- cá tính HLV ----------
export type CoachStyle = 'aggressive' | 'safe' | 'teamfight' | 'macro' | 'flex';
export const COACH_STYLES: CoachStyle[] = ['aggressive', 'safe', 'teamfight', 'macro', 'flex'];
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export function coachStyle(teamId: string): CoachStyle {
  const st = S.coachStyle?.[teamId];
  if (st) return st as CoachStyle;
  return COACH_STYLES[hash(teamId + (S.teams[teamId]?.coach || '')) % COACH_STYLES.length];
}
/** áp cá tính HLV lên chiến thuật AI */
export function styleTactics(teamId: string, base: Tactics): Tactics {
  const s = coachStyle(teamId);
  const t: Tactics = { ...base, personal: { ...base.personal } };
  if (s === 'aggressive') { t.tempo = 'early'; for (const r of ['Top', 'Jungle', 'Mid'] as Role[]) t.personal[r] = 'aggressive'; }
  if (s === 'safe') { t.tempo = 'late'; for (const r of ['Top', 'Bot'] as Role[]) t.personal[r] = 'safe'; }
  if (s === 'teamfight') { t.style = 'teamfight'; t.obj = 'dragon'; }
  if (s === 'macro') { t.obj = 'top'; if (base.style !== 'pick') t.style = 'split'; }
  return t;
}
const COACH_NAMES = ['Kim "Rookie" Min', 'Park Jun-ho', 'Lee Seo-jin', 'Wang Hao', 'Chen Yu', 'Liu Fan', 'Marc Duval', 'Jonas Berg', 'Alex Reyes', 'Diego Lima', 'Ken Sato', 'Trần Minh', 'Nguyễn Huy', 'Yoon Ha-neul', 'Zhou Lan'];
/** cuối mùa: HLV đội AI thành tích kém có thể bị thay */
export function coachCarousel(): void {
  for (const lg of new Set(Object.values(S.teams).map((t) => t.league))) {
    const teams = Object.values(S.teams).filter((t) => t.league === lg && t.id !== S.userTeam);
    const wins = (id: string) => Object.values(S.comps).filter((c) => c.id.startsWith(`${S.season}-`)).flatMap((c) => c.matches).filter((m) => m.done && m.winner === id).length;
    const worst = teams.sort((a, b) => wins(a.id) - wins(b.id)).slice(0, 2);
    for (const t of worst) {
      if (rand() > 0.5) continue;
      const old = t.coach;
      t.coach = pick(COACH_NAMES);
      (S.coachStyle ??= {})[t.id] = pick(COACH_STYLES.filter((x) => x !== coachStyle(t.id)));
      addNews('news.coachSacked', { team: t.name, old: old || '?', coach: t.coach });
    }
  }
}

// ---------- mạng xã hội & độ nổi tiếng ----------
export interface Post { id: string; day: number; handle: string; key: string; params: Record<string, string | number>; likes: number; mood: 'pos' | 'neg' | 'meh'; pid?: string; team?: string }
const HANDLES = ['@riftwatcher', '@baron_steal', '@coachdiff', '@lck_daily', '@gankmeplz', '@soloqhero', '@worlds_or_bust', '@thinkfast', '@cs_per_min', '@dragonsoul', '@vn_lol_fan', '@saigon_nights', '@tf_ult', '@xayah_main'];
function post(p: Omit<Post, 'id' | 'day' | 'handle' | 'likes'> & { hot?: number }): void {
  S.social ??= [];
  S.seqP = (S.seqP || 0) + 1;
  const fans = S.brand?.fans ?? 800;
  S.social.unshift({ id: 'p' + S.seqP, day: S.day, handle: pick(HANDLES), likes: Math.round((fans * (0.4 + rand()) * (p.hot ?? 1))), key: p.key, params: p.params, mood: p.mood, pid: p.pid, team: p.team });
  if (S.social.length > 40) S.social.length = 40;
}
/** độ nổi tiếng: MVP / chơi hay tăng, chơi tệ giảm; ảnh hưởng giá trị chuyển nhượng */
export function hypeAfterGame(p: Player, rating: number, mvp: boolean): void {
  p.hype = clamp((p.hype ?? 50) + (mvp ? 3 : 0) + (rating >= 8 ? 1.5 : rating <= 4 ? -2 : 0), 0, 100);
}
export const hypeValueMul = (p: Player): number => 1 + ((p.hype ?? 50) - 50) / 400;
/** sau mỗi loạt đấu có đội người chơi: người hâm mộ lên tiếng */
export function socialOnSeries(m: Match): void {
  const ut = S.userTeam;
  if (!m.done || (m.a !== ut && m.b !== ut)) return;
  const opp = m.a === ut ? m.b : m.a;
  const won = m.winner === ut;
  const derby = isRival(ut, opp);
  const me = userTeam(), op = S.teams[opp];
  const score = `${Math.max(m.winsA, m.winsB)}-${Math.min(m.winsA, m.winsB)}`;
  const ps = Object.values(me.lineup).map((id) => (id ? S.players[id] : null)).filter(Boolean) as Player[];
  const star = [...ps].sort((a, b) => (b.fh?.at(-1) ?? 5) - (a.fh?.at(-1) ?? 5))[0];
  const flop = [...ps].sort((a, b) => (a.fh?.at(-1) ?? 5) - (b.fh?.at(-1) ?? 5))[0];
  if (won) {
    post({ key: derby ? 'so.derbyWin' : 'so.win', params: { team: me.short, opp: op.short, score }, mood: 'pos', team: ut, hot: derby ? 2 : 1 });
    if (star) post({ key: pick(['so.star', 'so.star2']), params: { player: star.ign }, mood: 'pos', pid: star.id });
  } else {
    post({ key: derby ? 'so.derbyLoss' : 'so.loss', params: { team: me.short, opp: op.short, score }, mood: 'neg', team: ut, hot: derby ? 1.6 : 1 });
    if (flop && rand() < 0.7) post({ key: pick(['so.flop', 'so.flop2']), params: { player: flop.ign }, mood: 'neg', pid: flop.id });
  }
  if (rand() < 0.3) post({ key: 'so.meme', params: { team: me.short, opp: op.short }, mood: 'meh', team: opp });
  // derby: cảm xúc mạnh hơn
  if (derby) {
    for (const p of ps) p.morale = clamp((p.morale ?? 70) + (won ? 4 : -4), 20, 100);
    if (S.brand) S.brand.hype = clamp(S.brand.hype + (won ? 6 : -4), 0, 100);
    if (S.career) S.career.conf = clamp(S.career.conf + (won ? 3 : -3), 0, 100);
    addNews(won ? 'news.derbyWin' : 'news.derbyLoss', { team: me.name, opp: op.name }, true);
  }
  // đụng độ nhiều lần ở vòng loại trực tiếp → kình địch mới
  if (m.bo >= 3) { S.rivalry ??= {}; const k = key(ut, opp); S.rivalry[k] = (S.rivalry[k] || 0) + (m.bo === 5 ? 1.5 : 0.5); if (S.rivalry[k] >= 4 && S.rivalry[k] - (m.bo === 5 ? 1.5 : 0.5) < 4 && !RIVAL_SET.has(k)) addNews('news.newRival', { opp: op.name }, true); }
}
/** mỗi ngày: độ nổi tiếng phai dần, thỉnh thoảng có bài đăng về tin đồn / bản cập nhật */
export function socialDay(): void {
  for (const p of Object.values(S.players)) if (p.hype != null) p.hype = +(p.hype + (50 - p.hype) * 0.01).toFixed(2);
  if (rand() < 0.15) {
    const stars = Object.values(S.players).filter((p) => p.teamId && (p.hype ?? 50) >= 62);
    const p = stars.length ? pick(stars) : null;
    if (p) post({ key: 'so.hype', params: { player: p.ign, team: S.teams[p.teamId!].short }, mood: 'pos', pid: p.id });
  }
  if (S.patch && S.patch.day === S.day && S.patch.notes.length) post({ key: 'so.patch', params: { v: S.patch.v }, mood: 'meh', hot: 1.4 });
}
