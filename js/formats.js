// Thể thức giải đấu mùa 2026 (theo Leaguepedia / LoL Esports):
// mỗi giải là một chuỗi "giai đoạn" (vòng tròn nhiều bảng, Swiss, nhánh loại kép có đặc cách, waterfall, gauntlet...).
import { DB } from './data.js';
import { S, teamOvr, addNews } from './state.js';
import { rand, shuffle } from './util.js';

export const PHASES = ['kickoff', 'fst', 'spring', 'msi', 'summer', 'worlds', 'offseason'];
// suất CKTG gốc; MSI: đội vô địch + khu vực á quân mỗi nơi thêm 1 suất
export const WORLDS_BASE = { LCK: 3, LPL: 3, LEC: 3, LCS: 3, LCP: 3, CBLOL: 2, VCS: 0 };
export const MSI_SLOTS = { LCK: 2, LPL: 2, LEC: 2, LCS: 2, LCP: 2, CBLOL: 1, VCS: 0 };
const BIG = ['LCK', 'LPL'];

// ---------------- trận & vòng tròn ----------------
let mid = 0;
export function makeMatch(compId, day, a, b, bo, round = 0) {
  const id = `${compId}#${++mid}_${Math.random().toString(36).slice(2, 6)}`;
  return { id, comp: compId, day, a, b, bo, round, winsA: 0, winsB: 0, games: [], done: false, winner: null, aBlueFirst: rand() < 0.5 };
}
export function roundRobin(teams, double) {
  const t = [...teams];
  if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    t.splice(1, 0, t.pop());
  }
  return double ? [...rounds, ...rounds.map((ps) => ps.map(([a, b]) => [b, a]))] : rounds;
}
const loser = (m) => (m.winner === m.a ? m.b : m.a);
const lastDay = (c) => Math.max(S.day, ...c.matches.map((m) => m.day));

// ---------------- bảng xếp hạng ----------------
// group: chỉ số bảng (null = tất cả). Thành tích mang sang (carry) từ giai đoạn trước được cộng vào.
export function standings(comp, groupIdx = null) {
  if (!comp) return [];
  const teams = groupIdx === null || !comp.groups ? comp.teams : comp.groups[groupIdx].teams;
  const rows = Object.fromEntries(teams.map((t) => [t, { team: t, w: 0, l: 0, gw: 0, gl: 0, streak: [] }]));
  const add = (m) => {
    if (!m.done) return;
    for (const [t, wins, losses] of [[m.a, m.winsA, m.winsB], [m.b, m.winsB, m.winsA]]) {
      const r = rows[t];
      if (!r) continue;
      const won = m.winner === t;
      r[won ? 'w' : 'l']++; r.gw += wins; r.gl += losses; r.streak.push(won ? 'W' : 'L');
    }
  };
  if (comp.carry && S.comps[comp.carry]) S.comps[comp.carry].matches.forEach(add);
  for (const m of comp.matches) if (groupIdx === null || m.group == null || m.group === groupIdx || comp.cross) add(m);
  return Object.values(rows).sort((x, y) => y.w - x.w || (y.gw - y.gl) - (x.gw - x.gl) || teamOvr(S.teams[y.team]) - teamOvr(S.teams[x.team]));
}

// thứ hạng cuối của một giai đoạn
export function compOrder(c) {
  if (!c) return [];
  if (c.type === 'league') {
    if (c.groups && c.groups.length > 1 && !c.cross) return c.groups.flatMap((_, gi) => standings(c, gi).map((r) => r.team));
    if (c.cross) return c.groups.flatMap((_, gi) => standings(c, gi).map((r) => r.team));
    return standings(c).map((r) => r.team);
  }
  if (c.type === 'swiss') return [...c.teams].sort((a, b) => c.rec[b][0] - c.rec[a][0] || c.rec[a][1] - c.rec[b][1] || teamOvr(S.teams[b]) - teamOvr(S.teams[a]));
  // nhánh đấu: theo hạng đã xác định, đội chưa bị loại xếp trên
  const place = { ...c.place };
  return [...c.teams].sort((a, b) => (place[a] ?? 0) - (place[b] ?? 0) || c.teams.indexOf(a) - c.teams.indexOf(b));
}
export const champOf = (c) => (c && c.done ? compOrder(c)[0] : null);
export const runnerUp = (c) => (c && c.done ? compOrder(c)[1] : null);

