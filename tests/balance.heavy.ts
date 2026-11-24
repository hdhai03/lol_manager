// Kiểm tra cân bằng quy mô lớn: hàng nghìn ván giữa mọi cặp đội.
// Chạy: npm run test:balance  (BALANCE_N=5000 để tăng số ván)
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from './helpers';
import { autoDraft, createGame, simulateGame, type GameState } from '../src/engine';
import { teamOvr, withState } from '../src/engine/state';

const N = Number(process.env.BALANCE_N || 2000);
let st: GameState;
beforeAll(() => { loadDb(); st = createGame({ teamId: 'T1', manager: 'Balance' }); });

describe(`cân bằng engine (${N} ván)`, () => {
  it('thời lượng, mạng hạ, mục tiêu và tỉ lệ thắng theo chênh lệch sức mạnh', () => {
    const teams = Object.values(st.teams).filter((t) => Object.keys(t.lineup).length === 5);
    const ovr = Object.fromEntries(withState(st, () => teams.map((t) => [t.id, teamOvr(t)])));
    const buckets: Record<string, [number, number]> = {}; // chênh OVR -> [đội mạnh thắng, tổng]
    let dur = 0, kills = 0, towers = 0, barons = 0, drakes = 0, blueWins = 0, short = 0, long = 0, n = 0;
    for (let i = 0; i < N; i++) {
      const a = teams[Math.floor(Math.random() * teams.length)], b = teams[Math.floor(Math.random() * teams.length)];
      if (a === b) continue;
      const g = simulateGame(st, autoDraft(st, a.id, b.id));
      n++;
      dur += g.dur; kills += g.kills.B + g.kills.R; towers += g.towers.B + g.towers.R;
      barons += g.obj.B.barons + g.obj.R.barons; drakes += g.drakes.B.length + g.drakes.R.length;
      if (g.winner === 'B') blueWins++;
      if (g.dur < 22) short++;
      if (g.dur > 42) long++;
      const gap = Math.abs(ovr[a.id] - ovr[b.id]);
      const key = gap < 3 ? '0-2' : gap < 6 ? '3-5' : gap < 10 ? '6-9' : '10+';
      const strongA = ovr[a.id] >= ovr[b.id];
      const bk = (buckets[key] ??= [0, 0]);
      bk[1]++;
      if ((g.winnerId === a.id) === strongA) bk[0]++;
    }
    const rep = {
      games: n, dur: +(dur / n).toFixed(1), kills: +(kills / n).toFixed(1), towers: +(towers / n).toFixed(1),
      barons: +(barons / n).toFixed(2), drakes: +(drakes / n).toFixed(2), blueWR: +(blueWins / n).toFixed(3),
      shortPct: +(short / n).toFixed(3), longPct: +(long / n).toFixed(3),
      strongerWR: Object.fromEntries(Object.entries(buckets).map(([k, [w, t]]) => [k, `${(w / t).toFixed(3)} (${t})`])),
    };
    console.log(JSON.stringify(rep, null, 1));
    expect(rep.dur).toBeGreaterThan(25); expect(rep.dur).toBeLessThan(35);
    expect(rep.kills).toBeGreaterThan(18); expect(rep.kills).toBeLessThan(38);
    expect(rep.towers).toBeGreaterThan(9); expect(rep.towers).toBeLessThan(18);
    expect(rep.drakes).toBeGreaterThan(2.5); expect(rep.drakes).toBeLessThan(6);
    expect(rep.blueWR).toBeGreaterThan(0.44); expect(rep.blueWR).toBeLessThan(0.58);
    expect(rep.shortPct).toBeLessThan(0.08); expect(rep.longPct).toBeLessThan(0.12);
    // càng chênh lệch, đội mạnh càng thắng nhiều; đều nhau thì gần 50/50
    const wr = (k: string) => buckets[k][0] / buckets[k][1];
    expect(wr('0-2')).toBeLessThan(0.66);
    expect(wr('6-9')).toBeGreaterThan(wr('0-2'));
    if (buckets['10+']?.[1] > 30) expect(wr('10+')).toBeGreaterThan(0.75);
  });
});
