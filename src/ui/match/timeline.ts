// Dòng thời gian phát lại liên tục: engine ghi khung hình mỗi 15 giây, ở đây nội suy theo từng giây "trong trận"
// để xem ở tốc độ 1x giống một trận thật (đi bộ, về nhà, chết/hồi sinh đúng thời điểm).
import { TICK, BASE } from '../../engine/engine';
import { ROLES } from '../../engine/util';
import type { FightRec, GameEvent, GameResult, Side } from '../../engine/types';

export interface DispEv extends GameEvent { d: number }
export interface KF { t: number; x: number; y: number; hp: number; alive: boolean }
export interface UnitState { x: number; y: number; hp: number; alive: boolean; recall: number; moving: boolean; dx: number; dy: number; deadSince: number; fight?: boolean }

const KILLS = new Set(['kill', 'firstblood']);
export const unitKeys = (): string[] => (['B', 'R'] as Side[]).flatMap((s) => ROLES.map((r) => s + r));

export class Timeline {
  readonly end: number;
  readonly evs: DispEv[];
  readonly kf: Record<string, KF[]> = {};
  readonly deaths: Record<string, { d: number; at: [number, number] }[]> = {};
  /** các pha giao tranh mà mỗi tướng tham gia (phát lại đúng vị trí/máu đã giả lập) */
  readonly fightsOf: Record<string, { f: FightRec; i: number; a: number; b: number }[]> = {};
  readonly acts: { at: number; s: string; k: string; tg?: string; x?: number; y?: number }[] = [];

  constructor(readonly g: GameResult) {
    const F = g.frames || [];
    this.end = g.durS;
    // thời điểm hiển thị: các sự kiện trong cùng một nhịp được rải ra trong 15 giây trước đó
    const byTick = new Map<number, GameEvent[]>();
    for (const e of g.events) { const a = byTick.get(e.t) || []; a.push(e); byTick.set(e.t, a); }
    const evs: DispEv[] = [];
    for (const [, list] of byTick) {
      const n = list.length;
      const step = Math.min(1.8, 10 / Math.max(n, 1));
      list.forEach((e, i) => {
        let d = e.s - TICK + 3 + i * step;
        if (e.type === 'nexus') d = Math.max(e.s - 1, this.end - 1);
        if (typeof e.ft === 'number') d = e.ft as number;
        evs.push({ ...e, d: Math.min(Math.max(d, 0), e.s - 0.3) });
      });
    }
    evs.sort((a, b) => a.d - b.d);
    this.evs = evs;
    for (const k of unitKeys()) { this.deaths[k] = []; this.fightsOf[k] = []; }
    for (const f of g.fights || []) {
      const end = f.s0 + (f.frames.length ? f.frames[f.frames.length - 1][0] : 0) * f.ts;
      f.keys.forEach((k, i) => this.fightsOf[k]?.push({ f, i, a: f.s0, b: end }));
      for (const x of f.acts) this.acts.push({ ...x, at: f.s0 + x.t * f.ts });
    }
    this.acts.sort((x, y) => x.at - y.at);
    for (const e of evs) if (KILLS.has(e.type) && e.victim) {
      const os = e.side === 'B' ? 'R' : 'B';
      this.deaths[os + e.victim].push({ d: e.d, at: (e.at as [number, number]) || [50, 50] });
    }
    for (const k of unitKeys()) {
      const sd = k[0] as Side;
      const list: KF[] = [{ t: 0, x: BASE[sd][0], y: BASE[sd][1], hp: 1, alive: true }];
      const deaths = [...this.deaths[k]];
      let prevAlive = true;
      F.forEach((fr, i) => {
        const v = fr[k];
        if (!v) return;
        const t = (i + 1) * TICK;
        const alive = v[3] === 0;
        if (prevAlive && !alive) {
          // chết trong nhịp này: thêm khung "ngã xuống" đúng lúc sự kiện hạ gục
          const dth = deaths.find((x) => x.d > t - TICK - 0.01 && x.d <= t + 0.01) || { d: t - TICK / 2, at: [list[list.length - 1].x, list[list.length - 1].y] as [number, number] };
          list.push({ t: dth.d - 0.01, x: dth.at[0], y: dth.at[1], hp: 0.05, alive: true });
          list.push({ t: dth.d, x: dth.at[0], y: dth.at[1], hp: 0, alive: false });
        }
        list.push({ t, x: v[0], y: v[1], hp: v[2], alive });
        prevAlive = alive;
      });
      this.kf[k] = list;
    }
  }

  /** chỉ số khung hình (dùng cho số liệu HUD: vàng, cs, KDA, cấp) */
  frameIdx(gt: number): number { return Math.min((this.g.frames?.length || 1) - 1, Math.max(0, Math.floor(gt / TICK) - 1)); }

