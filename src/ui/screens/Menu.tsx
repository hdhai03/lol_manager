import { useState } from 'react';
import { DB, champSplash } from '../../engine/data';
import { listSaves, loadSave, deleteSave, importSave } from '../../engine/state';
import { t, cname, getLang } from '../../i18n';
import { go, toast, refresh } from '../store';
import { Badge, Champ, LangSwitch, LeagueBadge, confirmBox } from '../components';
import { startGameUI } from '../actions';

export function MenuScreen() {
  const saves = listSaves();
  const m = DB.meta;
  const top = DB.champList.filter((c) => c.tier === 'S').sort((a, b) => b.presence - a.presence).slice(0, 5);
  const items: { act: string; title: string; desc?: string; disabled?: boolean }[] = [
    ...(saves.length ? [{ act: 'continue', title: t('menu.continue'), desc: `${saves[0].manager} · ${saves[0].team} · ${t('season', { y: saves[0].season })}` }] : []),
    { act: 'new', title: t('menu.new'), desc: t('menu.newDesc') },
    { act: 'load', title: t('menu.load'), desc: t('menu.loadDesc') },
    { act: 'mp', title: t('menu.multiplayer'), desc: t('menu.soon'), disabled: true },
    { act: 'about', title: t('menu.about') },
  ];
  const run = (a: string) => {
    if (a === 'continue') { loadSave(saves[0].slot); startGameUI(); } else go(a as 'new' | 'load' | 'about', { newLeague: null, newTeam: null });
  };
  return (
    <div className="menu">
      <div className="tl"><LangSwitch /></div>
      <div className="stag">
        <div className="brand">
          <div className="logo">LM</div>
          <div><h1>LOL Manager</h1><small><span className="tagx">{t('app.beta')}</span> {t('app.tagline')}</small></div>
        </div>
        <div className="items">
          {items.map((x, i) => (
            <button key={x.act} className="mi" data-act={x.act} disabled={x.disabled} autoFocus={i === 0} onClick={() => run(x.act)}>
              <b>{x.title}</b>{x.desc && <span>{x.desc}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="feat social-w">
        <article className="social">
          <div className="img" style={{ backgroundImage: `url('${champSplash(top[0].id)}')` }} />
          <div className="shade" />
          <span className="flag">{t('menu.new2')}</span>
          <div className="head"><LeagueBadge id="WORLDS" size="md" /><div><b>{t('menu.metaTitle')}</b><small>Patch {m.proPatch}</small></div></div>
          <div className="cap">
            <div className="flex gap-2 mb-3">{top.map((c) => <div key={c.id} className="flex flex-col items-center gap-1 text-xs"><Champ id={c.id} size={52} /><span className="muted">{cname(c.id)}</span></div>)}</div>
            <p>{t('menu.metaBody', { games: m.gamesAnalyzed })}</p>
            <div className="flex gap-2 flex-wrap">{DB.leagues.map((l) => <LeagueBadge key={l.id} id={l.id} size="sm" />)}</div>
          </div>
        </article>
      </div>
      <div className="foot">{t('menu.dataInfo', { teams: Object.keys(DB.teams).length, players: Object.keys(DB.players).length, patch: m.proPatch, games: m.gamesAnalyzed })}</div>
    </div>
  );
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pick" style={{ maxWidth: 980, margin: '0 auto', width: '100%' }}>
      <div className="flex justify-between items-center"><button className="gb ghost sm" data-back onClick={() => go('menu')}>‹ {t('menu.back')}</button><LangSwitch /></div>
      <div className="pg-title"><h1>{title}</h1></div>
      {children}
    </div>
  );
}

export function AboutScreen() {
  return (
    <Page title={t('about.title')}>
      <div className="gp"><div className="gp-b">
        <p>{t('about.body')}</p><p className="muted text-sm">{t('about.riot')}</p>
        <p className="muted text-sm">Data Dragon {String(DB.meta.ddragon ?? "")} · {String(DB.meta.generated ?? "").slice(0, 10)}</p>
      </div></div>
    </Page>
  );
}

export function LoadScreen() {
  const [, bump] = useState(0);
  const saves = listSaves();
  return (
    <Page title={t('load.title')}>
      <div className="gp"><div className="gp-b gap-1">
        {saves.length ? saves.map((s) => (
          <div key={s.slot} className="flex items-center gap-3 py-2 border-b border-line">
            <Badge id={s.team} />
            <div className="grow min-w-0">
              <b>{s.slot === 'auto' ? t('load.slot.auto') : t('load.slot', { n: s.slot })}</b>
              <div className="muted text-sm">{s.manager} · {s.team} · {t('season', { y: s.season })} · {t('phase.' + s.phase)} · {new Date(s.savedAt).toLocaleString(getLang())}</div>
            </div>
            <button className="gb primary sm" data-load={s.slot} onClick={() => { loadSave(s.slot); startGameUI(); }}>{t('load.load')}</button>
            <button className="gb ghost danger sm" onClick={async () => { if (await confirmBox(t('load.confirmDelete'))) { deleteSave(s.slot); bump((x) => x + 1); refresh(); } }}>{t('load.delete')}</button>
          </div>
        )) : <p className="muted">{t('load.empty')}</p>}
      </div></div>
      <label className="gb self-start">{t('load.import')}<input type="file" accept=".json,application/json" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) f.text().then((txt) => { try { importSave(txt); startGameUI(); } catch { toast(t('load.bad'), 'err'); } });
      }} /></label>
    </Page>
  );
}
