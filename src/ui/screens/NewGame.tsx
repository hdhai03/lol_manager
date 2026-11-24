import { DB } from '../../engine/data';
import { ROLES, money } from '../../engine/util';
import { t, getLang } from '../../i18n';
import { ui, go, refresh } from '../store';
import { Badge, LangSwitch, LeagueBadge, Face, RoleTag, Ovr, Stars } from '../components';
import { createCareer } from '../actions';
import type { DbPlayer } from '../../engine/types';

function previewTeam(tid: string) {
  const tm = DB.teams[tid];
  const ps = tm.players.map((l) => DB.players[l]).filter(Boolean) as DbPlayer[];
  const starters = ROLES.map((r) => ps.filter((p) => p.role === r).sort((a, b) => b.ovr - a.ovr)[0]).filter(Boolean);
  const ovr = Math.round(starters.reduce((s, p) => s + p.ovr, 0) / Math.max(starters.length, 1));
  return { tm, ps, starters, ovr, salary: ps.reduce((s, p) => s + p.salary, 0) };
}
const leagueIds = (lg: string) => Object.keys(DB.teams).filter((x) => DB.teams[x].league === lg).sort((a, b) => previewTeam(b).ovr - previewTeam(a).ovr);
const level = (x: number, hi: number, lo: number) => (x >= hi ? 'high' : x >= lo ? 'medium' : 'low');

function LeaguePick() {
  return (
    <div className="lg-tiles stag">
      {DB.leagues.map((L) => {
        const n = Object.values(DB.teams).filter((x) => x.league === L.id).length;
        return (
          <button key={L.id} className="lg-tile" data-lg={L.id} onClick={() => { ui.newLeague = L.id; ui.newTeam = null; refresh(); }}>
            <LeagueBadge id={L.id} size="lg" />
            <b>{L.id}</b>
            <span>{L.name}</span>
            <span className="muted text-sm">{L.region} · {t('new.teams', { n })}</span>
            <div className="bar teal"><i style={{ width: `${L.strength * 100}%` }} /></div>
          </button>
        );
      })}
    </div>
  );
}

