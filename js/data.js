export const DB = {};

export async function loadData() {
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
  DB.champList = Object.values(DB.champions).sort((a, b) => a.name.localeCompare(b.name));
  DB.leagueById = Object.fromEntries(DB.leagues.map((l) => [l.id, l]));
}

// Ảnh tải sẵn vào assets/ (scripts/fetch-data.mjs) để game chạy offline
export const champImg = (id) => `assets/champion/${id}.png`;
export const itemImg = (id) => `assets/item/${id}.png`;
export const teamLogo = (id) => DB.images.teams[id] || null;
export const leagueLogo = (id) => DB.images.leagues[id] || null;
export const playerFace = (id) => DB.images.players[id] || null;
export const isDarkLogo = (src) => DB.darkLogos.has(src);
