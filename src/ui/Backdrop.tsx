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
        g.addColorStop(0, rgba(col, al * 0.72));
        g.addColorStop(0.45, rgba(col, al * 0.24));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = 'source-over';
      // hoạ tiết riêng của từng chủ đề
      if (th.motif === 'hex') {
        const R = Math.max(w, h) / 22;
        const hw = Math.sqrt(3) * R;
        ctx.lineWidth = 1;
        for (let row = -1; row * R * 1.5 < h + R; row++) {
          for (let col = -1; col * hw < w + hw; col++) {
            const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * R * 1.5;
            const wave = 0.5 + 0.5 * Math.sin(t * 0.9 - (cx / w) * 5 + (cy / h) * 2);
            const a = 0.025 + 0.09 * wave * wave * (cx / w);
            ctx.strokeStyle = rgba(th.cols[0], a);
            ctx.beginPath();
            for (let k = 0; k < 6; k++) { const an = Math.PI / 3 * k + Math.PI / 6; const px = cx + R * Math.cos(an), py = cy + R * Math.sin(an); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
            ctx.closePath();
            ctx.stroke();
          }
        }
      } else if (th.motif === 'rays') {
        ctx.globalCompositeOperation = 'lighter';
        const ox = w * 0.72, oy = -h * 0.15;
        for (let i = 0; i < 9; i++) {
          const an = Math.PI * 0.35 + i * 0.13 + 0.06 * Math.sin(t * 0.25 + i);
          const len = Math.hypot(w, h) * 1.3;
          const spread = 0.035 + 0.02 * Math.sin(t * 0.5 + i * 2);
          const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(an) * len, oy + Math.sin(an) * len);
          g.addColorStop(0, rgba(th.cols[i % 2 ? 1 : 0], 0.16));
          g.addColorStop(1, rgba(th.cols[i % 2 ? 1 : 0], 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + Math.cos(an - spread) * len, oy + Math.sin(an - spread) * len);
          ctx.lineTo(ox + Math.cos(an + spread) * len, oy + Math.sin(an + spread) * len);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (th.motif === 'grid') {
        const hy = h * 0.58;
        ctx.lineWidth = 1;
        for (let i = 0; i < 18; i++) {
          const z = ((i + (t * 0.35) % 1) / 18);
          const y = hy + (h - hy) * z * z;
          ctx.strokeStyle = rgba(th.cols[0], 0.05 + 0.18 * z);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let i = -14; i <= 14; i++) {
          ctx.strokeStyle = rgba(th.cols[1], 0.08);
          ctx.beginPath(); ctx.moveTo(w / 2 + i * w * 0.012, hy); ctx.lineTo(w / 2 + i * w * 0.16, h); ctx.stroke();
        }
      } else if (th.motif === 'streaks') {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const p = ((t * (0.04 + i * 0.006) + i * 0.17) % 1.4) - 0.2;
          const x = w * p, y = h * (0.15 + i * 0.12);
          const len = w * (0.25 + 0.1 * (i % 3));
          const g = ctx.createLinearGradient(x - len, y + len * 0.35, x, y);
          g.addColorStop(0, rgba(th.cols[i % 2], 0));
          g.addColorStop(1, rgba(th.cols[i % 2], 0.2));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5 + (i % 3);
          ctx.beginPath(); ctx.moveTo(x - len, y + len * 0.35); ctx.lineTo(x, y); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // tàn lửa / bụi sáng bay lên
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sparks) {
        const x = (s.x + 0.015 * Math.sin(t * 0.6 + s.d)) * w;
        const y = ((s.y - t * s.v * 0.25) % 1 + 1) % 1 * h;
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.d);
        ctx.fillStyle = rgba(th.spark, s.a * tw * 0.55);
        ctx.beginPath(); ctx.arc(x, y, s.s * scale * 1.6, 0, 6.283); ctx.fill();
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
