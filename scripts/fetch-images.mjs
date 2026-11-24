// Tải logo giải đấu, logo đội tuyển và ảnh chân dung (mini face) tuyển thủ từ Leaguepedia.
// Chạy sau scripts/fetch-data.mjs:  node scripts/fetch-images.mjs
// Ảnh lưu ở assets/{league,team,player}/ và bản đồ đường dẫn ở data/images.json
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url).pathname;
const DATA = ROOT + 'data/';
const CACHE = ROOT + 'scripts/.cache/';
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = 'https://lol.fandom.com/api.php';

function curlJson(params) {
  const args = ['-s', '-m', '60', '-G', API];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  return JSON.parse(execFileSync('curl', args, { maxBuffer: 1 << 28 }).toString());
}
async function api(params) {
  const key = CACHE + 'img_' + createHash('md5').update(JSON.stringify(params)).digest('hex') + '.json';
  if (!process.env.NO_CACHE && existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  for (let tries = 1; ; tries++) {
    try {
      const d = curlJson({ format: 'json', ...params });
      if (d.error) throw new Error(JSON.stringify(d.error));
      writeFileSync(key, JSON.stringify(d));
      await sleep(1100);
      return d;
    } catch (e) {
      if (tries > 6) throw e;
      console.warn('  retry', tries, String(e).slice(0, 100));
      await sleep(3000 * tries);
    }
  }
}
async function cargo(tables, fields, where) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const d = await api({ action: 'cargoquery', limit: 500, offset, tables, fields, where });
    const got = (d.cargoquery || []).map((x) => x.title);
    rows.push(...got);
    if (got.length < 500) return rows;
  }
}
const esc = (s) => s.replace(/'/g, "\\'");

// Lấy URL thumbnail cho nhiều file cùng lúc. Trả về { 'Tên file': url | null }
async function thumbs(files, width) {
  const out = {};
  const uniq = [...new Set(files.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 40) {
    const part = uniq.slice(i, i + 40);
    const d = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: width, titles: part.map((f) => 'File:' + f).join('|') });
    const norm = {};
    for (const n of d.query.normalized || []) norm[n.to] = n.from;
    for (const p of Object.values(d.query.pages)) {
      const orig = (norm[p.title] || p.title).replace(/^File:/, '');
      out[orig] = p.imageinfo ? (p.imageinfo[0].thumburl || p.imageinfo[0].url) : null;
      // tên đã chuẩn hoá (dấu gạch dưới) cũng trỏ cùng ảnh
      out[p.title.replace(/^File:/, '')] = out[orig];
    }
  }
  return out;
}

const slug = (s) => s.normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').slice(0, 40) + '_' + createHash('md5').update(s).digest('hex').slice(0, 6);

function download(url, file, size) {
  if (existsSync(file)) return true;
  const tmp = file + '.tmp';
  try {
    execFileSync('curl', ['-s', '-f', '-L', '-m', '60', '-o', tmp, url]);
    // chuẩn hoá: WebP vuông/khung cố định, nền trong suốt, nhẹ
    execFileSync('convert', [tmp, '-resize', `${size}x${size}`, '-background', 'none', '-gravity', size === 96 ? 'center' : 'north', '-extent', `${size}x${size}`, '-strip', '-quality', '82', file]);
    execFileSync('rm', ['-f', tmp]);
    return true;
  } catch (e) {
    console.warn('  tải lỗi', url.slice(0, 90));
    try { execFileSync('rm', ['-f', tmp]); } catch { /* */ }
    return false;
  }
}

