// Giải hạng 2 (đội trẻ / học viện của các CLB): mô phỏng nhẹ theo sức mạnh, mỗi ngày giải chính thi đấu thì hạng 2 đá một vòng Bo3.
import { DB } from './data';
import { S, addNews, teamOvr } from './state';
import { clamp, logistic, rand, shuffle } from './util';
import { academyT2Game } from './staff';

export const T2_NAME: Record<string, string> = { LCK: 'LCK Challengers', LPL: 'LDL', LEC: 'EMEA Regional Leagues', LCS: 'NACL', LCP: 'LCP Academy', CBLOL: 'CBLOL Academy', VCS: 'VCS Challengers' };

function academyOvr(parent: string): number {
  if (parent === S.userTeam) {
    // đội học viện của người chơi: dùng các tuyển thủ học viện thật (+ dự bị)
    const ps = Object.values(S.players).filter((p) => !p.retired && p.academyOf === parent);
    if (ps.length >= 3) return ps.reduce((s, p) => s + p.ovr, 0) / ps.length + 2;
  }
  return clamp(teamOvr(S.teams[parent]) - 13 + (rand() - 0.5) * 8, 50, 85);
}
export function ensureT2(): NonNullable<typeof S.t2> {
  if (S.t2) return S.t2;
  S.t2 = {};
  for (const lg of DB.leagues) {
    const teams = Object.values(S.teams).filter((t) => t.league === lg.id);
    if (teams.length < 4) continue;
    S.t2[lg.id] = { name: T2_NAME[lg.id] || `${lg.id} Academy`, teams: teams.map((t) => ({ id: `${t.id}~A`, name: `${t.name} Academy`, short: `${t.short}.A`, parent: t.id, ovr: +academyOvr(t.id).toFixed(1), w: 0, l: 0, gw: 0, gl: 0 })) };
  }
  return S.t2;
}
export function t2Day(playing: Set<string>): void {
  const all = ensureT2();
  for (const [lg, L] of Object.entries(all)) {
    // chỉ thi đấu vào ngày giải chính cùng khu vực có trận
    if (!L.teams.some((x) => playing.has(x.parent))) continue;
    const order = shuffle([...L.teams]);
    for (let i = 0; i + 1 < order.length; i += 2) {
      const a = order[i], b = order[i + 1];
      // phong độ ngày đấu + đội học viện của người chơi cập nhật theo học viện thật
      if (a.parent === S.userTeam) a.ovr = +academyOvr(a.parent).toFixed(1);
      if (b.parent === S.userTeam) b.ovr = +academyOvr(b.parent).toFixed(1);
      let wa = 0, wb = 0;
      while (wa < 2 && wb < 2) { if (rand() < logistic((a.ovr - b.ovr) / 5 + (rand() - 0.5) * 0.3)) wa++; else wb++; }
      a.gw += wa; a.gl += wb; b.gw += wb; b.gl += wa;
      if (wa > wb) { a.w++; b.l++; } else { b.w++; a.l++; }
      if (a.parent === S.userTeam) academyT2Game(wa > wb, wa + wb);
      if (b.parent === S.userTeam) academyT2Game(wb > wa, wa + wb);
    }
    void lg;
  }
}
export const t2Table = (lg: string) => [...(ensureT2()[lg]?.teams || [])].sort((a, b) => b.w - a.w || (b.gw - b.gl) - (a.gw - a.gl) || b.ovr - a.ovr);
export function t2NewSeason(): void {
  if (!S.t2) return;
  for (const [lg, L] of Object.entries(S.t2)) {
    const top = t2Table(lg)[0];
    if (top && top.w) {
      L.champ = top.id;
      if (top.parent === S.userTeam) addNews('news.t2Champ', { league: L.name, team: top.name }, true);
    }
  }
  S.t2 = undefined;
  ensureT2();
}
