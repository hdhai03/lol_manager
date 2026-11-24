// Bảng xếp hạng sức mạnh toàn cầu (theo mô hình Global Power Rankings của LoL Esports):
// điểm Elo của đội (80%) + điểm sức mạnh khu vực (20%). Elo cập nhật sau mỗi loạt đấu với hệ số K theo bối cảnh
// (play-in < vòng bảng < playoffs; quốc tế nặng hơn quốc nội); kết quả quốc tế đẩy điểm khu vực lên/xuống.
import { S, teamOvr } from './state.js';
import { compOrder } from './formats.js';

// điểm sức mạnh khu vực khởi điểm = Regional Strength Score thật của LoL Esports (cuối CKTG 2026); VCS ước lượng
const LEAGUE0 = { LPL: 1431, LCK: 1394, LEC: 1231, LCS: 1149, LCP: 1036, CBLOL: 959, VCS: 930 };
const W_TEAM = 0.8;

export function ensureGpr() {
  if (S.gpr && S.gpr.teams) return S.gpr;
  const g = { teams: {}, leagues: { ...LEAGUE0 }, snaps: [] };
  const byLg = {};
  for (const t of Object.values(S.teams)) (byLg[t.league] ??= []).push(t);
  for (const [lg, ts] of Object.entries(byLg)) {
    const avg = ts.reduce((s, t) => s + teamOvr(t), 0) / ts.length;
    for (const t of ts) g.teams[t.id] = Math.round((LEAGUE0[lg] || 1000) + (teamOvr(t) - avg) * 16);
  }
  S.gpr = g;
  return g;
}

export const powerScore = (tid) => {
  const g = ensureGpr();
  const lg = S.teams[tid]?.league;
  return Math.round(W_TEAM * (g.teams[tid] ?? 1100) + (1 - W_TEAM) * (g.leagues[lg] ?? 1000));
};

// hệ số K theo bối cảnh trận (mô phỏng theo bảng K của GPR)
function kFactor(comp, match) {
  const intl = comp.league === 'INTL';
  const finalNode = ['UF', 'LF', 'GF', 'F', 'SF1', 'SF2'].includes(match.node);
  if (intl) {
    if (comp.stage === 'playin') return 12;
    if (comp.stage === 'knockout' || (comp.key === 'msi' && finalNode)) return 36;
    return 20;
  }
  if (['playin', 'knights'].includes(comp.stage)) return 8;
  if (['playoffs', 'rtm', 'regional', 'promotion'].includes(comp.stage)) return 20;
  return 16;
}

// gọi khi một loạt đấu kết thúc
export function gprOnSeries(match) {
  const comp = S.comps[match.comp];
  if (!comp || !match.winner) return;
  const g = ensureGpr();
  const a = match.a, b = match.b;
  const pa = powerScore(a), pb = powerScore(b);
  const ea = 1 / (1 + 10 ** ((pb - pa) / 400));
  const sa = match.winner === a ? 1 : 0;
  // thắng đậm (2-0, 3-0) được thưởng thêm: phản ánh "game dominance"
  const need = Math.ceil(match.bo / 2);
  const margin = need > 1 ? 1 + 0.25 * (Math.abs(match.winsA - match.winsB) - 1) / (need - 1) : 1;
  const d = 0.8 * kFactor(comp, match) * margin * (sa - ea);
  g.teams[a] = (g.teams[a] ?? 1100) + d;
  g.teams[b] = (g.teams[b] ?? 1100) - d;
  const la = S.teams[a].league, lb = S.teams[b].league;
  if (la !== lb) { // trận liên khu vực: điểm khu vực thay đổi theo
    g.leagues[la] += d * 0.3;
    g.leagues[lb] -= d * 0.3;
  }
}

// mùa mới: điểm đội hồi về gần điểm khu vực (thay đổi đội hình, phong độ cũ ít ý nghĩa hơn)
export function gprNewSeason() {
  const g = ensureGpr();
  for (const t of Object.values(S.teams)) {
    const lg = g.leagues[t.league] ?? 1000;
    g.teams[t.id] = (g.teams[t.id] ?? lg) * 0.75 + lg * 0.25;
  }
  g.snaps = g.snaps.filter((s) => s.season >= S.season - 1);
}

// ảnh chụp bảng xếp hạng cuối mỗi giai đoạn (để hiện mũi tên tăng/giảm hạng)
export function gprSnapshot(phase) {
  const g = ensureGpr();
  const rows = gprTable();
  g.snaps.push({ season: S.season, phase, day: S.day, ranks: Object.fromEntries(rows.map((r) => [r.team, r.rank])), scores: Object.fromEntries(rows.map((r) => [r.team, r.score])) });
}

// thứ hạng của đội ở một giải quốc tế trong mùa (null nếu không dự)
function intlPlace(tid, keys) {
  const comps = keys.map((k) => S.comps[`${S.season}-INTL-${k}`]).filter(Boolean);
  if (!comps.length || !comps.some((c) => c.teams.includes(tid))) return null;
  const merged = [];
  for (const c of comps) for (const t of compOrder(c)) if (!merged.includes(t)) merged.push(t);
  const i = merged.indexOf(tid);
  return i < 0 ? null : i + 1;
}

export function gprTable(snapIdx = null) {
  const g = ensureGpr();
  const snap = snapIdx == null ? null : g.snaps[snapIdx];
  const wl = {};
  for (const c of Object.values(S.comps)) {
    if (!c.id.startsWith(`${S.season}-`)) continue;
    for (const m of c.matches) { // thắng-thua theo loạt đấu
      if (!m.done) continue;
      (wl[m.a] ??= [0, 0]); (wl[m.b] ??= [0, 0]);
      wl[m.winner][0]++; wl[m.winner === m.a ? m.b : m.a][1]++;
    }
  }
  const rows = Object.values(S.teams).map((t) => ({
    team: t.id, league: t.league,
    score: snap ? snap.scores[t.id] ?? powerScore(t.id) : powerScore(t.id),
    wl: wl[t.id] || [0, 0],
    intl: { fst: intlPlace(t.id, ['fst-ko', 'fst-a', 'fst-b']), msi: intlPlace(t.id, ['msi', 'msi-playin']), worlds: intlPlace(t.id, ['worlds-ko', 'worlds-swiss', 'worlds-playin']) },
  }));
  rows.sort((x, y) => y.score - x.score);
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1; });
  // so với ảnh chụp trước đó
  const prevIdx = snapIdx == null ? g.snaps.length - 1 : snapIdx - 1;
  const prev = g.snaps[prevIdx];
  for (const r of rows) r.delta = prev && prev.ranks[r.team] ? prev.ranks[r.team] - r.rank : 0;
  return rows;
}

export const leagueStrength = () => Object.entries(ensureGpr().leagues).map(([lg, v]) => ({ lg, v: Math.round(v) })).sort((a, b) => b.v - a.v);
