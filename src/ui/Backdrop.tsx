// Nền động theo chủ đề giải đấu đang diễn ra (vẽ bằng canvas, không cần video):
// CKTG = vàng hextech + lưới lục giác + tàn lửa; MSI = tím/hồng + tia sáng xoay; First Stand = lưới phối cảnh;
// giải khu vực = vệt sáng màu nhận diện của giải. Tôn trọng "giảm chuyển động" và tự dừng khi tab ẩn / đang xem trận.
import { useEffect, useRef } from 'react';
import { champSplash, leagueLogo, src as asset } from '../engine/data';
import { S } from '../engine/state';
import { featuredChamp } from './helpers';

type Motif = 'hex' | 'rays' | 'grid' | 'streaks' | 'calm';
interface Theme { key: string; base: string; cols: string[]; motif: Motif; spark: string; logo: string | null }

const T = (key: string, base: string, cols: string[], motif: Motif, spark: string, logo: string | null = key): Theme => ({ key, base, cols, motif, spark, logo });
const THEMES: Record<string, Theme> = {
  WORLDS: T('WORLDS', '#04060c', ['#c8963c', '#1f5fb0', '#0b2f66', '#f0cf7a'], 'hex', '#f6d27a'),
  MSI: T('MSI', '#07040f', ['#7a3cff', '#ff4fa8', '#2a1670', '#3fd2ff'], 'rays', '#ffd1f0'),
  FST: T('FST', '#03080b', ['#19c8b4', '#6a5cff', '#0b3b4a', '#9af7ff'], 'grid', '#b9fff6', 'FST'),
  LCK: T('LCK', '#04070f', ['#2f6bff', '#9cc3ff', '#0d1f4d', '#ffffff'], 'streaks', '#d8e6ff'),
  LPL: T('LPL', '#0a0405', ['#e0303b', '#f6c143', '#40080f', '#ff8a5c'], 'streaks', '#ffe2a8'),
  LEC: T('LEC', '#030909', ['#18e0cc', '#e8f0f0', '#0a3130', '#7af0ff'], 'streaks', '#d9fffb'),
  LCS: T('LCS', '#03070d', ['#18b6ff', '#4a5dff', '#08284a', '#9be7ff'], 'streaks', '#d5f3ff'),
  LCP: T('LCP', '#0a0606', ['#ff6b3d', '#8a5cff', '#3a1408', '#ffc06b'], 'streaks', '#ffe0c4'),
  CBLOL: T('CBLOL', '#030a05', ['#00c853', '#ffd600', '#083d1c', '#7cffb0'], 'streaks', '#f3ffc4'),
  VCS: T('VCS', '#0b0405', ['#ff2e4d', '#ffb800', '#3d0710', '#ff7a8a'], 'streaks', '#ffe3a0'),
  OFF: T('OFF', '#05080d', ['#2fe3cf', '#3d5a99', '#0b2a33', '#8fb3ff'], 'calm', '#c9fff8', null),
};

/** chủ đề theo giai đoạn hiện tại: sự kiện quốc tế hoặc giải khu vực của đội người chơi */
export function themeKey(): string {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null; // xem thử: ?theme=MSI
  if (q && THEMES[q]) return q;
  if (!S) return 'WORLDS';
  if (S.phase === 'worlds') return 'WORLDS';
  if (S.phase === 'msi') return 'MSI';
  if (S.phase === 'fst') return 'FST';
  if (S.phase === 'offseason') return 'OFF';
  return S.teams[S.userTeam]?.league || 'OFF';
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (h: string, a: number) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };

interface Spark { x: number; y: number; v: number; s: number; a: number; d: number }

