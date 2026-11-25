// Ban huấn luyện + lộ trình phát triển cá nhân + cho mượn
import { S, userTeam, teamPlayers } from '../../engine/state';
import { academyPlayers } from '../../engine/academy';
import { STAFF, STAFF_COST, STAFF_HIRE, staffLv, setStaff, DEV_FOCUS, devOf, setDev, devRate, loanTargets, loanOut, type DevFocus } from '../../engine/staff';
import { TICKS } from '../../engine/career';
import { t } from '../../i18n';
import { openModal, refresh, toast } from '../store';
import { Badge, Face, LeagueBadge, RoleTag } from '../components';
import { fullMoney } from '../helpers';
import { teamOvr } from '../../engine/state';
import { openPlayer } from './Squad';

const ICON: Record<string, string> = { assistant: '✎', analyst: '◈', psych: '❤', fitness: '⚡' };
export function Staff() {
  const ut = userTeam();
  return (
    <div className="stf stag">
      {STAFF.map((k) => {
        const lv = staffLv(k);
        return (
          <div key={k} className={`gp stf-c k-${k}`}>
            <div className="gp-b">
              <div className="stf-h"><span className="stf-i">{ICON[k]}</span><div><b>{t('stf.' + k)}</b><small className="muted">{t('stf.' + k + 'D')}</small></div></div>
              <div className="stf-lv">{[0, 1, 2, 3].map((l) => (
                <button key={l} className={`stf-b ${lv === l ? 'on' : ''} ${l <= lv ? 'fill' : ''}`} data-staff={`${k}:${l}`} disabled={l > lv && ut.budget < STAFF_HIRE[l]}
                  onClick={() => { if (!setStaff(k, l)) toast(t('tr.noBudget'), 'err'); refresh(); }}>
                  <b>{t('stf.lv' + l)}</b><small>{l ? `${fullMoney(STAFF_COST[l] * TICKS)}/${t('br.season')}` : '—'}</small>
                </button>
              ))}</div>
              <p className="stf-eff">{t('stf.' + k + 'E', { n: lv, pct: lv * 20 })}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** khối lộ trình cá nhân (trang Luyện tập) */
export function DevPlans() {
  const ps = [...teamPlayers(userTeam()), ...academyPlayers()];
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('dev.title')}</h3></div>
      <div className="gp-b">
        <p className="muted text-sm mt-0">{t('dev.hint')}</p>
        <div className="dev-list">{ps.map((p) => {
          const d = devOf(p.id);
          return (
            <div key={p.id} className="dev-row">
              <span className="sq-p" onClick={() => openPlayer(p.id)}><RoleTag r={p.role} /><Face p={p} size="sm" /><b>{p.ign}</b>{p.academyOf && <em className="tagx">{t('ac.tag')}</em>}</span>
              <select className="gin sm" value={d?.focus || ''} data-dev={p.id} onChange={(e) => { setDev(p.id, (e.target.value || null) as DevFocus | null); refresh(); }}>
                <option value="">{t('dev.none')}</option>
                {DEV_FOCUS.map((f) => <option key={f} value={f}>{t('dev.' + f)}</option>)}
              </select>
              <div className="dev-bar">{d ? <><div className="mtr rep"><i style={{ width: `${d.prog}%` }} /></div><small className="muted">{Math.round(d.prog)}% · +{devRate(p)}/{t('dev.day')}</small></> : <small className="muted">—</small>}</div>
            </div>
          );
        })}</div>
      </div>
    </div>
  );
}

export function loanModal(pid: string): void {
  const p = S.players[pid];
  const opts = loanTargets(p);
  openModal((close) => (
    <div className="flex flex-col gap-3">
      <h3>{t('loan.title', { player: p.ign })}</h3>
      <p className="muted text-sm m-0">{t('loan.hint')}</p>
      {opts.length ? opts.map((id) => {
        const tm = S.teams[id];
        const cur = tm.lineup[p.role] ? S.players[tm.lineup[p.role]!] : null;
        return (
          <div key={id} className="car-o">
            <Badge id={id} size="md" />
            <div className="grow min-w-0"><b>{tm.name}</b><div className="muted text-xs flex items-center gap-2"><LeagueBadge id={tm.league} size="xs" />OVR {teamOvr(tm)} · {t('loan.replaces')}: {cur ? `${cur.ign} (${cur.ovr})` : '—'}</div></div>
            <button className="gb primary sm" data-loan={id} onClick={() => { if (loanOut(pid, id)) { toast(t('loan.done', { team: tm.name }), 'ok'); close(); refresh(); } }}>{t('loan.go')}</button>
          </div>
        );
      }) : <p className="muted">{t('loan.none')}</p>}
    </div>
  ), { wide: true });
}
