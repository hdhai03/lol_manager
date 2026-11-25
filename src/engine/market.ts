// Thị trường sát thực tế hơn:
// - giải nghệ áp dụng cho mọi đội (ngôi sao chơi lâu hơn), tuyển thủ đội bạn giải nghệ có thông báo
// - đội AI có tài chính (tài trợ − lương), gia hạn theo giá thị trường, chủ động nâng cấp đội hình mùa nghỉ
// - tuyển thủ bất mãn lâu ngày đòi ra đi
// - động lực cá nhân (tiền / danh hiệu / quê nhà / thời gian thi đấu) và đội AI cạnh tranh khi đàm phán
import { S, addNews, userTeam, teamOvr, teamPlayers, teamSalary, autoLineup, refreshValue } from './state';
import { signPlayer, removeFromTeam, askingPrice, renewCost } from './season';
import { clamp, rand, randInt, pick, ROLES } from './util';
import type { Player, Team } from './types';

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// ---------- giải nghệ ----------
export function retireProb(p: Player): number {
  if (p.age < 29) return 0;
  const star = p.ovr >= 86 ? 0.45 : p.ovr >= 80 ? 0.7 : 1;
  return clamp((p.age - 28) * 0.11 * star, 0, 0.9);
}

// ---------- tài chính & gia hạn của đội AI ----------
/** cuối mùa: đội AI nhận tài trợ, trả lương (ngân sách không còn đứng yên) */
export function aiFinanceSeason(seasonDays: number): void {
  const k = clamp(seasonDays, 60, 400) / 50;
  for (const t of Object.values(S.teams)) {
    if (t.id === S.userTeam) continue;
    t.budget = Math.max(300, Math.round(t.budget + (t.sponsor - teamSalary(t)) * k * 0.6));
  }
}
/** gia hạn của đội AI: lương theo giá thị trường; tuyển thủ giỏi hơn hẳn đội có thể từ chối để ra đi */
export function aiRenew(p: Player, y: number): boolean {
  const t = p.teamId ? S.teams[p.teamId] : null;
  if (!t) return false;
  const outgrown = p.ovr - teamOvr(t) >= 6 && p.age <= 26;
  if (rand() > (outgrown ? 0.35 : 0.72)) return false;
  p.salary = renewCost(p);
  p.contractUntil = y + randInt(1, 3);
  return true;
}

// ---------- đội AI nâng cấp đội hình ----------
const weakestStarter = (t: Team): Player | null => {
  const ps = ROLES.map((r) => (t.lineup[r] ? S.players[t.lineup[r]!] : null)).filter(Boolean) as Player[];
  return ps.sort((a, b) => a.ovr - b.ovr)[0] ?? null;
};
/** mùa nghỉ: mỗi đội AI thử thay người đá chính yếu nhất (tự do trước, mua từ đội khác sau) */
export function aiOffseason(): void {
  const moves: string[] = [];
  const teams = Object.values(S.teams).filter((t) => t.id !== S.userTeam).sort(() => rand() - 0.5);
  for (const t of teams) {
    if (rand() > 0.6) continue;
    const w = weakestStarter(t);
    if (!w) continue;
    const role = w.role;
    // 1) tự do
    const fa = S.freeAgents.map((id) => S.players[id]).filter((p) => p && !p.retired && p.role === role && p.ovr >= w.ovr + 3 && p.salary * 1.4 < t.budget)
      .sort((a, b) => b.ovr + (b.homeLeague === t.league ? 2 : 0) - (a.ovr + (a.homeLeague === t.league ? 2 : 0)))[0];
    let got: Player | null = null;
    if (fa) {
      fa.salary = renewCost(fa);
      signPlayer(t, fa, S.season + 1 + randInt(1, 2));
      got = fa;
    } else {
      // 2) mua từ đội yếu hơn (không đụng đội người chơi)
      const tgt = Object.values(S.players).filter((p) => p.teamId && p.teamId !== t.id && p.teamId !== S.userTeam && !p.retired && p.role === role && p.ovr >= w.ovr + 4
        && teamOvr(S.teams[p.teamId]) < teamOvr(t) + 2 && askingPrice(p) <= t.budget * 0.55).sort((a, b) => b.ovr - a.ovr)[0];
      if (tgt) {
        const seller = S.teams[tgt.teamId!];
        const fee = askingPrice(tgt);
        t.budget -= fee; seller.budget += fee;
        signPlayer(t, tgt, S.season + 1 + randInt(1, 2));
        // bên bán lấp chỗ trống bằng tự do
        if (!teamPlayers(seller).some((x) => x.role === role)) {
          const rep = S.freeAgents.map((id) => S.players[id]).filter((x) => x && x.role === role).sort((a, b) => b.ovr - a.ovr)[0];
          if (rep) signPlayer(seller, rep, S.season + 2);
        }
        autoLineup(seller);
        got = tgt;
        if (tgt.ovr >= 80) moves.push(`${tgt.ign} → ${t.short}`);
      }
    }
    if (!got) continue;
    // người bị thay: dự bị, hoặc ra đi nếu đội đông
    if (t.roster.length > 7) { removeFromTeam(w); S.freeAgents.push(w.id); }
    autoLineup(t);
    if (fa && fa.ovr >= 80) moves.push(`${fa.ign} → ${t.short}`);
  }
  if (moves.length) addNews('news.aiMoves', { list: moves.slice(0, 6).join(', '), n: moves.length }, true);
}