// ---------------- mẫu nhánh đấu ----------------
// a/b: số hạt giống (1-based) hoặc 'W:key' / 'L:key'. out: hạng của đội thua; win: hạng của đội thắng (nếu kết thúc ở đây).
// col: cột hiển thị; lo: nhánh thua
const TPL = {
  // 6 đội, hạt giống 1-2 đặc cách vào vòng 2 nhánh thắng (LCK, LCS Summer, CBLOL)
  de6byes: [
    { k: 'U1a', a: 3, b: 6, col: 0 }, { k: 'U1b', a: 4, b: 5, col: 0 },
    { k: 'U2a', a: 1, b: 'W:U1b', col: 1 }, { k: 'U2b', a: 2, b: 'W:U1a', col: 1 },
    { k: 'L1', a: 'L:U1a', b: 'L:U1b', out: 6, col: 1, lo: 1 },
    { k: 'L2', a: 'W:L1', b: 'L:U2b', out: 5, col: 2, lo: 1 },
    { k: 'L3', a: 'W:L2', b: 'L:U2a', out: 4, col: 3, lo: 1 },
    { k: 'UF', a: 'W:U2a', b: 'W:U2b', col: 2 },
    { k: 'LF', a: 'W:L3', b: 'L:UF', out: 3, col: 4, lo: 1 },
    { k: 'GF', a: 'W:UF', b: 'W:LF', out: 2, win: 1, col: 5 },
  ],
  // LCP: hạt giống 3-6 thua ở vòng 1 là bị loại
  de6lcp: [
    { k: 'U1a', a: 3, b: 6, out: 5, col: 0 }, { k: 'U1b', a: 4, b: 5, out: 5, col: 0 },
    { k: 'U2a', a: 1, b: 'W:U1b', col: 1 }, { k: 'U2b', a: 2, b: 'W:U1a', col: 1 },
    { k: 'UF', a: 'W:U2a', b: 'W:U2b', col: 2 },
    { k: 'L1', a: 'L:U2a', b: 'L:U2b', out: 4, col: 2, lo: 1 },
    { k: 'LF', a: 'W:L1', b: 'L:UF', out: 3, col: 3, lo: 1 },
    { k: 'GF', a: 'W:UF', b: 'W:LF', out: 2, win: 1, col: 4 },
  ],
  // 1-4 nhánh thắng, 5-6 bắt đầu ở nhánh thua (LEC, LCS Spring)
  de6top4: [
    { k: 'U1a', a: 1, b: 4, col: 0 }, { k: 'U1b', a: 2, b: 3, col: 0 },
    { k: 'L1', a: 5, b: 6, out: 6, col: 0, lo: 1 },
    { k: 'L2', a: 'W:L1', b: 'L:U1a', out: 5, col: 1, lo: 1 },
    { k: 'L3', a: 'W:L2', b: 'L:U1b', out: 4, col: 2, lo: 1 },
    { k: 'UF', a: 'W:U1a', b: 'W:U1b', col: 1 },
    { k: 'LF', a: 'W:L3', b: 'L:UF', out: 3, col: 3, lo: 1 },
    { k: 'GF', a: 'W:UF', b: 'W:LF', out: 2, win: 1, col: 4 },
  ],
  de8: [
    { k: 'U1a', a: 1, b: 8, col: 0 }, { k: 'U1b', a: 4, b: 5, col: 0 }, { k: 'U1c', a: 2, b: 7, col: 0 }, { k: 'U1d', a: 3, b: 6, col: 0 },
    { k: 'U2a', a: 'W:U1a', b: 'W:U1b', col: 1 }, { k: 'U2b', a: 'W:U1c', b: 'W:U1d', col: 1 },
    { k: 'L1a', a: 'L:U1a', b: 'L:U1b', out: 7, col: 1, lo: 1 }, { k: 'L1b', a: 'L:U1c', b: 'L:U1d', out: 7, col: 1, lo: 1 },
    { k: 'L2a', a: 'W:L1a', b: 'L:U2b', out: 5, col: 2, lo: 1 }, { k: 'L2b', a: 'W:L1b', b: 'L:U2a', out: 5, col: 2, lo: 1 },
    { k: 'UF', a: 'W:U2a', b: 'W:U2b', col: 2 },
    { k: 'L3', a: 'W:L2a', b: 'W:L2b', out: 4, col: 3, lo: 1 },
    { k: 'LF', a: 'W:L3', b: 'L:UF', out: 3, col: 4, lo: 1 },
    { k: 'GF', a: 'W:UF', b: 'W:LF', out: 2, win: 1, col: 5 },
  ],
  // LPL: Ascend 1-2 đặc cách vào vòng 2, 3-6 vòng 1, 2 đội từ Knight's Road vào nhánh thua
  de8lpl: [
    { k: 'U1a', a: 3, b: 6, col: 0 }, { k: 'U1b', a: 4, b: 5, col: 0 },
    { k: 'L1a', a: 7, b: 'L:U1a', out: 7, col: 1, lo: 1 }, { k: 'L1b', a: 8, b: 'L:U1b', out: 7, col: 1, lo: 1 },
    { k: 'U2a', a: 1, b: 'W:U1b', col: 1 }, { k: 'U2b', a: 2, b: 'W:U1a', col: 1 },
    { k: 'L2a', a: 'W:L1a', b: 'L:U2b', out: 5, col: 2, lo: 1 }, { k: 'L2b', a: 'W:L1b', b: 'L:U2a', out: 5, col: 2, lo: 1 },
    { k: 'UF', a: 'W:U2a', b: 'W:U2b', col: 2 },
    { k: 'L3', a: 'W:L2a', b: 'W:L2b', out: 4, col: 3, lo: 1 },
    { k: 'LF', a: 'W:L3', b: 'L:UF', out: 3, col: 4, lo: 1 },
    { k: 'GF', a: 'W:UF', b: 'W:LF', out: 2, win: 1, col: 5 },
  ],
  de4: [
    { k: 'U1a', a: 1, b: 4, col: 0 }, { k: 'U1b', a: 2, b: 3, col: 0 },
    { k: 'UF', a: 'W:U1a', b: 'W:U1b', col: 1 },
    { k: 'L1', a: 'L:U1a', b: 'L:U1b', out: 4, col: 1, lo: 1 },
    { k: 'LF', a: 'W:L1', b: 'L:UF', out: 3, col: 2, lo: 1 },
    { k: 'GF', a: 'W:UF', b: 'W:LF', out: 2, win: 1, col: 3 },
  ],
  // bảng đấu First Stand: loại kép 4 đội, 2 đội đi tiếp
  gsl: [
    { k: 'U1a', a: 1, b: 4, col: 0 }, { k: 'U1b', a: 2, b: 3, col: 0 },
    { k: 'UF', a: 'W:U1a', b: 'W:U1b', win: 1, col: 1 },
    { k: 'L1', a: 'L:U1a', b: 'L:U1b', out: 4, col: 1, lo: 1 },
    { k: 'DM', a: 'L:UF', b: 'W:L1', out: 3, win: 2, col: 2, lo: 1 },
  ],
  se4: [
    { k: 'SF1', a: 1, b: 4, out: 3, col: 0 }, { k: 'SF2', a: 2, b: 3, out: 3, col: 0 },
    { k: 'F', a: 'W:SF1', b: 'W:SF2', out: 2, win: 1, col: 1 },
  ],
  se8: [
    { k: 'Q1', a: 1, b: 8, out: 5, col: 0 }, { k: 'Q2', a: 4, b: 5, out: 5, col: 0 }, { k: 'Q3', a: 2, b: 7, out: 5, col: 0 }, { k: 'Q4', a: 3, b: 6, out: 5, col: 0 },
    { k: 'SF1', a: 'W:Q1', b: 'W:Q2', out: 3, col: 1 }, { k: 'SF2', a: 'W:Q3', b: 'W:Q4', out: 3, col: 1 },
    { k: 'F', a: 'W:SF1', b: 'W:SF2', out: 2, win: 1, col: 2 },
  ],
  // waterfall (LCK Play-In, LPL Regional Finals): thắng trận 1v2 là có vé, 3v4 thua là bị loại
  waterfall: [
    { k: 'R1a', a: 1, b: 2, win: 1, col: 0 }, { k: 'R1b', a: 3, b: 4, out: 4, col: 0, lo: 1 },
    { k: 'R2', a: 'L:R1a', b: 'W:R1b', win: 2, out: 3, col: 1 },
  ],
  // Road to MSI: 1v2 nhánh trên; 3-6 leo thang (King of the Hill)
  gauntlet6: [
    { k: 'U', a: 1, b: 2, win: 1, col: 0 },
    { k: 'G1', a: 5, b: 6, out: 6, col: 0, lo: 1 }, { k: 'G2', a: 4, b: 'W:G1', out: 5, col: 1, lo: 1 },
    { k: 'G3', a: 3, b: 'W:G2', out: 4, col: 2, lo: 1 },
    { k: 'F', a: 'L:U', b: 'W:G3', win: 2, out: 3, col: 3 },
  ],
  single: [{ k: 'F', a: 1, b: 2, out: 2, win: 1, col: 0 }],
};
const pairsTpl = (n) => Array.from({ length: n }, (_, i) => ({ k: 'P' + (i + 1), a: i + 1, b: 2 * n - i, win: i + 1, out: n + i + 1, col: 0 }));

