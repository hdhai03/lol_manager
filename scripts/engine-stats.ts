// Thống kê cân bằng engine: npx tsx scripts/engine-stats.ts [số ván]
import { readFileSync } from 'node:fs';
import { initDb, createGame, autoDraft, simulateGame } from '../src/engine';
import { withState, teamOvr } from '../src/engine/state';
import { ROLES } from '../src/engine/util';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'));
initDb({ leagues: read('leagues'), teams: read('teams'), players: read('players'), champions: read('champions'), items: read('items'), meta: read('meta'), images: null });
const st = createGame({ teamId: 'T1', manager: 'stats' });
const N = +(process.argv[2] || 400);
const teams = Object.values(st.teams).filter((t) => Object.keys(t.lineup).length === 5);
const agg = { dur: 0, kills: 0, towersW: 0, towersL: 0, drakes: 0, barons: 0, ms: 0 };
const per: Record<string, { cs: number; dmg: number; gold: number }> = {};
const notes: Record<string, number> = {};
const buckets: Record<number, [number, number]> = {};
for (let i = 0; i < N; i++) {
  const a = teams[Math.floor(Math.random() * teams.length)], b = teams[Math.floor(Math.random() * teams.length)];
  if (a === b) { i--; continue; }
  const t0 = performance.now();
  const g = simulateGame(st, autoDraft(st, a.id, b.id));
  agg.ms += performance.now() - t0;
  agg.dur += g.dur; agg.kills += g.kills.B + g.kills.R;
  const L = g.winner === 'B' ? 'R' : 'B';
  agg.towersW += g.towers[g.winner]; agg.towersL += g.towers[L];
  agg.drakes += g.drakes.B.length + g.drakes.R.length;
  agg.barons += g.obj.B.barons + g.obj.R.barons;
  for (const e of g.events) if (e.type === 'note') notes[e.key as string] = (notes[e.key as string] || 0) + 1;
  for (const x of g.players) {
    const r = (per[x.role] ??= { cs: 0, dmg: 0, gold: 0 });
    r.cs += x.cs / g.dur; r.dmg += x.dmg / g.dur; r.gold += x.gold / g.dur;
  }
  const diff = withState(st, () => teamOvr(a) - teamOvr(b));
  const k = Math.max(-4, Math.min(4, Math.round(diff / 2.5)));
  buckets[k] ??= [0, 0];
  buckets[k][0]++; if (g.winnerId === a.id) buckets[k][1]++;
}
const f = (x: number) => (x / N).toFixed(2);
console.log('ms/ván', f(agg.ms), '| phút', f(agg.dur), '| mạng', f(agg.kills), '| trụ thắng/thua', f(agg.towersW), f(agg.towersL), '| rồng', f(agg.drakes), '| baron', f(agg.barons));
for (const r of ROLES) console.log(r.padEnd(8), 'cs/p', (per[r].cs / N / 2).toFixed(1), 'st/p', Math.round(per[r].dmg / N / 2), 'vàng/p', Math.round(per[r].gold / N / 2));
console.log('tình huống/ván', Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, +(v / N).toFixed(2)])));
console.log('tỉ lệ thắng theo chênh OVR (x2.5):', Object.keys(buckets).map(Number).sort((a, b) => a - b).map((k) => `${k}:${Math.round(buckets[k][1] / buckets[k][0] * 100)}%(${buckets[k][0]})`).join(' '));
