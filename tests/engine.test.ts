import { beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from './helpers';
import { autoDraft, createGame, simulateGame, type GameState } from '../src/engine';
import { teamOvr } from '../src/engine/state';
import { withState } from '../src/engine/state';

let st: GameState;
beforeAll(() => { loadDb(); st = createGame({ teamId: 'T1', manager: 'Test' }); });

describe('mô phỏng một ván', () => {
  it('ra kết quả hợp lệ và có đủ khung hình khi ghi', () => {
    const teams = Object.values(st.teams).filter((t) => Object.keys(t.lineup).length === 5);
    const d = autoDraft(st, teams[0].id, teams[1].id);
    const g = simulateGame(st, d, { record: true });
    expect(['B', 'R']).toContain(g.winner);
    expect(g.players).toHaveLength(10);
    expect(g.frames!.length).toBeGreaterThan(40);
    expect(g.durS).toBeGreaterThan(15 * 60);
    expect(g.events.at(-1)!.type).toBe('nexus');
  });

  it('cân bằng: 300 ván ngẫu nhiên nằm trong khoảng hợp lý', () => {
    const teams = Object.values(st.teams).filter((t) => Object.keys(t.lineup).length === 5);
    let dur = 0, kills = 0, strongerWins = 0, lopsided = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const a = teams[(i * 7) % teams.length], b = teams[(i * 13 + 5) % teams.length];
      if (a === b) continue;
      const g = simulateGame(st, autoDraft(st, a.id, b.id));
      dur += g.dur; kills += g.kills.B + g.kills.R;
      const [oa, ob] = withState(st, () => [teamOvr(a), teamOvr(b)]);
      if (Math.abs(oa - ob) >= 6) { lopsided++; if ((oa > ob) === (g.winnerId === a.id)) strongerWins++; }
    }
    expect(dur / N).toBeGreaterThan(24);
    expect(dur / N).toBeLessThan(36);
    expect(kills / N).toBeGreaterThan(18);
    expect(kills / N).toBeLessThan(40);
    expect(strongerWins / lopsided).toBeGreaterThan(0.65);
  });
});
