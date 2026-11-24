export const DB = {};

export async function loadData() {
  const files = ['leagues', 'teams', 'players', 'champions', 'items', 'meta'];
  await Promise.all(files.map(async (f) => {
    const r = await fetch(`data/${f}.json`);
    if (!r.ok) throw new Error(`data/${f}.json`);
    DB[f] = await r.json();
  }));
  DB.champList = Object.values(DB.champions).sort((a, b) => a.name.localeCompare(b.name));
  DB.leagueById = Object.fromEntries(DB.leagues.map((l) => [l.id, l]));
}

export const champImg = (id) => `https://ddragon.leagueoflegends.com/cdn/${DB.meta.ddragon}/img/champion/${id}.png`;
export const itemImg = (id) => `https://ddragon.leagueoflegends.com/cdn/${DB.meta.ddragon}/img/item/${id}.png`;
