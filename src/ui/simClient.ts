// Chạy giả lập (qua ngày / tới trận kế / mùa mới) trong Web Worker; không tạo được worker thì chạy ở luồng chính.
import { rawData } from '../engine/data';
import { S, setState, saveGame } from '../engine/state';
import { runSimTask, type SimKind } from '../engine/simtasks';
import { ui, refresh } from './store';
import type { GameState } from '../engine/types';

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const pending = new Map<number, { res: (s: GameState) => void; rej: (e: unknown) => void }>();

function getWorker(): Worker | null {
  if (broken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; state?: GameState; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.res(e.data.state!); else p.rej(new Error(e.data.error));
    };
    worker.onerror = (e) => { e.preventDefault(); fail(new Error('worker')); };
    worker.postMessage({ type: 'init', raw: rawData() });
    return worker;
  } catch { broken = true; return null; }
}
function fail(err: unknown): void {
  broken = true;
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.rej(err);
  pending.clear();
}

function inWorker(kind: SimKind, st: GameState): Promise<GameState> | null {
  const w = getWorker();
  if (!w) return null;
  const id = ++seq;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    try { w.postMessage({ type: 'sim', id, kind, state: st }); } catch (e) { pending.delete(id); fail(e); rej(e); }
  });
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export async function runSim(kind: SimKind): Promise<void> {
  if (ui.busy) return;
  ui.busy = kind;
  refresh();
  await frame();
  try {
    let done = false;
    const job = inWorker(kind, S);
    if (job) {
      try { setState(await job); done = true; } catch { /* worker lỗi: chạy lại ở luồng chính */ }
    }
    if (!done) runSimTask(kind);
    saveGame('auto');
  } finally {
    ui.busy = null;
    refresh();
  }
}
