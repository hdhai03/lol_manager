// Đàm phán hợp đồng: tuyển thủ (qua người đại diện) có yêu cầu lương, thời hạn, vai trò, điều khoản giải phóng.
// Đội AI cũng chủ động hỏi mua; điều khoản giải phóng bị kích hoạt thì tuyển thủ tự ra đi.
import { S, addNews, addFinance, userTeam, teamOvr, teamPlayers, autoLineup } from './state';
import { clamp, rand, pick, randInt } from './util';
import { acceptOffer, signPlayer, askingPrice } from './season';
import { windowOpen, rivalBid } from './club';
import { capBlocks } from './squadx';
import { ambitionFit, ambitionOf, rivalSuitor } from './market';
import type { Player, Role } from './types';

export type RolePromise = 'starter' | 'rotation' | 'none';
export interface Terms { salary: number; years: number; role: RolePromise; clause: number | null; bonus: boolean }
export interface Demand { salary: number; years: number; role: RolePromise; minClause: number; agent: string }
export interface NegoState { pid: string; round: number; mood: number; last?: string; blockedUntil?: number }

const AGENTS = ['Kim J.', 'Lee S.', 'Park H.', 'Wang Y.', 'Chen L.', 'M. Rossi', 'L. Martin', 'J. Smith', 'Nguyễn T.', 'Trần H.', 'R. Silva', 'K. Tanaka'];
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const agentOf = (p: Player): string => AGENTS[hash(p.id) % AGENTS.length];

const bestInRole = (teamId: string, role: Role, except: string) => Math.max(0, ...teamPlayers(S.teams[teamId]).filter((x) => x.role === role && x.id !== except).map((x) => x.ovr));

/** yêu cầu của tuyển thủ khi ký với đội teamId (lương: nghìn $/năm) */
export function demandOf(p: Player, teamId: string): Demand {
  const t = S.teams[teamId];
  let salary = p.salary * (1 + Math.max(0, p.ovr - 70) * 0.012);
  // đội yếu hơn tầm của tuyển thủ thì phải trả thêm; đội mạnh thì được giảm
  const gap = p.ovr - teamOvr(t);
  salary *= clamp(1 + gap * 0.012, 0.88, 1.3);
  if (p.teamId === teamId) salary *= 0.97; // ở lại thì dễ chịu hơn
  const years = p.age >= 27 ? 3 : p.age <= 21 ? 1 : 2;
  const best = bestInRole(teamId, p.role, p.id);
  const role: RolePromise = p.ovr >= best - 2 ? 'starter' : p.ovr >= best - 7 ? 'rotation' : 'none';
  return { salary: Math.round(salary), years, role, minClause: Math.round(p.value * (p.ovr >= 85 ? 1.6 : 2.2)), agent: agentOf(p) };
}

const ROLE_V: Record<RolePromise, number> = { starter: 2, rotation: 1, none: 0 };
/** mức hài lòng 0..~1.3 (≥1 là chấp nhận) */
export function satisfaction(p: Player, teamId: string, tm: Terms): number {
  const d = demandOf(p, teamId);
  let s = (tm.salary / d.salary) * (ambitionOf(p) === 'money' ? 0.8 : 0.72) - (ambitionOf(p) === 'money' ? 0.08 : 0);
  s += tm.years === d.years ? 0.1 : Math.abs(tm.years - d.years) === 1 ? 0.04 : -0.04;
  s += (ROLE_V[tm.role] - ROLE_V[d.role]) * 0.08 + (tm.role === 'starter' ? 0.04 : 0);
  // điều khoản giải phóng: tuyển thủ thích có điều khoản vừa phải (dễ ra đi khi có đội lớn hỏi)
  if (tm.clause == null) s -= p.ovr >= 82 ? 0.05 : 0;
  else s += tm.clause <= d.minClause ? 0.06 : tm.clause <= d.minClause * 1.6 ? 0.02 : -0.02;
  if (tm.bonus) s += 0.05;
  // động lực cá nhân: danh hiệu / quê nhà / thời gian thi đấu
  s += ambitionFit(p, S.teams[teamId], tm.role === 'starter');
  // tinh thần / danh tiếng đội của bạn
  s += ((p.morale ?? 70) - 70) / 600 + (S.career ? (S.career.rep - 50) / 900 : 0) + (S.fac?.house ?? 0) * 0.025;
  return +s.toFixed(3);
}
export const termCost = (tm: Terms): number => Math.round(tm.salary * (tm.bonus ? 1.05 : 1));

