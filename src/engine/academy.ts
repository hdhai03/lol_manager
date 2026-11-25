// Xếp hạng đơn (máy chủ Thách đấu) và Học viện:
// - Mỗi khu vực có một máy chủ; mọi tuyển thủ chuyên nghiệp có tài khoản và vẫn leo rank mỗi ngày,
//   cùng với các tài năng nghiệp dư (chưa thuộc đội nào) để HLV tuyển trạch.
// - Học viện: tuyển tài năng trẻ từ bảng Thách đấu, cho tập luyện, đôn lên đội chính.
import { DB } from './data';
import { ladderData } from './ladder';
import { sqGames, sqAfter, sqOrder, poolChamp } from './life';
import { S, makeRookie, refreshValue, teamPlayers, addNews, addFinance } from './state';
import { signPlayer } from './season';
import { ROLES, clamp, rand, randInt, pick, logistic, gauss, computeOvr, ATTRS } from './util';
import type { Academy, LeagueId, Player, Role, SoloAccount, SoloQ } from './types';

export const SERVER_OF: Record<string, string> = { LCK: 'KR', LPL: 'CN', LEC: 'EUW', LCS: 'NA', LCP: 'TW', CBLOL: 'BR', VCS: 'VN' };
export const SERVERS: string[] = ['KR', 'CN', 'EUW', 'NA', 'TW', 'VN', 'BR'];
const LEAGUE_OF = Object.fromEntries(Object.entries(SERVER_OF).map(([l, s]) => [s, l])) as Record<string, LeagueId>;
const COUNTRY: Record<string, string> = { KR: 'South Korea', CN: 'China', EUW: 'France', NA: 'United States', TW: 'Taiwan', VN: 'Vietnam', BR: 'Brazil' };
const SYL: Record<string, string[]> = { KR: ['Min', 'Jun', 'Seo', 'Hyun', 'Woo', 'Jin', 'Kang', 'Yoon', 'Doh', 'Ha'], CN: ['Xiao', 'Ming', 'Lan', 'Tian', 'Jie', 'Wei', 'Hao', 'Yu', 'Qi', 'Fan'], EUW: ['Nox', 'Vex', 'Lumi', 'Kai', 'Rex', 'Odin', 'Sky', 'Zen', 'Mira', 'Taro'], NA: ['Ace', 'Blaze', 'Cody', 'Drift', 'Echo', 'Flux', 'Grim', 'Hex', 'Ivy', 'Jett'], TW: ['Ah', 'Wen', 'Chen', 'Lin', 'Shu', 'Kuo', 'Yi', 'Pei', 'Ting', 'Hsu'], VN: ['Bin', 'Kai', 'Nam', 'Long', 'Tú', 'Lâm', 'Khoa', 'Huy', 'Bảo', 'Tín'], BR: ['Leo', 'Rafa', 'Duda', 'Gui', 'Tito', 'Caio', 'Biel', 'Juca', 'Nino', 'Zeca'] };
const AMATEURS = 26;
/** máy chủ có dữ liệu thật: ít nghiệp dư ảo hơn */
const AMATEURS_REAL = 12;
const amateurTarget = (srv: { off?: number }): number => (srv.off != null ? AMATEURS_REAL : AMATEURS);
const TIERS: [number, string][] = [[1100, 'challenger'], [800, 'grandmaster'], [500, 'master'], [-1e9, 'diamond']];
export const tierOf = (lp: number): string => (TIERS.find(([v]) => lp >= v) ?? TIERS[TIERS.length - 1])[1];

