// Kho thống kê từng giải qua các mùa, giải thưởng cá nhân và kỷ lục.
// - Mỗi giải (LCK Cup, LCK, LPL Split 1..3, MSI, CKTG...) lưu thống kê từng tuyển thủ trong mùa hiện tại.
// - Khi giải kết thúc: chọn MVP giải, MVP chung kết, đội hình tiêu biểu (All-Pro) theo vị trí, tân binh xuất sắc.
// - Kỷ lục một ván và kỷ lục cả giải được cập nhật liên tục; danh sách vinh danh giữ qua mọi mùa.
import { S } from './state';
import { ROLES } from './util';
import type { Comp, EvRow, EventStats, GameResult, HallEntry, Match, Role, Who } from './types';

interface Rated { pid: string; role: Role; g: number; w: number; k: number; d: number; a: number; cs: number; dmg: number; min: number; mvp: number; raw: number; z?: number }

const RECORD_KEYS = ['kills', 'assists', 'cs', 'dmg', 'gold'] as const;

// tên giải để gom thống kê (null = không tính, vd. trận thăng hạng)
export function eventOf(comp: Comp | undefined): string | null {
  if (!comp || comp.key === 'promotion') return null;
  if (comp.league === 'LPL' && (comp.key === 's3-po' || comp.key === 'regional')) return 'LPL Split 3';
  return comp.name;
}

function ensure(): void {
  S.evstats ??= {};
  S.hall ??= [];
  S.records ??= { game: {}, event: {}, team: {} };

}
const who = (pid: string): Who => {
  const p = S.players[pid];
  return { pid, ign: p ? p.ign : '?', team: p && p.teamId ? S.teams[p.teamId]?.short : '' };
};

