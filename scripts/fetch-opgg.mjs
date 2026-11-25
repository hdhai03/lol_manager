// Lấy meta xếp hạng hiện tại từ OP.GG (KR, Emerald+): tier / tỉ lệ thắng / chọn / cấm theo từng vị trí,
// các bảng ngọc phổ biến của từng tướng ở từng vị trí, và định nghĩa ngọc + biểu tượng từ Data Dragon.
// Chạy: node scripts/fetch-opgg.mjs   → public/data/opgg.json, public/assets/rune/*.png
// Game cũng tự lấy bản mới nhất khi mở (src/engine/opgg.ts); file này là bản dự phòng khi không có mạng.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = ROOT + 'public/data/opgg.json';
const ICONS = ROOT + 'public/assets/rune/';
const OPGG = 'https://lol-api-champion.op.gg/api/KR/champions/ranked';
const TIER = 'emerald_plus';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'LOLManager-fan-project (meta snapshot)' } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) { if (i >= tries) throw e; await sleep(1500 * i); }
  }
};
const POS = { TOP: 'Top', JUNGLE: 'Jungle', MID: 'Mid', ADC: 'Bot', SUPPORT: 'Support' };

const meta = JSON.parse(readFileSync(ROOT + 'public/data/meta.json', 'utf8'));
const dd = meta.ddragon;
const champJson = await getJson(`https://ddragon.leagueoflegends.com/cdn/${dd}/data/en_US/champion.json`);
const byKey = Object.fromEntries(Object.values(champJson.data).map((c) => [Number(c.key), c.id]));

const ranked = await getJson(`${OPGG}?tier=${TIER}`);
console.log('op.gg patch', ranked.meta?.version, 'champions', ranked.data.length);
const champs = {};
let reqs = 0;
for (const c of ranked.data) {
  const id = byKey[c.id];
  if (!id || c.is_rip) continue;
  const pos = {};
  for (const p of c.positions || []) {
    const role = POS[p.name];
    if (!role) continue;
    const s = p.stats;
    if ((s.role_rate ?? 0) < 0.08 && (s.play ?? 0) < 1500) continue;
    const entry = { tier: s.tier_data?.tier ?? 5, rank: s.tier_data?.rank ?? 99, wr: +s.win_rate.toFixed(4), pr: +s.pick_rate.toFixed(4), br: +(s.ban_rate ?? 0).toFixed(4), play: s.play, rr: +(s.role_rate ?? 0).toFixed(3), counters: (p.counters || []).slice(0, 3).map((x) => byKey[x.champion_id]).filter(Boolean), runes: [] };
    // bảng ngọc phổ biến (tối đa 3, gộp các trang chỉ khác mảnh chỉ số)
    try {
      const d = await getJson(`${OPGG}/${c.id}/${p.name}?tier=${TIER}`);
      reqs++;
      const seen = new Set();
      for (const grp of d.data?.rune_pages || []) {
        // một số tướng trả về trang ngọc dạng nhóm (builds[]) thay vì phẳng
        const rp = grp.primary_rune_ids ? grp : { ...grp.builds?.[0], play: grp.play, win: grp.win, pick_rate: grp.pick_rate };
        if (!rp.primary_rune_ids) continue;
        const sig = rp.primary_rune_ids.join('-') + '|' + rp.secondary_rune_ids.join('-');
        if (seen.has(sig)) continue;
        seen.add(sig);
        entry.runes.push({ p: rp.primary_page_id, pr: rp.primary_rune_ids, s: rp.secondary_page_id, sr: rp.secondary_rune_ids, sh: rp.stat_mod_ids, wr: rp.play ? +(rp.win / rp.play).toFixed(4) : 0.5, pick: +rp.pick_rate.toFixed(4), play: rp.play });
        if (entry.runes.length >= 3) break;
      }
      await sleep(180);
    } catch (e) { console.warn('runes', id, p.name, String(e).slice(0, 80)); }
    pos[role] = entry;
  }
  if (Object.keys(pos).length) champs[id] = pos;
}
console.log('rune requests', reqs);

// định nghĩa ngọc (Anh + Việt) và biểu tượng
const [runesEn, runesVi] = await Promise.all([
  getJson(`https://ddragon.leagueoflegends.com/cdn/${dd}/data/en_US/runesReforged.json`),
  getJson(`https://ddragon.leagueoflegends.com/cdn/${dd}/data/vi_VN/runesReforged.json`).catch(() => null),
]);
const viName = {};
for (const st of runesVi || []) { viName[st.id] = st.name; for (const sl of st.slots) for (const r of sl.runes) viName[r.id] = r.name; }
mkdirSync(ICONS, { recursive: true });
const styles = [];
const icons = [];
for (const st of runesEn) {
  icons.push([st.id, st.icon]);
  styles.push({ id: st.id, key: st.key, name: st.name, nameVi: viName[st.id] || st.name, slots: st.slots.map((sl) => sl.runes.map((r) => { icons.push([r.id, r.icon]); return { id: r.id, key: r.key, name: r.name, nameVi: viName[r.id] || r.name }; })) });
}
let got = 0;
for (const [id, path] of icons) {
  const f = `${ICONS}${id}.png`;
  if (existsSync(f)) continue;
  const r = await fetch(`https://ddragon.leagueoflegends.com/cdn/img/${path}`);
  if (r.ok) { writeFileSync(f, Buffer.from(await r.arrayBuffer())); got++; }
}
console.log('rune icons downloaded', got);
const SHARDS = { 5008: ['Adaptive Force', 'Sức mạnh thích ứng'], 5005: ['Attack Speed', 'Tốc độ đánh'], 5007: ['Ability Haste', 'Điểm hồi kỹ năng'], 5010: ['Move Speed', 'Tốc độ di chuyển'], 5001: ['Health Scaling', 'Máu theo cấp'], 5011: ['Health', 'Máu'], 5013: ['Tenacity & Slow Resist', 'Kháng hiệu ứng'] };

const out = {
  meta: { source: 'OP.GG', region: 'KR', tier: 'Emerald+', patch: ranked.meta?.version, matches: ranked.meta?.match_count, analyzedAt: ranked.meta?.analyzed_at, fetched: new Date().toISOString() },
  styles, shards: SHARDS, champs,
  keys: Object.fromEntries(Object.entries(byKey).map(([k, id]) => [id, Number(k)])),
};
writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, Object.keys(champs).length, 'champions', (JSON.stringify(out).length / 1024).toFixed(0) + 'KB');
