// Dữ liệu tĩnh (giải, đội, tuyển thủ, tướng, trang bị, ảnh) — nạp một lần lúc khởi động.
import type { Db, PackGroup } from './types';
import type { Opgg } from './runes';

export const DB = {} as Db;

declare global {
  // trang deploy có thể bật gói ảnh nhị phân và đổi đuôi file gói
  // eslint-disable-next-line no-var
  var RIFT_PACK: boolean | undefined;
  // eslint-disable-next-line no-var
  var RIFT_PACK_EXT: string | undefined;
}

type RawData = Pick<Db, 'leagues' | 'teams' | 'players' | 'champions' | 'items' | 'meta'> & { images?: Db['images'] | null; opgg?: Opgg | null };

/** điền DB từ dữ liệu thô (dùng chung cho trình duyệt, test và Web Worker) */
let RAW: RawData | null = null;
/** dữ liệu thô đã nạp (gửi cho Web Worker) */
export const rawData = (): RawData | null => RAW;
export function initDb(raw: RawData): Db {
  RAW = { leagues: raw.leagues, teams: raw.teams, players: raw.players, champions: raw.champions, items: raw.items, meta: raw.meta, images: raw.images ?? null, opgg: raw.opgg ?? null };
  Object.assign(DB, raw);
  (DB as unknown as { opgg: Opgg | null }).opgg = raw.opgg ?? null;
  DB.images = raw.images ?? { leagues: {}, teams: {}, players: {}, dark: [] };
  DB.darkLogos = new Set(DB.images.dark || []);
  DB.pack ??= null;
  DB.champList = Object.values(DB.champions).sort((a, b) => a.name.localeCompare(b.name));
  DB.leagueById = Object.fromEntries(DB.leagues.map((l) => [l.id, l]));
  return DB;
}

// Gói ảnh nhị phân (bản deploy giới hạn số file): nhóm cần ngay thì chờ, nhóm lớn tải nền.
const BOOT_GROUPS = ['league', 'team', 'champion', 'item', 'rune', 'tile', 'player', 'map'];
const LATER_GROUPS = ['loading', 'splash'];
let onAssets: (() => void) | null = null;
export function setOnAssets(fn: () => void): void { onAssets = fn; }

async function loadGroup(index: Record<string, PackGroup>, g: string, progress?: (n: number) => void): Promise<void> {
  const info = index[g];
  if (!info) return;
  const bufs = await Promise.all(Array.from({ length: info.chunks }, async (_, i) => {
    const r = await fetch(`data/bin/${g}-${i}.${globalThis.RIFT_PACK_EXT || 'bin'}`);
    if (!r.ok) throw new Error(`${g}-${i}`);
    const b = await r.arrayBuffer();
    progress?.(b.byteLength);
    return b;
  }));
  for (const [path, [ci, off, len, type]] of Object.entries(info.files)) {
    DB.pack![path] = URL.createObjectURL(new Blob([bufs[ci].slice(off, off + len)], { type }));
  }
}

export async function loadData(onProgress?: (p: number) => void): Promise<void> {
  const files = ['leagues', 'teams', 'players', 'champions', 'items', 'meta'] as const;
  const raw: Partial<RawData> = {};
  await Promise.all(files.map(async (f) => {
    const r = await fetch(`data/${f}.json`);
    if (!r.ok) throw new Error(`data/${f}.json`);
    (raw as Record<string, unknown>)[f] = await r.json();
  }));
  // ảnh (logo/mini face) là tuỳ chọn: thiếu file vẫn chơi được
  try {
    const r = await fetch('data/images.json');
    raw.images = r.ok ? await r.json() : null;
  } catch { raw.images = null; }
  // meta xếp hạng OP.GG: bản chụp kèm game (+ bản mới hơn đã lưu từ lần mở trước)
  try {
    const r = await fetch('data/opgg.json');
    raw.opgg = r.ok ? await r.json() : null;
    const c = cachedOpgg();
    if (raw.opgg && c) mergeRanked(raw.opgg, c.ranked, c.patch, c.at);
  } catch { raw.opgg = null; }
  DB.pack = null;
  initDb(raw as RawData);
  if (globalThis.RIFT_PACK) {
    DB.pack = {};
    try {
      const index: Record<string, PackGroup> = await (await fetch('data/bin/index.json')).json();
      const total = BOOT_GROUPS.reduce((s, g) => s + (index[g]?.bytes || 0), 0);
      let done = 0;
      await Promise.all(BOOT_GROUPS.map((g) => loadGroup(index, g, (n) => { done += n; onProgress?.(done / total); }).catch(() => {})));
      DB.assetsLater = Promise.all(LATER_GROUPS.map((g) => loadGroup(index, g).catch(() => {}))).then(() => onAssets?.());
    } catch { /* không có gói: dùng file lẻ */ }
  }
}

