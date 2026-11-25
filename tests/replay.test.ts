import { beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from './helpers';
import { autoDraft, createGame, simulateGame, type GameState } from '../src/engine';
import { withState } from '../src/engine/state';
import { resimGame } from '../src/engine/sim';

let st: GameState;
beforeAll(() => { loadDb(); st = createGame({ teamId: 'T1', manager: 'Test' }); });

describe('seed & lệnh trong trận', () => {
  it('cùng seed → cùng kết quả; lệnh chỉ đổi diễn biến sau thời điểm ra lệnh', () => withState(st, () => {
    const d = autoDraft(st, 'T1', 'Gen.G');
    const g = simulateGame(st, d, { record: true });
    const same = resimGame(g, []);
    expect(same.durS).toBe(g.durS);
    expect(same.kills).toEqual(g.kills);
    const t = 900;
    const o = resimGame(g, [{ t, side: 'B', kind: 'fight' }]);
    const before = (x: typeof g) => x.events.filter((e) => e.s < t).map((e) => `${e.s}:${e.type}:${e.side}`).join(',');
    expect(before(o)).toBe(before(g));
  }));
});
