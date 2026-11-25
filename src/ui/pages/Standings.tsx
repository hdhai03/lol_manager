import { DB } from '../../engine/data';
import { S, userTeam, teamOvr } from '../../engine/state';
import { standings } from '../../engine/season';
import { t } from '../../i18n';
import { ui, refresh } from '../store';
import { Badge, LeagueBadge, Ovr } from '../components';
import { compLogoId, compTitle } from '../helpers';
import type { BracketComp, Comp, LeagueComp, SwissComp } from '../../engine/types';
import type { StandRow } from '../../engine/formats';

export function StandTable({ st, compact = false }: { st: StandRow[]; compact?: boolean }) {
  if (!st.length) return <p className="muted">{t('st.notStarted')}</p>;
  return (
    <table className="gt standings"><thead><tr><th>{t('st.rank')}</th><th>{t('team')}</th><th>{t('st.w')}</th><th>{t('st.l')}</th>{!compact && <><th>{t('st.diff')}</th><th>{t('st.form')}</th><th>OVR</th></>}</tr></thead>
      <tbody>{st.map((r, i) => (
        <tr key={r.team} className={`${r.team === S.userTeam ? 'me' : ''} ${i < 4 ? 'q' : ''}`}>
          <td className="n"><span className="rk">{i + 1}</span></td>
          <td><div className="nm2"><Badge id={r.team} size="sm" /><span className="uppercase">{compact ? S.teams[r.team].short : S.teams[r.team].name}</span></div></td>
          <td className="n">{r.w}</td><td className="n">{r.l}</td>
          {!compact && <><td className="n">{r.gw - r.gl > 0 ? '+' : ''}{r.gw - r.gl}</td><td>{r.streak.slice(-5).map((x, j) => <span key={j} className={`dot ${x}`} />)}</td><td><Ovr v={teamOvr(S.teams[r.team])} /></td></>}
        </tr>
      ))}</tbody></table>
  );
}

function BracketView({ comp }: { comp: BracketComp }) {
  if (!comp.nodes) return null;
  const cols = Math.max(...comp.nodes.map((n) => n.col)) + 1;
  const hasLo = comp.nodes.some((n) => n.lo);
  const seedName = (sv: number | string) => (typeof sv === 'number' ? (comp.seeds[sv - 1] ? null : `#${sv}`) : t(sv[0] === 'W' ? 'br.winner' : 'br.loser', { m: sv.slice(2) }));
  const Cell = ({ n }: { n: BracketComp['nodes'][number] }) => {
    const m = comp.matches.find((x) => x.id === comp.mk[n.k]);
    const row = (tid: string | null | undefined, w: number, sv: number | string) => tid
      ? <div className={`b-team ${m && m.done && m.winner === tid ? 'win' : ''} ${tid === S.userTeam ? 'me' : ''}`}><Badge id={tid} size="sm" /><span>{S.teams[tid].short}</span><b>{m && m.games.length ? w : ''}</b></div>
      : <div className="b-team tbd"><span>{seedName(sv) || '?'}</span></div>;
    const a = m ? m.a : typeof n.a === 'number' ? comp.seeds[n.a - 1] : null;
    const b = m ? m.b : typeof n.b === 'number' ? comp.seeds[n.b - 1] : null;
    return <div className={`b-match ${n.k === 'GF' || n.k === 'F' ? 'final' : ''}`}><div className="b-k">{n.k}{m ? ` · Bo${m.bo}` : ''}</div>{row(a, m ? m.winsA : 0, n.a)}{row(b, m ? m.winsB : 0, n.b)}</div>;
  };
  const lane = (lo: boolean) => (
    <div className="bracket">{Array.from({ length: cols }, (_, ci) => <div key={ci} className="b-round">{comp.nodes.filter((n) => n.col === ci && !!n.lo === lo).map((n) => <Cell key={n.k} n={n} />)}</div>)}</div>
  );
  return <>{hasLo && <div className="b-lbl">{t('br.upper')}</div>}{lane(false)}{hasLo && <><div className="b-lbl">{t('br.lower')}</div>{lane(true)}</>}</>;
}

function SwissView({ comp }: { comp: SwissComp }) {
  const rows = comp.teams.map((tm) => ({ tm, r: comp.rec[tm] })).sort((x, y) => y.r[0] - x.r[0] || x.r[1] - y.r[1]);
  return (
    <>
      <div className="swiss">{rows.map(({ tm, r }) => <div key={tm} className={`sw-row ${r[0] >= 3 ? 'adv' : r[1] >= 3 ? 'out' : ''} ${tm === S.userTeam ? 'me' : ''}`}><Badge id={tm} size="sm" /><span>{S.teams[tm].short}</span><b>{r[0]}-{r[1]}</b></div>)}</div>
      <div className="muted text-sm mt-2">{t('st.swissHint')}</div>
    </>
  );
}

function LeagueView({ comp }: { comp: LeagueComp }) {
  if (!comp.groups || comp.groups.length <= 1) return <StandTable st={standings(comp)} />;
  const pts = [0, 0];
  if (comp.cross) for (const m of comp.matches) if (m.done) pts[comp.groups[0].teams.includes(m.winner!) ? 0 : 1] += m.superWeek ? 2 : 1;
  return (
    <div className="grid md:grid-cols-2 gap-4">{comp.groups.map((g, gi) => (
      <div key={gi}>
        <div className="sub-h">{g.name || t('st.group', { g: 'ABCD'[gi] })}{comp.cross ? ` · ${t('st.points', { n: pts[gi] })}` : ''}{comp.winnersGroup != null ? ` · ${t(comp.winnersGroup === gi ? 'st.winnersGroup' : 'st.losersGroup')}` : ''}</div>
        <StandTable st={standings(comp, gi)} compact />
      </div>
    ))}</div>
  );
}

export function Standings() {
  const lg = ui.filters.stLeague || userTeam().league;
  const y = S.season;
  const comps = Object.values(S.comps).filter((x) => x.id.startsWith(y + '-') && x.league === lg);
  const tabs = [...DB.leagues.map((l) => l.id), 'INTL'];
  const body = (c: Comp) => c.type === 'league' ? <LeagueView comp={c} /> : c.type === 'swiss' ? <SwissView comp={c} /> : c.type === 'bracket' ? <BracketView comp={c} /> : null;
  return (
    <div className="flex flex-col gap-3 stag">
      <div className="chips">{tabs.map((x) => (
        <button key={x} className={`chp ${x === lg ? 'on' : ''}`} data-lg={x} onClick={() => { ui.filters.stLeague = x; refresh(); }}><LeagueBadge id={x} size="xs" />{x === 'INTL' ? 'First Stand / MSI / Worlds' : x}</button>
      ))}</div>
      <div className="gp"><div className="gp-b"><b className="k-title" style={{ fontSize: '.9rem' }}>{t('fmt.title')}</b><p className="muted text-sm mb-0">{t('fmt.' + lg)}</p></div></div>
      {comps.length ? [...comps].reverse().map((c) => (
        <div key={c.id} className="gp">
          <div className="gp-h"><h3 className="k-title flex items-center gap-2"><LeagueBadge id={compLogoId(c)} size="sm" />{compTitle(c)} {y}</h3>{c.done ? <span className="gp-r">{t('st.done')}</span> : <em className="tagx">{t('st.live')}</em>}</div>
          <div className="gp-b" style={{ overflowX: 'auto' }}>{body(c)}</div>
        </div>
      )) : <p className="muted">{t('st.notStarted')}</p>}
    </div>
  );
}