// Ảnh tải sẵn vào public/assets (scripts/fetch-*.mjs) để game chạy offline
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
// bản đóng gói: ảnh chưa tải xong thì trả ảnh trống (tránh gọi file không tồn tại)
export const src = (path: string): string => (DB.pack ? DB.pack[path] || BLANK : path);
export const champImg = (id: string): string => src(`assets/champion/${id}.png`);
export const champTile = (id: string): string => src(`assets/tile/${id}.webp`);
export const champArt = (id: string): string => src(`assets/loading/${id}.webp`);
export const champSplash = (id: string): string => src(`assets/splash/${id}.webp`);
export const itemImg = (id: string): string => src(`assets/item/${id}.png`);
export const runeImg = (id: number): string => src(`assets/rune/${id}.png`);
export const mapImg = (): string => src('assets/map/map11.png');
export const teamLogo = (id: string): string | null => DB.images.teams[id] || null;
export const leagueLogo = (id: string): string | null => DB.images.leagues[id] || null;
export const playerFace = (id: string): string | null => DB.images.players[id] || null;
export const isDarkLogo = (s: string): boolean => DB.darkLogos.has(s);

// ---------- cập nhật meta định kỳ từ OP.GG ----------
// Mỗi lần mở game (tối đa 6 giờ/lần) lấy bảng xếp hạng tướng mới nhất (1 yêu cầu) và cập nhật tier / tỉ lệ thắng / chọn / cấm.
// Bảng ngọc chi tiết lấy từ bản chụp (scripts/fetch-opgg.mjs, chạy định kỳ bằng GitHub Actions).
const OPGG_URL = 'https://lol-api-champion.op.gg/api/KR/champions/ranked?tier=emerald_plus';
const OPGG_KEY = 'lolm_opgg';
const POS: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jungle', MID: 'Mid', ADC: 'Bot', SUPPORT: 'Support' };
type RankedRow = [string, string, number, number, number, number, number, number]; // champ, role, tier, rank, wr, pr, br, play
let rev = 0;
/** tăng khi dữ liệu nền đổi (để Web Worker nạp lại) */
export const dataRev = (): number => rev;
function cachedOpgg(): { at: number; patch: string; ranked: RankedRow[] } | null {
  try { return JSON.parse(localStorage.getItem(OPGG_KEY) || 'null'); } catch { return null; }
}
function mergeRanked(o: Opgg, rows: RankedRow[], patch: string, at: number): void {
  for (const [id, role, tier, rank, wr, pr, br, play] of rows) {
    const pos = (o.champs[id] ??= {}) as Record<string, unknown>;
    const cur = pos[role] as Record<string, unknown> | undefined;
    pos[role] = { counters: [], runes: [], rr: 0, ...cur, tier, rank, wr, pr, br, play };
  }
  o.meta = { ...o.meta, patch, fetched: new Date(at).toISOString(), live: true };
}
export async function refreshOpgg(force = false): Promise<boolean> {
  const o = (DB as unknown as { opgg?: Opgg | null }).opgg;
  if (!o) return false;
  const c = cachedOpgg();
  if (!force && c && Date.now() - c.at < 6 * 3600e3) return false;
  try {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(OPGG_URL, { signal: ctl.signal });
    clearTimeout(tm);
    if (!r.ok) return false;
    const j = await r.json();
    const byKey: Record<number, string> = Object.fromEntries(Object.entries(o.keys || {}).map(([id, k]) => [k, id]));
    const rows: RankedRow[] = [];
    for (const ch of j.data || []) {
      const id = byKey[ch.id];
      if (!id) continue;
      for (const p of ch.positions || []) {
        const role = POS[p.name], s = p.stats;
        if (!role || !s || ((s.role_rate ?? 0) < 0.08 && (s.play ?? 0) < 1500)) continue;
        rows.push([id, role, s.tier_data?.tier ?? 5, s.tier_data?.rank ?? 99, +(+s.win_rate).toFixed(4), +(+s.pick_rate).toFixed(4), +(+(s.ban_rate ?? 0)).toFixed(4), s.play]);
      }
    }
    if (rows.length < 100) return false;
    const at = Date.now(), patch = String(j.meta?.version || o.meta.patch);
    mergeRanked(o, rows, patch, at);
    try { localStorage.setItem(OPGG_KEY, JSON.stringify({ at, patch, ranked: rows })); } catch { /* đầy bộ nhớ */ }
    rev++;
    return true;
  } catch { return false; }
}
