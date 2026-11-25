// CLB (mở rộng): hội đồng quản trị, đầu tư dài hạn (trung tâm tuyển trạch, vay vốn), cột mốc sự nghiệp, so sánh tuyển thủ.
import { useState } from 'react';
import { S, userTeam } from '../../engine/state';
import { boardOf, sackLine, buildHub, hasHub, HUB_COST, HUB_UPKEEP, LOAN_OPTS, LOAN_RATE, takeLoan } from '../../engine/club2';
import { SERVERS } from '../../engine/academy';
import { ATTR_GROUPS, clamp, money as kmoney } from '../../engine/util';
import { groupScore } from '../../engine/attrs';
import { t } from '../../i18n';
import { refresh, toast, openModal } from '../store';
import { Face, RoleTag } from '../components';
import { fullMoney, vClass } from '../helpers';
import { openPlayer } from './Squad';
import type { AttrGroup, Player } from '../../engine/types';

export function BoardCard() {
  const ut = userTeam();
  const b = boardOf(ut.id);
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('brd.title')}</h3><span className="brd-tag">{t('brd.' + b)}</span></div>
      <div className="gp-b"><p className="text-sm m-0">{t('brd.' + b + 'D')}</p><p className="muted text-xs m-0 mt-1">{t('brd.line', { n: sackLine(ut.id), c: Math.round(S.career?.conf ?? 0) })}</p></div>
    </div>
  );
}

export function Investments() {
  const ut = userTeam();
  const L = S.bankLoan;
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('inv.title')}</h3></div>
      <div className="gp-b gap-3">
        <div>
          <div className="sub-h">{t('inv.hubs')}</div>
          <p className="muted text-xs m-0 mb-1">{t('inv.hubsD', { cost: fullMoney(HUB_COST), up: fullMoney(HUB_UPKEEP) })}</p>
          <div className="chips">{SERVERS.map((sv) => (
            <button key={sv} className={`chp sm ${hasHub(sv) ? 'on' : ''}`} data-hub={sv} disabled={hasHub(sv) || ut.budget < HUB_COST} onClick={() => { if (buildHub(sv)) toast(t('inv.hubOk', { sv }), 'ok'); refresh(); }}>{sv}{hasHub(sv) ? ' ✓' : ''}</button>
          ))}</div>
        </div>
        <div>
          <div className="sub-h">{t('inv.loan')}</div>
          {L ? <p className="text-sm m-0">{t('inv.loanLeft', { left: fullMoney(L.left), per: fullMoney(L.per) })}</p> : (
            <>
              <p className="muted text-xs m-0 mb-1">{t('inv.loanD', { r: Math.round(LOAN_RATE * 100) })}</p>
              <div className="chips">{LOAN_OPTS.map((a) => <button key={a} className="chp sm" data-loan={a} onClick={() => { if (takeLoan(a)) toast(t('inv.loanOk'), 'ok'); refresh(); }}>{fullMoney(a)}</button>)}</div>
            </>
          )}
          {ut.budget < 0 && <p className="text-xs m-0 mt-1" style={{ color: '#ff8f8f' }}>{t('inv.debt')}</p>}
        </div>
      </div>
    </div>
  );
}

export function MilestoneFeed() {
  const f = S.mileFeed || [];
  if (!f.length) return null;
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('mile.title')}</h3></div>
      <div className="gp-b"><div className="mile-g">{f.map((x, i) => {
        const p = S.players[x.pid];
        if (!p) return null;
        const k = x.id.replace(/\d+$/, ''), n = x.id.slice(k.length);
        return (
          <button key={i} className="mile-c" onClick={() => openPlayer(p.id)}>
            <Face p={p} size="md" /><div className="min-w-0"><b>{p.ign}</b><span className="k-disp">{n}</span><small>{t('mile.' + k)}</small></div>
          </button>
        );
      })}</div></div>
    </div>
  );
}

