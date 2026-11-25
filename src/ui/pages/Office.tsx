import { useState } from 'react';
import { openTeam } from './TeamProfile';
import { DB, itemImg, champArt, refreshOpgg } from '../../engine/data';
import { opgg, opggPos, tierList, TIER_L } from '../../engine/runes';
import { S, userTeam, teamOvr, teamPlayers, teamSalary } from '../../engine/state';
import { ROLES, money } from '../../engine/util';
import { t, cname, iname, getLang } from '../../i18n';
import { ui, refresh } from '../store';
import { Badge, Champ, Face, FormArrow, LeagueBadge, Ovr, RoleIcon, RoleTag, RunePage } from '../components';
import { fullMoney, pct } from '../helpers';
import { SearchBox } from './Transfers';
import { openPlayer } from './Squad';
import type { Player, Role } from '../../engine/types';

// ---------- Tướng & Meta ----------
const ago = (iso?: string): string => {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  const vi = getLang() === 'vi';
  return m < 60 ? (vi ? `${m} phút trước` : `${m} min ago`) : m < 2880 ? (vi ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 60)} h ago`) : (vi ? `${Math.round(m / 1440)} ngày trước` : `${Math.round(m / 1440)} d ago`);
};
function ProTable({ role, q }: { role: string; q: string }) {
  const order: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  let list = DB.champList.filter((x) => role === 'all' || x.roles.includes(role as Role));
  if (q) { const ql = q.toLowerCase(); list = list.filter((x) => x.name.toLowerCase().includes(ql) || x.nameVi.toLowerCase().includes(ql)); }
  list.sort((a, b) => order[a.tier] - order[b.tier] || b.presence - a.presence);
  return (
    <>
      <p className="muted text-sm mt-0">{t('meta.desc', { games: DB.meta.gamesAnalyzed, patch: DB.meta.proPatch })}</p>
      <table className="gt meta"><thead><tr><th>{t('meta.tier')}</th><th /><th>{t('name')}</th><th>{t('role')}</th><th>{t('meta.presence')}</th><th>{t('meta.picks')}</th><th>{t('meta.bans')}</th><th>{t('meta.wr')}</th><th>{t('meta.build')}</th></tr></thead>
        <tbody>{list.map((x) => (
          <tr key={x.id}>
            <td><b className={`tl-l t-${x.tier}`}>{x.tier}</b></td><td><Champ id={x.id} size={36} /></td>
            <td><b>{cname(x.id)}</b><div className="muted text-xs">{getLang() === 'vi' ? x.titleVi : x.title}</div></td>
            <td><div className="flex gap-2">{x.roles.map((r) => <RoleTag key={r} r={r} />)}</div></td>
            <td className="n">{pct(x.presence)}</td><td className="n">{x.picks}</td><td className="n">{x.bans}</td><td className="n">{x.picks ? pct(x.wr) : '-'}</td>
            <td className="build"><div className="flex gap-1">{x.build.slice(0, 5).map((i) => DB.items[i] ? <img key={i} loading="lazy" src={itemImg(i)} width={24} height={24} alt={iname(i)} title={iname(i)} className="rounded-sm" /> : null)}</div></td>
          </tr>
        ))}</tbody></table>
    </>
  );
}
function ChampDetail({ id, role }: { id: string; role: Role }) {
  const c = DB.champions[id];
  const e = opggPos(id, role);
  return (
    <div className="mt-det">
      <div className="mt-hero" style={{ backgroundImage: `url('${champArt(id)}')` }}>
        <div className="mt-hero-t"><RoleTag r={role} /><b className="k-disp">{cname(id)}</b><small>{getLang() === 'vi' ? c?.titleVi : c?.title}</small></div>
        {e && <b className={`tl-l big t-${TIER_L[e.tier - 1] || 'D'}`}>{TIER_L[e.tier - 1] || 'D'}</b>}
      </div>
      {e ? (
        <>
          <div className="mt-stats">
            <div><small>{t('mt.wr')}</small><b className={e.wr >= 0.51 ? 'up' : e.wr < 0.49 ? 'down' : ''}>{pct(e.wr, 1)}</b></div>
            <div><small>{t('mt.pr')}</small><b>{pct(e.pr, 1)}</b></div>
            <div><small>{t('mt.br')}</small><b>{pct(e.br, 1)}</b></div>
            <div><small>{t('mt.rank')}</small><b>#{e.rank}</b></div>
          </div>
          {!!e.counters?.length && <div className="mt-sec"><h4>{t('mt.counters')}</h4><div className="flex gap-2">{e.counters.map((x) => <Champ key={x} id={x} size={34} />)}</div></div>}
          <div className="mt-sec"><h4>{t('mt.runes')}</h4>
            {e.runes?.length ? <div className="mt-runes">{e.runes.map((r, i) => <RunePage key={i} r={r} foot={<><span>{pct(r.pick, 0)} {t('mt.pr').toLowerCase()}</span><b className={r.wr >= 0.51 ? 'up' : r.wr < 0.49 ? 'down' : ''}>{pct(r.wr, 1)}</b></>} />)}</div> : <p className="muted text-sm">—</p>}
          </div>
        </>
      ) : <p className="muted text-sm">{t('mt.noData')}</p>}
      {c && c.picks + c.bans > 0 && (
        <div className="mt-sec"><h4>{t('mt.proStats')}</h4>
          <div className="mt-stats sm"><div><small>{t('meta.presence')}</small><b>{pct(c.presence)}</b></div><div><small>{t('meta.picks')}</small><b>{c.picks}</b></div><div><small>{t('meta.bans')}</small><b>{c.bans}</b></div><div><small>{t('meta.wr')}</small><b>{c.picks ? pct(c.wr) : '-'}</b></div></div>
          <div className="flex gap-1 mt-2">{c.build.slice(0, 6).map((i) => DB.items[i] ? <img key={i} loading="lazy" src={itemImg(i)} width={28} height={28} alt={iname(i)} title={iname(i)} className="rounded-sm" /> : null)}</div>
        </div>
      )}
    </div>
  );
}
export function Meta() {
  const f = ui.filters;
  f.mRole ??= 'Mid'; f.mQ ??= ''; f.mView ??= opgg() ? 'solo' : 'pro';
  const o = opgg();
  const role = (f.mRole === 'all' ? 'Mid' : f.mRole) as Role;
  const rows = f.mView === 'solo' ? tierList(role).filter(({ id }) => !f.mQ || cname(id).toLowerCase().includes(f.mQ.toLowerCase()) || id.toLowerCase().includes(f.mQ.toLowerCase())) : [];
  const sel = f.mSel && opggPos(f.mSel, role) ? f.mSel : rows[0]?.id;
  const [busy, setBusy] = useState(false);
  return (
    <div className="gp fill stag mt-page">
      <div className="gp-h"><h3 className="k-title">{t('meta.title')}</h3>
        <div className="flex gap-2 items-center flex-wrap">
          {o && <div className="chips">{(['solo', 'pro'] as const).map((v) => <button key={v} className={`chp sm ${f.mView === v ? 'on' : ''}`} data-mv={v} onClick={() => { f.mView = v; if (v === 'solo' && f.mRole === 'all') f.mRole = 'Mid'; refresh(); }}>{t('mt.' + v)}</button>)}</div>}
          <div className="chips">
            {f.mView === 'pro' && <button className={`chp sm ${f.mRole === 'all' ? 'on' : ''}`} data-r="all" onClick={() => { f.mRole = 'all'; refresh(); }}>{t('tr.all')}</button>}
            {ROLES.map((r) => <button key={r} className={`chp sm ${f.mRole === r ? 'on' : ''}`} data-r={r} title={t('role.' + r)} onClick={() => { f.mRole = r; f.mSel = null; refresh(); }}><span className={`role-${r}`}><RoleIcon r={r} /></span></button>)}
          </div>
          <SearchBox value={f.mQ} placeholder={t('meta.search')} onChange={(v) => { f.mQ = v; refresh(); }} />
        </div>
      </div>
      {f.mView === 'pro' || !o ? <div className="gp-b scroll"><ProTable role={f.mRole!} q={f.mQ} /></div> : (
        <div className="gp-b mt-body">
          <div className="mt-left">
            <div className="mt-src">
              <span>{t('mt.src', { region: o.meta.region, tier: o.meta.tier, patch: o.meta.patch || '?', n: (o.meta.matches || 0).toLocaleString() })}</span>
              <span className="muted">· {t('mt.upd', { when: ago(o.meta.fetched) })} ({t(o.meta.live ? 'mt.live' : 'mt.snap')})</span>
              <button className="gb ghost xs" data-mrefresh disabled={busy} onClick={() => { setBusy(true); void refreshOpgg(true).finally(() => { setBusy(false); refresh(); }); }}>{busy ? '…' : t('mt.refresh')}</button>
            </div>
            <div className="tl">
              {TIER_L.map((L, ti) => {
                const list = rows.filter((x) => x.e.tier === ti + 1);
                if (!list.length) return null;
                return (
                  <div key={L} className={`tl-row t-${L}`}>
                    <b className={`tl-l t-${L}`}>{L}</b>
                    <div className="tl-ch">{list.map(({ id, e }) => (
                      <button key={id} className={`tl-c ${id === sel ? 'on' : ''}`} data-mc={id} title={cname(id)} onClick={() => { f.mSel = id; refresh(); }}>
                        <Champ id={id} size={46} /><small className={e.wr >= 0.51 ? 'up' : e.wr < 0.49 ? 'down' : ''}>{(e.wr * 100).toFixed(1)}</small>
                      </button>
                    ))}</div>
                  </div>
                );
              })}
            </div>
            <p className="muted text-xs mt-3">{t('mt.hint')}</p>
          </div>
          <div className="mt-right">{sel ? <ChampDetail id={sel} role={role} /> : <p className="muted">{t('mt.pick')}</p>}</div>
        </div>
      )}
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
          <tr key={r.id} className={`click ${r.id === S.userTeam ? 'me' : ''}`} data-team={r.id} onClick={() => openTeam(r.id)}><td className="n">{i + 1}</td><td><div className="nm2"><Badge id={r.id} size="sm" />{S.teams[r.id].name}</div></td><td><LeagueBadge id={S.teams[r.id].league} size="xs" /></td><td><Ovr v={r.ovr} /></td></tr>
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
