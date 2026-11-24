// API công khai của engine: mọi hàm nhận GameState làm tham số đầu tiên.
// Bên trong, engine gắn trạng thái vào ngữ cảnh hiện tại (withState) rồi chạy logic mùa giải/trận đấu,
// nên có thể dùng cùng lúc cho nhiều save, trong test hoặc trong Web Worker.
import { withState, newGame as newGameRaw, migrateState } from './state';
import { startPhase as startPhaseRaw, advanceDay as advanceDayRaw, userMatchToday as userMatchTodayRaw, startNewSeason as startNewSeasonRaw, progressComps as progressCompsRaw } from './season';
import { simulateGame as simulateGameRaw, simSeries as simSeriesRaw, autoDraft as autoDraftRaw, recordGame as recordGameRaw } from './sim';
import { gprTable as gprTableRaw } from './gpr';
import type { Draft, GameResult, GameState, Match, Phase } from './types';

export type * from './types';
export { initDb, DB } from './data';

export function createGame(opts: { teamId: string; manager: string; phase?: Phase }): GameState {
  const st = newGameRaw(opts);
  return withState(st, () => { startPhaseRaw(opts.phase ?? 'kickoff'); return st; });
}
/** chuẩn hoá save cũ sang định dạng hiện tại */
export const migrate = (st: GameState): GameState => withState(st, () => { migrateState(); return st; });
/** qua một ngày (giả lập mọi trận AI hôm nay). Trả về false nếu đội người chơi còn trận hôm nay. */
export const advanceDay = (st: GameState): boolean => withState(st, advanceDayRaw);
export const userMatchToday = (st: GameState): Match | undefined => withState(st, userMatchTodayRaw);
export const startNewSeason = (st: GameState): void => withState(st, startNewSeasonRaw);
export const progressComps = (st: GameState): void => withState(st, progressCompsRaw);
export const simSeries = (st: GameState, m: Match): void => withState(st, () => simSeriesRaw(m));
export const autoDraft = (st: GameState, blue: string, red: string, locked: string[] = []): Draft => withState(st, () => autoDraftRaw(blue, red, locked));
export const simulateGame = (st: GameState, d: Draft, opts: { record?: boolean; series?: number } = {}): GameResult => withState(st, () => simulateGameRaw(d, opts));
export const recordGame = (st: GameState, m: Match, g: GameResult, detailed = false): void => withState(st, () => recordGameRaw(m, g, detailed));
export const powerRankings = (st: GameState) => withState(st, () => gprTableRaw());

/** chạy tới hết pha hiện tại (tự giả lập cả trận của người chơi). Dùng cho test/cân bằng. */
export function simToPhaseEnd(st: GameState, maxDays = 400): void {
  withState(st, () => {
    const ph = st.phase;
    for (let i = 0; i < maxDays && st.phase === ph && st.phase !== 'offseason'; i++) {
      const um = userMatchTodayRaw();
      if (um) simSeriesRaw(um);
      advanceDayRaw();
    }
  });
}
/** chạy hết một mùa (tới kỳ chuyển nhượng) */
export function simSeason(st: GameState): void {
  for (let i = 0; i < 10 && st.phase !== 'offseason'; i++) simToPhaseEnd(st);
}
