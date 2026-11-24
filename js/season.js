// Lịch thi đấu, bảng xếp hạng, playoffs, giải quốc tế, kỳ chuyển nhượng
import { DB } from './data.js';
import { S, teamOvr, autoLineup, fillLineup, addNews, addFinance, teamPlayers, teamSalary, makeRookie, refreshValue, blankStats, userTeam } from './state.js';
import { simSeries } from './sim.js';
import { ROLES, ATTRS, shuffle, rand, randInt, clamp, computeOvr, pick } from './util.js';

export const PHASES = ['split1', 'playoffs1', 'msi', 'split2', 'playoffs2', 'worlds', 'offseason'];
export const WORLDS_SLOTS = { LCK: 4, LPL: 4, LEC: 3, LCS: 2, LCP: 1, CBLOL: 1, VCS: 1 };
const PRIZE = {
  leagueChamp: 400, leagueRunner: 200, leagueSemi: 80,
  msiChamp: 1000, msiRunner: 500, msiSemi: 250, msiQF: 120,
  worldsChamp: 2500, worldsRunner: 1200, worldsSemi: 600, worldsQF: 300, worldsGroup: 120,
};

let mid = 0;
function makeMatch(compId, day, a, b, bo, round = 0) {
  const id = `${compId}#${++mid}_${Math.random().toString(36).slice(2, 6)}`;
  return { id, comp: compId, day, a, b, bo, round, winsA: 0, winsB: 0, games: [], done: false, winner: null, aBlueFirst: rand() < 0.5 };
}

function roundRobin(teams, double) {
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
  if (double) return [...rounds, ...rounds.map((ps) => ps.map(([a, b]) => [b, a]))];
  return rounds;
}

export const leagueTeams = (lg) => Object.values(S.teams).filter((t) => t.league === lg).map((t) => t.id);

export function startPhase(phase) {
  S.phase = phase;
  S.phaseComps = [];
  const y = S.season;
  if (phase === 'split1' || phase === 'split2') {
    for (const L of DB.leagues) {
      const id = `${y}-${phase}-${L.id}`;
      const teams = leagueTeams(L.id);
      const rr = roundRobin(shuffle(teams), teams.length <= 10);
      const comp = { id, type: 'league', phase, league: L.id, name: L.id, teams, matches: [], bo: 1, done: false };
      rr.forEach((pairs, r) => pairs.forEach(([a, b]) => comp.matches.push(makeMatch(id, S.day + r, a, b, 1, r))));
      S.comps[id] = comp;
      S.phaseComps.push(id);
    }
    addNews('news.splitStart', { split: phase === 'split1' ? 1 : 2, season: y }, true);
  } else if (phase === 'playoffs1' || phase === 'playoffs2') {
    const split = phase === 'playoffs1' ? 'split1' : 'split2';
    for (const L of DB.leagues) {
      const st = standings(S.comps[`${y}-${split}-${L.id}`]);
      const seeds = st.slice(0, 4).map((r) => r.team);
      const id = `${y}-${phase}-${L.id}`;
      createBracket(id, { phase, league: L.id, name: L.id, seeds: [seeds[0], seeds[3], seeds[1], seeds[2]], bo: 5, kind: 'playoffs' });
    }
  } else if (phase === 'msi') {
    const champ = (lg) => S.comps[`${y}-playoffs1-${lg}`];
    const w = (lg) => champ(lg).winner;
    const lckRunner = runnerUp(champ('LCK'));
    const seeds = [w('LCK'), w('VCS'), w('LEC'), w('LCP'), w('LPL'), w('CBLOL'), w('LCS'), lckRunner];
    createBracket(`${y}-msi`, { phase, league: 'INTL', name: 'MSI', seeds, bo: 5, kind: 'msi' });
    addNews('news.msiStart', { season: y }, true);
  } else if (phase === 'worlds') {
    const pots = [[], [], [], []];
    const qualified = [];
    for (const L of DB.leagues) {
      const order = finalOrder(L.id).slice(0, WORLDS_SLOTS[L.id]);
      order.forEach((t, i) => qualified.push({ t, lg: L.id, seed: i }));
    }
    const potOf = { LCK: [0, 1, 2, 3], LPL: [0, 1, 2, 3], LEC: [0, 1, 2], LCS: [0, 3], LCP: [1], CBLOL: [2], VCS: [3] };
    for (const q of qualified) pots[potOf[q.lg][q.seed]].push(q);
    let groups;
    for (let tries = 0; tries < 200; tries++) {
      groups = [[], [], [], []];
      for (const pot of pots) shuffle(pot).forEach((q, i) => groups[i].push(q));
      if (groups.every((g) => new Set(g.map((q) => q.lg)).size === g.length)) break;
    }
    const id = `${y}-worlds-groups`;
    const comp = { id, type: 'groups', phase, league: 'INTL', name: 'Worlds', groups: groups.map((g) => g.map((q) => q.t)), matches: [], bo: 1, done: false };
    comp.groups.forEach((g, gi) => {
      roundRobin(g, true).forEach((pairs, r) => pairs.forEach(([a, b]) => {
        const m = makeMatch(id, S.day + r, a, b, 1, r);
        m.group = gi;
        comp.matches.push(m);
      }));
    });
    S.comps[id] = comp;
    S.phaseComps.push(id);
    addNews('news.worldsStart', { season: y }, true);
  } else if (phase === 'offseason') {
    addNews('news.offseason', { season: y }, true);
  }
}

