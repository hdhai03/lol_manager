// Lớp phủ toàn màn hình: lễ trao cúp, tổng kết mùa ("Wrapped"), xem lại ván đấu
import { useState } from 'react';
import { S, lineupPlayers, teamOvr, saveGame } from '../engine/state';
import { ensureCareer, sackOffers, switchTeam } from '../engine/career';
import { runGame } from '../engine/engine';
import { t } from '../i18n';
import { ui, refresh } from './store';
import { Badge, Face, RoleTag, LeagueBadge } from './components';
import { LiveGame } from './match/Live';
import type { GameResult, Match, Role } from '../engine/types';

const TROPHY: Record<string, string> = { worlds: '🏆', msi: '🏆', fst: '🏆', league: '🏆', cup: '🏆' };
export function Ceremony() {
  const c = S.ceremony;
  if (!c) return null;
  const tm = S.teams[c.team];
  const ps = lineupPlayers(tm);
  const close = () => { S.ceremony = null; refresh(); };
  return (
    <div className={`ovl cer t-${c.tier}`} data-ceremony>
      <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.25}s`, background: ['#ffcf6e', '#7cc4ff', '#6ee7a8', '#ff8f8f', '#c8aaff'][i % 5] }} />)}</div>
      <div className="cer-in">
        <small className="k-label">{t('cer.champions')}</small>
        <div className="cer-cup">{TROPHY[c.tier] || '🏆'}</div>
        <b className="k-disp cer-title">{c.title}</b>
        <div className="cer-team"><Badge id={c.team} size="xl" /><b className="k-disp">{tm.name}</b></div>
        <div className="cer-ps">{ps.map(({ role, p }) => p && <div key={role} className="cer-p"><Face p={p} size="lg" /><span><RoleTag r={role} /> {p.ign}</span></div>)}</div>
        <button className="gb primary" data-cer-close onClick={close}>{t('cer.continue')}</button>
      </div>
    </div>
  );
}

export function Wrapped() {
  const w = S.wrapped;
  const [i, setI] = useState(0);
  if (!w || w.seen) return null;
  const tm = S.teams[w.team];
  const close = () => { if (S.wrapped) S.wrapped.seen = true; refresh(); };
  const P = (pid?: string) => (pid ? S.players[pid] : undefined);
  const slides = [
    <div key="r" className="wr-s"><small>{t('wr.record')}</small><b className="k-disp wr-big">{w.w}-{w.l}</b><span>{w.w + w.l ? t('wr.wr', { n: Math.round((w.w / (w.w + w.l)) * 100) }) : ''}</span></div>,
    <div key="t" className="wr-s"><small>{t('wr.titles')}</small>{w.titles.length ? w.titles.map((x) => <b key={x} className="wr-cup">🏆 {x}</b>) : <b className="wr-mid">{t('wr.noTitle')}</b>}</div>,
    ...(w.best && P(w.best.pid) ? [<div key="b" className="wr-s"><small>{t('wr.best')}</small><Face p={P(w.best.pid)!} size="lg" /><b className="wr-mid">{P(w.best.pid)!.ign}</b><span>{t('wr.rating', { r: w.best.rt, g: w.best.g })}</span></div>] : []),
    ...(w.topK && P(w.topK.pid) ? [<div key="k" className="wr-s"><small>{t('wr.topK')}</small><Face p={P(w.topK.pid)!} size="lg" /><b className="wr-mid">{P(w.topK.pid)!.ign}</b><span>{t('wr.kills', { n: w.topK.k })}</span></div>] : []),
    <div key="f" className="wr-s"><small>{t('wr.fans')}</small><b className="k-disp wr-big">{w.fans[1] >= 1000 ? `${(w.fans[1] / 1000).toFixed(2)}M` : `${Math.round(w.fans[1])}K`}</b><span className={w.fans[1] >= w.fans[0] ? 'up' : 'down'}>{w.fans[0] ? `${w.fans[1] >= w.fans[0] ? '+' : ''}${(((w.fans[1] / w.fans[0]) - 1) * 100).toFixed(1)}%` : ''}</span></div>,
    ...(Object.keys(w.allpro).length ? [<div key="a" className="wr-s"><small>{t('wr.allpro')}</small><div className="wr-ap">{(Object.entries(w.allpro) as [Role, string][]).map(([r, pid]) => P(pid) && <div key={r} className={`wr-app ${P(pid)!.teamId === w.team ? 'me' : ''}`}><Face p={P(pid)!} size="md" /><span><RoleTag r={r} /> {P(pid)!.ign}</span></div>)}</div></div>] : []),
  ];
  const last = i >= slides.length - 1;
  return (
    <div className="ovl wr" data-wrapped>
      <div className="wr-in">
        <div className="wr-h"><Badge id={w.team} size="md" /><b className="k-disp">{t('wr.title', { y: w.season })}</b><span className="muted">{tm?.name}</span></div>
        {slides[Math.min(i, slides.length - 1)]}
        <div className="wr-dots">{slides.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="flex gap-2 justify-center">
          {i > 0 && <button className="gb ghost" onClick={() => setI(i - 1)}>‹</button>}
          <button className="gb primary" data-wr-next onClick={() => (last ? close() : setI(i + 1))}>{last ? t('wr.done') : t('wr.next')}</button>
        </div>
      </div>
    </div>
  );
}

export function ReplayView() {
  const rep = (S.replays || []).find((r) => r.id === ui.replay);
  const [g] = useState<GameResult | null>(() => {
    if (!rep) return null;
    const n = runGame({ ...rep.rin, record: true });
    n.rin = rep.rin;
    return n;
  });
  if (!rep || !g) { ui.replay = null; return null; }
  const m = { id: rep.id, comp: '__replay', a: rep.a, b: rep.b, bo: 1, winsA: 0, winsB: 0, games: Array(rep.game), done: true, day: rep.day } as unknown as Match;
  const close = () => { ui.replay = null; refresh(); };
  return (
    <div className="ovl rp">
      <LiveGame m={m} d={null} game={g} replay={`${t('rp.title')} · ${rep.comp} ${rep.season}`} onEnd={close} onSkipAll={close} />
      <button className="gb rp-x" data-rp-close onClick={close}>✕ {t('rp.close')}</button>
    </div>
  );
}

/** bị sa thải: không thể tiếp tục dẫn dắt đội cũ, phải chọn bến đỗ mới */
export function Sacked() {
  const c = ensureCareer();
  if (!c.sacked) return null;
  const old = S.teams[S.userTeam];
  const offers = sackOffers();
  return (
    <div className="ovl sk" data-sacked>
      <div className="sk-in">
        <small className="k-label">{t('car.sackedT')}</small>
        <div className="sk-old"><Badge id={old.id} size="lg" /><b className="k-disp">{old.name}</b></div>
        <p className="muted">{t('car.sackedD', { team: old.name })}</p>
        <div className="sk-list">{offers.map((o) => {
          const tm = S.teams[o.team];
          return (
            <div key={o.team} className="sk-o">
              <Badge id={tm.id} size="md" />
              <div className="grow min-w-0"><b>{tm.name}</b><div className="muted text-xs flex items-center gap-2"><LeagueBadge id={tm.league} size="xs" />{tm.league} · OVR {teamOvr(tm)}</div></div>
              <button className="gb primary sm" data-job={o.team} onClick={() => { switchTeam(o.team); saveGame(); refresh(); }}>{t('car.accept')}</button>
            </div>
          );
        })}</div>
      </div>
    </div>
  );
}
