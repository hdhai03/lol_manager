import type { Attr, AttrGroup, Role, Stats } from './types';

export const ROLES: Role[] = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
// 15 chỉ số chia 4 nhóm. Chỉ số không cộng thẳng sát thương mà quyết định cách AI chơi trong trận
// (trúng chiêu, né, chọn thời điểm giao tranh, đọc bản đồ...). "aggression" là phong cách, không tính OVR.
export const ATTR_GROUPS: Record<AttrGroup, Attr[]> = {
  tech: ['farm', 'accuracy', 'dodge', 'positioning'],
  mind: ['awareness', 'judgment', 'aggression', 'patience', 'creativity'],
  mental: ['focus', 'composure', 'stamina'],
  team: ['teamwork', 'leadership', 'adaptability'],
};
export const ATTRS: Attr[] = Object.values(ATTR_GROUPS).flat();
const W_BASE: Record<Attr, number> = { farm: 1, accuracy: 1, dodge: 1, positioning: 1, awareness: 1, judgment: 1.1, aggression: 0, patience: 0.5, creativity: 0.5, focus: 0.8, composure: 0.7, stamina: 0.4, teamwork: 0.8, leadership: 0.4, adaptability: 0.4 };
const W_ROLE: Record<Role, Partial<Record<Attr, number>>> = {
  Top: { farm: 0.4, dodge: 0.3, composure: 0.2 },
  Jungle: { awareness: 0.6, judgment: 0.5, farm: -0.5, leadership: 0.2 },
  Mid: { accuracy: 0.5, creativity: 0.3, dodge: 0.2 },
  Bot: { farm: 0.5, positioning: 0.6, accuracy: 0.2, awareness: -0.2 },
  Support: { farm: -0.9, awareness: 0.6, teamwork: 0.5, leadership: 0.5, positioning: 0.2, accuracy: -0.2 },
};
export const ATTR_W = Object.fromEntries((Object.keys(W_ROLE) as Role[]).map((r) => {
  const w = Object.fromEntries(ATTRS.map((a) => [a, Math.max(0, W_BASE[a] + (W_ROLE[r][a] || 0))])) as Record<Attr, number>;
  const tot = Object.values(w).reduce((x, y) => x + y, 0);
  return [r, Object.fromEntries(ATTRS.map((a) => [a, w[a] / tot])) as Record<Attr, number>];
})) as Record<Role, Record<Attr, number>>;

// bộ sinh số ngẫu nhiên: mặc định Math.random; trong một ván có seed thì dùng mulberry32 để mô phỏng lại y hệt
let gen: () => number = Math.random;
export const rand = (): number => gen();
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function withSeed<T>(seed: number, fn: () => T): T {
  const prev = gen;
  gen = mulberry32(seed);
  try { return fn(); } finally { gen = prev; }
}
export const randInt = (a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
export const logistic = (x: number): number => 1 / (1 + Math.exp(-x));
export function gauss(): number {
  let u = 0, v = 0;
  while (!u) u = rand();
  while (!v) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function weighted<T>(items: readonly T[], weights: readonly number[]): T {
  const tot = weights.reduce((s, w) => s + Math.max(w, 0), 0);
  let r = rand() * tot;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(weights[i], 0);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
export function hue(str: string): number {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
export function computeOvr(p: { role: Role; stats: Partial<Stats> }): number {
  const w = ATTR_W[p.role] || ATTR_W.Mid;
  return Math.round(ATTRS.reduce((s, k) => s + (p.stats[k] ?? 60) * w[k], 0));
}
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}
// Tiền tệ: đơn vị nghìn USD
export function money(k: number): string {
  const neg = k < 0;
  k = Math.abs(k);
  const s = k >= 1000 ? `$${(k / 1000).toFixed(k >= 10000 ? 1 : 2)}M` : `$${Math.round(k)}K`;
  return neg ? '-' + s : s;
}
export const uid = () => Math.random().toString(36).slice(2, 10);
