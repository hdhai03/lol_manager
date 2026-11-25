// Hàm tiện ích cho giao diện (không vẽ): định dạng, tiêu đề giải, việc trong ngày, tin tức...
import { DB } from '../engine/data';
import { S, userTeam, teamPlayers } from '../engine/state';
import { standings, userMatchToday, nextUserMatch, seasonDate } from '../engine/season';
import { ROLES, money } from '../engine/util';
import { t, getLang } from '../i18n';
import type { Comp, DailyTask, NewsItem, Player, SeasonStats } from '../engine/types';

export const vClass = (v: number): string => (v >= 88 ? 's' : v >= 80 ? 'a' : v >= 70 ? 'b' : v >= 60 ? 'c' : 'd');
export const pct = (x: number, d = 0): string => `${(x * 100).toFixed(d)}%`;
export const fullMoney = (k: number): string => `${k < 0 ? '-' : ''}$ ${Math.round(Math.abs(k) * 1000).toLocaleString('en-US')}`;
export const kfmt = (n: number): string => (n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n));
export const hash = (s: string): number => [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7);
export const ordn = (n: number): string => (getLang() === 'vi' ? `#${n}` : `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`);

export const compTitle = (c: Comp): string => (c.stage ? `${c.name} · ${t('stage.' + c.stage)}` : `${c.name} ${t('phase.' + c.phase)}`);
export const compLogoId = (c: Comp): string => c.logo || (c.league === 'INTL' ? (c.phase === 'msi' ? 'MSI' : 'WORLDS') : c.league);

export const fmtD = (d: Date, o: Intl.DateTimeFormatOptions): string => d.toLocaleDateString(getLang(), { timeZone: 'UTC', ...o });
/** ngày lịch của một ngày thi đấu tuyệt đối */
export const relDay = (abs: number): Date => seasonDate(abs - (S.seasonStartDay || 0));
export const today = (): Date => relDay(S.day);

/** tướng làm ảnh nền: tướng tủ của ngôi sao đội người chơi */
export function featuredChamp(): string {
  if (S && userTeam()) {
    const star = [...teamPlayers(userTeam())].sort((a, b) => b.ovr - a.ovr)[0];
    if (star && star.pool[0]) return star.pool[0].c;
  }
  return DB.champList.filter((c) => c.tier === 'S').sort((a, b) => b.presence - a.presence)[0].id;
}

export function newsText(n: NewsItem): string {
  const p: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.params || {})) {
    const tv = v as { $t?: string } | null;
    p[k] = tv && typeof tv === 'object' && tv.$t ? t(tv.$t) : k === 'fee' ? money(v as number) : v;
  }
  return t(n.key, p);
}

export type ActKey = 'advance' | 'simnext' | 'match' | 'newseason' | 'save' | 'menu' | 'prevtab' | 'nexttab' | 'training';
export function primaryAction(): { act: ActKey; label: string } {
  if (S.phase === 'offseason') return { act: 'newseason', label: t('top.newSeason') };
  if (userMatchToday()) return { act: 'match', label: t('btn.play') };
  return { act: 'advance', label: t('btn.advance') };
}

// ----- điều hướng 6 mục -----
export const GROUPS: Record<string, string[]> = {
  dashboard: ['dashboard'], inbox: ['inbox'], squad: ['roster', 'tactics', 'practice'], transfers: ['transfers'],
  academy: ['training', 'youth', 'ladder'], office: ['schedule', 'standings', 'power', 'records', 'meta', 'world', 'finance', 'career'],
};
export const TABS = Object.keys(GROUPS);
export const groupOf = (leaf: string): string => TABS.find((g) => GROUPS[g].includes(leaf)) || 'dashboard';
export const unreadCount = (): number => S.news.filter((n) => (n.id || 0) > (S.inboxSeen || 0)).length;

