// Tải dữ liệu thật cho game:
//  - Leaguepedia (lol.fandom.com, CC BY-SA 3.0): đội, tuyển thủ, thống kê thi đấu, pick/ban chuyên nghiệp
//  - Riot Data Dragon (API chính thức): tướng, trang bị (tiếng Việt + tiếng Anh)
// Chạy: node scripts/fetch-data.mjs   (dùng curl nên tương thích proxy)
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = new URL('../data/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curlJson(url, params) {
  const args = ['-s', '-m', '60', '-G', url];
  for (const [k, v] of Object.entries(params || {})) args.push('--data-urlencode', `${k}=${v}`);
  return JSON.parse(execFileSync('curl', args, { maxBuffer: 1 << 28 }).toString());
}

const CACHE = new URL('./.cache/', import.meta.url).pathname;
mkdirSync(CACHE, { recursive: true });
async function cargo(tables, fields, where, extra = {}) {
  const key = CACHE + createHash('md5').update(tables + fields + where).digest('hex') + '.json';
  if (!process.env.NO_CACHE && existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  const rows = await cargoFetch(tables, fields, where, extra);
  writeFileSync(key, JSON.stringify(rows));
  return rows;
}
async function cargoFetch(tables, fields, where, extra) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    let d, tries = 0;
    while (true) {
      try {
        d = curlJson('https://lol.fandom.com/api.php', {
          action: 'cargoquery', format: 'json', limit: 500, offset, tables, fields, where, ...extra,
        });
        if (d.error) throw new Error(JSON.stringify(d.error));
        break;
      } catch (e) {
        if (++tries > 6) throw e;
        console.warn('  retry', tries, String(e).slice(0, 120));
        await sleep(3000 * tries);
      }
    }
    const got = (d.cargoquery || []).map((x) => x.title);
    rows.push(...got);
    await sleep(1200);
    if (got.length < 500) break;
  }
  return rows;
}

