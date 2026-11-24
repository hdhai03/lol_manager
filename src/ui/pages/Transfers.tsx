import { useEffect, useState } from 'react';
import { DB } from '../../engine/data';
import { S, userTeam } from '../../engine/state';
import { askingPrice } from '../../engine/season';
import { ROLES, clamp, money } from '../../engine/util';
import { t } from '../../i18n';
import { ui, refresh } from '../store';
import { Cc, RoleIcon, faceSrc } from '../components';
import { pct, simLine } from '../helpers';
import { offerModal, openPlayer } from './Squad';
import type { Player } from '../../engine/types';

/** ô tìm kiếm có trễ (không mất focus khi gõ) */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  useEffect(() => { const h = setTimeout(() => { if (v !== value) onChange(v); }, 250); return () => clearTimeout(h); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="search" className="gin" placeholder={placeholder} value={v} data-q onChange={(e) => setV(e.target.value)} />;
}

function PCard({ p, rank }: { p: Player; rank: number }) {
  const rec = simLine(p.season) || simLine(p.career);
  const fs = faceSrc(p);
  return (
    <div className="pcard" data-player={p.id} onClick={() => openPlayer(p.id)}>
      <div className="ph">{fs ? <img src={fs} alt="" /> : <span className="ini">{p.ign.slice(0, 2).toUpperCase()}</span>}<span className="o">{p.ovr}</span></div>
      <div className="bd">
        <div className="flex items-center gap-2"><span className="k-label" style={{ fontSize: '.7rem' }}>#{rank}</span><span className="grow" /><span className="flex items-center gap-1 text-sm"><RoleIcon r={p.role} />{p.teamId ? S.teams[p.teamId].short : t('p.freeAgent')}</span></div>
        <b className="n">{p.ign}</b>
        <div className="m"><Cc country={p.country} />{t('age')} {p.age} · POT {p.potential}</div>
        <div className="m">{rec ? `${rec.g} ${t('p.games').toLowerCase()} · ${pct(rec.wr)} · KDA ${rec.kda}` : p.rookie ? t('p.rookie') : '—'}</div>
        <div className="price">
          <b>{!p.teamId && <span className="muted text-xs mr-1">{t('salary')}</span>}{money(p.teamId ? askingPrice(p) : p.salary)}</b>
          <button className="gb primary xs" data-offer={p.id} onClick={(e) => { e.stopPropagation(); offerModal(p.id); }}>{p.teamId ? t('tr.offer') : t('p.sign')}</button>
        </div>
      </div>
    </div>
  );
}

export function Transfers() {
  const f = ui.filters;
  f.trRole ??= 'all'; f.trLeague ??= 'all'; f.trSort ??= 'ovr'; f.trQ ??= ''; f.trPage ??= 0;
  const q = f.trQ.toLowerCase();
  let list = Object.values(S.players).filter((p) => !p.retired && p.teamId !== S.userTeam && (p.teamId || S.freeAgents.includes(p.id)));
  if (f.trRole !== 'all') list = list.filter((p) => p.role === f.trRole);
  if (f.trLeague === 'FA') list = list.filter((p) => !p.teamId);
  else if (f.trLeague !== 'all') list = list.filter((p) => p.teamId && S.teams[p.teamId].league === f.trLeague);
  if (q) list = list.filter((p) => p.ign.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.teamId || '').toLowerCase().includes(q));
  const key = { ovr: (p: Player) => -p.ovr, pot: (p: Player) => -p.potential, val: (p: Player) => -(p.teamId ? askingPrice(p) : p.value), age: (p: Player) => p.age }[f.trSort];
  list.sort((a, b) => key(a) - key(b));
  const per = 12;
  const pages = Math.max(1, Math.ceil(list.length / per));
  f.trPage = clamp(f.trPage, 0, pages - 1);
  const shown = list.slice(f.trPage * per, f.trPage * per + per);
  const set = (patch: Partial<typeof f>) => { Object.assign(f, { trPage: 0 }, patch); refresh(); };
  return (
    <div className="gp fill stag">
      <div className="gp-h">
        <h3 className="k-title">{t('tr.title')}</h3>
        <div className="gp-r">
          <span>{t('top.budget')} <b className="text-white">{money(userTeam().budget)}</b></span>
          <span>{t('tr.players', { n: list.length, p: f.trPage + 1, pages })}</span>
          <button className="arrowb" data-page="-1" disabled={f.trPage === 0} aria-label="prev" onClick={() => { f.trPage!--; refresh(); }}>‹</button>
          <button className="arrowb" data-page="1" disabled={f.trPage >= pages - 1} aria-label="next" onClick={() => { f.trPage!++; refresh(); }}>›</button>
        </div>
      </div>
      <div className="gp-b gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="chips">
            <button className={`chp sm ${f.trRole === 'all' ? 'on' : ''}`} data-role="all" onClick={() => set({ trRole: 'all' })}>{t('tr.all')}</button>
            {ROLES.map((r) => <button key={r} className={`chp sm ${f.trRole === r ? 'on' : ''}`} data-role={r} title={t('role.' + r)} onClick={() => set({ trRole: r })}><RoleIcon r={r} /></button>)}
          </div>
          <div className="chips">{['all', ...DB.leagues.map((l) => l.id), 'FA'].map((x) => (
            <button key={x} className={`chp sm ${f.trLeague === x ? 'on' : ''}`} data-lg={x} onClick={() => set({ trLeague: x })}>{x === 'all' ? t('tr.all') : x === 'FA' ? t('tr.free') : x}</button>
          ))}</div>
          <span className="grow" />
          <SearchBox value={f.trQ} placeholder={t('tr.search')} onChange={(v) => set({ trQ: v })} />
          <select className="gin" data-sort value={f.trSort} onChange={(e) => set({ trSort: e.target.value as typeof f.trSort })}>
            {(['ovr', 'pot', 'val', 'age'] as const).map((s) => <option key={s} value={s}>{t('tr.sort' + s[0].toUpperCase() + s.slice(1))}</option>)}
          </select>
        </div>
        <div className="pcards fill" style={{ overflowY: 'auto' }}>{shown.map((p, i) => <PCard key={p.id} p={p} rank={f.trPage! * per + i + 1} />)}</div>
      </div>
    </div>
  );
}