// gọi sau mỗi ván (kể cả ván giả lập)
export function archiveGame(match: Match, g: GameResult): void {
  ensure();
  const comp = S.comps[match.comp];
  const ev = eventOf(comp);
  if (!ev) return;
  const E = (S.evstats![ev] ??= { league: comp.league, season: S.season, players: {}, closed: false });
  const min = g.durS ? g.durS / 60 : g.dur;
  for (const x of g.players) {
    if (!x.pid) continue;
    // [ván, thắng, hạ, chết, hỗ trợ, cs, sát thương, vàng, phút, mvp]
    const r: EvRow = (E.players[x.pid] ??= [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    r[0]++; if (x.side === g.winner) r[1]++;
    r[2] += x.k; r[3] += x.d; r[4] += x.a; r[5] += x.cs; r[6] += x.dmg || 0; r[7] += x.gold || 0; r[8] += min; if (g.mvp === x.pid) r[9]++;
    E.role ??= {};
    E.role[x.pid] = x.role;
  }
  // thống kê của loạt chung kết (để chọn MVP chung kết)
  if (match.node === 'GF' || match.node === 'F') {
    match.fstat ??= {};
    for (const x of g.players) if (x.pid) match.fstat[x.pid] = (match.fstat[x.pid] || 0) + x.k * 3 + x.a * 1.5 - x.d * 1.5 + (x.dmg || 0) / 2500 + (g.mvp === x.pid ? 4 : 0);
  }
  // kỷ lục một ván
  const R = S.records!.game;
  const ctx = { season: S.season, event: ev };
  for (const x of g.players) {
    if (!x.pid) continue;
    for (const k of RECORD_KEYS) {
      const v = k === 'kills' ? x.k : k === 'assists' ? x.a : x[k] as number | undefined;
      if (v == null) continue;
      if (!R[k] || v > R[k].v) R[k] = { v, ...who(x.pid), champ: x.champ, ...ctx };
    }
  }
  const tk = g.kills.B + g.kills.R;
  const teams = `${S.teams[g.blue].short} vs ${S.teams[g.red].short}`;
  if (!R.longest || g.durS > R.longest.v) R.longest = { v: g.durS, teams, ...ctx };
  if (!R.shortest || g.durS < R.shortest.v) R.shortest = { v: g.durS, teams, ...ctx };
  if (!R.bloodiest || tk > R.bloodiest.v) R.bloodiest = { v: tk, teams, ...ctx };
}

// đánh giá tuyển thủ trong một giải: điểm so với cùng vị trí (z-score)
function ratings(E: EventStats): (Rated & { z: number })[] {
  const rows: Rated[] = Object.entries(E.players).map(([pid, r]) => {
    const [g, w, k, d, a, cs, dmg, , min, mvp] = r;
    const m = Math.max(min, 1);
    const raw = ((k * 3 + a * 1.4 - d * 1.6) / g) + (dmg / m) / 120 + (cs / m) * 0.35 + (w / g) * 5 + (mvp / g) * 8;
    return { pid, role: (E.role?.[pid] || S.players[pid]?.role) as Role, g, w, k, d, a, cs, dmg, min, mvp, raw };
  });
  const maxG = Math.max(0, ...rows.map((x) => x.g));
  const elig = rows.filter((x) => x.g >= Math.max(1, maxG * 0.4));
  for (const role of ROLES) {
    const rs = elig.filter((x) => x.role === role);
    const mu = rs.reduce((s, x) => s + x.raw, 0) / Math.max(rs.length, 1);
    const sd = Math.sqrt(rs.reduce((s, x) => s + (x.raw - mu) ** 2, 0) / Math.max(rs.length, 1)) || 1;
    for (const x of rs) x.z = (x.raw - mu) / sd + (x.w / x.g) * 0.8;
  }
  return elig.filter((x): x is Rated & { z: number } => x.z != null).sort((a, b) => b.z - a.z);
}

// gọi khi giai đoạn có cúp của giải kết thúc
export function closeEvent(comp: Comp, order: string[]): HallEntry | null {
  ensure();
  const ev = eventOf(comp);
  const E = ev && S.evstats![ev];
  if (!E || E.closed) return null;
  E.closed = true;
  const rs = ratings(E);
  if (!rs.length) return null;
  const allpro: Partial<Record<Role, string>> = {};
  for (const role of ROLES) { const b = rs.find((x) => x.role === role); if (b) allpro[role] = b.pid; }
  const rookie = rs.find((x) => { const p = S.players[x.pid]; return p && (p.rookie || p.age <= 19); });
  // MVP chung kết: tuyển thủ đội vô địch chơi hay nhất loạt chung kết
  const fm = comp.matches.find((m) => (m.node === 'GF' || m.node === 'F') && m.fstat);
  let fmvp: string | null = null;
  if (fm) {
    const champTeam = order[0];
    fmvp = Object.entries(fm.fstat!).filter(([pid]) => S.players[pid]?.teamId === champTeam).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    delete fm.fstat;
  }
  const lead = (f: (x: Rated) => number, n = 5) => [...rs].sort((a, b) => f(b) - f(a)).slice(0, n).map((x) => ({ ...who(x.pid), v: +f(x).toFixed(2), g: x.g }));
  const entry: HallEntry = {
    season: S.season, event: ev, league: comp.league, title: comp.trophy?.title || ev,
    champ: order[0] ? S.teams[order[0]].short : '', runner: order[1] ? S.teams[order[1]].short : '',
    mvp: who(rs[0].pid), fmvp: fmvp ? who(fmvp) : null, rookie: rookie ? who(rookie.pid) : null,
    allpro: Object.fromEntries(Object.entries(allpro).map(([r, pid]) => [r, who(pid)])),
    leaders: {
      kda: lead((x) => (x.k + x.a) / Math.max(x.d, 1)),
      kills: lead((x) => x.k),
      dpm: lead((x) => x.dmg / Math.max(x.min, 1)),
      cspm: lead((x) => x.cs / Math.max(x.min, 1)),
    },
  };
  S.hall!.unshift(entry);
  // danh hiệu cá nhân lưu vào hồ sơ tuyển thủ
  const tag = (pid: string, key: string): void => { const p = S.players[pid]; if (p) (p.awards ??= []).push(`${key}|${entry.title} ${S.season}`); };
  tag(rs[0].pid, 'mvp');
  if (fmvp) tag(fmvp, 'fmvp');
  for (const pid of Object.values(allpro)) tag(pid, 'allpro');
  if (rookie) tag(rookie.pid, 'rookie');
  // kỷ lục cả giải
  const RE = S.records!.event;
  const ctx = { season: S.season, event: ev };
  for (const x of rs) {
    const vals = { kills: x.k, kda: x.g >= 5 ? (x.k + x.a) / Math.max(x.d, 1) : 0, mvps: x.mvp };
    for (const [k, v] of Object.entries(vals)) if (v && (!RE[k] || v > RE[k].v)) RE[k] = { v: +v.toFixed(2), ...who(x.pid), g: x.g, ...ctx };
  }
  return entry;
}

// mùa mới: xoá thống kê giải của mùa cũ (vinh danh và kỷ lục vẫn giữ)
export function resetEventStats(): void {
  ensure();
  S.evstats! = {};
  S.hall! = S.hall!.slice(0, 400);
}

export const AWARD_KEYS = ['mvp', 'fmvp', 'allpro', 'rookie'];