const mkName = (sv: string): string => {
  const a = pick(SYL[sv]), b = pick(SYL[sv]);
  return (a + (rand() < 0.5 ? b.toLowerCase() : '') + (rand() < 0.35 ? randInt(1, 99) : '')).slice(0, 12);
};
function mkAmateur(sv: string): SoloAccount {
  const age = randInt(15, 19);
  const pot = clamp(Math.round(62 + gauss() * 9 + (sv === 'KR' || sv === 'CN' ? 3 : 0)), 55, 96);
  const ovr = clamp(Math.round(pot - (21 - age) * 3.2 - randInt(2, 9)), 40, pot);
  return { id: 'a' + Math.random().toString(36).slice(2, 9), name: mkName(sv), pr: { age, role: pick(ROLES), ovr, pot }, lp: 0, w: 0, l: 0, ch: {} };
}
const proSkill = (p: { ovr: number; form?: number }): number => (p.ovr ?? 60) + (p.form || 0) * 0.6;
const accSkill = (a: SoloAccount): number => (a.pid ? proSkill(S.players[a.pid] || { ovr: 55 }) : a.pr!.ovr + 4);
/** hạng hiển thị: tài khoản thật dùng hạng OP.GG, còn lại quy từ LP (trừ độ lệch thang điểm máy chủ thật) */
export const accTier = (sv: string, a: SoloAccount): string => a.tier || tierOf(a.lp - (S.soloq?.servers[sv]?.off || 0));

// ----- tài khoản thật từ OP.GG -----
const POSR: Record<string, Role> = { top: 'Top', jungle: 'Jungle', mid: 'Mid', adc: 'Bot', bottom: 'Bot', support: 'Support' };
function realPr(a: SoloAccount, lo: number, hi: number): void {
  const top = Object.keys(a.ch)[0];
  const role = POSR[(a.pro?.pos || '').toLowerCase()] || (top && DB.champions[top]?.roles?.[0] as Role) || pick(ROLES);
  const ovr = clamp(Math.round(70 + ((a.lp - lo) / Math.max(1, hi - lo)) * 20), 70, 92);
  a.pr = { age: 22, role, ovr, pot: ovr };
}
/** gộp top Thách đấu thật vào máy chủ: tài khoản thật giữ đúng LP/thắng-thua/tướng; tuyển thủ trùng tên được liên kết */
export function syncReal(q: SoloQ): void {
  const ld = ladderData();
  if (!ld || q.realAt === ld.fetched) return;
  q.realAt = ld.fetched;
  const byIgn = new Map<string, Player>();
  for (const p of Object.values(S.players)) {
    if (p.retired) continue;
    const k = p.ign.toLowerCase(), cur = byIgn.get(k);
    if (!cur || (p.teamId && !cur.teamId)) byIgn.set(k, p);
  }
  for (const srv of Object.values(q.servers)) srv.acc = srv.acc.filter((a) => !a.real);
  const linked = new Set<string>();
  for (const [sv, rows] of Object.entries(ld.servers)) {
    const srv = q.servers[sv];
    if (!srv || !rows.length) continue;
    const lps = rows.map((r) => r.lp), lo = Math.min(...lps), hi = Math.max(...lps);
    // thang LP mô phỏng dời lên quanh đáy top thật: chỉ người thật sự mạnh và cày nhiều mới chen được vào
    const off = Math.max(0, Math.round(lo - 1550)), d = off - (srv.off || 0);
    if (d) for (const a of srv.acc) a.lp = Math.max(0, a.lp + d);
    srv.off = off;
    for (const r of rows) {
      const a: SoloAccount = { id: `r${sv}:${r.n}#${r.tag}`, real: true, name: r.n, tag: r.tag, tier: r.tier || 'challenger', lp: r.lp, w: r.w, l: r.l, ch: { ...r.ch }, pro: r.pro };
      const p = r.pro?.nick ? byIgn.get(r.pro.nick.toLowerCase()) : undefined;
      if (p && !linked.has(p.id)) { a.pid = p.id; linked.add(p.id); } else realPr(a, lo, hi);
      srv.acc.push(a);
    }
    // bớt nghiệp dư ảo
    const ams = srv.acc.filter((a) => !a.real && !a.pid).sort((x, y) => y.pr!.pot - x.pr!.pot);
    const drop = new Set(ams.slice(AMATEURS_REAL).map((a) => a.id));
    srv.acc = srv.acc.filter((a) => !drop.has(a.id));
  }
  // tuyển thủ đã có tài khoản thật: bỏ tài khoản mô phỏng
  for (const srv of Object.values(q.servers)) srv.acc = srv.acc.filter((a) => a.real || !a.pid || !linked.has(a.pid));
}