// ---------------- tạo giai đoạn ----------------
function register(c) {
  S.comps[c.id] = c;
  if (!S.phaseComps.includes(c.id)) S.phaseComps.push(c.id);
  return c;
}
function base(lg, key, name, stage, extra = {}) {
  return { id: `${S.season}-${lg}-${key}`, key, league: lg, logo: extra.logo || lg, name, stage, phase: S.phase, matches: [], done: false, ...extra };
}
// vòng tròn (một hoặc nhiều bảng)
function mkLeague(lg, key, name, stage, groups, { bo = 3, start = S.day, carry = null, next = null, trophy = null } = {}) {
  const c = base(lg, key, name, stage, { type: 'league', bo, carry, next, trophy });
  c.groups = groups.map((g) => ({ name: g.name || null, teams: g.teams, double: !!g.double }));
  c.teams = groups.flatMap((g) => g.teams);
  c.groups.forEach((g, gi) => {
    roundRobin(shuffle(g.teams), g.double).forEach((pairs, r) => pairs.forEach(([a, b]) => {
      const m = makeMatch(c.id, start + r, a, b, bo, r);
      m.group = gi;
      c.matches.push(m);
    }));
  });
  return register(c);
}
// nhánh đấu từ mẫu
function mkBracket(lg, key, name, stage, tpl, seeds, { bo = 5, start = S.day, next = null, trophy = null, boOf = null, logo } = {}) {
  const nodes = (typeof tpl === 'string' ? TPL[tpl] : tpl).map((n) => ({ ...n }));
  const c = base(lg, key, name, stage, { type: 'bracket', bo, next, trophy, logo, nodes, seeds: [...seeds], teams: [...seeds], start, mk: {}, place: {} });
  if (boOf) for (const n of c.nodes) if (boOf[n.k]) n.bo = boOf[n.k];
  register(c);
  updateBracket(c);
  return c;
}
function src(c, s) {
  if (typeof s === 'number') return c.seeds[s - 1] ?? null;
  const [t, k] = s.split(':');
  const m = c.matches.find((x) => x.id === c.mk[k]);
  if (!m || !m.done) return null;
  return t === 'W' ? m.winner : loser(m);
}
function srcDay(c, s) {
  if (typeof s === 'number') return c.start;
  const m = c.matches.find((x) => x.id === c.mk[s.split(':')[1]]);
  return m ? m.day + 1 : c.start;
}
function updateBracket(c) {
  for (const n of c.nodes) {
    if (c.mk[n.k]) continue;
    const a = src(c, n.a), b = src(c, n.b);
    if (!a || !b) continue;
    const m = makeMatch(c.id, Math.max(srcDay(c, n.a), srcDay(c, n.b), S.day), a, b, n.bo || c.bo, n.col);
    m.node = n.k;
    c.matches.push(m);
    c.mk[n.k] = m.id;
  }
  for (const n of c.nodes) {
    const m = c.matches.find((x) => x.id === c.mk[n.k]);
    if (!m || !m.done) continue;
    if (n.out) c.place[loser(m)] = n.out;
    if (n.win) c.place[m.winner] = n.win;
  }
  if (c.nodes.every((n) => { const m = c.matches.find((x) => x.id === c.mk[n.k]); return m && m.done; })) c.done = true;
}
// Swiss: thắng 3 đi tiếp, thua 3 bị loại; trận quyết định (đi tiếp/bị loại) dùng boDecider
function mkSwiss(lg, key, name, stage, seeds, { bo = 1, boDecider = 3, start = S.day, next = null, logo, region = null } = {}) {
  const c = base(lg, key, name, stage, { type: 'swiss', bo, boDecider, next, logo, teams: [...seeds], rec: Object.fromEntries(seeds.map((t) => [t, [0, 0]])), met: {}, round: 0, region });
  register(c);
  swissRound(c, start);
  return c;
}
function swissRound(c, day) {
  const active = c.teams.filter((t) => c.rec[t][0] < 3 && c.rec[t][1] < 3);
  if (!active.length) { c.done = true; return; }
  const met = (a, b) => (c.met[a] || []).includes(b);
  const sameRegion = (a, b) => c.region && c.region[a] === c.region[b];
  const pairs = [];
  if (c.round === 0) {
    // vòng 1: nửa trên gặp nửa dưới, tránh cùng khu vực
    const n = active.length / 2;
    const top = active.slice(0, n);
    let bot = shuffle(active.slice(n));
    for (let tries = 0; tries < 200 && top.some((t, i) => sameRegion(t, bot[i])); tries++) bot = shuffle(bot);
    top.forEach((t, i) => pairs.push([t, bot[i]]));
  } else {
    const byRec = {};
    for (const t of active) (byRec[c.rec[t].join('-')] ??= []).push(t);
    let carry = [];
    for (const key of Object.keys(byRec).sort((x, y) => (+y.split('-')[0] - +x.split('-')[0]) || (+x.split('-')[1] - +y.split('-')[1]))) {
      let pool = [...carry, ...byRec[key]];
      carry = [];
      if (pool.length % 2) carry.push(pool.pop());
      let best = null;
      for (let tries = 0; tries < 60; tries++) {
        const sh = shuffle(pool);
        const ps = [];
        for (let i = 0; i < sh.length; i += 2) ps.push([sh[i], sh[i + 1]]);
        const bad = ps.filter(([a, b]) => met(a, b)).length;
        if (!best || bad < best.bad) best = { ps, bad };
        if (!bad) break;
      }
      pairs.push(...(best ? best.ps : []));
    }
  }
  c.round++;
  for (const [a, b] of pairs) {
    const decisive = [a, b].some((t) => c.rec[t][0] === 2 || c.rec[t][1] === 2);
    const m = makeMatch(c.id, day, a, b, decisive ? c.boDecider : c.bo, c.round - 1);
    m.swiss = c.rec[a].join('-');
    c.matches.push(m);
    (c.met[a] ??= []).push(b); (c.met[b] ??= []).push(a);
  }
}
function updateSwiss(c) {
  const cur = c.matches.filter((m) => m.round === c.round - 1);
  if (!cur.every((m) => m.done)) return;
  for (const m of cur) {
    if (m.counted) continue;
    m.counted = true;
    c.rec[m.winner][0]++; c.rec[loser(m)][1]++;
  }
  swissRound(c, Math.max(...cur.map((m) => m.day)) + 1);
}

