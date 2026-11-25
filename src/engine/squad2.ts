// Đội hình sát thực tế: luật ngoại binh (tối đa 2 ngoại binh đá chính), rào cản ngôn ngữ / hòa nhập,
// kèm cặp tân binh (mentor) và luyện đổi vị trí.
import { S, addNews, teamPlayers, userTeam } from './state';
import { clamp, computeOvr, rand, pick, ROLES } from './util';
import { tierList } from './runes';
import type { Attr, LeagueId, Player, Role, Team } from './types';

// ---------- khu vực & ngoại binh ----------
const EU = ['France', 'Germany', 'Spain', 'Denmark', 'Greece', 'Czech Republic', 'Sweden', 'Ukraine', 'Turkey', 'Croatia', 'Slovenia', 'Poland', 'Lithuania', 'Belgium', 'Netherlands', 'Italy', 'Portugal', 'United Kingdom', 'Norway', 'Finland', 'Austria', 'Switzerland', 'Hungary', 'Romania', 'Bulgaria', 'Serbia', 'Slovakia', 'Latvia', 'Estonia', 'Ireland', 'Bosnia and Herzegovina', 'Russia', 'Belarus', 'Armenia', 'Israel'];
const LATAM = ['Brazil', 'Chile', 'Peru', 'Colombia', 'Argentina', 'Venezuela', 'Mexico', 'Uruguay', 'Paraguay', 'Bolivia', 'Ecuador', 'Costa Rica'];
const REGION: Record<string, string[]> = {
  LCK: ['South Korea'],
  LPL: ['China', 'Taiwan', 'Hong Kong', 'Macau'],
  LEC: EU,
  LCS: ['United States', 'Canada', 'Australia', 'New Zealand'],
  LCP: ['Taiwan', 'Hong Kong', 'Macau', 'Japan', 'Vietnam', 'Australia', 'New Zealand', 'Philippines', 'Thailand', 'Singapore', 'Malaysia', 'Indonesia'],
  CBLOL: LATAM,
  VCS: ['Vietnam'],
};
export const IMPORT_MAX = 2;
/** ngoại binh: không thuộc khu vực của giải, và chưa có quyền cư trú (3 mùa thi đấu liên tục ở giải) */
export function isImport(p: Player, league: LeagueId | string): boolean {
  const reg = REGION[league];
  if (!reg || reg.includes(p.country)) return false;
  return !(p.resid || []).includes(league);
}
export const importsIn = (t: Team, line = t.lineup): Player[] =>
  ROLES.map((r) => (line[r] ? S.players[line[r]!] : null)).filter((p): p is Player => !!p && isImport(p, t.league));
/** đổi đội hình có vi phạm luật ngoại binh không */
export function lineupOk(t: Team, line: Team['lineup']): boolean { return importsIn(t, line).length <= IMPORT_MAX; }

/** đầu game / bản lưu cũ: đội đang vi phạm (dữ liệu thật) → các ngoại binh dư được coi là đã có quyền cư trú */
export function grandfatherImports(): void {
  if (S.importsInit) return;
  S.importsInit = true;
  for (const t of Object.values(S.teams)) {
    const im = importsIn(t).sort((a, b) => b.age - a.age);
    for (const p of im.slice(0, Math.max(0, im.length - IMPORT_MAX))) (p.resid ??= []).push(t.league);
  }
}
/** cuối mùa: tích lũy năm thi đấu, đủ 3 mùa thì có quyền cư trú */
export function residencySeason(): void {
  for (const p of Object.values(S.players)) {
    if (p.retired || !p.teamId) continue;
    const lg = S.teams[p.teamId].league;
    if (!isImport(p, lg)) continue;
    p.yrs ??= {};
    p.yrs[lg] = (p.yrs[lg] || 0) + 1;
    if (p.yrs[lg] >= 3) { (p.resid ??= []).push(lg); if (p.teamId === S.userTeam) addNews('news.resident', { player: p.ign, league: lg }, true); }
  }
}

// ---------- ngôn ngữ & hòa nhập ----------
const LANG: Record<string, string> = { 'South Korea': 'ko', China: 'zh', Taiwan: 'zh', 'Hong Kong': 'zh', Macau: 'zh', Vietnam: 'vi', Japan: 'ja', Brazil: 'pt' };
export const langOf = (p: Player): string => LANG[p.country] || (LATAM.includes(p.country) ? 'es' : 'en');
/** ngôn ngữ giao tiếp của đội: ngôn ngữ của số đông đá chính (LEC/LCS mặc định tiếng Anh) */
export function teamLang(t: Team): string {
  if (t.league === 'LEC' || t.league === 'LCS') return 'en';
  const c: Record<string, number> = {};
  for (const r of ROLES) { const id = t.lineup[r]; if (id && S.players[id]) { const l = langOf(S.players[id]); c[l] = (c[l] || 0) + 1; } }
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || 'en';
}
/** mức hòa nhập 0..100 (không có = đã quen hoàn toàn) */
export const adaptOf = (p: Player): number => p.adapt ?? 100;
/** tuyển thủ mới về đội: khác ngôn ngữ thì bắt đầu hòa nhập lại */
export function onJoin(p: Player, t: Team): void {
  const tl = teamLang(t), pl = langOf(p);
  if (tl === pl) { p.adapt = undefined; return; }
  const near = (tl === 'pt' && pl === 'es') || (tl === 'es' && pl === 'pt') || (tl === 'en' && ['es', 'pt'].includes(pl));
  p.adapt = near ? 55 : 25;
}
/** mỗi ngày: hòa nhập dần (nhanh hơn khi có đồng hương / chuyên gia tâm lý) */
export function adaptDay(): void {
  for (const t of Object.values(S.teams)) {
    const ps = teamPlayers(t);
    for (const p of ps) {
      if (p.adapt == null) continue;
      const mates = ps.filter((x) => x.id !== p.id && langOf(x) === langOf(p)).length;
      const psych = t.id === S.userTeam ? (S.staff?.psych ?? 0) * 0.25 : 0.3;
      p.adapt = Math.min(100, p.adapt + 0.7 + Math.min(2, mates) * 0.35 + psych);
      if (p.adapt >= 100) { p.adapt = undefined; if (t.id === S.userTeam) addNews('news.adapted', { player: p.ign }); }
    }
  }
}
/** phạt ăn ý do bất đồng ngôn ngữ (trừ vào độ ăn ý của vị trí) */
export const langPenalty = (p: Player | undefined | null): number => (p && p.adapt != null ? (100 - p.adapt) * 0.18 : 0);

