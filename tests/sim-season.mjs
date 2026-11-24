// Kiểm thử nhanh: giả lập 2 mùa giải hoàn toàn tự động (node tests/sim-season.mjs)
import { readFileSync } from 'node:fs';
import { DB } from '../js/data.js';
import { S, newGame, teamOvr } from '../js/state.js';
import { startPhase, advanceDay, userMatchToday, startNewSeason, standings } from '../js/season.js';
import { simSeries } from '../js/sim.js';

for (const f of ['leagues', 'teams', 'players', 'champions', 'items', 'meta']) DB[f] = JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
DB.champList = Object.values(DB.champions).sort((a, b) => a.name.localeCompare(b.name));
DB.leagueById = Object.fromEntries(DB.leagues.map((l) => [l.id, l]));

newGame({ teamId: process.argv[2] || 'Saigon Warriors', manager: 'Test' });
startPhase('kickoff');
for (let season = 0; season < 2; season++) {
  let guard = 0;
  while (S.phase !== 'offseason' && guard++ < 2000) {
    const um = userMatchToday();
    if (um) simSeries(um);
    advanceDay();
  }
  console.log('Season', S.season, 'days', S.day, 'budget', Math.round(S.teams[S.userTeam].budget));
  for (const h of S.history.filter((x) => x.season === S.season)) console.log('  ', h.title, '->', h.champ, 'vs', h.runner);
  startNewSeason();
}
const json = JSON.stringify(S);
console.log('save size KB', Math.round(json.length / 1024));
const top = Object.values(S.teams).sort((a, b) => teamOvr(b) - teamOvr(a)).slice(0, 5).map((t) => t.short + ':' + teamOvr(t));
console.log('top teams', top.join(' '));
const bad = Object.values(S.teams).filter((t) => Object.keys(t.lineup).length < 5).map((t) => t.short);
console.log('teams with incomplete lineup', bad);
