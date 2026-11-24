// Giao tranh thời gian thực (kiểu Teamfight Manager): mỗi tướng là một tác tử, mỗi bước 0,15 giây
// tự chọn mục tiêu, di chuyển, giữ tầm, đánh thường, dùng chiêu (Q / di chuyển / chiêu cuối) và rút lui.
// Chỉ số tuyển thủ quyết định hành vi: accuracy/dodge → trúng/né chiêu định hướng; positioning → giữ khoảng cách,
// ít dính chiêu lan; judgment → chọn mục tiêu & rút lui đúng lúc; aggression → lao lên sớm; focus → phản xạ khi bị bắt;
// creativity → outplay; teamwork/leadership → phối hợp dồn sát thương; composure/stamina → khi bị dẫn / cuối trận.
import { clamp, rand, gauss } from './util';
import type { Attr, Side } from './types';

export type Cls = 'Fighter' | 'Tank' | 'Assassin' | 'Mage' | 'Marksman' | 'Support';
export interface CUnit {
  key: string; side: Side; cls: Cls; ranged: boolean; sub?: string; range?: number; line: 'front' | 'dive' | 'back'; healer: boolean;
  at: Record<Attr, number>; tr: Set<string>; lvl: number;
  hp: number; maxHp: number; atk: number; mult: number; caught: boolean;
  x: number; y: number;
}
export interface CombatOpts {
  center: [number, number]; maxT: number; initiative: Side; focus: Record<Side, string>; record: boolean;
}
export interface CAct { t: number; s: string; k: 'aa' | 'q' | 'ult' | 'dash' | 'heal' | 'stun' | 'dodge'; tg?: string; x?: number; y?: number }
export interface CDeath { key: string; killer: string; assists: string[]; t: number; x: number; y: number }
export interface CombatOut {
  deaths: CDeath[]; hp: Record<string, number>; out: Set<string>; dealt: Record<string, number>;
  outplays: string[]; disengaged: Side[]; dur: number;
  rec?: { keys: string[]; frames: number[][]; acts: CAct[] };
}

const DT = 0.15;
const SPEED = 2.5; // đơn vị bản đồ / giây
const RANGE: Record<Cls, number> = { Fighter: 1.4, Tank: 1.3, Assassin: 1.3, Mage: 4.6, Marksman: 5.2, Support: 4.2 };
const AS: Record<Cls, number> = { Fighter: 1, Tank: 1.15, Assassin: .9, Mage: 1.25, Marksman: .75, Support: 1.25 }; // giây / đòn
const DPS_K = 0.038;

interface Ag extends CUnit {
  cd: number; qcd: number; ecd: number; ult: boolean; stun: number; tgt: Ag | null; retarget: number;
  leaving: boolean; gone: boolean; dead: boolean; hitBy: Map<string, number>; dealt: number; shield: number; outplay: boolean;
}

