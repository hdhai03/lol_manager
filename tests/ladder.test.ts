import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadDb } from './helpers';
import { createGame, type GameState } from '../src/engine';
import { withState, S } from '../src/engine/state';
import { ensureSoloq, ladder, soloqDay, soloqNewSeason, recruitable, inviteToAcademy, academyPlayers, syncReal } from '../src/engine/academy';
import { setLadderData, type LadderData } from '../src/engine/ladder';

let st: GameState;
const ld: LadderData = JSON.parse(readFileSync('public/data/ladder.json', 'utf8'));
beforeAll(() => { loadDb(); setLadderData(ld); st = createGame({ teamId: 'T1', manager: 'Test' }); });

describe('bảng Thách đấu thật (OP.GG)', () => {
  it('gộp tài khoản thật, giữ đúng LP và liên kết tuyển thủ trùng tên', () => withState(st, () => {
    const q = ensureSoloq();
    expect(q.realAt).toBe(ld.fetched);
    const kr = ladder('KR');
    const real = kr.filter((a) => a.real);
    expect(real.length).toBe(ld.servers.KR.length);
    expect(Math.max(...real.map((a) => a.lp))).toBe(Math.max(...ld.servers.KR.map((r) => r.lp)));
    expect(real.some((a) => a.pid)).toBe(true);
    // mỗi tuyển thủ chỉ có một tài khoản trên toàn bộ các máy chủ
    const pids = Object.values(q.servers).flatMap((s) => s.acc.map((a) => a.pid).filter(Boolean));
    expect(new Set(pids).size).toBe(pids.length);
  }));

  it('mô phỏng không đổi số liệu thật; mùa mới không biến tài khoản thật thành tự do', () => withState(st, () => {
    const top = ladder('KR').find((a) => a.real)!;
    const lp = top.lp, w = top.w;
    for (let i = 0; i < 5; i++) soloqDay(new Set());
    expect(top.lp).toBe(lp); expect(top.w).toBe(w);
    const fa = S.freeAgents.length;
    soloqNewSeason();
    expect(ladder('KR').filter((a) => a.real).length).toBe(ld.servers.KR.length);
    const names = new Set(ld.servers.KR.map((r) => r.n));
    expect(S.freeAgents.slice(fa).some((id) => names.has(S.players[id].ign))).toBe(false);
  }));

  it('cao thủ thật không thuộc đội nào mời được về học viện và giữ liên kết khi đồng bộ lại', () => withState(st, () => {
    const q = ensureSoloq();
    const kr = ladder('KR');
    expect(kr.some((a) => a.real && a.pro?.team && recruitable(a))).toBe(false);
    const a = kr.find((x) => x.real && recruitable(x))!;
    expect(a).toBeTruthy();
    S.teams[S.userTeam].budget += 5000;
    const r = inviteToAcademy('KR', a.id);
    expect(r.ok).toBe(true);
    const pid = r.ok ? r.p.id : '';
    expect(academyPlayers().some((p) => p.id === pid)).toBe(true);
    q.realAt = 'force-resync';
    syncReal(q);
    const again = ladder('KR').find((x) => x.id === a.id)!;
    expect(again.pid).toBe(pid);
    expect(recruitable(again)).toBe(false);
  }));
});
