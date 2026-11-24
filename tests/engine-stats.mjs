// Thống kê engine: node tests/engine-stats.mjs [số ván]
import { readFileSync } from 'node:fs';
import { DB } from '../js/data.js';
import { S, newGame, teamOvr } from '../js/state.js';
import { autoDraft, simulateGame } from '../js/sim.js';
import { ROLES } from '../js/util.js';

for (const f of ['leagues', 'teams', 'players', 'champions', 'items', 'meta']) DB[f] = JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
DB.champList = Object.values(DB.champions).sort((a, b) => a.name.localeCompare(b.name));
DB.leagueById = Object.fromEntries(DB.leagues.map((l) => [l.id, l]));
newGame({ teamId: Object.values(DB.teams)[0].name, manager: 'T' });
const N = +(process.argv[2] || 400);
const teams = Object.values(S.teams).filter((t) => Object.keys(t.lineup).length === 5);
const agg = { dur: 0, kills: 0, towersW: 0, towersL: 0, drakes: 0, barons: 0, cspm: {}, dpm: {}, kda: {}, gpm: {}, notes: {}, ms: 0, sixty: 0 };
const buckets = {};
for (let i = 0; i < N; i++) {
  const a = teams[Math.floor(Math.random() * teams.length)], b = teams[Math.floor(Math.random() * teams.length)];
  if (a === b) { i--; continue; }
  const t0 = performance.now();
  const g = simulateGame(autoDraft(a.id, b.id));
  agg.ms += performance.now() - t0;
  agg.dur += g.dur; agg.kills += g.kills.B + g.kills.R;
  if (g.dur >= 60) agg.sixty++;
  const L = g.winner === 'B' ? 'R' : 'B';
  agg.towersW += g.towers[g.winner]; agg.towersL += g.towers[L];
  agg.drakes += g.drakes.B.length + g.drakes.R.length;
  agg.barons += g.events.filter((e) => e.type === 'baron').length;
  for (const e of g.events) if (e.type === 'note') agg.notes[e.key] = (agg.notes[e.key] || 0) + 1;
  for (const x of g.players) {
    agg.cspm[x.role] = (agg.cspm[x.role] || 0) + x.cs / g.dur;
    agg.dpm[x.role] = (agg.dpm[x.role] || 0) + x.dmg / g.dur;
    agg.gpm[x.role] = (agg.gpm[x.role] || 0) + x.gold / g.dur;
  }
  const diff = teamOvr(a) - teamOvr(b);
  const k = Math.max(-4, Math.min(4, Math.round(diff / 2.5)));
  buckets[k] ??= [0, 0];
  buckets[k][0]++; if (g.winnerId === a.id) buckets[k][1]++;
}
const f = (x) => (x / N).toFixed(2);
console.log('ms/game', f(agg.ms), 'dur', f(agg.dur), 'kills', f(agg.kills), 'towers W/L', f(agg.towersW), f(agg.towersL), 'drakes', f(agg.drakes), 'barons', f(agg.barons), '60min', agg.sixty);
for (const r of ROLES) console.log(r.padEnd(8), 'cs/m', (agg.cspm[r] / N / 2).toFixed(1), 'dmg/m', Math.round(agg.dpm[r] / N / 2), 'g/m', Math.round(agg.gpm[r] / N / 2));
console.log('notes/game', Object.fromEntries(Object.entries(agg.notes).map(([k, v]) => [k, +(v / N).toFixed(2)])));
console.log('win% by OVR diff (x2.5):', Object.keys(buckets).sort((a, b) => a - b).map((k) => `${k}:${Math.round(buckets[k][1] / buckets[k][0] * 100)}%(${buckets[k][0]})`).join(' '));
