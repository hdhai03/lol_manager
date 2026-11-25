// Đời sống đội tuyển: độ ăn ý theo cặp, scrim, lệnh leo rank, sự kiện có lựa chọn, thẻ tăng cường.
import { S, addNews, userTeam, teamPlayers } from './state';
import { ROLES, clamp, rand, pick } from './util';
import { autoDraft, simulateGame } from './sim';
import { tierList } from './runes';
import type { Player, Role } from './types';

// ---------- độ ăn ý (chemistry) ----------
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const hash = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** đồng đội cùng đội lúc bắt đầu: đã quen nhau (50-64); người mới về: 34 (đặt khi ký hợp đồng) */
export function chemOf(a: string, b: string): number {
  const k = pairKey(a, b);
  return S.chem?.[k] ?? 50 + (hash(k) % 15);
}
export function addChem(a: string, b: string, d: number): void {
  if (a === b) return;
  S.chem ??= {};
  const k = pairKey(a, b);
  S.chem[k] = +clamp(chemOf(a, b) + d, 15, 99).toFixed(2);
}
const starters = (teamId: string): Player[] => {
  const t = S.teams[teamId];
  return ROLES.map((r) => t.lineup[r]).filter((x): x is string => !!x && !!S.players[x]).map((x) => S.players[x]);
};
export function chemPairs(teamId: string, d: number): void {
  const ps = starters(teamId);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) addChem(ps[i].id, ps[j].id, d);
}
/** độ ăn ý trung bình của từng vị trí với 4 đồng đội đá chính */
export function lineChem(teamId: string): Partial<Record<Role, number>> {
  const t = S.teams[teamId];
  const out: Partial<Record<Role, number>> = {};
  for (const r of ROLES) {
    const a = t.lineup[r];
    if (!a) continue;
    const others = ROLES.filter((x) => x !== r).map((x) => t.lineup[x]).filter(Boolean) as string[];
    out[r] = others.length ? others.reduce((s, b) => s + chemOf(a, b), 0) / others.length : 50;
  }
  return out;
}
export function teamChem(teamId: string): number {
  const v = Object.values(lineChem(teamId));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 50;
}
/** cầu thủ mới về đội: chưa quen ai */
export function chemNewcomer(p: Player, teamId: string): void {
  for (const id of S.teams[teamId].roster) if (id !== p.id) { S.chem ??= {}; S.chem[pairKey(p.id, id)] = 34; }
}

// ---------- thẻ tăng cường ----------
export type BoostKind = 'focus' | 'synergy' | 'meta' | 'fresh' | 'prep';
export const BOOSTS: BoostKind[] = ['focus', 'synergy', 'meta', 'fresh', 'prep'];
export function grantBoost(kind?: BoostKind, why = 'event'): BoostKind | null {
  S.boosts ??= [];
  if (S.boosts.length >= 6) return null;
  const k = kind || pick(BOOSTS);
  S.seqB = (S.seqB || 0) + 1;
  S.boosts.push({ id: 'b' + S.seqB, kind: k, from: why, day: S.day });
  addNews('news.boostGot', { kind: { $t: 'bst.' + k }, why: { $t: 'bst.why.' + why } });
  return k;
}
export function activateBoost(id: string | null): void {
  if (!id) { S.boostActive = null; return; }
  const b = S.boosts?.find((x) => x.id === id);
  if (!b) return;
  S.boostActive = { id: b.id, kind: b.kind };
}
/** hiệu ứng thẻ đang dùng cho đội người chơi (đọc trong engine) */
export function boostMods(): { day: number; chem: number; rune: number; fresh: boolean } {
  const k = S.boostActive?.kind;
  return { day: k === 'focus' ? 1.6 : k === 'prep' ? 0.9 : 0, chem: k === 'synergy' ? 10 : 0, rune: k === 'meta' ? 0.012 : 0, fresh: k === 'fresh' };
}
/** sau ngày thi đấu: thẻ đã dùng bị tiêu hao */
export function consumeBoost(): void {
  if (!S.boostActive) return;
  S.boosts = (S.boosts || []).filter((b) => b.id !== S.boostActive!.id);
  S.boostActive = null;
}

