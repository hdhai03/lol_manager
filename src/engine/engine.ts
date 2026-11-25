// Bộ máy mô phỏng trận đấu theo nhịp (mỗi nhịp = 15 giây trong trận).
// Kết quả không định trước: 10 "AI tuyển thủ" tự đi đường, farm, gank, tranh mục tiêu, giao tranh và đẩy trụ.
// Chỉ số tuyển thủ không cộng thẳng sát thương mà quyết định hành vi:
//   farm → lính/phút; accuracy/dodge → trúng/né chiêu; positioning → bị bắt hay không; awareness → né gank, phản ứng mục tiêu;
//   judgment → đọc giao tranh, rút lui đúng lúc; aggression/patience → tần suất ăn thua; creativity → outplay, cướp mục tiêu;
//   focus → lỗi vị trí; composure → khi bị dẫn; stamina → cuối trận/series; teamwork/leadership → phối hợp; adaptability → tướng lạ.
import { DB } from './data';
import { ROLES, ATTRS, clamp, rand, gauss, pick, weighted, withSeed } from './util';
import { traitsOf } from './attrs';
import { simulateCombat, type CUnit, type Cls } from './combat';
import { pickRunes, opggAdj, KS, type RunePick } from './runes';
import { patchMod } from './patch';
import type { FightRec, Attr, Bans, FrameUnit, GameEvent, GameResult, ObjTally, Picks, Player, PlayerLine, Role, Side, Tactics, PersonalTactic } from './types';

export type Pt = [number, number];
type Lane = 'top' | 'mid' | 'bot';
type ObjKey = 'dragon' | 'grubs' | 'herald' | 'baron' | 'elder';
/** một tướng trên bản đồ (trạng thái trong lúc mô phỏng) */
interface Unit {
  k: string; side: Side; role: Role; lane: Lane | 'jg'; pid: string | null; champ: string;
  at: Record<Attr, number>; tr: Set<string>; pt: PersonalTactic;
  atkB: number; hpB: number; line: 'front' | 'dive' | 'back'; healer: boolean; scale: number; early: number; meta: number;
  lvl: number; xp: number; gold: number; cs: number; kills: number; deaths: number; assists: number; dealt: number; dealtEarly: number; streak: number;
  hp: number; dead: number; recall: number; task: string; pos: Pt; busy: number; mv: number; target?: Lane;
  fhp: number; out: boolean; hitBy: Set<Unit>; caught: boolean; outplay?: boolean; diedAt?: Pt; cls: Cls; ranged: boolean; rune: RunePick; build?: string[]; adapt?: 'mr' | 'armor' | 'none' | 'miss';
}
interface Tower { id: string; side: Side; lane: string; i: number; hp: number; alive: boolean; pos: Pt; back?: number }
interface Inhib { id: string; side: Side; lane: Lane; hp: number; alive: boolean; back: number; pos: Pt }
type Struct = Tower | Inhib;
interface Buff { baron: number; elder: number; drakes: string[]; soul: boolean; herald: number }
interface FightRes { kills: Record<Side, number>; dead: Unit[]; win: Side | null }
interface FightOpts { rounds?: number; surprise?: Side; at?: Pt; src?: string }
/** dữ liệu vào cho một ván */
export interface RunInput {
  blue: string; red: string; picks: Picks; bans: Bans;
  lines: Record<Side, Partial<Record<Role, Player | null>>>; fits: Record<Side, Partial<Record<Role, number>>>;
  tactics: Record<Side, Tactics>; record?: boolean; series?: number;
  /** seed: cùng seed + cùng đầu vào → cùng diễn biến (phát lại / ra lệnh giữa trận) */
  seed?: number; orders?: Order[];
}
export type OrderKind = 'baron' | 'dragon' | 'push' | 'defend' | 'fight';
export interface Order { t: number; side: Side; kind: OrderKind }
export const ORDER_DUR = 150; // giây hiệu lực của một lệnh
// trang bị phòng thủ theo lớp tướng
const SIT_ITEM: Record<Cls, { mr: string; armor: string }> = {
  Tank: { mr: '4401', armor: '3075' }, Fighter: { mr: '3156', armor: '6333' }, Assassin: { mr: '3156', armor: '6333' },
  Mage: { mr: '3102', armor: '3157' }, Marksman: { mr: '3139', armor: '3026' }, Support: { mr: '3190', armor: '3110' },
};

export const TICK = 15; // giây / nhịp
export const MIR = ([x, y]: Pt): Pt => [100 - x, 100 - y];
export const BLUE_TOWERS: Record<Lane | 'nexus', Pt[]> = {
  top: [[8, 27], [10, 50], [9, 70]], mid: [[41, 59], [33, 67], [25, 75]], bot: [[73, 92], [50, 90], [30, 91]], nexus: [[14, 84], [16, 86]],
};
export const BASE: Record<Side, Pt> = { B: [9, 91], R: [91, 9] };
export const PIT: Record<'dragon' | 'baron', Pt> = { dragon: [67, 69], baron: [33, 31] };
const LANES: Lane[] = ['top', 'mid', 'bot'];
export const LANE_OF: Record<Role, Lane | 'jg'> = { Top: 'top', Jungle: 'jg', Mid: 'mid', Bot: 'bot', Support: 'bot' };
const TOWER_T = [0.36, 0.18, 0.03]; // vị trí trụ phe Xanh dọc đường (0 = nhà Xanh, 1 = nhà Đỏ)
const CAMPS: Record<Side, Pt[]> = { B: [[30, 55], [55, 78], [18, 38], [22, 62], [44, 70]], R: [] };
CAMPS.R = CAMPS.B.map(MIR);
const DRAKES = ['infernal', 'mountain', 'ocean', 'cloud', 'hextech', 'chemtech'];
const DMG = 0.165; // hệ số sát thương mỗi hiệp giao tranh

export function lanePoint(lane: string, tt: number): Pt {
  if (lane === 'top') return tt < 0.5 ? [9, 70 - tt * 2 * 60] : [9 + (tt - 0.5) * 2 * 61, 10];
  if (lane === 'bot') return tt < 0.5 ? [30 + tt * 2 * 60, 91] : [90, 91 - (tt - 0.5) * 2 * 61];
  return [25 + tt * 50, 75 - tt * 50];
}
const jit = (p: Pt, r = 2): Pt => [clamp(p[0] + (rand() - 0.5) * r * 2, 2, 98), clamp(p[1] + (rand() - 0.5) * r * 2, 2, 98)];
const toward = (p: Pt, side: Side, d: number): Pt => [p[0] + (side === 'B' ? -d : d), p[1] + (side === 'B' ? d : -d)];
const OPP: Record<Side, Side> = { B: 'R', R: 'B' };
const SIDES: Side[] = ['B', 'R'];
const avg = <T>(arr: T[], f: (x: T) => number): number => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0);
const TEMPO: Record<Tactics['tempo'], number> = { early: 1.35, balanced: 1, late: 0.7 };

