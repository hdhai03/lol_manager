// Sân đấu 3D (three.js qua CDN) cho màn xem trận — chạy theo đồng hồ trận liên tục:
// 1x = thời gian thật. Tướng 3D dựng theo lớp tướng, có hoạt ảnh đi bộ / đánh thường / tung chiêu / về nhà / chết;
// lính đi đường theo đợt mỗi 30 giây, trụ bắn tia, quái lớn xuất hiện đúng mốc thời gian, camera tự bám giao tranh.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BASE, PIT, MIR, BLUE_TOWERS } from '../../engine/engine';
import { DB } from '../../engine/data';
import type { Side } from '../../engine/types';
import type { Timeline, DispEv } from './timeline';
import { unitKeys } from './timeline';

declare const THREE: any;
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
let loading: Promise<boolean> | null = null;
export function loadThree(): Promise<boolean> {
  if ((window as any).THREE) return Promise.resolve(true);
  loading ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = THREE_URL; s.async = true;
    s.onload = () => res(true); s.onerror = () => { loading = null; rej(new Error('three')); };
    document.head.appendChild(s);
  });
  return loading;
}
export function webglOk(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

type P2 = [number, number];
const W = (p: P2 | number[]) => ({ x: (p[0] - 50) * 2, z: (p[1] - 50) * 2 });
const LANES: Record<string, P2[]> = {
  top: [[9, 91], [9, 84], [9, 10], [84, 10], [91, 9]],
  mid: [[9, 91], [16, 84], [84, 16], [91, 9]],
  bot: [[9, 91], [16, 91], [90, 91], [91, 9]],
};
const polyLen = (pts: P2[]) => pts.slice(1).reduce((s, b, i) => s + Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]), 0);
function polyAt(pts: P2[], d: number): P2 {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l) return [a[0] + (b[0] - a[0]) * (d / l), a[1] + (b[1] - a[1]) * (d / l)];
    d -= l;
  }
  return pts[pts.length - 1];
}
function polyProject(pts: P2[], p: P2): number {
  let best = 1e9, bestD = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const dd = Math.hypot(p[0] - a[0] - tt * dx, p[1] - a[1] - tt * dy);
    if (dd < best) { best = dd; bestD = acc + tt * l; }
    acc += l;
  }
  return bestD;
}
const distSeg = (p: P2, a: P2, b: P2) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - tt * dx, p[1] - a[1] - tt * dy);
};

const TEAM = { B: 0x3d8bff, R: 0xff4757 } as const;
const TEAM_L = { B: 0x9cc8ff, R: 0xffb0a8 } as const;
const MSPD = 2.2; // tốc chạy lính (đơn vị bản đồ / giây)

// ---------------- lớp tướng ----------------
type Cls = 'Fighter' | 'Tank' | 'Assassin' | 'Mage' | 'Marksman' | 'Support';
function champKind(id: string): { cls: Cls; ranged: boolean } {
  const tags = DB.champions[id]?.tags || ['Fighter'];
  const cls = (['Fighter', 'Tank', 'Assassin', 'Mage', 'Marksman', 'Support'].includes(tags[0]) ? tags[0] : 'Fighter') as Cls;
  const ranged = tags.includes('Marksman') || tags.includes('Mage') || (tags.includes('Support') && !tags.includes('Tank') && !tags.includes('Fighter'));
  return { cls, ranged };
}

/** lấy 2 màu chủ đạo của tướng từ ảnh tướng */
function sampleColors(url: string, cb: (a: number, b: number) => void): void {
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, 24, 24);
      const d = g.getImageData(4, 4, 16, 16).data;
      const buckets: Record<string, [number, number, number, number, number]> = {};
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        const sat = mx ? (mx - mn) / mx : 0;
        if (mx < 45 || (mx > 215 && sat < .18)) continue; // bỏ nền tối và vùng cháy sáng
        const key = `${r >> 6}${gg >> 6}${b >> 6}`;
        const bk = (buckets[key] ??= [0, 0, 0, 0, 0]);
        bk[0] += r; bk[1] += gg; bk[2] += b; bk[3]++; bk[4] += sat;
      }
      const list = Object.values(buckets).filter((x) => x[3] >= 3);
      if (!list.length) return;
      const score = (x: number[]) => x[3] * (0.25 + x[4] / x[3]);
      list.sort((x, y) => score(y) - score(x));
      const col = (bk: number[], k: number) => ((Math.round(bk[0] / bk[3] * k) << 16) | (Math.round(bk[1] / bk[3] * k) << 8) | Math.round(bk[2] / bk[3] * k));
      const second = list.find((x) => Math.abs(x[0] / x[3] - list[0][0] / list[0][3]) + Math.abs(x[2] / x[3] - list[0][2] / list[0][3]) > 60) || list[1] || list[0];
      cb(col(list[0], .85), col(second, .7));
    } catch { /* ảnh khác nguồn: giữ màu mặc định */ }
  };
  img.src = url;
}

