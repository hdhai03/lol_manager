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
    const fid = S.boosts!.find((b) => b.kind === 'focus')!.id;
    activateBoost(fid);
    expect(boostMods().day).toBeGreaterThan(0);
    consumeBoost();
    expect(S.boosts!.some((b) => b.id === fid)).toBe(false);
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
import { sponsorOffers, signDeal } from '../src/engine/club';
import { ensureT2, t2Table } from '../src/engine/tier2';
describe('sự nghiệp, thương hiệu, hạng 2', () => {
  it('một mùa: có sổ tuần, người hâm mộ, hạng 2 và lịch sử HLV', () => {
    const g = createGame({ teamId: 'Gen.G', manager: 'Test' });
    withState(g, () => { const o = sponsorOffers(); expect(o.length).toBe(3); expect(signDeal(o[0].id)).toBe(true); });
    simSeason(g);
    withState(g, () => {
      expect(S.ledger!.length).toBeGreaterThan(3);
      expect(S.brand!.fans).toBeGreaterThan(0);
      const lg = S.teams[S.userTeam].league;
      const tb = t2Table(lg);
      expect(tb.reduce((s, x) => s + x.w, 0)).toBeGreaterThan(10);
      expect(S.career!.w + S.career!.l).toBeGreaterThan(5);
      expect(S.patch!.n).toBeGreaterThan(5);
      expect((S.missions || []).length).toBeGreaterThan(0);
      expect((S.social || []).length).toBeGreaterThan(5);
      expect(Object.values(S.players).some((p) => (p.hype ?? 50) > 55)).toBe(true);
      expect(S.ledger!.some((r) => (r.sponsor as number) > 0)).toBe(true);
      expect(Object.keys(S.patch!.mods).length).toBeGreaterThan(0);
    });
    startNewSeason(g);
    withState(g, () => {
      expect(S.career!.hist.length).toBe(1);
      expect(S.wrapped?.season).toBeGreaterThan(2000);
      expect(ensureT2()).toBeTruthy();
    });
  });
});

import { setDev, devDay, loanTargets, loanOut, returnLoans, setStaff, staffLv } from '../src/engine/staff';
import { scoutReport } from '../src/engine/scout';
import { propose, demandOf } from '../src/engine/contracts';
describe('nhân sự, phát triển, cho mượn, trinh sát, đàm phán', () => {
  it('chạy được và có hiệu lực', () => {
    const g = createGame({ teamId: 'T1', manager: 'Test' });
    withState(g, () => {
      S.teams.T1.budget = 100000;
      expect(setStaff('assistant', 3)).toBe(true);
      expect(staffLv('assistant')).toBe(3);
      const p = S.players[S.teams.T1.lineup.Mid!];
      const sum = () => p.stats.awareness + p.stats.judgment;
      const before = sum();
      setDev(p.id, 'macro');
      for (let i = 0; i < 120; i++) devDay();
      expect(sum()).toBeGreaterThan(before);
      const bench = S.teams.T1.roster.map((id) => S.players[id]).find((x) => !Object.values(S.teams.T1.lineup).includes(x.id));
      if (bench) {
        const to = loanTargets(bench)[0];
        if (to) { expect(loanOut(bench.id, to)).toBe(true); expect(bench.teamId).toBe(to); S.season++; returnLoans(); expect(bench.teamId).toBe('T1'); S.season--; }
      }
      const rep = scoutReport('Gen.G');
      expect(rep.players.length).toBe(5);
      expect(rep.bans.length).toBeGreaterThan(0);
      const d = demandOf(p, 'T1');
      expect(propose(p, 'T1', { salary: d.salary * 1.3, years: d.years, role: d.role, clause: null, bonus: true }).verdict).toBe('accept');
    });
  });
});