// ---------------- đơn vị ----------------
function mkUnit(side: Side, role: Role, p: Player | null | undefined, champ: string, fit: number, tac: Tactics): Unit {
  const c = DB.champions[champ] || { tags: ['Fighter'], info: { attack: 5, defense: 5, magic: 5, difficulty: 5 }, power: 50, roles: [role] };
  const at = {} as Record<Attr, number>;
  const s = p ? p.stats : null;
  const tr = new Set(p ? traitsOf(p) : []);
  const condPen = p && !tac.fresh ? Math.max(0, 85 - (p.cond ?? 100)) * 0.3 : 0;
  for (const a of ATTRS) {
    let v = s ? s[a] ?? 60 : 42;
    if (a !== 'aggression') v -= condPen;
    if (p && (a === 'focus' || a === 'composure')) v += ((p.morale ?? 70) - 70) * 0.08;
    if (p && ['farm', 'accuracy', 'dodge', 'positioning'].includes(a)) v += (p.form || 0) * 0.6 + (fit - 60) * 0.12;
    if (p && p.role !== role) v -= ['farm', 'accuracy', 'dodge', 'positioning'].includes(a) ? (tr.has('flex') ? 2 : 7) : (tr.has('flex') ? 1 : 3);
    at[a] = v;
  }
  // phong độ trong ngày: cùng chỉ số nhưng mỗi ván một khác (người focus cao dao động ít hơn)
  const swing = gauss() * (p && s ? clamp((100 - (s.focus ?? 70)) / 8, 2, 5.5) : 4) + (tac.day || 0);
  for (const a of ATTRS) if (a !== 'aggression' && a !== 'stamina') at[a] += swing;
  // độ ăn ý với đồng đội: phối hợp, phán đoán, nhận thức bản đồ
  const ch = (tac.chem?.[role] ?? 58) - 58;
  at.teamwork += ch * 0.16; at.judgment += ch * 0.06; at.awareness += ch * 0.05;
  const ins = tac.roleIns?.[role];
  if (ins === 'weak') { at.aggression -= 10; at.patience += 8; at.positioning += 3; }
  if (ins === 'aggro' || ins === 'invade') { at.aggression += 10; at.patience -= 6; }
  if (ins === 'scale') { at.patience += 10; at.farm += 3; at.aggression -= 6; }
  if (tac.roleIns?.Support === 'vision') at.awareness += 2.5;
  const pt = tac.personal?.[role] || 'standard';
  if (pt === 'aggressive') { at.aggression += 14; at.patience -= 10; }
  if (pt === 'safe') { at.aggression -= 14; at.patience += 10; at.positioning += 3; }
  const main = c.tags[0];
  let atk = 0.55 + (c.info.attack + c.info.magic) / 22, hp = 0.75 + c.info.defense / 9;
  if (c.tags.includes('Tank')) { atk *= 0.75; hp *= 1.25; }
  if (main === 'Marksman') atk *= 1.15;
  if (main === 'Assassin') atk *= 1.15;
  if (main === 'Support') atk *= 0.7;
  const line = c.tags.includes('Tank') || main === 'Fighter' ? 'front' : main === 'Assassin' ? 'dive' : 'back';
  // bảng ngọc + độ mạnh trong meta xếp hạng hiện tại
  const rune = pickRunes(p, champ, role);
  const ks = KS[rune.pr[0]] || { a: 0, s: 0 };
  return {
    rune,
    k: side + role, side, role, lane: LANE_OF[role], pid: p ? p.id : null, champ, at, tr, pt,
    atkB: atk, hpB: hp, line, healer: c.tags.includes('Support') && c.info.magic >= 5,
    scale: (({ Marksman: 1.25, Mage: 1.1, Fighter: 1, Assassin: 0.95, Tank: 0.85, Support: 0.8 } as Record<string, number>)[main] || 1) + ks.s * 0.05,
    early: (({ Assassin: 0.12, Fighter: 0.07, Tank: 0, Mage: -0.02, Marksman: -0.1, Support: 0 } as Record<string, number>)[main] || 0) + ks.a * 0.025 + (ins === 'scale' ? -0.04 : ins === 'invade' ? 0.03 : 0),
    meta: (0.92 + (c.power || 50) / 600) * (1 + opggAdj(champ, role) + rune.bonus + (tac.runeB || 0) + patchMod(champ)),
    lvl: 1, xp: 0, gold: 500, cs: 0, kills: 0, deaths: 0, assists: 0, dealt: 0, dealtEarly: 0, streak: 0,
    hp: 1, dead: 0, recall: 0, task: role === 'Jungle' ? 'jungle' : 'lane', pos: [...BASE[side]] as Pt, busy: 0, mv: -1,
    fhp: 0, out: false, hitBy: new Set(), caught: false,
    cls: (['Fighter', 'Tank', 'Assassin', 'Mage', 'Marksman', 'Support'].includes(main) ? main : 'Fighter') as Cls,
    ranged: c.tags.includes('Marksman') || c.tags.includes('Mage') || (c.tags.includes('Support') && !c.tags.includes('Tank') && !c.tags.includes('Fighter')),
  };
}