// ---------- lệnh xếp hạng đơn ----------
export type SqOrder = 'rest' | 'normal' | 'grind' | 'pool' | 'duo';
export const SQ_ORDERS: SqOrder[] = ['rest', 'normal', 'grind', 'pool', 'duo'];
export const DUO_OF: Record<Role, Role> = { Top: 'Jungle', Jungle: 'Mid', Mid: 'Jungle', Bot: 'Support', Support: 'Bot' };
export const sqOrder = (pid: string): SqOrder => S.sqOrder?.[pid] || 'normal';
/** số trận thêm/bớt theo lệnh */
export function sqGames(p: Player, n: number): number {
  const o = sqOrder(p.id);
  return o === 'rest' ? 0 : o === 'grind' ? n + 4 : o === 'pool' ? n + 1 : n;
}
/** tướng luyện theo lệnh 'pool': tướng meta của vị trí (OP.GG) */
export function poolChamp(p: Player): string | null {
  const list = tierList(p.role).slice(0, 14);
  return list.length ? pick(list).id : null;
}
/** sau mỗi ngày leo rank: hiệu ứng riêng của lệnh */
export function sqAfter(p: Player, games: number, wins: number): void {
  const o = sqOrder(p.id);
  if (o === 'rest') p.cond = clamp((p.cond ?? 100) + 6, 20, 100);
  if (o === 'grind' && games) p.form = clamp((p.form || 0) + (wins * 2 > games ? 0.06 : -0.03), -5, 5);
  if (o === 'duo' && p.teamId && games) {
    const mate = S.teams[p.teamId].lineup[DUO_OF[p.role]];
    if (mate && mate !== p.id) addChem(p.id, mate, 0.15 * games);
  }
}

// ---------- scrim ----------
export interface ScrimRes { day: number; opp: string; win: boolean; k: [number, number]; mins: number }
export function scrimPartners(): string[] {
  const ut = userTeam();
  const playing = new Set(Object.values(S.comps).flatMap((c) => c.matches.filter((m) => m.day === S.day && !m.done).flatMap((m) => [m.a, m.b])));
  return Object.values(S.teams).filter((t) => t.id !== ut.id && t.league === ut.league && !playing.has(t.id)).map((t) => t.id);
}
/** chạy scrim trong ngày (đội người chơi không có trận) */
export function runScrim(): void {
  const plan = S.scrimPlan;
  if (!plan?.on) return;
  const ut = userTeam();
  const partners = scrimPartners();
  if (!partners.length) return;
  const opp = plan.opp && partners.includes(plan.opp) ? plan.opp : pick(partners);
  const d = autoDraft(ut.id, opp);
  const g = simulateGame(d);
  const win = g.winner === 'B';
  chemPairs(ut.id, 0.7);
  chemPairs(opp, 0.4);
  for (const x of g.players) {
    const p = x.pid ? S.players[x.pid] : undefined;
    if (!p || p.teamId !== ut.id) continue;
    p.cond = clamp((p.cond ?? 100) - 5, 20, 100);
    // thành thạo tướng: scrim tính nửa trận
    const pe = p.pool.find((c) => c.c === x.champ);
    if (pe) { pe.g += 0.5; if (win) pe.w += 0.5; } else p.pool.push({ c: x.champ, g: 0.5, w: win ? 0.5 : 0 });
    p.pool.sort((a, b) => b.g - a.g);
    if (p.pool.length > 12) p.pool.length = 12;
  }
  const res: ScrimRes = { day: S.day, opp, win, k: [g.kills.B, g.kills.R], mins: g.dur };
  S.scrims = [res, ...(S.scrims || [])].slice(0, 10);
  if (win && rand() < 0.12) grantBoost(pick(['prep', 'synergy'] as BoostKind[]), 'scrim');
}

// ---------- sự kiện có lựa chọn ----------
export type EvKind = 'tension' | 'scandal' | 'sick' | 'stream' | 'bootcamp' | 'fanmeet' | 'reschedule';
export const EV_CHOICES: Record<EvKind, string[]> = {
  tension: ['talk', 'bench', 'ignore'], scandal: ['apologize', 'fine', 'defend'], sick: ['rest', 'push'],
  stream: ['accept', 'decline'], bootcamp: ['go', 'skip'], fanmeet: ['attend', 'skip'], reschedule: ['extra', 'rest'],
};
export interface GEvent { id: string; kind: EvKind; day: number; pid?: string; pid2?: string; amount?: number; done?: string; out?: string }
export const pendingEvents = (): GEvent[] => (S.events || []).filter((e) => !e.done);

