// Sự kiện kiểu LMHT: trang phục vô địch CKTG, All-Star cuối mùa, giải Clash cho học viện.
import { S, addNews, userTeam, lineupPlayers } from './state';
import { ROLES, clamp, logistic, pick, rand, shuffle } from './util';
import { ledgerAdd } from './career';
import { ladder, SERVER_OF } from './academy';
import type { Player, Role } from './types';

// ---------- trang phục vô địch ----------
export interface SkinSet { season: number; team: string; title: string; picks: { role: Role; pid: string; ign: string; champ: string }[] }
export function championSkins(teamId: string, title: string): void {
  const tm = S.teams[teamId];
  const picks = lineupPlayers(tm).filter((x) => x.p).map(({ role, p }) => ({ role, pid: p!.id, ign: p!.ign, champ: p!.pool[0]?.c || 'Ahri' }));
  const set: SkinSet = { season: S.season, team: teamId, title, picks };
  S.skins = [set, ...(S.skins || [])];
  addNews('news.skins', { team: tm.name, champs: picks.map((x) => x.champ).join(', ') }, true);
  if (teamId === S.userTeam) {
    // doanh thu bán trang phục: trả dần trong mùa sau + người hâm mộ tăng mạnh
    S.skinRevenue = { left: 50, per: 16 };
    if (S.brand) { S.brand.fans = Math.round(S.brand.fans * 1.1); S.brand.hype = clamp(S.brand.hype + 15, 0, 100); }
  }
}
export function skinDay(): void {
  const r = S.skinRevenue;
  if (!r || r.left <= 0) return;
  r.left--;
  userTeam().budget += r.per;
  ledgerAdd('merch', r.per);
}

// ---------- All-Star ----------
export interface AllStar { season: number; roster: Record<string, Partial<Record<Role, string>>>; oneVone: string; oneVoneFinal: [string, string]; aram: 'east' | 'west' }
const EAST = new Set(['LCK', 'LPL', 'LCP', 'VCS']);
/** người hâm mộ bình chọn: phong độ + độ nổi tiếng + OVR */
export function runAllStar(): void {
  const votes = (p: Player) => p.ovr * 1 + (p.hype ?? 50) * 0.6 + (p.season.mvp || 0) * 2 + rand() * 6;
  const roster: AllStar['roster'] = {};
  for (const lg of new Set(Object.values(S.teams).map((t) => t.league))) {
    const ps = Object.values(S.players).filter((p) => p.teamId && S.teams[p.teamId].league === lg && !p.retired);
    roster[lg] = Object.fromEntries(ROLES.map((r) => [r, ps.filter((p) => p.role === r).sort((a, b) => votes(b) - votes(a))[0]?.id]).filter(([, v]) => v));
  }
  // giải 1v1: 8 tuyển thủ Đường giữa / Đường trên được bình chọn
  const pool = Object.values(roster).flatMap((x) => [x.Mid, x.Top]).filter(Boolean) as string[];
  let cur = shuffle(pool).slice(0, 8);
  let final: [string, string] = [cur[0], cur[1]];
  while (cur.length > 1) {
    const nx: string[] = [];
    for (let i = 0; i + 1 < cur.length; i += 2) {
      const a = S.players[cur[i]], b = S.players[cur[i + 1]];
      const sa = (a.stats.accuracy + a.stats.dodge + a.stats.aggression * 0.3), sb = (b.stats.accuracy + b.stats.dodge + b.stats.aggression * 0.3);
      if (cur.length === 2) final = [a.id, b.id];
      nx.push(rand() < logistic((sa - sb) / 12) ? a.id : b.id);
    }
    cur = nx;
  }
  const as: AllStar = { season: S.season, roster, oneVone: cur[0], oneVoneFinal: final, aram: rand() < 0.5 ? 'east' : 'west' };
  S.allstar = as;
  // được bầu: nổi tiếng hơn, phấn chấn hơn
  for (const x of Object.values(roster)) for (const pid of Object.values(x)) {
    const p = pid ? S.players[pid] : null;
    if (!p) continue;
    p.hype = clamp((p.hype ?? 50) + 6, 0, 100);
    p.morale = clamp((p.morale ?? 70) + 4, 20, 100);
    (p.awards ??= []).push(`allstar|All-Star ${S.season}`);
  }
  const mine = Object.values(roster).flatMap((x) => Object.values(x)).filter((pid) => pid && S.players[pid!]?.teamId === S.userTeam).map((pid) => S.players[pid!].ign);
  addNews('news.allstar', { n: mine.length, players: mine.join(', ') || '—', winner: S.players[as.oneVone]?.ign || '?' }, true);
}
export const isEast = (lg: string) => EAST.has(lg);

