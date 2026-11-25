// Bàn đàm phán: phí chuyển nhượng (nếu mua) + hợp đồng cá nhân với người đại diện
import { useState } from 'react';
import { S, userTeam, teamSalary } from '../../engine/state';
import { salaryCap } from '../../engine/squadx';
import { askingPrice } from '../../engine/season';
import { money } from '../../engine/util';
import { demandOf, satisfaction, propose, renewWith, buyWith, negoState, termCost, type Terms, type RolePromise } from '../../engine/contracts';
import { t } from '../../i18n';
import { openModal, refresh, toast } from '../store';
import { Face, RoleTag, Ovr } from '../components';
import type { Player } from '../../engine/types';

function NegoBody({ p, mode, close }: { p: Player; mode: 'buy' | 'renew'; close: () => void }) {
  const ut = userTeam();
  const d = demandOf(p, ut.id);
  const buying = mode === 'buy' && !!p.teamId;
  const ask = buying ? askingPrice(p) : 0;
  const [fee, setFee] = useState(ask);
  const [tm, setTm] = useState<Terms>({ salary: Math.round(d.salary * 0.92), years: d.years, role: d.role, clause: Math.round(d.minClause * 1.3), bonus: false });
  const [msg, setMsg] = useState<string | null>(null);
  const st = negoState(p.id);
  const sat = satisfaction(p, ut.id, tm) * st.mood;
  const set = (x: Partial<Terms>) => setTm({ ...tm, ...x });
  const blocked = st.blockedUntil != null && S.day < st.blockedUntil;
  const send = () => {
    const r = propose(p, ut.id, tm);
    if (r.verdict === 'accept') {
      if (mode === 'renew') { renewWith(p, tm); toast(t('ng.done', { player: p.ign }), 'ok'); close(); refresh(); return; }
      const b = buyWith(p, fee, tm);
      if (b.ok) { toast(t('ng.signed', { player: p.ign }), 'ok'); close(); refresh(); }
      else if (b.rival) { setMsg(t('tr.rival', { team: S.teams[b.rival.team].name, money: money(b.rival.amount) })); setFee(Math.ceil(b.rival.amount * 1.06)); }
      else { setMsg(t(b.reason!)); }
      return;
    }
    if (r.verdict === 'counter' && r.counter) { setTm({ ...tm, ...r.counter }); setMsg(t(r.msg, { agent: d.agent, salary: money(r.counter.salary || tm.salary) })); }
    else setMsg(t(r.msg, { agent: d.agent, player: p.ign }));
    refresh();
  };
  const clauseOpts: (number | null)[] = [null, Math.round(d.minClause), Math.round(d.minClause * 1.6), Math.round(d.minClause * 2.5)];
  return (
    <div className="ng">
      <div className="ng-h"><Face p={p} size="lg" /><div className="grow min-w-0"><b className="k-disp">{p.ign}</b><div className="muted text-sm flex items-center gap-2"><RoleTag r={p.role} />{t('age')} {p.age} · <Ovr v={p.ovr} /> · {t('ng.agent')}: {d.agent}</div></div>
        <div className="ng-mood"><small>{t('ng.mood')}</small><div className={`mtr ${sat >= 1 ? 'hi' : sat >= 0.85 ? 'mid' : 'lo'}`}><i style={{ width: `${Math.min(100, sat * 80)}%` }} /></div><span>{sat >= 1 ? t('ng.happy') : sat >= 0.85 ? t('ng.close') : t('ng.far')}</span></div>
      </div>
      <div className="ng-dem muted text-sm">{t('ng.wants', { salary: money(d.salary), years: d.years, role: t('ng.role.' + d.role) })} · {t('ng.round', { n: st.round, max: 3 })}</div>
      {buying && (
        <div className="ng-row"><label className="k-label">{t('ng.fee')} <span className="muted">({t('p.asking')}: {money(ask)}{p.clause ? ` · ${t('ng.clauseOf', { v: money(p.clause) })}` : ''})</span></label>
          <input className="gin" type="number" step={10} min={0} value={fee} data-fee onChange={(e) => setFee(Math.max(0, +e.target.value || 0))} /></div>
      )}
      <div className="ng-row"><label className="k-label">{t('ng.salary')}: <b className="text-white">{money(tm.salary)}</b> / {t('ng.year')}</label>
        <input type="range" min={Math.round(d.salary * 0.6)} max={Math.round(d.salary * 1.5)} step={5} value={tm.salary} data-sal onChange={(e) => set({ salary: +e.target.value })} /></div>
      <div className="ng-row"><label className="k-label">{t('ng.years')}</label><div className="seg">{[1, 2, 3].map((y) => <button key={y} className={`chip ${tm.years === y ? 'on' : ''}`} data-yr={y} onClick={() => set({ years: y })}>{t('p.years', { n: y })}</button>)}</div></div>
      <div className="ng-row"><label className="k-label">{t('ng.rolePromise')}</label><div className="seg">{(['starter', 'rotation', 'none'] as RolePromise[]).map((r) => <button key={r} className={`chip ${tm.role === r ? 'on' : ''}`} data-rp={r} onClick={() => set({ role: r })}>{t('ng.role.' + r)}</button>)}</div></div>
      <div className="ng-row"><label className="k-label">{t('ng.clause')}</label><div className="seg">{clauseOpts.map((c, i) => <button key={i} className={`chip ${tm.clause === c ? 'on' : ''}`} data-cl={i} onClick={() => set({ clause: c })}>{c == null ? t('ng.noClause') : money(c)}</button>)}</div></div>
      <label className="tg"><input type="checkbox" checked={tm.bonus} data-bonus onChange={(e) => set({ bonus: e.target.checked })} /> {t('ng.bonus')}</label>
      {msg && <div className="ng-msg">{msg}</div>}
      <div className="ng-foot">
        <span className="muted text-sm">{t('ng.total', { v: money(termCost(tm) * tm.years) })}{buying ? ` + ${money(fee)}` : ''} · {t('top.budget')}: {money(ut.budget)} · {t('cap.after', { pay: money(teamSalary(ut) - (mode === 'renew' ? p.salary : 0) + termCost(tm)), cap: money(salaryCap(ut.league).cap) })}</span>
        <div className="flex gap-2"><button className="gb ghost" onClick={close}>{t('common.cancel')}</button><button className="gb primary" data-send disabled={blocked} onClick={send}>{blocked ? t('ng.blockedBtn', { n: st.blockedUntil! - S.day }) : t('ng.send')}</button></div>
      </div>
    </div>
  );
}
export function negoModal(pid: string, mode: 'buy' | 'renew'): void {
  const p = S.players[pid];
  if (!p) return;
  openModal((close) => <NegoBody p={p} mode={mode} close={close} />, { wide: true });
}
