import { DB } from './data';
import { ledgerAdd, ledgerCatOf } from './career';
import { ROLES, ATTRS, computeOvr, randInt, pick, clamp, hue } from './util';
import { deriveAttrs, defaultTactics, migratePlayer } from './attrs';
import type { GameState, Team, Player, Role, LeagueId, SeasonStats, Stats, AttrGroup } from './types';

export const SAVE_VERSION = 1;
/** trạng thái game đang được engine xử lý. Mọi API công khai nhận GameState rồi gắn vào đây (xem engine/index.ts). */
export let S: GameState = null as unknown as GameState;
export function setState(s: GameState): void { S = s; }
/** chạy fn với trạng thái st (dùng cho test, Web Worker, nhiều save cùng lúc) */
export function withState<T>(st: GameState, fn: () => T): T {
  const prev = S;
  S = st;
  try { return fn(); } finally { if (prev) S = prev; }
}

export function newGame({ teamId, manager }: { teamId: string; manager: string }): GameState {
  const players: Record<string, Player> = {};
  for (const p of Object.values(DB.players)) {
    players[p.link] = {
      id: p.link, ign: p.ign, name: p.name || '', native: p.native || '', country: p.country || '',
      age: p.age || 21, role: p.role, teamId: p.team as string | null,
      stats: deriveAttrs(p), ovr: p.ovr, potential: p.potential, pool: p.pool || [],
      salary: p.salary, value: p.value, contractUntil: 2027 + randInt(0, 2),
      form: 0, morale: 70, cond: 100, record: p.record, realGames: p.games,
      season: blankStats(), career: blankStats(), rookie: false,
    };
  }
  const teams: Record<string, Team> = {};
  for (const t of Object.values(DB.teams)) {
    teams[t.name] = {
      id: t.name, name: t.display || t.name, short: t.short, league: t.league, coach: t.coach || '',
      roster: t.players.filter((l) => players[l]), lineup: {}, budget: t.budget,
      hue: hue(t.name), trophies: [], sponsor: 0,
    };
  }
  const s: GameState = {
    version: SAVE_VERSION, manager, userTeam: teamId, season: 2027, phase: null, day: 0,
    teams, players, comps: {}, phaseComps: [], news: [], history: [], finance: [],
    training: 'tech' as AttrGroup, tactics: defaultTactics(), freeAgents: [], created: Date.now(), userMatchesPlayed: 0,
  };
  S = s;
  for (const p of Object.values(players)) { const o = p.ovr; p.ovr = computeOvr(p); p.potential = Math.max(p.potential + p.ovr - o, p.ovr); }
  for (const t of Object.values(teams)) {
    autoLineup(t);
    t.sponsor = Math.round(teamSalary(t) * (t.id === teamId ? 1.0 : 1.1) + 200);
  }
  return s;
}

export function blankStats(): SeasonStats { return { g: 0, w: 0, k: 0, d: 0, a: 0, cs: 0, mvp: 0, dmg: 0, gold: 0, min: 0, tk: 0, rt: 0 }; }

export const team = (id: string): Team => S.teams[id];
export const player = (id: string): Player => S.players[id];
export const userTeam = (): Team => S.teams[S.userTeam];
export const teamPlayers = (t: Team): Player[] => t.roster.map((id) => S.players[id]).filter(Boolean);
export const teamSalary = (t: Team): number => teamPlayers(t).reduce((s, p) => s + p.salary, 0);

export function autoLineup(t: Team): void {
  const used = new Set<string>();
  t.lineup = {};
  for (const role of ROLES) {
    const best = teamPlayers(t).filter((p) => p.role === role && !used.has(p.id)).sort((a, b) => b.ovr - a.ovr)[0];
    if (best) { t.lineup[role] = best.id; used.add(best.id); }
  }
  // vị trí trống: dùng người còn lại tốt nhất (trái vị trí)
  for (const role of ROLES) {
    if (t.lineup[role]) continue;
    const best = teamPlayers(t).filter((p) => !used.has(p.id)).sort((a, b) => b.ovr - a.ovr)[0];
    if (best) { t.lineup[role] = best.id; used.add(best.id); }
  }
}

// chỉ lấp các vị trí còn trống, giữ nguyên lựa chọn của người chơi
export function fillLineup(t: Team): void {
  for (const r of ROLES) if (t.lineup[r] && !t.roster.includes(t.lineup[r]!)) delete t.lineup[r];
  const used = new Set(Object.values(t.lineup));
  for (const role of ROLES) {
    if (t.lineup[role]) continue;
    const cands = teamPlayers(t).filter((p) => !used.has(p.id)).sort((a, b) => Number(b.role === role) - Number(a.role === role) || b.ovr - a.ovr);
    if (cands[0]) { t.lineup[role] = cands[0].id; used.add(cands[0].id); }
  }
}

export function lineupPlayers(t: Team): { role: Role; p: Player | null }[] {
  return ROLES.map((r) => ({ role: r, p: t.lineup[r] ? S.players[t.lineup[r]!] ?? null : null }));
}

export function teamOvr(t: Team): number {
  const lp = lineupPlayers(t).filter((x): x is { role: Role; p: Player } => !!x.p);
  if (!lp.length) return 40;
  const sum = lp.reduce((s, x) => s + x.p.ovr - (x.p.role !== x.role ? 8 : 0), 0);
  return Math.round((sum + (5 - lp.length) * 35) / 5);
}