// ----- việc cần làm trong ngày (thay đổi theo ngày, làm xong thì biến mất) -----
export const TASK_TAB: Record<string, string> = { event: 'inbox', training: 'training', squad: 'roster', rest: 'roster', scout: 'youth', tactics: 'tactics', finance: 'finance', lineup: 'roster', gpr: 'power', standings: 'standings' };
export function todayTasks(): DailyTask[] {
  const ut = userTeam();
  if (!S.tasks || S.tasks.day !== S.day) {
    const items: DailyTask[] = [];
    const nm = nextUserMatch();
    const comp = nm && S.comps[nm.comp];
    if (userMatchToday()) items.push({ id: 'match', kind: 'match' });
    if (nm && comp && (comp.league === 'INTL' || ['playoffs', 'rtm', 'playin', 'knockout', 'regional', 'promotion'].includes(comp.stage)) && nm.day - S.day <= 1 && S.tacticsFor !== nm.id) {
      const opp = nm.a === ut.id ? nm.b : nm.a;
      items.push({ id: 'tactics', kind: 'tactics', opp: S.teams[opp].short, mid: nm.id });
    }
    if (S.day - (S.trainingSetDay ?? -99) >= 7) items.push({ id: 'training', kind: 'training' });
    const tired = teamPlayers(ut).filter((p) => Object.values(ut.lineup).includes(p.id) && (p.cond ?? 100) < 62);
    if (tired.length) items.push({ id: 'rest', kind: 'rest', who: tired.map((p) => p.ign).join(', ') });
    if (ut.roster.length < 7 || S.day % 6 === 0) items.push({ id: 'scout', kind: 'scout' });
    if (ut.budget < 0) items.push({ id: 'finance', kind: 'finance' });
    if (S.phase === 'offseason') items.push({ id: 'squad', kind: 'squad' });
    S.tasks = { day: S.day, items, done: [] };
  }
  const offers = (S.offers || []).filter((o) => S.players[o.pid]?.teamId === ut.id);
  const expiring = teamPlayers(ut).filter((p) => p.contractUntil <= S.season && !(S.renewed || []).includes(p.id));
  const T = S.tasks;
  const list = T.items.filter((x) => !T.done.includes(x.id) && !(x.kind === 'match' && !userMatchToday()) && !(x.kind === 'training' && (S.trainingSetDay ?? -99) >= T.day));
  if (offers.length) list.push({ id: 'offers', kind: 'offers', n: offers.length });
  if (S.phase === 'offseason' && expiring.length) list.push({ id: 'renew', kind: 'renew', n: expiring.length });
  if (ROLES.some((r) => !ut.lineup[r])) list.push({ id: 'lineup', kind: 'lineup' });
  const evs = (S.events || []).filter((e) => !e.done).length;
  if (evs) list.unshift({ id: 'event', kind: 'event', n: evs });
  return list;
}
/** đánh dấu xong khi người chơi mở đúng mục liên quan */
export function markTasks(tab: string): void {
  if (!S || !S.tasks) return;
  for (const x of S.tasks.items) if (TASK_TAB[x.kind] === tab && x.kind !== 'training' && !S.tasks.done.includes(x.id)) {
    S.tasks.done.push(x.id);
    if (x.kind === 'tactics') S.tacticsFor = x.mid;
  }
}
export const taskLabel = (x: DailyTask): string => t('task.' + x.kind, { n: x.n, opp: x.opp || '', who: x.who || '' });

// ----- bảng xếp hạng gần nhất của một giải -----
export function currentSplitComp(lg: string): Comp | null {
  const list = Object.values(S.comps).filter((c) => c.id.startsWith(`${S.season}-`) && c.league === lg && c.type !== 'bracket');
  return list[list.length - 1] || null;
}
export function recordOf(teamId: string): { rank: number; w: number; l: number } | null {
  const st = standings(currentSplitComp(S.teams[teamId].league));
  const i = st.findIndex((r) => r.team === teamId);
  return i < 0 ? null : { rank: i + 1, w: st[i].w, l: st[i].l };
}

/** thống kê tích luỹ (mùa/sự nghiệp) từ các trận mô phỏng */
export interface SimLine { g: number; wr: number; kda: string; cspm: string; dpm: number; mvp: number }
export function simLine(st: SeasonStats | undefined): SimLine | null {
  if (!st || !st.g) return null;
  const m = Math.max(st.min || st.g * 30, 1);
  return { g: st.g, wr: st.w / st.g, kda: ((st.k + st.a) / Math.max(st.d, 1)).toFixed(2), cspm: (st.cs / m).toFixed(1), dpm: Math.round((st.dmg || 0) / m), mvp: st.mvp || 0 };
}

export const CC: Record<string, string> = { 'South Korea': 'KR', China: 'CN', Vietnam: 'VN', Taiwan: 'TW', 'Hong Kong': 'HK', Japan: 'JP', Brazil: 'BR', 'United States': 'US', Canada: 'CA', France: 'FR', Germany: 'DE', Spain: 'ES', Denmark: 'DK', Poland: 'PL', Sweden: 'SE', 'United Kingdom': 'GB', Belgium: 'BE', Netherlands: 'NL', Australia: 'AU', Turkey: 'TR', 'Czech Republic': 'CZ', Slovenia: 'SI', Greece: 'GR', Croatia: 'HR', Italy: 'IT', Portugal: 'PT', Argentina: 'AR', Chile: 'CL', Mexico: 'MX', Philippines: 'PH', Thailand: 'TH', Malaysia: 'MY', Singapore: 'SG', Indonesia: 'ID', Macau: 'MO', Ukraine: 'UA', Russia: 'RU', Lithuania: 'LT', Bulgaria: 'BG', Romania: 'RO', Hungary: 'HU', Austria: 'AT', Switzerland: 'CH', Norway: 'NO', Finland: 'FI', Ireland: 'IE', Israel: 'IL', Peru: 'PE', Uruguay: 'UY', Colombia: 'CO' };

export const isMine = (p: Player | null | undefined): boolean => !!p && (p.teamId === S.userTeam || p.academyOf === S.userTeam);
