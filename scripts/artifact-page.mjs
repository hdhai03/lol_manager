// Tạo dist/artifact.html: bản build dùng gói ảnh nhị phân (cho nơi deploy giới hạn số file, vd. Claude Artifact)
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const out = html.replace('<script type="module"', '<script>window.RIFT_PACK = true; window.RIFT_PACK_EXT = \'png\';</script>\n  <script type="module"');
writeFileSync(new URL('../dist/artifact.html', import.meta.url), out);
console.log('dist/artifact.html');
