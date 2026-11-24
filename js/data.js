export const DB = {};

// Gói ảnh nhị phân (bản deploy giới hạn số file): nhóm cần ngay thì chờ, nhóm lớn tải nền.
const BOOT_GROUPS = ['league', 'team', 'champion', 'item', 'tile', 'player', 'map'];
const LATER_GROUPS = ['loading', 'splash'];
let onAssets = null;
export function setOnAssets(fn) { onAssets = fn; }

async function loadGroup(index, g, progress) {
  const info = index[g];
  if (!info) return;
  const bufs = await Promise.all(Array.from({ length: info.chunks }, async (_, i) => {
    // một số nơi host chỉ phục vụ đuôi file quen thuộc: cho phép đổi đuôi qua window.RIFT_PACK_EXT
    const r = await fetch(`data/bin/${g}-${i}.${globalThis.RIFT_PACK_EXT || 'bin'}`);
    if (!r.ok) throw new Error(`${g}-${i}`);
    const b = await r.arrayBuffer();
    progress && progress(b.byteLength);
    return b;
  }));
  for (const [path, [ci, off, len, type]] of Object.entries(info.files)) {
    DB.pack[path] = URL.createObjectURL(new Blob([bufs[ci].slice(off, off + len)], { type }));
  }
}

export async function loadData(onProgress) {
  const files = ['leagues', 'teams', 'players', 'champions', 'items', 'meta'];
  await Promise.all(files.map(async (f) => {
    const r = await fetch(`data/${f}.json`);
    if (!r.ok) throw new Error(`data/${f}.json`);
    DB[f] = await r.json();
  }));
  // ảnh (logo/mini face) là tuỳ chọn: thiếu file vẫn chơi được
  try {
    const r = await fetch('data/images.json');
    DB.images = r.ok ? await r.json() : null;
  } catch { DB.images = null; }
  DB.images ??= { leagues: {}, teams: {}, players: {}, dark: [] };
  DB.darkLogos = new Set(DB.images.dark || []);
  DB.pack = null;
  if (globalThis.RIFT_PACK) {
    DB.pack = {};
    try {
      const index = await (await fetch('data/bin/index.json')).json();
      const total = BOOT_GROUPS.reduce((s, g) => s + (index[g]?.bytes || 0), 0);
      let done = 0;
      await Promise.all(BOOT_GROUPS.map((g) => loadGroup(index, g, (n) => { done += n; onProgress && onProgress(done / total); }).catch(() => {})));
      DB.assetsLater = Promise.all(LATER_GROUPS.map((g) => loadGroup(index, g).catch(() => {}))).then(() => onAssets && onAssets());
    } catch { /* không có gói: dùng file lẻ */ }
  }
  DB.champList = Object.values(DB.champions).sort((a, b) => a.name.localeCompare(b.name));
  DB.leagueById = Object.fromEntries(DB.leagues.map((l) => [l.id, l]));
}

// Ảnh tải sẵn vào assets/ (scripts/fetch-*.mjs) để game chạy offline
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
// bản đóng gói: ảnh chưa tải xong thì trả ảnh trống (tránh gọi file không tồn tại)
export const src = (path) => (DB.pack ? DB.pack[path] || BLANK : path);
export const champImg = (id) => src(`assets/champion/${id}.png`);
export const champTile = (id) => src(`assets/tile/${id}.webp`);
export const champArt = (id) => src(`assets/loading/${id}.webp`);
export const champSplash = (id) => src(`assets/splash/${id}.webp`);
export const itemImg = (id) => src(`assets/item/${id}.png`);
export const mapImg = () => src('assets/map/map11.png');
export const teamLogo = (id) => DB.images.teams[id] || null;
export const leagueLogo = (id) => DB.images.leagues[id] || null;
export const playerFace = (id) => DB.images.players[id] || null;
export const isDarkLogo = (s) => DB.darkLogos.has(s);
