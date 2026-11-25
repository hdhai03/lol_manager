// Meta xếp hạng (OP.GG) + bảng ngọc.
// - opggAdj: tướng mạnh trong meta (tier cao, tỉ lệ thắng cao ở vị trí đó) được cộng nhẹ sức mạnh.
// - pickRunes: mỗi tuyển thủ chọn bảng ngọc cho tướng/vị trí của mình. Người đọc meta tốt chọn đúng trang phổ biến
//   (cộng tỉ lệ thắng); người sáng tạo có thể đổi ngọc chính theo lối chơi (vẫn giữ nhánh meta) – hợp lối chơi thì còn mạnh hơn;
//   người kém thích nghi đôi khi chọn trang lệch meta (bị trừ).
import { DB } from './data';
import { clamp, rand, weighted } from './util';
import type { Player, Role } from './types';

export interface OpggPage { p: number; pr: number[]; s: number; sr: number[]; sh: number[]; wr: number; pick: number; play?: number }
export interface OpggPos { tier: number; rank: number; wr: number; pr: number; br: number; play: number; rr: number; counters: string[]; runes: OpggPage[] }
export interface RuneStyle { id: number; key: string; name: string; nameVi: string; slots: { id: number; key: string; name: string; nameVi: string }[][] }
export interface Opgg {
  meta: { source: string; region: string; tier: string; patch?: string; matches?: number; analyzedAt?: string; fetched?: string; live?: boolean };
  styles: RuneStyle[]; shards: Record<string, [string, string]>; champs: Record<string, Partial<Record<Role, OpggPos>>>; keys?: Record<string, number>;
}
export type RuneKind = 'meta' | 'alt' | 'custom' | 'off';
export interface RunePick { p: number; pr: number[]; s: number; sr: number[]; sh: number[]; kind: RuneKind; bonus: number; wr?: number }

export const opgg = (): Opgg | null => (DB as unknown as { opgg?: Opgg | null }).opgg ?? null;

// đặc tính ngọc chính: a = độ hung hăng (+ đầu trận), s = thiên về cuối trận
export const KS: Record<number, { a: number; s: number }> = {
  8005: { a: 0.3, s: 0.2 }, 8008: { a: 0, s: 0.8 }, 8021: { a: -0.6, s: 0.5 }, 8010: { a: 0.5, s: 0.4 },
  8112: { a: 0.9, s: -0.3 }, 8128: { a: 0.6, s: 0.3 }, 9923: { a: 1, s: -0.5 },
  8351: { a: -0.3, s: 0.2 }, 8360: { a: -0.2, s: 0.4 }, 8369: { a: 0.4, s: 0.1 },
  8437: { a: 0.3, s: 0.6 }, 8439: { a: 0.6, s: 0 }, 8465: { a: -0.6, s: 0 },
  8214: { a: -0.2, s: 0.1 }, 8229: { a: 0.4, s: 0 }, 8230: { a: -0.4, s: 0.1 }, 8992: { a: 0.5, s: 0.2 },
};
// trang mặc định theo lớp tướng khi không có dữ liệu
const CLASS_PAGE: Record<string, Omit<OpggPage, 'wr' | 'pick'>> = {
  Fighter: { p: 8000, pr: [8010, 9111, 9104, 8299], s: 8400, sr: [8444, 8242], sh: [5005, 5008, 5011] },
  Tank: { p: 8400, pr: [8437, 8446, 8429, 8451], s: 8300, sr: [8304, 8347], sh: [5005, 5011, 5013] },
  Assassin: { p: 8100, pr: [8112, 8139, 8140, 8106], s: 8200, sr: [8226, 8210], sh: [5008, 5008, 5001] },
  Mage: { p: 8200, pr: [8229, 8226, 8210, 8237], s: 8100, sr: [8139, 8106], sh: [5008, 5008, 5001] },
  Marksman: { p: 8000, pr: [8008, 9111, 9104, 8014], s: 8100, sr: [8139, 8135], sh: [5005, 5008, 5001] },
  Support: { p: 8400, pr: [8439, 8463, 8473, 8242], s: 8300, sr: [8345, 8347], sh: [5008, 5011, 5001] },
};

export const styleOf = (id: number): RuneStyle | undefined => opgg()?.styles.find((s) => s.id === id);
export function runeName(id: number, vi: boolean): string {
  for (const st of opgg()?.styles || []) {
    if (st.id === id) return vi ? st.nameVi : st.name;
    for (const sl of st.slots) for (const r of sl) if (r.id === id) return vi ? r.nameVi : r.name;
  }
  const sh = opgg()?.shards[id];
  return sh ? sh[vi ? 1 : 0] : String(id);
}