export function maybeEvent(): void {
  const ut = userTeam();
  const ps = teamPlayers(ut);
  if (!ps.length) return;
  // tự xử lý sự kiện bị bỏ quên quá 4 ngày (lựa chọn cuối = mặc kệ)
  for (const e of pendingEvents()) if (S.day - e.day > 4) resolveEvent(e.id, EV_CHOICES[e.kind][EV_CHOICES[e.kind].length - 1], true);
  if (pendingEvents().length >= 2 || rand() > 0.075) return;
  const st = starters(ut.id);
  const kinds: [EvKind, number][] = [['tension', 1.2], ['scandal', 0.7], ['sick', 0.8], ['stream', 0.8], ['bootcamp', 0.5], ['fanmeet', 0.7], ['reschedule', 0.5]];
  const tot = kinds.reduce((s, k) => s + k[1], 0);
  let r = rand() * tot, kind: EvKind = 'tension';
  for (const [k, w] of kinds) { if ((r -= w) <= 0) { kind = k; break; } }
  S.seqE = (S.seqE || 0) + 1;
  const ev: GEvent = { id: 'e' + S.seqE, kind, day: S.day };
  if (kind === 'tension') {
    if (st.length < 2) return;
    let worst: [string, string] = [st[0].id, st[1].id], lo = 999;
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) { const c = chemOf(st[i].id, st[j].id) + rand() * 8; if (c < lo) { lo = c; worst = [st[i].id, st[j].id]; } }
    [ev.pid, ev.pid2] = worst;
  } else if (kind === 'scandal' || kind === 'sick' || kind === 'stream') ev.pid = pick(st.length ? st : ps).id;
  if (kind === 'stream') ev.amount = Math.round(15 + rand() * 25); // nghìn $
  if (kind === 'bootcamp') ev.amount = Math.round(40 + rand() * 40);
  (S.events ??= []).unshift(ev);
  if (S.events.length > 30) S.events.length = 30;
}

const morale = (p: Player | undefined, d: number) => { if (p) p.morale = clamp((p.morale ?? 70) + d, 20, 100); };
const cond = (p: Player | undefined, d: number) => { if (p) p.cond = clamp((p.cond ?? 100) + d, 20, 100); };
/** xử lý lựa chọn; trả về khoá kết quả (i18n ev.out.*) */
export function resolveEvent(id: string, choice: string, auto = false): string | null {
  const e = (S.events || []).find((x) => x.id === id);
  if (!e || e.done) return null;
  const ut = userTeam();
  const all = teamPlayers(ut);
  const a = e.pid ? S.players[e.pid] : undefined, b = e.pid2 ? S.players[e.pid2] : undefined;
  let out = `${e.kind}.${choice}`;
  switch (`${e.kind}.${choice}`) {
    case 'tension.talk': {
      const lead = Math.max(...all.map((p) => p.stats.leadership ?? 60));
      if (rand() < 0.5 + (lead - 60) / 120) { addChem(a!.id, b!.id, 9); morale(a, 4); morale(b, 4); if (rand() < 0.35) grantBoost('synergy', 'talk'); out += '.ok'; } else { addChem(a!.id, b!.id, -3); out += '.fail'; }
      break;
    }
    case 'tension.bench': morale(a, -12); addChem(a!.id, b!.id, -2); morale(b, 3); break;
    case 'tension.ignore': addChem(a!.id, b!.id, -6); morale(a, -3); morale(b, -3); break;
    case 'scandal.apologize': morale(a, -4); break;
    case 'scandal.fine': morale(a, -10); ut.budget += 20; break;
    case 'scandal.defend': morale(a, 7); if (rand() < 0.4) { ut.sponsor = Math.round(ut.sponsor * 0.95); out += '.lost'; } break;
    case 'sick.rest': cond(a, -10); break;
    case 'sick.push': cond(a, -25); morale(a, -3); if (a && rand() < 0.5) a.form = clamp((a.form || 0) - 1, -5, 5); break;
    case 'stream.accept': ut.budget += e.amount || 0; cond(a, -12); break;
    case 'stream.decline': morale(a, -3); break;
    case 'bootcamp.go': ut.budget -= e.amount || 0; chemPairs(ut.id, 4); all.forEach((p) => morale(p, 4)); grantBoost('focus', 'bootcamp'); break;
    case 'fanmeet.attend': all.forEach((p) => { morale(p, 6); cond(p, -8); }); ut.sponsor = Math.round(ut.sponsor * 1.02); break;
    case 'reschedule.extra': all.forEach((p) => cond(p, -6)); grantBoost('prep', 'reschedule'); break;
    case 'reschedule.rest': all.forEach((p) => cond(p, 10)); break;
    default: break;
  }
  e.done = choice;
  e.out = auto ? out + '.auto' : out;
  return out;
}

/** gọi mỗi ngày (trước khi sang ngày mới) */
export function lifeDay(playing: Set<string>): void {
  // các đội AI cũng dần quen nhau qua tập luyện
  for (const t of Object.values(S.teams)) if (t.id !== S.userTeam) chemPairs(t.id, 0.06);
  if (!playing.has(S.userTeam)) runScrim(); else consumeBoost();
  chemPairs(S.userTeam, 0.04);
  maybeEvent();
}