export function negoState(pid: string): NegoState {
  S.nego ??= {};
  return (S.nego[pid] ??= { pid, round: 0, mood: 1 });
}
export type NegoResult = { verdict: 'accept' | 'counter' | 'reject' | 'blocked'; sat: number; counter?: Partial<Terms>; msg: string };
/** gửi đề nghị; tối đa 3 lượt, mỗi lượt trả thấp làm tuyển thủ mất kiên nhẫn */
export function propose(p: Player, teamId: string, tm: Terms): NegoResult {
  const st = negoState(p.id);
  if (st.blockedUntil != null && S.day < st.blockedUntil) return { verdict: 'blocked', sat: 0, msg: 'ng.blocked' };
  st.round++;
  const sat = satisfaction(p, teamId, tm) * st.mood;
  // đội AI cạnh tranh: phải hấp dẫn hơn lời mời của họ
  const rv = teamId === S.userTeam ? rivalSuitor(p) : null;
  const need = rv ? Math.max(1, rv.pull) : 1;
  if (sat >= need) { delete S.nego![p.id]; if (S.suitors) delete S.suitors[p.id]; return { verdict: 'accept', sat, msg: 'ng.accept' }; }
  if (rv && sat >= 1) return { verdict: 'counter', sat, counter: { salary: Math.round(tm.salary * (1 + (need - sat) * 1.3 + 0.02)) }, msg: 'ng.rival' };
  const d = demandOf(p, teamId);
  if (st.round >= 3 || sat < 0.7) {
    st.blockedUntil = S.day + 14; st.round = 0; st.mood = 1;
    return { verdict: 'reject', sat, msg: sat < 0.7 ? 'ng.insult' : 'ng.walk' };
  }
  st.mood = clamp(st.mood - (1 - sat) * 0.25, 0.75, 1);
  const counter: Partial<Terms> = { salary: Math.round(Math.max(tm.salary, d.salary * (1.02 - st.round * 0.03))) };
  if (ROLE_V[tm.role] < ROLE_V[d.role]) counter.role = d.role;
  if (tm.years !== d.years) counter.years = d.years;
  return { verdict: 'counter', sat, counter, msg: 'ng.counter' };
}
/** áp dụng hợp đồng đã đồng ý (gia hạn hoặc ký mới) */
export function applyTerms(p: Player, tm: Terms): void {
  p.salary = termCost(tm);
  p.contractUntil = S.season + tm.years;
  p.clause = tm.clause ?? undefined;
  p.promise = tm.role === 'none' ? undefined : tm.role;
  p.bonus = tm.bonus || undefined;
  // phí người đại diện: 5% lương năm đầu
  addFinance('fin.agentFee', -Math.round(p.salary * 0.05), { player: p.ign });
}
export function renewWith(p: Player, tm: Terms): void {
  applyTerms(p, tm);
  S.renewed = [...(S.renewed || []), p.id];
  p.morale = clamp((p.morale ?? 70) + 8, 0, 100);
}
/** mua (phí chuyển nhượng cho CLB) + ký hợp đồng cá nhân */
export function buyWith(p: Player, fee: number, tm: Terms): { ok: boolean; reason?: string; rival?: { team: string; amount: number } } {
  const ut = userTeam();
  if (ut.roster.length >= 10) return { ok: false, reason: 'tr.rosterFull' };
  if (capBlocks(termCost(tm))) return { ok: false, reason: 'tr.overCap' };
  if (p.teamId) {
    if (!windowOpen()) return { ok: false, reason: 'tr.windowClosed' };
    if (fee > ut.budget) return { ok: false, reason: 'tr.noBudget' };
    const rb = rivalBid(p, fee);
    if (rb) return { ok: false, reason: 'tr.rival', rival: rb };
    const clauseHit = p.clause != null && fee >= p.clause;
    if (!clauseHit && fee < askingPrice(p) * (0.9 + rand() * 0.2)) return { ok: false, reason: 'tr.rejected' };
    const seller = S.teams[p.teamId];
    addFinance('fin.transferIn', -fee, { player: p.ign });
    seller.budget += fee;
    signPlayer(ut, p, S.season + tm.years);
    if (!teamPlayers(seller).some((x) => x.role === p.role)) {
      const fa = S.freeAgents.map((id) => S.players[id]).filter((x) => x.role === p.role).sort((a, b) => b.ovr - a.ovr)[0];
      if (fa) signPlayer(seller, fa, S.season + 1);
    }
    autoLineup(seller);
    addNews('news.transfer', { player: p.ign, from: seller.name, to: ut.name, fee }, true);
  } else {
    signPlayer(ut, p, S.season + tm.years);
    addNews('news.signedFA', { player: p.ign, team: ut.name }, true);
  }
  applyTerms(p, tm);
  return { ok: true };
}

/** mỗi ngày: đội AI hỏi mua tuyển thủ giỏi của bạn; giữ lời hứa vai trò */
export function contractsDay(playing: Set<string>): void {
  const ut = userTeam();
  for (const p of teamPlayers(ut)) {
    // lời hứa đá chính: ngày có trận mà không được ra sân thì buồn
    if (p.promise === 'starter' && playing.has(ut.id) && !Object.values(ut.lineup).includes(p.id)) {
      p.morale = clamp((p.morale ?? 70) - 2, 20, 100);
      if (rand() < 0.1) addNews('news.promiseBroken', { player: p.ign }, true);
    }
    if (p.ovr < 80 || (S.listed || []).includes(p.id) || rand() > 0.012) continue;
    const buyers = Object.values(S.teams).filter((x) => x.id !== ut.id && x.budget > p.value * 0.9 && teamOvr(x) >= p.ovr - 10);
    if (!buyers.length) continue;
    const b = pick(buyers);
    const amount = Math.round(p.value * (0.9 + rand() * 0.45));
    // điều khoản giải phóng bị kích hoạt: tuyển thủ tự ra đi
    if (p.clause != null && amount >= p.clause && p.ovr >= teamOvr(ut) - 2) {
      S.offers = S.offers || [];
      const id = 'c' + randInt(1e5, 1e6);
      S.offers.push({ id, pid: p.id, from: b.id, amount: Math.max(amount, p.clause), day: S.day });
      acceptOffer(id);
      addNews('news.clauseHit', { player: p.ign, team: b.name }, true);
      continue;
    }
    S.offers = S.offers || [];
    if (S.offers.some((o) => o.pid === p.id)) continue;
    S.offers.push({ id: 'u' + randInt(1e5, 1e6), pid: p.id, from: b.id, amount, day: S.day });
    addNews('news.bid', { player: p.ign, team: b.name }, true);
  }
}
