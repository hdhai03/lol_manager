// Thành tựu: kiểm tra trên trạng thái game; lưu ở hồ sơ HLV (dùng chung mọi bản lưu trong trình duyệt).
import { S, userTeam, teamOvr } from './state';
import { teamChem } from './life';
import type { Match } from './types';

const userMatches = (): Match[] => Object.values(S.comps).flatMap((c) => c.matches).filter((m) => m.done && (m.a === S.userTeam || m.b === S.userTeam)).sort((a, b) => a.day - b.day);
const won = (m: Match) => m.winner === S.userTeam;
const myGames = (m: Match) => m.games.map((g) => g.winner === S.userTeam);
const allTitles = (): string[] => {
  const c = S.career;
  const past = c ? c.hist.flatMap((h) => h.titles) : [];
  return [...past, ...userTeam().trophies.filter((x) => x.endsWith(String(S.season)))];
};

export interface AchDef { id: string; icon: string; tier: 'b' | 's' | 'g'; check: () => boolean }
export const ACH: AchDef[] = [
  { id: 'firstWin', icon: '⚔', tier: 'b', check: () => userMatches().some(won) },
  { id: 'streak5', icon: '🔥', tier: 's', check: () => { let s = 0; for (const m of userMatches()) { s = won(m) ? s + 1 : 0; if (s >= 5) return true; } return false; } },
  { id: 'clean', icon: '✦', tier: 'b', check: () => userMatches().some((m) => m.bo === 5 && won(m) && myGames(m).every(Boolean)) },
  { id: 'reverse', icon: '↺', tier: 'g', check: () => userMatches().some((m) => m.bo === 5 && won(m) && myGames(m)[0] === false && myGames(m)[1] === false) },
  { id: 'giantKiller', icon: '⚡', tier: 's', check: () => userMatches().some((m) => won(m) && teamOvr(S.teams[m.a === S.userTeam ? m.b : m.a]) - teamOvr(userTeam()) >= 5) },
  { id: 'league', icon: '🏆', tier: 's', check: () => allTitles().length > 0 },
  { id: 'intl', icon: '🌍', tier: 'g', check: () => allTitles().some((x) => /MSI|First Stand|Worlds|CKTG/i.test(x)) },
  { id: 'worlds', icon: '👑', tier: 'g', check: () => allTitles().some((x) => /Worlds|CKTG/i.test(x)) },
  { id: 'double', icon: '✌', tier: 'g', check: () => { const by: Record<string, number> = {}; for (const x of allTitles()) { const y = x.slice(-4); by[y] = (by[y] || 0) + 1; } return Object.values(by).some((n) => n >= 2); } },
  { id: 'dynasty', icon: '♛', tier: 'g', check: () => allTitles().length >= 5 },
  { id: 'underdog', icon: '🐺', tier: 'g', check: () => !!S.career && (S.career.obj === 'develop' || S.career.obj === 'playoffs') && allTitles().length > 0 },
  { id: 'rich', icon: '💰', tier: 's', check: () => userTeam().budget >= 20000 },
  { id: 'fans', icon: '📣', tier: 's', check: () => (S.brand?.fans ?? 0) >= 2000 },
  { id: 'chem', icon: '∞', tier: 's', check: () => teamChem(S.userTeam) >= 85 },
  { id: 'staff', icon: '✎', tier: 'b', check: () => !!S.staff && Object.values(S.staff).every((v) => v >= 3) },
  { id: 'academy', icon: '🌱', tier: 's', check: () => Object.values(userTeam().lineup).some((id) => id && (S.news || []).some((n) => n.key === 'news.promotedYouth' && n.params?.player === S.players[id]?.ign)) },
  { id: 'trait', icon: '★', tier: 'b', check: () => (S.news || []).some((n) => n.key === 'news.traitGain') },
  { id: 'boosts', icon: '◎', tier: 'b', check: () => (S.boosts?.length ?? 0) >= 6 },
  { id: 'veteran', icon: '⌛', tier: 's', check: () => (S.career?.hist.length ?? 0) >= 3 },
  { id: 'journeyman', icon: '✈', tier: 's', check: () => new Set([...(S.career?.hist || []).map((h) => h.team), S.userTeam]).size >= 2 },
];

const KEY = 'lolm_ach';
export function achUnlocked(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
/** kiểm tra và lưu thành tựu mới; trả về danh sách id vừa mở */
export function checkAch(): string[] {
  if (!S || !S.teams) return [];
  const have = achUnlocked();
  const fresh: string[] = [];
  for (const a of ACH) {
    if (have[a.id]) continue;
    let ok = false;
    try { ok = a.check(); } catch { ok = false; }
    if (ok) { have[a.id] = `${S.season} · ${S.teams[S.userTeam]?.short ?? ''}`; fresh.push(a.id); }
  }
  if (fresh.length) try { localStorage.setItem(KEY, JSON.stringify(have)); } catch { /* */ }
  return fresh;
}
