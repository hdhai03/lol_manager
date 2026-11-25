// Xem trận trực tiếp kiểu màn phát sóng giải đấu. Đồng hồ trận chạy liên tục: 1x = thời gian thật.
// Khung HUD dựng bằng JSX; mỗi khung hình (requestAnimationFrame) cập nhật DOM trực tiếp, không vẽ lại React.
import { useEffect, useRef, useState } from 'react';
import { DB, champImg, champTile, itemImg, mapImg } from '../../engine/data';
import { S } from '../../engine/state';
import { simulateGame, recordGame, simSeries, resimGame } from '../../engine/sim';
import type { Order, OrderKind } from '../../engine/engine';
import { ROLES } from '../../engine/util';
import { MIR, BLUE_TOWERS, BASE, PIT } from '../../engine/engine';
import { t } from '../../i18n';
import { Badge, Champ, LeagueBadge, RoleIcon, RuneMini } from '../components';
import { compLogoId, compTitle } from '../helpers';
import { loadThree, webglOk, createArena, type Arena } from './arena';
import { Timeline, unitKeys, type DispEv } from './timeline';
import type { Draft, GameResult, Match, Side } from '../../engine/types';

const SPEEDS = [1, 2, 4, 8, 16, 32];
const icon = (id: string | undefined, size: number) => (id ? `<img class="champ" src="${size >= 44 ? champTile(id) : champImg(id)}" width="${size}" height="${size}" alt="">` : '');
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const kf = (n: number) => (n / 1000).toFixed(1) + 'K';
const KEY_SPEED = 'lolm_speed2';
const ORDERS: OrderKind[] = ['fight', 'baron', 'dragon', 'push', 'defend'];
const MAX_ORDERS = 3;

function RiftMap() {
  const sides: Side[] = ['B', 'R'];
  return (
    <svg className="rift" viewBox="0 0 100 100" aria-hidden="true">
      <defs><radialGradient id="rg" cx="50%" cy="50%" r="70%"><stop offset="0" stopColor="#1f3b34" /><stop offset="1" stopColor="#0d1b19" /></radialGradient></defs>
      <rect width="100" height="100" rx="3" fill="url(#rg)" />
      <path className="river" d="M4 8 C30 30, 70 70, 96 92" />
      <g className="jg"><circle cx="30" cy="55" r="9" /><circle cx="55" cy="78" r="8" /><circle cx="70" cy="45" r="9" /><circle cx="45" cy="22" r="8" /><circle cx="18" cy="38" r="6" /><circle cx="82" cy="62" r="6" /></g>
      <path className="lane" d="M9 84 L9 10 L84 10" /><path className="lane" d="M16 91 L90 91 L90 16" /><path className="lane" d="M16 84 L84 16" />
      <circle className="pit" cx={PIT.dragon[0]} cy={PIT.dragon[1]} r="3.4" /><circle className="pit" cx={PIT.baron[0]} cy={PIT.baron[1]} r="3.6" />
      <circle className="base base-B" cx={BASE.B[0]} cy={BASE.B[1]} r="6" /><circle className="base base-R" cx={BASE.R[0]} cy={BASE.R[1]} r="6" />
      {sides.map((sd) => Object.entries(BLUE_TOWERS).flatMap(([lane, arr]) => arr.map((pt, i) => {
        const [x, y] = sd === 'B' ? pt : MIR(pt as [number, number]);
        return <rect key={`${sd}-${lane}-${i}`} className={`tw tw-${sd}`} data-tw={`${sd}-${lane}-${i}`} x={x - 1.4} y={y - 1.4} width="2.8" height="2.8" transform={`rotate(45 ${x} ${y})`} />;
      })))}
      {sides.map((sd) => (['top', 'mid', 'bot'] as const).map((lane) => {
        const pt = BLUE_TOWERS[lane][2];
        const p2: [number, number] = [pt[0] + (BASE.B[0] - pt[0]) * 0.35, pt[1] + (BASE.B[1] - pt[1]) * 0.35];
        const [x, y] = sd === 'B' ? p2 : MIR(p2);
        return <circle key={`${sd}-ih-${lane}`} className={`ih ih-${sd}`} data-ih={`${sd}-inhib-${lane}`} cx={x} cy={y} r="1.5" />;
      }))}
    </svg>
  );
}