// ---------------- tiện ích chọn đội ----------------
const teamsOf = (lg) => Object.values(S.teams).filter((t) => t.league === lg).map((t) => t.id);
const byOvr = (ids) => [...ids].sort((a, b) => teamOvr(S.teams[b]) - teamOvr(S.teams[a]));
const C = (lg, key) => S.comps[`${S.season}-${lg}-${key}`];
// thứ hạng hợp nhất: nhánh đấu trước, sau đó các giai đoạn trước
export function mergedOrder(...comps) {
  const out = [];
  for (const c of comps) for (const t of compOrder(c)) if (!out.includes(t)) out.push(t);
  return out;
}
const nextStart = (c) => lastDay(c) + 1;
const NAME = { LCK: 'LCK', LPL: 'LPL', LEC: 'LEC', LCS: 'LCS', LCP: 'LCP', CBLOL: 'CBLOL', VCS: 'VCS' };

// ---------------- các giai đoạn theo từng giải ----------------
// Mỗi hàm trả về giai đoạn mới (hoặc null nếu chưa đủ điều kiện). Tên hàm = c.next của giai đoạn trước.
const STAGES = {
  // ===== LCK =====
  lckCupGroups() {
    // Baron vs Elder: mỗi đội gặp cả 5 đội bảng kia một lần (Bo3); "Super Week" cùng hạng hai bảng: Bo5, thắng được 2 điểm
    const ids = byOvr(teamsOf('LCK'));
    const A = [], B = [];
    ids.forEach((t, i) => ((Math.floor(i / 2) + i) % 2 ? B : A).push(t));
    const c = base('LCK', 'cup-groups', 'LCK Cup', 'groups', { type: 'league', bo: 3, cross: true, next: 'lckCupPlayin' });
    c.groups = [{ name: 'Baron', teams: A }, { name: 'Elder', teams: B }];
    c.teams = [...A, ...B];
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < 5; i++) {
        const j = (i + r + 1) % 5; // vòng cuối (j === i) là Super Week
        const sup = j === i;
        const m = makeMatch(c.id, S.day + r, A[i], B[j], sup ? 5 : 3, r);
        m.group = 0; m.superWeek = sup;
        c.matches.push(m);
      }
    }
    return register(c);
  },
  lckCupPlayin(prev) {
    const pts = [0, 0];
    for (const m of prev.matches) if (m.done) pts[prev.groups[0].teams.includes(m.winner) ? 0 : 1] += m.superWeek ? 2 : 1;
    const win = pts[0] >= pts[1] ? 0 : 1;
    prev.winnersGroup = win;
    const W = standings(prev, win).map((r) => r.team), L = standings(prev, 1 - win).map((r) => r.team);
    prev.direct = [W[0], W[1], L[0]];
    const pin = [...W.slice(2), ...L.slice(1, 4)];
    const seeded = pin.sort((a, b) => standings(prev).find((r) => r.team === b).w - standings(prev).find((r) => r.team === a).w);
    return mkBracket('LCK', 'cup-playin', 'LCK Cup', 'playin', pairsTpl(3), seeded, { bo: 3, start: nextStart(prev), next: 'lckCupPlayoffs' });
  },
  lckCupPlayoffs(prev) {
    const g = C('LCK', 'cup-groups');
    const q = compOrder(prev).slice(0, 3);
    return mkBracket('LCK', 'cup-po', 'LCK Cup', 'playoffs', 'de6byes', [...g.direct, ...q], { start: nextStart(prev), trophy: { tier: 'cup', title: 'LCK Cup' } });
  },
  lckR12() {
    return mkLeague('LCK', 'r12', 'LCK', 'r12', [{ teams: teamsOf('LCK'), double: true }], { next: 'lckRTM' });
  },
  lckRTM(prev) {
    return mkBracket('LCK', 'rtm', 'LCK', 'rtm', 'gauntlet6', compOrder(prev).slice(0, 6), { start: nextStart(prev) });
  },
  lckR34() {
    const r12 = C('LCK', 'r12');
    const o = compOrder(r12);
    return mkLeague('LCK', 'r34', 'LCK', 'r34', [{ name: 'Legend', teams: o.slice(0, 5), double: true }, { name: 'Rise', teams: o.slice(5), double: true }], { carry: r12.id, next: 'lckPlayin' });
  },
  lckPlayin(prev) {
    const L = standings(prev, 0).map((r) => r.team), R = standings(prev, 1).map((r) => r.team);
    prev.direct = L.slice(0, 4);
    return mkBracket('LCK', 'playin', 'LCK', 'playin', 'waterfall', [L[4], R[0], R[1], R[2]], { start: nextStart(prev), next: 'lckPlayoffs' });
  },
  lckPlayoffs(prev) {
    const q = compOrder(prev).slice(0, 2);
    return mkBracket('LCK', 'po', 'LCK', 'playoffs', 'de6byes', [...C('LCK', 'r34').direct, ...q], { start: nextStart(prev), trophy: { tier: 'league', title: 'LCK' } });
  },

  // ===== LPL (12 đội: Ascend 8 / Nirvana 4) =====
  lplS1() { return lplSplit('s1', byOvr(teamsOf('LPL')), true, 'lplKnights1'); },
  lplKnights1(prev) { return lplKnights('s1', prev, 'lplS1PO'); },
  lplS1PO(prev) { return lplGF('s1', prev, { tier: 'cup', title: 'LPL Split 1' }); },
  lplS2() {
    const o = mergedOrder(C('LPL', 's1-po'), C('LPL', 's1-knights'), C('LPL', 's1'));
    const c = mkLeague('LPL', 's2', 'LPL Split 2', 'regular', [{ name: 'Ascend', teams: o.slice(0, 8), double: true }, { name: 'Nirvana', teams: o.slice(8), double: false }], { next: 'lplS2Playin' });
    return c;
  },
  lplS2Playin(prev) {
    const A = standings(prev, 0).map((r) => r.team), N = standings(prev, 1).map((r) => r.team);
    prev.direct = A.slice(0, 4);
    return mkBracket('LPL', 's2-playin', 'LPL Split 2', 'playin', pairsTpl(4), [A[4], A[5], A[6], A[7], N[3], N[2], N[1], N[0]], { start: nextStart(prev), next: 'lplS2PO' });
  },
  lplS2PO(prev) {
    const q = compOrder(prev).slice(0, 4);
    return mkBracket('LPL', 's2-po', 'LPL Split 2', 'playoffs', 'de8', [...C('LPL', 's2').direct, ...q], { start: nextStart(prev), trophy: { tier: 'league', title: 'LPL Split 2' } });
  },
  lplS3() { return lplSplit('s3', mergedOrder(C('LPL', 's2-po'), C('LPL', 's2-playin'), C('LPL', 's2')), true, 'lplKnights3'); },
  lplKnights3(prev) { return lplKnights('s3', prev, 'lplGF'); },
  lplGF(prev) { return lplGF('s3', prev, { tier: 'league', title: 'LPL' }, 'lplRegional'); },
  lplRegional(prev) {
    // Regional Finals: 4 đội nhiều điểm hệ thống nhất (trừ 2 đội vào chung kết) đá waterfall
    const top2 = compOrder(prev).slice(0, 2);
    const pts = lplPoints();
    const seeds = Object.keys(pts).filter((t) => !top2.includes(t)).sort((a, b) => pts[b] - pts[a]).slice(0, 4);
    return mkBracket('LPL', 'regional', 'LPL', 'regional', 'waterfall', seeds, { start: nextStart(prev) });
  },

  // ===== LEC =====
  lecVersus() { return mkLeague('LEC', 'versus', 'LEC Versus', 'regular', [{ teams: teamsOf('LEC') }], { bo: 1, next: 'lecVersusPO' }); },
  lecVersusPO(prev) { return mkBracket('LEC', 'versus-po', 'LEC Versus', 'playoffs', 'de8', compOrder(prev).slice(0, 8), { bo: 3, boOf: { GF: 5, LF: 5 }, start: nextStart(prev), trophy: { tier: 'cup', title: 'LEC Versus' } }); },
  lecSpring() { return mkLeague('LEC', 'spring', 'LEC Spring', 'regular', [{ teams: teamsOf('LEC') }], { next: 'lecSpringPO' }); },
  lecSpringPO(prev) { return mkBracket('LEC', 'spring-po', 'LEC Spring', 'playoffs', 'de6top4', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'league', title: 'LEC Spring' } }); },
  lecSummer() { return mkLeague('LEC', 'summer', 'LEC Summer', 'regular', [{ teams: teamsOf('LEC') }], { next: 'lecSummerPO' }); },
  lecSummerPO(prev) { return mkBracket('LEC', 'summer-po', 'LEC Summer', 'playoffs', 'de6top4', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'league', title: 'LEC Summer' } }); },

  // ===== LCS =====
  lcsLockin() { return mkSwiss('LCS', 'lockin', 'LCS Lock-In', 'swiss', byOvr(teamsOf('LCS')), { bo: 3, boDecider: 3, next: 'lcsLockinPO' }); },
  lcsLockinPO(prev) { return mkBracket('LCS', 'lockin-po', 'LCS Lock-In', 'playoffs', 'de6byes', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'cup', title: 'LCS Lock-In' } }); },
  lcsSpring() { return mkLeague('LCS', 'spring', 'LCS Spring', 'regular', [{ teams: teamsOf('LCS') }], { next: 'lcsSpringPO' }); },
  lcsSpringPO(prev) { return mkBracket('LCS', 'spring-po', 'LCS Spring', 'playoffs', 'de6top4', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'league', title: 'LCS Spring' } }); },
  lcsSummer() { return mkLeague('LCS', 'summer', 'LCS Summer', 'regular', [{ teams: teamsOf('LCS') }], { next: 'lcsSummerPO' }); },
  lcsSummerPO(prev) { return mkBracket('LCS', 'summer-po', 'LCS Summer', 'playoffs', 'de6byes', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'league', title: 'LCS Summer' } }); },

  // ===== LCP =====
  lcpS1() { return mkLeague('LCP', 's1', 'LCP Split 1', 'regular', [{ teams: teamsOf('LCP') }], { next: 'lcpS1PO' }); },
  lcpS1PO(prev) { return mkBracket('LCP', 's1-po', 'LCP Split 1', 'playoffs', 'de6lcp', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'cup', title: 'LCP Split 1' } }); },
  lcpS2() { return mkLeague('LCP', 's2', 'LCP Split 2', 'regular', [{ teams: teamsOf('LCP') }], { next: 'lcpS2PO' }); },
  lcpS2PO(prev) { return mkBracket('LCP', 's2-po', 'LCP Split 2', 'playoffs', 'de6lcp', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'league', title: 'LCP Split 2' } }); },
  lcpS3() { return mkSwiss('LCP', 's3', 'LCP Split 3', 'swiss', mergedOrder(C('LCP', 's2-po'), C('LCP', 's2')), { bo: 3, boDecider: 5, next: 'lcpS3PO' }); },
  lcpS3PO(prev) { return mkBracket('LCP', 's3-po', 'LCP Split 3', 'playoffs', 'de4', compOrder(prev).slice(0, 4), { start: nextStart(prev), trophy: { tier: 'league', title: 'LCP' } }); },

  // ===== CBLOL =====
  cblolCup() { return mkLeague('CBLOL', 'cup', 'CBLOL Cup', 'regular', [{ teams: teamsOf('CBLOL') }], { next: 'cblolCupPO' }); },
  cblolCupPO(prev) { return mkBracket('CBLOL', 'cup-po', 'CBLOL Cup', 'playoffs', 'de6byes', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'cup', title: 'CBLOL Cup' } }); },
  cblolS1() { return mkLeague('CBLOL', 's1', 'CBLOL Split 1', 'regular', [{ teams: teamsOf('CBLOL') }], { next: 'cblolS1PO' }); },
  cblolS1PO(prev) { return mkBracket('CBLOL', 's1-po', 'CBLOL Split 1', 'playoffs', 'de6byes', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'league', title: 'CBLOL Split 1' } }); },
  cblolS2() { return mkLeague('CBLOL', 's2', 'CBLOL Split 2', 'regular', [{ teams: teamsOf('CBLOL') }], { next: 'cblolS2PO' }); },
  cblolS2PO(prev) { return mkBracket('CBLOL', 's2-po', 'CBLOL Split 2', 'playoffs', 'de6byes', compOrder(prev).slice(0, 6), { start: nextStart(prev), trophy: { tier: 'league', title: 'CBLOL Split 2' } }); },

  // ===== VCS (giải quốc nội, nhà vô địch Hè đá thăng hạng LCP) =====
  vcsSpring() { return mkLeague('VCS', 'spring', 'VCS Spring', 'regular', [{ teams: teamsOf('VCS') }], { next: 'vcsSpringPO' }); },
  vcsSpringPO(prev) { return mkBracket('VCS', 'spring-po', 'VCS Spring', 'playoffs', 'de4', compOrder(prev).slice(0, 4), { start: nextStart(prev), trophy: { tier: 'league', title: 'VCS Spring' } }); },
  vcsSummer() { return mkLeague('VCS', 'summer', 'VCS Summer', 'regular', [{ teams: teamsOf('VCS') }], { next: 'vcsSummerPO' }); },
  vcsSummerPO(prev) { return mkBracket('VCS', 'summer-po', 'VCS Summer', 'playoffs', 'de4', compOrder(prev).slice(0, 4), { start: nextStart(prev), trophy: { tier: 'league', title: 'VCS Summer' } }); },

  // ===== First Stand: 8 đội, 2 bảng loại kép 4 đội → bán kết/chung kết =====
  fstGroups() {
    const one = (lg, key, i) => compOrder(C(lg, key))[i];
    const p1 = [one('LCK', 'cup-po', 0), one('LPL', 's1-po', 0)];
    const p2 = [one('LCK', 'cup-po', 1), one('LPL', 's1-po', 1), one('LEC', 'versus-po', 0), one('LCP', 's1-po', 0)];
    const p3 = [one('LCS', 'lockin-po', 0), one('CBLOL', 'cup-po', 0)];
    const reg = (t) => S.teams[t].league;
    let A, B;
    for (let tries = 0; tries < 300; tries++) {
      const q = shuffle(p2), r = shuffle(p3), s = shuffle(p1);
      A = [s[0], q[0], q[1], r[0]]; B = [s[1], q[2], q[3], r[1]];
      if (new Set(A.map(reg)).size === 4 && new Set(B.map(reg)).size === 4) break;
    }
    qualifiedNews([...A, ...B], 'First Stand');
    mkBracket('INTL', 'fst-a', 'First Stand', 'groupA', 'gsl', A, { logo: 'FST', next: 'fstKO' });
    return mkBracket('INTL', 'fst-b', 'First Stand', 'groupB', 'gsl', B, { logo: 'FST', next: 'fstKO' });
  },
  fstKO() {
    const a = C('INTL', 'fst-a'), b = C('INTL', 'fst-b');
    if (!a.done || !b.done || C('INTL', 'fst-ko')) return null;
    const oa = compOrder(a), ob = compOrder(b);
    return mkBracket('INTL', 'fst-ko', 'First Stand', 'knockout', 'se4', [oa[0], ob[0], oa[1], ob[1]], { logo: 'FST', start: Math.max(nextStart(a), nextStart(b)), trophy: { tier: 'fst', title: 'First Stand' } });
  },

  // ===== MSI: Play-In 4 đội (loại kép, 1 suất) → Bracket 8 đội loại kép =====
  msiPlayin() {
    const q = msiQualifiers();
    const bonus = fstBestBig();
    const direct = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL'].map((lg) => q[lg][0]);
    direct.splice(2, 0, q[bonus][1]);
    const pin = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP'].filter((lg) => lg !== bonus).map((lg) => q[lg][1]);
    S.msiDirect = direct;
    qualifiedNews([...direct, ...pin], 'MSI');
    return mkBracket('INTL', 'msi-playin', 'MSI', 'playin', 'de4', byOvr(pin), { logo: 'MSI', next: 'msiBracket' });
  },
  msiBracket(prev) {
    return mkBracket('INTL', 'msi', 'MSI', 'bracket', 'de8', [...S.msiDirect, compOrder(prev)[0]], { logo: 'MSI', start: nextStart(prev), trophy: { tier: 'msi', title: 'MSI' } });
  },

  // ===== CKTG: Play-In 4 đội → Swiss 16 đội (5 vòng) → Tứ kết loại trực tiếp =====
  worldsPlayin() {
    const q = worldsQualifiers();
    S.worldsQ = q;
    const all = Object.values(q.byLeague).flat();
    qualifiedNews(all, 'Worlds');
    // suất cuối của LEC, LCS, LCP, CBLOL đá Play-In
    const pin = ['LEC', 'LCS', 'LCP', 'CBLOL'].map((lg) => q.byLeague[lg][q.byLeague[lg].length - 1]).filter(Boolean);
    S.worldsSwiss = all.filter((t) => !pin.includes(t));
    // song song: trận thăng hạng LCP (nhà vô địch VCS Hè vs đội cuối bảng LCP)
    promotion();
    return mkBracket('INTL', 'worlds-playin', 'Worlds', 'playin', 'de4', byOvr(pin), { logo: 'WORLDS', next: 'worldsSwiss' });
  },
  worldsSwiss(prev) {
    const q = S.worldsQ;
    const teams = [...S.worldsSwiss, compOrder(prev)[0]];
    // hạt giống: đội hạt giống 1 các khu vực mạnh ở nửa trên
    const seedRank = (t) => { const lg = S.teams[t].league; return q.byLeague[lg].indexOf(t) * 10 + ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL'].indexOf(lg); };
    const ordered = [...teams].sort((a, b) => seedRank(a) - seedRank(b));
    const region = Object.fromEntries(teams.map((t) => [t, S.teams[t].league]));
    return mkSwiss('INTL', 'worlds-swiss', 'Worlds', 'swiss', ordered, { bo: 1, boDecider: 3, logo: 'WORLDS', start: nextStart(prev), next: 'worldsKO', region });
  },
  worldsKO(prev) {
    const adv = compOrder(prev).slice(0, 8);
    return mkBracket('INTL', 'worlds-ko', 'Worlds', 'knockout', 'se8', adv, { logo: 'WORLDS', start: nextStart(prev), trophy: { tier: 'worlds', title: 'Worlds' } });
  },
};

