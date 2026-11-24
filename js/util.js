export const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
// 15 chỉ số chia 4 nhóm. Chỉ số không cộng thẳng sát thương mà quyết định cách AI chơi trong trận
// (trúng chiêu, né, chọn thời điểm giao tranh, đọc bản đồ...). "aggression" là phong cách, không tính OVR.
export const ATTR_GROUPS = {
  tech: ['farm', 'accuracy', 'dodge', 'positioning'],
  mind: ['awareness', 'judgment', 'aggression', 'patience', 'creativity'],
  mental: ['focus', 'composure', 'stamina'],
  team: ['teamwork', 'leadership', 'adaptability'],
};
export const ATTRS = Object.values(ATTR_GROUPS).flat();
const W_BASE = { farm: 1, accuracy: 1, dodge: 1, positioning: 1, awareness: 1, judgment: 1.1, aggression: 0, patience: 0.5, creativity: 0.5, focus: 0.8, composure: 0.7, stamina: 0.4, teamwork: 0.8, leadership: 0.4, adaptability: 0.4 };
const W_ROLE = {
  Top: { farm: 0.4, dodge: 0.3, composure: 0.2 },
  Jungle: { awareness: 0.6, judgment: 0.5, farm: -0.5, leadership: 0.2 },
  Mid: { accuracy: 0.5, creativity: 0.3, dodge: 0.2 },
  Bot: { farm: 0.5, positioning: 0.6, accuracy: 0.2, awareness: -0.2 },
  Support: { farm: -0.9, awareness: 0.6, teamwork: 0.5, leadership: 0.5, positioning: 0.2, accuracy: -0.2 },
};
export const ATTR_W = Object.fromEntries(Object.keys(W_ROLE).map((r) => {
  const w = Object.fromEntries(ATTRS.map((a) => [a, Math.max(0, W_BASE[a] + (W_ROLE[r][a] || 0))]));
  const tot = Object.values(w).reduce((x, y) => x + y, 0);
  return [r, Object.fromEntries(ATTRS.map((a) => [a, w[a] / tot]))];
}));

export const rand = Math.random;
export const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const logistic = (x) => 1 / (1 + Math.exp(-x));
export function gauss() {
  let u = 0, v = 0;
  while (!u) u = rand();
  while (!v) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function weighted(items, weights) {
  const tot = weights.reduce((s, w) => s + Math.max(w, 0), 0);
  let r = rand() * tot;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(weights[i], 0);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
export function hue(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
export function computeOvr(p) {
  const w = ATTR_W[p.role] || ATTR_W.Mid;
  return Math.round(ATTRS.reduce((s, k) => s + (p.stats[k] ?? 60) * w[k], 0));
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Tiền tệ: đơn vị nghìn USD
export function money(k) {
  const neg = k < 0;
  k = Math.abs(k);
  const s = k >= 1000 ? `$${(k / 1000).toFixed(k >= 10000 ? 1 : 2)}M` : `$${Math.round(k)}K`;
  return neg ? '-' + s : s;
}
export const uid = () => Math.random().toString(36).slice(2, 10);