export function ensureSoloq(): SoloQ {
  if (S.soloq && S.soloq.servers) { syncReal(S.soloq); return S.soloq; }
  const servers: SoloQ['servers'] = {};
  for (const sv of SERVERS) {
    const lg = LEAGUE_OF[sv];
    const pros = Object.values(S.players).filter((p) => p.teamId && S.teams[p.teamId]?.league === lg && !p.retired);
    const acc: SoloAccount[] = pros.map((p) => ({ id: 'p' + p.id, pid: p.id, lp: 0, w: 0, l: 0, ch: {} }));
    for (let i = 0; i < AMATEURS; i++) acc.push(mkAmateur(sv));
    for (const a of acc) {
      a.lp = Math.round(250 + (accSkill(a) - 60) * 38 + rand() * 260);
      // đã chơi một phần mùa
      const g = randInt(60, 320);
      a.w = Math.round(g * clamp(0.5 + (accSkill(a) - 72) / 220 + gauss() * 0.02, 0.4, 0.66)); a.l = g - a.w;
    }
    servers[sv] = { acc };
  }
  S.soloq = { servers };
  syncReal(S.soloq);
  return S.soloq;
}

// mỗi ngày: mọi tài khoản đánh vài trận xếp hạng
export function soloqDay(matchToday: Set<string>): void {
  const q = ensureSoloq();
  const have = new Set(Object.values(q.servers).flatMap((srv) => srv.acc.filter((a) => a.pid).map((a) => a.pid)));
  for (const [sv, srv] of Object.entries(q.servers)) {
    // đồng bộ: tuyển thủ chuyển đội/giải mới, tuyển thủ mới
    const lg = LEAGUE_OF[sv];
    const off = srv.off || 0;
    for (const p of Object.values(S.players)) if (p.teamId && S.teams[p.teamId]?.league === lg && !p.retired && !have.has(p.id)) { srv.acc.push({ id: 'p' + p.id, pid: p.id, lp: 400 + off, w: 0, l: 0, ch: {} }); have.add(p.id); }
    for (const a of srv.acc) if (a.real && a.pid && (!S.players[a.pid] || S.players[a.pid].retired)) { delete a.pid; realPr(a, a.lp, a.lp); }
    srv.acc = srv.acc.filter((a) => !a.pid || (S.players[a.pid] && !S.players[a.pid].retired));
    const skills = srv.acc.filter((a) => !a.real).map(accSkill).sort((x, y) => x - y);
    const med = skills[Math.floor(skills.length * 0.6)] || 65;
    for (const a of srv.acc) {
      const p = a.pid ? S.players[a.pid] : null;
      // tài khoản thật không có tuyển thủ: giữ nguyên số liệu OP.GG
      if (a.real && !p) continue;
      let n = p ? (matchToday.has(p.teamId ?? "") ? randInt(0, 2) : randInt(2, 6)) : randInt(3, 9);
      if (p && (p.cond ?? 100) < 55 && sqOrder(p.id) !== 'grind') n = Math.min(n, 1);
      if (p) n = sqGames(p, n);
      if (p?.injury) n = 0;
      const pool = p && sqOrder(p.id) === 'pool';
      let wins = 0;
      for (let i = 0; i < n; i++) {
        // LP cao thì gặp đối thủ mạnh hơn
        const opp = med + ((a.real ? 1550 : a.lp - off) - 700) / 55 + gauss() * 3;
        const win = rand() < logistic((accSkill(a) - opp) / 5);
        const d = win ? randInt(17, 24) * (pool ? 0.6 : 1) : -randInt(15, 21);
        if (win) wins++;
        // tài khoản thật: LP/thắng-thua lấy từ OP.GG, chỉ tính hiệu ứng luyện tập
        if (!a.real) { a.lp = Math.max(0, a.lp + d); if (win) a.w++; else a.l++; }
        const champ = p ? (pool ? poolChamp(p) : p.pool[Math.floor(Math.pow(rand(), 1.8) * Math.min(p.pool.length, 8))]?.c) : metaChamp(a.pr!.role);
        if (champ && !a.real) a.ch[champ] = (a.ch[champ] || 0) + 1;
        // luyện tướng: tướng meta dần vào bể tướng (mỗi trận xếp hạng = 0.3 trận thi đấu)
        if (pool && champ && p) { const pe = p.pool.find((x) => x.c === champ); if (pe) { pe.g += 0.3; if (win) pe.w += 0.3; } else if (p.pool.length < 12) p.pool.push({ c: champ, g: 0.3, w: win ? 0.3 : 0 }); }
      }
      // chỉ giữ 4 tướng chơi nhiều nhất
      const top = Object.entries(a.ch).sort((x, y) => y[1] - x[1]).slice(0, 4);
      a.ch = Object.fromEntries(top);
      // tuyển thủ chuyên nghiệp leo rank tốt thì phong độ nhích lên, cày quá nhiều thì mệt
      if (p && n) {
        p.form = clamp((p.form || 0) + (wins * 2 >= n ? 0.02 : -0.02), -5, 5);
        p.cond = clamp((p.cond ?? 100) - n * 0.6, 20, 100);
      }
      if (p) sqAfter(p, n, wins);
      // tài năng nghiệp dư tiến bộ dần
      if (!p && !a.real && a.pr!.ovr < a.pr!.pot && rand() < 0.03 + (a.pr!.pot - a.pr!.ovr) * 0.002) a.pr!.ovr++;
    }
  }
}
const metaCache: Partial<Record<Role, { id: string }[]>> = {};
function metaChamp(role: Role): string | null {
  const list = (metaCache[role] ??= DB.champList.filter((c) => c.roles.includes(role)).sort((a, b) => b.power - a.power).slice(0, 18));
  return list.length ? pick(list).id : null;
}