function lplSplit(key, order, ascendDouble, next) {
  return mkLeague('LPL', key, `LPL ${key === 's1' ? 'Split 1' : 'Split 3'}`, 'regular', [{ name: 'Ascend', teams: order.slice(0, 8), double: ascendDouble }, { name: 'Nirvana', teams: order.slice(8), double: true }], { next });
}
function lplKnights(key, prev, next) {
  const A = standings(prev, 0).map((r) => r.team), N = standings(prev, 1).map((r) => r.team);
  prev.direct = A.slice(0, 6);
  return mkBracket('LPL', `${key}-knights`, `LPL ${key === 's1' ? 'Split 1' : 'Split 3'}`, 'knights', pairsTpl(2), [A[6], A[7], N[1], N[0]], { start: nextStart(prev), next });
}
function lplGF(key, prev, trophy, next = null) {
  const sp = C('LPL', key);
  const q = compOrder(prev).slice(0, 2);
  return mkBracket('LPL', `${key}-po`, key === 's1' ? 'LPL Split 1' : 'LPL Grand Finals', 'playoffs', 'de8lpl', [...sp.direct, ...q], { start: nextStart(prev), trophy, next });
}
// điểm hệ thống LPL (xếp hạng cả 3 split)
const PTS = [100, 80, 60, 50, 40, 40, 30, 30, 20, 20, 10, 10];
function lplPoints() {
  const pts = {};
  const add = (order, mult) => order.forEach((t, i) => { pts[t] = (pts[t] || 0) + (PTS[i] || 0) * mult; });
  add(mergedOrder(C('LPL', 's1-po'), C('LPL', 's1-knights'), C('LPL', 's1')), 1);
  add(mergedOrder(C('LPL', 's2-po'), C('LPL', 's2-playin'), C('LPL', 's2')), 1.5);
  add(mergedOrder(C('LPL', 's3-po'), C('LPL', 's3-knights'), C('LPL', 's3')), 2);
  return pts;
}

