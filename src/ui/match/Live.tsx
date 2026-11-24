// Xem trận trực tiếp kiểu màn phát sóng. Engine mô phỏng xong cả ván (nhịp 15 giây) rồi phát lại khung hình.
// Khung HUD dựng bằng JSX; phần phát lại chạy theo nhịp đồng hồ cập nhật DOM trực tiếp (nhanh, không vẽ lại React).
import { useEffect, useRef, useState } from 'react';
import { DB, champImg, champTile, itemImg, mapImg } from '../../engine/data';
import { S } from '../../engine/state';
import { simulateGame, recordGame, simSeries } from '../../engine/sim';
import { ROLES } from '../../engine/util';
import { TICK, MIR, BLUE_TOWERS, BASE, PIT } from '../../engine/engine';
import { t, cname } from '../../i18n';
import { Badge, Champ, LeagueBadge, RoleIcon } from '../components';
import { compLogoId, compTitle } from '../helpers';
import { loadThree, webglOk, createArena } from '../arena3d';
import type { Draft, GameEvent, GameResult, Match, Side } from '../../engine/types';

interface Arena { setTargets(tok: unknown): void; flash(at: number[], sd: Side, big?: boolean): void; towerDown(id: string): void; towerUp?(id: string): void; objective(k: string, sd: Side): void; minuteTick(lead: number): void; nexusDown(sd: Side): void; setSpeed(x: number): void; dispose(): void }
interface Tok { pos: number[]; dead: number; hp: number; lvl: number; gold: number; cs: number; k: number; d: number; a: number; diedAt?: unknown }

const SPEEDS = [1, 2, 4, 8, 16];
const icon = (id: string | undefined, size: number) => (id ? `<img class="champ" src="${size >= 44 ? champTile(id) : champImg(id)}" width="${size}" height="${size}" alt="">` : '');
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const kf = (n: number) => (n / 1000).toFixed(1) + 'K';

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
        const [x, y] = sd === 'B' ? pt : MIR(pt);
        return <rect key={`${sd}-${lane}-${i}`} className={`tw tw-${sd}`} data-tw={`${sd}-${lane}-${i}`} x={x - 1.4} y={y - 1.4} width="2.8" height="2.8" transform={`rotate(45 ${x} ${y})`} />;
      })))}
      {sides.map((sd) => (['top', 'mid', 'bot'] as const).map((lane) => {
        const pt = BLUE_TOWERS[lane][2];
        const p2 = [pt[0] + (BASE.B[0] - pt[0]) * 0.35, pt[1] + (BASE.B[1] - pt[1]) * 0.35];
        const [x, y] = sd === 'B' ? p2 : MIR(p2 as [number, number]);
        return <circle key={`${sd}-ih-${lane}`} className={`ih ih-${sd}`} data-ih={`${sd}-inhib-${lane}`} cx={x} cy={y} r="1.5" />;
      }))}
    </svg>
  );
}

