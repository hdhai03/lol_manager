// Lịch thi đấu, bảng xếp hạng, playoffs, giải quốc tế, kỳ chuyển nhượng
import { DB } from './data';
import { S, teamOvr, autoLineup, fillLineup, addNews, addFinance, teamPlayers, teamSalary, makeRookie, refreshValue, blankStats, userTeam } from './state';
import { simSeries } from './sim';
import { ROLES, ATTRS, ATTR_GROUPS, shuffle, rand, randInt, clamp, computeOvr, pick } from './util';

import { gprSnapshot, gprNewSeason, ensureGpr } from './gpr';
import { closeEvent, resetEventStats } from './awards';
import { soloqDay, soloqNewSeason, academyDay, ensureSoloq, ensureAcademy } from './academy';
import { lifeDay, chemNewcomer } from './life';
import type { Attr, Comp, Match, Phase, Player, Team, Trophy } from './types';
import { PHASES, makeMatch, roundRobin, standings, compOrder, runnerUp, startStages, progressStages, PHASE_WINDOW } from './formats';
export { PHASES, standings, compOrder, runnerUp };
// tiền thưởng (nghìn USD) theo hạng 1 / 2 / 3-4 / 5-8
const PRIZE: Record<Trophy['tier'], number[]> = {
  cup: [250, 120, 60, 25], league: [400, 200, 80, 30], fst: [1000, 600, 250, 120],
  msi: [1000, 500, 250, 120], worlds: [2500, 1200, 600, 300, 120],
};
export { makeMatch, roundRobin };

export const leagueTeams = (lg: string): string[] => Object.values(S.teams).filter((t) => t.league === lg).map((t) => t.id);

const PHASE_NEWS: Record<Phase, string> = { kickoff: 'news.kickoff', fst: 'news.fstStart', spring: 'news.springStart', msi: 'news.msiStart', summer: 'news.summerStart', worlds: 'news.worldsStart', offseason: 'news.offseason' };
export function startPhase(phase: Phase): void {
  ensureGpr();
  ensureSoloq();
  S.phase = phase;
  S.phaseComps = [];
  (S.phaseStart ??= {})[phase] = S.day;
  startStages(phase);
  addNews(PHASE_NEWS[phase], { season: S.season }, true);
}

export const allPhaseMatches = (): Match[] => S.phaseComps.flatMap((id) => S.comps[id].matches);
export const matchesOnDay = (day: number): Match[] => allPhaseMatches().filter((m) => m.day === day);
export const userMatchToday = (): Match | undefined => matchesOnDay(S.day).find((m) => !m.done && (m.a === S.userTeam || m.b === S.userTeam));
export function nextUserMatch(): Match | null {
  return allPhaseMatches().filter((m) => !m.done && (m.a === S.userTeam || m.b === S.userTeam)).sort((a, b) => a.day - b.day)[0] || null;
}
export const phaseFinished = (): boolean => S.phase !== 'offseason' && S.phaseComps.every((id) => S.comps[id].done);

