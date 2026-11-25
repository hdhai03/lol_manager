// Giải hạng 2 (đội trẻ / học viện của các CLB): mô phỏng nhẹ theo sức mạnh, mỗi ngày giải chính thi đấu thì hạng 2 đá một vòng Bo3.
import { DB } from './data';
import { S, addNews, teamOvr } from './state';
import { clamp, logistic, rand, shuffle } from './util';
import { academyT2Game } from './staff';

export const T2_NAME: Record<string, string> = { LCK: 'LCK Challengers', LPL: 'LDL', LEC: 'EMEA Regional Leagues', LCS: 'NACL', LCP: 'LCP Academy', CBLOL: 'CBLOL Academy', VCS: 'VCS Challengers' };

/** đội hình học viện do HLV chọn (tối đa 5), mặc định 5 người OVR cao nhất */
export function t2Lineup(): string[] {
  const acad = Object.values(S.players).filter((p) => !p.retired && p.academyOf === S.userTeam);
  const pick5 = (S.t2Plan?.line || []).filter((id) => acad.some((p) => p.id === id));
  for (const p of acad.sort((a, b) => b.ovr - a.ovr)) { if (pick5.length >= 5) break; if (!pick5.includes(p.id)) pick5.push(p.id); }
  return pick5.slice(0, 5);
}
export type T2Style = 'aggressive' | 'balanced' | 'safe';
export const t2Plan = (): NonNullable<typeof S.t2Plan> => (S.t2Plan ??= { line: [], style: 'balanced', focus: null, log: [] });
function academyOvr(parent: string): number {
  if (parent === S.userTeam) {
    // đội học viện của người chơi: dùng đúng 5 tuyển thủ HLV chọn
    const ps = t2Lineup().map((id) => S.players[id]);
    if (ps.length >= 3) return ps.reduce((s, p) => s + p.ovr, 0) / ps.length + 2 - (5 - ps.length) * 3;
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
      // lối chơi HLV chọn cho đội học viện: tấn công = biên độ lớn, chắc chắn = biên độ nhỏ
      const st = a.parent === S.userTeam || b.parent === S.userTeam ? t2Plan().style : 'balanced';
      const spread = st === 'aggressive' ? 0.9 : st === 'safe' ? 0.12 : 0.3;
      const tilt = st === 'aggressive' ? 0.6 : st === 'safe' ? 0.2 : 0;
      const me = a.parent === S.userTeam ? 1 : b.parent === S.userTeam ? -1 : 0;
      while (wa < 2 && wb < 2) { if (rand() < logistic((a.ovr - b.ovr) / 5 + me * tilt * 0.3 + (rand() - 0.5) * spread)) wa++; else wb++; }
      if (me) { const opp = me > 0 ? b : a; const L2 = t2Plan(); L2.log = [{ day: S.day, opp: opp.name, my: me > 0 ? wa : wb, th: me > 0 ? wb : wa }, ...L2.log].slice(0, 6); }
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
