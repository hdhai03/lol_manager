// Lấy top bảng xếp hạng đơn thật từ OP.GG (KR, EUW, NA, TW, VN, BR — OP.GG không có máy chủ Trung Quốc).
// Chạy: node scripts/fetch-ladder.mjs → public/data/ladder.json (game cũng tự cập nhật khi mở, xem src/engine/ladder.ts)
import { writeFileSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const SERVERS = { KR: 'kr', EUW: 'euw', NA: 'na', TW: 'tw', VN: 'vn', BR: 'br' };
const meta = JSON.parse(readFileSync(ROOT + 'public/data/meta.json', 'utf8'));
const champs = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${meta.ddragon}/data/en_US/champion.json`)).json();
const byKey = Object.fromEntries(Object.values(champs.data).map((c) => [Number(c.key), c.id]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function compact(data) {
  return data.map((e) => {
    const s = e.summoner;
    const ls = (s.league_stats || []).find((x) => x.game_type === 'SOLORANKED') || {};
    const pro = s.player?.current_pro_team ? { nick: s.player.nickname, team: s.player.current_pro_team.pro_team?.acronym || s.player.current_pro_team.pro_team?.name || '', pos: s.player.current_pro_team.position } : s.player ? { nick: s.player.nickname, team: '', pos: '' } : null;
    const ch = {};
    for (const c of (s.most_champions?.champion_stats || []).slice(0, 4)) if (byKey[c.id]) ch[byKey[c.id]] = c.play;
    return { r: e.rank, n: s.game_name, tag: s.tagline, lp: ls.tier_info?.lp ?? 0, tier: (ls.tier_info?.tier || '').toLowerCase(), w: ls.win ?? 0, l: ls.lose ?? 0, ch, pro };
  });
}
const out = { fetched: new Date().toISOString(), source: 'OP.GG', servers: {} };
for (const [sv, code] of Object.entries(SERVERS)) {
  const r = await fetch(`https://lol-api-summoner.op.gg/api/${code}/rankings/ladder?page=1`, { headers: { 'User-Agent': 'LOLManager-fan-project (ladder snapshot)' } });
  if (!r.ok) { console.warn(sv, r.status); continue; }
  const j = await r.json();
  out.servers[sv] = compact(j.data || []);
  console.log(sv, out.servers[sv].length, 'accounts,', out.servers[sv].filter((x) => x.pro).length, 'pros');
  await sleep(400);
}
writeFileSync(ROOT + 'public/data/ladder.json', JSON.stringify(out));
console.log('wrote public/data/ladder.json', (JSON.stringify(out).length / 1024).toFixed(0) + 'KB');
