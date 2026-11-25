// Mô phỏng cấm/chọn và trận đấu
import { DB } from './data';
import { milestones } from './club2';
import { isFlex, aiEarly, defaultEarly, earlyEdge, flexBonus, counterTempo, habitBan, trackHabits, type EarlyPlan } from './matchx';
import { S, lineupPlayers, fillLineup } from './state';
import { ROLES, rand, clamp, logistic, gauss } from './util';
import { runGame, type RunInput, type Order } from './engine';
import { opggAdj, opggPos } from './runes';
import { synergyScore, synergyBonus } from './synergy';
import { patchMod, patchFitBonus } from './patch';
import { lineChem, chemPairs, boostMods } from './life';
import { careerOnSeries } from './career';
import { derbySwing, styleTactics, hypeAfterGame, socialOnSeries } from './world';
import { teamColor } from './squadx';
import { masteryFit, honorSeries } from './lolx';
import { analystDay } from './staff';
import { aiTactics, drainCondition } from './attrs';
import { gprOnSeries } from './gpr';
import { archiveGame } from './awards';
import type { Draft, GameRecord, GameResult, Match, Player, Role, Side, Picks, Tactics } from './types';

type Line = Partial<Record<Role, Player | null>>;

// Thứ tự cấm/chọn chuẩn giải chuyên nghiệp
export const DRAFT_ORDER: [Side, 'ban' | 'pick'][] = [
  ['B', 'ban'], ['R', 'ban'], ['B', 'ban'], ['R', 'ban'], ['B', 'ban'], ['R', 'ban'],
  ['B', 'pick'], ['R', 'pick'], ['R', 'pick'], ['B', 'pick'], ['B', 'pick'], ['R', 'pick'],
  ['R', 'ban'], ['B', 'ban'], ['R', 'ban'], ['B', 'ban'],
  ['R', 'pick'], ['B', 'pick'], ['B', 'pick'], ['R', 'pick'],
];

// Độ hợp tướng của tuyển thủ (0-100)
export function champFit(p: Player | null | undefined, champId: string | undefined, role: Role): number {
  const c = champId ? DB.champions[champId] : undefined;
  if (!c || !p) return 30;
  let fit = 22 + c.power * 0.5 + opggAdj(champId!, role) * 300 + patchMod(champId!) * 300 + patchFitBonus(p, champId!) + masteryFit(p, champId!);
  const pe = p.pool.find((x) => x.c === champId);
  if (pe) fit += Math.min(pe.g, 25) * 0.9 + (pe.g >= 3 ? (pe.w / pe.g - 0.5) * 20 : 0);
  if (!c.roles.includes(role)) fit -= 25;
  return clamp(fit, 0, 100);
}

export function effRating(p: Player | null | undefined, champId: string | undefined, role: Role): number {
  if (!p) return 35;
  let r = p.ovr + (champFit(p, champId, role) - 60) * 0.12 + (p.form || 0) * 0.5;
  if (p.role !== role) r -= 8;
  return r;
}