export function Backdrop({ champ }: { champ?: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const key = themeKey();
  const theme = THEMES[key] || THEMES.OFF;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const c = cv.current!;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, last = 0;
    const scale = 0.6;
    const resize = () => {
      w = Math.max(1, Math.round(window.innerWidth * scale));
      h = Math.max(1, Math.round(window.innerHeight * scale));
      c.width = w; c.height = h;
    };
    resize();
    window.addEventListener('resize', resize);
    const sparks: Spark[] = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.05, s: 0.6 + Math.random() * 1.8, a: 0.2 + Math.random() * 0.6, d: Math.random() * 6.28 }));

    const draw = (time: number) => {
      const th = themeRef.current;
      const t = time / 1000;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = th.base;
      ctx.fillRect(0, 0, w, h);
      // dải cực quang: các khối màu mềm trôi chậm
      ctx.globalCompositeOperation = 'lighter';
      const blobs = [
        [0.12, 0.18, 0.55, 0.06, 0, 0.55], [0.8, 0.25, 0.5, 0.05, 1.7, 0.45], [0.55, 0.95, 0.6, 0.04, 3.1, 0.4], [0.35, 0.55, 0.35, 0.08, 4.4, 0.28],
      ];
      blobs.forEach(([bx, by, br, sp, ph, al], i) => {
        const x = w * (bx + 0.12 * Math.sin(t * sp * 3 + ph));
        const y = h * (by + 0.1 * Math.cos(t * sp * 2.4 + ph * 1.3));
        const r = Math.max(w, h) * br * (0.9 + 0.1 * Math.sin(t * 0.4 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const col = th.cols[i % th.cols.length];
        g.addColorStop(0, rgba(col, al * 0.5));
        g.addColorStop(0.45, rgba(col, al * 0.16));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = 'source-over';
      // ===== hệ hoạ tiết tam giác (Formation · Trajectory · Momentum) =====
      const tri = (cx: number, cy: number, r: number, rot: number) => {
        ctx.beginPath();
        for (let k = 0; k < 3; k++) { const an = rot + k * 2.0944; const px = cx + r * Math.cos(an), py = cy + r * Math.sin(an); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath();
      };
      // Formation: lưới tam giác bên phải, sáng lên theo làn sóng như đội hình di chuyển
      const R = Math.max(w, h) / 34;
      for (let row = 0; row * R * 0.9 < h + R; row++) {
        for (let col = 0; col * R < w * 0.62 + R; col++) {
          const cx = w * 0.42 + col * R + (row % 2 ? R / 2 : 0), cy = row * R * 0.9;
          const wave = 0.5 + 0.5 * Math.sin(t * 1.1 - col * 0.35 + row * 0.22);
          const fade = Math.min(1, (cx - w * 0.38) / (w * 0.3));
          const a = 0.02 + 0.11 * Math.pow(wave, 6) * fade;
          ctx.fillStyle = rgba(th.cols[(row + col) % 2 ? 0 : 3], a);
          tri(cx, cy, R * 0.34, (row + col) % 2 ? -Math.PI / 2 : Math.PI / 2);
          ctx.fill();
        }
      }
      // Trajectory: các đường bay thẳng, đầu tam giác sáng lướt dọc theo đường
      ctx.globalCompositeOperation = 'lighter';
      const paths = [[-0.1, 0.92, 1.05, 0.08], [-0.05, 0.62, 0.9, -0.1], [0.2, 1.08, 1.1, 0.3]];
      paths.forEach(([x0, y0, x1, y1], i) => {
        const ax = x0 * w, ay = y0 * h, bx = x1 * w, by = y1 * h;
        ctx.strokeStyle = rgba(th.cols[i % 2], 0.07);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        const k = ((t * (0.07 + i * 0.025) + i * 0.33) % 1.25);
        if (k <= 1) {
          const px = ax + (bx - ax) * k, py = ay + (by - ay) * k;
          const ang = Math.atan2(by - ay, bx - ax);
          const g = ctx.createLinearGradient(px - Math.cos(ang) * w * 0.25, py - Math.sin(ang) * w * 0.25, px, py);
          g.addColorStop(0, rgba(th.cols[i % 2], 0)); g.addColorStop(1, rgba(th.spark, 0.45));
          ctx.strokeStyle = g; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(px - Math.cos(ang) * w * 0.25, py - Math.sin(ang) * w * 0.25); ctx.lineTo(px, py); ctx.stroke();
          ctx.fillStyle = rgba(th.spark, 0.85);
          tri(px, py, 6, ang);
          ctx.fill();
        }
      });
      ctx.globalCompositeOperation = 'source-over';
      // Momentum: tam giác lớn viền mảnh trôi về phía trước
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const p = ((t * (0.012 + i * 0.004) + i * 0.27) % 1.3) - 0.15;
        const cx = w * p, cy = h * (0.25 + i * 0.18);
        const r = Math.max(w, h) * (0.09 + (i % 2) * 0.06);
        ctx.strokeStyle = rgba(th.cols[i % 2 ? 1 : 0], 0.09);
        tri(cx, cy, r, t * 0.05 * (i % 2 ? 1 : -1));
        ctx.stroke();
      }
      // bụi tam giác nhỏ
      ctx.globalCompositeOperation = 'lighter';
      for (const sp of sparks) {
        const x = ((sp.x + t * sp.v * 0.08) % 1) * w;
        const y = (sp.y + 0.02 * Math.sin(t * 0.6 + sp.d)) * h;
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + sp.d);
        ctx.fillStyle = rgba(th.spark, sp.a * tw * 0.4);
        tri(x, y, sp.s * 1.6, sp.d + t * 0.3);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || document.querySelector('.bc, .draft')) return; // đang xem trận: nhường GPU
      if (time - last < 33) return; // ~30 khung/giây là đủ cho nền
      last = time;
      draw(time);
    };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const logo = theme.logo ? leagueLogo(theme.logo) : null;
  return (
    <div className={`stage th-${key}`} aria-hidden="true">
      <canvas ref={cv} className="st-cv" />
      <div className="st-art" style={{ backgroundImage: `url('${champSplash(champ || featuredChamp())}')` }} />
      {logo && <img className="st-logo" src={asset(logo)} alt="" />}
      <div className="st-shade" />
    </div>
  );
}