function createBracket(id, { phase, league, name, seeds, bo, kind }) {
  const comp = { id, type: 'bracket', phase, league, name, kind, seeds, rounds: [], matches: [], bo, done: false };
  const r0 = [];
  for (let i = 0; i < seeds.length; i += 2) {
    const m = makeMatch(id, S.day, seeds[i], seeds[i + 1], bo, 0);
    comp.matches.push(m);
    r0.push(m.id);
  }
  comp.rounds.push(r0);
  S.comps[id] = comp;
  S.phaseComps.push(id);
  return comp;
}

export function runnerUp(comp) {
  const f = comp.matches.find((m) => m.id === comp.rounds[comp.rounds.length - 1][0]);
  return f.winner === f.a ? f.b : f.a;
}

// thứ tự cuối mùa của một giải (để lấy suất Worlds)
export function finalOrder(lg) {
  const y = S.season;
  const po = S.comps[`${y}-playoffs2-${lg}`];
  const st = standings(S.comps[`${y}-split2-${lg}`]).map((r) => r.team);
  const order = [];
  if (po && po.done) {
    order.push(po.winner, runnerUp(po));
  }
  for (const t of st) if (!order.includes(t)) order.push(t);
  return order;
}

export function standings(comp, groupIdx = null) {
  if (!comp) return [];
  const teams = groupIdx === null ? comp.teams : comp.groups[groupIdx];
  const rows = Object.fromEntries(teams.map((t) => [t, { team: t, w: 0, l: 0, gw: 0, gl: 0, streak: [] }]));
  for (const m of comp.matches) {
    if (!m.done || !rows[m.a] || !rows[m.b]) continue;
    if (groupIdx !== null && m.group !== groupIdx) continue;
    const wa = m.winner === m.a;
    rows[m.a][wa ? 'w' : 'l']++;
    rows[m.b][wa ? 'l' : 'w']++;
    rows[m.a].gw += m.winsA; rows[m.a].gl += m.winsB;
    rows[m.b].gw += m.winsB; rows[m.b].gl += m.winsA;
    rows[m.a].streak.push(wa ? 'W' : 'L');
    rows[m.b].streak.push(wa ? 'L' : 'W');
  }
  return Object.values(rows).sort((x, y) => y.w - x.w || (y.gw - y.gl) - (x.gw - x.gl) || teamOvr(S.teams[y.team]) - teamOvr(S.teams[x.team]));
}

