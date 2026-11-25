// Bản cập nhật trong game: cứ 14 ngày một patch, tăng/giảm sức mạnh vài tướng → meta xoay vòng.
// Ưu tiên giảm sức mạnh tướng đang quá mạnh (tier cao / được chọn-cấm nhiều), tăng cho tướng yếu.
// Tuyển thủ thích nghi tốt bắt meta mới nhanh hơn (xem patchFitBonus).
import { DB } from './data';
import { S, addNews } from './state';
import { clamp, rand, shuffle } from './util';
import { opgg } from './runes';
import type { Player } from './types';

export const PATCH_DAYS = 14;
export interface PatchNote { c: string; d: number }
export function ensurePatch(): NonNullable<typeof S.patch> {
  if (S.patch) return S.patch;
  const base = String(opgg()?.meta.patch || DB.meta.proPatch || '26.1');
  S.patch = { v: base, day: S.day, mods: {}, notes: [], n: 0 };
  return S.patch;
}
export const patchMod = (c: string): number => S.patch?.mods[c] ?? 0;
export const patchVersion = (): string => S.patch?.v || String(opgg()?.meta.patch || DB.meta.proPatch || '');

/** sức mạnh hiện tại của tướng trong meta (dùng để chọn tướng cần chỉnh) */
function strength(id: string): number {
  const c = DB.champions[id];
  const pos = opgg()?.champs[id];
  const bestTier = pos ? Math.min(...Object.values(pos).map((x) => x?.tier ?? 5)) : 5;
  return (c?.power ?? 50) / 100 + (3 - bestTier) * 0.12 + (c?.presence ?? 0) * 0.6 + patchMod(id) * 6;
}
/** bộ chỉnh sửa cho bản kế tiếp (tăng cho tướng yếu, giảm cho tướng quá mạnh) */
function genNotes(): PatchNote[] {
  const ranked = DB.champList.map((c) => c.id).sort((a, b) => strength(b) - strength(a));
  const nerfs = shuffle(ranked.slice(0, 14)).slice(0, 3 + (rand() < 0.5 ? 1 : 0));
  const buffs = shuffle(ranked.slice(Math.floor(ranked.length * 0.45))).slice(0, 3 + (rand() < 0.5 ? 1 : 0));
  return [...nerfs.map((c) => ({ c, d: -+(0.02 + rand() * 0.025).toFixed(3) })), ...buffs.map((c) => ({ c, d: +(0.02 + rand() * 0.025).toFixed(3) }))];
}
const nextV = (v: string) => { const [maj, min] = v.split('.').map((x) => parseInt(x, 10) || 0); return `${maj}.${min + 1}`; };
/** máy chủ thử nghiệm (PBE): một tuần trước khi ra bản mới, mọi người đã biết tướng nào được tăng / bị giảm */
export const PREVIEW_DAYS = 7;
export function patchPreview(): void {
  const P = ensurePatch();
  if (P.next || S.day - P.day < PATCH_DAYS - PREVIEW_DAYS) return;
  const notes = genNotes();
  P.next = { v: nextV(P.v), day: P.day + PATCH_DAYS, notes };
  addNews('news.pbe', { v: P.next.v, buffs: notes.filter((x) => x.d > 0).map((x) => DB.champions[x.c]?.name).join(', '), nerfs: notes.filter((x) => x.d < 0).map((x) => DB.champions[x.c]?.name).join(', '), n: PREVIEW_DAYS }, true);
}
export const upcomingBuffs = (): string[] => (S.patch?.next?.notes || []).filter((x) => x.d > 0).map((x) => x.c);
export function newPatch(): PatchNote[] {
  const P = ensurePatch();
  // chỉnh sửa cũ phai dần
  for (const k of Object.keys(P.mods)) { P.mods[k] = +(P.mods[k] * 0.5).toFixed(4); if (Math.abs(P.mods[k]) < 0.004) delete P.mods[k]; }
  const notes: PatchNote[] = P.next?.notes || genNotes();
  for (const { c, d } of notes) P.mods[c] = +clamp((P.mods[c] || 0) + d, -0.06, 0.06).toFixed(4);
  P.next = undefined;
  P.v = nextV(P.v);
  P.day = S.day; P.n++;
  P.notes = notes;
  P.hist = [{ v: P.v, day: S.day, notes }, ...(P.hist || [])].slice(0, 8);
  addNews('news.patch', { v: P.v, buffs: notes.filter((x) => x.d > 0).map((x) => DB.champions[x.c]?.name).join(', '), nerfs: notes.filter((x) => x.d < 0).map((x) => DB.champions[x.c]?.name).join(', ') }, true);
  return notes;
}
export function patchDay(): void {
  const P = ensurePatch();
  if (S.day - P.day >= PATCH_DAYS) newPatch();
  else patchPreview();
}
/** ngay sau patch, tuyển thủ thích nghi kém chơi tướng vừa bị chỉnh chưa quen (−), thích nghi tốt bắt nhịp nhanh (+) */
export function patchFitBonus(p: Player | null | undefined, c: string): number {
  if (!p || !S.patch) return 0;
  const touched = S.patch.notes.some((x) => x.c === c);
  if (!touched) return 0;
  const fresh = clamp(1 - (S.day - S.patch.day) / PATCH_DAYS, 0, 1);
  return ((p.stats.adaptability ?? 60) - 65) * 0.12 * fresh;
}