/** dữ liệu meta xếp hạng của tướng ở vị trí (nếu tướng ít đi vị trí đó thì lấy vị trí chính của tướng) */
export function opggPos(champ: string, role: Role): OpggPos | undefined {
  return opgg()?.champs[champ]?.[role];
}
/** điều chỉnh sức mạnh theo meta xếp hạng: khoảng -0.015 .. +0.02 */
export function opggAdj(champ: string, role: Role): number {
  if (!opgg()) return 0;
  const e = opggPos(champ, role);
  if (!e) return -0.006;
  return clamp((3 - e.tier) * 0.0055 + (e.wr - 0.5) * 0.3, -0.015, 0.02);
}

/** độ đọc meta của tuyển thủ 0..1 */
const metaSense = (p: Player | null | undefined): number => (p ? clamp(((p.stats.adaptability ?? 60) + (p.stats.judgment ?? 60)) / 2 / 100, 0.3, 1) : 0.45);

export function pickRunes(p: Player | null | undefined, champ: string, role: Role): RunePick {
  const c = DB.champions[champ];
  const cls = c?.tags[0] && CLASS_PAGE[c.tags[0]] ? c.tags[0] : 'Fighter';
  const pages = opggPos(champ, role)?.runes?.length ? opggPos(champ, role)!.runes : Object.values(opgg()?.champs[champ] || {}).find((x) => x?.runes?.length)?.runes || [];
  const sense = metaSense(p);
  const aggr = p ? ((p.stats.aggression ?? 60) - 60) / 40 : 0; // -1..1
  const crea = p ? (p.stats.creativity ?? 60) / 100 : 0.5;
  if (!pages.length) return { ...CLASS_PAGE[cls], kind: 'meta', bonus: 0.004 };
  // kém đọc meta: thỉnh thoảng lắp trang lệch (trang mặc định của lớp tướng)
  if (rand() < (1 - sense) * 0.22) return { ...CLASS_PAGE[cls], kind: 'off', bonus: -0.008 };
  // sáng tạo: đổi ngọc chính sang ngọc cùng nhánh hợp lối chơi
  const top = pages[0];
  if (rand() < Math.max(0, crea - 0.62) * 1.4) {
    const st = styleOf(top.p);
    const options = (st?.slots[0] || []).map((r) => r.id).filter((id) => id !== top.pr[0] && KS[id]);
    if (options.length) {
      const fit = (id: number) => 1 - Math.abs(KS[id].a - aggr) / 2; // 0..1: ngọc khớp độ hung hăng
      const best = options.sort((a, b) => fit(b) - fit(a))[0];
      const gain = fit(best) - fit(top.pr[0]);
      return { ...top, pr: [best, ...top.pr.slice(1)], kind: 'custom', bonus: +(0.004 + gain * 0.02 + (crea - 0.6) * 0.02).toFixed(4), wr: top.wr };
    }
  }
  // chọn theo mức phổ biến, người đọc meta tốt bám sát trang số 1
  const i = pages.length === 1 ? 0 : pages.indexOf(weighted(pages, pages.map((x, k) => (k === 0 ? 0.4 + sense : x.pick + 0.05))));
  const pg = pages[i];
  const bonus = (i === 0 ? 0.012 : 0.007) + (pg.wr - 0.5) * 0.35 + (KS[pg.pr[0]] ? (1 - Math.abs(KS[pg.pr[0]].a - aggr) / 2 - 0.5) * 0.006 : 0);
  return { p: pg.p, pr: pg.pr, s: pg.s, sr: pg.sr, sh: pg.sh, kind: i === 0 ? 'meta' : 'alt', bonus: +clamp(bonus, -0.01, 0.03).toFixed(4), wr: pg.wr };
}

/** tier list theo vị trí: S..D từ tier OP.GG (1..5) */
export const TIER_L = ['S', 'A', 'B', 'C', 'D'];
export function tierList(role: Role): { id: string; e: OpggPos }[] {
  const o = opgg();
  if (!o) return [];
  return Object.entries(o.champs).flatMap(([id, pos]) => (pos[role] && DB.champions[id] ? [{ id, e: pos[role]! }] : [])).sort((a, b) => a.e.tier - b.e.tier || a.e.rank - b.e.rank);
}