export const allPhaseMatches = () => S.phaseComps.flatMap((id) => S.comps[id].matches);
export const matchesOnDay = (day) => allPhaseMatches().filter((m) => m.day === day);
export const userMatchToday = () => matchesOnDay(S.day).find((m) => !m.done && (m.a === S.userTeam || m.b === S.userTeam));
export function nextUserMatch() {
  return allPhaseMatches().filter((m) => !m.done && (m.a === S.userTeam || m.b === S.userTeam)).sort((a, b) => a.day - b.day)[0] || null;
}
export const phaseFinished = () => S.phase !== 'offseason' && S.phaseComps.every((id) => S.comps[id].done);

// Chuyển sang ngày tiếp theo. Trả về false nếu đội người chơi còn trận hôm nay.
export function advanceDay() {
  if (S.phase === 'offseason') return false;
  if (userMatchToday()) return false;
  for (const m of matchesOnDay(S.day)) if (!m.done) simSeries(m);
  progressComps();
  dailyTick();
  if (phaseFinished()) {
    endPhase();
    const i = PHASES.indexOf(S.phase);
    S.day++;
    startPhase(PHASES[i + 1]);
  } else {
    S.day++;
    // bỏ qua những ngày không có trận nào
    let guard = 0;
    while (!matchesOnDay(S.day).some((m) => !m.done) && guard++ < 50) S.day++;
  }
  return true;
}

// sau khi đội người chơi đá xong, cập nhật nhánh đấu
export function progressComps() {
  for (const id of S.phaseComps) {
    const c = S.comps[id];
    if (c.done) continue;
    if (c.type === 'league') {
      if (c.matches.every((m) => m.done)) c.done = true;
    } else if (c.type === 'bracket') {
      const last = c.rounds[c.rounds.length - 1].map((mid2) => c.matches.find((m) => m.id === mid2));
      if (!last.every((m) => m.done)) continue;
      if (last.length === 1) {
        c.done = true;
        c.winner = last[0].winner;
        continue;
      }
      const day = Math.max(...last.map((m) => m.day)) + 1;
      const nr = [];
      for (let i = 0; i < last.length; i += 2) {
        const m = makeMatch(c.id, day, last[i].winner, last[i + 1].winner, c.bo, c.rounds.length);
        c.matches.push(m);
        nr.push(m.id);
      }
      c.rounds.push(nr);
    } else if (c.type === 'groups') {
      if (!c.matches.every((m) => m.done)) continue;
      c.done = true;
      const q = c.groups.map((_, gi) => standings(c, gi).slice(0, 2).map((r) => r.team));
      c.qualified = q;
      const seeds = [q[0][0], q[1][1], q[2][0], q[3][1], q[1][0], q[0][1], q[3][0], q[2][1]];
      const day = Math.max(...c.matches.map((m) => m.day)) + 1;
      const saved = S.day;
      S.day = day;
      createBracket(`${S.season}-worlds-ko`, { phase: 'worlds', league: 'INTL', name: 'Worlds', seeds, bo: 5, kind: 'worlds' });
      S.day = saved;
    }
  }
}

function dailyTick() {
  // tập luyện & phát triển
  for (const p of Object.values(S.players)) {
    if (p.retired) continue;
    const isUser = p.teamId === S.userTeam;
    const gap = p.potential - p.ovr;
    if (p.age <= 25 && gap > 0 && rand() < 0.03 + gap * 0.004 + (isUser ? 0.02 : 0)) {
      const a = isUser && rand() < 0.65 ? S.training : pick(ATTRS);
      p.stats[a] = clamp(p.stats[a] + 1, 30, 99);
    } else if (p.age >= 28 && rand() < 0.012 * (p.age - 26)) {
      const a = pick(ATTRS);
      p.stats[a] = clamp(p.stats[a] - 1, 30, 99);
    }
    p.ovr = computeOvr(p);
  }
  // tài chính
  const t = userTeam();
  const perDay = 1 / 50;
  addFinanceQuiet(-teamSalary(t) * perDay, t.sponsor * perDay);
  // AI: đề nghị mua cầu thủ đang rao bán
  for (const pid of [...(S.listed || [])]) {
    const p = S.players[pid];
    if (!p || p.teamId !== S.userTeam) { S.listed = S.listed.filter((x) => x !== pid); continue; }
    if (rand() < 0.25) {
      const buyers = Object.values(S.teams).filter((x) => x.id !== S.userTeam && x.budget > p.value * 0.8);
      if (buyers.length) {
        const b = pick(buyers);
        S.offers = S.offers || [];
        S.offers.push({ id: Math.random().toString(36).slice(2), pid, from: b.id, amount: Math.round(p.value * (0.75 + rand() * 0.4)), day: S.day });
        addNews('news.offer', { player: p.ign, team: b.name }, true);
      }
    }
  }
}