interface Model { root: any; body: any; legL: any; legR: any; armL: any; armR: any; head: any; mats: any[]; prim: any; sec: any; weaponTip: any }
function buildChamp(cls: Cls, side: Side): Model {
  const prim = new THREE.MeshStandardMaterial({ color: 0x8892a6, roughness: .55, metalness: .25 });
  const sec = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: .6, metalness: .3 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe2b99a, roughness: .7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9d1dc, roughness: .25, metalness: .85 });
  const glow = new THREE.MeshStandardMaterial({ color: TEAM_L[side], emissive: TEAM[side], emissiveIntensity: 1.4, roughness: .3 });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const wide = cls === 'Tank' ? 1.3 : cls === 'Assassin' ? .85 : 1;
  const mk = (geo: any, mat: any, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  // chân (khớp ở hông)
  const leg = (sx: number) => { const g = new THREE.Group(); g.position.set(sx * .45 * wide, 2.1, 0); g.add(mk(new THREE.CylinderGeometry(.34 * wide, .26, 2.1, 8), sec, 0, -1.05, 0)); g.add(mk(new THREE.BoxGeometry(.5 * wide, .3, .8), sec, 0, -2.05, .15)); body.add(g); return g; };
  const legL = leg(-1), legR = leg(1);
  // thân
  if (cls === 'Mage' || cls === 'Support') {
    body.add(mk(new THREE.CylinderGeometry(.75, 1.35, 2.6, 12), prim, 0, 1.9, 0)); // áo choàng dài
  }
  body.add(mk(new THREE.CylinderGeometry(.82 * wide, .62 * wide, 2.1, 10), prim, 0, 3.25, 0));
  body.add(mk(new THREE.CylinderGeometry(.66 * wide, .66 * wide, .35, 10), sec, 0, 2.25, 0));
  const head = mk(new THREE.SphereGeometry(.68, 16, 12), skin, 0, 4.95, 0);
  body.add(head);
  // mũ / tóc theo lớp
  if (cls === 'Mage') { const hat = mk(new THREE.ConeGeometry(.85, 1.9, 10), prim, 0, 6.05, 0); hat.rotation.z = .12; body.add(hat); body.add(mk(new THREE.CylinderGeometry(1.15, 1.15, .1, 14), prim, 0, 5.2, 0)); }
  else if (cls === 'Tank') { body.add(mk(new THREE.SphereGeometry(.78, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, 5.05, 0)); }
  else if (cls === 'Assassin') { const hood = mk(new THREE.ConeGeometry(.82, 1.5, 10), sec, 0, 5.45, -.05); body.add(hood); }
  else if (cls === 'Marksman') { body.add(mk(new THREE.SphereGeometry(.72, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), sec, 0, 5.1, -.05)); body.add(mk(new THREE.CylinderGeometry(.12, .05, 1.4, 6), sec, 0, 4.7, -.7)); }
  else if (cls === 'Support') { body.add(mk(new THREE.TorusGeometry(.55, .08, 8, 20), glow, 0, 5.75, 0)); }
  else { body.add(mk(new THREE.SphereGeometry(.74, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), sec, 0, 5.05, 0)); }
  // vai
  if (cls === 'Tank' || cls === 'Fighter') for (const s of [-1, 1]) body.add(mk(new THREE.SphereGeometry(.55 * wide, 10, 8), metal, s * 1.05 * wide, 4.15, 0));
  // tay (khớp ở vai)
  const arm = (sx: number) => { const g = new THREE.Group(); g.position.set(sx * 1.02 * wide, 4.1, 0); g.add(mk(new THREE.CylinderGeometry(.24, .2, 1.9, 8), prim, 0, -.95, 0)); g.add(mk(new THREE.SphereGeometry(.26, 8, 6), skin, 0, -1.95, 0)); body.add(g); return g; };
  const armL = arm(-1), armR = arm(1);
  // vũ khí
  const hand = new THREE.Group(); hand.position.set(0, -2, 0); armR.add(hand);
  const tip = new THREE.Object3D();
  if (cls === 'Fighter') { const bl = mk(new THREE.BoxGeometry(.28, 3.6, .7), metal, 0, -1.7, .1); hand.add(bl, mk(new THREE.BoxGeometry(1.1, .22, .3), sec)); bl.add(tip); tip.position.y = -1.8; }
  else if (cls === 'Tank') { hand.add(mk(new THREE.CylinderGeometry(.18, .18, 1.6, 8), sec, 0, -.6, 0), mk(new THREE.BoxGeometry(.8, .8, .8), metal, 0, -1.5, 0)); const sh = mk(new THREE.CylinderGeometry(1.25, 1.25, .25, 16), metal, 0, -1.9, .55); sh.rotation.x = Math.PI / 2; armL.add(sh); hand.add(tip); tip.position.y = -1.6; }
  else if (cls === 'Assassin') { for (const a of [armL, armR]) { const h = a === armR ? hand : (() => { const x = new THREE.Group(); x.position.set(0, -2, 0); armL.add(x); return x; })(); h.add(mk(new THREE.ConeGeometry(.16, 1.7, 6), metal, 0, -.85, .1)); } hand.add(tip); tip.position.y = -1.6; }
  else if (cls === 'Marksman') { const bow = mk(new THREE.TorusGeometry(1.25, .09, 6, 18, Math.PI * 1.15), sec); bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + .3); bow.position.set(0, -.2, .3); hand.add(bow); hand.add(tip); tip.position.set(0, -.2, 1); }
  else { const st = mk(new THREE.CylinderGeometry(.1, .12, 4.2, 6), sec, 0, -.6, 0); const orb = mk(new THREE.SphereGeometry(.42, 14, 10), glow, 0, 1.6, 0); hand.add(st, orb); orb.add(tip); }
  // vòng phe dưới chân
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.15, 36), new THREE.MeshBasicMaterial({ color: TEAM[side], transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .12; root.add(ring);
  root.scale.setScalar(1.22);
  return { root, body, legL, legR, armL, armR, head, mats: [prim, sec, skin, metal, glow], prim, sec, weaponTip: tip };
}

// ---------------- lính ----------------
interface Minion { side: Side; lane: string; u: number; hp: number; kind: 'melee' | 'caster' | 'cannon'; m: any; cd: number; phase: number; dead: number }

// ---------------- hiệu ứng (theo thời gian thực) ----------------
interface Fx { m: any; t: number; life: number; upd: (f: Fx, k: number) => void; done?: () => void }

export interface ArenaInit { tl: Timeline; picks: Record<Side, Record<string, string>>; names: Record<string, string>; champUrl: (id: string) => string; towerIds: Record<string, number[]> }
export interface Arena { render(gt: number, rdt: number, speed: number): void; view(): { x: number; y: number; w: number; h: number }; dispose(): void }

export function createArena(container: HTMLElement, init: ArenaInit): Arena {
  const { tl, picks, names, champUrl, towerIds } = init;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1310);
  scene.fog = new THREE.Fog(0x0a1310, 150, 300);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 1, 800);

  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1e2b1c, .8));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 400 });
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x6fd6ff, .3); rim.position.set(120, 60, -120); scene.add(rim);

  // ----- địa hình -----
  const groundTex = (() => {
    const N = 2048, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d')!; const s = N / 100;
    const grad = g.createRadialGradient(N / 2, N / 2, N * .1, N / 2, N / 2, N * .8);
    grad.addColorStop(0, '#3a6a3f'); grad.addColorStop(1, '#22432c');
    g.fillStyle = grad; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${30 + Math.random() * 50},${70 + Math.random() * 60},${30 + Math.random() * 30},${Math.random() * .22})`; g.beginPath(); g.arc(Math.random() * N, Math.random() * N, Math.random() * 7 + 1, 0, 7); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(52,118,150,.95)'; g.lineWidth = 9 * s; g.beginPath(); g.moveTo(4 * s, 8 * s); g.bezierCurveTo(30 * s, 30 * s, 70 * s, 70 * s, 96 * s, 92 * s); g.stroke();
    g.strokeStyle = 'rgba(140,210,235,.25)'; g.lineWidth = 4 * s; g.stroke();
    for (const pts of Object.values(LANES)) {
      g.strokeStyle = 'rgba(158,138,100,.95)'; g.lineWidth = 6.5 * s; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.stroke();
      g.strokeStyle = 'rgba(200,182,140,.4)'; g.lineWidth = 3 * s; g.stroke();
    }
    for (const [x, y, col] of [[9, 91, '#25406f'], [91, 9, '#6a2735']] as [number, number, string][]) {
      g.fillStyle = col; g.beginPath(); g.arc(x * s, y * s, 14 * s, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = .7 * s; g.beginPath(); g.arc(x * s, y * s, 10 * s, 0, 7); g.stroke();
    }
    for (const [x, y] of [PIT.dragon, PIT.baron]) { g.fillStyle = 'rgba(48,66,58,.95)'; g.beginPath(); g.arc(x * s, y * s, 5.5 * s, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = s; g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.encoding = THREE.sRGBEncoding; return t;
  })();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: groundTex, roughness: .95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x142318, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -.25; scene.add(outer);
  // vách đá bao quanh + rừng
  const rockM = new THREE.MeshStandardMaterial({ color: 0x48524a, roughness: .95, flatShading: true });
  for (let i = 0; i < 110; i++) {
    const side = i % 4, tt = Math.random() * 230 - 115;
    const x = side === 0 ? -116 : side === 1 ? 116 : tt, z = side === 2 ? -116 : side === 3 ? 116 : tt;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + Math.random() * 8, 0), rockM);
    r.position.set(x + (Math.random() - .5) * 8, Math.random() * 3, z + (Math.random() - .5) * 8); r.rotation.set(Math.random() * 3, Math.random() * 3, 0); r.castShadow = true; scene.add(r);
  }
  const segs = Object.values(LANES).flatMap((pts) => pts.slice(1).map((b, i) => [pts[i], b] as [P2, P2]));
  const onRiver = (p: P2) => { for (let i = 0; i <= 24; i++) { const t = i / 24; const bx = (1 - t) ** 3 * 4 + 3 * (1 - t) ** 2 * t * 30 + 3 * (1 - t) * t * t * 70 + t ** 3 * 96; const by = (1 - t) ** 3 * 8 + 3 * (1 - t) ** 2 * t * 30 + 3 * (1 - t) * t * t * 70 + t ** 3 * 92; if (Math.hypot(p[0] - bx, p[1] - by) < 7) return true; } return false; };
  const ok = (p: P2) => segs.every(([a, b]) => distSeg(p, a, b) > 6) && !onRiver(p) && Math.hypot(p[0] - 9, p[1] - 91) > 17 && Math.hypot(p[0] - 91, p[1] - 9) > 17 && Math.hypot(p[0] - PIT.dragon[0], p[1] - PIT.dragon[1]) > 9 && Math.hypot(p[0] - PIT.baron[0], p[1] - PIT.baron[1]) > 9;
  const spots: P2[] = [];
  for (let i = 0; i < 4000 && spots.length < 520; i++) { const p: P2 = [3 + Math.random() * 94, 3 + Math.random() * 94]; if (ok(p)) spots.push(p); }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .75, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 0), new THREE.MeshStandardMaterial({ color: 0x2a5a33, roughness: .9, flatShading: true }), spots.length);
  crown.castShadow = true; trunk.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  spots.forEach((p, i) => {
    const w = W(p); const k = .6 + Math.random() * .5;
    sc.set(k, k, k); pv.set(w.x, 1.5 * k, w.z); m4.compose(pv, q, sc); trunk.setMatrixAt(i, m4);
    sc.set(k, k * 1.1, k); pv.set(w.x, 3.9 * k, w.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6); m4.compose(pv, q, sc); crown.setMatrixAt(i, m4);
    crown.setColorAt(i, new THREE.Color().setHSL(.3 + Math.random() * .08, .45, .2 + Math.random() * .1));
  });
  scene.add(trunk, crown);
  // bụi cỏ ven đường
  const bushM = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: .9, flatShading: true });
  for (const p of [[20, 22], [22, 80], [78, 20], [80, 78], [44, 44], [56, 56], [30, 70], [70, 30], [60, 38], [40, 62]] as P2[]) {
    for (let i = 0; i < 6; i++) { const w = W([p[0] + (Math.random() - .5) * 5, p[1] + (Math.random() - .5) * 5]); const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + Math.random(), 0), bushM); b.position.set(w.x, .8, w.z); b.scale.y = .7; b.castShadow = true; scene.add(b); }
  }

  // ----- nhà chính, trụ, nhà lính -----
  const nexus: Record<Side, { crys: any; light: any; alive: boolean }> = {} as never;
  for (const sd of ['B', 'R'] as Side[]) {
    const b = W(BASE[sd]);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 1.6, 40), new THREE.MeshStandardMaterial({ color: 0x3b4458, roughness: .5, metalness: .3 }));
    plat.position.set(b.x, .8, b.z); plat.receiveShadow = true; scene.add(plat);
    const nx = W(sd === 'B' ? [15, 85] : [85, 15]);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 3, 8), new THREE.MeshStandardMaterial({ color: 0x8d94a5, roughness: .4, metalness: .6 }));
    ped.position.set(nx.x, 1.5, nx.z); ped.castShadow = true; scene.add(ped);
    const crys = new THREE.Mesh(new THREE.OctahedronGeometry(4.5, 0), new THREE.MeshStandardMaterial({ color: TEAM_L[sd], emissive: TEAM[sd], emissiveIntensity: 1.1, roughness: .15, metalness: .4 }));
    crys.position.set(nx.x, 8, nx.z); crys.castShadow = true; scene.add(crys);
    const light = new THREE.PointLight(TEAM[sd], 1.6, 50); light.position.set(nx.x, 12, nx.z); scene.add(light);
    nexus[sd] = { crys, light, alive: true };
  }
  interface Tw { id: string; side: Side; p: P2; g: any; top: any; lane: string | null; u: number; cd: number; state: boolean }
  const towers: Record<string, Tw> = {};
  const towerM = new THREE.MeshStandardMaterial({ color: 0x9aa1ae, roughness: .5, metalness: .5 });
  for (const [id, p0] of Object.entries(towerIds)) {
    const sd = id[0] as Side, p = p0 as P2;
    const w = W(p);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 1.4, 8), towerM); base.position.y = .7;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, 8, 8), towerM); col.position.y = 5;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2, 8), new THREE.MeshStandardMaterial({ color: 0x5a6070, metalness: .6, roughness: .4 })); cap.position.y = 9.6;
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: TEAM_L[sd], emissive: TEAM[sd], emissiveIntensity: 1.5 }));
    top.position.y = 11.6;
    [base, col, cap].forEach((m) => { m.castShadow = true; });
    g.add(base, col, cap, top); g.position.set(w.x, 0, w.z); scene.add(g);
    const lane = id.split('-')[1];
    const L = LANES[lane];
    towers[id] = { id, side: sd, p, g, top, lane: L ? lane : null, u: L ? polyProject(L, p) : 0, cd: 0, state: true };
  }
  const inhibs: Record<string, { g: any; state: boolean }> = {};
  for (const sd of ['B', 'R'] as Side[]) for (const lane of ['top', 'mid', 'bot']) {
    const pt = BLUE_TOWERS[lane as 'top'][2];
    const p2: P2 = [pt[0] + (BASE.B[0] - pt[0]) * .35, pt[1] + (BASE.B[1] - pt[1]) * .35];
    const w = W(sd === 'B' ? p2 : MIR(p2));
    const g = new THREE.Mesh(new THREE.TorusGeometry(2, .5, 8, 20), new THREE.MeshStandardMaterial({ color: TEAM_L[sd], emissive: TEAM[sd], emissiveIntensity: 1 }));
    g.rotation.x = Math.PI / 2; g.position.set(w.x, 2.2, w.z); scene.add(g);
    inhibs[`${sd}-inhib-${lane}`] = { g, state: true };
  }
  // trạng thái công trình theo thời gian: liệt kê lần bị phá / hồi sinh
  const structEv = tl.evs.filter((e) => ['tower', 'firsttower', 'towerBack', 'inhib', 'inhibBack'].includes(e.type));
  const structAlive = (id: string, gt: number) => { let a = true; for (const e of structEv) { if (e.d > gt) break; if (e.id === id) a = e.type === 'towerBack' || e.type === 'inhibBack'; } return a; };

  // ----- quái lớn: khoảng thời gian xuất hiện tính từ sự kiện -----
  const mkMonster = (p: P2, color: number, size: number, wings: boolean) => {
    const w = W(p);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .3, roughness: .4, metalness: .2 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 16), mat); body.scale.set(1.4, .9, 1); body.position.y = size; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(size * .55, 14, 10), mat); head.position.set(size * 1.3, size * 1.4, 0);
    g.add(body, head);
    if (wings) for (const s of [-1, 1]) { const wg = new THREE.Mesh(new THREE.ConeGeometry(size * .9, size * 2.4, 3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .2, transparent: true, opacity: .8, side: THREE.DoubleSide })); wg.rotation.x = s * Math.PI / 2.3; wg.position.set(0, size * 1.6, s * size * 1.3); g.add(wg); }
    g.position.set(w.x, 0, w.z); g.visible = false; scene.add(g);
    return { g, body };
  };
  const dragonM = mkMonster(PIT.dragon, 0xff8a3d, 3, true);
  const elderM = mkMonster(PIT.dragon, 0xbfe7ff, 3.6, true);
  const baronM = mkMonster(PIT.baron, 0x9a5cff, 4.6, false);
  const heraldM = mkMonster(PIT.baron, 0x8f6cff, 2.8, false);
  const grubs = Array.from({ length: 3 }, (_, i) => mkMonster([PIT.baron[0] - 3 + i * 3, PIT.baron[1] + 2] as P2, 0xb27cff, 1.2, false));
  const ivs = (kind: string[], first: number, respawn: number, until = Infinity) => {
    const out: [number, number][] = [];
    let start = first;
    for (const e of tl.evs) if (kind.includes(e.type) && e.d >= start - 1) { out.push([start, e.d]); start = e.d + respawn; }
    if (start < until) out.push([start, Math.min(until, tl.end + 999)]);
    return out;
  };
  const soulEv = tl.evs.find((e) => e.type === 'soul');
  const dragonIv = ivs(['dragon', 'soul'], 300, 300).filter(([a]) => !soulEv || a < soulEv.d);
  const elderIv = soulEv ? ivs(['elder'], soulEv.d + 360, 360) : [];
  const baronIv = ivs(['baron'], 1200, 360);
  const heraldIv = ivs(['herald'], 900, 1e9, 1185);
  const grubIv = ivs(['grubs'], 480, 1e9, 885);
  const inIv = (iv: [number, number][], gt: number) => iv.find(([a, b]) => gt >= a && gt < b);

  // ----- bãi quái rừng (mỗi bên 5 bãi + 2 cua sông): hồi sinh theo mốc thật -----
  interface Camp { p: P2; g: any; hp: number; next: number; respawn: number; buff: boolean }
  const CAMP_B: [P2, boolean][] = [[[30, 55], true], [[55, 78], true], [[18, 38], false], [[22, 62], false], [[44, 70], false]];
  const camps: Camp[] = [];
  const campMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, flatShading: true });
  const mkCamp = (p: P2, buff: boolean, color: number, first: number, respawn: number) => {
    const w = W(p); const g = new THREE.Group();
    if (buff) { const b = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), campMat(color)); b.position.y = 2.2; b.castShadow = true; g.add(b); const gl = new THREE.Mesh(new THREE.SphereGeometry(.9, 10, 8), new THREE.MeshBasicMaterial({ color })); gl.position.y = 4.8; g.add(gl); }
    else for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + (i === 0 ? .4 : 0), 0), campMat(color)); b.position.set((i - 1) * 2, 1.1, (i % 2) * 1.6); b.castShadow = true; g.add(b); }
    g.position.set(w.x, 0, w.z); g.visible = false; scene.add(g);
    camps.push({ p, g, hp: 0, next: first, respawn, buff });
  };
  for (const sd of ['B', 'R'] as Side[]) CAMP_B.forEach(([p, buff], i) => mkCamp(sd === 'B' ? p : MIR(p), buff, buff ? (i === 0 ? 0x4aa8ff : 0xff5a3a) : [0x8a7a5a, 0x9ad06a, 0x7a6a9a][i % 3], 90, buff ? 300 : 135));
  mkCamp([36, 42], false, 0x5ac8c0, 210, 150); mkCamp([64, 58], false, 0x5ac8c0, 210, 150);

  // ----- tướng -----
  interface U { k: string; side: Side; model: Model; kind: { cls: Cls; ranged: boolean }; label: HTMLElement; hpEl: HTMLElement; lvEl: HTMLElement; x: number; z: number; face: number; walk: number; atk: number; cast: number; cd: number; skillCd: number; dead: boolean; deathT: number; recallFx: Fx | null; target: { x: number; z: number } | null }
  const units: U[] = [];
  for (const k of unitKeys()) {
    const sd = k[0] as Side, role = k.slice(1);
    const champ = picks[sd][role];
    const kind = champKind(champ);
    const model = buildChamp(kind.cls, sd);
    scene.add(model.root);
    sampleColors(champUrl(champ), (a, b) => { model.prim.color.setHex(a).convertSRGBToLinear(); model.sec.color.setHex(b).convertSRGBToLinear(); });
    const label = document.createElement('div');
    label.className = `u3 u3-${sd}`;
    label.innerHTML = `<div class="u3-row"><span class="u3-lv">1</span><div class="u3-bars"><b></b><span class="u3-hp"><i></i></span></div></div>`;
    label.querySelector('b')!.textContent = names[k] || '';
    container.appendChild(label);
    units.push({ k, side: sd, model, kind, label, hpEl: label.querySelector('.u3-hp i') as HTMLElement, lvEl: label.querySelector('.u3-lv') as HTMLElement, x: 0, z: 0, face: sd === 'B' ? -Math.PI * .75 : Math.PI * .25, walk: Math.random() * 6, atk: 0, cast: 0, cd: Math.random(), skillCd: 3 + Math.random() * 4, dead: false, deathT: 0, recallFx: null, target: null });
  }

  // ----- hiệu ứng -----
  const fxs: Fx[] = [];
  const floats: { el: HTMLElement; x: number; z: number; t: number }[] = [];
  const add = (f: Fx) => { scene.add(f.m); fxs.push(f); };
  const basic = (color: number, opacity = .9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const sphereG = new THREE.SphereGeometry(1, 12, 10);
  const ringG = new THREE.RingGeometry(.8, 1, 40);
  const cylG = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  const projectile = (from: any, to: { x: number; z: number }, color: number, size = .45, life = .28, onHit?: () => void) => {
    const m = new THREE.Mesh(sphereG, basic(color)); m.scale.setScalar(size); m.position.copy(from);
    const sx = from.x, sy = from.y, sz = from.z;
    add({ m, t: 0, life, upd: (f, k) => { f.m.position.set(sx + (to.x - sx) * k, sy + (3 - sy) * k + Math.sin(k * Math.PI) * 1.2, sz + (to.z - sz) * k); }, done: () => { onHit?.(); spark(to, color, 1.2); } });
  };
  const spark = (p: { x: number; z: number }, color: number, size = 2, y = 3) => {
    const m = new THREE.Mesh(sphereG, basic(color, .85)); m.position.set(p.x, y, p.z);
    add({ m, t: 0, life: .35, upd: (f, k) => { f.m.scale.setScalar(.2 + k * size); f.m.material.opacity = .85 * (1 - k); } });
  };
  const ringFx = (p: { x: number; z: number }, color: number, size: number, life = .6) => {
    const m = new THREE.Mesh(ringG, basic(color, .9)); m.rotation.x = -Math.PI / 2; m.position.set(p.x, .25, p.z);
    add({ m, t: 0, life, upd: (f, k) => { f.m.scale.setScalar(.5 + k * size); f.m.material.opacity = .9 * (1 - k); } });
  };
  const slash = (p: { x: number; z: number }, face: number, color: number) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(2.4, .18, 6, 20, Math.PI * .9), basic(color, .95));
    m.position.set(p.x, 2.6, p.z); m.rotation.set(-Math.PI / 2, 0, -face + Math.PI * .05);
    add({ m, t: 0, life: .22, upd: (f, k) => { f.m.rotation.z = -face - .9 + k * 1.8; f.m.material.opacity = .95 * (1 - k); }, done: () => m.geometry.dispose() });
  };
  const beam = (a: { x: number; z: number }, ay: number, b: { x: number; z: number }, color: number, life = .2, w = .35) => {
    const m = new THREE.Mesh(cylG, basic(color, .95));
    const dx = b.x - a.x, dz = b.z - a.z, dy = 2.5 - ay, L = Math.hypot(dx, dy, dz);
    m.position.set((a.x + b.x) / 2, (ay + 2.5) / 2, (a.z + b.z) / 2);
    m.scale.set(w, L, w);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    add({ m, t: 0, life, upd: (f, k) => { f.m.material.opacity = .95 * (1 - k); } });
  };
  const pillar = (p: { x: number; z: number }, color: number, life = .9, h = 22) => {
    const m = new THREE.Mesh(cylG, basic(color, .6)); m.position.set(p.x, h / 2, p.z); m.scale.set(2.2, h, 2.2);
    add({ m, t: 0, life, upd: (f, k) => { f.m.scale.x = f.m.scale.z = 2.2 * (1 - k * .7); f.m.material.opacity = .6 * (1 - k); } });
  };
  const floatText = (u: { x: number; z: number }, txt: string) => {
    const el = document.createElement('div'); el.className = 'f3'; el.textContent = txt; container.appendChild(el);
    floats.push({ el, x: u.x, z: u.z, t: 0 });
  };
  const boom = (p: { x: number; z: number }, color: number, size: number) => { spark(p, color, size, 4); ringFx(p, color, size * 1.2, .8); };

  // ----- lính -----
  const minions: Minion[] = [];
  const mGeo = { melee: new THREE.BoxGeometry(1.1, 1.5, 1.1), caster: new THREE.ConeGeometry(.75, 1.9, 8), cannon: new THREE.BoxGeometry(1.8, 1.4, 2.4) };
  const mMat = { B: new THREE.MeshStandardMaterial({ color: 0x5a8ff0, roughness: .5, metalness: .2 }), R: new THREE.MeshStandardMaterial({ color: 0xe0606a, roughness: .5, metalness: .2 }) };
  const laneLen: Record<string, number> = Object.fromEntries(Object.entries(LANES).map(([k, v]) => [k, polyLen(v)]));
  let nextWave = 65, waveN = 0;
  const spawnWave = (gtw: number) => {
    waveN++;
    const cannon = gtw >= 1500 || (gtw >= 900 ? waveN % 2 === 0 : waveN % 3 === 0);
    for (const sd of ['B', 'R'] as Side[]) for (const lane of Object.keys(LANES)) {
      const list: Minion['kind'][] = ['melee', 'melee', 'melee', ...(cannon ? ['cannon' as const] : []), 'caster', 'caster', 'caster'];
      list.forEach((kind, i) => {
        const m = new THREE.Mesh(mGeo[kind], mMat[sd]); m.castShadow = true; scene.add(m);
        const u0 = 14 + 0 - i * 1.4;
        minions.push({ side: sd, lane, u: sd === 'B' ? u0 : laneLen[lane] - u0, hp: kind === 'cannon' ? 2.2 : kind === 'melee' ? 1.1 : .7, kind, m, cd: Math.random(), phase: Math.random() * 6, dead: 0 });
      });
    }
  };
  const minionPos = (mn: Minion, i: number): P2 => { const p = polyAt(LANES[mn.lane], Math.max(0, Math.min(laneLen[mn.lane], mn.u))); const off = ((i % 3) - 1) * 1.1; return [p[0] + off * .7, p[1] + off * .7]; };
  const stepMinions = (dt: number, gtNow: number, rdt: number) => {
    for (let i = minions.length - 1; i >= 0; i--) {
      const mn = minions[i];
      if (mn.dead) { mn.dead += rdt; mn.m.scale.y = Math.max(.01, 1 - mn.dead * 3); if (mn.dead > .35) { scene.remove(mn.m); minions.splice(i, 1); } continue; }
      const dir = mn.side === 'B' ? 1 : -1;
      const range = mn.kind === 'caster' ? 4.5 : mn.kind === 'cannon' ? 5.5 : 1.6;
      // địch phía trước gần nhất trên cùng đường
      let foe: Minion | null = null, fd = 1e9;
      for (const o of minions) if (!o.dead && o.lane === mn.lane && o.side !== mn.side) { const d = (o.u - mn.u) * dir; if (d > -0.5 && d < fd) { fd = d; foe = o; } }
      let blockTw: Tw | null = null;
      for (const tw of Object.values(towers)) if (tw.lane === mn.lane && tw.side !== mn.side && tw.state) { const d = (tw.u - mn.u) * dir; if (d > 0 && d < (blockTw ? (blockTw.u - mn.u) * dir : 1e9)) blockTw = tw; }
      const twD = blockTw ? (blockTw.u - mn.u) * dir : 1e9;
      const end = mn.side === 'B' ? laneLen[mn.lane] - 12 : 12;
      if (foe && fd <= range) {
        mn.cd -= dt;
        if (mn.cd <= 0) { mn.cd = 1.2; foe.hp -= mn.kind === 'cannon' ? .28 : mn.kind === 'melee' ? .16 : .2; if (rdt < .2 && mn.kind !== 'melee') projectile(mn.m.position, W(minionPos(foe, 0)), mn.side === 'B' ? 0x9cc8ff : 0xffb0a8, .22, .25); if (foe.hp <= 0) foe.dead = .001; }
      } else if (twD <= range + 4) {
        mn.cd -= dt; if (mn.cd <= 0) { mn.cd = 1.4; }
      } else if ((mn.u - end) * dir < 0) {
        mn.u += dir * MSPD * dt;
      } else { mn.hp -= dt * .06; if (mn.hp <= 0) mn.dead = .001; }
      const p = W(minionPos(mn, i));
      mn.m.position.set(p.x, (mn.kind === 'caster' ? .95 : .75) + Math.abs(Math.sin(gtNow * 6 + mn.phase)) * .15, p.z);
      mn.m.rotation.y = mn.lane === 'mid' ? (dir > 0 ? Math.PI * .75 : -Math.PI * .25) : 0;
    }
  };

  // ----- camera đạo diễn -----
  const cam = { x: 0, z: 40, h: 78, tx: 0, tz: 40, th: 78, userUntil: 0, hold: 0, rot: 0, rotAt: 0 };
  let drag: { x: number; y: number } | null = null;
  const el = renderer.domElement as HTMLCanvasElement;
  const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; cam.userUntil = performance.now() + 6000; };
  const onMove = (e: PointerEvent) => { if (!drag) return; const k = cam.h / 600; cam.x -= (e.clientX - drag.x) * k; cam.z -= (e.clientY - drag.y) * k; cam.tx = cam.x; cam.tz = cam.z; drag = { x: e.clientX, y: e.clientY }; cam.userUntil = performance.now() + 6000; };
  const onUp = () => { drag = null; };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.th = Math.max(35, Math.min(160, cam.th * (e.deltaY > 0 ? 1.1 : .9))); cam.userUntil = performance.now() + 6000; };
  el.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); el.addEventListener('wheel', onWheel, { passive: false });
  const evPos = (e: DispEv): P2 | null => {
    if (e.at) return e.at as P2;
    if (['dragon', 'soul', 'elder'].includes(e.type)) return PIT.dragon;
    if (['baron', 'herald', 'grubs'].includes(e.type)) return PIT.baron;
    if (e.id && towers[e.id as string]) return towers[e.id as string].p;
    return null;
  };
  const director = (gt: number, speed: number) => {
    const now = performance.now();
    if (now < cam.userUntil) return;
    const look = 7 + speed * .6;
    const up = tl.evs.find((e) => e.d >= gt - 2.5 && e.d <= gt + look && e.type !== 'note' && evPos(e));
    if (up) { const p = W(evPos(up)!); cam.tx = p.x; cam.tz = p.z + 4; cam.th = ['kill', 'firstblood', 'teamfight'].includes(up.type) ? 62 : 72; cam.hold = now + 1500; return; }
    if (now < cam.hold) return;
    // cụm tướng đông nhất
    const live = units.filter((u) => !u.dead);
    let best: U[] = [];
    for (const a of live) { const grp = live.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 26); if (grp.length > best.length) best = grp; }
    if (best.length >= 4 && new Set(best.map((u) => u.side)).size === 2) {
      cam.tx = best.reduce((s, u) => s + u.x, 0) / best.length; cam.tz = best.reduce((s, u) => s + u.z, 0) / best.length + 4; cam.th = 66; return;
    }
    // luân phiên các đường
    if (now - cam.rotAt > 9000) { cam.rot = (cam.rot + 1) % 5; cam.rotAt = now; }
    const order = ['BTop', 'BJungle', 'BMid', 'BBot', 'RJungle'];
    const u = units.find((x) => x.k === order[cam.rot] && !x.dead) || live[0];
    if (u) { cam.tx = u.x; cam.tz = u.z + 4; cam.th = 76; }
  };

  // ----- vòng vẽ -----
  const ro = new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); });
  ro.observe(container);
  const tmpV = new THREE.Vector3();
  let lastGt = -1;
  let slow = 0, lowQ = false;
  let evCursor = 0;

  const render = (gt: number, rdt: number, speed: number) => {
    const dt = lastGt < 0 ? 0 : Math.max(0, Math.min(gt - lastGt, 3));
    // máy yếu: tắt bóng đổ, giảm độ phân giải
    if (!lowQ && rdt > 0) { slow = rdt > 1 / 24 ? slow + rdt : Math.max(0, slow - rdt * .5); if (slow > 2.5) { lowQ = true; renderer.shadowMap.enabled = false; scene.traverse((o: any) => { if (o.material) o.material.needsUpdate = true; }); renderer.setPixelRatio(1); } }
    lastGt = gt;
    // sự kiện vừa xảy ra: hiệu ứng nổ, vụ hạ gục
    while (evCursor < tl.evs.length && tl.evs[evCursor].d <= gt) {
      const e = tl.evs[evCursor++];
      if (gt - e.d > 4) continue; // tua nhanh: bỏ qua hiệu ứng cũ
      const p = evPos(e);
      const col = e.side === 'B' ? TEAM_L.B : TEAM_L.R;
      if ((e.type === 'kill' || e.type === 'firstblood') && e.killer) {
        const os = e.side === 'B' ? 'R' : 'B';
        const kU = units.find((x) => x.k === e.side + e.killer), vU = units.find((x) => x.k === os + e.victim);
        if (kU && vU && !kU.dead) { kU.atk = 1; kU.cast = 1; beam({ x: kU.x, z: kU.z }, 4, { x: vU.x, z: vU.z }, e.side === 'B' ? 0x9cd0ff : 0xff9c9c, .35, .6); floatText(kU, e.type === 'firstblood' ? '+400' : '+300'); }
      }
      if (e.type === 'teamfight') for (const x of units) if (!x.dead && x.side === e.side) { x.cast = 1; ringFx({ x: x.x, z: x.z }, TEAM_L[x.side], 10, .9); pillar({ x: x.x, z: x.z }, TEAM_L[x.side], .7, 14); }
      if (!p) continue;
      const w = W(p);
      if (['dragon', 'soul', 'elder', 'baron', 'herald', 'grubs'].includes(e.type)) { boom(w, col, 9); pillar(w, col, 1.4, 30); }
      else if (e.type === 'tower' || e.type === 'firsttower' || e.type === 'inhib') boom(w, 0xffd39a, 8);
      else if (e.type === 'nexus') { boom(w, 0xffffff, 26); }
      else if (e.type === 'teamfight') ringFx(w, col, 14, 1);
    }
    // lính
    while (gt >= nextWave) { if (gt - nextWave < 40) spawnWave(nextWave); nextWave += 30; }
    let left = dt;
    while (left > 0) { const s = Math.min(left, .25); stepMinions(s, gt, rdt); left -= s; }
    if (dt === 0) stepMinions(0, gt, rdt);

    // công trình
    for (const tw of Object.values(towers)) {
      const alive = structAlive(tw.id, gt);
      if (alive !== tw.state) { tw.state = alive; tw.g.visible = true; }
      tw.g.scale.y += ((alive ? 1 : .22) - tw.g.scale.y) * Math.min(1, rdt * 3);
      tw.top.visible = alive;
      tw.top.rotation.y += rdt;
      if (!alive) continue;
      tw.cd -= dt;
      if (tw.cd <= 0) {
        const tp = W(tw.p);
        let tgt: { x: number; z: number } | null = null, best = 15, tm: Minion | null = null;
        for (const mn of minions) if (!mn.dead && mn.side !== tw.side) { const mp = mn.m.position; const d = Math.hypot(mp.x - tp.x, mp.z - tp.z); if (d < best) { best = d; tgt = mp; tm = mn; } }
        if (tm) { tm.hp -= .45; if (tm.hp <= 0) tm.dead = .001; }
        if (!tgt) for (const u of units) if (!u.dead && u.side !== tw.side) { const d = Math.hypot(u.x - tp.x, u.z - tp.z); if (d < best) { best = d; tgt = { x: u.x, z: u.z }; } }
        if (tgt) { beam(tp, 11.6, tgt, tw.side === 'B' ? 0x9cd0ff : 0xff9c9c, .25, .3); tw.cd = Math.max(1, .25 * speed); }
        else tw.cd = .5;
      }
    }
    for (const [id, ih] of Object.entries(inhibs)) { const a = structAlive(id, gt); ih.g.visible = a; ih.g.rotation.z += rdt * .8; }
    const nexusEv = tl.evs.find((e) => e.type === 'nexus');
    for (const sd of ['B', 'R'] as Side[]) {
      const n = nexus[sd];
      const down = !!nexusEv && nexusEv.d <= gt && nexusEv.side !== sd;
      n.crys.rotation.y += rdt * .6;
      n.crys.position.y = 8 + Math.sin(performance.now() / 700) * .5;
      n.crys.visible = !down; n.light.intensity = down ? 0 : 1.6;
    }
    // quái
    const bob = Math.sin(performance.now() / 450) * .4;
    dragonM.g.visible = !!inIv(dragonIv, gt); elderM.g.visible = !!inIv(elderIv, gt); baronM.g.visible = !!inIv(baronIv, gt);
    heraldM.g.visible = !!inIv(heraldIv, gt) && !baronM.g.visible; grubs.forEach((gq) => { gq.g.visible = !!inIv(grubIv, gt); });
    for (const mo of [dragonM, elderM, baronM, heraldM, ...grubs]) { mo.body.position.y = mo.body.geometry.parameters.radius + bob; mo.g.rotation.y += rdt * .2; }

    // bãi quái rừng
    for (const c of camps) {
      if (c.hp <= 0 && gt >= c.next) { c.hp = 1; c.g.visible = true; c.g.scale.setScalar(1); }
      if (c.hp > 0) c.g.rotation.y += rdt * .3;
    }
    // tướng
    for (const u of units) {
      const s = tl.unit(u.k, gt);
      const w = W([s.x, s.y]);
      const m = u.model;
      if (!s.alive) {
        if (!u.dead) { u.dead = true; u.deathT = 0; spark({ x: u.x, z: u.z }, 0x9aa4b6, 3); }
        u.deathT += rdt;
        const k = Math.min(1, u.deathT / .6);
        m.body.rotation.x = -k * Math.PI / 2;
        m.root.position.y = -Math.max(0, u.deathT - 1.4) * 2;
        m.root.visible = u.deathT < 3;
        u.label.style.display = 'none';
        continue;
      }
      if (u.dead) { u.dead = false; m.body.rotation.x = 0; m.root.position.y = 0; m.root.visible = true; u.x = w.x; u.z = w.z; pillar(w, TEAM_L[u.side], 1); }
      const mv = Math.hypot(w.x - u.x, w.z - u.z);
      if (mv > 25) { pillar(w, TEAM_L[u.side], .8); } // dịch chuyển (về nhà / hồi sinh)
      u.x = w.x; u.z = w.z;
      // đối thủ gần nhất để giao tranh
      let foe: U | null = null, fd = 1e9;
      for (const v of units) if (!v.dead && v.side !== u.side) { const d = Math.hypot(v.x - u.x, v.z - u.z); if (d < fd) { fd = d; foe = v; } }
      const reach = u.kind.ranged ? 15 : 9;
      let target: { x: number; z: number } | null = null, tgtKind: 'champ' | 'minion' | 'tower' | 'mon' | null = null;
      let tgtMinion: Minion | null = null;
      if (foe && fd < reach + 4) { target = foe; tgtKind = 'champ'; }
      else {
        let md = reach - 2;
        for (const mn of minions) if (!mn.dead && mn.side !== u.side) { const p = mn.m.position; const d = Math.hypot(p.x - u.x, p.z - u.z); if (d < md) { md = d; tgtMinion = mn; } }
        if (tgtMinion) { target = { x: tgtMinion.m.position.x, z: tgtMinion.m.position.z }; tgtKind = 'minion'; }
        else {
          for (const c of camps) if (c.hp > 0) { const cw = W(c.p); if (Math.hypot(cw.x - u.x, cw.z - u.z) < 11) { target = cw; tgtKind = 'mon'; c.hp -= dt * (c.buff ? .22 : .32); if (c.hp <= 0) { c.g.visible = false; c.next = gt + c.respawn; spark(cw, 0xffe28a, 3); } } }
          if (!target) for (const [mo, iv] of [[dragonM, dragonIv], [elderM, elderIv], [baronM, baronIv], [heraldM, heraldIv]] as [ReturnType<typeof mkMonster>, [number, number][]][]) {
            if (!mo.g.visible) continue;
            const end = inIv(iv, gt)?.[1] ?? 0;
            const d = Math.hypot(mo.g.position.x - u.x, mo.g.position.z - u.z);
            if (d < 16 && end - gt < 14) { target = { x: mo.g.position.x, z: mo.g.position.z }; tgtKind = 'mon'; }
          }
          if (!target) for (const tw of Object.values(towers)) if (tw.state && tw.side !== u.side) { const tp = W(tw.p); if (Math.hypot(tp.x - u.x, tp.z - u.z) < reach) { target = tp; tgtKind = 'tower'; } }
        }
      }
      // hướng mặt
      const want = target ? Math.atan2(target.x - u.x, target.z - u.z) : s.moving ? Math.atan2(s.dx, s.dy) : u.face;
      let dA = want - u.face; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
      u.face += dA * Math.min(1, rdt * 10);
      m.root.rotation.y = u.face;
      m.root.position.set(u.x, 0, u.z);
      // đi bộ
      const walking = s.moving && !target && s.recall < 0;
      u.walk += rdt * (walking ? Math.min(speed, 4) * 7 : 0);
      const sw = walking ? Math.sin(u.walk) : 0;
      m.legL.rotation.x = sw * .7; m.legR.rotation.x = -sw * .7;
      m.armL.rotation.x = -sw * .5;
      m.body.position.y = walking ? Math.abs(Math.cos(u.walk)) * .18 : 0;
      // đánh thường & tung chiêu (thời gian thật, giới hạn để còn nhìn rõ)
      u.cd -= dt; u.skillCd -= dt;
      u.atk = Math.max(0, u.atk - rdt * 4); u.cast = Math.max(0, u.cast - rdt * 2.5);
      if (target && s.recall < 0) {
        const interval = Math.max(u.kind.ranged ? 1.05 : .95, .22 * speed);
        if (u.cd <= 0) {
          u.cd = interval * (.85 + Math.random() * .3); u.atk = 1;
          const col = u.side === 'B' ? 0xbfe0ff : 0xffc8c0;
          if (u.kind.ranged) { m.weaponTip.getWorldPosition(tmpV); projectile(tmpV.clone(), target, u.kind.cls === 'Mage' ? 0xc79bff : u.kind.cls === 'Marksman' ? 0xffe28a : 0x8fffd0, .38, .22, () => { if (tgtMinion) { tgtMinion.hp -= .55; if (tgtMinion.hp <= 0) tgtMinion.dead = .001; } }); }
          else { slash({ x: u.x + Math.sin(u.face) * 2, z: u.z + Math.cos(u.face) * 2 }, u.face, col); if (tgtMinion) { tgtMinion.hp -= .6; if (tgtMinion.hp <= 0) tgtMinion.dead = .001; } }
        }
        if (tgtKind === 'champ' && u.skillCd <= 0) {
          u.skillCd = Math.max(4 + Math.random() * 4, 1.2 * speed); u.cast = 1;
          const tp = target, me = { x: u.x, z: u.z }, c = u.kind.cls;
          if (c === 'Mage') { projectile(new THREE.Vector3(u.x, 5, u.z), tp, 0xb07bff, .9, .4, () => boom(tp, 0xb07bff, 5)); }
          else if (c === 'Marksman') { beam(me, 3, tp, 0xffd27a, .3, .5); spark(tp, 0xffd27a, 2.5); }
          else if (c === 'Tank') { ringFx(me, 0xffe0a0, 9, .7); spark(me, 0xffe0a0, 3, 1); }
          else if (c === 'Assassin') { spark(tp, 0xff5a7a, 3); ringFx(tp, 0xff5a7a, 4, .4); }
          else if (c === 'Support') { ringFx(me, 0x7dffcf, 7, .9); pillar(me, 0x7dffcf, .6, 8); }
          else { ringFx(me, 0xff9a5a, 7, .5); slash(me, u.face + Math.PI, 0xff9a5a); }
        }
      }
      m.armR.rotation.x = u.kind.ranged ? -1.4 * Math.max(u.atk, u.cast) - (target ? .4 : sw * .5) : -2.2 * Math.sin(u.atk * Math.PI) - (target ? .3 : -sw * .5);
      m.armL.rotation.x += -1.6 * u.cast;
      // về nhà
      if (s.recall >= 0) {
        if (!u.recallFx) {
          const rm = new THREE.Mesh(ringG, basic(0x7fc6ff, .8)); rm.rotation.x = -Math.PI / 2; rm.position.set(u.x, .3, u.z);
          const fx: Fx = { m: rm, t: 0, life: 1e9, upd: (f) => { const k = (tl.unit(u.k, lastGt).recall); f.m.scale.setScalar(2 + Math.max(0, k) * 2); f.m.material.opacity = .4 + .4 * Math.abs(Math.sin(performance.now() / 200)); } };
          add(fx); u.recallFx = fx;
        }
        m.armL.rotation.x = -.4; m.armR.rotation.x = -.4;
      } else if (u.recallFx) { u.recallFx.life = 0; u.recallFx = null; }
      // nhãn trên đầu
      u.label.style.display = '';
      u.hpEl.style.width = `${Math.round(Math.max(0, s.hp) * 100)}%`;
      const fr = tl.g.frames?.[tl.frameIdx(gt)]?.[u.k];
      if (fr) u.lvEl.textContent = String(fr[4]);
    }

    // hiệu ứng
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i]; f.t += rdt;
      const k = Math.min(1, f.t / f.life);
      f.upd(f, k);
      if (f.t >= f.life) { scene.remove(f.m); f.done?.(); if (f.m.material.dispose) f.m.material.dispose(); fxs.splice(i, 1); }
    }

    // camera
    director(gt, speed);
    const kk = Math.min(1, rdt * 2.2);
    cam.x += (cam.tx - cam.x) * kk; cam.z += (cam.tz - cam.z) * kk; cam.h += (cam.th - cam.h) * Math.min(1, rdt * 1.5);
    camera.position.set(cam.x, cam.h, cam.z + cam.h * .62);
    camera.lookAt(cam.x, 0, cam.z);
    sun.position.set(cam.x - 60, 140, cam.z + 50); sun.target.position.set(cam.x, 0, cam.z);
    renderer.render(scene, camera);

    // nhãn: chiếu toạ độ 3D lên màn hình
    const w2 = container.clientWidth, h2 = container.clientHeight;
    for (const u of units) {
      if (u.dead) continue;
      tmpV.set(u.x, 9.4, u.z).project(camera);
      const off = tmpV.z > 1 || Math.abs(tmpV.x) > 1.2 || Math.abs(tmpV.y) > 1.2;
      u.label.style.display = off ? 'none' : '';
      u.label.style.transform = `translate(${(tmpV.x * .5 + .5) * w2}px, ${(-tmpV.y * .5 + .5) * h2}px) translate(-50%, -100%)`;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += rdt;
      tmpV.set(f.x, 11 + f.t * 4, f.z).project(camera);
      f.el.style.transform = `translate(${(tmpV.x * .5 + .5) * w2}px, ${(-tmpV.y * .5 + .5) * h2}px) translate(-50%, -100%)`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.6));
      if (f.t > 1.6) { f.el.remove(); floats.splice(i, 1); }
    }
  };

  return {
    render,
    view: () => ({ x: cam.x / 2 + 50, y: cam.z / 2 + 50, w: cam.h * .66, h: cam.h * .44 }),
    dispose() {
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); el.removeEventListener('wheel', onWheel);
      renderer.dispose(); container.querySelectorAll('.u3, .f3').forEach((x) => x.remove()); el.remove();
    },
  };
}