export function simulateCombat(units: CUnit[], o: CombatOpts): CombatOut {
  const ag: Ag[] = units.map((u) => ({ ...u, cd: rand() * .6, qcd: 1 + rand() * 2.5, ecd: 2 + rand() * 3, ult: u.lvl >= 6, stun: 0, tgt: null, retarget: 0, leaving: false, gone: false, dead: false, hitBy: new Map(), dealt: 0, shield: 0, outplay: false }));
  const out: CombatOut = { deaths: [], hp: {}, out: new Set(), dealt: {}, outplays: [], disengaged: [], dur: 0 };
  const rec = o.record ? { keys: ag.map((a) => a.key), frames: [] as number[][], acts: [] as CAct[] } : null;
  const act = (a: CAct) => { if (rec) rec.acts.push(a); };
  const sideDir = (sd: Side) => (sd === 'B' ? [-0.707, 0.707] : [0.707, -0.707]); // hướng về nhà
  // xếp đội hình: tuyến trên đứng trước, xạ thủ/pháp sư đứng sau; bị bắt bài thì đứng lạc vị trí
  for (const a of ag) {
    const [dx, dy] = sideDir(a.side);
    const back = a.line === 'front' ? 3 : a.line === 'dive' ? 4.5 : 6.5;
    const d = a.caught ? 1.2 : back + gauss() * .8;
    const sx = gauss() * 2.2, sy = gauss() * 2.2;
    a.x = clamp(o.center[0] + dx * d + sx, 1, 99); a.y = clamp(o.center[1] + dy * d + sy, 1, 99);
    if (a.caught) a.stun = .5 + (90 - a.at.focus) / 120;
  }
  const foesOf = (a: Ag) => ag.filter((b) => b.side !== a.side && !b.dead && !b.gone);
  const alliesOf = (a: Ag) => ag.filter((b) => b.side === a.side && !b.dead && !b.gone);
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const power = (sd: Side) => ag.filter((a) => a.side === sd && !a.dead && !a.gone && !a.leaving).reduce((s, a) => s + a.atk * (a.hp / a.maxHp + .25) * Math.sqrt(a.maxHp), 0);

  const pickTarget = (a: Ag): Ag | null => {
    const foes = foesOf(a);
    if (!foes.length) return null;
    const front = foes.some((e) => e.line === 'front');
    let best: Ag | null = null, bw = -1;
    for (const e of foes) {
      const d = dist(a, e);
      let w = 1 / (1 + d * .35);
      const hpf = e.hp / e.maxHp;
      const f = o.focus[a.side];
      if (f === 'carry') w *= e.line === 'back' ? 2.2 : 1;
      else if (f === 'weakest') w *= 1 / (hpf + .2);
      else w *= 1 / (hpf + .5);
      // vượt tuyến trước để với tuyến sau: sát thủ giỏi việc này; judgment & positioning quyết định
      if (e.line === 'back' && front) w *= a.line === 'dive' ? 1.8 : clamp(.4 + (a.at.judgment - e.at.positioning) / 120, .15, .9);
      if (e.stun > 0) w *= 1.5; // dồn vào mục tiêu đang bị khống chế
      w *= 1 + (a.at.teamwork - 70) / 150 * ag.filter((x) => x.side === a.side && x.tgt === e).length * .4;
      if (w > bw) { bw = w; best = e; }
    }
    return best;
  };
  const deal = (src: Ag, tg: Ag, dmg: number, t: number) => {
    if (tg.dead || tg.gone) return;
    dmg *= 1 - (tg.at.positioning - 70) / 400;
    if (tg.shield > 0) { const ab = Math.min(tg.shield, dmg); tg.shield -= ab; dmg -= ab; }
    tg.hp -= dmg; src.dealt += dmg; tg.hitBy.set(src.key, t);
    if (tg.hp <= 0) {
      // outplay: né cú kết liễu (creativity)
      if (!tg.outplay && rand() < (tg.at.creativity - 60) / 220) { tg.outplay = true; tg.hp = tg.maxHp * .06; out.outplays.push(tg.key); act({ t, s: tg.key, k: 'dodge' }); return; }
      tg.dead = true;
      const assists = [...tg.hitBy.entries()].filter(([k, tt]) => k !== src.key && t - tt < 10).map(([k]) => k);
      // đòn kết liễu đôi khi thuộc về đồng đội góp sát thương
      let killer = src.key;
      if (assists.length && rand() < .25) { const k2 = assists[Math.floor(rand() * assists.length)]; assists.splice(assists.indexOf(k2), 1, killer); killer = k2; }
      out.deaths.push({ key: tg.key, killer, assists, t, x: tg.x, y: tg.y });
    }
  };
  const hitChance = (a: Ag, e: Ag) => clamp(.6 + (a.at.accuracy - e.at.dodge) / 130, .25, .95);

  let t = 0, idle = 0;
  const maxT = o.maxT;
  while (t < maxT) {
    t += DT;
    // cả đội rút khi đọc ra thế thua (judgment), mỗi giây xét một lần
    if (Math.abs(t % 1) < DT) for (const sd of ['B', 'R'] as Side[]) {
      const mine = ag.filter((a) => a.side === sd && !a.dead && !a.gone);
      if (!mine.length || mine.every((a) => a.leaving)) continue;
      const ratio = power(sd) / Math.max(power(sd === 'B' ? 'R' : 'B'), .01);
      const j = mine.reduce((s, a) => s + a.at.judgment, 0) / mine.length + (mine.some((a) => a.tr.has('calm')) ? 8 : 0) - (mine.some((a) => a.tr.has('hothead')) ? 10 : 0);
      if (t > 1.5 && ratio < .55 && rand() < j / 140 * DT * 6) { mine.forEach((a) => { a.leaving = true; }); if (mine.length >= 2) out.disengaged.push(sd); }
    }
    let engaged = false;
    for (const a of ag) {
      if (a.dead || a.gone) continue;
      if (a.stun > 0) { a.stun -= DT; continue; }
      a.cd -= DT; a.qcd -= DT; a.ecd -= DT; a.retarget -= DT;
      // rút lui cá nhân khi máu thấp
      if (!a.leaving && a.hp / a.maxHp < .22 && rand() < a.at.judgment / 170 * DT * 4) a.leaving = true;
      const foes = foesOf(a);
      if (!foes.length) break;
      const near = foes.reduce((m, e) => (dist(a, e) < dist(a, m) ? e : m), foes[0]);
      if (a.leaving) {
        const [dx, dy] = sideDir(a.side);
        const sp = SPEED * (1 + (a.at.dodge - 70) / 300);
        a.x = clamp(a.x + dx * sp * DT, 1, 99); a.y = clamp(a.y + dy * sp * DT, 1, 99);
        if (a.ecd <= 0 && dist(a, near) < 3 && (a.cls === 'Assassin' || a.cls === 'Marksman' || a.cls === 'Fighter')) { a.x = clamp(a.x + dx * 2.5, 1, 99); a.y = clamp(a.y + dy * 2.5, 1, 99); a.ecd = 12; act({ t, s: a.key, k: 'dash', x: a.x, y: a.y }); }
        if (dist(a, near) > 9) a.gone = true;
        continue;
      }
      if (!a.tgt || a.tgt.dead || a.tgt.gone || a.retarget <= 0) { a.tgt = pickTarget(a); a.retarget = .6 + (100 - a.at.judgment) / 100; }
      const tg = a.tgt;
      if (!tg) continue;
      const d = dist(a, tg);
      const range = a.range ?? RANGE[a.cls];
      const m = a.mult * (t < 1.5 && a.side === o.initiative ? 1.2 : 1);
      // hồi máu / khiên đồng minh yếu nhất (hỗ trợ)
      if ((a.healer || (a.sub === 'Support' && a.cls === 'Mage')) && a.qcd <= 0 && alliesOf(a).some((x) => x.hp / x.maxHp < .6)) {
        const ally = alliesOf(a).filter((x) => dist(x, a) < 6).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
        if (ally && ally.hp / ally.maxHp < .75) { const v = a.atk * DPS_K * 5 * m; ally.hp = Math.min(ally.maxHp, ally.hp + v * .6); ally.shield += v * .5; a.qcd = 7; act({ t, s: a.key, k: 'heal', tg: ally.key }); }
      }
      // chiêu cuối (cấp 6+): một lần mỗi giao tranh, ai dùng đúng lúc là nhờ judgment
      if (a.ult && d < range + 3 && rand() < (.25 + a.at.judgment / 400) * DT * 3) {
        a.ult = false;
        const big = a.atk * DPS_K * 9 * m;
        if (a.cls === 'Tank' || a.cls === 'Support') {
          for (const e of foesOf(a)) if (dist(e, tg) < 3.2 && rand() < hitChance(a, e) + .1) { e.stun = Math.max(e.stun, 1.2); deal(a, e, big * .35, t); }
          if (a.cls === 'Support') for (const al of alliesOf(a)) if (dist(al, a) < 6) al.shield += big * .4;
          act({ t, s: a.key, k: 'ult', tg: tg.key, x: tg.x, y: tg.y });
        } else if (a.cls === 'Mage') {
          for (const e of foesOf(a)) if (dist(e, tg) < 3) deal(a, e, big * (rand() < hitChance(a, e) ? 1 : .35), t);
          act({ t, s: a.key, k: 'ult', tg: tg.key, x: tg.x, y: tg.y });
        } else {
          if (a.cls === 'Assassin' || a.cls === 'Fighter') { a.x = tg.x + .8; a.y = tg.y + .8; }
          deal(a, tg, big * (a.cls === 'Assassin' ? 1.25 : 1), t);
          if (a.cls === 'Fighter') a.hp = Math.min(a.maxHp, a.hp + big * .3);
          act({ t, s: a.key, k: 'ult', tg: tg.key });
        }
        engaged = true;
        continue;
      }
      // kỹ năng di chuyển: sát thủ/đấu sĩ lao vào, xạ thủ lùi lại thả diều
      if (a.ecd <= 0) {
        if ((a.cls === 'Assassin' || a.cls === 'Fighter' || a.sub === 'Assassin') && d > range + 1 && d < 7 && rand() < (.4 + a.at.aggression / 200) * DT * 4) {
          const k = (d - range * .8) / d; a.x += (tg.x - a.x) * k; a.y += (tg.y - a.y) * k; a.ecd = 10; act({ t, s: a.key, k: 'dash', x: a.x, y: a.y }); continue;
        }
        if (a.ranged && dist(a, near) < 1.8 && !near.ranged) {
          const dx = a.x - near.x, dy = a.y - near.y, n = Math.hypot(dx, dy) || 1; a.x = clamp(a.x + dx / n * 3, 1, 99); a.y = clamp(a.y + dy / n * 3, 1, 99); a.ecd = 12; act({ t, s: a.key, k: 'dash', x: a.x, y: a.y }); continue;
        }
      }
      if (d > range) {
        // tiến tới mục tiêu (tuyến sau đứng chờ tuyến trước nếu positioning tốt)
        const wait = a.line === 'back' && t < 1.2 && a.at.positioning > 70;
        if (!wait) { const sp = SPEED * DT; a.x += (tg.x - a.x) / d * Math.min(sp, d - range * .9); a.y += (tg.y - a.y) / d * Math.min(sp, d - range * .9); }
        if (d < range + 4) engaged = true;
        continue;
      }
      engaged = true;
      // thả diều: tướng đánh xa lùi lại khi cận chiến áp sát (positioning)
      if (a.ranged && !near.ranged && dist(a, near) < 1.5 && rand() < a.at.positioning / 130 * DT * 5) {
        const dx = a.x - near.x, dy = a.y - near.y, n = Math.hypot(dx, dy) || 1; a.x = clamp(a.x + dx / n * SPEED * DT, 1, 99); a.y = clamp(a.y + dy / n * SPEED * DT, 1, 99);
      }
      // chiêu Q: sát thương lớn có thể trượt; đỡ đòn/hỗ trợ có khống chế
      if (a.qcd <= 0 && !(a.healer && a.cls === 'Support')) {
        a.qcd = a.cls === 'Mage' ? 5 : 7;
        const hit = rand() < hitChance(a, tg);
        const cc = a.cls === 'Tank' || a.cls === 'Support' || a.sub === 'Tank';
        const aoe = a.cls === 'Mage' || a.sub === 'Mage';
        if (hit) {
          const qd = a.atk * DPS_K * (a.cls === 'Mage' ? 3.2 : a.cls === 'Assassin' ? 2.8 : 2) * m * (a.sub === 'Mage' && a.cls !== 'Mage' ? 1.15 : 1);
          deal(a, tg, qd, t);
          if (aoe) for (const e of foesOf(a)) if (e !== tg && dist(e, tg) < 1.8) deal(a, e, qd * .5, t); // chiêu lan
          if (cc) tg.stun = Math.max(tg.stun, a.cls === 'Tank' ? 1 : .75);
          act({ t, s: a.key, k: cc ? 'stun' : 'q', tg: tg.key });
        } else act({ t, s: a.key, k: 'q', x: tg.x + gauss(), y: tg.y + gauss() });
        continue;
      }
      // đánh thường
      if (a.cd <= 0) {
        a.cd = AS[a.cls];
        const acc = clamp(.88 + (a.at.accuracy - 70) / 400, .75, .99);
        if (rand() < acc) deal(a, tg, a.atk * DPS_K * AS[a.cls] * m * (.85 + rand() * .3), t);
        act({ t, s: a.key, k: 'aa', tg: tg.key });
      }
    }
    if (rec && Math.round(t / DT) % 2 === 0) rec.frames.push([+t.toFixed(2), ...ag.flatMap((a) => [+a.x.toFixed(2), +a.y.toFixed(2), a.dead ? 0 : +Math.max(0, a.hp / a.maxHp).toFixed(2)])]);
    const sides = new Set(ag.filter((a) => !a.dead && !a.gone && !a.leaving).map((a) => a.side));
    if (sides.size < 2) { if (ag.every((a) => a.dead || a.gone || !a.leaving || a.side === [...sides][0])) break; }
    idle = engaged ? 0 : idle + DT;
    if (idle > 3) break;
  }
  out.dur = t;
  for (const a of ag) { out.hp[a.key] = Math.max(0, a.hp / a.maxHp); out.dealt[a.key] = a.dealt; if (a.gone || a.leaving) out.out.add(a.key); }
  if (rec) out.rec = rec;
  return out;
}