// ---------- Cấu hình giải đấu ----------
const LEAGUES = [
  { id: 'LCK', name: 'LoL Champions Korea', region: 'Korea', strength: 1.0, roster: 'LCK/2026 Season/Rounds 3-4', like: 'LCK/2026%' },
  { id: 'LPL', name: 'Tencent LoL Pro League', region: 'China', strength: 0.97, roster: 'LPL/2026 Season/Split 3', like: 'LPL/2026%' },
  { id: 'LEC', name: 'LoL EMEA Championship', region: 'EMEA', strength: 0.86, roster: 'LEC/2026 Season/Summer Season', like: 'LEC/2026%' },
  { id: 'LCS', name: 'League of Legends Championship Series', region: 'North America', strength: 0.8, roster: 'LCS/2026 Season/Summer Season', like: 'LCS/2026%' },
  { id: 'LCP', name: 'League of Legends Championship Pacific', region: 'Asia Pacific', strength: 0.82, roster: 'LCP/2026 Season/Split 3', like: 'LCP/2026%' },
  { id: 'CBLOL', name: 'Circuit Brazilian League of Legends', region: 'Brazil', strength: 0.74, roster: 'CBLOL/2026 Season/Split 2', like: 'CBLOL/2026%' },
  { id: 'VCS', name: 'Vietnam Championship Series', region: 'Vietnam', strength: 0.76, roster: 'VCS/2026 Season/Summer Season', like: 'VCS/2026%' },
];
const INTL_LIKE = ['2026 Season World Championship%', '2026 Mid-Season Invitational%', '2026 First Stand%', 'Esports World Cup 2026%'];
const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
const esc = (s) => s.replace(/'/g, "\\'");

async function main() {
  // ---------- Data Dragon ----------
  const versions = curlJson('https://ddragon.leagueoflegends.com/api/versions.json');
  const ver = versions[0];
  console.log('Data Dragon', ver);
  const champEn = curlJson(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`).data;
  const champVi = curlJson(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/vi_VN/champion.json`).data;
  const itemEn = curlJson(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`).data;
  const itemVi = curlJson(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/vi_VN/item.json`).data;

  const champByName = {};
  for (const [id, c] of Object.entries(champEn)) champByName[c.name.toLowerCase()] = id;
  const champAlias = { 'nunu': 'Nunu', 'wukong': 'MonkeyKing', 'renata': 'Renata' };
  const champId = (n) => champByName[(n || '').toLowerCase()] || champAlias[(n || '').toLowerCase()] || null;

  const itemByName = {};
  for (const [id, it] of Object.entries(itemEn)) {
    if (+id < 100000 && it.maps && it.maps['11'] && it.gold && it.gold.purchasable && !(itemByName[it.name.toLowerCase()] < id)) itemByName[it.name.toLowerCase()] = id;
  }

  // ---------- Leaguepedia: đội & tuyển thủ ----------
  const teams = {};
  const players = {};
  for (const L of LEAGUES) {
    console.log('Roster', L.id);
    const rows = await cargo('TournamentPlayers', 'Team,Link,Role,N_PlayerInTeam,Flag', `OverviewPage='${esc(L.roster)}'`);
    for (const r of rows) {
      if (!ROLES.includes(r.Role) && r.Role !== 'Coach') continue;
      teams[r.Team] ??= { name: r.Team, display: r.Team.replace(/ \(.*\)$/, ''), league: L.id, players: [], coach: null };
      if (r.Role === 'Coach') { teams[r.Team].coach ??= r.Link.replace(/ \(.*\)$/, ''); continue; }
      if (players[r.Link]) continue;
      players[r.Link] = { link: r.Link, ign: r.Link.replace(/ \(.*\)$/, ''), role: r.Role, team: r.Team, league: L.id, country: r.Flag || '' };
      teams[r.Team].players.push(r.Link);
    }
  }
  // thông tin đội (tên viết tắt)
  const teamNames = Object.keys(teams);
  for (let i = 0; i < teamNames.length; i += 40) {
    const part = teamNames.slice(i, i + 40).map((n) => `'${esc(n)}'`).join(',');
    const rows = await cargo('Teams', 'Name,Short,Location', `Name IN (${part})`);
    for (const r of rows) if (teams[r.Name]) { teams[r.Name].short = r.Short || r.Name.slice(0, 3).toUpperCase(); teams[r.Name].location = r.Location; }
  }
  // thông tin cá nhân tuyển thủ
  const links = Object.keys(players);
  for (let i = 0; i < links.length; i += 40) {
    const part = links.slice(i, i + 40).map((n) => `'${esc(n)}'`).join(',');
    const rows = await cargo('Players', 'OverviewPage,ID,Name,NativeName,Country,Birthdate', `OverviewPage IN (${part})`);
    for (const r of rows) {
      const p = players[r.OverviewPage]; if (!p) continue;
      p.ign = r.ID || p.ign; p.name = r.Name || ''; p.native = r.NativeName || '';
      p.country = r.Country || p.country; p.birth = r.Birthdate || '';
    }
  }

  // ---------- Thống kê thi đấu 2026 ----------
  const likes = [...LEAGUES.map((l) => l.like), ...INTL_LIKE];
  const sp = [];
  for (const lk of likes) {
    console.log('Stats', lk);
    sp.push(...await cargo('ScoreboardPlayers', 'Link,Team,Champion,Role,Kills,Deaths,Assists,Gold,CS,DamageToChampions,VisionScore,PlayerWin,Items,GameId,OverviewPage',
      `OverviewPage LIKE '${esc(lk)}'`));
  }
  const games = [];
  for (const lk of likes) {
    games.push(...await cargo('ScoreboardGames', 'GameId,Team1,Team2,Winner,Patch,Team1Bans,Team2Bans,Team1Picks,Team2Picks,Gamelength_Number,OverviewPage',
      `OverviewPage LIKE '${esc(lk)}'`));
  }
  const gameLen = {};
  for (const g of games) gameLen[g.GameId] = parseFloat(g['Gamelength Number']) || 32;

  // gom theo tuyển thủ
  const agg = {};
  const champBuilds = {};
  for (const r of sp) {
    const len = gameLen[r.GameId] || 32;
    const a = (agg[r.Link] ??= { g: 0, w: 0, k: 0, d: 0, a: 0, gold: 0, cs: 0, dmg: 0, vs: 0, min: 0, intl: 0, champs: {} });
    a.g++; if (r.PlayerWin === 'Yes') a.w++;
    a.k += +r.Kills || 0; a.d += +r.Deaths || 0; a.a += +r.Assists || 0;
    a.gold += +r.Gold || 0; a.cs += +r.CS || 0; a.dmg += +r.DamageToChampions || 0; a.vs += +r.VisionScore || 0; a.min += len;
    if (!/^(LCK|LPL|LEC|LCS|LCP|CBLOL|VCS)\//.test(r.OverviewPage)) a.intl++;
    const cid = champId(r.Champion);
    if (cid) {
      const c = (a.champs[cid] ??= { g: 0, w: 0 }); c.g++; if (r.PlayerWin === 'Yes') c.w++;
      const b = (champBuilds[cid] ??= {});
      for (const it of (r.Items || '').split(';')) { const iid = itemByName[it.toLowerCase()]; if (iid && itemEn[iid].gold.total >= 2200) b[iid] = (b[iid] || 0) + 1; }
    }
  }

  // ---------- Tính chỉ số ----------
  const leagueStrength = Object.fromEntries(LEAGUES.map((l) => [l.id, l.strength]));
  const per = {};
  for (const p of Object.values(players)) {
    const a = agg[p.link];
    if (!a || a.g === 0) continue;
    const m = Math.max(a.min, 1);
    per[p.link] = { wr: a.w / a.g, kda: (a.k + a.a) / Math.max(a.d, 1), gpm: a.gold / m, cspm: a.cs / m, dpm: a.dmg / m, vspm: a.vs / m, g: a.g };
  }
  const zs = {};
  // z-score so với các tuyển thủ cùng vị trí trong CÙNG giải (sau đó nhân hệ số sức mạnh giải)
  for (const L of LEAGUES) for (const role of ROLES) {
    const list = Object.entries(per).filter(([l]) => players[l].role === role && players[l].league === L.id);
    for (const key of ['wr', 'kda', 'gpm', 'cspm', 'dpm', 'vspm', 'g']) {
      const vals = list.map(([, v]) => v[key]);
      const mean = vals.reduce((s, x) => s + x, 0) / (vals.length || 1);
      const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (vals.length || 1)) || 1;
      for (const [l, v] of list) ((zs[l] ??= {})[key] = (v[key] - mean) / sd);
    }
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  let st;
  for (const p of Object.values(players)) {
    const s = leagueStrength[p.league];
    const base = 40 + s * 36; // LCK ~76, VCS ~67
    st = (b, zz) => Math.round(clamp(b + clamp(zz, -2.5, 2.5) * 6.5 * s, 35, 99));
    const z = zs[p.link] || { wr: -0.8, kda: -0.8, gpm: -0.8, cspm: -0.8, dpm: -0.8, vspm: -0.5, g: -1.2 };
    const a = agg[p.link];
    const intlBonus = a ? Math.min(a.intl, 30) * 0.22 : 0;
    const wrBoost = z.wr * 4 + intlBonus;
    const age = p.birth ? (2026.9 - parseInt(p.birth.slice(0, 4))) : 21;
    p.age = Math.round(age);
    p.stats = {
      laning: st(base + wrBoost * 0.5, (z.cspm + z.gpm) / 2),
      mechanics: st(base + wrBoost * 0.5, (z.dpm + z.kda) / 2),
      teamfight: st(base + wrBoost * 0.6, (z.kda * 0.6 + z.dpm * 0.4)),
      macro: st(base + wrBoost, z.wr * 0.5 + z.g * 0.3),
      vision: st(base, z.vspm),
      consistency: st(base + wrBoost * 0.4, z.g * 0.6 + z.kda * 0.3),
    };
    if (p.role === 'Support') p.stats.laning = Math.round((p.stats.laning + p.stats.vision) / 2);
    const w = { laning: 0.2, mechanics: 0.2, teamfight: 0.2, macro: 0.2, vision: 0.08, consistency: 0.12 };
    p.ovr = Math.round(Object.entries(w).reduce((s, [k, x]) => s + p.stats[k] * x, 0));
    p.potential = Math.round(clamp(p.ovr + Math.max(0, 23 - age) * 2.2 + 1, p.ovr, 99));
    p.games = a ? a.g : 0;
    p.record = per[p.link] ? { wr: +per[p.link].wr.toFixed(3), kda: +per[p.link].kda.toFixed(2), cspm: +per[p.link].cspm.toFixed(2), dpm: Math.round(per[p.link].dpm), gpm: Math.round(per[p.link].gpm), vspm: +per[p.link].vspm.toFixed(2) } : null;
    p.pool = a ? Object.entries(a.champs).sort((x, y) => y[1].g - x[1].g).slice(0, 8).map(([c, v]) => ({ c, g: v.g, w: v.w })) : [];
    // giá trị & lương (đơn vị: nghìn USD)
    p.salary = Math.round(clamp((p.ovr - 55) ** 2 * 1.6 * (0.6 + s * 0.5), 20, 3500));
    p.value = Math.round(p.salary * (2.2 + Math.max(0, 25 - age) * 0.15));
  }
  for (const t of Object.values(teams)) {
    t.players.sort((a, b) => ROLES.indexOf(players[a].role) - ROLES.indexOf(players[b].role) || players[b].games - players[a].games);
    const starters = ROLES.map((r) => t.players.find((l) => players[l].role === r)).filter(Boolean);
    const ovr = starters.reduce((s, l) => s + players[l].ovr, 0) / (starters.length || 1);
    t.budget = Math.round(clamp((ovr - 55) * 220 * leagueStrength[t.league], 800, 9000));
    t.short ??= t.name.slice(0, 3).toUpperCase();
  }

  // ---------- Meta tướng chuyên nghiệp ----------
  const parsePatch = (p) => { const [a, b] = (p || '0.0').split('.').map(Number); return a * 100 + b; };
  const latest = Math.max(...games.map((g) => parsePatch(g.Patch)));
  const recent = games.filter((g) => parsePatch(g.Patch) >= latest - 3);
  const meta = {};
  for (const g of recent) {
    for (const side of [1, 2]) {
      const win = +g.Winner === side;
      for (const n of (g[`Team${side}Picks`] || '').split(',')) { const id = champId(n.trim()); if (!id) continue; const m = (meta[id] ??= { p: 0, b: 0, w: 0, roles: {} }); m.p++; if (win) m.w++; }
      for (const n of (g[`Team${side}Bans`] || '').split(',')) { const id = champId(n.trim()); if (!id) continue; (meta[id] ??= { p: 0, b: 0, w: 0, roles: {} }).b++; }
    }
  }
  const roleCount = {};
  for (const r of sp) { const id = champId(r.Champion); if (id && ROLES.includes(r.Role)) { (roleCount[id] ??= {})[r.Role] = (roleCount[id][r.Role] || 0) + 1; } }

  const champions = {};
  const N = recent.length || 1;
  for (const [id, c] of Object.entries(champEn)) {
    const m = meta[id] || { p: 0, b: 0, w: 0 };
    const rc = roleCount[id] || {};
    const total = Object.values(rc).reduce((s, x) => s + x, 0);
    let roles = Object.entries(rc).filter(([, x]) => x / total >= 0.15).sort((a, b) => b[1] - a[1]).map(([r]) => r);
    if (!roles.length) {
      const t = c.tags; roles = t.includes('Marksman') ? ['Bot'] : t.includes('Support') ? ['Support'] : t.includes('Mage') || t.includes('Assassin') ? ['Mid'] : t.includes('Tank') || t.includes('Fighter') ? ['Top'] : ['Mid'];
    }
    const presence = (m.p + m.b) / N;
    const wr = m.p ? m.w / m.p : 0.47;
    const score = presence * 100 + (m.p >= 5 ? (wr - 0.5) * 60 : -2);
    const tier = score >= 45 ? 'S' : score >= 25 ? 'A' : score >= 10 ? 'B' : score >= 3 ? 'C' : 'D';
    const build = Object.entries(champBuilds[id] || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([i]) => i);
    champions[id] = {
      id, name: c.name, nameVi: champVi[id]?.name || c.name, titleVi: champVi[id]?.title || '', title: c.title,
      tags: c.tags, info: c.info, roles, tier, presence: +presence.toFixed(3), wr: +wr.toFixed(3), picks: m.p, bans: m.b,
      power: Math.round(clamp(50 + presence * 45 + (m.p >= 5 ? (wr - 0.5) * 40 : -3), 40, 99)), build,
    };
  }
  const items = {};
  for (const [id, it] of Object.entries(itemEn)) {
    if (+id >= 100000 || !(it.maps?.['11'] && it.gold?.purchasable && it.gold.total >= 2200 && !it.requiredChampion)) continue;
    items[id] = { id, name: it.name, nameVi: itemVi[id]?.name || it.name, gold: it.gold.total, tags: it.tags, plain: itemVi[id]?.plaintext || it.plaintext };
  }

  // tải ảnh tướng & trang bị về assets/
  const ASSETS = new URL('../assets/', import.meta.url).pathname;
  for (const [dir, ids] of [['champion', Object.keys(champions)], ['item', Object.keys(items)]]) {
    mkdirSync(ASSETS + dir, { recursive: true });
    for (const id of ids) {
      const f = `${ASSETS}${dir}/${id}.png`;
      if (existsSync(f)) continue;
      execFileSync('curl', ['-s', '-f', '-m', '30', '-o', f, `https://ddragon.leagueoflegends.com/cdn/${ver}/img/${dir}/${id}.png`]);
    }
  }

  // ảnh dọc (loading art) cho màn cấm/chọn, chuyển sang WebP cho nhẹ
  mkdirSync(ASSETS + 'loading', { recursive: true });
  for (const id of Object.keys(champions)) {
    const f = `${ASSETS}loading/${id}.webp`;
    if (existsSync(f)) continue;
    const tmp = f + '.jpg';
    try {
      execFileSync('curl', ['-s', '-f', '-m', '30', '-o', tmp, `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${id}_0.jpg`]);
      execFileSync('convert', [tmp, '-resize', '240x', '-strip', '-quality', '80', f]);
    } catch { console.warn('  thiếu loading art', id); }
    try { execFileSync('rm', ['-f', tmp]); } catch { /* */ }
  }

  const patchLabel = `${Math.floor(latest / 100)}.${latest % 100}`;
  writeFileSync(OUT + 'leagues.json', JSON.stringify(LEAGUES.map(({ like, roster, ...l }) => ({ ...l, source: roster })), null, 1));
  writeFileSync(OUT + 'teams.json', JSON.stringify(teams));
  writeFileSync(OUT + 'players.json', JSON.stringify(players));
  writeFileSync(OUT + 'champions.json', JSON.stringify(champions));
  writeFileSync(OUT + 'items.json', JSON.stringify(items));
  writeFileSync(OUT + 'meta.json', JSON.stringify({ ddragon: ver, proPatch: patchLabel, gamesAnalyzed: recent.length, totalGames: games.length, generated: new Date().toISOString() }, null, 1));
  console.log(`Xong: ${Object.keys(teams).length} đội, ${Object.keys(players).length} tuyển thủ, ${recent.length} trận meta (patch ${patchLabel}).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