// ---------- so sánh hai tuyển thủ ----------
function Pick({ v, set, exclude }: { v: Player | null; set: (p: Player) => void; exclude: string }) {
  const [q, setQ] = useState('');
  const list = q.length >= 2 ? Object.values(S.players).filter((p) => !p.retired && p.id !== exclude && p.ign.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.ovr - a.ovr).slice(0, 6) : [];
  return (
    <div className="cmp-pick">
      <input className="gin" placeholder={t('cmp.search')} value={q} data-cmpq onChange={(e) => setQ(e.target.value)} />
      {list.length > 0 && <div className="cmp-res">{list.map((p) => <button key={p.id} data-cmpp={p.id} onClick={() => { set(p); setQ(''); }}><RoleTag r={p.role} />{p.ign}<span className="muted">{p.teamId ? S.teams[p.teamId].short : t('p.freeAgent')} · {p.ovr}</span></button>)}</div>}
      {v && <div className="cmp-who"><Face p={v} size="lg" /><b>{v.ign}</b><span className="muted text-xs">{v.teamId ? S.teams[v.teamId].name : t('p.freeAgent')}</span></div>}
    </div>
  );
}
function Compare({ a }: { a: Player }) {
  const [b, setB] = useState<Player | null>(null);
  const rows: [string, (p: Player) => number][] = [
    ['OVR', (p) => p.ovr], [t('pot'), (p) => p.potential], [t('age'), (p) => p.age],
    ...(Object.keys(ATTR_GROUPS) as AttrGroup[]).map((g): [string, (p: Player) => number] => [t('grp.' + g), (p) => groupScore(p, g)]),
    ...Object.values(ATTR_GROUPS).flat().map((k): [string, (p: Player) => number] => [t('attr.' + k), (p) => p.stats[k]]),
  ];
  const money: [string, (p: Player) => string][] = [[t('salary'), (p) => kmoney(p.salary)], [t('value'), (p) => kmoney(p.value)], [t('contract'), (p) => String(p.contractUntil)]];
  const shared = b ? a.pool.filter((x) => b.pool.some((y) => y.c === x.c)).length : 0;
  return (
    <div className="cmp">
      <div className="cmp-head">
        <div className="cmp-who"><Face p={a} size="lg" /><b>{a.ign}</b><span className="muted text-xs">{a.teamId ? S.teams[a.teamId].name : t('p.freeAgent')}</span></div>
        <b className="k-disp">VS</b>
        <Pick v={b} set={setB} exclude={a.id} />
      </div>
      {b && (
        <>
          <div className="cmp-rows">{rows.map(([l, f], i) => {
            const x = f(a), y = f(b);
            const lowerBetter = l === t('age');
            const wa = lowerBetter ? x < y : x > y, wb = lowerBetter ? y < x : y > x;
            return (
              <div key={i} className={`cmp-r ${i === 2 || i === 6 ? 'gap' : ''}`}>
                <b className={i === 2 ? '' : `v-${vClass(x)}`}>{x}</b>
                <div className="cmp-bar l"><i style={{ width: `${clamp(x, 0, 100)}%` }} className={wa ? 'win' : ''} /></div>
                <span>{l}</span>
                <div className="cmp-bar"><i style={{ width: `${clamp(y, 0, 100)}%` }} className={wb ? 'win' : ''} /></div>
                <b className={i === 2 ? '' : `v-${vClass(y)}`}>{y}</b>
              </div>
            );
          })}</div>
          <div className="cmp-rows">{money.map(([l, f]) => <div key={l} className="cmp-r"><b>{f(a)}</b><span /><span>{l}</span><span /><b>{f(b)}</b></div>)}</div>
          <p className="muted text-sm text-center m-0">{t('cmp.shared', { n: shared })}</p>
        </>
      )}
    </div>
  );
}
export const compareModal = (p: Player): void => openModal(() => <Compare a={p} />, { wide: true });