export function compScore(champIds: (string | undefined)[]): number {
  const cs = champIds.map((id) => DB.champions[id ?? '']).filter(Boolean);
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

export function compTraits(champIds: (string | undefined)[]): { tanks: number; apShare: number; score: number } {
  const cs = champIds.map((id) => DB.champions[id ?? '']).filter(Boolean);
  const tanks = cs.filter((c) => c.tags.includes('Tank')).length;
  const ap = cs.reduce((s, c) => s + c.info.magic, 0);
  const ad = cs.reduce((s, c) => s + c.info.attack, 0);
  return { tanks, apShare: ap / Math.max(ap + ad, 1), score: compScore(champIds) };
}

// ----- AI cấm chọn -----
// locked: tướng đã dùng ở các ván trước trong loạt (Hard Fearless Draft — mỗi tướng chỉ được chọn một lần trong cả loạt)
export function newDraft(blueTeamId: string, redTeamId: string, locked: string[] = []): Draft {
  return { blue: blueTeamId, red: redTeamId, step: 0, bans: { B: [], R: [] }, picks: { B: {}, R: {} }, log: [], locked: [...locked] };
}
export const draftTaken = (d: Draft): Set<string> => new Set<string>([...d.bans.B, ...d.bans.R, ...(Object.values(d.picks.B) as string[]), ...(Object.values(d.picks.R) as string[]), ...(d.locked || [])]);
export const openRoles = (d: Draft, side: Side): Role[] => ROLES.filter((r) => !d.picks[side][r]);

function lineupMap(teamId: string): Line {
  const m: Line = {};
  for (const { role, p } of lineupPlayers(S.teams[teamId])) m[role] = p;
  return m;
}

export function aiChoose(d: Draft): { champ: string; role?: Role } {
  const [side, type] = DRAFT_ORDER[d.step];
  const taken = draftTaken(d);
  const me = side === 'B' ? d.blue : d.red;
  const opp = side === 'B' ? d.red : d.blue;
  const myLine = lineupMap(me);
  if (type === 'ban') {
    const oppSide = side === 'B' ? 'R' : 'B';
    const oppLine = lineupMap(opp);
    const roles = openRoles(d, oppSide);
    let best: string | null = null, bestS = -1e9;
    const oppPicks = Object.values(d.picks[oppSide]);
    for (const c of DB.champList) {
      if (taken.has(c.id)) continue;
      let s = -1e9;
      for (const r of roles) {
        if (!c.roles.includes(r)) continue;
        // cấm nhắm vào tuyển thủ: tướng tủ của người giỏi bị cấm trước; tướng mạnh sau bản cập nhật cũng vậy
        const p = oppLine[r];
        const w = p ? clamp((p.ovr - 70) / 18, 0.4, 1.4) : 0.6;
        s = Math.max(s, champFit(p, c.id, r) * w + c.power * 0.25 + patchMod(c.id) * 300 + opggAdj(c.id, r) * 150 + habitBan(c.id, opp));
      }
      if (s < -1e8) continue;
      // không để đối thủ hoàn thành combo
      s += (synergyScore([...oppPicks, c.id]) - synergyScore(oppPicks)) * 6;
      s += rand() * 6;
      if (s > bestS) { bestS = s; best = c.id; }
    }
    return { champ: best ?? DB.champList.find((x) => !taken.has(x.id))!.id };
  }
  const roles = openRoles(d, side);
  let best: { champ: string; role: Role } | null = null, bestS = -1e9;
  for (const x of pickScores(d, side)) {
    const s = x.s + rand() * 6;
    if (s > bestS) { bestS = s; best = { champ: x.champ, role: x.role }; }
  }
  if (!best) { // dự phòng: tướng bất kỳ
    const c = DB.champList.find((x) => !taken.has(x.id))!;
    best = { champ: c.id, role: roles[0] };
  }
  return best;
}

/** điểm chọn tướng cho một phe: độ hợp tuyển thủ + đội hình cân bằng + bản sắc + khắc chế đường đối diện */
export function pickScores(d: Draft, side: Side): { champ: string; role: Role; s: number; why: string[] }[] {
  const taken = draftTaken(d);
  const me = side === 'B' ? d.blue : d.red;
  const oppSide: Side = side === 'B' ? 'R' : 'B';
  const myLine = lineupMap(me);
  const roles = openRoles(d, side);
  const current = Object.values(d.picks[side]);
  const synNow = synergyScore(current);
  const out: { champ: string; role: Role; s: number; why: string[] }[] = [];
  for (const c of DB.champList) {
    if (taken.has(c.id)) continue;
    for (const r of roles) {
      if (!c.roles.includes(r)) continue;
      const why: string[] = [];
      let s = champFit(myLine[r], c.id, r) + compScore([...current, c.id]) * 3;
      const syn = synergyScore([...current, c.id]) - synNow;
      if (syn > 0) { s += syn * 5; why.push('syn'); }
      // khắc chế: tướng nằm trong danh sách "khắc chế bởi" của tướng đối diện
      const vs = d.picks[oppSide][r];
      if (vs && opggPos(vs, r)?.counters?.includes(c.id)) { s += 7; why.push('counter'); }
      if (patchMod(c.id) > 0.01) { why.push('buff'); }
      if (myLine[r]?.pool.slice(0, 3).some((x) => x.c === c.id)) why.push('comfort');
      // chọn sớm tướng đa vị trí: giấu ý đồ
      if (d.log.filter((x) => x.side === side && x.type === 'pick').length < 3 && isFlex(c.id, me)) { s += 2; why.push('flex'); }
      out.push({ champ: c.id, role: r, s, why });
    }
  }
  return out;
}
/** gợi ý cho người chơi: 3 lựa chọn tốt nhất (khác tướng) */
export function draftSuggest(d: Draft, side: Side, n = 3) {
  const seen = new Set<string>();
  return pickScores(d, side).sort((a, b) => b.s - a.s).filter((x) => (seen.has(x.champ) ? false : (seen.add(x.champ), true))).slice(0, n);
}

export function applyDraftAction(d: Draft, champ: string, role?: Role | null): void {
  const [side, type] = DRAFT_ORDER[d.step];
  if (type === 'ban') d.bans[side].push(champ);
  else {
    // chọn theo lượt: nếu không chỉ định vị trí, xếp tướng vào vị trí trống hợp nhất (đổi lại được sau)
    if (!role || d.picks[side][role]) role = bestOpenRole(d, side, champ);
    d.picks[side][role] = champ;
  }
  d.log.push({ side, type, champ, role: role ?? null });
  d.step++;
}

export function bestOpenRole(d: Draft, side: Side, champ: string): Role {
  const line = lineupMap(side === 'B' ? d.blue : d.red);
  const roles = openRoles(d, side);
  return roles.sort((a, b) => champFit(line[b], champ, b) - champFit(line[a], champ, a))[0];
}

// đổi tướng giữa 2 vị trí của cùng một đội
export function swapPicks(d: Draft, side: Side, r1: Role, r2: Role): void {
  const p = d.picks[side];
  [p[r1], p[r2]] = [p[r2], p[r1]];
  for (const r of [r1, r2]) if (!p[r]) delete p[r];
}

export function autoDraft(blueId: string, redId: string, locked: string[] = []): Draft {
  const d = newDraft(blueId, redId, locked);
  while (d.step < DRAFT_ORDER.length) {
    const ch = aiChoose(d);
    applyDraftAction(d, ch.champ, ch.role);
  }
  return d;
}

// ----- Mô phỏng ván đấu -----
// Ước lượng sức mạnh trước trận (hiển thị tỉ lệ thắng); kết quả thật do engine.js mô phỏng nhịp-theo-nhịp
export function teamPower(teamId: string, picks: Picks[Side]): number {
  const line = lineupMap(teamId);
  let sum = 0;
  for (const r of ROLES) sum += effRating(line[r], picks[r], r);
  return sum / 5 + compScore(Object.values(picks)) + synergyScore(Object.values(picks)) * 0.6;
}

export function simulateGame(d: Draft, opts: { record?: boolean; series?: number } = {}): GameResult {
  const lines: Record<Side, Line> = { B: lineupMap(d.blue), R: lineupMap(d.red) };
  const fits: Record<Side, Partial<Record<Role, number>>> = { B: {}, R: {} };
  for (const sd of ['B', 'R'] as Side[]) for (const r of ROLES) fits[sd][r] = champFit(lines[sd][r], d.picks[sd][r], r);
  // kế hoạch đầu trận & tướng đa vị trí
  const plan = (sd: Side): EarlyPlan => { const tid = sd === 'B' ? d.blue : d.red; return tid === S.userTeam ? (S.tactics?.early ?? defaultEarly()) : aiEarly(tid, sd === 'B' ? d.red : d.blue); };
  const plans = { B: plan('B'), R: plan('R') };
  const edge = earlyEdge(plans.B, plans.R);
  const flex = { B: flexBonus(d, 'B'), R: flexBonus(d, 'R') };
  const tac = (sd: Side) => {
    const tid = sd === 'B' ? d.blue : d.red;
    const mine = tid === S.userTeam;
    const other = sd === 'B' ? d.red : d.blue;
    const base = mine && S.tactics ? S.tactics : styleTactics(tid, aiTactics(d.picks[sd], lines[sd]));
    // AI bắt bài nhịp độ quen thuộc của người chơi
    const ct = mine ? null : counterTempo(other);
    if (ct) { base.tempo = ct; if (base.phase) base.phase = { early: ct, mid: ct, late: base.phase.late }; }
    const bm = mine ? boostMods() : { day: 0, chem: 0, rune: 0, fresh: false };
    if (mine) bm.day += analystDay();
    const chem = lineChem(tid);
    if (bm.chem) for (const r of ROLES) if (chem[r] != null) chem[r]! += bm.chem;
    return { ...base, day: gauss() * 5 + bm.day + derbySwing(tid, other) + teamColor(S.teams[tid]).bonus, chem, runeB: bm.rune, fresh: bm.fresh, synB: synergyBonus(Object.values(d.picks[sd])) + flex[sd].bonus, dayE: edge[sd] }; // phong độ chung của cả đội trong ngày
  };
  // ảnh chụp tuyển thủ lúc vào trận (để phát lại / ra lệnh giữa trận cho đúng diễn biến)
  const snap = (p: Player | null | undefined): Player | null => (p ? ({ id: p.id, ign: p.ign, role: p.role, stats: { ...p.stats }, cond: p.cond, morale: p.morale, form: p.form } as Player) : null);
  const snapLines = { B: Object.fromEntries(ROLES.map((r) => [r, snap(lines.B[r])])), R: Object.fromEntries(ROLES.map((r) => [r, snap(lines.R[r])])) } as RunInput['lines'];
  const rin: RunInput = { blue: d.blue, red: d.red, picks: d.picks, bans: d.bans, lines: snapLines, fits, tactics: { B: tac('B'), R: tac('R') }, record: !!opts.record, series: opts.series || 0, seed: Math.floor(rand() * 2 ** 31) };
  for (const sd of ['B', 'R'] as Side[]) { const tt = rin.tactics[sd] as Tactics & { dayE?: number }; tt.day = (tt.day || 0) + (tt.dayE || 0); delete tt.dayE; }
  const g = runGame(rin);
  g.rin = rin;
  g.early = { ...edge, plans };
  g.flex = { B: flex.B.champs, R: flex.R.champs };
  g.pWinB = +logistic((teamPower(d.blue, d.picks.B) - teamPower(d.red, d.picks.R)) / 5.5).toFixed(3);
  return g;
}

/** mô phỏng lại một ván với các lệnh mới (cùng seed → diễn biến trước lệnh không đổi) */
export function resimGame(g: GameResult, orders: Order[]): GameResult {
  if (!g.rin) return g;
  const rin: RunInput = { ...g.rin, orders, record: true };
  const n = runGame(rin);
  n.rin = rin;
  n.pWinB = g.pWinB;
  return n;
}

// cập nhật phong độ/thống kê sau ván
export function applyGameResult(g: GameResult): void {
  trackHabits(g);
  milestones(g);
  // đánh giải cùng nhau: tăng độ ăn ý
  chemPairs(g.blue, 0.35);
  chemPairs(g.red, 0.35);
  for (const x of g.players) {
    const p = x.pid ? S.players[x.pid] : undefined;
    if (!p) continue;
    const win = x.side === g.winner;
    // điểm phong độ ván (0-10) và tổng mạng hạ của đội (tính KP%)
    const tk = g.players.filter((y) => y.side === x.side).reduce((s, y) => s + y.k, 0);
    const rt = clamp(6 + (x.k + x.a * 0.6 - x.d * 0.9) / 3 + (win ? 0.6 : -0.4) + (g.mvp === p.id ? 1 : 0), 1, 10);
    p.fh = [...(p.fh || []), +rt.toFixed(1)].slice(-20);
    hypeAfterGame(p, rt, g.mvp === p.id);
    for (const k of ['season', 'career'] as const) {
      const st = p[k];
      st.g++; if (win) st.w++;
      st.tk = (st.tk || 0) + tk; st.rt = (st.rt || 0) + rt; st.vs = (st.vs || 0) + (x.vs || 0);
      st.k += x.k; st.d += x.d; st.a += x.a; st.cs += x.cs;
      st.dmg = (st.dmg || 0) + (x.dmg || 0); st.gold = (st.gold || 0) + (x.gold || 0); st.min = (st.min || 0) + (g.durS ? g.durS / 60 : g.dur);
      if (g.mvp === p.id) st.mvp++;
    }
    p.form = clamp((p.form || 0) * 0.85 + (win ? 0.6 : -0.6) + (g.mvp === p.id ? 0.8 : 0), -5, 5);
    p.morale = clamp((p.morale || 70) + (win ? 2 : -2), 20, 100);
    drainCondition(p, g.dur);
    // kinh nghiệm tướng
    const pe = p.pool.find((c) => c.c === x.champ);
    if (pe) { pe.g++; if (win) pe.w++; } else p.pool.push({ c: x.champ, g: 1, w: win ? 1 : 0 });
    p.pool.sort((a, b) => b.g - a.g);
    if (p.pool.length > 12) p.pool.length = 12;
  }
}

// Chơi cả loạt Bo (tự động hoặc với các ván đã có)
export function simSeries(match: Match): void {
  fillLineup(S.teams[match.a]);
  fillLineup(S.teams[match.b]);
  const need = Math.ceil(match.bo / 2);
  while (match.winsA < need && match.winsB < need) {
    const gi = match.games.length;
    const aBlue = gi % 2 === 0 ? match.aBlueFirst !== false : match.aBlueFirst === false;
    const blue = aBlue ? match.a : match.b, red = aBlue ? match.b : match.a;
    const g = simulateGame(autoDraft(blue, red, match.fearless || []), { series: gi });
    recordGame(match, g, false);
  }
}

export function recordGame(match: Match, g: GameResult, detailed: boolean): void {
  applyGameResult(g);
  // lưu bản phát lại: các ván của đội người chơi và các trận chung kết
  const comp = S.comps[match.comp];
  const fin = !!match.node && /^(GF|F)$/.test(match.node);
  if (g.rin && (match.a === S.userTeam || match.b === S.userTeam || fin)) {
    const rin = { ...g.rin, record: false, orders: g.rin.orders };
    S.replays = [{ id: `${match.id}#${match.games.length}`, season: S.season, day: S.day, comp: comp ? comp.name : '', a: g.blue, b: g.red, winner: g.winnerId, durS: g.durS, k: [g.kills.B, g.kills.R] as [number, number], game: match.games.length + 1, rin, star: fin }, ...(S.replays || [])];
    // giữ 16 ván gần nhất + tối đa 10 ván chung kết
    const stars = S.replays.filter((r) => r.star).slice(0, 10), rest = S.replays.filter((r) => !r.star).slice(0, 16);
    S.replays = [...stars, ...rest].sort((a, b) => b.season - a.season || b.day - a.day);
  }
  archiveGame(match, g);
  if (match.bo > 1) match.fearless = [...(match.fearless || []), ...(Object.values(g.picks.B) as string[]), ...(Object.values(g.picks.R) as string[])];
  if (g.winnerId === match.a) match.winsA++; else match.winsB++;
  // lưu gọn để giảm dung lượng lưu trữ
  const keep: GameRecord = { winner: g.winnerId, dur: g.dur };
  if (detailed) Object.assign(keep, { blue: g.blue, red: g.red, kills: g.kills, mvp: g.mvp, picks: g.picks, bans: g.bans, towers: g.towers, players: g.players });
  match.games.push(keep);
  const need = Math.ceil(match.bo / 2);
  if (match.winsA >= need || match.winsB >= need) {
    match.done = true;
    match.winner = match.winsA > match.winsB ? match.a : match.b;
    delete match.fearless;
    gprOnSeries(match);
    careerOnSeries(match);
    socialOnSeries(match);
    honorSeries(match);
  }
}