// ---------- tuyển thủ bất mãn ----------
/** mỗi ngày: tinh thần thấp kéo dài → đòi ra đi; được cải thiện thì rút lại */
export function unrestDay(): void {
  for (const p of teamPlayers(userTeam())) {
    const m = p.morale ?? 70;
    p.unrest = clamp((p.unrest ?? 0) + (m < 35 ? 1 : m > 55 ? -1 : 0), 0, 30);
    if (!p.wantsOut && p.unrest >= 10) {
      p.wantsOut = true;
      addNews('news.wantsOut', { player: p.ign }, true);
    } else if (p.wantsOut && p.unrest === 0) {
      p.wantsOut = false;
      addNews('news.staysHappy', { player: p.ign }, true);
    }
    // đòi đi: đồng đội cũng ảnh hưởng, đội khác ngửi thấy cơ hội
    if (p.wantsOut) {
      p.form = clamp((p.form || 0) - 0.03, -5, 5);
      if (rand() < 0.04) {
        const buyers = Object.values(S.teams).filter((x) => x.id !== S.userTeam && x.budget > p.value * 0.7);
        if (buyers.length && !(S.offers || []).some((o) => o.pid === p.id)) {
          const b = pick(buyers);
          (S.offers ??= []).push({ id: 'w' + randInt(1e5, 1e6), pid: p.id, from: b.id, amount: Math.round(p.value * (0.7 + rand() * 0.3)), day: S.day });
          addNews('news.offer', { player: p.ign, team: b.name }, true);
        }
      }
    }
  }
}

// ---------- động lực cá nhân & cạnh tranh ----------
export type Ambition = 'money' | 'winner' | 'home' | 'play';
export const AMBITIONS: Ambition[] = ['money', 'winner', 'home', 'play'];
export function ambitionOf(p: Player): Ambition {
  if (p.age >= 27 && p.ovr >= 80) return hash(p.id) % 3 === 0 ? 'home' : 'winner';
  return AMBITIONS[hash(p.id + 'amb') % 4];
}
/** điểm cộng/trừ theo động lực khi về đội t (dùng trong mức hài lòng đàm phán) */
export function ambitionFit(p: Player, t: Team, starter: boolean): number {
  const a = ambitionOf(p);
  let s = 0;
  if (a === 'winner') s += clamp((teamOvr(t) - p.ovr + 2) / 40, -0.12, 0.12);
  if (a === 'home') s += p.homeLeague === t.league ? 0.1 : -0.07;
  if (a === 'play') s += starter ? 0.07 : -0.1;
  return +s.toFixed(3);
}
/** đội AI đang theo đuổi tuyển thủ tự do / sắp hết hợp đồng (chỉ tuyển thủ khá trở lên) */
export function rivalSuitor(p: Player): { team: string; pull: number } | null {
  if (p.ovr < 76 || p.teamId === S.userTeam) return null;
  S.suitors ??= {};
  const cur = S.suitors[p.id];
  if (cur && S.day - cur.day <= 10) return cur.team ? { team: cur.team, pull: cur.pull } : null;
  const need = Object.values(S.teams).filter((t) => t.id !== S.userTeam && t.id !== p.teamId && t.budget > p.salary * 1.5)
    .map((t) => {
      const w = teamPlayers(t).filter((x) => x.role === p.role).sort((a, b) => b.ovr - a.ovr)[0];
      return { t, gap: p.ovr - (w?.ovr ?? 60) };
    }).filter((x) => x.gap >= 2).sort((a, b) => b.gap - a.gap);
  if (!need.length || rand() < 0.35) { S.suitors[p.id] = { team: '', pull: 0, day: S.day }; return null; }
  const t = need[0].t;
  // sức hút của đội đối thủ (tương đương mức hài lòng với lời đề nghị đúng yêu cầu)
  const pull = +clamp(1 + ambitionFit(p, t, true) + (teamOvr(t) - 75) / 200 + rand() * 0.05, 0.95, 1.2).toFixed(3);
  S.suitors[p.id] = { team: t.id, pull, day: S.day };
  return { team: t.id, pull };
}
