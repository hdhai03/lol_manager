// Hệ chỉ số chi tiết: suy ra từ dữ liệu thật (Leaguepedia), đặc điểm, thể lực, chiến thuật
import { DB } from './data.js';
import { ROLES, ATTRS, ATTR_GROUPS, clamp, computeOvr } from './util.js';

// nhiễu cố định theo tuyển thủ + chỉ số (cùng dữ liệu luôn ra cùng chỉ số)
function h(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
  return ((x >>> 0) % 2001) / 1000 - 1; // -1..1
}

// điểm chuẩn (z) của số liệu thật trong cùng vị trí
let Z = null;
function zTables() {
  if (Z) return Z;
  Z = {};
  for (const r of ROLES) {
    const ps = Object.values(DB.players).filter((p) => p.role === r && p.record && p.games >= 5);
    Z[r] = {};
    for (const k of ['cspm', 'kda', 'dpm', 'vspm', 'wr', 'gpm']) {
      const v = ps.map((p) => +p.record[k] || 0);
      const m = v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1);
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(v.length, 1)) || 1;
      Z[r][k] = { m, sd };
    }
  }
  return Z;
}
const z = (p, k) => {
  if (!p.record) return 0;
  const t = zTables()[p.role]?.[k];
  return t ? clamp(((+p.record[k] || 0) - t.m) / t.sd, -2.5, 2.5) : 0;
};

// Chuyển 6 chỉ số cũ (+ số liệu thi đấu thật) thành 15 chỉ số chi tiết, giữ nguyên OVR
export function deriveAttrs(p) {
  const old = p.stats || {};
  if (old.accuracy != null) return old; // đã là hệ mới
  const B = p.ovr || 65;
  const dev = (k) => (old[k] ?? B) - B;
  const n = (a, amp = 3) => h(`${p.id || p.link || p.ign}:${a}`) * amp;
  const games = p.games ?? p.realGames ?? 0;
  const exp = clamp(Math.log(games + 1) - 4, -2, 2);
  const breadth = (p.pool || []).filter((x) => x.g >= 3).length;
  const age = p.age || 21;
  const s = {};
  s.farm = B + 0.7 * dev('laning') + 3.5 * z(p, 'cspm') + n('farm');
  s.accuracy = B + 0.7 * dev('mechanics') + 3 * z(p, 'dpm') + n('acc');
  s.dodge = B + 0.5 * dev('mechanics') + 0.4 * dev('consistency') + 2.5 * z(p, 'kda') + n('dodge');
  s.positioning = B + 0.6 * dev('teamfight') + 3 * z(p, 'kda') + n('pos');
  s.awareness = B + 0.8 * dev('vision') + 3 * z(p, 'vspm') + n('aw');
  s.judgment = B + 0.8 * dev('macro') + 3 * z(p, 'wr') + n('jd');
  s.aggression = 62 + (B - 70) * 0.25 + 8 * (z(p, 'dpm') - 0.6 * z(p, 'kda')) + n('ag', 10) + (p.role === 'Jungle' || p.role === 'Mid' ? 3 : 0);
  s.patience = B + 0.5 * dev('consistency') + 2.5 * z(p, 'kda') - 0.25 * (s.aggression - 62) + n('pa');
  s.creativity = B + 0.5 * dev('mechanics') + 2 * z(p, 'dpm') + n('cr', 5);
  s.focus = B + 0.9 * dev('consistency') + 2 * z(p, 'kda') + n('fo');
  s.composure = B + 0.6 * dev('consistency') + 2 * z(p, 'wr') + exp * 2 + n('co');
  s.stamina = B + (age <= 22 ? 3 : age >= 27 ? -(age - 26) * 1.5 : 0) + n('st', 4);
  s.teamwork = B + 0.7 * dev('teamfight') + 2 * z(p, 'wr') + n('tw');
  s.leadership = B - 3 + (age - 22) * 0.8 + exp * 1.5 + (p.role === 'Support' || p.role === 'Jungle' ? 3 : 0) + n('ld', 4);
  s.adaptability = B + (breadth - 5) * 1.2 + n('ad', 4);
  for (const a of ATTRS) s[a] = clamp(Math.round(s[a]), 30, 99);
  // dịch đều để OVR mới khớp OVR cũ
  const tmp = { role: p.role, stats: s };
  const shift = B - computeOvr(tmp);
  for (const a of ATTRS) if (a !== 'aggression') s[a] = clamp(s[a] + shift, 30, 99);
  return s;
}

