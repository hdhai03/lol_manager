import type { ReactNode } from 'react';
import { Replays } from './Stats';
import { openTeam } from './TeamProfile';
import { DB } from '../../engine/data';
import { S } from '../../engine/state';
import { gprTable, leagueStrength } from '../../engine/gpr';
import { ROLES } from '../../engine/util';
import { t, cname } from '../../i18n';
import { ui, refresh } from '../store';
import { Badge, LeagueBadge, RoleTag } from '../components';
import { fmtD, ordn, pct, relDay } from '../helpers';
import { openPlayer } from './Squad';
import type { Role } from '../../engine/types';

// ---------- BXH sức mạnh toàn cầu ----------
export function Power() {
  const f = ui.filters;
  const g = S.gpr!;
  const snaps = g.snaps.map((sn, i) => ({ i, sn })).filter((x) => x.sn.season === S.season);
  const sel = f.gprSnap ?? null;
  const rows = gprTable(sel).filter((r) => !f.gprLeague || r.league === f.gprLeague);
  const label = sel == null ? t('gpr.current') : t('gpr.after', { phase: t('phase.' + g.snaps[sel].phase) });
  const upd = sel == null ? relDay(S.day) : relDay(g.snaps[sel].day);
  const Ev = ({ k, place }: { k: string; place: number | null }) => (
    <span className={`gp-ev ${place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : ''} ${place ? '' : 'none'}`}>
      {DB.images.leagues[k] ? <LeagueBadge id={k} size="xs" /> : <i>{k === 'FST' ? 'FS' : k[0]}</i>}<b>{place ? ordn(place) : '-'}</b>
    </span>
  );
  return (
    <div className="flex flex-col gap-3 stag">
      <div className="pg-title"><div><h1>{t('gpr.title')}</h1><p>{t('gpr.powered')}</p></div><span className="k-disp text-4xl muted">{S.season}</span></div>
      <div className="gpr-grid">
        <div className="gp gpr-main">
          <div className="gp-h">
            <div className="flex items-center gap-3">
              <select className="gin" data-snap value={sel ?? ''} onChange={(e) => { f.gprSnap = e.target.value === '' ? null : +e.target.value; refresh(); }}>
                <option value="">{t('gpr.current')}</option>
                {snaps.map((x) => <option key={x.i} value={x.i}>{t('gpr.after', { phase: t('phase.' + x.sn.phase) })}</option>)}
              </select>
              <span className="muted text-xs">{t('gpr.updated')}: {fmtD(upd, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {label}</span>
            </div>
            <select className="gin" data-glg value={f.gprLeague ?? ''} onChange={(e) => { f.gprLeague = e.target.value || null; refresh(); }}>
              <option value="">{t('gpr.allLeagues')}</option>{DB.leagues.map((l) => <option key={l.id}>{l.id}</option>)}
            </select>
          </div>
          <div className="gp-b">
            <table className="gt gpr-t"><thead><tr><th>#</th><th>{t('team')}</th><th>{t('gpr.score')}</th><th>{t('gpr.wl')}</th><th>{t('gpr.intl')}</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.team} className={`click ${r.team === S.userTeam ? 'me' : ''}`} data-team={r.team} onClick={() => openTeam(r.team)}>
                  <td className="gp-rank"><b>{r.rank}</b>{r.delta ? <span className={r.delta > 0 ? 'up' : 'down'}>{r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}</span> : null}</td>
                  <td><div className="gp-team"><Badge id={r.team} size="md" /><span><b>{S.teams[r.team].short}</b><small>{r.league}</small></span></div></td>
                  <td className="gp-score">{t('gpr.pts', { n: r.score })}</td>
                  <td>{r.wl[0]}-{r.wl[1]} <span className="muted">({(r.wl[0] / Math.max(1, r.wl[0] + r.wl[1])).toFixed(3).replace(/^0/, '')})</span></td>
                  <td><div className="gp-evs"><Ev k="FST" place={r.intl.fst} /><Ev k="MSI" place={r.intl.msi} /><Ev k="WORLDS" place={r.intl.worlds} /></div></td>
                </tr>
              ))}</tbody></table>
          </div>
        </div>
        <aside className="gp gpr-side"><div className="gp-b gap-2">
          <h3 className="k-title">{t('gpr.what')}</h3><p className="muted text-sm m-0">{t('gpr.whatText')}</p>
          <div className="gp-box"><h4>{t('gpr.teamPerf')}</h4>{['context', 'recent', 'exec', 'opp'].map((k) => <div key={k} className="gp-f"><b>{t('gpr.f.' + k)}</b><span>{t('gpr.fd.' + k)}</span></div>)}</div>
          <div className="gp-box"><h4>{t('gpr.regional')}</h4>{leagueStrength().map((x) => <div key={x.lg} className="gp-lg"><LeagueBadge id={x.lg} size="xs" /><b>{x.lg}:</b> {x.v}</div>)}
            <div className="gp-f"><b>{t('gpr.f.intl')}</b><span>{t('gpr.fd.intl')}</span></div></div>
          <p className="muted text-sm m-0">{t('gpr.formula')}</p>
        </div></aside>
      </div>
    </div>
  );
}