export function LiveGame({ m, d, onEnd, onSkipAll }: { m: Match; d: Draft; onEnd: (g: GameResult) => void; onSkipAll: () => void }) {
  const [g] = useState<GameResult>(() => simulateGame(d, { record: true, series: m.games.length }));
  const [speed, setSpeedS] = useState<number>(() => { try { return +(localStorage.getItem('lolm_speed') || 3); } catch { return 3; } });
  const root = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ setSpeed: (x: number) => void; toggleView: () => void; skip: () => void; skipAll: () => void } | null>(null);
  const comp = S.comps[m.comp];
  const tShort = (s: Side) => S.teams[s === 'B' ? g.blue : g.red].short;
  const pmap = Object.fromEntries(g.players.map((x) => [x.side + x.role, x]));
  const ign = (s: Side, r: string) => { const x = pmap[s + r]; return x && x.pid && S.players[x.pid] ? S.players[x.pid].ign : '?'; };
  const winsOf = (tid: string) => (tid === m.a ? m.winsA : m.winsB);
  const Pips = ({ tid }: { tid: string }) => <span className="pips">{Array.from({ length: Math.ceil(m.bo / 2) }, (_, i) => <i key={i} className={i < winsOf(tid) ? 'on' : ''} />)}</span>;
  const keys = (['B', 'R'] as Side[]).flatMap((sd) => ROLES.map((r) => sd + r));

  useEffect(() => {
    const r = root.current!;
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => r.querySelector(sel) as T;
    const F = g.frames || [];
    const map = $('#map');
    let alive = true;
    let spd = speed;
    let timer: ReturnType<typeof setInterval> | null = null;
    let arena: Arena | null = null;
    let tick = 0, evIdx = 0;
    const live = { kills: { B: 0, R: 0 }, towers: { B: 0, R: 0 }, barons: { B: 0, R: 0 }, dk: { B: [] as string[], R: [] as string[] }, nextDr: 300, nextBa: 1200 };
    const kfeed: { sd: Side; kc: string; vc: string }[] = [];
    const tok: Record<string, Tok> = {};
    for (const k of keys) tok[k] = { pos: BASE[k[0] as Side], dead: 0, hp: 1, lvl: 1, gold: 500, cs: 0, k: 0, d: 0, a: 0 };
    const pt2 = (a: number[]) => a as [number, number];
    const pick = (sd: Side, rl: string) => g.picks[sd][rl as keyof typeof g.picks.B] as string;
    const stopArena = () => { if (arena) { arena.dispose(); arena = null; } };

    const flash = (at: number[] | undefined, sd: Side, big?: boolean) => {
      if (!at || !alive) return;
      const el = document.createElement('i');
      el.className = `boom ${sd === 'B' ? 'b' : 'r'}`;
      el.style.left = at[0] + '%'; el.style.top = at[1] + '%';
      $('#fx').appendChild(el);
      setTimeout(() => el.remove(), 1400);
      arena?.flash(at, sd, big);
    };
    let bh: ReturnType<typeof setTimeout> | undefined;
    const banner = (text: string, sd: Side) => {
      const b = $('#banner');
      b.className = `banner show ${sd === 'B' ? 'b' : 'r'}`;
      b.textContent = text;
      clearTimeout(bh);
      bh = setTimeout(() => { b.className = 'banner'; }, Math.max(900, (2600 / spd) * 3));
    };
    const cast = (key: string, e: GameEvent) => {
      const el = $('#cast');
      const os: Side = e.side === 'B' ? 'R' : 'B';
      const p = { team: tShort(e.side), opp: tShort(os), who: e.who ? ign(e.side, e.who as string) : '', lane: e.lane ? t('lane.' + e.lane) : '', obj: e.obj ? t('obj.' + e.obj) : '' };
      el.innerHTML = '';
      const sp = document.createElement('span');
      sp.className = e.side; sp.textContent = mmss(e.s);
      el.append(sp, ' ' + t('cm.' + key, p));
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    };
    const NOTE_BANNER = new Set(['steal', 'ace']);
    const applyEv = (e: GameEvent) => {
      const at = e.at as number[] | undefined;
      const os: Side = e.side === 'B' ? 'R' : 'B';
      switch (e.type) {
        case 'kill': case 'firstblood':
          live.kills[e.side]++;
          tok[os + e.victim].diedAt = e.at;
          kfeed.push({ sd: e.side, kc: pick(e.side, e.killer as string), vc: pick(os, e.victim as string) });
          flash(at, e.side);
          if (e.type === 'firstblood') banner(t('bn.firstblood', { team: tShort(e.side) }), e.side);
          break;
        case 'teamfight':
          banner(t('bn.teamfight', { team: tShort(e.side), kb: e.side === 'B' ? e.kb : e.kr, kr: e.side === 'B' ? e.kr : e.kb }), e.side);
          flash(at, e.side, true);
          break;
        case 'dragon': case 'soul': case 'elder':
          if (e.type === 'dragon') live.dk[e.side].push(e.drake as string);
          live.nextDr = e.s + (e.type === 'dragon' ? 300 : 360);
          flash(PIT.dragon, e.side, true); arena?.objective('dragon', e.side);
          banner(e.type === 'soul' ? t('bn.soul', { team: tShort(e.side), drake: t('drake.' + e.drake) }) : e.type === 'elder' ? t('bn.elder', { team: tShort(e.side) }) : t('bn.dragon', { team: tShort(e.side), drake: t('drake.' + e.drake) }), e.side);
          break;
        case 'baron':
          live.nextBa = e.s + 360; live.barons[e.side]++;
          flash(PIT.baron, e.side, true); arena?.objective('baron', e.side); banner(t('bn.baron', { team: tShort(e.side) }), e.side);
          break;
        case 'herald': case 'grubs': flash(PIT.baron, e.side); cast(e.type, e); break;
        case 'inhib':
          map.querySelector(`[data-ih="${e.id}"]`)?.classList.add('down');
          flash(at, e.side, true); banner(t('bn.inhib', { team: tShort(e.side) }), e.side); cast('inhib', e);
          break;
        case 'inhibBack': map.querySelector(`[data-ih="${e.id}"]`)?.classList.remove('down'); cast('inhibBack', e); break;
        case 'towerBack': map.querySelector(`[data-tw="${e.id}"]`)?.classList.remove('down'); arena?.towerUp?.(e.id as string); break;
        case 'tower': case 'firsttower':
          live.towers[e.side]++;
          map.querySelector(`[data-tw="${e.id}"]`)?.classList.add('down');
          arena?.towerDown(e.id as string);
          flash(at, e.side);
          if (e.type === 'firsttower') banner(t('bn.firsttower', { team: tShort(e.side) }), e.side);
          break;
        case 'nexus': flash(BASE[os], e.side, true); arena?.nexusDown(os); banner(t('bn.victory', { team: tShort(e.side) }), e.side); break;
        case 'note':
          if (NOTE_BANNER.has(e.key as string)) banner(t('cm.' + e.key, { team: tShort(e.side), obj: e.obj ? t('obj.' + e.obj) : '' }), e.side);
          cast(e.key as string, e);
          break;
      }
    };
    const draw = () => {
      const teamGold = { B: 0, R: 0 };
      for (const [k, tk] of Object.entries(tok)) {
        const sd = k[0] as Side, rl = k.slice(1);
        const el = $('#tk-' + k);
        el.style.left = tk.pos[0] + '%'; el.style.top = tk.pos[1] + '%';
        el.classList.toggle('dead', tk.dead > 0);
        el.querySelector('i')!.textContent = tk.dead > 0 ? String(tk.dead * 15) : '';
        const md = $('#md-' + k);
        md.style.left = tk.pos[0] + '%'; md.style.top = tk.pos[1] + '%';
        md.classList.toggle('dead', tk.dead > 0);
        teamGold[sd] += tk.gold;
        $('#lv-' + k).textContent = String(tk.lvl);
        $('#rs-' + k).textContent = tk.dead > 0 ? String(tk.dead * 15) : '';
        $('#sp-' + k).classList.toggle('dead', tk.dead > 0);
        $('#hp-' + k).style.width = `${Math.round((tk.dead > 0 ? 0 : tk.hp) * 100)}%`;
        $('#kd-' + k).textContent = `${tk.k}/${tk.d}/${tk.a}`;
        $('#cs-' + k).textContent = String(tk.cs);
        // trang bị theo build pro của tướng, mở khoá theo vàng thật
        const build = (DB.champions[pick(sd, rl)]?.build || []).filter((i) => DB.items[i]);
        const n = Math.max(0, Math.min(build.length, Math.floor((tk.gold - 500) / (rl === 'Support' ? 2400 : 2900))));
        const it = $('#it-' + k);
        if (it.dataset.n !== String(n)) {
          it.dataset.n = String(n);
          it.innerHTML = Array.from({ length: 6 }, (_, i) => (i < n ? `<img src="${itemImg(build[i])}" alt="">` : '<span></span>')).join('');
        }
      }
      const sec = tick * TICK;
      map.style.setProperty('--tt', `${Math.max(0.1, 0.25 / spd)}s`);
      $('.bc-mini').style.setProperty('--tt', `${Math.max(0.1, (arena ? 1 : 0.25) / spd)}s`);
      $('#kB').textContent = String(live.kills.B);
      $('#kR').textContent = String(live.kills.R);
      $('#clock').textContent = mmss(sec);
      $('#gB').textContent = kf(teamGold.B);
      $('#gR').textContent = kf(teamGold.R);
      $('#gB').classList.toggle('up', teamGold.B > teamGold.R);
      $('#gR').classList.toggle('up', teamGold.R > teamGold.B);
      $('#twB').textContent = String(live.towers.B);
      $('#twR').textContent = String(live.towers.R);
      for (const sd of ['B', 'R'] as Side[]) $('#dk' + sd).innerHTML = live.dk[sd].map((x) => `<i class="dr-${x}" title="${t('drake.' + x)}"></i>`).join('') + (live.barons[sd] ? `<i class="ba" title="Baron">${live.barons[sd]}</i>` : '');
      $('#tDr').textContent = live.nextDr <= sec ? 'LIVE' : mmss(live.nextDr);
      $('#tBa').textContent = live.nextBa <= sec ? 'LIVE' : mmss(live.nextBa);
      $('#kfeed').innerHTML = kfeed.slice(-5).map((x) => `<div class="kf ${x.sd}">${icon(x.kc, 30)}<span class="kf-sep"></span>${icon(x.vc, 30)}</div>`).join('');
    };
    const load = (i: number) => {
      for (const [k, v] of Object.entries(F[i])) Object.assign(tok[k], { pos: [v[0], v[1]], hp: v[2], dead: v[3], lvl: v[4], gold: v[5], cs: v[6], k: v[7], d: v[8], a: v[9] });
    };
    const leadNow = () => { let s = 0; for (const [k, tk] of Object.entries(tok)) s += (k[0] === 'B' ? 1 : -1) * tk.gold; return s / 12000; };
    const finish = () => { if (!alive) return; alive = false; if (timer) clearInterval(timer); stopArena(); onEnd(g); };
    const step = () => {
      if (!alive || tick >= F.length) return;
      load(tick);
      tick++;
      while (evIdx < g.events.length && g.events[evIdx].t <= tick) applyEv(g.events[evIdx++]);
      if (arena) { if (tick % 4 === 0) arena.minuteTick(leadNow()); arena.setTargets(tok); }
      draw();
      if (tick >= F.length) {
        while (evIdx < g.events.length) applyEv(g.events[evIdx++]);
        draw();
        if (timer) clearInterval(timer);
        timer = null;
        setTimeout(finish, Math.max(900, (arena ? 6000 : 2400) / spd));
      }
    };
    // 3D: 1 nhịp (15 giây trận) = 1 giây ở tốc độ 1x
    const run = () => { if (!alive) return; if (timer) clearInterval(timer); if (tick < F.length) timer = setInterval(step, (arena ? 1000 : 250) / spd); arena?.setSpeed(spd); };
    const arenaEl = $('#arena');
    const start3D = async (): Promise<boolean> => {
      if (!webglOk()) return false;
      const ld = $('#aload');
      ld.textContent = t('m.loading3d');
      try { await loadThree(); } catch { ld.textContent = ''; return false; }
      if (!alive || tick >= F.length) { ld.textContent = ''; return false; }
      const towerIds: Record<string, number[]> = {};
      for (const [lane, arr] of Object.entries(BLUE_TOWERS)) arr.forEach((pt, i) => { towerIds[`B-${lane}-${i}`] = pt; towerIds[`R-${lane}-${i}`] = MIR(pt2(pt)); });
      const names = Object.fromEntries(Object.keys(tok).map((k) => [k, ign(k[0] as Side, k.slice(1))]));
      try {
        arenaEl.classList.remove('flat');
        arena = createArena(arenaEl, { picks: g.picks, champUrl: champTile, names, towerIds }) as Arena;
      } catch (e) { console.warn(e); arenaEl.classList.add('flat'); ld.textContent = ''; return false; }
      map.querySelectorAll<SVGElement>('.tw.down').forEach((el) => arena!.towerDown(el.dataset.tw!));
      arena.setTargets(tok);
      ld.textContent = '';
      return true;
    };
    let want3D = true;
    try { want3D = localStorage.getItem('lolm_view') !== '2d'; } catch { /* */ }
    ctl.current = {
      setSpeed: (x) => { spd = x; try { localStorage.setItem('lolm_speed', String(x)); } catch { /* */ } run(); },
      toggleView: async () => {
        if (arena) { stopArena(); arenaEl.classList.add('flat'); want3D = false; } else want3D = await start3D();
        try { localStorage.setItem('lolm_view', want3D ? '3d' : '2d'); } catch { /* */ }
        run();
      },
      skip: () => { tick = F.length; finish(); },
      skipAll: () => {
        alive = false; if (timer) clearInterval(timer); stopArena();
        if (!g.recorded) { g.recorded = true; recordGame(m, g, true); }
        if (!m.done) simSeries(m);
        onSkipAll();
      },
    };
    draw();
    if (want3D) void start3D().then(() => run()); else run();
    return () => { alive = false; if (timer) clearInterval(timer); clearTimeout(bh); stopArena(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const Portrait = ({ sd, rl }: { sd: Side; rl: string }) => (
    <div className={`bc-p ${sd}`} id={`sp-${sd}${rl}`}>
      <div className="ph"><Champ id={g.picks[sd][rl as keyof typeof g.picks.B]} size={64} /><span className="lv" id={`lv-${sd}${rl}`}>1</span><span className="rs" id={`rs-${sd}${rl}`} /></div>
      <div className="hp"><i id={`hp-${sd}${rl}`} /></div><b>{ign(sd, rl)}</b>
    </div>
  );
  const pk = (sd: Side, rl: string) => g.picks[sd][rl as keyof typeof g.picks.B];
  return (
    <div className="bc" ref={root}>
      <div className="arena flat" id="arena">
        <div className="map-wrap" id="map">
          <RiftMap />
          {keys.map((k) => <div key={k} className={`tk tk-${k[0]}`} id={`tk-${k}`} style={{ left: `${BASE[k[0] as Side][0]}%`, top: `${BASE[k[0] as Side][1]}%` }}><Champ id={pk(k[0] as Side, k.slice(1))} size={30} /><i /></div>)}
          <div className="fx" id="fx" />
        </div>
        <div className="a-load" id="aload" />
      </div>
      <div className="bc-top">
        <div className="bc-team l"><Badge id={g.blue} size="md" /><b>{tShort('B')}</b><Pips tid={g.blue} /></div>
        <div className="bc-mid">
          <span className="g" id="gB">0</span><span className="tw" id="twB">0</span><b className="k b" id="kB">0</b>
          <span className="clock" id="clock">00:00</span>
          <b className="k r" id="kR">0</b><span className="tw" id="twR">0</span><span className="g" id="gR">0</span>
        </div>
        <div className="bc-team r"><Pips tid={g.red} /><b>{tShort('R')}</b><Badge id={g.red} size="md" /></div>
        <div className="bc-sub"><span className="dk" id="dkB" /><span className="lg"><LeagueBadge id={compLogoId(comp)} size="xs" /> {compTitle(comp)} · {t('dr.game', { n: m.games.length + 1 })}</span><span className="dk r" id="dkR" /></div>
      </div>
      <div className="bc-cast" id="cast" />
      <div className="bc-timers"><div><span className="ob dr" /><span id="tDr">05:00</span></div><div><span className="ob ba" /><span id="tBa">20:00</span></div></div>
      <div className="bc-side l">{ROLES.map((rl) => <Portrait key={rl} sd="B" rl={rl} />)}</div>
      <div className="bc-side r">{ROLES.map((rl) => <Portrait key={rl} sd="R" rl={rl} />)}</div>
      <div className="bc-feed" id="kfeed" />
      <div className="bc-bottom">{ROLES.map((rl) => (
        <div key={rl} className="bc-row">
          <div className="it l" id={`it-B${rl}`} /><span className="cs" id={`cs-B${rl}`}>0</span><span className="kd" id={`kd-B${rl}`}>0/0/0</span><Champ id={pk('B', rl)} size={36} />
          <span className="ro"><RoleIcon r={rl} /></span>
          <Champ id={pk('R', rl)} size={36} /><span className="kd" id={`kd-R${rl}`}>0/0/0</span><span className="cs" id={`cs-R${rl}`}>0</span><div className="it r" id={`it-R${rl}`} />
        </div>
      ))}</div>
      <div className="bc-mini"><img src={mapImg()} alt="" />{keys.map((k) => <i key={k} className={`md md-${k[0]}`} id={`md-${k}`}><Champ id={pk(k[0] as Side, k.slice(1))} size={22} /></i>)}</div>
      <div className="banner" id="banner" />
      <div className="bc-ctrl">
        {SPEEDS.map((x) => <button key={x} className={`chip sm ${speed === x ? 'on' : ''}`} data-sp={x} onClick={() => { setSpeedS(x); ctl.current?.setSpeed(x); }}>{x}x</button>)}
        <button className="chip sm" data-view onClick={() => ctl.current?.toggleView()}>2D/3D</button>
        <button className="chip sm" data-skip onClick={() => ctl.current?.skip()}>{t('m.skip')}</button>
        {!m.done && <button className="chip sm" data-skipall onClick={() => ctl.current?.skipAll()}>{t('m.skipAll')}</button>}
      </div>
    </div>
  );
}
void cname;