export function addNews(key: string, params: Record<string, unknown> = {}, important = false): void {
  S.newsSeq = (S.newsSeq || 0) + 1;
  S.news.unshift({ id: S.newsSeq, key, params, day: S.day, season: S.season, important });
  if (S.news.length > 120) S.news.length = 120;
}

export function addFinance(key: string, amount: number, params: Record<string, unknown> = {}): void {
  const t = userTeam();
  t.budget += amount;
  ledgerAdd(ledgerCatOf(key), amount);
  S.finance.unshift({ key, amount, params, day: S.day, season: S.season });
  if (S.finance.length > 200) S.finance.length = 200;
}

// ----- Tân binh (tên hư cấu) -----
const SYL = ['ka', 'ri', 'zen', 'mo', 'lu', 'xi', 'ra', 'no', 'vi', 'te', 'shi', 'do', 'ny', 'ko', 'el', 'an', 'yu', 'ha', 'ro', 'qi', 'mi', 'su', 'ta', 'li'];
const COUNTRY_BY_LEAGUE: Record<string, string> = { LCK: 'South Korea', LPL: 'China', LEC: 'France', LCS: 'United States', LCP: 'Taiwan', CBLOL: 'Brazil', VCS: 'Vietnam' };
export function makeRookie(league: LeagueId, role: Role): Player {
  let ign: string;
  do {
    ign = pick(SYL) + pick(SYL) + (Math.random() < 0.3 ? pick(SYL) : '');
    ign = ign[0].toUpperCase() + ign.slice(1);
  } while (S.players['rk_' + ign]);
  const lg = DB.leagueById[league] || { strength: 0.8 };
  const base = 50 + lg.strength * 14 + randInt(-4, 4);
  const stats = {} as Stats;
  for (const a of ATTRS) stats[a] = clamp(base + randInt(-7, 7), 35, 85);
  stats.aggression = randInt(40, 90);
  const p: Player = {
    id: 'rk_' + ign, ign, name: '', native: '', country: COUNTRY_BY_LEAGUE[league] || '', age: randInt(17, 19), role,
    teamId: null, stats, ovr: 0, potential: 0, pool: [], salary: 0, value: 0, contractUntil: S.season + 2,
    form: 0, morale: 70, cond: 100, record: null, realGames: 0, season: blankStats(), career: blankStats(), rookie: true, homeLeague: league,
  };
  p.ovr = computeOvr(p);
  p.potential = clamp(p.ovr + randInt(6, 26), p.ovr, 97);
  // tân binh có pool tướng meta theo vị trí
  const champs = DB.champList.filter((c) => c.roles.includes(role)).sort((a, b) => b.power - a.power).slice(0, 14);
  p.pool = champs.sort(() => Math.random() - 0.5).slice(0, 5).map((c) => ({ c: c.id, g: randInt(2, 10), w: 0 }))
    .map((x) => ({ ...x, w: Math.round(x.g * (0.4 + Math.random() * 0.3)) }));
  refreshValue(p);
  S.players[p.id] = p;
  return p;
}

export function refreshValue(p: Player): void {
  const lg = 0.85;
  p.value = Math.round(clamp((p.ovr - 55) ** 2 * 1.6 * (0.6 + lg * 0.5), 20, 3500) * (2.2 + Math.max(0, 25 - p.age) * 0.15) + Math.max(0, p.potential - p.ovr) * 25);
  if (!p.salary) p.salary = Math.round(clamp((p.ovr - 55) ** 2 * 1.6 * 1.0, 20, 3500));
}

// ----- Lưu / tải -----
const KEY = 'lolm_save_';
export function saveGame(slot = 'auto'): boolean {
  try {
    const meta = { slot, manager: S.manager, team: S.userTeam, season: S.season, phase: S.phase, day: S.day, savedAt: Date.now() };
    localStorage.setItem(KEY + slot, JSON.stringify({ meta, state: S }));
    return true;
  } catch (e) { console.error(e); return false; }
}
export interface SaveMeta { slot: string; manager: string; team: string; season: number; phase: string | null; day: number; savedAt: number }
export function listSaves(): SaveMeta[] {
  const out: SaveMeta[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY)) continue;
      try { out.push(JSON.parse(localStorage.getItem(k) || 'null').meta); } catch { /* bỏ qua */ }
    }
  } catch { /* storage bị chặn */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}
export function loadSave(slot: string): boolean {
  const raw = localStorage.getItem(KEY + slot);
  if (!raw) return false;
  const d = JSON.parse(raw);
  S = d.state;
  migrateState();
  return true;
}
export function deleteSave(slot: string): void { try { localStorage.removeItem(KEY + slot); } catch { /* */ } }
export function exportSave(): string { return JSON.stringify({ meta: { exported: Date.now(), version: SAVE_VERSION }, state: S }); }
export function importSave(text: string): void {
  const d = JSON.parse(text);
  if (!d.state || !d.state.teams || !d.state.players) throw new Error('invalid');
  S = d.state;
  migrateState();
}

// save cũ (6 chỉ số) → hệ 15 chỉ số + chiến thuật
export function migrateState(): void {
  for (const p of Object.values(S.players)) migratePlayer(p);
  S.tactics ??= defaultTactics();
  if (!['tech', 'mind', 'mental', 'team'].includes(S.training)) S.training = 'tech';
}
