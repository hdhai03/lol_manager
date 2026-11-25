// Kiểm tra giao diện tự động (chạy trên CI và máy dev): đi qua mọi trang + một ván đấu ở nhiều cỡ màn hình,
// báo lỗi JavaScript và chữ đè chữ. Cách chạy: npm run build && npx vite preview --port 8765 & node scripts/ui-check.cjs out
// Dò chữ đè chữ: các phần tử có chữ trực tiếp, hiển thị, bị giao nhau đáng kể với phần tử chữ khác.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'ui-check';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8765/';
const SIZES = (process.argv[3] || '1440x900,2000x940,390x844').split(',').map((s) => s.split('x').map(Number));
const detect = () => {
  const vis = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const leaves = [];
  const modal = document.querySelector('.modal-wrap');
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    if (modal && !modal.contains(el)) continue;
    const det = el.closest('details'); if (det && !det.open && !el.closest('summary')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length);
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    // phần tử bị cắt bởi khung cuộn thì bỏ qua nếu nằm ngoài khung
    let clipped = false;
    for (let p = el.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const pr = p.getBoundingClientRect(); if (r.bottom <= pr.top || r.top >= pr.bottom || r.right <= pr.left || r.left >= pr.right) { clipped = true; break; } } }
    if (!clipped) leaves.push({ el, r });
  }
  const name = (el) => (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) + ` "${el.textContent.trim().slice(0, 18)}"`;
  const out = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w <= 2 || h <= 2) continue;
    const area = w * h, small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
    if (area / small > 0.18) out.push(`${name(a.el)} × ${name(b.el)}`);
  }
  return [...new Set(out)].slice(0, 8);
};
(async () => {
  const b = await chromium.launch();
  const all = {};
  const errs = [];
  for (const [w, h] of SIZES) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    p.on('pageerror', (e) => errs.push(`${w}: ${String(e)}`));
    await p.goto(BASE); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lolm_view', '2d'); localStorage.setItem('lolm_speed2', '32'); }); await p.reload(); await p.waitForSelector('.mi');
    const check = async (tag) => { await p.waitForTimeout(650); const r = await p.evaluate(detect); if (r.length) { all[`${w} ${tag}`] = r; await p.screenshot({ path: `${OUT}/ov-${w}-${tag}.png` }); } };
    await check('menu');
    await p.click('[data-act=new]'); await check('league');
    await p.click('[data-lg=LCK]'); await check('team');
    await p.click('[data-start]'); await p.waitForSelector('.home'); await check('home');
    for (const [g, tab] of [['inbox'], ['squad', 'roster'], ['squad', 'tactics'], ['squad', 'practice'], ['transfers'], ['academy', 'training'], ['academy', 'youth'], ['academy', 'ladder'], ['office', 'schedule'], ['office', 'standings'], ['office', 'power'], ['office', 'records'], ['office', 'meta'], ['office', 'world'], ['office', 'finance'], ['office', 'career'], ['office', 'stats'], ['office', 'staff']]) {
      await p.click(`[data-grp=${g}]`); if (tab) await p.click(`.subtabs [data-tab=${tab}]`); await check(tab || g);
    }
    await p.click('[data-grp=transfers]'); await p.click('.pc2'); await check('modal'); await p.click('.modal-x');
    await p.click('[data-grp=dashboard]'); await p.click('.pill[data-act=match]'); await check('pre');
    await p.click('[data-a=manual]'); await check('draft');
    for (let i = 0; i < 80; i++) { if (await p.$('[data-start]')) break; const btn = await p.$('.dr-c:not([disabled])'); if (btn) { await btn.click(); await p.click('[data-confirm]').catch(() => {}); } else await p.waitForTimeout(300); }
    await check('draftdone');
    await p.click('[data-start]'); await p.waitForSelector('.bc'); await p.waitForTimeout(2500); await check('live');
    await p.click('[data-skip]'); await p.waitForSelector('.pg'); await check('post');
    await p.close();
  }
  console.log(JSON.stringify(all, null, 1));
  if (errs.length) console.log('JS errors:\n' + errs.join('\n'));
  await b.close();
  process.exit(Object.keys(all).length || errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
