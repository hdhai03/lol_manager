// Nạp dữ liệu tĩnh từ public/data cho test chạy bằng Node
import { readFileSync } from 'node:fs';
import { initDb } from '../src/engine';

let loaded = false;
export function loadDb(): void {
  if (loaded) return;
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'));
  initDb({ leagues: read('leagues'), teams: read('teams'), players: read('players'), champions: read('champions'), items: read('items'), meta: read('meta'), images: null, opgg: read('opgg') });
  loaded = true;
}