// Chuyển sang ngày tiếp theo. Trả về false nếu đội người chơi còn trận hôm nay.
export function advanceDay(): boolean {
  if (S.phase === 'offseason') return false;
  if (userMatchToday()) return false;
  for (const m of matchesOnDay(S.day)) if (!m.done) simSeries(m);
  progressComps();
  dailyTick();
  if (phaseFinished()) {
    endPhase();
    const i = PHASES.indexOf(S.phase as Phase);
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

// sau mỗi ngày / mỗi trận của người chơi: cập nhật nhánh đấu, tạo giai đoạn kế tiếp
export function progressComps(): void {
  const before = new Set(S.phaseComps.filter((id) => S.comps[id].done));
  progressStages();
  for (const id of S.phaseComps) if (S.comps[id].done && !before.has(id)) finishComp(S.comps[id]);
}

// phát thưởng / ghi danh hiệu khi một giai đoạn có cúp kết thúc
function finishComp(c: Comp): void {
  if (!c.trophy) return;
  const y = S.season;
  const ut = S.userTeam;
  // nghỉ hè: độ ăn ý quay về mức trung bình một phần
  for (const k of Object.keys(S.chem || {})) S.chem![k] = +(S.chem![k] - (S.chem![k] - 55) * 0.25).toFixed(2);
  const order = compOrder(c);
  const tiers = PRIZE[c.trophy.tier];
  order.forEach((t, i) => {
    const amt = i === 0 ? tiers[0] : i === 1 ? tiers[1] : i < 4 ? tiers[2] : i < 8 ? tiers[3] : tiers[4] || 0;
    if (!amt) return;
    if (t === ut) addFinance('fin.prize', amt);
    else S.teams[t].budget += amt;
  });
  const champ = order[0], runner = order[1];
  const title = `${c.trophy.title} ${y}`;
  S.teams[champ].trophies.push(title);
  S.history.unshift({ season: y, title, champ, runner, kind: c.trophy.tier, league: c.league });
  addNews(['fst', 'msi', 'worlds'].includes(c.trophy.tier) ? 'news.intlChamp' : 'news.leagueChamp', { team: S.teams[champ].name, title, runner: S.teams[runner].name }, true);
  for (const pid of S.teams[champ].roster) {
    const p = S.players[pid];
    if (p) (p.titles = p.titles || []).push(title);
  }
  const aw = closeEvent(c, order);
  if (aw) addNews('news.awards', { title, mvp: aw.mvp.ign, mvpTeam: aw.mvp.team, fmvp: aw.fmvp ? aw.fmvp.ign : '—' }, !!aw.mvp.pid && S.players[aw.mvp.pid]?.teamId === S.userTeam);
}

function dailyTick(): void {
  // xếp hạng đơn & học viện
  const playing = new Set(matchesOnDay(S.day).flatMap((m) => [m.a, m.b]));
  soloqDay(playing);
  academyDay();
  lifeDay(playing);
  const intensity = { light: 0.6, normal: 1, hard: 1.4 }[ensureAcademy().intensity] || 1;
  // tập luyện & phát triển
  for (const p of Object.values(S.players)) {
    if (p.retired) continue;
    const isUser = p.teamId === S.userTeam;
    // hồi thể lực mỗi ngày
    p.cond = clamp((p.cond ?? 100) + 9 + (p.stats.stamina - 60) / 10, 20, 100);
    const gap = p.potential - p.ovr;
    if (p.age <= 25 && gap > 0 && rand() < (0.05 + gap * 0.006 + (isUser ? 0.03 : 0)) * (isUser ? intensity : 1)) {
      // giáo án theo nhóm: chỉ số trong nhóm được ưu tiên, aggression không luyện được
      const grp: Attr[] = isUser && rand() < 0.7 ? ATTR_GROUPS[S.training] || ATTRS : ATTRS;
      const a = pick(grp.filter((x) => x !== 'aggression'));
      p.stats[a] = clamp(p.stats[a] + 1, 30, 99);
      if (isUser && rand() < 0.15 * intensity) p.cond = clamp(p.cond - 4, 20, 100); // tập nặng hơi mệt
    } else if (p.age >= 28 && rand() < 0.02 * (p.age - 26)) {
      const a = pick((['dodge', 'accuracy', 'stamina', 'farm', pick(ATTRS)] as Attr[]).filter((x) => x !== 'aggression'));
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
    if (!p || p.teamId !== S.userTeam) { S.listed = (S.listed || []).filter((x) => x !== pid); continue; }
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

function addFinanceQuiet(cost: number, income: number): void {
  const t = userTeam();
  t.budget += cost + income;
  S.dailyCost = (S.dailyCost || 0) + cost;
  S.dailyIncome = (S.dailyIncome || 0) + income;
}

function endPhase(): void {
  const y = S.season;
  const ut = S.userTeam;
  // ghi tổng kết chi phí ngày
  if (S.dailyCost) {
    S.finance.unshift({ key: 'fin.salaries', amount: Math.round(S.dailyCost), day: S.day, season: y });
    S.finance.unshift({ key: 'fin.sponsor', amount: Math.round(S.dailyIncome || 0), day: S.day, season: y });
    S.dailyCost = 0; S.dailyIncome = 0;
  }
  if (S.phase) gprSnapshot(S.phase);
  autoSaveHook?.();
}

let autoSaveHook: (() => void) | null = null;
export function setAutoSave(fn: () => void): void { autoSaveHook = fn; }

// ----- Kỳ chuyển nhượng: bắt đầu mùa mới -----
export function startNewSeason(): void {
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
    if (!p.teamId && !p.academyOf && (p.retired || (p.rookie && p.ovr < 62 && p.age > 19))) { delete S.players[id]; }
  }
  S.freeAgents = S.freeAgents.filter((id) => S.players[id]);
  S.news = S.news.slice(0, 60);
  // thăng/xuống hạng LCP ↔ VCS
  if (S.pendingSwap) {
    const { up, down } = S.pendingSwap;
    if (S.teams[up] && S.teams[down]) { S.teams[up].league = 'LCP'; S.teams[down].league = 'VCS'; }
    S.pendingSwap = null;
  }
  S.season++;
  S.day++;
  S.phaseStart = {};
  gprNewSeason();
  resetEventStats();
  soloqNewSeason();
  for (const p of Object.values(S.players)) p.ovrStart = p.ovr;
  addFinance('fin.sponsorDeal', 0, {});
  startPhase('kickoff');
}

export function removeFromTeam(p: Player): void {
  const t = p.teamId ? S.teams[p.teamId] : undefined;
  if (t) {
    t.roster = t.roster.filter((x) => x !== p.id);
    for (const r of ROLES) if (t.lineup[r] === p.id) delete t.lineup[r];
  }
  p.teamId = null;
}

export function signPlayer(t: Team, p: Player, until: number): void {
  if (p.teamId) removeFromTeam(p);
  S.freeAgents = S.freeAgents.filter((x) => x !== p.id);
  p.teamId = t.id;
  p.contractUntil = until;
  chemNewcomer(p, t.id);
  t.roster.push(p.id);
}

// ----- Chuyển nhượng của người chơi -----
export function askingPrice(p: Player): number {
  const t = p.teamId ? S.teams[p.teamId] : undefined;
  if (!t) return 0;
  const starter = Object.values(t.lineup).includes(p.id);
  return Math.round(p.value * (starter ? 1.35 : 1.0));
}

export function makeOffer(pid: string, amount: number): { ok: boolean; reason?: string; [k: string]: unknown } {
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

export function acceptOffer(oid: string): void {
  const o = (S.offers || []).find((x) => x.id === oid);
  if (!o) return;
  const p = S.players[o.pid];
  const buyer = S.teams[o.from];
  if (!p || p.teamId !== S.userTeam) { S.offers = (S.offers || []).filter((x) => x.id !== oid); return; }
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
  S.offers = (S.offers || []).filter((x) => x.pid !== p.id);
  S.listed = (S.listed || []).filter((x) => x !== p.id);
  addNews('news.transfer', { player: p.ign, from: old.name, to: buyer.name, fee: o.amount }, true);
}

export function releasePlayer(pid: string): void {
  const p = S.players[pid];
  const years = Math.max(1, p.contractUntil - S.season + 1);
  const cost = Math.round(p.salary * 0.5 * years);
  addFinance('fin.release', -cost, { player: p.ign });
  removeFromTeam(p);
  S.freeAgents.push(p.id);
  addNews('news.released', { player: p.ign }, false);
}

export function renewCost(p: Player): number { return Math.round(p.salary * (1 + Math.max(0, p.ovr - 70) * 0.012 + rand() * 0.05)); }
export function renewContract(pid: string, salary: number, years: number): void {
  const p = S.players[pid];
  p.salary = salary;
  p.contractUntil = S.season + years;
  S.renewed = [...(S.renewed || []), pid];
  p.morale = clamp(p.morale + 8, 0, 100);
}

// ngày tháng theo lịch thật 2026 của từng pha (day: số ngày tính từ đầu mùa)
export function seasonDate(day: number): Date {
  const abs = +day + (S.seasonStartDay || 0);
  const starts = (Object.entries(S.phaseStart || {}) as [Phase, number][]).filter(([, d]) => d <= abs).sort((a, b) => b[1] - a[1]);
  const [ph, d0]: [Phase, number] = starts[0] || ['kickoff', S.seasonStartDay || 0];
  const [[m1, d1], [m2, d2], len] = PHASE_WINDOW[ph] || PHASE_WINDOW.kickoff;
  const from = Date.UTC(S.season, m1, d1), to = Date.UTC(S.season, m2, d2);
  // mỗi ngày thi đấu cách nhau ít nhất 1 ngày lịch (không bao giờ trùng ngày)
  const span = (to - from) / 864e5;
  const off = Math.round((abs - d0) * Math.max(1, span / len));
  return new Date(from + off * 864e5);
}
export { clamp };