// ---------- kèm cặp ----------
export function mentorOk(mentee: Player, mentor: Player): string | null {
  if (mentee.id === mentor.id) return 'mt.err.self';
  if (mentor.age < 23) return 'mt.err.young';
  if (mentee.age > 22) return 'mt.err.old';
  if (mentor.ovr < mentee.ovr + 4) return 'mt.err.weak';
  if (Object.values(S.mentor || {}).includes(mentor.id) && S.mentor?.[mentee.id] !== mentor.id) return 'mt.err.busy';
  return null;
}
export function setMentor(menteeId: string, mentorId: string | null): string | null {
  S.mentor ??= {};
  if (!mentorId) { delete S.mentor[menteeId]; return null; }
  const err = mentorOk(S.players[menteeId], S.players[mentorId]);
  if (err) return err;
  S.mentor[menteeId] = mentorId;
  return null;
}
export const mentorOf = (pid: string): Player | null => { const id = S.mentor?.[pid]; return id ? S.players[id] ?? null : null; };
export const menteeOf = (pid: string): Player | null => { const e = Object.entries(S.mentor || {}).find(([, m]) => m === pid); return e ? S.players[e[0]] ?? null : null; };
/** người kèm cặp mạnh nhất ở chỉ số nào → tân binh học dần chỉ số đó */
const topAttrs = (p: Player): Attr[] => (Object.entries(p.stats) as [Attr, number][]).filter(([k]) => k !== 'aggression').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
export function mentorDay(): void {
  const ut = S.userTeam;
  for (const [a, b] of Object.entries(S.mentor || {})) {
    const e = S.players[a], m = S.players[b];
    const ok = e && m && !e.retired && !m.retired && (e.teamId === ut || e.academyOf === ut) && (m.teamId === ut);
    if (!ok) { delete S.mentor![a]; continue; }
    if (rand() < 0.07) {
      const k = pick(topAttrs(m).filter((x) => e.stats[x] < m.stats[x] - 1));
      if (k) { e.stats[k] = clamp(e.stats[k] + 1, 30, 99); e.ovr = computeOvr(e); e.potential = Math.max(e.potential, e.ovr); }
    }
    e.morale = clamp((e.morale ?? 70) + 0.08, 20, 100);
    m.morale = clamp((m.morale ?? 70) + 0.04, 20, 100);
  }
}

// ---------- đổi vị trí ----------
export function startSwap(pid: string, to: Role | null): void {
  S.swap ??= {};
  if (!to || to === S.players[pid]?.role) { delete S.swap[pid]; return; }
  S.swap[pid] = { to, prog: 0 };
}
export const swapRate = (p: Player): number => +((p.age <= 21 ? 1.8 : p.age <= 24 ? 1.35 : 0.95) * (1 + (S.staff?.assistant ?? 0) * 0.15)).toFixed(2);
/** OVR dự kiến ở vị trí mới (chỉ số giữ nguyên, trọng số vị trí đổi) */
export const ovrAs = (p: Player, r: Role): number => computeOvr({ role: r, stats: p.stats });
export function swapDay(): void {
  for (const [pid, s] of Object.entries(S.swap || {})) {
    const p = S.players[pid];
    if (!p || p.retired || (p.teamId !== S.userTeam && p.academyOf !== S.userTeam)) { delete S.swap![pid]; continue; }
    s.prog += swapRate(p);
    if (s.prog < 100) continue;
    delete S.swap![pid];
    const from = p.role;
    p.role = s.to;
    p.ovr = computeOvr(p);
    const meta = tierList(s.to).slice(0, 8).filter((x) => !p.pool.some((c) => c.c === x.id)).slice(0, 3);
    for (const c of meta) p.pool.push({ c: c.id, g: 3, w: 1.5 });
    const ut = userTeam();
    for (const r of ROLES) if (ut.lineup[r] === p.id && r !== p.role) delete ut.lineup[r];
    addNews('news.roleSwap', { player: p.ign, from: { $t: 'role.' + from }, to: { $t: 'role.' + s.to } }, true);
  }
}