const IcGold = () => <svg viewBox="0 0 16 16" className="ico"><circle cx="8" cy="8" r="6.2" fill="#e8c15a" /><circle cx="8" cy="8" r="3.6" fill="none" stroke="#9a7420" strokeWidth="1.4" /></svg>;
const IcTower = () => <svg viewBox="0 0 16 16" className="ico"><path d="M4 2h2v2h1.2V2h1.6v2H10V2h2v4l-1.3 1.3V13H12v1.5H4V13h1.3V7.3L4 6z" fill="currentColor" /></svg>;
const IcGrub = () => <svg viewBox="0 0 16 16" className="ico"><ellipse cx="8" cy="9" rx="5" ry="4" fill="#b27cff" /><circle cx="6" cy="8" r="1" fill="#fff" /><circle cx="10" cy="8" r="1" fill="#fff" /></svg>;

export function LiveGame({ m, d, onEnd, onSkipAll }: { m: Match; d: Draft; onEnd: (g: GameResult) => void; onSkipAll: () => void }) {
  const [g] = useState<GameResult>(() => simulateGame(d, { record: true, series: m.games.length }));
  const [tl] = useState(() => new Timeline(g));
  const [speed, setSpeedS] = useState<number>(() => { try { return +(localStorage.getItem(KEY_SPEED) || 8); } catch { return 8; } });
  const [paused, setPaused] = useState(false);
  const [ordLeft, setOrdLeft] = useState(MAX_ORDERS);
  const mySide: Side | null = g.blue === S.userTeam ? 'B' : g.red === S.userTeam ? 'R' : null;
  const root = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ order: (k: OrderKind) => void; setSpeed: (x: number) => void; pause: (p: boolean) => void; toggleView: () => void; skip: () => void; skipAll: () => void } | null>(null);
  const comp = S.comps[m.comp];
  const teamOf = (s: Side) => (s === 'B' ? g.blue : g.red);
  const tShort = (s: Side) => S.teams[teamOf(s)].short;
  const tName = (s: Side) => S.teams[teamOf(s)].name;
  const pmap = Object.fromEntries(g.players.map((x) => [x.side + x.role, x]));
  const ign = (s: Side, r: string) => { const x = pmap[s + r]; return x && x.pid && S.players[x.pid] ? S.players[x.pid].ign : '?'; };
  const winsOf = (tid: string) => (tid === m.a ? m.winsA : m.winsB);
  const keys = unitKeys();
  const pk = (sd: Side, rl: string) => g.picks[sd][rl as keyof typeof g.picks.B] as string;

  useEffect(() => {
    const r = root.current!;
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => r.querySelector(sel) as T;
    let cur = g;
    let F = g.frames || [];
    const orders: Order[] = [];
    let ordUntil = 0, ordKind = '';
    const map = $('#map');
    let alive = true, raf = 0, spd = speed, isPaused = false;
    let gt = 0, last = performance.now(), evIdx = 0, finishing = 0;
    let arena: Arena | null = null;
    let lastFrame = -1;
    const live = { kills: { B: 0, R: 0 }, towers: { B: 0, R: 0 }, grubs: { B: 0, R: 0 }, dk: { B: [] as string[], R: [] as string[] }, nextDr: 300, nextBa: 1200, baronBuff: { B: 0, R: 0 }, elderBuff: { B: 0, R: 0 } };
    const kfeed: { sd: Side; kc: string; vc: string; at: number }[] = [];
    const pick = (sd: Side, rl: string) => pk(sd, rl);

    let bh: ReturnType<typeof setTimeout> | undefined;
    const banner = (title: string, sub: string, sd: Side) => {
      const b = $('#banner');
      b.className = `banner show ${sd === 'B' ? 'b' : 'r'}`;
      b.innerHTML = '';
      const t1 = document.createElement('b'); t1.textContent = title;
      const t2 = document.createElement('small'); t2.textContent = sub;
      b.append(t1, t2);
      clearTimeout(bh);
      bh = setTimeout(() => { b.className = 'banner'; }, 2600);
    };
    const cast = (key: string, e: DispEv) => {
      const el = $('#cast');
      const os: Side = e.side === 'B' ? 'R' : 'B';
      const p = { team: tShort(e.side), opp: tShort(os), who: e.who ? ign(e.side, e.who as string) : '', lane: e.lane ? t('lane.' + e.lane) : '', obj: e.obj ? t('obj.' + e.obj) : '' };
      el.innerHTML = '';
      const sp = document.createElement('span');
      sp.className = e.side; sp.textContent = mmss(e.d);
      el.append(sp, ' ' + t('cm.' + key, p));
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    };
    const NOTE_BANNER = new Set(['steal', 'ace']);
    const quiet = () => spd >= 32;
    const applyEv = (e: DispEv) => {
      const os: Side = e.side === 'B' ? 'R' : 'B';
      switch (e.type) {
        case 'kill': case 'firstblood':
          live.kills[e.side]++;
          kfeed.push({ sd: e.side, kc: pick(e.side, e.killer as string), vc: pick(os, e.victim as string), at: performance.now() });
          if (e.type === 'firstblood') banner(t('bn.fbT'), tName(e.side), e.side);
          break;
        case 'teamfight':
          if (!quiet()) banner(t('bn.tfT'), `${tName(e.side)} · ${e.side === 'B' ? e.kb : e.kr}-${e.side === 'B' ? e.kr : e.kb}`, e.side);
          break;
        case 'dragon': case 'soul': case 'elder':
          if (e.type === 'dragon') live.dk[e.side].push(e.drake as string);
          if (e.type === 'elder') live.elderBuff[e.side] = e.d + 150;
          live.nextDr = e.d + (e.type === 'dragon' ? 300 : 360);
          banner(e.type === 'soul' ? t('bn.soulT') : e.type === 'elder' ? t('bn.elderT') : t('bn.dragonT'), e.type === 'elder' ? tName(e.side) : `${t('drake.' + e.drake)} · ${tName(e.side)}`, e.side);
          break;
        case 'baron':
          live.nextBa = e.d + 360; live.baronBuff[e.side] = e.d + 180;
          banner(t('bn.baronT'), tName(e.side), e.side);
          break;
        case 'herald': case 'grubs':
          if (e.type === 'grubs') live.grubs[e.side] += (e.n as number) || 3;
          cast(e.type, e);
          break;
        case 'inhib':
          map.querySelector(`[data-ih="${e.id}"]`)?.classList.add('down');
          banner(t('bn.inhibT'), tName(e.side), e.side); cast('inhib', e);
          break;
        case 'inhibBack': map.querySelector(`[data-ih="${e.id}"]`)?.classList.remove('down'); cast('inhibBack', e); break;
        case 'towerBack': map.querySelector(`[data-tw="${e.id}"]`)?.classList.remove('down'); break;
        case 'tower': case 'firsttower':
          live.towers[e.side]++;
          map.querySelector(`[data-tw="${e.id}"]`)?.classList.add('down');
          if (e.type === 'firsttower') banner(t('bn.ftT'), tName(e.side), e.side);
          break;
        case 'nexus': banner(t('pg.victory'), tName(e.side), e.side); break;
        case 'note':
          if (NOTE_BANNER.has(e.key as string) && !quiet()) banner(e.key === 'ace' ? 'ACE' : t('bn.stealT'), t('cm.' + e.key, { team: tShort(e.side), obj: e.obj ? t('obj.' + e.obj) : '' }), e.side);
          cast(e.key as string, e);
          break;
      }
    };

    // số liệu khung hình (vàng, cs, KDA, cấp) — đổi mỗi 15 giây trận
    const drawFrame = (fi: number) => {
      const fr = F[fi];
      if (!fr) return;
      const teamGold = { B: 0, R: 0 };
      for (const k of keys) {
        const v = fr[k];
        const sd = k[0] as Side, rl = k.slice(1);
        teamGold[sd] += v[5];
        $('#lv-' + k).textContent = String(v[4]);
        $('#kd-' + k).textContent = `${v[7]}/${v[8]}/${v[9]}`;
        $('#cs-' + k).textContent = String(v[6]);
        $('#ul-' + k).classList.toggle('on', v[4] >= 6);
        const build = (DB.champions[pick(sd, rl)]?.build || []).filter((i) => DB.items[i]);
        const n = Math.max(0, Math.min(build.length, Math.floor((v[5] - 500) / (rl === 'Support' ? 2400 : 2900))));
        const it = $('#it-' + k);
        if (it.dataset.n !== String(n)) { it.dataset.n = String(n); it.innerHTML = Array.from({ length: 6 }, (_, i) => (i < n ? `<img src="${itemImg(build[i])}" alt="">` : '<span></span>')).join(''); }
      }
      for (const rl of ROLES) {
        const df = fr['B' + rl][5] - fr['R' + rl][5];
        const el = $('#gd-' + rl);
        el.textContent = Math.abs(df) < 100 ? '—' : `${(Math.abs(df) / 1000).toFixed(1)}K`;
        el.className = `gd ${df >= 100 ? 'B' : df <= -100 ? 'R' : ''}`;
      }
      $('#gB').textContent = kf(teamGold.B); $('#gR').textContent = kf(teamGold.R);
      const diff = teamGold.B - teamGold.R;
      const gd = $('#gdiff');
      gd.textContent = Math.abs(diff) < 100 ? '' : `+${kf(Math.abs(diff))}`;
      gd.className = `gdiff ${diff > 0 ? 'B' : 'R'}`;
    };
    const drawLive = () => {
      $('#kB').textContent = String(live.kills.B); $('#kR').textContent = String(live.kills.R);
      $('#clock').textContent = mmss(gt);
      $('#twB').textContent = String(live.towers.B); $('#twR').textContent = String(live.towers.R);
      $('#grB').textContent = String(live.grubs.B); $('#grR').textContent = String(live.grubs.R);
      for (const sd of ['B', 'R'] as Side[]) {
        $('#dk' + sd).innerHTML = live.dk[sd].map((x) => `<i class="dr-${x}" title="${t('drake.' + x)}"></i>`).join('');
        const bb = $('#bb' + sd);
        const bLeft = live.baronBuff[sd] - gt, eLeft = live.elderBuff[sd] - gt;
        bb.textContent = bLeft > 0 ? `BARON ${mmss(bLeft)}` : eLeft > 0 ? `ELDER ${mmss(eLeft)}` : '';
        bb.className = `buff ${bLeft > 0 ? 'ba' : eLeft > 0 ? 'el' : ''}`;
      }
      const os = r.querySelector('#ordst');
      if (os) os.textContent = ordUntil > gt ? `${t('ord.' + ordKind)} · ${mmss(ordUntil - gt)}` : '';
      $('#tDr').textContent = live.nextDr <= gt ? 'LIVE' : mmss(live.nextDr);
      $('#tBa').textContent = live.nextBa <= gt ? 'LIVE' : mmss(live.nextBa);
      const now = performance.now();
      $('#kfeed').innerHTML = kfeed.filter((x) => now - x.at < 9000).slice(-5).map((x) => `<div class="kf ${x.sd}">${icon(x.kc, 30)}<span class="kf-sep"><svg viewBox="0 0 16 16"><path d="M2 14 12 4l1-3 2 2-3 1L2 14z" fill="currentColor"/></svg></span>${icon(x.vc, 30)}</div>`).join('');
      for (const k of keys) {
        const s = tl.unit(k, gt);
        const el = $('#tk-' + k);
        el.style.left = s.x + '%'; el.style.top = s.y + '%';
        el.classList.toggle('dead', !s.alive);
        const md = $('#md-' + k);
        md.style.left = s.x + '%'; md.style.top = s.y + '%';
        md.classList.toggle('dead', !s.alive);
        md.classList.toggle('rc', s.recall >= 0);
        $('#sp-' + k).classList.toggle('dead', !s.alive);
        $('#hp-' + k).style.width = `${Math.round((s.alive ? s.hp : 0) * 100)}%`;
        let rs = '';
        if (!s.alive) { const nxt = tl.kf[k].find((x) => x.t > gt && x.alive); rs = nxt ? String(Math.max(1, Math.ceil(nxt.t - gt))) : ''; }
        $('#rs-' + k).textContent = rs;
      }
      const vp = $('#vp');
      if (arena) {
        const v = arena.view();
        vp.style.display = '';
        vp.style.left = `${v.x - v.w / 2}%`; vp.style.top = `${v.y - v.h / 2}%`; vp.style.width = `${v.w}%`; vp.style.height = `${v.h}%`;
      } else vp.style.display = 'none';
    };

    const finish = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); arena?.dispose(); arena = null; onEnd(cur); };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const rdt = Math.min(.25, (now - last) / 1000); last = now;
      if (!isPaused && gt < tl.end) gt = Math.min(tl.end, gt + rdt * spd);
      while (evIdx < tl.evs.length && tl.evs[evIdx].d <= gt) applyEv(tl.evs[evIdx++]);
      const fi = tl.frameIdx(gt);
      if (fi !== lastFrame) { lastFrame = fi; drawFrame(fi); }
      drawLive();
      arena?.render(gt, isPaused ? 0 : rdt, spd);
      if (gt >= tl.end) { finishing += rdt; if (finishing > (arena ? 4 : 2.5)) finish(); }
    };
    const arenaEl = $('#arena');
    const names = Object.fromEntries(keys.map((k) => [k, ign(k[0] as Side, k.slice(1))]));
    const towerIds: Record<string, number[]> = {};
    for (const [lane, arr] of Object.entries(BLUE_TOWERS)) arr.forEach((pt, i) => { towerIds[`B-${lane}-${i}`] = pt; towerIds[`R-${lane}-${i}`] = MIR(pt as [number, number]); });
    const start3D = async (): Promise<boolean> => {
      if (!webglOk()) return false;
      const ld = $('#aload');
      ld.textContent = t('m.loading3d');
      try { await loadThree(); } catch { ld.textContent = ''; return false; }
      if (!alive) return false;
      try {
        arenaEl.classList.remove('flat');
        arena = createArena(arenaEl, { tl, picks: g.picks as Record<Side, Record<string, string>>, names, champUrl: champTile, towerIds });
      } catch (e) { console.warn(e); arenaEl.classList.add('flat'); ld.textContent = ''; return false; }
      ld.textContent = '';
      return true;
    };
    let want3D = true;
    try { want3D = localStorage.getItem('lolm_view') !== '2d'; } catch { /* */ }
    ctl.current = {
      // lệnh trong trận: mô phỏng lại từ cùng seed, có hiệu lực từ nhịp kế tiếp
      order: (k) => {
        if (!mySide || orders.length >= MAX_ORDERS || gt >= tl.end - 20) return;
        const t0 = (Math.floor(gt / 15) + 2) * 15;
        orders.push({ t: t0, side: mySide, kind: k });
        const n = resimGame(cur, [...orders]);
        cur = n;
        F = n.frames || [];
        Object.assign(tl, new Timeline(n));
        evIdx = 0;
        while (evIdx < tl.evs.length && tl.evs[evIdx].d <= gt) evIdx++;
        lastFrame = -1;
        // bản 3D tính trước lịch trụ/quái từ dòng thời gian → dựng lại theo diễn biến mới
        if (arena) { arena.dispose(); arena = null; void start3D(); }
        ordUntil = t0 + 150; ordKind = k;
        setOrdLeft(MAX_ORDERS - orders.length);
        banner(t('ord.' + k), t('ord.issued'), mySide);
      },
      setSpeed: (x) => { spd = x; try { localStorage.setItem(KEY_SPEED, String(x)); } catch { /* */ } },
      pause: (p) => { isPaused = p; },
      toggleView: async () => {
        if (arena) { arena.dispose(); arena = null; arenaEl.classList.add('flat'); want3D = false; } else want3D = await start3D();
        try { localStorage.setItem('lolm_view', want3D ? '3d' : '2d'); } catch { /* */ }
      },
      skip: () => { gt = tl.end; while (evIdx < tl.evs.length) applyEv(tl.evs[evIdx++]); finish(); },
      skipAll: () => {
        alive = false; cancelAnimationFrame(raf); arena?.dispose(); arena = null;
        if (!cur.recorded) { cur.recorded = true; recordGame(m, cur, true); }
        if (!m.done) simSeries(m);
        onSkipAll();
      },
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); isPaused = !isPaused; setPaused(isPaused); } };
    window.addEventListener('keydown', onKey);
    drawFrame(0);
    const go = () => { last = performance.now(); raf = requestAnimationFrame(loop); };
    if (want3D) void start3D().then(go); else go();
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(bh); arena?.dispose(); window.removeEventListener('keydown', onKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sideCol = (sd: Side) => (
    <div className={`bc-side ${sd === 'B' ? 'l' : 'r'}`}>
      {ROLES.map((rl) => (
        <div key={rl} className={`bc-p ${sd}`} id={`sp-${sd}${rl}`}>
          <div className="ph"><Champ id={pk(sd, rl)} size={64} /><span className="lv" id={`lv-${sd}${rl}`}>1</span><span className="rs" id={`rs-${sd}${rl}`} /><i className="ul" id={`ul-${sd}${rl}`} /><span className="rn"><RuneMini r={g.runes?.[sd + rl]} size={20} /></span></div>
          <div className="info"><b>{ign(sd, rl)}</b><div className="hp"><i id={`hp-${sd}${rl}`} /></div><div className="mp"><i /></div></div>
        </div>
      ))}
    </div>
  );
  const pips = (tid: string) => <span className="pips">{Array.from({ length: Math.ceil(m.bo / 2) }, (_, i) => <i key={i} className={i < winsOf(tid) ? 'on' : ''} />)}</span>;
  return (
    <div className="bc" ref={root}>
      <div className="arena flat" id="arena">
        <div className="map-wrap" id="map">
          <RiftMap />
          {keys.map((k) => <div key={k} className={`tk tk-${k[0]}`} id={`tk-${k}`} style={{ left: `${BASE[k[0] as Side][0]}%`, top: `${BASE[k[0] as Side][1]}%` }}><Champ id={pk(k[0] as Side, k.slice(1))} size={30} /><i /></div>)}
        </div>
        <div className="a-load" id="aload" />
      </div>
      <div className="vig" />
      <div className="sb">
        <div className="sb-row">
          <div className="sb-team l"><Badge id={g.blue} size="md" /><b>{tShort('B')}</b>{pips(g.blue)}</div>
          <div className="sb-k b" id="kB">0</div>
          <div className="sb-c"><span className="clock" id="clock">00:00</span></div>
          <div className="sb-k r" id="kR">0</div>
          <div className="sb-team r">{pips(g.red)}<b>{tShort('R')}</b><Badge id={g.red} size="md" /></div>
        </div>
        <div className="sb-sub">
          <div className="side l"><span className="buff" id="bbB" /><span className="dk" id="dkB" /><span className="st"><IcGrub /><em id="grB">0</em></span><span className="st"><IcTower /><em id="twB">0</em></span><span className="st g"><IcGold /><em id="gB">0</em></span></div>
          <span className="gdiff" id="gdiff" />
          <div className="side r"><span className="st g"><IcGold /><em id="gR">0</em></span><span className="st"><IcTower /><em id="twR">0</em></span><span className="st"><IcGrub /><em id="grR">0</em></span><span className="dk r" id="dkR" /><span className="buff" id="bbR" /></div>
        </div>
        <div className="sb-lg"><LeagueBadge id={compLogoId(comp)} size="xs" />{compTitle(comp)} · {t('dr.game', { n: m.games.length + 1 })}</div>
      </div>
      <div className="bc-timers"><div><span className="ob dr" /><span id="tDr">05:00</span></div><div><span className="ob ba" /><span id="tBa">20:00</span></div></div>
      {sideCol('B')}
      {sideCol('R')}
      <div className="bc-feed" id="kfeed" />
      <div className="bc-cast" id="cast" />
      <div className="bc-bottom">
        {ROLES.map((rl) => (
          <div key={rl} className="bc-row">
            <div className="it l" id={`it-B${rl}`} /><span className="cs" id={`cs-B${rl}`}>0</span><span className="kd" id={`kd-B${rl}`}>0/0/0</span><Champ id={pk('B', rl)} size={32} />
            <span className="mid"><span className="ro"><RoleIcon r={rl} /></span><span className="gd" id={`gd-${rl}`}>—</span></span>
            <Champ id={pk('R', rl)} size={32} /><span className="kd" id={`kd-R${rl}`}>0/0/0</span><span className="cs" id={`cs-R${rl}`}>0</span><div className="it r" id={`it-R${rl}`} />
          </div>
        ))}
      </div>
      <div className="bc-mini"><img src={mapImg()} alt="" /><i className="vp" id="vp" />{keys.map((k) => <i key={k} className={`md md-${k[0]}`} id={`md-${k}`}><Champ id={pk(k[0] as Side, k.slice(1))} size={22} /></i>)}</div>
      <div className="banner" id="banner" />
      {mySide && (
        <div className="bc-ord">
          <small className="k-label">{t('ord.title')} · {ordLeft}/{MAX_ORDERS}</small>
          <div className="bc-ord-b">{ORDERS.map((k) => <button key={k} className="chip sm" data-order={k} disabled={!ordLeft} title={t('ord.' + k + 'D')} onClick={() => ctl.current?.order(k)}>{t('ord.' + k)}</button>)}</div>
          <span id="ordst" className="ord-st" />
        </div>
      )}
      <div className="bc-ctrl">
        <button className={`chip sm ${paused ? 'on' : ''}`} data-pause title="Space" onClick={() => { const p = !paused; setPaused(p); ctl.current?.pause(p); }}>{paused ? '▶' : '❚❚'}</button>
        {SPEEDS.map((x) => <button key={x} className={`chip sm ${speed === x ? 'on' : ''}`} data-sp={x} onClick={() => { setSpeedS(x); ctl.current?.setSpeed(x); }}>{x}x</button>)}
        <button className="chip sm" data-view onClick={() => ctl.current?.toggleView()}>2D/3D</button>
        <button className="chip sm" data-skip onClick={() => ctl.current?.skip()}>{t('m.skip')}</button>
        {!m.done && <button className="chip sm" data-skipall onClick={() => ctl.current?.skipAll()}>{t('m.skipAll')}</button>}
      </div>
    </div>
  );
}
