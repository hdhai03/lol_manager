// Dữ liệu tĩnh (giải, đội, tuyển thủ, tướng, trang bị, ảnh) — nạp một lần lúc khởi động.
import type { Db, PackGroup } from './types';

export const DB = {} as Db;

declare global {
  // trang deploy có thể bật gói ảnh nhị phân và đổi đuôi file gói
  // eslint-disable-next-line no-var
  var RIFT_PACK: boolean | undefined;
  // eslint-disable-next-line no-var
  var RIFT_PACK_EXT: string | undefined;
}

type RawData = Pick<Db, 'leagues' | 'teams' | 'players' | 'champions' | 'items' | 'meta'> & { images?: Db['images'] | null };

/** điền DB từ dữ liệu thô (dùng chung cho trình duyệt, test và Web Worker) */
export function initDb(raw: RawData): Db {
  Object.assign(DB, raw);
  DB.images = raw.images ?? { leagues: {}, teams: {}, players: {}, dark: [] };
  DB.darkLogos = new Set(DB.images.dark || []);
  DB.pack ??= null;
  DB.champList = Object.values(DB.champions).sort((a, b) => a.name.localeCompare(b.name));
  DB.leagueById = Object.fromEntries(DB.leagues.map((l) => [l.id, l]));
  return DB;
}

// Gói ảnh nhị phân (bản deploy giới hạn số file): nhóm cần ngay thì chờ, nhóm lớn tải nền.
const BOOT_GROUPS = ['league', 'team', 'champion', 'item', 'tile', 'player', 'map'];
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
export const mapImg = (): string => src('assets/map/map11.png');
export const teamLogo = (id: string): string | null => DB.images.teams[id] || null;
export const leagueLogo = (id: string): string | null => DB.images.leagues[id] || null;
export const playerFace = (id: string): string | null => DB.images.players[id] || null;
export const isDarkLogo = (s: string): boolean => DB.darkLogos.has(s);