// ---------- Clash ----------
export interface ClashRes { day: number; teams: string[]; winner: string; mineRank: number; mvp: string; mvpAcc?: string }
/** mỗi 14 ngày: giải Clash cuối tuần cho học viện của bạn và các đội nghiệp dư trên máy chủ */
export function clashDay(): void {
  if (S.phase === 'offseason' || (S.clashDay != null && S.day - S.clashDay < 14)) return;
  const ut = userTeam();
  const acad = Object.values(S.players).filter((p) => p.academyOf === ut.id && !p.retired);
  if (acad.length < 3) return;
  S.clashDay = S.day;
  const sv = SERVER_OF[ut.league] || 'KR';
  const ams = ladder(sv).filter((a) => !a.pid && a.pr).slice(0, 40);
  const teams: { name: string; ovr: number; best?: string }[] = [{ name: `${ut.short} Academy`, ovr: acad.reduce((s, p) => s + p.ovr, 0) / acad.length + 2 }];
  for (let i = 0; i < 7; i++) {
    const five = shuffle(ams).slice(0, 5);
    if (!five.length) break;
    const best = five.sort((a, b) => b.pr!.ovr - a.pr!.ovr)[0];
    teams.push({ name: `${pick(['Team', 'Squad', 'Club'])} ${best.name || 'Ama'}`, ovr: five.reduce((s, a) => s + a.pr!.ovr, 0) / five.length, best: best.id });
  }
  let bracket = shuffle(teams.map((x, i) => i));
  const out: number[] = [];
  while (bracket.length > 1) {
    const nx: number[] = [];
    for (let i = 0; i + 1 < bracket.length; i += 2) {
      const a = bracket[i], b = bracket[i + 1];
      const w = rand() < logistic((teams[a].ovr - teams[b].ovr) / 4) ? a : b;
      nx.push(w); out.unshift(w === a ? b : a);
    }
    bracket = nx;
  }
  out.unshift(bracket[0]);
  const mineRank = out.indexOf(0) + 1;
  const win = teams[bracket[0]];
  const mvp = bracket[0] === 0 ? pick(acad).ign : (ams.find((a) => a.id === win.best)?.name || '?');
  const res: ClashRes = { day: S.day, teams: teams.map((x) => x.name), winner: win.name, mineRank, mvp, mvpAcc: bracket[0] === 0 ? undefined : win.best };
  S.clash = [res, ...(S.clash || [])].slice(0, 8);
  // học viện thắng: tinh thần & tiến bộ; tài năng nghiệp dư nổi bật: được "phát hiện"
  for (const p of acad) p.morale = clamp((p.morale ?? 70) + (mineRank === 1 ? 5 : mineRank <= 2 ? 2 : -1), 20, 100);
  if (res.mvpAcc) { const ac = S.academy; if (ac) ac.days[sv] = (ac.days[sv] || 0) + 6; }
  addNews(mineRank === 1 ? 'news.clashWin' : 'news.clash', { team: teams[0].name, rank: mineRank, winner: win.name, mvp }, mineRank === 1);
}
