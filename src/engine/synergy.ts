// Bản sắc đội hình: combo tướng cụ thể + kiểu đội hình (giao tranh tổng, cấu rỉa, lao vào, bảo kê, đánh nhanh).
// Mỗi bản sắc đạt được cộng một chút sức mạnh cho cả đội trong trận và được AI cấm/chọn tính đến.
import { DB } from './data';

// cặp tướng nổi tiếng (thứ tự không quan trọng)
const PAIRS: [string, string][] = [
  ['Xayah', 'Rakan'], ['Lucian', 'Nami'], ['Kalista', 'Renata'], ['Yasuo', 'Diana'], ['Yasuo', 'Malphite'], ['Yone', 'Gragas'],
  ['JarvanIV', 'Orianna'], ['Kaisa', 'Nautilus'], ['Ezreal', 'Karma'], ['Varus', 'Ashe'], ['Jinx', 'Lulu'], ['Aphelios', 'Thresh'],
  ['Zeri', 'Yuumi'], ['Vi', 'Ahri'], ['Sejuani', 'Azir'], ['MissFortune', 'Leona'], ['Draven', 'Leona'], ['Twitch', 'Lulu'],
  ['Kennen', 'Galio'], ['Nocturne', 'TwistedFate'], ['Caitlyn', 'Lux'], ['Senna', 'TahmKench'], ['KogMaw', 'Lulu'], ['Rumble', 'Orianna'],
];
const ENCHANT = new Set(['Lulu', 'Yuumi', 'Karma', 'Nami', 'Janna', 'Milio', 'Renata', 'Soraka', 'Sona', 'Seraphine']);
const HYPER = new Set(['Jinx', 'KogMaw', 'Twitch', 'Aphelios', 'Zeri', 'Kaisa', 'Vayne', 'Smolder', 'Azir', 'Kassadin']);
const POKE = new Set(['Ezreal', 'Jayce', 'Varus', 'Xerath', 'Ziggs', 'Zoe', 'Lux', 'Caitlyn', 'Hwei', 'Corki', 'Jhin', 'Karma', 'Velkoz', 'Nidalee']);

export type SynKind = 'pair' | 'engage' | 'poke' | 'dive' | 'protect' | 'early';
export interface Syn { kind: SynKind; champs: string[] }

export function synergies(ids: (string | undefined)[]): Syn[] {
  const cs = ids.filter((x): x is string => !!x && !!DB.champions[x]);
  const out: Syn[] = [];
  const has = new Set(cs);
  for (const [a, b] of PAIRS) if (has.has(a) && has.has(b)) out.push({ kind: 'pair', champs: [a, b] });
  const tag = (id: string) => DB.champions[id].tags;
  const tanks = cs.filter((id) => tag(id).includes('Tank'));
  const mages = cs.filter((id) => tag(id)[0] === 'Mage');
  const divers = cs.filter((id) => ['Assassin', 'Fighter'].includes(tag(id)[0]));
  const poke = cs.filter((id) => POKE.has(id));
  if (tanks.length >= 2 && mages.length >= 1) out.push({ kind: 'engage', champs: [...tanks.slice(0, 2), mages[0]] });
  if (poke.length >= 3) out.push({ kind: 'poke', champs: poke.slice(0, 3) });
  if (divers.length >= 3) out.push({ kind: 'dive', champs: divers.slice(0, 3) });
  const hyper = cs.find((id) => HYPER.has(id)), ench = cs.find((id) => ENCHANT.has(id));
  if (hyper && ench) out.push({ kind: 'protect', champs: [hyper, ench] });
  const early = cs.filter((id) => (DB.champions[id].info.attack >= 7 && DB.champions[id].info.difficulty <= 6) || tag(id)[0] === 'Assassin');
  if (early.length >= 3 && !out.some((x) => x.kind === 'protect')) out.push({ kind: 'early', champs: early.slice(0, 3) });
  return out;
}
/** điểm bản sắc (dùng cho AI cấm/chọn) */
export const synergyScore = (ids: (string | undefined)[]): number => synergies(ids).reduce((s, x) => s + (x.kind === 'pair' ? 1.6 : 1), 0);
/** cộng sức mạnh trong trận theo bản sắc: ~+1% mỗi combo, tối đa +3.5% */
export const synergyBonus = (ids: (string | undefined)[]): number => Math.min(0.035, synergies(ids).reduce((s, x) => s + (x.kind === 'pair' ? 0.012 : 0.009), 0));
