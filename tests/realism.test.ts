import { beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from './helpers';
import { createGame, type GameState } from '../src/engine';
import { withState, S, autoLineup, teamPlayers } from '../src/engine/state';
import { importsIn, IMPORT_MAX, isImport, onJoin, adaptDay, setMentor, startSwap, swapDay, lineupOk } from '../src/engine/squad2';
import { ambitionOf, retireProb, aiOffseason, rivalSuitor } from '../src/engine/market';
import { signPlayer } from '../src/engine/season';

let st: GameState;
beforeAll(() => { loadDb(); st = createGame({ teamId: 'T1', manager: 'Test' }); });

describe('độ thực tế: ngoại binh, hòa nhập, kèm cặp, thị trường', () => {
  it('không đội nào vượt quá 2 ngoại binh đá chính, kể cả sau khi tự xếp lại', () => withState(st, () => {
    for (const t of Object.values(S.teams)) { expect(importsIn(t).length).toBeLessThanOrEqual(IMPORT_MAX); autoLineup(t); expect(importsIn(t).length).toBeLessThanOrEqual(IMPORT_MAX); }
  }));

  it('ngoại binh mới về phải hòa nhập dần', () => withState(st, () => {
    const lec = Object.values(S.teams).find((t) => t.league === 'LEC')!;
    const kr = Object.values(S.players).find((p) => p.country === 'South Korea' && p.teamId && S.teams[p.teamId].league === 'LCK' && !Object.values(S.teams[p.teamId].lineup).includes(p.id))!;
    signPlayer(lec, kr, S.season + 2);
    expect(isImport(kr, 'LEC')).toBe(true);
    expect(kr.adapt).toBeLessThan(100);
    const a0 = kr.adapt!;
    for (let i = 0; i < 10; i++) adaptDay();
    expect(kr.adapt ?? 100).toBeGreaterThan(a0);
    const full = { ...lec.lineup };
    const imps = teamPlayers(lec).filter((p) => isImport(p, 'LEC'));
    if (imps.length >= 3) { const line: typeof full = {}; imps.slice(0, 3).forEach((p, i) => { line[(['Top', 'Mid', 'Bot'] as const)[i]] = p.id; }); expect(lineupOk(lec, line)).toBe(false); }
    void onJoin;
  }));

  it('kèm cặp và đổi vị trí', () => withState(st, () => {
    const ps = teamPlayers(S.teams.T1);
    const young = ps.filter((p) => p.age <= 22).sort((a, b) => a.ovr - b.ovr)[0];
    const vet = ps.filter((p) => p.age >= 23 && young && p.ovr >= young.ovr + 4)[0];
    if (young && vet) expect(setMentor(young.id, vet.id)).toBeNull();
    const p = ps[0];
    const to = p.role === 'Mid' ? 'Top' : 'Mid';
    startSwap(p.id, to);
    for (let i = 0; i < 120; i++) swapDay();
    expect(p.role).toBe(to);
  }));

  it('giải nghệ, động lực, AI nâng cấp đội hình', () => withState(st, () => {
    expect(retireProb({ age: 24, ovr: 80 } as never)).toBe(0);
    expect(retireProb({ age: 32, ovr: 90 } as never)).toBeLessThan(retireProb({ age: 32, ovr: 70 } as never));
    expect(['money', 'winner', 'home', 'play']).toContain(ambitionOf(Object.values(S.players)[0]));
    for (let i = 0; i < 6; i++) S.freeAgents.push(...Object.values(S.players).filter((p) => !p.teamId).map((p) => p.id));
    const before = JSON.stringify(Object.values(S.teams).map((t) => t.roster));
    aiOffseason();
    expect(JSON.stringify(Object.values(S.teams).map((t) => t.roster))).not.toBe(before);
    const star = Object.values(S.players).find((p) => p.ovr >= 80 && p.teamId && p.teamId !== 'T1')!;
    const r = rivalSuitor(star);
    expect(r === null || typeof r.pull === 'number').toBe(true);
  }));
});