function TeamPick({ lg }: { lg: string }) {
  const ids = leagueIds(lg);
  const sel = ui.newTeam && ids.includes(ui.newTeam) ? ui.newTeam : ids[0];
  ui.newTeam = sel;
  const pv = previewTeam(sel);
  const L = DB.leagueById[lg];
  const rank = ids.indexOf(sel) + 1;
  const star = [...pv.ps].sort((a, b) => b.ovr - a.ovr)[0];
  const diff = rank <= 2 ? 'easy' : rank <= Math.ceil(ids.length / 2) ? 'normal' : rank < ids.length - 1 ? 'hard' : 'vhard';
  const goal = rank <= 2 ? 'goal.title' : rank <= 4 ? 'goal.contend' : rank <= 6 ? 'goal.playoffs' : 'goal.develop';
  const fin = level(pv.tm.budget - pv.salary * 0.4, 3000, 800);
  const youth = level(pv.ps.filter((p) => (p.age ?? 99) <= 21).reduce((s, p) => s + (p.potential - p.ovr), 0), 25, 8);
  const diffClass = { easy: 'g-green', normal: 'g-blue', hard: 'g-orange', vhard: 'g-red' }[diff];
  const lvlClass = { high: 'g-green', medium: 'g-gold', low: 'g-red' } as const;
  const step = (d: number) => { ui.newTeam = ids[(ids.indexOf(sel) + d + ids.length) % ids.length]; refresh(); };
  return (
    <>
      <div className="pick-grid stag">
        <div className="gp hl row-span-2 items-center justify-center text-center p-4" style={{ gridRow: '1 / 3' }}>
          <div className="k-label flex items-center gap-2"><LeagueBadge id={lg} size="sm" /> {L.region}</div>
          <div className="k-disp text-2xl mt-3">{pv.tm.display || sel}</div>
          <div className="flex items-center gap-3 my-4">
            <button className="arrowb" data-step="-1" aria-label="prev" onClick={() => step(-1)}>‹</button>
            <Badge id={sel} size="hero" />
            <button className="arrowb" data-step="1" aria-label="next" onClick={() => step(1)}>›</button>
          </div>
          <Stars ovr={pv.ovr} />
          <div className="muted mt-2">{L.name}</div>
        </div>
        <div className="gp tile2 items-center text-center">
          <div className="lbl">{t('new.star')}</div><div className="val">{star.ign}</div>
          <div className="my-2"><Face p={{ id: star.link, ign: star.ign }} size="xl" /></div>
          <div className="flex gap-2 items-center"><RoleTag r={star.role} /><Ovr v={star.ovr} /></div>
        </div>
        <div className="gp tile2">
          <div className="lbl">{t('new.strength')}</div><div className="huge">{pv.ovr}</div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
            <div><div className="muted">{t('new.powerRank')}</div><b className="k-num text-xl">#{rank}</b></div>
            <div><div className="muted">{t('new.players')}</div><b className="k-num text-xl">{pv.ps.length}</b></div>
            <div><div className="muted">{t('new.budget')}</div><b className="k-num text-xl">{money(pv.tm.budget)}</b></div>
            <div><div className="muted">{t('new.salary')}</div><b className="k-num text-xl">{money(pv.salary)}</b></div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3" style={{ gridColumn: '2 / 4' }}>
          <div className={`gp tile2 ${diffClass}`}><div className="lbl">{t('new.difficulty')}</div><div className="val">{t('diff.' + diff)}</div></div>
          <div className={`gp tile2 ${lvlClass[fin]}`}><div className="lbl">{t('new.finance')}</div><div className="val">{t('lvl.' + fin)}</div></div>
          <div className={`gp tile2 ${lvlClass[youth]}`}><div className="lbl">{t('new.youth')}</div><div className="val">{t('lvl.' + youth)}</div></div>
          <div className="gp tile2 col-span-2">
            <div className="lbl">{t('new.coach')}: <b className="text-white">{pv.tm.coach || '—'}</b></div>
            <div className="grid grid-cols-5 gap-2 mt-3">{pv.starters.map((p) => (
              <div key={p.link} className="flex flex-col items-center gap-1 text-sm text-center"><Face p={{ id: p.link, ign: p.ign }} size="md" /><b className="truncate max-w-full">{p.ign}</b><RoleTag r={p.role} /></div>
            ))}</div>
          </div>
          <div className="gp tile2"><div className="lbl">{t('dash.board')}</div><div className="val" style={{ fontSize: '1.2rem' }}>{t(goal)}</div></div>
        </div>
      </div>
      <div className="teamstrip">{ids.map((id) => (
        <button key={id} className={id === sel ? 'on' : ''} data-team={id} title={DB.teams[id].display} onClick={() => { ui.newTeam = id; refresh(); }}><Badge id={id} size="md" /></button>
      ))}</div>
      <div className="flex items-end gap-3 flex-wrap justify-end">
        <label className="flex flex-col gap-1 k-label">{t('new.manager')}
          <input id="mgr" className="gin" maxLength={24} placeholder={t('new.managerPh')} defaultValue={ui.mgr} onChange={(e) => { ui.mgr = e.target.value; }} />
        </label>
        <button className="gb primary" data-start style={{ minHeight: '2.9rem', padding: '0 2rem' }}
          onClick={() => createCareer(sel, ui.mgr.trim() || (getLang() === 'vi' ? 'HLV' : 'Coach'))}>{t('new.start')}</button>
      </div>
    </>
  );
}

export function NewGameScreen() {
  const lg = ui.newLeague;
  return (
    <div className="pick">
      <div className="flex justify-between items-center">
        {lg ? <button className="gb ghost sm" data-backlg onClick={() => { ui.newLeague = null; refresh(); }}>‹ {t('new.chooseLeague')}</button>
          : <button className="gb ghost sm" data-menu onClick={() => go('menu')}>‹ {t('menu.back')}</button>}
        <LangSwitch />
      </div>
      <div className="pg-title"><h1>{lg ? t('new.chooseTeam') : t('new.chooseLeague')}</h1></div>
      {lg ? <TeamPick lg={lg} /> : <LeaguePick />}
    </div>
  );
}