// ---------- Kỷ lục & Vinh danh ----------
interface Who { pid: string; ign: string; team?: string }
const PN = ({ w }: { w?: Who | null }) => (w ? <><b className="plink cursor-pointer" data-player={w.pid} onClick={() => openPlayer(w.pid)}>{w.ign}</b>{w.team && <span className="muted text-xs"> {w.team}</span>}</> : <>—</>);
const mmss = (v: number) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;

export function Records() {
  const f = ui.filters;
  f.recTab ??= 'hall'; f.recLg ??= 'all';
  S.hall ??= []; S.records ??= { game: {}, event: {} }; S.evstats ??= {};
  const tabs = ['hall', 'events', 'records', 'titles', 'career', 'replays'];
  const lgOk = (lg?: string) => f.recLg === 'all' || lg === f.recLg;
  const who = (pid: string): Who => { const p = S.players[pid]; return { pid, ign: p?.ign ?? '?', team: p?.teamId ? S.teams[p.teamId].short : '' }; };
  let body: ReactNode;
  if (f.recTab === 'replays') body = <Replays />;
  else if (f.recTab === 'hall') {
    const list = S.hall.filter((h) => lgOk(h.league));
    body = list.length ? (
      <table className="gt rec-t"><thead><tr><th>{t('rec.event')}</th><th>{t('rec.champ')}</th><th>{t('rec.mvp')}</th><th>{t('rec.fmvp')}</th><th>{t('rec.allpro')}</th><th>{t('rec.rookie')}</th></tr></thead>
        <tbody>{list.map((h, i) => (
          <tr key={i}>
            <td><span className="flex items-center gap-2"><LeagueBadge id={h.league === 'INTL' ? (h.event === 'MSI' ? 'MSI' : h.event === 'Worlds' ? 'WORLDS' : 'FST') : h.league} size="xs" /><b>{h.title}</b> {h.season}</span></td>
            <td><b>{h.champ}</b> <span className="muted text-xs">{t('rec.over')} {h.runner}</span></td>
            <td><PN w={h.mvp} /></td><td><PN w={h.fmvp} /></td>
            <td className="text-sm">{ROLES.filter((r) => h.allpro[r]).map((r) => <div key={r}>{t('roleS.' + r)}: <PN w={h.allpro[r]} /></div>)}</td>
            <td><PN w={h.rookie} /></td>
          </tr>
        ))}</tbody></table>
    ) : <p className="muted">{t('rec.noneYet')}</p>;
  } else if (f.recTab === 'events') {
    const evs = Object.entries(S.evstats).filter(([, E]) => lgOk(E.league));
    f.recEv = evs.some(([k]) => k === f.recEv) ? f.recEv : evs[0]?.[0];
    const E = f.recEv ? S.evstats[f.recEv] : undefined;
    const rows = E ? Object.entries(E.players).map(([pid, r]) => ({ pid, g: r[0], w: r[1], k: r[2], d: r[3], a: r[4], cs: r[5], dmg: r[6], min: r[8], mvp: r[9] })) : [];
    f.recSort ??= 'kda';
    type R = (typeof rows)[number];
    const key: Record<string, (x: R) => number> = { kda: (x) => (x.k + x.a) / Math.max(x.d, 1), k: (x) => x.k, a: (x) => x.a, dpm: (x) => x.dmg / Math.max(x.min, 1), cspm: (x) => x.cs / Math.max(x.min, 1), mvp: (x) => x.mvp, g: (x) => x.g };
    rows.sort((a, b) => key[f.recSort!](b) - key[f.recSort!](a));
    const Th = ({ k, l }: { k: string; l: string }) => <th><button className={f.recSort === k ? 'on' : ''} data-rsort={k} onClick={() => { f.recSort = k; refresh(); }}>{l}</button></th>;
    body = (
      <>
        <div className="chips mb-3">{evs.map(([k]) => <button key={k} className={`chp sm ${k === f.recEv ? 'on' : ''}`} data-rev={k} onClick={() => { f.recEv = k; refresh(); }}>{k}</button>)}{!evs.length && <span className="muted">{t('rec.noneYet')}</span>}</div>
        {rows.length > 0 && (
          <table className="gt rec-t"><thead><tr><th>#</th><th>{t('name')}</th><Th k="g" l={t('p.games')} /><th>{t('st.wr')}</th><Th k="k" l={t('rec.k')} /><Th k="a" l={t('rec.a')} /><Th k="kda" l="KDA" /><Th k="cspm" l={'CS/' + t('min')} /><Th k="dpm" l={t('p.dpmS')} /><Th k="mvp" l="MVP" /></tr></thead>
            <tbody>{rows.slice(0, 60).map((x, i) => {
              const p = S.players[x.pid];
              return (
                <tr key={x.pid} className={p?.teamId === S.userTeam ? 'me' : ''}>
                  <td className="n">{i + 1}</td><td>{p ? <span className="flex items-center gap-2"><RoleTag r={(E!.role?.[x.pid] || p.role) as Role} /><PN w={who(x.pid)} /></span> : '?'}</td>
                  <td className="n">{x.g}</td><td className="n">{pct(x.w / x.g)}</td><td className="n">{x.k}</td><td className="n">{x.a}</td>
                  <td className="n">{((x.k + x.a) / Math.max(x.d, 1)).toFixed(2)}</td><td className="n">{(x.cs / Math.max(x.min, 1)).toFixed(1)}</td><td className="n">{Math.round(x.dmg / Math.max(x.min, 1))}</td><td className="n">{x.mvp}</td>
                </tr>
              );
            })}</tbody></table>
        )}
      </>
    );
  } else if (f.recTab === 'records') {
    const G = S.records.game, E = S.records.event;
    const Card = ({ label, r, fmt = (v: number) => String(v), champ = true }: { label: string; r?: { v: number; pid?: string; ign?: string; team?: string; teams?: string; champ?: string; event: string; season: number }; fmt?: (v: number) => string; champ?: boolean }) => (
      <div className="rec-card"><small>{label}</small><b>{r ? fmt(r.v) : '—'}</b>
        {r && <><div>{r.ign ? <PN w={{ pid: r.pid!, ign: r.ign, team: r.team }} /> : r.teams}{champ && r.champ ? ` · ${cname(r.champ)}` : ''}</div><span className="muted text-xs">{r.event} {r.season}</span></>}</div>
    );
    const k = (v: number) => (v / 1000).toFixed(1) + 'K';
    body = (
      <>
        <h3 className="sub-h">{t('rec.single')}</h3>
        <div className="rec-grid">
          <Card label={t('rec.mostKills')} r={G.kills} /><Card label={t('rec.mostAssists')} r={G.assists} /><Card label={t('rec.mostCs')} r={G.cs} />
          <Card label={t('rec.mostDmg')} r={G.dmg} fmt={k} /><Card label={t('rec.mostGold')} r={G.gold} fmt={k} />
          <Card label={t('rec.longest')} r={G.longest} fmt={mmss} champ={false} /><Card label={t('rec.shortest')} r={G.shortest} fmt={mmss} champ={false} /><Card label={t('rec.bloodiest')} r={G.bloodiest} champ={false} />
        </div>
        <h3 className="sub-h mt-4">{t('rec.inEvent')}</h3>
        <div className="rec-grid"><Card label={t('rec.evKills')} r={E.kills} /><Card label={t('rec.evKda')} r={E.kda} /><Card label={t('rec.evMvps')} r={E.mvps} /></div>
      </>
    );
  } else if (f.recTab === 'titles') {
    const teams = Object.values(S.teams).map((tm) => ({ tm, n: tm.trophies.length, intl: tm.trophies.filter((x) => /^(MSI|Worlds|First Stand)/.test(x)).length })).filter((x) => x.n).sort((a, b) => b.intl - a.intl || b.n - a.n).slice(0, 20);
    const ppl = Object.values(S.players).map((p) => {
      const aw = p.awards || [];
      const cnt = (k: string) => aw.filter((x) => x.startsWith(k + '|')).length;
      return { p, titles: (p.titles || []).length, mvp: cnt('mvp'), fmvp: cnt('fmvp'), allpro: cnt('allpro') };
    }).filter((x) => x.titles || x.mvp || x.fmvp || x.allpro).sort((a, b) => b.mvp * 3 + b.fmvp * 2 + b.titles - (a.mvp * 3 + a.fmvp * 2 + a.titles)).slice(0, 25);
    body = (
      <div className="grid md:grid-cols-2 gap-5">
        <div><h3 className="sub-h">{t('rec.teamTitles')}</h3><table className="gt rec-t"><thead><tr><th>{t('team')}</th><th>{t('rec.titles')}</th><th>{t('rec.intlTitles')}</th></tr></thead>
          <tbody>{teams.map((x) => <tr key={x.tm.id} className={x.tm.id === S.userTeam ? 'me' : ''}><td><div className="nm2"><Badge id={x.tm.id} size="sm" />{x.tm.name}</div></td><td className="n">{x.n}</td><td className="n">{x.intl}</td></tr>)}
            {!teams.length && <tr><td colSpan={3} className="muted">{t('rec.noneYet')}</td></tr>}</tbody></table></div>
        <div><h3 className="sub-h">{t('rec.playerTitles')}</h3><table className="gt rec-t"><thead><tr><th>{t('name')}</th><th>{t('rec.titles')}</th><th>MVP</th><th>{t('rec.fmvpS')}</th><th>All-Pro</th></tr></thead>
          <tbody>{ppl.map((x) => <tr key={x.p.id} className={x.p.teamId === S.userTeam ? 'me' : ''}><td><PN w={who(x.p.id)} /></td><td className="n">{x.titles}</td><td className="n">{x.mvp}</td><td className="n">{x.fmvp}</td><td className="n">{x.allpro}</td></tr>)}
            {!ppl.length && <tr><td colSpan={5} className="muted">{t('rec.noneYet')}</td></tr>}</tbody></table></div>
      </div>
    );
  } else {
    const ps = Object.values(S.players).filter((p) => p.career && p.career.g && !p.retired && lgOk(p.teamId ? S.teams[p.teamId].league : ''));
    const kda = (p: (typeof ps)[number]) => (p.career.k + p.career.a) / Math.max(p.career.d, 1);
    const top = (fn: (p: (typeof ps)[number]) => number, min = 0) => ps.filter((p) => p.career.g >= min).sort((a, b) => fn(b) - fn(a)).slice(0, 10);
    const Box = ({ label, list, fn, fmt = (v: number) => String(v) }: { label: string; list: typeof ps; fn: (p: (typeof ps)[number]) => number; fmt?: (v: number) => string }) => (
      <div className="rec-card list"><small>{label}</small>{list.map((p, i) => <div key={p.id} className="rl"><span>{i + 1}</span><PN w={who(p.id)} /><b>{fmt(fn(p))}</b></div>)}{!list.length && '—'}</div>
    );
    body = (
      <div className="rec-grid">
        <Box label={t('rec.cKills')} list={top((p) => p.career.k)} fn={(p) => p.career.k} />
        <Box label={t('rec.cGames')} list={top((p) => p.career.g)} fn={(p) => p.career.g} />
        <Box label={t('rec.cWins')} list={top((p) => p.career.w)} fn={(p) => p.career.w} />
        <Box label={t('rec.cKda')} list={top(kda, 20)} fn={kda} fmt={(v) => v.toFixed(2)} />
        <Box label={t('rec.cMvp')} list={top((p) => p.career.mvp)} fn={(p) => p.career.mvp} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 stag">
      <div className="pg-title"><div><h1>{t('rec.title')}</h1><p>{t('rec.sub')}</p></div></div>
      <div className="flex justify-between flex-wrap gap-2">
        <div className="chips">{tabs.map((k) => <button key={k} className={`chp ${f.recTab === k ? 'on' : ''}`} data-rtab={k} onClick={() => { f.recTab = k; refresh(); }}>{t('rec.tab.' + k)}</button>)}</div>
        <select className="gin" data-rlg value={f.recLg} onChange={(e) => { f.recLg = e.target.value; refresh(); }}>
          <option value="all">{t('gpr.allLeagues')}</option>
          {[...DB.leagues.map((l) => l.id), 'INTL'].map((l) => <option key={l} value={l}>{l === 'INTL' ? t('sch.intl') : l}</option>)}
        </select>
      </div>
      <div className="gp rec-body"><div className="gp-b" style={{ overflowX: 'auto' }}>{body}</div></div>
    </div>
  );
}
