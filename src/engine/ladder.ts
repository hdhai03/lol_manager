// Bảng xếp hạng đơn thật từ OP.GG (top 100 mỗi máy chủ; OP.GG không có máy chủ Trung Quốc).
// Bản chụp kèm game: public/data/ladder.json (scripts/fetch-ladder.mjs). Khi mở game (tối đa 6 giờ/lần) tự lấy bản mới.
import { DB } from './data';

export interface LadderPro { nick: string; team: string; pos: string }
export interface LadderRow { r: number; n: string; tag: string; lp: number; tier: string; w: number; l: number; ch: Record<string, number>; pro: LadderPro | null }
export interface LadderData { fetched: string; source: string; servers: Record<string, LadderRow[]> }

const CODES: Record<string, string> = { KR: 'kr', EUW: 'euw', NA: 'na', TW: 'tw', VN: 'vn', BR: 'br' };
const KEY = 'lolm_ladder';
let LD: LadderData | null = null;
export const ladderData = (): LadderData | null => LD;
/** dùng cho test */
export const setLadderData = (d: LadderData | null): void => { LD = d; };

function cached(): LadderData | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
/** nạp bản chụp kèm game, lấy bản đã lưu nếu mới hơn */
export async function loadLadder(): Promise<void> {
  let snap: LadderData | null = null;
  try { const r = await fetch('data/ladder.json'); snap = r.ok ? await r.json() : null; } catch { snap = null; }
  const c = cached();
  LD = c && (!snap || c.fetched > snap.fetched) ? c : snap;
}

function compact(data: unknown[], byKey: Record<number, string>): LadderRow[] {
  return (data as Record<string, any>[]).map((e) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const s = e.summoner || {};
    const ls = (s.league_stats || []).find((x: { game_type: string }) => x.game_type === 'SOLORANKED') || {};
    const pt = s.player?.current_pro_team;
    const pro = s.player ? { nick: String(s.player.nickname || ''), team: pt ? String(pt.pro_team?.acronym || pt.pro_team?.name || '') : '', pos: pt ? String(pt.position || '') : '' } : null;
    const ch: Record<string, number> = {};
    for (const c of (s.most_champions?.champion_stats || []).slice(0, 4)) if (byKey[c.id]) ch[byKey[c.id]] = c.play;
    return { r: e.rank, n: String(s.game_name || '?'), tag: String(s.tagline || ''), lp: ls.tier_info?.lp ?? 0, tier: String(ls.tier_info?.tier || '').toLowerCase(), w: ls.win ?? 0, l: ls.lose ?? 0, ch, pro };
  });
}

/** lấy top Thách đấu mới nhất của 6 máy chủ; trả về true nếu có dữ liệu mới */
export async function refreshLadder(force = false): Promise<boolean> {
  const c = LD;
  if (!force && c && Date.now() - Date.parse(c.fetched) < 6 * 3600e3) return false;
  const keys = (DB as unknown as { opgg?: { keys?: Record<string, number> } | null }).opgg?.keys || {};
  const byKey: Record<number, string> = Object.fromEntries(Object.entries(keys).map(([id, k]) => [k, id]));
  if (!Object.keys(byKey).length) for (const ch of Object.values(DB.champions || {})) { const k = Number((ch as { key?: string | number }).key); if (k) byKey[k] = ch.id; }
  const servers: Record<string, LadderRow[]> = { ...(c?.servers || {}) };
  let got = 0;
  await Promise.all(Object.entries(CODES).map(async ([sv, code]) => {
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch(`https://lol-api-summoner.op.gg/api/${code}/rankings/ladder?page=1`, { signal: ctl.signal });
      clearTimeout(tm);
      if (!r.ok) return;
      const rows = compact((await r.json()).data || [], byKey);
      if (rows.length) { servers[sv] = rows; got++; }
    } catch { /* mạng lỗi: giữ bản cũ */ }
  }));
  if (!got) return false;
  LD = { fetched: new Date().toISOString(), source: 'OP.GG', servers };
  try { localStorage.setItem(KEY, JSON.stringify(LD)); } catch { /* đầy bộ nhớ */ }
  return true;
}
