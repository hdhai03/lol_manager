export const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
export const ATTRS = ['laning', 'mechanics', 'teamfight', 'macro', 'vision', 'consistency'];
export const ATTR_W = { laning: 0.2, mechanics: 0.2, teamfight: 0.2, macro: 0.2, vision: 0.08, consistency: 0.12 };

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
  return Math.round(ATTRS.reduce((s, k) => s + p.stats[k] * ATTR_W[k], 0));
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