async function main() {
  const leagues = JSON.parse(readFileSync(DATA + 'leagues.json', 'utf8'));
  const teams = JSON.parse(readFileSync(DATA + 'teams.json', 'utf8'));
  const players = JSON.parse(readFileSync(DATA + 'players.json', 'utf8'));
  const images = { leagues: {}, teams: {}, players: {}, source: 'Leaguepedia (lol.fandom.com)', generated: new Date().toISOString() };
  for (const d of ['league', 'team', 'player']) mkdirSync(ROOT + 'assets/' + d, { recursive: true });

  // ---- Giải đấu (gồm cả MSI & CKTG) ----
  const leagueFiles = {
    ...Object.fromEntries(leagues.map((l) => [l.id, [`${l.name}logo square.png`, `${l.name}logo std.png`]])),
    LPL: ['Tencent LoL Pro Leaguelogo square.png', 'LoL Pro Leaguelogo square.png'],
    LCS: ['League of Legends Championship Serieslogo square.png', 'LCS2021 logo.png'],
    CBLOL: ['Circuit Brazilian League of Legendslogo square.png', 'CBLOLlogo square.png'],
    MSI: ['Mid-Season Invitationallogo square.png', 'Mid-Season Invitational 2026.png'],
    WORLDS: ['World Championshiplogo square.png', 'Worlds 2026.png'],
  };
  const lt = await thumbs(Object.values(leagueFiles).flat(), 128);
  for (const [id, files] of Object.entries(leagueFiles)) {
    const f = files.find((x) => lt[x]);
    const path = `assets/league/${id}.webp`;
    if (f && download(lt[f], ROOT + path, 128)) images.leagues[id] = path;
    else console.warn('Không có logo giải', id);
  }
  console.log('Logo giải:', Object.keys(images.leagues).length);

  // ---- Đội tuyển ----
  const names = Object.keys(teams);
  const teamImg = {};
  for (let i = 0; i < names.length; i += 40) {
    const part = names.slice(i, i + 40).map((n) => `'${esc(n)}'`).join(',');
    for (const r of await cargo('Teams', 'Name,Image', `Name IN (${part})`)) teamImg[r.Name] = r.Image;
  }
  const tt = await thumbs(names.flatMap((n) => [`${n}logo square.png`, teamImg[n]]), 96);
  for (const n of names) {
    const f = [`${n}logo square.png`, teamImg[n]].find((x) => x && tt[x]);
    const path = `assets/team/${slug(n)}.webp`;
    if (f && download(tt[f], ROOT + path, 96)) images.teams[n] = path;
    else console.warn('Không có logo đội', n);
  }
  console.log('Logo đội:', Object.keys(images.teams).length, '/', names.length);

  // ---- Tuyển thủ: ảnh mới nhất trong PlayerImages ----
  const links = Object.keys(players);
  const cand = {};
  for (let i = 0; i < links.length; i += 40) {
    const part = links.slice(i, i + 40).map((n) => `'${esc(n)}'`).join(',');
    for (const r of await cargo('PlayerImages', 'FileName,Link,ImageType', `Link IN (${part})`)) (cand[r.Link] ??= []).push(r.FileName);
  }
  const rank = (f) => {
    const y = Math.max(0, ...(f.match(/20\d\d/g) || ['0']).map(Number));
    const sub = /WC|Worlds/i.test(f) ? 5 : /Split 3|Summer|Season Finals/i.test(f) ? 4 : /Split 2|MSI/i.test(f) ? 3 : /Split 1|Spring|Cup|Versus/i.test(f) ? 2 : 1;
    return y * 10 + sub;
  };
  const best = {};
  for (const [l, fs] of Object.entries(cand)) best[l] = fs.sort((a, b) => rank(b) - rank(a)).slice(0, 3);
  const pt = await thumbs(Object.values(best).flat(), 160);
  let ok = 0;
  for (const l of links) {
    const f = (best[l] || []).find((x) => pt[x]);
    if (!f) continue;
    const path = `assets/player/${slug(l)}.webp`;
    if (download(pt[f], ROOT + path, 128)) { images.players[l] = path; ok++; }
  }
  console.log('Ảnh tuyển thủ:', ok, '/', links.length);

  // logo quá tối (đen/xanh than) sẽ được UI đặt trên nền sáng
  const LUM = "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGBA')\npx=[(r,g,b) for r,g,b,a in im.getdata() if a>128]\nprint(sum(0.2126*r+0.7152*g+0.0722*b for r,g,b in px)/max(len(px),1))";
  images.dark = [];
  for (const path of [...Object.values(images.leagues), ...Object.values(images.teams)]) {
    const lum = parseFloat(execFileSync('python3', ['-I', '-c', LUM, ROOT + path]).toString());
    if (lum < 60) images.dark.push(path);
  }
  console.log('Logo tối:', images.dark.length);
  writeFileSync(DATA + 'images.json', JSON.stringify(images, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
