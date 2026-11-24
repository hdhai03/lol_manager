// Mô phỏng cấm/chọn và trận đấu
import { DB } from './data.js';
import { S, lineupPlayers, fillLineup } from './state.js';
import { ROLES, rand, randInt, clamp, logistic, gauss, weighted, pick, shuffle } from './util.js';

// Thứ tự cấm/chọn chuẩn giải chuyên nghiệp
export const DRAFT_ORDER = [
  ['B', 'ban'], ['R', 'ban'], ['B', 'ban'], ['R', 'ban'], ['B', 'ban'], ['R', 'ban'],
  ['B', 'pick'], ['R', 'pick'], ['R', 'pick'], ['B', 'pick'], ['B', 'pick'], ['R', 'pick'],
  ['R', 'ban'], ['B', 'ban'], ['R', 'ban'], ['B', 'ban'],
  ['R', 'pick'], ['B', 'pick'], ['B', 'pick'], ['R', 'pick'],
];

// Độ hợp tướng của tuyển thủ (0-100)
export function champFit(p, champId, role) {
  const c = DB.champions[champId];
  if (!c || !p) return 30;
  let fit = 22 + c.power * 0.5;
  const pe = p.pool.find((x) => x.c === champId);
  if (pe) fit += Math.min(pe.g, 25) * 0.9 + (pe.g >= 3 ? (pe.w / pe.g - 0.5) * 20 : 0);
  if (!c.roles.includes(role)) fit -= 25;
  return clamp(fit, 0, 100);
}

export function effRating(p, champId, role) {
  if (!p) return 35;
  let r = p.ovr + (champFit(p, champId, role) - 60) * 0.12 + (p.form || 0) * 0.5;
  if (p.role !== role) r -= 8;
  return r;
}

export function compScore(champIds) {
  const cs = champIds.map((id) => DB.champions[id]).filter(Boolean);
  if (!cs.length) return 0;
  const tanks = cs.filter((c) => c.tags.includes('Tank')).length;
  const ap = cs.reduce((s, c) => s + c.info.magic, 0);
  const ad = cs.reduce((s, c) => s + c.info.attack, 0);
  const ratio = Math.min(ap, ad) / Math.max(ap + ad, 1);
  let sc = 0;
  sc += tanks === 0 ? -2 : tanks <= 2 ? 1 : -0.5;
  sc += ratio > 0.3 ? 1 : ratio > 0.2 ? 0 : -1.5;
  return sc;
}

export function compTraits(champIds) {
  const cs = champIds.map((id) => DB.champions[id]).filter(Boolean);
  const tanks = cs.filter((c) => c.tags.includes('Tank')).length;
  const ap = cs.reduce((s, c) => s + c.info.magic, 0);
  const ad = cs.reduce((s, c) => s + c.info.attack, 0);
  return { tanks, apShare: ap / Math.max(ap + ad, 1), score: compScore(champIds) };
}

// ----- AI cấm chọn -----
export function newDraft(blueTeamId, redTeamId) {
  return { blue: blueTeamId, red: redTeamId, step: 0, bans: { B: [], R: [] }, picks: { B: {}, R: {} }, log: [] };
}
export const draftTaken = (d) => new Set([...d.bans.B, ...d.bans.R, ...Object.values(d.picks.B), ...Object.values(d.picks.R)]);
export const openRoles = (d, side) => ROLES.filter((r) => !d.picks[side][r]);

function lineupMap(teamId) {
  const m = {};
  for (const { role, p } of lineupPlayers(S.teams[teamId])) m[role] = p;
  return m;
}