function addFinanceQuiet(cost, income) {
  const t = userTeam();
  t.budget += cost + income;
  S.dailyCost = (S.dailyCost || 0) + cost;
  S.dailyIncome = (S.dailyIncome || 0) + income;
}

function endPhase() {
  const y = S.season;
  const ut = S.userTeam;
  const prizeFor = (teamId, amount, key) => {
    if (teamId === ut) addFinance(key, amount);
    else S.teams[teamId].budget += amount;
  };
  // ghi tổng kết chi phí ngày
  if (S.dailyCost) {
    S.finance.unshift({ key: 'fin.salaries', amount: Math.round(S.dailyCost), day: S.day, season: y });
    S.finance.unshift({ key: 'fin.sponsor', amount: Math.round(S.dailyIncome), day: S.day, season: y });
    S.dailyCost = 0; S.dailyIncome = 0;
  }
  for (const id of S.phaseComps) {
    const c = S.comps[id];
    if (c.type !== 'bracket') continue;
    const final = c.matches.find((m) => m.id === c.rounds[c.rounds.length - 1][0]);
    const champ = final.winner, runner = runnerUp(c);
    const semis = c.rounds.length >= 2 ? c.rounds[c.rounds.length - 2].map((x) => c.matches.find((m) => m.id === x)).map((m) => (m.winner === m.a ? m.b : m.a)) : [];
    const qf = c.rounds.length >= 3 ? c.rounds[c.rounds.length - 3].map((x) => c.matches.find((m) => m.id === x)).map((m) => (m.winner === m.a ? m.b : m.a)) : [];
    const kind = c.kind === 'playoffs' ? 'league' : c.kind;
    prizeFor(champ, PRIZE[kind + 'Champ'], 'fin.prize');
    prizeFor(runner, PRIZE[kind + 'Runner'], 'fin.prize');
    semis.forEach((t) => prizeFor(t, PRIZE[kind + 'Semi'], 'fin.prize'));
    if (PRIZE[kind + 'QF']) qf.forEach((t) => prizeFor(t, PRIZE[kind + 'QF'], 'fin.prize'));
    const title = c.kind === 'playoffs' ? `${c.league} ${c.phase === 'playoffs1' ? 'Split 1' : 'Split 2'} ${y}` : `${c.kind === 'msi' ? 'MSI' : 'Worlds'} ${y}`;
    S.teams[champ].trophies.push(title);
    S.history.unshift({ season: y, title, champ, runner, kind: c.kind, league: c.league });
    addNews(c.kind === 'playoffs' ? 'news.leagueChamp' : 'news.intlChamp', { team: S.teams[champ].name, title, runner: S.teams[runner].name }, true);
    for (const pid of S.teams[champ].roster) {
      const p = S.players[pid];
      if (p) (p.titles = p.titles || []).push(title);
    }
  }
  if (S.phase === 'worlds') {
    const g = S.comps[`${y}-worlds-groups`];
    const out = g.groups.flat().filter((t) => !g.qualified.flat().includes(t));
    out.forEach((t) => prizeFor(t, PRIZE.worldsGroup, 'fin.prize'));
  }
  autoSaveHook && autoSaveHook();
}

let autoSaveHook = null;
export function setAutoSave(fn) { autoSaveHook = fn; }