  unit(k: string, gt: number): UnitState {
    const L = this.kf[k];
    let i = 0, lo = 0, hi = L.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].t <= gt) { i = m; lo = m + 1; } else hi = m - 1; }
    const a = L[i], b = L[Math.min(i + 1, L.length - 1)];
    if (!a.alive) return { x: a.x, y: a.y, hp: 0, alive: false, recall: -1, moving: false, dx: 0, dy: 0, deadSince: gt - a.t };
    const fw = this.fightsOf[k].find((w) => gt >= w.a - 1.2 && gt <= w.b);
    if (fw) {
      const fr = fw.f.frames, lt = Math.max(0, (gt - fw.a) / fw.f.ts);
      let j = 0; while (j < fr.length - 1 && fr[j + 1][0] <= lt) j++;
      const p = fr[j], q = fr[Math.min(j + 1, fr.length - 1)], o = 1 + fw.i * 3;
      const ff = q[0] > p[0] ? Math.min(1, Math.max(0, (lt - p[0]) / (q[0] - p[0]))) : 0;
      let x = p[o] + (q[o] - p[o]) * ff, y = p[o + 1] + (q[o + 1] - p[o + 1]) * ff;
      const hp = p[o + 2] + (q[o + 2] - p[o + 2]) * ff;
      if (gt < fw.a) { // tiến vào giao tranh: hoà dần từ đường đi bình thường
        const base0 = this.unitPlain(k, gt, L, i);
        const w = (gt - (fw.a - 1.2)) / 1.2; x = base0.x + (x - base0.x) * w; y = base0.y + (y - base0.y) * w;
      }
      const ddx = q[o] - p[o], ddy = q[o + 1] - p[o + 1], dd = Math.hypot(ddx, ddy);
      return { x, y, hp: Math.max(0.02, hp), alive: true, recall: -1, moving: dd > 0.05, dx: dd ? ddx / dd : 0, dy: dd ? ddy / dd : 0, deadSince: 0, fight: true };
    }
    return this.unitPlain(k, gt, L, i);
  }

  private unitPlain(k: string, gt: number, L: KF[], i: number): UnitState {
    const a = L[i], b = L[Math.min(i + 1, L.length - 1)];
    if (!a.alive) return { x: a.x, y: a.y, hp: 0, alive: false, recall: -1, moving: false, dx: 0, dy: 0, deadSince: gt - a.t };
    const span = Math.max(b.t - a.t, 0.001);
    const f = Math.min(1, Math.max(0, (gt - a.t) / span));
    const sd = k[0] as Side;
    const base = BASE[sd];
    const far = Math.hypot(a.x - base[0], a.y - base[1]);
    const near = Math.hypot(b.x - base[0], b.y - base[1]);
    // về nhà: đứng niệm 8 giây rồi dịch chuyển (engine đặt tướng về nhà ngay trong khung kế)
    if (b.alive && far > 16 && near < 6 && span >= TICK - 0.1) {
      const ch = gt - a.t;
      if (ch < 8) return { x: a.x, y: a.y, hp: a.hp, alive: true, recall: ch / 8, moving: false, dx: 0, dy: 0, deadSince: 0 };
      return { x: b.x, y: b.y, hp: a.hp + (b.hp - a.hp) * f, alive: true, recall: -1, moving: false, dx: 0, dy: 0, deadSince: 0 };
    }
    // vừa hồi sinh ở bệ đá: rời nhà rồi đi bộ
    const tx = b.alive ? b.x : a.x, ty = b.alive ? b.y : a.y;
    const dx = tx - a.x, dy = ty - a.y;
    const dist = Math.hypot(dx, dy);
    // tướng đi tối đa ~2.4 đơn vị bản đồ/giây (≈ 350 tốc chạy); đoạn ngắn thì đến sớm rồi đứng
    const need = dist / 2.4;
    const ff = need >= span ? f : Math.min(1, (gt - a.t) / Math.max(need, 0.001));
    let x = a.x + dx * ff, y = a.y + dy * ff;
    // giai đoạn đi đường: hai bên đứng tách nhau quanh đợt lính (engine chỉ lệch rất ít)
    if (gt < 840 && !k.endsWith('Jungle') && Math.hypot(x - base[0], y - base[1]) > 18) {
      const fade = gt > 780 ? (840 - gt) / 60 : 1;
      const off = (k.endsWith('Support') ? 4.2 : 3.4) * fade;
      // hướng về nhà dọc theo đường đang đứng
      const [ux, uy] = x < 20 && y < 84 && y > 18 ? [0, 1] : y < 20 ? [-1, 0] : y > 80 && x > 18 ? [-1, 0] : x > 80 ? [0, 1] : [-0.707, 0.707];
      const sg = sd === 'B' ? 1 : -1;
      x += ux * off * sg; y += uy * off * sg;
    }
    return { x, y, hp: a.hp + ((b.alive ? b.hp : a.hp) - a.hp) * f, alive: true, recall: -1, moving: ff < 1 && dist > 0.5, dx: dist ? dx / dist : 0, dy: dist ? dy / dist : 0, deadSince: 0 };
  }
}