export function aiChoose(d, sideTeam) {
  const [side, type] = DRAFT_ORDER[d.step];
  const taken = draftTaken(d);
  const me = side === 'B' ? d.blue : d.red;
  const opp = side === 'B' ? d.red : d.blue;
  const myLine = lineupMap(me);
  if (type === 'ban') {
    const oppSide = side === 'B' ? 'R' : 'B';
    const oppLine = lineupMap(opp);
    const roles = openRoles(d, oppSide);
    let best = null, bestS = -1e9;
    for (const c of DB.champList) {
      if (taken.has(c.id)) continue;
      let s = -1e9;
      for (const r of roles) {
        if (!c.roles.includes(r)) continue;
        s = Math.max(s, champFit(oppLine[r], c.id, r) + c.power * 0.3);
      }
      if (s < -1e8) continue;
      s += rand() * 8;
      if (s > bestS) { bestS = s; best = c.id; }
    }
    return { champ: best };
  }
  const roles = openRoles(d, side);
  const current = Object.values(d.picks[side]);
  let best = null, bestS = -1e9;
  for (const c of DB.champList) {
    if (taken.has(c.id)) continue;
    for (const r of roles) {
      if (!c.roles.includes(r)) continue;
      const s = champFit(myLine[r], c.id, r) + compScore([...current, c.id]) * 3 + rand() * 7;
      if (s > bestS) { bestS = s; best = { champ: c.id, role: r }; }
    }
  }
  if (!best) { // dự phòng: tướng bất kỳ
    const c = DB.champList.find((x) => !taken.has(x.id));
    best = { champ: c.id, role: roles[0] };
  }
  return best;
}

export function applyDraftAction(d, champ, role) {
  const [side, type] = DRAFT_ORDER[d.step];
  if (type === 'ban') d.bans[side].push(champ);
  else d.picks[side][role] = champ;
  d.log.push({ side, type, champ, role });
  d.step++;
}

export function autoDraft(blueId, redId) {
  const d = newDraft(blueId, redId);
  while (d.step < DRAFT_ORDER.length) {
    const ch = aiChoose(d);
    applyDraftAction(d, ch.champ, ch.role);
  }
  return d;
}

// ----- Mô phỏng ván đấu -----
const KILL_W = { Top: 1, Jungle: 1.05, Mid: 1.35, Bot: 1.55, Support: 0.35 };
const DEATH_W = { Top: 1.1, Jungle: 1, Mid: 0.95, Bot: 1, Support: 1.15 };
const DRAKES = ['infernal', 'mountain', 'ocean', 'cloud', 'hextech', 'chemtech'];

export function teamPower(teamId, picks) {
  const line = lineupMap(teamId);
  let sum = 0;
  for (const r of ROLES) sum += effRating(line[r], picks[r], r);
  return sum / 5 + compScore(Object.values(picks));
}

