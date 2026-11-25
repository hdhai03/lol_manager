import { useEffect, useRef } from 'react';
import { DB } from '../../engine/data';
import { S } from '../../engine/state';
import { PHASES, standings } from '../../engine/season';
import { gprTable } from '../../engine/gpr';
import { PHASE_WINDOW } from '../../engine/formats';
import { t } from '../../i18n';
import { ui, refresh } from '../store';
import { Badge, LeagueBadge } from '../components';
import { compLogoId, fmtD, newsText, relDay } from '../helpers';
import { openTab, topAction } from '../actions';
import type { Comp, Match } from '../../engine/types';

// giờ phát sóng quen thuộc của từng giải (giờ Việt Nam)
const SLOT: Record<string, string[]> = { LCK: ['15:00', '17:30'], LPL: ['16:00', '18:00', '20:00'], LEC: ['23:00', '01:00'], LCS: ['05:00', '07:00'], LCP: ['14:00', '16:30'], CBLOL: ['04:00', '06:00'], VCS: ['17:00', '19:00'], INTL: ['14:00', '17:00', '20:00', '23:00'] };
const slotKey = (tm: string) => { const h = +tm.slice(0, 2); return (h < 9 ? h + 24 : h) * 60 + +tm.slice(3); };
const PHASE_KIND: Record<string, string> = { kickoff: 'region', fst: 'intl', spring: 'region', msi: 'intl', summer: 'region', worlds: 'intl', offseason: 'off' };
interface Row { m: Match; comp: Comp; time: string }

