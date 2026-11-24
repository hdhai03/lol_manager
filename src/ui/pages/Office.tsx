import { DB, itemImg } from '../../engine/data';
import { S, userTeam, teamOvr, teamPlayers, teamSalary } from '../../engine/state';
import { ROLES, money } from '../../engine/util';
import { t, cname, iname, getLang } from '../../i18n';
import { ui, refresh } from '../store';
import { Badge, Champ, Face, FormArrow, LeagueBadge, Ovr, RoleIcon, RoleTag } from '../components';
import { fullMoney, pct } from '../helpers';
import { SearchBox } from './Transfers';
import { openPlayer } from './Squad';
import type { Player } from '../../engine/types';

// ---------- Tướng & Meta ----------
export function Meta() {
  const f = ui.filters;
  f.mRole ??= 'all'; f.mQ ??= '';
  const order: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  let list = DB.champList.filter((x) => f.mRole === 'all' || x.roles.includes(f.mRole!));
  if (f.mQ) { const q = f.mQ.toLowerCase(); list = list.filter((x) => x.name.toLowerCase().includes(q) || x.nameVi.toLowerCase().includes(q)); }
  list.sort((a, b) => order[a.tier] - order[b.tier] || b.presence - a.presence);
  return (
    <div className="gp stag">
      <div className="gp-h"><h3 className="k-title">{t('meta.title')}</h3>
        <div className="flex gap-2 items-center">
          <div className="chips">
            <button className={`chp sm ${f.mRole === 'all' ? 'on' : ''}`} data-r="all" onClick={() => { f.mRole = 'all'; refresh(); }}>{t('tr.all')}</button>
            {ROLES.map((r) => <button key={r} className={`chp sm ${f.mRole === r ? 'on' : ''}`} data-r={r} title={t('role.' + r)} onClick={() => { f.mRole = r; refresh(); }}><RoleIcon r={r} /></button>)}
          </div>
          <SearchBox value={f.mQ} placeholder={t('meta.search')} onChange={(v) => { f.mQ = v; refresh(); }} />
        </div>
      </div>
      <div className="gp-b">
        <p className="muted text-sm mt-0">{t('meta.desc', { games: DB.meta.gamesAnalyzed, patch: DB.meta.proPatch })}</p>
        <table className="gt meta"><thead><tr><th>{t('meta.tier')}</th><th /><th>{t('name')}</th><th>{t('role')}</th><th>{t('meta.presence')}</th><th>{t('meta.picks')}</th><th>{t('meta.bans')}</th><th>{t('meta.wr')}</th><th>{t('meta.build')}</th></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.id}>
              <td><span className={`tier t-${x.tier}`}>{x.tier}</span></td><td><Champ id={x.id} size={36} /></td>
              <td><b>{cname(x.id)}</b><div className="muted text-xs">{getLang() === 'vi' ? x.titleVi : x.title}</div></td>
              <td><div className="flex gap-1">{x.roles.map((r) => <RoleTag key={r} r={r} />)}</div></td>
              <td className="n">{pct(x.presence)}</td><td className="n">{x.picks}</td><td className="n">{x.bans}</td><td className="n">{x.picks ? pct(x.wr) : '-'}</td>
              <td className="build"><div className="flex gap-1">{x.build.slice(0, 5).map((i) => DB.items[i] ? <img key={i} loading="lazy" src={itemImg(i)} width={24} height={24} alt={iname(i)} title={iname(i)} className="rounded-sm" /> : null)}</div></td>
            </tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

// ---------- Thế giới ----------
function PlayerLine({ p, extra }: { p: Player; extra: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-line cursor-pointer" data-player={p.id} onClick={() => openPlayer(p.id)}>
      <Face p={p} size="sm" /><RoleTag r={p.role} />
      <div className="grow min-w-0"><b>{p.ign}</b><div className="muted text-xs">{p.teamId ? S.teams[p.teamId].short : t('p.freeAgent')} · {t('age')} {p.age}</div></div>
      <FormArrow f={p.form} /><Ovr v={p.ovr} /><b className="k-num" style={{ minWidth: 40, textAlign: 'right' }}>{extra}</b>
    </div>
  );
}
export function World() {
  const ranks = Object.values(S.teams).map((x) => ({ id: x.id, ovr: teamOvr(x) })).sort((a, b) => b.ovr - a.ovr).slice(0, 20);
  const pls = Object.values(S.players).filter((p) => p.teamId && p.season.g >= 3);
  const leader = (fn: (p: Player) => number, n = 5) => [...pls].sort((a, b) => fn(b) - fn(a)).slice(0, n);
  const kda = (p: Player) => (p.season.k + p.season.a) / Math.max(p.season.d, 1);
  return (
    <div className="grid lg:grid-cols-2 gap-4 stag">
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('world.powerRank')}</h3></div>
        <div className="gp-b"><table className="gt"><tbody>{ranks.map((r, i) => (
          <tr key={r.id} className={r.id === S.userTeam ? 'me' : ''}><td className="n">{i + 1}</td><td><div className="nm2"><Badge id={r.id} size="sm" />{S.teams[r.id].name}</div></td><td><LeagueBadge id={S.teams[r.id].league} size="xs" /></td><td><Ovr v={r.ovr} /></td></tr>
        ))}</tbody></table></div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('world.history')}</h3></div>
          <div className="gp-b">{S.history.length ? S.history.slice(0, 30).map((h, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-line"><Badge id={h.champ} size="sm" /><b className="grow">{S.teams[h.champ].name}</b><span className="muted text-sm">{h.title}</span></div>
          )) : <p className="muted">{t('world.noHistory')}</p>}</div>
        </div>
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('world.leaders')}</h3></div>
          <div className="gp-b">
            <div className="sub-h">{t('p.kda')}</div>{leader(kda).map((p) => <PlayerLine key={p.id} p={p} extra={kda(p).toFixed(2)} />)}
            <div className="sub-h mt-3">{t('p.mvp')}</div>{leader((p) => p.season.mvp).map((p) => <PlayerLine key={p.id} p={p} extra={String(p.season.mvp)} />)}
            {!pls.length && <p className="muted">—</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Tài chính ----------
export function Finance() {
  const ut = userTeam();
  const pay = teamSalary(ut);
  const Big = ({ l, v, cls = '' }: { l: string; v: string; cls?: string }) => (
    <div className="gp"><div className="gp-b"><span className="k-label">{l}</span><b className={`k-disp mt-1 ${cls}`} style={{ fontSize: 'clamp(1.2rem, 2vw, 1.8rem)' }}>{v}</b></div></div>
  );
  return (
    <div className="flex flex-col gap-4 stag">
      <div className="grid md:grid-cols-4 gap-3">
        <Big l={t('fin.balance')} v={fullMoney(ut.budget)} cls={ut.budget < 0 ? 'neg' : ''} />
        <Big l={t('fin.payroll')} v={fullMoney(pay)} />
        <Big l={t('fin.sponsorY')} v={fullMoney(ut.sponsor)} />
        <Big l={t('fin.net')} v={fullMoney(ut.sponsor - pay)} cls={ut.sponsor - pay < 0 ? 'neg' : 'pos'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('fin.log')}</h3></div>
          <div className="gp-b">{S.finance.filter((x) => x.amount).slice(0, 60).map((x, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-line"><span className="grow">{t(x.key, x.params || {})}</span><span className="muted text-xs">{t('season', { y: x.season })}</span><b className={`k-num ${x.amount < 0 ? 'neg' : 'pos'}`}>{x.amount > 0 ? '+' : ''}{money(x.amount)}</b></div>
          ))}{!S.finance.some((x) => x.amount) && <p className="muted">—</p>}</div>
        </div>
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('fin.contracts')}</h3></div>
          <div className="gp-b"><table className="gt"><thead><tr><th>{t('player')}</th><th>{t('role')}</th><th>{t('salary')}</th><th>{t('contract')}</th><th>{t('value')}</th></tr></thead>
            <tbody>{teamPlayers(ut).map((p) => (
              <tr key={p.id} className="click" data-player={p.id} onClick={() => openPlayer(p.id)}>
                <td><div className="nm2"><Face p={p} size="xs" />{p.ign}</div></td><td><RoleTag r={p.role} /></td><td className="n">{money(p.salary)}</td><td className="n">{p.contractUntil}</td><td className="n">{money(p.value)}</td>
              </tr>
            ))}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