export function simulateGame(d) {
  const blue = d.blue, red = d.red;
  // phong độ trong ngày (ngẫu nhiên) + lợi thế phe xanh nhỏ
  const pB = teamPower(blue, d.picks.B) + 0.4 + gauss() * 1.6;
  const pR = teamPower(red, d.picks.R) + gauss() * 1.6;
  const pWinB = logistic((pB - pR) / 5.5);
  const blueWins = rand() < pWinB;
  const W = blueWins ? 'B' : 'R';
  const closeness = Math.abs(pWinB - 0.5); // 0..0.5
  const dur = clamp(Math.round(31 + gauss() * 4.5 - closeness * 10), 22, 48);
  const finalGd = (3500 + rand() * 9000 + closeness * 6000) * (blueWins ? 1 : -1);

  // đường vàng (brownian bridge)
  const walk = [0];
  for (let m = 1; m <= dur; m++) walk.push(walk[m - 1] + gauss() * 650);
  const gold = [0];
  for (let m = 1; m <= dur; m++) {
    const f = m / dur;
    gold.push(Math.round(finalGd * f ** 1.4 + walk[m] - f * walk[dur]));
  }
  const lead = (m) => logistic(gold[Math.min(m, dur)] / 2600 + (blueWins ? 0.25 : -0.25)); // xác suất phe xanh thắng sự kiện

  const lineB = lineupMap(blue), lineR = lineupMap(red);
  const ps = {};
  for (const [side, line, picks] of [['B', lineB, d.picks.B], ['R', lineR, d.picks.R]]) {
    for (const r of ROLES) {
      const p = line[r];
      ps[side + r] = { side, role: r, pid: p ? p.id : null, champ: picks[r], k: 0, d: 0, a: 0, cs: 0, gold: 0, dmg: 0, eff: effRating(p, picks[r], r) };
    }
  }
  const events = [];
  const add = (m, type, side, data = {}) => events.push({ m, type, side, ...data });

  // hạ gục
  const totalKills = randInt(12, 34);
  const killTimes = [];
  for (let i = 0; i < totalKills; i++) killTimes.push(clamp(Math.round(2 + (dur - 2) * Math.pow(rand(), 0.8)), 2, dur));
  killTimes.sort((a, b) => a - b);
  let first = true;
  const kills = { B: 0, R: 0 };
  // gom nhóm thành giao tranh
  let i = 0;
  while (i < killTimes.length) {
    const m = killTimes[i];
    let j = i;
    while (j + 1 < killTimes.length && killTimes[j + 1] === m) j++;
    const n = j - i + 1;
    let kb = 0, kr = 0;
    for (let x = 0; x < n; x++) {
      const side = rand() < lead(m) ? 'B' : 'R';
      const os = side === 'B' ? 'R' : 'B';
      const killer = weighted(ROLES, ROLES.map((r) => KILL_W[r] * (ps[side + r].eff / 70) ** 3));
      const victim = weighted(ROLES, ROLES.map((r) => DEATH_W[r] * (70 / ps[os + r].eff) ** 3));
      ps[side + killer].k++;
      ps[os + victim].d++;
      const assists = shuffle(ROLES.filter((r) => r !== killer)).slice(0, randInt(0, 3));
      for (const a of assists) ps[side + a].a++;
      kills[side]++;
      if (side === 'B') kb++; else kr++;
      if (first) { add(m, 'firstblood', side, { killer, victim }); first = false; }
      else if (n < 3) add(m, 'kill', side, { killer, victim });
    }
    if (n >= 3) add(m, 'teamfight', kb >= kr ? 'B' : 'R', { kb, kr });
    i = j + 1;
  }

  // mục tiêu lớn
  const drakes = { B: [], R: [] };
  let soul = null;
  let t = 5;
  while (t < dur - 1) {
    const side = rand() < lead(t) ? 'B' : 'R';
    if (!soul) {
      const type = drakes.B.length + drakes.R.length < 2 ? pick(DRAKES) : (drakes.B[1] || drakes.R[1] || pick(DRAKES));
      drakes[side].push(type);
      add(t, 'dragon', side, { drake: type, n: drakes[side].length });
      if (drakes[side].length === 4) { soul = side; add(t, 'soul', side, { drake: type }); }
    } else if (t > 28) {
      add(t, 'elder', side);
    }
    t += randInt(5, 7);
  }
  add(7, 'grubs', rand() < lead(7) ? 'B' : 'R');
  if (dur > 16) add(15, 'herald', rand() < lead(15) ? 'B' : 'R');
  for (let b = 21 + randInt(0, 4); b < dur - 1; b += randInt(7, 10)) {
    add(b, 'baron', rand() < lead(b) ? 'B' : 'R');
  }
  // trụ
  const towers = { B: 0, R: 0 };
  const winTowers = randInt(7, 11), loseTowers = randInt(0, Math.min(6, Math.round(2 + (0.5 - closeness) * 8)));
  const tw = [];
  for (let x = 0; x < winTowers; x++) tw.push([W, Math.round(10 + (dur - 10) * Math.pow(rand(), 0.7))]);
  for (let x = 0; x < loseTowers; x++) tw.push([W === 'B' ? 'R' : 'B', Math.round(8 + (dur - 12) * rand())]);
  tw.sort((a, b) => a[1] - b[1]);
  for (const [side, m] of tw) {
    towers[side]++;
    if (towers[side] === 1 && towers[side === 'B' ? 'R' : 'B'] === 0) add(m, 'firsttower', side);
    else add(m, 'tower', side, { n: towers[side] });
  }
  add(dur, 'nexus', W);
  events.sort((a, b) => a.m - b.m || (a.type === 'nexus') - (b.type === 'nexus'));

  // thống kê cá nhân
  for (const x of Object.values(ps)) {
    const p = S.players[x.pid];
    const baseCs = { Top: 8.3, Jungle: 6, Mid: 8.8, Bot: 9.6, Support: 1.2 }[x.role];
    const winner = x.side === W;
    x.cs = Math.round(dur * (baseCs + (x.eff - 70) * 0.03 + (winner ? 0.4 : -0.3)) + gauss() * 10);
    x.gold = Math.round(dur * ({ Top: 400, Jungle: 360, Mid: 420, Bot: 450, Support: 260 }[x.role]) + x.k * 300 + x.a * 120 + (winner ? 1500 : 0));
    x.dmg = Math.round(dur * ({ Top: 620, Jungle: 450, Mid: 780, Bot: 820, Support: 250 }[x.role]) * (0.8 + rand() * 0.5) + x.k * 900);
    x.score = (x.k * 3 + x.a * 1.5 - x.d * 1.5) + (winner ? 5 : 0) + x.dmg / 2500;
    if (!p) x.score -= 99;
  }
  const mvp = Object.values(ps).filter((x) => x.side === W).sort((a, b) => b.score - a.score)[0];

  return {
    winner: W, winnerId: blueWins ? blue : red, blue, red, dur, gold, events, kills, towers, drakes, soul,
    players: Object.values(ps).map(({ eff, score, ...x }) => x), mvp: mvp ? mvp.pid : null,
    picks: d.picks, bans: d.bans, pWinB: +pWinB.toFixed(3),
  };
}

