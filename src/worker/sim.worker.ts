// Web Worker: giả lập ngày/giai đoạn/mùa mới ngoài luồng giao diện.
import { initDb } from '../engine/data';
import { setState, S } from '../engine/state';
import { runSimTask, type SimKind } from '../engine/simtasks';
import type { GameState } from '../engine/types';

type Msg = { type: 'init'; raw: Parameters<typeof initDb>[0] } | { type: 'sim'; id: number; kind: SimKind; state: GameState };

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'init') { initDb(m.raw); return; }
  try {
    setState(m.state);
    runSimTask(m.kind);
    (self as unknown as Worker).postMessage({ id: m.id, ok: true, state: S });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: m.id, ok: false, error: String(err) });
  }
};