// ----- Kỳ chuyển nhượng: bắt đầu mùa mới -----
export function startNewSeason() {
  const y = S.season;
  const ut = S.userTeam;
  // phần thưởng/doanh thu tài trợ điều chỉnh theo kết quả
  for (const t of Object.values(S.teams)) {
    const titles = t.trophies.filter((x) => x.endsWith(String(y))).length;
    t.sponsor = Math.round(t.sponsor * (1 + titles * 0.08) * (0.97 + rand() * 0.06));
  }
  // tuổi, giải nghệ, hợp đồng
  for (const p of Object.values(S.players)) {
    if (p.retired) continue;
    p.age++;
    p.season = blankStats();
    p.form = 0;
    if (p.age >= 30 && rand() < (p.age - 28) * 0.12 && p.teamId !== ut) {
      p.retired = true;
      if (p.teamId) removeFromTeam(p);
      continue;
    }
    // hợp đồng hết hạn
    if (p.contractUntil <= y && p.teamId) {
      if (p.teamId === ut) {
        if (!(S.renewed || []).includes(p.id)) {
          addNews('news.contractExpired', { player: p.ign }, true);
          removeFromTeam(p);
          S.freeAgents.push(p.id);
        }
      } else if (rand() < 0.7) {
        p.contractUntil = y + randInt(1, 3);
      } else {
        removeFromTeam(p);
        S.freeAgents.push(p.id);
      }
    }
    refreshValue(p);
  }
  S.renewed = [];
  S.offers = [];
  S.listed = [];
  // tân binh mới
  for (const L of DB.leagues) for (const r of ROLES) if (rand() < 0.75) S.freeAgents.push(makeRookie(L.id, r).id);
  S.freeAgents = [...new Set(S.freeAgents)].filter((id) => S.players[id] && !S.players[id].retired && !S.players[id].teamId);
  // AI lấp đội hình
  for (const t of Object.values(S.teams)) {
    if (t.id === ut) continue;
    for (const r of ROLES) {
      const have = teamPlayers(t).filter((p) => p.role === r);
      if (have.length) continue;
      const cands = S.freeAgents.map((id) => S.players[id]).filter((p) => p.role === r)
        .sort((a, b) => (b.ovr + (b.homeLeague === t.league ? 3 : 0)) - (a.ovr + (a.homeLeague === t.league ? 3 : 0)));
      const pl = cands[randInt(0, Math.min(2, cands.length - 1))] || makeRookie(t.league, r);
      signPlayer(t, pl, y + randInt(1, 2));
    }
    autoLineup(t);
  }
  // đội người chơi: bổ sung tân binh nếu thiếu vị trí
  const ut2 = S.teams[ut];
  for (const r of ROLES) {
    if (teamPlayers(ut2).some((p) => p.role === r)) continue;
    const fa = S.freeAgents.map((id) => S.players[id]).filter((p) => p.role === r && p.rookie).sort((a, b) => a.salary - b.salary)[0] || makeRookie(ut2.league, r);
    signPlayer(ut2, fa, y + 2);
    addNews('news.signedFA', { player: fa.ign, team: ut2.name }, true);
  }
  fillLineup(ut2);
  // dọn dữ liệu cũ để bản lưu gọn nhẹ
  for (const id of Object.keys(S.comps)) if (!id.startsWith(`${y}-`)) delete S.comps[id];
  for (const c of Object.values(S.comps)) for (const m of c.matches) m.games = m.games.map((g) => ({ winner: g.winner, dur: g.dur }));
  for (const id of Object.keys(S.players)) {
    const p = S.players[id];
    if (!p.teamId && (p.retired || (p.rookie && p.ovr < 62 && p.age > 19))) { delete S.players[id]; }
  }
  S.freeAgents = S.freeAgents.filter((id) => S.players[id]);
  S.news = S.news.slice(0, 60);
  S.season++;
  S.day++;
  addFinance('fin.sponsorDeal', 0, {});
  startPhase('split1');
}

export function removeFromTeam(p) {
  const t = S.teams[p.teamId];
  if (t) {
    t.roster = t.roster.filter((x) => x !== p.id);
    for (const r of ROLES) if (t.lineup[r] === p.id) delete t.lineup[r];
  }
  p.teamId = null;
}

export function signPlayer(t, p, until) {
  if (p.teamId) removeFromTeam(p);
  S.freeAgents = S.freeAgents.filter((x) => x !== p.id);
  p.teamId = t.id;
  p.contractUntil = until;
  t.roster.push(p.id);
}