// cập nhật phong độ/thống kê sau ván
export function applyGameResult(g) {
  for (const x of g.players) {
    const p = S.players[x.pid];
    if (!p) continue;
    const win = x.side === g.winner;
    for (const k of ['season', 'career']) {
      const st = p[k];
      st.g++; if (win) st.w++;
      st.k += x.k; st.d += x.d; st.a += x.a; st.cs += x.cs;
      if (g.mvp === p.id) st.mvp++;
    }
    p.form = clamp((p.form || 0) * 0.85 + (win ? 0.6 : -0.6) + (g.mvp === p.id ? 0.8 : 0), -5, 5);
    p.morale = clamp((p.morale || 70) + (win ? 2 : -2), 20, 100);
    // kinh nghiệm tướng
    const pe = p.pool.find((c) => c.c === x.champ);
    if (pe) { pe.g++; if (win) pe.w++; } else p.pool.push({ c: x.champ, g: 1, w: win ? 1 : 0 });
    p.pool.sort((a, b) => b.g - a.g);
    if (p.pool.length > 12) p.pool.length = 12;
  }
}

// Chơi cả loạt Bo (tự động hoặc với các ván đã có)
export function simSeries(match) {
  fillLineup(S.teams[match.a]);
  fillLineup(S.teams[match.b]);
  const need = Math.ceil(match.bo / 2);
  while (match.winsA < need && match.winsB < need) {
    const gi = match.games.length;
    const aBlue = gi % 2 === 0 ? match.aBlueFirst !== false : match.aBlueFirst === false;
    const blue = aBlue ? match.a : match.b, red = aBlue ? match.b : match.a;
    const g = simulateGame(autoDraft(blue, red));
    recordGame(match, g, false);
  }
}

export function recordGame(match, g, detailed) {
  applyGameResult(g);
  if (g.winnerId === match.a) match.winsA++; else match.winsB++;
  // lưu gọn để giảm dung lượng lưu trữ
  const keep = { winner: g.winnerId, dur: g.dur };
  if (detailed) Object.assign(keep, { blue: g.blue, red: g.red, kills: g.kills, mvp: g.mvp, picks: g.picks, bans: g.bans, towers: g.towers, players: g.players });
  match.games.push(keep);
  const need = Math.ceil(match.bo / 2);
  if (match.winsA >= need || match.winsB >= need) {
    match.done = true;
    match.winner = match.winsA > match.winsB ? match.a : match.b;
  }
}