// Đặc điểm (tự suy từ chỉ số — không lưu riêng)
export const TRAITS = {
  laneKing: (s) => s.farm >= 86 && s.accuracy >= 82,
  clutch: (s) => s.composure >= 86,
  shotcaller: (s) => s.leadership >= 84,
  visionary: (s) => s.awareness >= 86,
  outplayer: (s) => s.creativity >= 86,
  ironman: (s) => s.stamina >= 86,
  flex: (s) => s.adaptability >= 85,
  hothead: (s) => s.aggression >= 82 && s.patience < 66,
  calm: (s) => s.patience >= 84 && s.focus >= 80,
  tilter: (s) => s.composure < 58,
  glass: (s) => s.positioning < 58,
};
export const traitsOf = (p) => Object.keys(TRAITS).filter((k) => TRAITS[k](p.stats || {})).slice(0, 4);
export const BAD_TRAITS = new Set(['hothead', 'tilter', 'glass']);

// điểm nhóm (hiển thị)
export const groupScore = (p, g) => Math.round(ATTR_GROUPS[g].filter((a) => a !== 'aggression').reduce((s, a) => s + p.stats[a], 0) / ATTR_GROUPS[g].filter((a) => a !== 'aggression').length);

// Chiến thuật
export const TACTIC_OPTS = {
  tempo: ['early', 'balanced', 'late'],
  obj: ['dragon', 'balanced', 'top'],
  style: ['teamfight', 'pick', 'split'],
  focus: ['auto', 'carry', 'weakest'],
  jungle: ['auto', 'top', 'mid', 'bot', 'farm'],
};
export const PERSONAL_OPTS = ['safe', 'standard', 'aggressive'];
export const defaultTactics = () => ({ tempo: 'balanced', obj: 'balanced', style: 'teamfight', focus: 'auto', jungle: 'auto', personal: Object.fromEntries(ROLES.map((r) => [r, 'standard'])) });

// AI chọn chiến thuật theo đội hình đã chọn
export function aiTactics(picks, line) {
  const cs = ROLES.map((r) => DB.champions[picks[r]]).filter(Boolean);
  const early = cs.filter((c) => c.tags.includes('Assassin') || c.tags[0] === 'Fighter').length;
  const late = cs.filter((c) => c.tags[0] === 'Marksman' || (c.tags[0] === 'Mage' && c.info.attack < 4)).length;
  const tc = defaultTactics();
  tc.tempo = early >= late + 2 ? 'early' : late >= early + 2 ? 'late' : 'balanced';
  const top = line.Top?.stats, bot = line.Bot?.stats;
  if (top && cs[0] && cs[0].tags.includes('Fighter') && top.farm >= 80 && Math.random() < 0.35) tc.style = 'split';
  else if (cs.filter((c) => c.tags.includes('Assassin')).length >= 2) tc.style = 'pick';
  tc.focus = Math.random() < 0.4 ? 'carry' : 'auto';
  if (bot && line.Support && (bot.accuracy + line.Support.stats.awareness) / 2 >= 80) tc.obj = 'dragon';
  else if (top && top.farm >= 82) tc.obj = 'top';
  for (const r of ROLES) {
    const s = line[r]?.stats;
    tc.personal[r] = !s ? 'standard' : s.aggression >= 80 ? 'aggressive' : s.patience >= 82 ? 'safe' : 'standard';
  }
  return tc;
}

// Thể lực sau một ván (stamina tốt mất ít hơn)
export function drainCondition(p, minutes) {
  p.cond = clamp((p.cond ?? 100) - (2.5 + minutes / 12) * (1.45 - (p.stats.stamina || 60) / 110), 25, 100);
}

// Chuyển save cũ / dữ liệu cũ sang hệ chỉ số mới
export function migratePlayer(p) {
  if (!p.stats || p.stats.accuracy == null) {
    const src = DB.players[p.id];
    const base = { ...p, link: p.id, games: p.realGames, ovr: p.ovr, stats: p.stats };
    if (src) base.record = src.record;
    p.stats = deriveAttrs(base);
    const before = p.ovr;
    p.ovr = computeOvr(p);
    p.potential = Math.max(p.potential + (p.ovr - before), p.ovr);
  }
  p.cond ??= 100;
  p.morale ??= 70;
}