// đội dự MSI theo giải
function msiQualifiers() {
  const ord = {
    LCK: compOrder(C('LCK', 'rtm')),
    LPL: compOrder(C('LPL', 's2-po')),
    LEC: compOrder(C('LEC', 'spring-po')),
    LCS: compOrder(C('LCS', 'spring-po')),
    LCP: compOrder(C('LCP', 's2-po')),
    CBLOL: compOrder(C('CBLOL', 's1-po')),
  };
  return Object.fromEntries(Object.entries(ord).map(([lg, o]) => [lg, o.slice(0, MSI_SLOTS[lg])]));
}
// khu vực (LCK/LPL) xếp cao hơn ở First Stand: hạt giống 2 được vào thẳng Bracket MSI
function fstBestBig() {
  const ko = C('INTL', 'fst-ko');
  const rank = (lg) => {
    const ord = [...(ko ? compOrder(ko) : []), ...mergedOrder(C('INTL', 'fst-a'), C('INTL', 'fst-b'))];
    const i = ord.findIndex((t) => S.teams[t]?.league === lg);
    return i < 0 ? 99 : i;
  };
  return rank('LCK') <= rank('LPL') ? 'LCK' : 'LPL';
}
// đội dự CKTG: suất gốc + suất MSI (vô địch & á quân)
function worldsQualifiers() {
  const slots = { ...WORLDS_BASE };
  const msi = C('INTL', 'msi');
  const extra = [];
  if (msi && msi.done) {
    const o = compOrder(msi);
    for (const t of o.slice(0, 2)) { const lg = S.teams[t].league; if (slots[lg] != null) { slots[lg]++; extra.push(lg); } }
  }
  const ord = {
    LCK: mergedOrder(C('LCK', 'po'), C('LCK', 'playin'), C('LCK', 'r34')),
    LPL: [...compOrder(C('LPL', 's3-po')).slice(0, 2), ...compOrder(C('LPL', 'regional')), ...mergedOrder(C('LPL', 's3-po'))],
    LEC: mergedOrder(C('LEC', 'summer-po'), C('LEC', 'summer')),
    LCS: mergedOrder(C('LCS', 'summer-po'), C('LCS', 'summer')),
    LCP: mergedOrder(C('LCP', 's3-po'), C('LCP', 's3')),
    CBLOL: mergedOrder(C('CBLOL', 's2-po'), C('CBLOL', 's2')),
  };
  const byLeague = {};
  for (const [lg, o] of Object.entries(ord)) byLeague[lg] = [...new Set(o)].slice(0, slots[lg]);
  return { byLeague, slots, extra };
}
function promotion() {
  const vcs = C('VCS', 'summer-po'), lcp = C('LCP', 's3');
  if (!vcs || !lcp) return;
  const up = compOrder(vcs)[0];
  const down = mergedOrder(C('LCP', 's3-po'), lcp).slice(-1)[0];
  if (!up || !down) return;
  mkBracket('VCS', 'promotion', 'LCP Promotion', 'promotion', 'single', [down, up], { next: 'promotionDone' });
}
STAGES.promotionDone = (prev) => {
  const [winner] = compOrder(prev);
  const [down, up] = prev.seeds;
  if (winner === up) {
    S.pendingSwap = { up, down };
    addNews('news.promoted', { team: S.teams[up].name, down: S.teams[down].name }, true);
  } else addNews('news.promoFail', { team: S.teams[up].name, lcp: S.teams[down].name }, true);
  return null;
};

