import { beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from './helpers';
import { createGame, simSeason, startNewSeason, type GameState, type Comp } from '../src/engine';

let st: GameState;
beforeAll(() => { loadDb(); st = createGame({ teamId: 'Saigon Warriors', manager: 'Test' }); });

const comps = (s: GameState): Comp[] => Object.values(s.comps).filter((c) => c.id.startsWith(`${s.season}-`));

describe('một mùa giải đầy đủ theo thể thức 2026', () => {
  it('đi hết các pha và mọi giai đoạn đều kết thúc', () => {
    simSeason(st);
    expect(st.phase).toBe('offseason');
    const cs = comps(st);
    expect(cs.length).toBeGreaterThan(50);
    expect(cs.filter((c) => !c.done).map((c) => c.id)).toEqual([]);
  });

  it('First Stand 8 đội, MSI 11 đội, CKTG 19 đội', () => {
    const y = st.season;
    const fst = ['fst-a', 'fst-b'].flatMap((k) => st.comps[`${y}-INTL-${k}`].teams);
    expect(new Set(fst).size).toBe(8);
    const msi = new Set([...st.comps[`${y}-INTL-msi`].teams, ...st.comps[`${y}-INTL-msi-playin`].teams]);
    expect(msi.size).toBe(11);
    expect(st.comps[`${y}-INTL-worlds-swiss`].teams).toHaveLength(16);
    expect(st.comps[`${y}-INTL-worlds-playin`].teams).toHaveLength(4);
  });

  it('trao danh hiệu, giải thưởng cá nhân và cập nhật BXH sức mạnh', () => {
    expect(st.history.some((h) => h.title.startsWith('Worlds'))).toBe(true);
    expect(st.hall!.length).toBeGreaterThan(15);
    expect(st.gpr!.snaps.length).toBe(6);
    expect(Object.keys(st.records!.game).length).toBeGreaterThan(4);
  });

  it('sang mùa mới: đội hình đủ người, dữ liệu cũ được dọn', () => {
    startNewSeason(st);
    expect(st.phase).toBe('kickoff');
    const bad = Object.values(st.teams).filter((t) => Object.keys(t.lineup).length < 5).map((t) => t.short);
    expect(bad).toEqual([]);
    expect(JSON.stringify(st).length / 1024).toBeLessThan(2000);
  });
});