// ---------------- mô phỏng ----------------
export function runGame(input: RunInput): GameResult {
  return input.seed != null ? withSeed(input.seed, () => runGameInner(input)) : runGameInner(input);
}
function runGameInner(input: RunInput): GameResult {
  const { blue, red, picks, bans, lines, fits, record, series = 0 } = input;
  // bản sao chiến thuật: nhịp độ thay đổi theo giai đoạn / lệnh trong trận
  const tactics: Record<Side, Tactics> = { B: { ...input.tactics.B }, R: { ...input.tactics.R } };
  const orders = input.orders || [];
  const U: Record<string, Unit> = {};
  for (const sd of SIDES) for (const r of ROLES) U[sd + r] = mkUnit(sd, r, lines[sd][r], picks[sd][r] ?? '', fits[sd][r] ?? 50, tactics[sd]);
  const team = (sd: Side): Unit[] => ROLES.map((r) => U[sd + r]);
  // lên đồ theo tình huống: đối thủ thiên phép → kháng phép, thiên vật lý → giáp (phán đoán tốt thì chọn đúng)
  for (const sd of SIDES) {
    const foes = ROLES.map((r) => DB.champions[picks[OPP[sd]][r] ?? '']).filter(Boolean);
    const ap = foes.length ? foes.filter((c) => c.tags[0] === 'Mage' || (c.info.magic > c.info.attack && c.tags[0] !== 'Marksman')).length / foes.length : 0.5;
    const need: 'mr' | 'armor' | 'none' = ap >= 0.6 ? 'mr' : ap <= 0.3 ? 'armor' : 'none';
    for (const r of ROLES) {
      const u = U[sd + r];
      const core = (DB.champions[u.champ]?.build || []).slice(0, 4);
      if (need === 'none') { u.adapt = 'none'; u.build = [...core, ...(DB.champions[u.champ]?.build || []).slice(4, 6)]; continue; }
      const ok = rand() < clamp(0.45 + (u.at.judgment - 60) / 70 + (u.at.adaptability - 60) / 140, 0.2, 0.95);
      const it = SIT_ITEM[u.cls][need];
      u.adapt = ok ? need : 'miss';
      u.build = ok ? [...core, it, (DB.champions[u.champ]?.build || [])[4]].filter(Boolean) as string[] : [...core, ...(DB.champions[u.champ]?.build || []).slice(4, 6)];
      u.hpB *= ok ? 1.045 : 0.985;
    }
  }
  const alive = (sd: Side): Unit[] => team(sd).filter((u) => !u.dead);
  const towers: Record<string, Tower> = {};
  for (const sd of SIDES) for (const [lane, arr] of Object.entries(BLUE_TOWERS)) arr.forEach((pt, i) => {
    towers[`${sd}-${lane}-${i}`] = { id: `${sd}-${lane}-${i}`, side: sd, lane, i, hp: lane === 'nexus' ? 130 : [100, 135, 160][i], alive: true, pos: sd === 'B' ? pt : MIR(pt) };
  });
  const nexus: Record<Side, number> = { B: 160, R: 160 };
  // nhà lính (sau trụ thứ 3 mỗi đường): hồi sinh sau 5 phút; khi mất, đường đó có siêu lính
  const inhib: Record<string, Inhib> = {};
  for (const sd of SIDES) for (const l of LANES) {
    const pt = BLUE_TOWERS[l][2];
    const p2: Pt = [pt[0] + (BASE.B[0] - pt[0]) * 0.35, pt[1] + (BASE.B[1] - pt[1]) * 0.35];
    inhib[`${sd}-${l}`] = { id: `${sd}-inhib-${l}`, side: sd, lane: l, hp: 80, alive: true, back: 0, pos: sd === 'B' ? p2 : MIR(p2) };
  }
  // thống kê mục tiêu từng đội (cho bảng tổng kết)
  const tally: Record<Side, ObjTally> = { B: { grubs: 0, heralds: 0, barons: 0, elders: 0, inhibs: 0, plates: 0 }, R: { grubs: 0, heralds: 0, barons: 0, elders: 0, inhibs: 0, plates: 0 } };
  const front: Record<Lane, number> = { top: 0.5, mid: 0.5, bot: 0.5 };
  const obj: Record<ObjKey, number> = { dragon: 300, grubs: 480, herald: 900, baron: 1200, elder: Infinity };
  const objSeen: Record<ObjKey, number> = { dragon: 0, grubs: 0, herald: 0, baron: 0, elder: 0 };
  const buff: Record<Side, Buff> = { B: { baron: 0, elder: 0, drakes: [], soul: false, herald: 0 }, R: { baron: 0, elder: 0, drakes: [], soul: false, herald: 0 } };
  const taken: Record<Side, number> = { B: 0, R: 0 }; // trụ đã phá
  const regroup: Record<Side, number> = { B: 0, R: 0 };
  const siege: Record<Side, { lane: Lane; start: number } | null> = { B: null, R: null }; // sau khi thua giao tranh: lùi về hồi phục
  const kills: Record<Side, number> = { B: 0, R: 0 };
  const events: GameEvent[] = [];
  const frames: Record<string, FrameUnit>[] | null = record ? [] : null;
  const fightLog: FightRec[] | null = record ? [] : null;
  let tick = 0, sec = 0, firstBlood = false, firstTower = false;
  let winner: Side | null = null, soulType: string | null = null;
  const tac = tactics;
  /** lệnh đang có hiệu lực của một phe */
  const ord = (sd: Side): OrderKind | null => {
    let o: Order | null = null;
    for (const x of orders) if (x.side === sd && x.t <= sec && sec < x.t + ORDER_DUR && (!o || x.t > o.t)) o = x;
    return o ? o.kind : null;
  };
  const applyPlans = (): void => {
    for (const sd of SIDES) {
      const base = input.tactics[sd];
      const ph = base.phase;
      const m = sec / 60;
      let tempo = ph ? (m < 14 ? ph.early : m < 25 ? ph.mid : ph.late) : base.tempo;
      let style = base.style;
      const o = ord(sd);
      if (o === 'push') tempo = 'early';
      if (o === 'defend') tempo = 'late';
      if (o === 'fight') style = 'teamfight';
      tac[sd].tempo = tempo; tac[sd].style = style;
    }
  };
  const shot = (sd: Side): Unit => team(sd).reduce((b, u) => (u.at.leadership > b.at.leadership ? u : b));
  const minute = () => sec / 60;
  const ev = (type: string, side: Side, data: Record<string, unknown> = {}): number => events.push({ t: tick, m: Math.floor(sec / 60), s: sec, type, side, ...data });
  const note = (key: string, side: Side, data: Record<string, unknown> = {}): number => ev('note', side, { key, ...data });

  // sức mạnh hiện tại (cấp, vàng, thời điểm mạnh của tướng, bùa)
  const stat = (u: Unit): number => {
    const m = minute();
    const tim = 1 + u.early * (1 - clamp((m - 12) / 18, 0, 1.6));
    const b = buff[u.side];
    return (1 + (u.lvl - 1) * 0.085) * (1 + ((u.gold - 500) / 7000) * u.scale) * tim * u.meta
      * (b.baron > sec ? 1.1 : 1) * (b.elder > sec ? 1.18 : 1) * (b.soul ? 1.06 : 1) * (1 + b.drakes.length * 0.012);
  };
  const atkOf = (u: Unit): number => u.atkB * stat(u);
  const hpOf = (u: Unit): number => u.hpB * stat(u);
  const power = (us: Unit[], live?: boolean): number => us.reduce((s, u) => s + stat(u) * (u.atkB + u.hpB) * (0.4 + 0.6 * (live ? Math.max(u.fhp, 0) / hpOf(u) : u.hp)) * (0.85 + (u.at.accuracy + u.at.dodge + u.at.positioning) / 1000), 0);
  // ước lượng sức mạnh (đội có judgment cao đọc chính xác hơn)
  const estimate = (sd: Side, mine: Unit[], theirs: Unit[]): number => {
    const j = avg(team(sd), (u) => u.at.judgment) + (shot(sd).at.leadership - 70) * 0.3;
    const noise = gauss() * clamp((100 - j) / 220, 0.03, 0.3);
    return (power(mine) / Math.max(power(theirs), 0.01)) * (1 + noise);
  };

  const giveGold = (u: Unit, g: number): void => { u.gold += g; };
  const giveXp = (u: Unit, x: number): void => {
    u.xp += x;
    while (u.lvl < 18 && u.xp >= 180 * u.lvl + 50 * u.lvl * u.lvl) u.lvl++;
  };
  const BRW = [10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5];
  const tif = () => { const m = minute(); return m < 15 ? 0 : m < 30 ? (m - 15) * 0.0085 : m < 45 ? 0.1275 + (m - 30) * 0.006 : Math.min(0.5, 0.2175 + (m - 45) * 0.029); };
  const respawnTicks = (u: Unit): number => Math.max(1, Math.round(BRW[u.lvl - 1] * (1 + tif()) / TICK));

  // ---------------- giao tranh ----------------
  // A, B: hai nhóm (khác phe). opts.rounds, opts.surprise (phe B bị bất ngờ), opts.at (vị trí)
  function fight(A: Unit[], B: Unit[], at: Pt | undefined, opts: FightOpts = {}): FightRes {
    A = A.filter((u) => !u.dead); B = B.filter((u) => !u.dead);
    if (!A.length || !B.length) return { kills: { B: 0, R: 0 }, dead: [], win: A.length ? A[0].side : B.length ? B[0].side : null };
    const all = [...A, ...B];
    const sideOf = { [A[0].side]: A, [B[0].side]: B } as Record<Side, Unit[]>;
    const coord = {} as Record<Side, number>, behind = {} as Record<Side, boolean>;
    for (const grp of [A, B]) {
      const sd = grp[0].side;
      const lead = Math.max(...grp.map((u) => u.at.leadership));
      coord[sd] = 1 + (avg(grp, (u) => u.at.teamwork) - 70) / 220 + (lead - 70) / 350 + (grp.length >= 3 && grp.some((u) => u.tr.has('shotcaller')) ? 0.03 : 0);
      behind[sd] = teamGold(sd) - teamGold(OPP[sd]) < -3000;
    }
    for (const u of all) {
      if (opts.at) { u.pos = jit(toward(opts.at, u.side, 1.5), 2.5); u.mv = tick; }
      u.fhp = u.hp * hpOf(u); u.out = false; u.hitBy = new Set();
      u.caught = rand() < (88 - (u.at.focus + u.at.positioning) / 2) / 240 + (u.tr.has('hothead') ? 0.05 : 0) + (opts.surprise === u.side ? 0.45 : 0);
    }
    // thế chủ động: đội đọc trận tốt hơn (judgment + shotcaller) ra đòn trước
    const ini = (grp: Unit[]): number => avg(grp, (u) => u.at.judgment) + Math.max(...grp.map((u) => u.at.leadership)) * 0.4 + gauss() * 6;
    const initiative = ini(A) >= ini(B) ? A[0].side : B[0].side;
    const res: FightRes = { kills: { B: 0, R: 0 }, dead: [], win: null };
    const rounds = opts.rounds || 7;
    // giao tranh thời gian thực: mỗi tướng là một tác tử (combat.ts)
    const cu: CUnit[] = all.map((u) => {
      let mult = coord[u.side] * (behind[u.side] ? (u.tr.has('clutch') ? 1.06 : u.tr.has('tilter') ? 0.92 : 1 + (u.at.composure - 75) / 600) : 1);
      if (minute() > 30 || series >= 3) mult *= 1 - Math.max(0, 72 - u.at.stamina) / 380 - (series >= 3 ? 0.01 : 0);
      const ch = DB.champions[u.champ];
      const sub = ch?.tags[1];
      const range = u.ranged ? ({ Marksman: 5.2, Mage: 4.6, Support: 4.2 } as Record<string, number>)[u.cls] ?? 4.4 : (u.cls === 'Fighter' && sub === 'Marksman' ? 3.5 : undefined);
      return { sub, range, key: u.k, side: u.side, cls: u.cls, ranged: u.ranged, line: u.line, healer: u.healer, at: u.at, tr: u.tr, lvl: u.lvl, hp: u.fhp, maxHp: hpOf(u), atk: atkOf(u), mult, caught: u.caught, x: u.pos[0], y: u.pos[1] };
    });
    const center = opts.at || [avg(all, (u) => u.pos[0]), avg(all, (u) => u.pos[1])] as Pt;
    const co = simulateCombat(cu, { center, maxT: rounds * 2.2, initiative, focus: { B: tac.B.focus, R: tac.R.focus }, record: !!frames });
    // thời điểm thật trong nhịp 15 giây hiện tại
    const ts = Math.min(1, 14.2 / Math.max(co.dur, 0.1));
    const s0 = sec - TICK + 0.5 + rand() * Math.max(0, 14.2 - co.dur * ts);
    if (fightLog && co.rec) fightLog.push({ s0, ts, keys: co.rec.keys, frames: co.rec.frames, acts: co.rec.acts });
    const byKey = Object.fromEntries(all.map((u) => [u.k, u]));
    for (const dth of co.deaths) {
      const v = byKey[dth.key], k = byKey[dth.killer];
      if (!v || !k || v.dead) continue;
      res.dead.push(v);
      die(v, k, dth.assists.map((x) => byKey[x]).filter(Boolean), [dth.x, dth.y], s0 + dth.t * ts);
      res.kills[k.side]++;
    }
    for (const u of all) {
      u.dealt += co.dealt[u.k] || 0; if (sec < 840) u.dealtEarly += co.dealt[u.k] || 0;
      if (!u.dead) u.fhp = co.hp[u.k] * hpOf(u);
      u.out = co.out.has(u.k);
    }
    for (const sd of co.disengaged) note('disengage', sd);
    for (const k of co.outplays) if (byKey[k] && !byKey[k].dead) note('outplay', byKey[k].side, { who: byKey[k].role });
    for (const u of all) { if (!u.dead) u.hp = clamp(u.fhp / hpOf(u), 0.04, 1); u.outplay = false; }
    const left = (grp: Unit[]): number => grp.filter((u) => !u.dead && !u.out).length;
    res.win = left(A) > left(B) ? A[0].side : left(B) > left(A) ? B[0].side : (res.kills[A[0].side] >= res.kills[B[0].side] ? A[0].side : B[0].side);
    const n = res.kills.B + res.kills.R;
    if (n >= 3) ev('teamfight', res.kills.B >= res.kills.R ? 'B' : 'R', { kb: res.kills.B, kr: res.kills.R, at: opts.at });
    for (const sd of SIDES) if (!alive(sd).length && res.kills[OPP[sd]] >= 3) note('ace', OPP[sd]);
    return res;
  }

  function chooseTarget(u: Unit, foes: Unit[]): Unit {
    const f = tac[u.side].focus;
    const frontAlive = foes.some((e) => e.line === 'front');
    const maxG = Math.max(...foes.map((e) => e.gold));
    const w = foes.map((e) => {
      let x = 1;
      const hpf = e.fhp / hpOf(e);
      if (f === 'carry') x *= e.gold === maxG ? 3 : 1;
      else if (f === 'weakest') x *= 1 / (hpf + 0.2);
      else x *= 1 / (hpf + 0.45) * (e.line === 'front' ? 1.3 : 1);
      if (e.line !== 'front' && frontAlive) {
        // vượt tuyến trước: sát thủ dễ hơn; positioning của mục tiêu quyết định
        x *= u.line === 'dive' ? 0.9 : clamp(0.35 + (u.at.judgment - e.at.positioning) / 150 - (e.tr.has('glass') ? -0.15 : 0), 0.12, 0.75);
      }
      return x;
    });
    return weighted(foes, w);
  }

  function die(v: Unit, killer: Unit, assists: Unit[], at: Pt, ft?: number): void {
    const bounty = 300 + (v.streak >= 2 ? Math.min(700, 150 * (v.streak - 1)) : 0);
    v.dead = respawnTicks(v); v.hp = 0; v.deaths++; v.streak = 0; v.recall = 0; v.task = 'dead';
    killer.kills++; killer.streak++;
    giveGold(killer, bounty); giveXp(killer, 150 + v.lvl * 25);
    for (const a of assists) { a.assists++; giveGold(a, Math.round(bounty * 0.5 / Math.max(assists.length, 1)) + 25); giveXp(a, 60 + v.lvl * 10); }
    kills[killer.side]++;
    const pos: Pt = [clamp(at[0], 2, 98), clamp(at[1], 2, 98)];
    v.mv = tick;
    if (!firstBlood) { firstBlood = true; giveGold(killer, 100); ev('firstblood', killer.side, { killer: killer.role, victim: v.role, at: pos, ft }); }
    else ev('kill', killer.side, { killer: killer.role, victim: v.role, at: pos, assists: assists.map((a) => a.role), ft });
    v.pos = pos; v.diedAt = pos;
  }

  const shuffleSides = (): Side[] => (rand() < 0.5 ? ['B', 'R'] : ['R', 'B']);
  const teamGold = (sd: Side): number => team(sd).reduce((s, u) => s + u.gold, 0);
  const present = (sd: Side, lane: string): Unit[] => team(sd).filter((u) => !u.dead && !u.recall && u.task === 'lane' && u.lane === lane);
  const outerAlive = (sd: Side, lane: string): number | undefined => [0, 1, 2].find((i) => towers[`${sd}-${lane}-${i}`].alive);
  // mục tiêu công trình tiếp theo trên đường: trụ → nhà lính → (trụ nhà chính / nhà chính)
  const laneStruct = (sd: Side, lane: string): Struct | null => { const i = outerAlive(sd, lane); if (i !== undefined) return towers[`${sd}-${lane}-${i}`]; const ih = inhib[`${sd}-${lane}`]; return ih.alive ? ih : null; };
  // hệ số phá công trình: Sâu Hư Không (mỗi con +5%, đủ 3 con có Đói Khát Hư Không)
  const structMult = (sd: Side): number => 1 + tally[sd].grubs * 0.05 + (tally[sd].grubs >= 3 ? 0.1 : 0);
  const towerT = (sd: Side, i: number): number => (sd === 'B' ? TOWER_T[i] : 1 - TOWER_T[i]);

  // ---------------- đẩy đường & trụ ----------------
  function laneTick(lane: Lane, laning: boolean): void {
    const pB = present('B', lane), pR = present('R', lane);
    const PB = power(pB) + 0.8, PR = power(pR) + 0.8; // + lính
    // siêu lính khi nhà lính bị phá
    const sup = (sd: Side): number => (inhib[`${OPP[sd]}-${lane}`].alive ? 0 : 0.035);
    front[lane] += 0.06 * (PB - PR) / (PB + PR) + sup('B') - sup('R');
    const ob = outerAlive('B', lane), or = outerAlive('R', lane);
    const lo = ob === undefined ? -0.08 : towerT('B', ob) - 0.02;
    const hi = or === undefined ? 1.08 : towerT('R', or) + 0.02;
    front[lane] = clamp(front[lane], lo, hi);
    // trụ chịu sát thương khi lính + tướng áp sát mà không có ai thủ
    const sidesInfo: [Side, Unit[], Unit[], boolean][] = [['B', pB, pR, front[lane] >= hi - 0.01], ['R', pR, pB, front[lane] <= lo + 0.01]];
    for (const [sd, mine, theirs, edge] of sidesInfo) {
      if (!edge || !mine.length && theirs.length) continue;
      const contested = theirs.length ? 0.35 : 1; // có người thủ: chỉ cấu được trụ khi thắng đường
      const enemy = OPP[sd];
      const tw = laneStruct(enemy, lane);
      const i = tw && 'i' in tw ? tw.i : null;
      const dmg = ((inhib[`${enemy}-${lane}`].alive ? 0.5 : 4) + mine.reduce((s, u) => s + stat(u) * (laning && i === 0 ? 1.55 : 1.3), 0) * (buff[sd].baron > sec ? 1.9 : 1)) * structMult(sd);
      if (tw) hitStruct(tw, sd, dmg * contested, mine);
      else if (!theirs.length) hitNexus(enemy, sd, dmg, mine);
    }
  }
  // trụ hoặc nhà lính
  function hitStruct(tw: Struct, sd: Side, dmg: number, by: Unit[]): void {
    // Sứ Giả (Mắt Sứ Giả còn hiệu lực): húc một cú 3000 sát thương chuẩn vào công trình đầu tiên
    if (buff[sd].herald > sec && by.length) {
      buff[sd].herald = 0;
      dmg += tw.id.includes('inhib') ? 40 : 55;
      note('heraldCharge', sd, {});
    }
    if ('i' in tw) return hitTower(tw, sd, dmg, by);
    return hitInhib(tw, sd, dmg, by);
  }
  function hitTower(tw: Tower, sd: Side, dmg: number, by: Unit[]): void {
    const before = tw.hp;
    tw.hp -= dmg;
    // ốp trụ ngoài: 5 lớp, mỗi lớp 120 vàng chia cho đội đang đánh (mùa 2026: không rơi theo thời gian)
    if (tw.i === 0) {
      const plates = (h: number): number => Math.min(5, Math.floor((100 - Math.max(h, 0)) / 20));
      const n = plates(tw.hp) - plates(before);
      if (n > 0) { tally[sd].plates += n; if (by.length) for (const u of by) giveGold(u, Math.round(120 * n / by.length)); }
    }
    if (tw.hp > 0) return;
    tw.alive = false;
    taken[sd]++;
    // vàng trụ toàn đội: ngoài 50, trong 25, nhà lính 25, nhà chính 50; trụ đầu tiên thưởng 300
    const g = tw.lane === 'nexus' ? 50 : [50, 25, 25][tw.i];
    for (const u of team(sd)) giveGold(u, g);
    if (tw.lane === 'nexus') tw.back = sec + 180; // trụ nhà chính hồi lại sau 3 phút (40% máu)
    if (!firstTower) { firstTower = true; if (by.length) for (const u of by) giveGold(u, Math.round(300 / by.length)); ev('firsttower', sd, { id: tw.id, at: tw.pos }); }
    else ev('tower', sd, { id: tw.id, n: taken[sd], at: tw.pos });
  }
  function hitInhib(ih: Inhib, sd: Side, dmg: number, by: Unit[]): void {
    ih.hp -= dmg;
    if (ih.hp > 0) return;
    ih.alive = false; ih.back = sec + 300;
    tally[sd].inhibs++;
    if (by.length) giveGold(by[0], 50);
    ev('inhib', sd, { id: ih.id, lane: ih.lane, at: ih.pos });
  }
  function hitNexus(enemy: Side, sd: Side, dmg: number, by: Unit[]): void {
    // trụ nhà chính chỉ đánh được khi đã mất ít nhất một nhà lính
    const inhibDown = LANES.some((l) => !inhib[`${enemy}-${l}`].alive);
    if (!inhibDown) return;
    const nt = [0, 1].map((i) => towers[`${enemy}-nexus-${i}`]).find((x) => x.alive);
    if (nt) { if (by.length) hitStruct(nt, sd, dmg * 0.8, by); return; }
    if (!by.length) return;
    nexus[enemy] -= dmg * 0.9;
    if (nexus[enemy] <= 0) winner = sd;
  }

  // ---------------- giai đoạn đi đường ----------------
  function laningTick(): void {
    for (const lane of LANES) {
      const pB = present('B', lane), pR = present('R', lane);
      for (const [mine, theirs] of [[pB, pR], [pR, pB]]) {
        const ratio = (power(mine) + 0.3) / (power(theirs) + 0.3);
        for (const u of mine) {
          if (sec < 75) { u.pos = jit(toward(lanePoint(lane, 0.5), u.side, 6), 1); continue; } // lính chưa tới
          const rate = { Top: 2.25, Mid: 2.35, Bot: 2.55, Support: 0.35, Jungle: 0 }[u.role];
          const f = clamp(0.93 + (u.at.farm - 70) / 250 + (u.at.focus - 70) / 700 + (ratio - 1) * 0.08, 0.5, 1.15) * (u.hp < 0.4 ? 0.75 : 1);
          const cs = rate * f * (0.9 + rand() * 0.2);
          u.cs += cs; giveGold(u, cs * 20 + (u.role === 'Support' ? 9 : 0));
          giveXp(u, mine.length > 1 ? 72 : 95);
          u.hp = Math.min(1, u.hp + 0.025);
        }
      }
      // ăn thua trong đường: tần suất do aggression/patience, kết quả do accuracy/dodge/positioning
      if (pB.length && pR.length) {
        const ag = avg([...pB, ...pR], (u) => u.at.aggression - (u.at.patience - 60) * 0.3);
        const tempo = (TEMPO[tac.B.tempo] + TEMPO[tac.R.tempo]) / 2;
        if (rand() < 0.075 * clamp((ag - 25) / 45, 0.3, 1.8) * tempo) {
          const res = fight(pB, pR, lanePoint(lane, front[lane]), { rounds: 2, at: lanePoint(lane, front[lane]), src: 'trade' });
          if (res.kills.B + res.kills.R === 1) note('solo', res.kills.B ? 'B' : 'R', { lane });
        }
        // dồn sát thương khi đối thủ máu thấp
        for (const [mine, theirs] of [[pB, pR], [pR, pB]]) {
          const low = theirs.filter((e) => !e.dead && e.hp < 0.38);
          const me = mine.filter((u) => !u.dead && u.hp > 0.55);
          if (low.length && me.length && rand() < avg(me, (u) => u.at.aggression) / 230 + (me.some((u) => u.tr.has('hothead')) ? 0.08 : 0)) {
            fight(me, theirs.filter((e) => !e.dead), lanePoint(lane, front[lane]), { rounds: 4, at: lanePoint(lane, front[lane]), src: 'allin' });
          }
        }
      }
    }
    // đi rừng: farm hoặc gank
    for (const sd of SIDES) {
      const jg = U[sd + 'Jungle'];
      if (jg.dead || jg.recall) continue;
      if (jg.task === 'gank') { resolveGank(jg, jg.target ?? 'mid'); continue; }
      if (jg.busy > 0) { jg.busy--; continue; }
      if (sec < 90) { jg.pos = jit(CAMPS[sd][0], 1); continue; } // bãi quái chưa hồi
      const cs = 1.5 * clamp(0.93 + (jg.at.farm - 70) / 250, 0.5, 1.15);
      jg.cs += cs; giveGold(jg, cs * 30); giveXp(jg, 82);
      jg.hp = Math.min(1, jg.hp + 0.02);
      jg.pos = jit(pick(CAMPS[sd]), 1.5);
      if (sec < 180) continue;
      const jt = tac[sd].jungle;
      const pG = 0.075 * (0.5 + jg.at.aggression / 100) * TEMPO[tac[sd].tempo] * (jt === 'farm' ? 0.4 : 1) * (tac[sd].roleIns?.Jungle === 'invade' ? 1.2 : 1);
      if (rand() < pG) {
        const lanes = LANES.map((l) => {
          const foes = present(OPP[sd], l);
          if (!foes.length) return 0;
          const pushed = sd === 'B' ? 0.5 - front[l] : front[l] - 0.5; // >0: địch dồn về phía mình
          let w = (1 + pushed * 3) * (1.6 - avg(foes, (e) => e.hp)) * (present(sd, l).length ? 1.2 : 0.6);
          if (jt === l) w *= 3;
          return Math.max(w, 0.05);
        });
        if (lanes.some((w) => w > 0)) { jg.task = 'gank'; jg.target = weighted(LANES, lanes); jg.pos = lanePoint(jg.target, front[jg.target]); }
      }
    }
    // đường giữa / hỗ trợ đi roam
    for (const sd of SIDES) {
      for (const role of ['Mid', 'Support']) {
        const u = U[sd + role];
        if (u.dead || u.recall || u.task !== 'lane' || sec < 240 || u.hp < 0.6) continue;
        const ri = tac[sd].roleIns?.[role as Role];
        const p = (role === 'Mid' ? 0.022 : 0.016) * clamp((u.at.creativity + u.at.awareness - 100) / 80, 0.2, 1.6) * TEMPO[tac[sd].tempo] * (ri === 'roam' ? 1.9 : ri === 'lane' ? 0.5 : 1);
        if (rand() < p) {
          const dest: Lane = role === 'Mid' ? pick<Lane>(['top', 'bot']) : 'mid';
          if (present(OPP[sd], dest).length) { note('roam', sd, { who: role, lane: dest }); resolveGank(u, dest, true); }
        }
      }
    }
  }

  function resolveGank(g: Unit, lane: Lane, roam?: boolean): void {
    const sd = g.side, os = OPP[sd];
    g.task = 'lane'; if (!roam) { g.task = 'jungle'; g.busy = 1; }
    const targets = present(os, lane);
    if (!targets.length) return;
    // phát hiện gank: awareness của mục tiêu (+hỗ trợ cắm mắt) so với creativity/awareness của người gank
    const aw = Math.max(...targets.map((u) => u.at.awareness + (u.tr.has('visionary') ? 8 : 0))) + (tac[os].roleIns?.Support === 'vision' ? 6 : 0);
    const pDetect = clamp(0.22 + (aw - g.at.creativity * 0.5 - g.at.awareness * 0.3) / 100, 0.05, 0.72);
    if (rand() < pDetect) {
      note('dodged', os, { who: targets[0].role, lane });
      for (const u of targets) u.hp = Math.max(u.hp - 0.05, 0.2);
      front[lane] += os === 'B' ? -0.05 : 0.05;
      return;
    }
    const allies = [g, ...present(sd, lane).filter((u) => u !== g)];
    const def = [...targets];
    const ejg = U[os + 'Jungle'];
    if (!ejg.dead && !ejg.recall && ejg.task !== 'gank' && rand() < (ejg.at.awareness - 40) / 120) { def.push(ejg); note('counter', os, {}); }
    const at = lanePoint(lane, front[lane]);
    g.pos = at;
    const res = fight(allies, def, at, { rounds: 4, surprise: os, at, src: 'gank' });
    note(res.kills[sd] > res.kills[os] ? 'gankWin' : res.kills[os] > res.kills[sd] ? 'gankLose' : 'gankNone', sd, { who: g.role, lane });
  }

  // ---------------- mục tiêu lớn ----------------
  const objUp = (k: ObjKey): boolean => sec >= obj[k] && (k !== 'grubs' || sec < 885) && (k !== 'herald' || sec < 1185);
  let grubFight = false;
  function contestObj(k: ObjKey): void {
    if (k === 'baron' && rand() > 0.13) return; // Baron chỉ được cân nhắc khi có tầm nhìn & thời cơ, không phải mỗi nhịp
    const pos = k === 'dragon' || k === 'elder' ? PIT.dragon : PIT.baron;
    const nearRoles = k === 'dragon' || k === 'elder' ? ['Jungle', 'Bot', 'Support', 'Mid'] : k === 'baron' ? ROLES : ['Jungle', 'Top', 'Mid'];
    const grp = (sd: Side): Unit[] => (k === 'baron' || k === 'elder' || sec >= 840 ? alive(sd) : nearRoles.map((r) => U[sd + r]).filter((u) => !u.dead))
      .filter((u) => !u.recall && (u.task !== 'split' || rand() < 0.65)); // người đẩy lẻ dịch chuyển về giao tranh
    const want = {} as Record<Side, boolean>;
    for (const sd of SIDES) {
      const mine = grp(sd), theirs = grp(OPP[sd]);
      if (!mine.some((u) => u.role === 'Jungle') && k !== 'baron' && k !== 'elder') { want[sd] = false; continue; }
      if (!mine.length) { want[sd] = false; continue; }
      const t = tac[sd];
      let thr = k === 'baron' ? 1.38 : k === 'elder' ? 1.0 : 1.05;
      if ((k === 'dragon' || k === 'elder') && t.obj === 'dragon') thr -= 0.15;
      if ((k === 'grubs' || k === 'herald' || k === 'baron') && t.obj === 'top') thr -= 0.15;
      if ((k === 'grubs' || k === 'herald') && t.obj === 'dragon') thr += 0.15;
      thr -= (avg(mine, (u) => u.at.aggression) - 62) / 250 + (t.tempo === 'early' && sec < 900 ? 0.08 : 0);
      thr -= clamp((sec - Math.max(obj[k], objSeen[k])) / 600, 0, k === 'baron' ? 0.15 : 0.35); // để lâu thì dễ đánh hơn
      const o = ord(sd);
      if (o === 'baron' && k === 'baron') thr -= 0.3;
      if (o === 'dragon' && (k === 'dragon' || k === 'elder')) thr -= 0.3;
      if (o === 'fight') thr -= 0.1;
      if (o === 'defend') thr += 0.2;
      const ratio = estimate(sd, mine, theirs.filter((u) => !u.dead));
      const liveT = theirs.filter((u) => !u.dead).length;
      // Baron rất rủi ro: chỉ đánh khi hơn người hoặc áp đảo hẳn (như thi đấu chuyên nghiệp)
      want[sd] = (ratio > thr && (k !== 'baron' || mine.length > liveT || ratio > (o === 'baron' ? 1.35 : 1.7))) || (liveT <= 2 && mine.length >= 3 && (k !== 'baron' || rand() < 0.45));
    }
    if (!want.B && !want.R) return;
    let takerSide: Side;
    grubFight = want.B && want.R;
    if (want.B && want.R) {
      for (const u of [...grp('B'), ...grp('R')]) { u.pos = jit(toward(pos, u.side, 3), 3); u.mv = tick; }
      const res = fight(grp('B'), grp('R'), pos, { rounds: 7, at: pos, src: 'obj-' + k });
      if (!res.win) return;
      takerSide = res.win;
      const loser = OPP[takerSide];
      const lj = U[loser + 'Jungle'];
      if (!lj.dead && rand() < 0.07 + (lj.at.creativity - 70) / 300 + (lj.tr.has('outplayer') ? 0.05 : 0)) { takerSide = loser; note('steal', loser, { obj: k }); }
      else if (!alive(takerSide).length) return;
    } else {
      takerSide = want.B ? 'B' : 'R';
      const mine = grp(takerSide);
      for (const u of mine) { u.pos = jit(toward(pos, u.side, 2), 2.5); u.mv = tick; }
      // địch phản ứng muộn (awareness) → đánh nhau ngay tại hố
      const os = OPP[takerSide];
      const big = k === 'baron' || k === 'elder';
      const late = grp(os).filter((u) => rand() < (u.at.awareness - (big ? 15 : 50)) / (big ? 110 : 170));
      if (late.length >= (big ? 2 : 1) && (big || late.some((u) => u.role === 'Jungle'))) {
        const res = fight(mine, late, pos, { rounds: 5, at: pos, src: 'objlate-' + k });
        if (res.win !== takerSide) {
          const lj = U[os + 'Jungle'];
          if (!lj.dead && rand() < 0.12 + (lj.at.creativity - 70) / 250) { takerSide = os; note('steal', os, { obj: k }); }
          else return;
        }
      }
    }
    if (!alive(takerSide).length) return;
    takeObj(k, takerSide, pos);
  }
  function takeObj(k: ObjKey, sd: Side, pos: Pt): void {
    const b = buff[sd];
    if (k === 'dragon') {
      const n = buff.B.drakes.length + buff.R.drakes.length;
      const type = n < 2 ? pick(DRAKES.filter((d) => !buff.B.drakes.includes(d) && !buff.R.drakes.includes(d))) : (soulType ||= pick(DRAKES));
      b.drakes.push(type);
      ev('dragon', sd, { drake: type, n: b.drakes.length, at: pos });
      if (b.drakes.length >= 4) { b.soul = true; ev('soul', sd, { drake: type, at: pos }); obj.dragon = Infinity; obj.elder = sec + 360; }
      else obj.dragon = sec + 300;
      giveGold(U[sd + 'Jungle'], 75);
    } else if (k === 'elder') { b.elder = sec + 150; obj.elder = sec + 360; tally[sd].elders++; for (const u of alive(sd)) giveGold(u, 150); ev('elder', sd, { at: pos }); }
    else if (k === 'baron') { b.baron = sec + 180; obj.baron = sec + 360; tally[sd].barons++; for (const u of alive(sd)) giveGold(u, 150); giveGold(U[sd + 'Jungle'], 100); ev('baron', sd, { at: pos }); }
    else if (k === 'grubs') {
      // 3 con Sâu Hư Không (chỉ xuất hiện một lần); bị tranh chấp thì đội kia có thể ăn được 1 con
      obj.grubs = Infinity;
      const split = grubFight ? (rand() < 0.4 ? 1 : 0) : 0;
      tally[sd].grubs += 3 - split; tally[OPP[sd]].grubs += split;
      for (const u of alive(sd)) giveGold(u, Math.round(30 * (3 - split) / Math.max(1, alive(sd).length)) * 2);
      ev('grubs', sd, { n: 3 - split, at: pos });
    }
    else if (k === 'herald') { obj.herald = Infinity; b.herald = sec + 240; tally[sd].heralds++; giveGold(U[sd + 'Jungle'], 100); ev('herald', sd, { at: pos }); }
    for (const u of alive(sd)) giveXp(u, k === 'baron' ? 400 : 150);
  }

  // ---------------- giữa / cuối trận ----------------
  function macroTick(): void {
    const plans = {} as Record<Side, { kind: 'farm' | 'siege'; lane?: Lane; ratio: number }>;
    for (const sd of SIDES) {
      const t = tac[sd];
      const os = OPP[sd];
      const mine = alive(sd).filter((u) => !u.recall), theirs = alive(os);
      const ratio = estimate(sd, mine, theirs);
      // tách đường: đi đường trên đẩy lẻ nếu chiến thuật cho phép
      const splitter = t.style === 'split' || t.roleIns?.Top === 'split' ? U[sd + 'Top'] : null;
      for (const u of team(sd)) if (u.task === 'split' || u.task === 'splitdef') u.task = 'group';
      if (splitter && !splitter.dead && !splitter.recall && splitter.hp > 0.5) splitter.task = 'split';
      // chọn đường để công trụ: đường có trụ ngoài cùng dễ nhất
      const laneScore = (l: Lane): number => {
        const i = outerAlive(os, l);
        if (i === undefined) return 3; // tiến vào nhà
        const tw = towers[`${os}-${l}-${i}`];
        return 2 - i * 0.4 - tw.hp / 200 + (sd === 'B' ? front[l] : 1 - front[l]);
      };
      const best = LANES.filter((l) => !(splitter && splitter.task === 'split' && l === 'top')).sort((a, b) => laneScore(b) - laneScore(a))[0];
      // giữa trận phần lớn thời gian là farm đường; chỉ tập trung công trụ khi đọc ra lợi thế (hoặc có Baron)
      const aggro = (avg(mine, (u) => u.at.aggression) - 62) / 220;
      const m = minute();
      const need = 1.1 - aggro - (t.tempo === 'early' ? 0.06 : t.tempo === 'late' && m < 28 ? -0.08 : 0) - clamp((m - 24) / 40, 0, 0.25);
      const o = ord(sd);
      const needO = need + (o === 'push' ? -0.14 : o === 'fight' ? -0.08 : o === 'defend' ? 0.3 : 0);
      let plan: { kind: 'farm' | 'siege'; lane?: Lane } = { kind: 'farm' };
      const splitting = splitter && splitter.task === 'split';
      if (mine.length >= 3 && (ratio > needO + (splitting ? 0.12 : 0) || buff[sd].baron > sec || buff[sd].elder > sec || mine.length - theirs.length >= 2)) plan = { kind: 'siege', lane: best };
      if (regroup[sd] > tick) plan = { kind: 'farm' };
      plans[sd] = { ...plan, ratio };
    }
    // mục tiêu lớn được ưu tiên khi đội đang lợi thế
    for (const k of ['elder', 'baron', 'dragon', 'herald', 'grubs'] as ObjKey[]) if (objUp(k)) contestObj(k);
    if (winner) return;
    // đẩy lẻ: buộc đối phương cử người thủ (awareness/judgment), nếu không thì mất trụ đường trên
    for (const sd of SIDES) {
      const sp = U[sd + 'Top'];
      if (sp.task !== 'split' || sp.dead) continue;
      sp.pos = lanePoint('top', front.top); sp.mv = tick;
      const os = OPP[sd];
      const cands = alive(os).filter((u) => !u.recall && u.task !== 'group' && u.task !== 'split');
      const opp = U[os + 'Top'];
      const def = !opp.dead && !opp.recall ? opp : cands[0];
      const react = def ? 0.5 + (Math.max(def.at.awareness, shot(os).at.leadership) - 60) / 90 : 0;
      if (def && rand() < react) {
        def.task = 'splitdef'; def.pos = jit(lanePoint('top', front.top), 2); def.mv = tick;
        if (rand() < 0.35 + (sp.at.aggression - 60) / 150) fight([sp], [def], sp.pos, { rounds: 4, at: sp.pos, src: 'split' });
      } else {
        const st = laneStruct(os, 'top');
        const dmg = stat(sp) * 4.6 * (buff[sd].baron > sec ? 1.6 : 1) * structMult(sd);
        if (st) hitStruct(st, sd, dmg, [sp]);
        if (rand() < 0.3) note('split', sd, {});
      }
      if (!sp.dead) { sp.cs += 2.3; giveGold(sp, 48); giveXp(sp, 85); }
    }
    // công / thủ trụ: một đợt công trụ kéo dài vài nhịp; phe thủ chỉ quyết định ra giao tranh một lần lúc bắt đầu
    let fought = false;
    for (const sd of shuffleSides()) {
      const pl = plans[sd];
      const os = OPP[sd];
      const grp = alive(sd).filter((u) => !u.recall && u.task !== 'split' && u.task !== 'splitdef');
      const on = siege[sd];
      if (!on && pl.kind !== 'siege') { for (const u of grp) u.task = 'lane'; continue; }
      if (!grp.length) { siege[sd] = null; continue; }
      for (const u of grp) u.task = 'group';
      const lane: Lane = on ? on.lane : pl.lane ?? 'mid';
      const ls = laneStruct(os, lane);
      const i = ls ? 0 : undefined;
      const target = ls || (towers[`${os}-nexus-0`].alive ? towers[`${os}-nexus-0`] : towers[`${os}-nexus-1`].alive ? towers[`${os}-nexus-1`] : null);
      const at = target ? target.pos : BASE[os];
      for (const u of grp) { u.pos = jit(toward(at, sd, 5), 3); u.mv = tick; }
      if (!on) {
        siege[sd] = { lane, start: tick };
        // phe thủ: ra thủ hay nhường trụ (judgment đọc thế trận; hiếu chiến dễ lao vào)
        const defenders = alive(os).filter((u) => !u.recall && u.task !== 'split' && u.task !== 'splitdef');
        let fightIt = false;
        if (defenders.length && !fought) {
          const dr = estimate(os, defenders, grp);
          const nexusThreat = i === undefined;
          const ag = (avg(defenders, (u) => u.at.aggression) - 62) / 180;
          const deep = !!target && (('i' in target && target.i >= 1) || !!target.id.match(/inhib|nexus/));
          fightIt = nexusThreat || dr > 0.92 - ag - (deep ? 0.1 : 0) || (dr > 0.7 && rand() < 0.12 + ag);
        }
        if (fightIt) {
          fought = true;
          const res = fight(grp, defenders, at, { rounds: 7, at, src: 'siege' });
          if (res.win) regroup[OPP[res.win]] = tick + 3;
          if (res.win !== sd) { siege[sd] = null; continue; }
          siege[os] = null;
        } else if (defenders.length) note('concede', os, {});
      }
      const atk = grp.filter((u) => !u.dead);
      if (!atk.length) { siege[sd] = null; continue; }
      // trụ bắn trả: trụ càng sâu càng đau, Baron giúp lính đỡ đòn
      const shotDmg = (target ? (!('i' in target) ? 0 : target.lane === 'nexus' ? 0.13 : [0.05, 0.09, 0.12][target.i]) : 0.14) * (buff[sd].baron > sec ? 0.45 : 1);
      const tank = atk.sort((x, y) => y.hpB - x.hpB)[0];
      tank.hp -= shotDmg * 2.2; for (const u of atk) u.hp -= shotDmg * 0.5;
      for (const u of atk) if (u.hp <= 0.05) u.hp = 0.05;
      const dmg = (1 + atk.reduce((s, u) => s + stat(u) * 1.15, 0)) * (buff[sd].baron > sec ? 1.9 : 1) * (buff[sd].elder > sec ? 1.3 : 1) * structMult(sd);
      if (target) hitStruct(target, sd, dmg, atk);
      else hitNexus(os, sd, dmg, atk);
      if (winner) return;
      // kết thúc đợt công: trụ đã sập, quân đã mỏi, hoặc đã kéo dài quá lâu
      if ((target && !target.alive) || avg(atk, (u) => u.hp) < 0.4 || tick - (siege[sd]?.start ?? tick) >= 6) {
        const keep = target && !target.alive && avg(atk, (u) => u.hp) > 0.6 && (buff[sd].baron > sec || buff[sd].elder > sec);
        if (!keep) { siege[sd] = null; regroup[sd] = tick + 2; }
      }
    }
    // bị bắt lẻ khi đi farm (awareness thấp, đội địch chơi bắt lẻ)
    for (const sd of SIDES) {
      const os = OPP[sd];
      for (const u of alive(sd)) {
        if (u.task !== 'lane' && u.task !== 'split') continue;
        const hunters = alive(os).filter((e) => !e.recall && e.task !== 'split');
        if (hunters.length < 2) continue;
        const p = 0.013 * (1 + (65 - u.at.awareness) / 40 + (65 - u.at.positioning) / 80) * (tac[os].style === 'pick' ? 1.7 : 1) * (u.tr.has('hothead') ? 1.3 : 1);
        if (rand() < clamp(p, 0.004, 0.09)) {
          const n = Math.min(hunters.length, 2 + (rand() < 0.4 ? 1 : 0));
          const hs = hunters.sort(() => rand() - 0.5).slice(0, n);
          note('caught', sd, { who: u.role });
          const at = u.lane === 'jg' ? pick(CAMPS[sd]) : lanePoint(u.lane, front[u.lane]);
          for (const h of hs) h.pos = jit(at, 2);
          fight(hs, [u], at, { rounds: 4, surprise: sd, at, src: 'caught' });
        }
      }
    }
    // farm khi không giao tranh
    for (const u of [...alive('B'), ...alive('R')]) {
      if (u.recall) continue;
      const lane = u.lane === 'jg' ? null : u.lane;
      if (u.task === 'lane') {
        const rate = u.role === 'Support' ? 0.3 : u.role === 'Jungle' ? 1.75 : u.role === 'Bot' ? 2.75 : 2.5;
        const cs = rate * clamp(0.93 + (u.at.farm - 70) / 250, 0.5, 1.15);
        u.cs += cs; giveGold(u, cs * 21 + (u.role === 'Support' ? 12 : 0)); giveXp(u, 85);
        u.hp = Math.min(1, u.hp + 0.03);
        if (u.mv !== tick) u.pos = lane ? jit(lanePoint(lane, front[lane]), 2) : jit(pick(CAMPS[u.side]), 2);
      } else if (u.task === 'group') {
        const cs = (u.role === 'Support' ? 0.25 : u.role === 'Jungle' ? 1.4 : u.role === 'Bot' ? 2.3 : 2.0) * clamp(0.93 + (u.at.farm - 70) / 250, 0.5, 1.15);
        u.cs += cs; giveGold(u, cs * 21 + 8); giveXp(u, 75);
      }
    }
  }

  // ---------------- vòng lặp chính ----------------
  const MAX_TICKS = 4 * 60; // 60 phút
  while (!winner && tick < MAX_TICKS) {
    tick++; sec = tick * TICK;
    applyPlans();
    for (const u of [...team('B'), ...team('R')]) {
      if (u.dead) { u.dead--; u.pos = [...BASE[u.side]]; if (!u.dead) { u.hp = 1; u.task = u.role === 'Jungle' && sec < 840 ? 'jungle' : 'lane'; } continue; }
      if (sec >= 65) giveGold(u, 30.6);
      if (u.recall) { u.recall--; u.pos = [...BASE[u.side]]; if (!u.recall) { u.hp = 1; u.task = u.role === 'Jungle' && sec < 840 ? 'jungle' : 'lane'; } continue; }
      // về nhà khi máu thấp — judgment thấp dễ "tham" ở lại
      if (u.hp < 0.3 && rand() < 0.45 + u.at.judgment / 200) { u.recall = 2; u.pos = [...BASE[u.side]]; }
    }
    const laning = sec < 840 && taken.B + taken.R < 4;
    if (laning) {
      for (const k of ['dragon', 'grubs', 'herald'] as ObjKey[]) if (objUp(k)) contestObj(k);
      laningTick();
      for (const u of [...team('B'), ...team('R')]) if (!u.dead && !u.recall && u.task === 'lane' && u.mv !== tick) u.pos = jit(toward(lanePoint(u.lane === 'jg' ? 'mid' : u.lane, u.lane === 'jg' ? 0.5 : front[u.lane]), u.side, u.role === 'Support' ? 3 : 1.5), 1.5);
    } else {
      for (const u of [...team('B'), ...team('R')]) if (u.task === 'jungle' || u.task === 'gank') u.task = 'lane';
      macroTick();
    }
    for (const l of LANES) laneTick(l, laning);
    // nhà lính hồi sinh sau 5 phút, trụ nhà chính sau 3 phút
    for (const ih of Object.values(inhib)) if (!ih.alive && sec >= ih.back) { ih.alive = true; ih.hp = 80; ev('inhibBack', ih.side, { id: ih.id }); }
    for (const sd of SIDES) for (const i of [0, 1]) {
      const nt = towers[`${sd}-nexus-${i}`];
      if (!nt.alive && nt.back && sec >= nt.back) { nt.alive = true; nt.hp = 52; nt.back = 0; ev('towerBack', sd, { id: nt.id }); }
    }
    // sau 40 phút: không còn ai thủ được lâu, nhà chính yếu dần
    if (sec > 2400) for (const sd of SIDES) nexus[sd] -= 0.4;
    for (const k of Object.keys(objSeen) as ObjKey[]) if (sec === obj[k]) objSeen[k] = sec;
    if (frames) frames.push(snap());
  }
  if (!winner) winner = teamGold('B') + taken.B * 800 >= teamGold('R') + taken.R * 800 ? 'B' : 'R';
  ev('nexus', winner, { at: BASE[OPP[winner]] });

  function snap(): Record<string, FrameUnit> {
    const f: Record<string, FrameUnit> = {};
    for (const u of [...team('B'), ...team('R')]) f[u.k] = [Math.round(u.pos[0] * 10) / 10, Math.round(u.pos[1] * 10) / 10, u.dead ? 0 : Math.round(u.hp * 100) / 100, u.dead, u.lvl, Math.round(u.gold), Math.round(u.cs), u.kills, u.deaths, u.assists];
    return f;
  }

  // ---------------- tổng hợp ----------------
  const dur = Math.max(1, Math.ceil(sec / 60));
  // vàng chênh lệch theo phút (Xanh - Đỏ), lấy từ khung hình nếu có, nếu không thì nội suy
  const gold = [0];
  if (frames) {
    for (let m = 1; m <= dur; m++) {
      const fr = frames[Math.min(frames.length - 1, m * 4 - 1)];
      gold.push(ROLES.reduce((s, r) => s + fr['B' + r][5] - fr['R' + r][5], 0));
    }
  } else {
    const gd = teamGold('B') - teamGold('R');
    for (let m = 1; m <= dur; m++) gold.push(Math.round(gd * (m / dur) ** 1.3));
  }
  const players = [];
  for (const u of [...team('B'), ...team('R')]) {
    const dmg = Math.round(u.dealt * 600 + dur * 60), early = Math.round(u.dealtEarly * 600 + Math.min(dur, 14) * 60);
    players.push({ side: u.side, role: u.role, pid: u.pid, champ: u.champ, k: u.kills, d: u.deaths, a: u.assists, cs: Math.round(u.cs), gold: Math.round(u.gold), dmg, dmgEarly: Math.min(early, dmg), build: u.build?.slice(0, 6), adapt: u.adapt });
  }
  const score = (x: PlayerLine): number => x.k * 3 + x.a * 1.5 - x.d * 1.5 + x.dmg / 2500 + x.gold / 3000;
  const mvp = players.filter((x) => x.side === winner && x.pid).sort((a, b) => score(b) - score(a))[0];
  events.sort((a, b) => a.t - b.t);
  return {
    winner, winnerId: winner === 'B' ? blue : red, blue, red, dur, durS: sec, gold, events, kills, towers: taken,
    drakes: { B: buff.B.drakes, R: buff.R.drakes }, soul: buff.B.soul ? 'B' : buff.R.soul ? 'R' : null, obj: tally,
    players, mvp: mvp ? mvp.pid : null, picks, bans, frames, fights: fightLog || undefined,
    runes: Object.fromEntries([...team('B'), ...team('R')].map((u) => [u.k, u.rune])),
  };
}