export const ladder = (sv: string): SoloAccount[] => [...(ensureSoloq().servers[sv]?.acc || [])].sort((a, b) => b.lp - a.lp);

// mùa mới: reset LP (giữ một phần), tài năng lớn tuổi được các đội ký, bổ sung tài năng mới
export function soloqNewSeason(): void {
  const q = ensureSoloq();
  for (const [sv, srv] of Object.entries(q.servers)) {
    const keep: SoloAccount[] = [];
    const off = srv.off || 0;
    for (const a of srv.acc) {
      // tài khoản thật: giữ nguyên, cập nhật lại từ OP.GG
      if (a.real) { keep.push(a); continue; }
      if (!a.pid && a.pr!.age >= 19 && a.lp - off > 900 && rand() < 0.6) {
        // một đội trong khu vực ký hợp đồng (vào danh sách tự do để AI chọn)
        const p = makeRookie(LEAGUE_OF[sv], a.pr!.role);
        Object.assign(p, { ign: a.name, age: a.pr!.age, country: COUNTRY[sv] || p.country });
        setRatings(p, a.pr!.ovr, a.pr!.pot);
        S.freeAgents.push(p.id);
        continue;
      }
      if (!a.pid) a.pr!.age++;
      if (!a.pid && a.pr!.age > 21) continue;
      a.lp = Math.round((a.lp - off) * 0.55 + 150 + off); a.w = 0; a.l = 0;
      keep.push(a);
    }
    while (keep.filter((a) => !a.pid && !a.real).length < amateurTarget(srv)) { const a = mkAmateur(sv); a.lp = Math.round(200 + rand() * 300 + off); keep.push(a); }
    srv.acc = keep;
  }
}

function setRatings(p: Player, ovr: number, pot: number): void {
  const shift = ovr - p.ovr;
  for (const k of ATTRS) if (k !== 'aggression') p.stats[k] = clamp(p.stats[k] + shift, 30, 99);
  p.ovr = computeOvr(p);
  p.potential = Math.max(pot, p.ovr);
  refreshValue(p);
}

