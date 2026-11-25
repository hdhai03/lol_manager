// Đo cân bằng "thế giới" qua nhiều mùa (chỉ chạy khi WORLD=1): kinh tế, độ mạnh, chuyển nhượng, giải nghệ, tỉ lệ cửa trên thắng.
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadDb } from './helpers';
import { createGame, simSeason, startNewSeason, type GameState } from '../src/engine';
import { withState, teamOvr, teamPlayers, teamSalary } from '../src/engine/state';
import { importsIn } from '../src/engine/squad2';

const SEASONS = Number(process.env.SEASONS || 4);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

describe.skipIf(!process.env.WORLD)('cân bằng thế giới', () => {
  it('mô phỏng nhiều mùa', () => {
    loadDb();
    const st: GameState = createGame({ teamId: process.env.TEAM || 'KT Rolster', manager: 'Bal' });
    const rows: Record<string, unknown>[] = [];
    const snap = (label: string) => withState(st, () => {
      const teams = Object.values(st.teams);
      const starters = teams.flatMap((t) => Object.values(t.lineup).map((id) => st.players[id!]).filter(Boolean));
      const active = Object.values(st.players).filter((p) => !p.retired && p.teamId);
      const ai = teams.filter((t) => t.id !== st.userTeam);
      const newsCount = (k: string) => st.news.filter((n) => n.key === k).length;
      const ms = Object.values(st.comps).filter((c) => c.id.startsWith(`${st.season}-`)).flatMap((c) => c.matches).filter((m) => m.done && m.winner);
      // cửa trên thắng (theo OVR đội hiện tại — xấp xỉ)
      let fav = 0, n = 0;
      for (const m of ms) { const a = teamOvr(st.teams[m.a]), b = teamOvr(st.teams[m.b]); if (Math.abs(a - b) < 2) continue; n++; if ((a > b) === (m.winner === m.a)) fav++; }
      const ut = st.teams[st.userTeam];
      rows.push({
        label, season: st.season,
        starterOvr: r1(avg(starters.map((p) => p.ovr))), top10Ovr: r1(avg(active.map((p) => p.ovr).sort((a, b) => b - a).slice(0, 10))), n90: active.filter((p) => p.ovr >= 90).length,
        starterAge: r1(avg(starters.map((p) => p.age))), teamOvrSpread: r1(Math.max(...teams.map(teamOvr)) - Math.min(...teams.map(teamOvr))),
        aiBudgetMed: Math.round(med(ai.map((t) => t.budget))), aiBudgetMin: Math.round(Math.min(...ai.map((t) => t.budget))), aiBudgetMax: Math.round(Math.max(...ai.map((t) => t.budget))),
        aiSalaryVsSponsor: r1(avg(ai.map((t) => teamSalary(t) / Math.max(1, t.sponsor)))),
        userBudget: Math.round(ut.budget), userSalary: Math.round(teamSalary(ut)), userSponsor: Math.round(ut.sponsor), userOvr: teamOvr(ut),
        conf: Math.round(st.career?.conf ?? -1), rep: Math.round(st.career?.rep ?? -1), sacked: !!st.career?.sacked,
        favWin: n ? r1((fav / n) * 100) : null, series: ms.length,
        freeAgents: st.freeAgents.length, players: Object.keys(st.players).length,
        importViol: teams.filter((t) => importsIn(t).length > 2).length,
        retiredNews: newsCount('news.retireStar') + newsCount('news.retireMine'), aiMoves: newsCount('news.aiMoves'), transfers: newsCount('news.transfer'),
        morale: r1(avg(active.map((p) => p.morale ?? 70))), wantsOut: active.filter((p) => p.wantsOut).length, injured: active.filter((p) => p.injury).length,
        rosterMin: Math.min(...teams.map((t) => teamPlayers(t).length)), worlds: st.history.filter((h) => h.title.startsWith('Worlds')).map((h) => h.champ).slice(-1)[0],
        fans: st.brand?.fans, sizeKB: Math.round(JSON.stringify(st).length / 1024),
      });
    });
    snap('start');
    for (let i = 0; i < SEASONS; i++) {
      simSeason(st); snap('end');
      startNewSeason(st); snap('new');
    }
    writeFileSync(process.env.OUT || 'world.json', JSON.stringify(rows, null, 1));
    console.table(rows.map((r) => ({ ...r })));
  }, 3_600_000);
});