// ----- Chuyển nhượng của người chơi -----
export function askingPrice(p) {
  const t = S.teams[p.teamId];
  if (!t) return 0;
  const starter = Object.values(t.lineup).includes(p.id);
  return Math.round(p.value * (starter ? 1.35 : 1.0));
}

export function makeOffer(pid, amount) {
  const p = S.players[pid];
  const ut = userTeam();
  if (ut.roster.length >= 10) return { ok: false, reason: 'tr.rosterFull' };
  if (amount > ut.budget) return { ok: false, reason: 'tr.noBudget' };
  if (!p.teamId) {
    // tự do: chỉ trả lương
    signPlayer(ut, p, S.season + 1);
    p.salary = Math.round(p.salary * 1.05);
    addNews('news.signedFA', { player: p.ign, team: ut.name }, true);
    return { ok: true };
  }
  const seller = S.teams[p.teamId];
  const ask = askingPrice(p) * (0.9 + rand() * 0.2);
  const rolesLeft = teamPlayers(seller).filter((x) => x.role === p.role && x.id !== p.id).length;
  if (amount < ask) return { ok: false, reason: 'tr.rejected' };
  addFinance('fin.transferIn', -amount, { player: p.ign });
  seller.budget += amount;
  signPlayer(ut, p, S.season + randInt(1, 2));
  p.salary = Math.round(p.salary * 1.1);
  if (!rolesLeft) {
    const fa = S.freeAgents.map((id) => S.players[id]).filter((x) => x.role === p.role).sort((a, b) => b.ovr - a.ovr)[0] || makeRookie(seller.league, p.role);
    signPlayer(seller, fa, S.season + 1);
  }
  autoLineup(seller);
  addNews('news.transfer', { player: p.ign, from: seller.name, to: ut.name, fee: amount }, true);
  return { ok: true };
}

export function acceptOffer(oid) {
  const o = (S.offers || []).find((x) => x.id === oid);
  if (!o) return;
  const p = S.players[o.pid];
  const buyer = S.teams[o.from];
  if (!p || p.teamId !== S.userTeam) { S.offers = S.offers.filter((x) => x.id !== oid); return; }
  buyer.budget -= o.amount;
  addFinance('fin.transferOut', o.amount, { player: p.ign });
  const old = S.teams[p.teamId];
  signPlayer(buyer, p, S.season + randInt(1, 2));
  for (const r of ROLES) if (old.lineup[r] === p.id) delete old.lineup[r];
  // đội mua bán bớt người thừa
  if (buyer.roster.length > 9) {
    const extra = teamPlayers(buyer).filter((x) => x.role === p.role && x.id !== p.id).sort((a, b) => a.ovr - b.ovr)[0];
    if (extra) { removeFromTeam(extra); S.freeAgents.push(extra.id); }
  }
  autoLineup(buyer);
  S.offers = S.offers.filter((x) => x.pid !== p.id);
  S.listed = (S.listed || []).filter((x) => x !== p.id);
  addNews('news.transfer', { player: p.ign, from: old.name, to: buyer.name, fee: o.amount }, true);
}

export function releasePlayer(pid) {
  const p = S.players[pid];
  const years = Math.max(1, p.contractUntil - S.season + 1);
  const cost = Math.round(p.salary * 0.5 * years);
  addFinance('fin.release', -cost, { player: p.ign });
  removeFromTeam(p);
  S.freeAgents.push(p.id);
  addNews('news.released', { player: p.ign }, false);
}

export function renewCost(p) { return Math.round(p.salary * (1 + Math.max(0, p.ovr - 70) * 0.012 + rand() * 0.05)); }
export function renewContract(pid, salary, years) {
  const p = S.players[pid];
  p.salary = salary;
  p.contractUntil = S.season + years;
  S.renewed = [...(S.renewed || []), pid];
  p.morale = clamp(p.morale + 8, 0, 100);
}

export function seasonDate(day) {
  const d = new Date(Date.UTC(S.season, 0, 12));
  d.setUTCDate(d.getUTCDate() + Math.round(day * 3.2) % 330);
  return d;
}
export { clamp };