// ----- Học viện -----
export function ensureAcademy(): Academy {
  S.academy ??= { focus: SERVER_OF[S.teams[S.userTeam].league] || 'KR', days: {}, intensity: 'normal' };
  return S.academy;
}
export const academyPlayers = (): Player[] => Object.values(S.players).filter((p) => p.academyOf === S.userTeam && !p.retired);
export const ACADEMY_MAX = 6;
export const inviteCost = (a: SoloAccount): number => Math.round(25 + Math.max(0, a.pr!.pot - 65) * 6 + Math.max(0, a.pr!.ovr - 55) * 2);

// độ chính xác tuyển trạch: tập trung một máy chủ càng lâu càng biết rõ tiềm năng
export function potRange(sv: string, a: SoloAccount): [number, number] {
  const days = ensureAcademy().days[sv] || 0;
  const err = clamp(Math.round(10 - days / 4), 1, 10);
  const h = [...a.id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const off = ((h % (2 * err + 1)) - err);
  const mid = a.pr!.pot + Math.round(off / 2);
  return [clamp(mid - err, 40, 99), clamp(mid + err, 40, 99)];
}

export function academyDay(): void {
  const ac = ensureAcademy();
  ac.days[ac.focus] = (ac.days[ac.focus] || 0) + 1;
  // tập luyện học viện: tiến bộ nhanh hơn đội chính (không phải thi đấu)
  const mult = { light: 0.6, normal: 1, hard: 1.5 }[ac.intensity] || 1;
  for (const p of academyPlayers()) {
    const gap = p.potential - p.ovr;
    if (gap > 0 && rand() < (0.08 + gap * 0.008) * mult) {
      const a = pick(ATTRS.filter((x) => x !== 'aggression'));
      p.stats[a] = clamp(p.stats[a] + 1, 30, 99);
      p.ovr = computeOvr(p);
    }
    if (ac.intensity === 'hard') p.cond = clamp((p.cond ?? 100) - 2, 30, 100);
  }
}

export function inviteToAcademy(sv: string, accId: string): { ok: true; p: Player } | { ok: false; why: string } {
  const ac = ensureAcademy();
  const srv = ensureSoloq().servers[sv];
  const a = srv.acc.find((x) => x.id === accId);
  if (!a || a.pid) return { ok: false, why: 'gone' };
  if (academyPlayers().length >= ACADEMY_MAX) return { ok: false, why: 'full' };
  const cost = inviteCost(a);
  const ut = S.teams[S.userTeam];
  if (ut.budget < cost) return { ok: false, why: 'money' };
  const p = makeRookie(LEAGUE_OF[sv], a.pr!.role);
  Object.assign(p, { ign: a.name, age: a.pr!.age, country: COUNTRY[sv] || p.country, academyOf: S.userTeam, salary: Math.round(10 + a.pr!.ovr * 0.3) });
  S.freeAgents = S.freeAgents.filter((id) => id !== p.id);
  setRatings(p, a.pr!.ovr, a.pr!.pot);
  p.pool = Object.keys(a.ch).map((c) => ({ c, g: a.ch[c], w: Math.round(a.ch[c] * 0.55) }));
  a.pid = p.id; // tài khoản giờ là của tuyển thủ học viện
  delete a.pr;
  addFinance('fin.academy', -cost);
  addNews('news.academyJoin', { player: p.ign, team: ut.name }, true);
  void ac;
  return { ok: true, p };
}

export function promoteFromAcademy(pid: string): boolean {
  const p = S.players[pid];
  const ut = S.teams[S.userTeam];
  if (!p || p.academyOf !== ut.id) return false;
  if (ut.roster.length >= 10) return false;
  p.academyOf = null;
  p.fromAcademy = ut.id;
  signPlayer(ut, p, S.season + 2);
  addNews('news.promotedYouth', { player: p.ign, team: ut.name }, true);
  return true;
}
export function releaseFromAcademy(pid: string): void {
  const p = S.players[pid];
  if (!p) return;
  p.academyOf = null;
  S.freeAgents.push(p.id);
}
export { teamPlayers };
