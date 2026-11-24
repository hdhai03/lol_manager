// Các tác vụ giả lập nặng, dùng chung cho luồng chính và Web Worker.
import { S } from './state';
import { advanceDay, userMatchToday, startNewSeason } from './season';

export type SimKind = 'advance' | 'simnext' | 'newseason';

/** chạy trên trạng thái hiện tại (S) */
export function runSimTask(kind: SimKind): void {
  if (kind === 'advance') advanceDay();
  else if (kind === 'simnext') {
    const phase = S.phase;
    for (let i = 0; i < 300 && S.phase === phase && !userMatchToday(); i++) advanceDay();
  } else {
    startNewSeason();
    S.seasonStartDay = S.day;
  }
}
