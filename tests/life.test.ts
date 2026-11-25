import { beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from './helpers';
import { createGame, type GameState } from '../src/engine';
import { withState, S } from '../src/engine/state';
import { chemOf, chemPairs, teamChem, maybeEvent, resolveEvent, EV_CHOICES, runScrim, scrimPartners, grantBoost, activateBoost, boostMods, consumeBoost } from '../src/engine/life';
import { pickRunes } from '../src/engine/runes';

let st: GameState;
beforeAll(() => { loadDb(); st = createGame({ teamId: 'T1', manager: 'Test' }); });

describe('đời sống đội tuyển', () => {
  it('độ ăn ý tăng khi chơi cùng nhau', () => withState(st, () => {
    const before = teamChem('T1');
    chemPairs('T1', 5);
    expect(teamChem('T1')).toBeGreaterThan(before + 4);
    const [a, b] = Object.values(S.teams.T1.lineup) as string[];
    expect(chemOf(a, b)).toBeLessThanOrEqual(99);
  }));

  it('sự kiện sinh ra và xử lý được mọi lựa chọn', () => withState(st, () => {
    let guard = 0;
    while (!(S.events || []).some((e) => !e.done) && guard++ < 500) maybeEvent();
    const e = S.events!.find((x) => !x.done)!;
    expect(e).toBeTruthy();
    const out = resolveEvent(e.id, EV_CHOICES[e.kind][0]);
    expect(out).toMatch(new RegExp(`^${e.kind}\\.`));
    expect(e.done).toBe(EV_CHOICES[e.kind][0]);
  }));

  it('scrim ghi kết quả; thẻ tăng cường dùng rồi mất', () => withState(st, () => {
    S.scrimPlan = { on: true, opp: null };
    const day = S.day;
    S.day = -5; // ngày không có trận
    expect(scrimPartners().length).toBeGreaterThan(3);
    runScrim();
    S.day = day;
    expect(S.scrims?.length).toBe(1);
    const k = grantBoost('focus');
    expect(k).toBe('focus');
    activateBoost(S.boosts![0].id);
    expect(boostMods().day).toBeGreaterThan(0);
    consumeBoost();
    expect(S.boosts!.length).toBe(0);
    expect(S.boostActive).toBeNull();
  }));

  it('bảng ngọc: tướng có dữ liệu OP.GG nhận trang hợp lệ', () => withState(st, () => {
    const p = S.players[S.teams.T1.lineup.Mid!];
    for (let i = 0; i < 30; i++) {
      const r = pickRunes(p, 'Ahri', 'Mid');
      expect(r.pr).toHaveLength(4);
      expect(['meta', 'alt', 'custom', 'off']).toContain(r.kind);
      expect(Math.abs(r.bonus)).toBeLessThan(0.05);
    }
  }));
});

import { simSeason, startNewSeason } from '../src/engine';
import { ensureT2, t2Table } from '../src/engine/tier2';
describe('sự nghiệp, thương hiệu, hạng 2', () => {
  it('một mùa: có sổ tuần, người hâm mộ, hạng 2 và lịch sử HLV', () => {
    const g = createGame({ teamId: 'Gen.G', manager: 'Test' });
    simSeason(g);
    withState(g, () => {
      expect(S.ledger!.length).toBeGreaterThan(3);
      expect(S.brand!.fans).toBeGreaterThan(0);
      const lg = S.teams[S.userTeam].league;
      const tb = t2Table(lg);
      expect(tb.reduce((s, x) => s + x.w, 0)).toBeGreaterThan(10);
      expect(S.career!.w + S.career!.l).toBeGreaterThan(5);
    });
    startNewSeason(g);
    withState(g, () => {
      expect(S.career!.hist.length).toBe(1);
      expect(ensureT2()).toBeTruthy();
    });
  });
});