function qualifiedNews(teams, event) {
  if (teams.includes(S.userTeam)) addNews('news.qualified', { team: S.teams[S.userTeam].name, event }, true);
}

// giai đoạn mở màn của mỗi pha
const PHASE_START = {
  kickoff: ['lckCupGroups', 'lplS1', 'lecVersus', 'lcsLockin', 'lcpS1', 'cblolCup'],
  fst: ['fstGroups'],
  spring: ['lckR12', 'lplS2', 'lecSpring', 'lcsSpring', 'lcpS2', 'cblolS1', 'vcsSpring'],
  msi: ['msiPlayin'],
  summer: ['lckR34', 'lplS3', 'lecSummer', 'lcsSummer', 'lcpS3', 'cblolS2', 'vcsSummer'],
  worlds: ['worldsPlayin'],
  offseason: [],
};
export function startStages(phase) {
  for (const k of PHASE_START[phase]) STAGES[k]();
}

// cập nhật mọi giai đoạn đang diễn ra; tạo giai đoạn kế tiếp khi xong
export function progressStages() {
  let changed = true, guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    for (const id of [...S.phaseComps]) {
      const c = S.comps[id];
      if (c.done) continue;
      if (c.type === 'league') { if (c.matches.every((m) => m.done)) c.done = true; }
      else if (c.type === 'bracket') updateBracket(c);
      else if (c.type === 'swiss') updateSwiss(c);
      if (c.done) {
        changed = true;
        if (c.next && STAGES[c.next]) STAGES[c.next](c);
      }
    }
  }
}

// lịch thật 2026 cho từng pha (để hiển thị ngày tháng)
export const PHASE_WINDOW = {
  kickoff: [[0, 14], [2, 8], 24], fst: [[2, 16], [2, 22], 7], spring: [[3, 1], [5, 21], 28],
  msi: [[5, 28], [6, 12], 9], summer: [[6, 22], [8, 20], 28], worlds: [[9, 15], [10, 14], 14], offseason: [[10, 20], [11, 30], 10],
};