export function Schedule() {
  const f = ui.filters;
  f.schLeagues ??= null; f.schBack ??= 1; f.schFwd ??= 5;
  const all = Object.values(S.comps).filter((x) => x.id.startsWith(`${S.season}-`));
  const lgOf = (c: Comp) => (c.league === 'INTL' ? 'INTL' : c.league);
  const shown = (c: Comp) => !f.schLeagues || f.schLeagues.includes(lgOf(c));
  const ms: Row[] = all.flatMap((comp) => comp.matches.map((m) => ({ m, comp, time: '' }))).filter(({ comp, m }) => shown(comp) && (!f.schMine || m.a === S.userTeam || m.b === S.userTeam));
  const perDay: Record<string, Row[]> = {};
  for (const x of ms) (perDay[`${x.m.day}|${lgOf(x.comp)}`] ??= []).push(x);
  for (const [k, list] of Object.entries(perDay)) { const sl = SLOT[k.split('|')[1]] || SLOT.INTL; list.forEach((x, i) => { x.time = sl[i % sl.length]; }); }
  const days = [...new Set(ms.map((x) => x.m.day))].sort((a, b) => a - b);
  const anchor = f.schDay ?? S.day;
  let ai = days.findIndex((d) => d >= anchor);
  if (ai < 0) ai = days.length - 1;
  const from = Math.max(0, ai - f.schBack), to = Math.min(days.length, ai + f.schFwd);
  const win = days.slice(from, to);
  const recCache: Record<string, Record<string, string>> = {};
  const rec = (comp: Comp, tid: string) => {
    if (comp.type === 'bracket') return '';
    recCache[comp.id] ??= Object.fromEntries((comp.type === 'swiss' ? comp.teams.map((x) => ({ team: x, w: comp.rec[x][0], l: comp.rec[x][1] })) : standings(comp)).map((r) => [r.team, `${r.w}-${r.l}`]));
    return recCache[comp.id][tid] || '';
  };
  const spoil = f.schSpoil !== false;
  const leagues = [...DB.leagues.map((l) => l.id), 'INTL'];
  const phases = PHASES.filter((p) => p !== 'offseason');
  const curI = S.phase ? PHASES.indexOf(S.phase) : -1;
  const head = relDay(anchor);
  const todayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // chỉ cuộn khi ngày hôm nay nằm ngoài vùng nhìn thấy (giữ thanh ngày & bộ lọc ở đầu trang)
    const el = todayRef.current, box = el?.closest('.view');
    if (el && box && el.getBoundingClientRect().bottom > box.getBoundingClientRect().bottom) el.scrollIntoView({ block: 'start' });
  }, []);
  const setF = (patch: Partial<typeof f>) => { Object.assign(f, patch); refresh(); };

  const Team = ({ m, tid, side, comp }: { m: Match; tid: string; side: 'l' | 'r'; comp: Comp }) => (
    <div className={`sm-team ${side} ${m.done && spoil && m.winner !== tid ? 'lost' : ''}`}>
      {side === 'r' && <Badge id={tid} size="md" />}<span><b>{S.teams[tid].short}</b><small>{rec(comp, tid)}</small></span>{side === 'l' && <Badge id={tid} size="md" />}
    </div>
  );
  const MRow = ({ m, comp, time }: Row) => {
    const mine = m.a === S.userTeam || m.b === S.userTeam;
    const live = !m.done && m.day === S.day;
    return (
      <div className={`sm-row ${mine ? 'me' : ''} ${live ? 'live' : ''}`}>
        <div className="sm-main">
          <span className="sm-time">{live ? <em className="tagx">{t('sch.today')}</em> : time}</span>
          <Team m={m} tid={m.a} side="l" comp={comp} />
          <div className="sm-score">{m.done ? (spoil ? <><b className={m.winner === m.a ? 'w' : ''}>{m.winsA}</b><i>-</i><b className={m.winner === m.b ? 'w' : ''}>{m.winsB}</b></> : <span className="eye">{t('sch.hidden')}</span>) : <span className="vs">VS</span>}</div>
          <Team m={m} tid={m.b} side="r" comp={comp} />
          <span className="sm-act">{mine && live && <button className="gb primary xs" data-act="match" onClick={() => void topAction('match')}>{t('btn.play')}</button>}</span>
        </div>
        <div className="sm-foot"><LeagueBadge id={compLogoId(comp)} size="xs" /><span className="sf-t">{comp.name} • {t('stage.' + comp.stage)}{m.node && !/^P\d$/.test(m.node) ? ` · ${m.node}` : ''}{m.swiss ? ` · ${m.swiss}` : ''}</span><b>Bo{m.bo}</b></div>
      </div>
    );
  };

  return (
    <div className="sch stag">
      <aside className="sch-side gp"><div className="gp-b gap-1">{phases.map((p, i) => {
        const [[m1, d1], [m2, d2]] = PHASE_WINDOW[p];
        return (
          <div key={p} className={`sp-item ${i === curI ? 'on' : i < curI ? 'past' : ''}`}>
            <small>{t(PHASE_KIND[p] === 'intl' ? 'sch.intl' : 'sch.allRegions')}</small><b>{t('phase.' + p)}</b>
            <span>{fmtD(new Date(Date.UTC(S.season, m1, d1)), { day: '2-digit', month: '2-digit' })} - {fmtD(new Date(Date.UTC(S.season, m2, d2)), { day: '2-digit', month: '2-digit' })}</span>
          </div>
        );
      })}</div></aside>
      <section className="sch-main">
        <div className="sch-top">
          <div className="sch-date"><small>{fmtD(head, { weekday: 'long' })}</small><b className="k-disp">{fmtD(head, { day: 'numeric', month: 'short' })}</b></div>
          <div className="flex gap-1">
            <button className="gb ghost xs" data-sday="-1" aria-label="prev" onClick={() => setF({ schDay: days[Math.max(0, ai - 1)], schBack: 1, schFwd: 5 })}>‹</button>
            <button className="gb xs" data-stoday onClick={() => setF({ schDay: null, schBack: 1, schFwd: 5 })}>{t('sch.todayBtn')}</button>
            <button className="gb ghost xs" data-sday="1" aria-label="next" onClick={() => setF({ schDay: days[Math.min(days.length - 1, ai + 1)], schBack: 1, schFwd: 5 })}>›</button>
          </div>
          <div className="sch-filters">
            <details className="lg-pick"><summary className="gb xs">{f.schLeagues ? t('sch.nLeagues', { n: f.schLeagues.length }) : t('sch.allLeagues')}</summary>
              <div className="lg-menu">
                {leagues.map((lg) => (
                  <label key={lg}><input type="checkbox" data-lgf={lg} checked={!f.schLeagues || f.schLeagues.includes(lg)} onChange={(e) => {
                    const cur = new Set(f.schLeagues || leagues);
                    if (e.target.checked) cur.add(lg); else cur.delete(lg);
                    setF({ schLeagues: cur.size === leagues.length ? null : [...cur] });
                  }} /><LeagueBadge id={lg === 'INTL' ? 'WORLDS' : lg} size="xs" /> {lg === 'INTL' ? t('sch.intl') : lg}</label>
                ))}
                <button className="gb ghost xs" data-lgall onClick={() => setF({ schLeagues: null })}>{t('sch.allLeagues')}</button>
              </div>
            </details>
            <label className="tg"><input type="checkbox" data-mine checked={!!f.schMine} onChange={(e) => setF({ schMine: e.target.checked })} /> {t('sch.onlyMine')}</label>
            <label className="tg"><input type="checkbox" data-spoil checked={spoil} onChange={(e) => setF({ schSpoil: e.target.checked })} /> {t('sch.spoilers')}</label>
          </div>
        </div>
        {from > 0 && <button className="gb ghost w-full mb-3" data-more="back" onClick={() => setF({ schBack: f.schBack! + 4 })}>{t('sch.loadEarlier')}</button>}
        {win.map((d) => {
          const list = ms.filter((x) => x.m.day === d).sort((a, b) => slotKey(a.time) - slotKey(b.time));
          return (
            <div key={d} ref={d === S.day ? todayRef : undefined} className={`gp sch-day ${d === S.day ? 'today' : ''}`}>
              <div className="sd-h"><b>{fmtD(relDay(d), { weekday: 'long', day: 'numeric', month: 'short' })}</b>{d === S.day && <em className="tagx">{t('sch.today')}</em>}</div>
              {list.map((x) => <MRow key={x.m.id} {...x} />)}
            </div>
          );
        })}
        {!win.length && <div className="gp"><div className="gp-b"><b>{t('sch.none')}</b><p className="muted text-sm">{t('sch.noneHint')}</p></div></div>}
        {to < days.length ? <button className="gb ghost w-full" data-more="fwd" onClick={() => setF({ schFwd: f.schFwd! + 4 })}>{t('sch.loadMore')}</button> : <p className="muted text-sm text-center">{t('sch.nextStage')}</p>}
      </section>
      <aside className="sch-right flex flex-col gap-3">
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('gpr.title')}</h3></div>
          <div className="gp-b">
            <div className="muted text-xs mb-2">{t('gpr.powered')}</div>
            {gprTable().slice(0, 5).map((r) => <div key={r.team} className={`gr-mini ${r.team === S.userTeam ? 'me' : ''}`}><b>{r.rank}</b><Badge id={r.team} size="sm" /><span>{S.teams[r.team].short}</span><small>{r.score}</small></div>)}
            <button className="gb ghost xs mt-2 self-start" data-tab-go="power" onClick={() => openTab('power')}>{t('gpr.viewFull')} ›</button>
          </div>
        </div>
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('dash.news')}</h3></div>
          <div className="gp-b">{S.news.slice(0, 4).map((n) => <div key={n.id} className="nw-mini">{newsText(n)}</div>)}</div>
        </div>
      </aside>
    </div>
  );
}
