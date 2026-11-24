import { useRef } from 'react';
import { S, userTeam, teamPlayers, teamOvr, lineupPlayers, autoLineup } from '../../engine/state';
import { askingPrice, makeOffer, releasePlayer, renewContract, renewCost } from '../../engine/season';
import { ATTR_GROUPS, ROLES, clamp, money } from '../../engine/util';
import { BAD_TRAITS, PERSONAL_OPTS, TACTIC_OPTS, defaultTactics, groupScore, traitsOf } from '../../engine/attrs';
import { t } from '../../i18n';
import { ui, refresh, openModal, closeModal, toast } from '../store';
import { Badge, Champ, Cc, CondMini, Face, FormArrow, RoleIcon, RoleTag, confirmBox, faceSrc } from '../components';
import { pct, simLine, vClass } from '../helpers';
import type { AttrGroup, Player, Role, Tactics as TacticsT } from '../../engine/types';

// ---------- Hồ sơ tuyển thủ ----------
export function PlayerDetail({ p }: { p: Player }) {
  const ut = userTeam();
  const mine = p.teamId === ut.id;
  const listed = (S.listed || []).includes(p.id);
  const lineRole = ROLES.find((r) => ut.lineup[r] === p.id);
  const cond = Math.round(p.cond ?? 100);
  const morale = Math.round(p.morale ?? 70);
  const traits = traitsOf(p);
  const fs = faceSrc(p);
  const rows: [string, ReturnType<typeof simLine>][] = [['p.thisSeason', simLine(p.season)], ['p.career', simLine(p.career)]];
  const setRole = (r: Role) => {
    const prev = ROLES.find((x) => ut.lineup[x] === p.id);
    const displaced = ut.lineup[r];
    if (prev) delete ut.lineup[prev];
    if (displaced && prev && displaced !== p.id) ut.lineup[prev] = displaced;
    ut.lineup[r] = p.id;
    refresh();
  };
  const release = async () => {
    const cost = Math.round(p.salary * 0.5 * Math.max(1, p.contractUntil - S.season + 1));
    if (await confirmBox(t('p.releaseConfirm', { player: p.ign, cost: money(cost) }))) { releasePlayer(p.id); ui.selPlayer = null; closeModal(); refresh(); }
  };
  return (
    <div className="pd">
      <div className="pd-hero">
        <div className="ph">{fs ? <img src={fs} alt={p.ign} /> : <span className="ini">{p.ign.slice(0, 2).toUpperCase()}</span>}
          <span className="club">{p.teamId ? <Badge id={p.teamId} size="sm" /> : null}</span></div>
        <div className="grow min-w-0">
          <div className="flex items-end gap-3"><span className={`ovrbig v-${vClass(p.ovr)}`}>{p.ovr}</span><span className="rl pb-1">{t('role.' + p.role)}</span></div>
          <div className="big mt-2 truncate">{p.ign} {listed && <em className="tagx">{t('p.listed')}</em>}</div>
          <div className="muted mt-1 flex items-center gap-2"><Cc country={p.country} />{p.name}{p.native ? ` · ${p.native}` : ''}{!p.teamId && <span className="tagx">{t('p.freeAgent')}</span>}</div>
        </div>
      </div>
      <div className="pd-stats">
        <div><span>{t('pot')}</span><b>{p.ovr}-{p.potential}</b></div>
        <div><span>{t('age')}</span><b>{p.age}</b></div>
        <div><span>{t('salary')}</span><b>{money(p.salary)}</b></div>
        <div><span>{t('contract')}</span><b>{p.contractUntil}</b></div>
        <div><span>{t('value')}</span><b>{money(p.value)}</b></div>
      </div>
      <div>
        <div className="sub-h">{t('p.attrs')}</div>
        <div className="attr-g">{(Object.entries(ATTR_GROUPS) as [AttrGroup, string[]][]).map(([g, list]) => (
          <div key={g} className={`ag ${S.training === g && mine ? 'train' : ''}`}>
            <div className="ag-h"><span>{t('grp.' + g)}</span><b className={`v-${vClass(groupScore(p, g))}`}>{groupScore(p, g)}</b></div>
            {list.map((a) => {
              const v = p.stats[a as keyof Player['stats']];
              return <div key={a} className="ab" title={t('ad.' + a)}><span>{t('attr.' + a)}</span><div className="bar"><i className={`bg-v-${vClass(v)}`} style={{ width: `${clamp(v, 0, 100)}%` }} /></div><b className={`v-${vClass(v)}`}>{v}</b></div>;
            })}
          </div>
        ))}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="sub-h">{t('p.summary')}</div>
          <div className="flex flex-col gap-1 text-sm">
            <div className="ab"><span>{t('p.cond')}</span><div className={`bar ${cond < 60 ? 'low' : 'teal'}`}><i style={{ width: `${cond}%` }} /></div><b>{cond}</b></div>
            <div className="ab"><span>{t('p.morale')}</span><div className="bar"><i style={{ width: `${morale}%` }} /></div><b>{morale}</b></div>
            <div className="ab"><span>{t('form')}</span><span /><b>{p.form > 0 ? '+' : ''}{p.form.toFixed(1)}</b></div>
          </div>
          <div className="sub-h mt-3">{t('p.traits')}</div>
          <div>{traits.length ? traits.map((x) => <span key={x} className={`trait ${BAD_TRAITS.has(x) ? 'bad' : ''}`} title={t('td.' + x)}>{t('trait.' + x)}</span>) : <span className="muted text-sm">{t('p.noTraits')}</span>}</div>
        </div>
        <div>
          <div className="sub-h">{t('p.pool')}</div>
          <div className="pool">{p.pool.slice(0, 8).map((x) => <div key={x.c} className="pc"><Champ id={x.c} size={38} /><span>{x.g} · {x.g ? pct(x.w / x.g) : '–'}</span></div>)}{!p.pool.length && <span className="muted">—</span>}</div>
          <div className="sub-h mt-3">{t('p.simStats')}</div>
          {rows.some(([, r]) => r) ? (
            <table className="gt"><thead><tr><th /><th>{t('p.games')}</th><th>{t('st.wr')}</th><th>KDA</th><th>CS/{t('min')}</th><th>{t('p.dpmS')}</th><th>MVP</th></tr></thead>
              <tbody>{rows.map(([k, r]) => <tr key={k}><td>{t(k)}</td>{r ? <><td className="n">{r.g}</td><td className="n">{pct(r.wr)}</td><td className="n">{r.kda}</td><td className="n">{r.cspm}</td><td className="n">{r.dpm}</td><td className="n">{r.mvp}</td></> : <td colSpan={6} className="muted">—</td>}</tr>)}</tbody></table>
          ) : <p className="muted text-sm">{t('p.noGames')}</p>}
        </div>
      </div>
      {mine && (
        <div>
          <div className="sub-h">{t('p.dev')}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="muted text-sm">{t('p.plan')}</span>
            <div className="chips">{(Object.keys(ATTR_GROUPS) as AttrGroup[]).map((g) => <button key={g} className={`chp sm ${S.training === g ? 'on' : ''}`} data-train={g} onClick={() => { S.training = g; S.trainingSetDay = S.day; refresh(); }}>{t('train.' + g)}</button>)}</div>
            <span className="muted text-sm ml-auto">{t('p.progress')}</span>
            <b className="k-num">{p.ovr}</b><div className="bar teal" style={{ width: 120 }}><i style={{ width: `${clamp(((p.ovr - 40) / Math.max(p.potential - 40, 1)) * 100, 4, 100)}%` }} /></div><b className="k-num">{p.potential}</b>
          </div>
        </div>
      )}
      {(p.titles || []).length > 0 && <div><div className="sub-h">{t('p.titles')}</div><div className="text-sm">{(p.titles || []).join(' · ')}</div></div>}
      {(p.awards || []).length > 0 && <div><div className="sub-h">{t('p.awards')}</div><div className="text-sm">{(p.awards || []).map((x, i) => { const [k, ev] = x.split('|'); return <span key={i} className="mr-2"><span className="tagx">{t('rec.' + k)}</span> {ev}</span>; })}</div></div>}
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-line">
        {mine ? (
          <>
            <div className="chips">{ROLES.map((r) => <button key={r} className={`chp sm ${lineRole === r ? 'on' : ''}`} data-setrole={r} onClick={() => setRole(r)}><RoleIcon r={r} /> {t('roleS.' + r)}</button>)}</div>
            <span className="grow" />
            <button className="gb sm" data-list onClick={() => { S.listed = listed ? (S.listed || []).filter((x) => x !== p.id) : [...(S.listed || []), p.id]; refresh(); }}>{listed ? t('p.unlist') : t('p.sell')}</button>
            <button className="gb ghost danger sm" data-release onClick={() => void release()}>{t('p.release')}</button>
            {p.contractUntil <= S.season && !(S.renewed || []).includes(p.id) && <button className="gb primary sm" data-renew onClick={() => renewModal(p.id)}>{t('p.renew')}</button>}
          </>
        ) : (
          <>
            <button className="gb primary" data-buy onClick={() => offerModal(p.id)}>{p.teamId ? t('p.buy') : t('p.sign')}</button>
            {p.teamId && <span className="muted text-sm">{t('p.asking')}: <b className="text-sky">{money(askingPrice(p))}</b></span>}
          </>
        )}
      </div>
    </div>
  );
}

export function openPlayer(pid: string): void {
  if (!S.players[pid]) return;
  openModal(() => (S.players[pid] ? <PlayerDetail p={S.players[pid]} /> : null), { wide: true });
}

function OfferBody({ p, close }: { p: Player; close: () => void }) {
  const ask = p.teamId ? askingPrice(p) : 0;
  const amt = useRef<HTMLInputElement>(null);
  return (
    <>
      <h3>{p.teamId ? t('p.buy') : t('p.sign')}: {p.ign}</h3>
      {p.teamId ? (
        <>
          <p>{t('p.asking')}: <b>{money(ask)}</b> · {t('top.budget')}: <b>{money(userTeam().budget)}</b></p>
          <label className="flex flex-col gap-1 k-label">{t('p.offerAmount')}<input ref={amt} id="amt" className="gin" type="number" min={0} step={10} defaultValue={ask} /></label>
        </>
      ) : <p>{t('salary')}: <b>{money(Math.round(p.salary * 1.05))}</b></p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="gb ghost" onClick={close}>{t('common.cancel')}</button>
        <button className="gb primary" data-send onClick={() => {
          const v = p.teamId ? Math.max(0, parseInt(amt.current?.value || '0', 10) || 0) : 0;
          const r = makeOffer(p.id, v);
          if (r.ok) { close(); toast(t('tr.done'), 'ok'); } else toast(t(String(r.reason)), 'err');
        }}>{p.teamId ? t('p.send') : t('p.sign')}</button>
      </div>
    </>
  );
}
export function offerModal(pid: string): void {
  const p = S.players[pid];
  openModal((close) => <OfferBody p={p} close={close} />);
}

export function renewModal(pid: string): void {
  const p = S.players[pid];
  const sal = renewCost(p);
  openModal((close) => (
    <>
      <h3>{t('p.renew')}: {p.ign}</h3>
      <p>{t('p.renewAsk', { player: p.ign, salary: money(sal) })}</p>
      <div className="flex gap-2">{[1, 2, 3].map((y) => <button key={y} className="gb" data-y={y} onClick={() => { renewContract(p.id, sal, y); close(); toast(t('p.renewed'), 'ok'); }}>{t('p.years', { n: y })}</button>)}</div>
    </>
  ));
}

// ---------- Đội hình ----------
export function Roster() {
  const ut = userTeam();
  const lp = lineupPlayers(ut);
  const starterIds = lp.filter((x) => x.p).map((x) => x.p!.id);
  const bench = teamPlayers(ut).filter((p) => !starterIds.includes(p.id)).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const rows = [...lp.filter((x) => x.p).map((x) => ({ p: x.p!, slot: x.role as Role | null })), ...bench.map((p) => ({ p, slot: null as Role | null }))];
  if (!rows.find((r) => r.p.id === ui.selPlayer)) ui.selPlayer = rows[0]?.p.id ?? null;
  const sel = ui.selPlayer ? S.players[ui.selPlayer] : null;
  const ovr = teamOvr(ut);
  return (
    <div className="cols fill stag" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)' }}>
      <div className="gp">
        <div className="gp-h">
          <h3 className="k-title">{t('nav.roster')} <span className="muted">· {ut.roster.length}</span></h3>
          <div className="gp-r">
            {ROLES.map((r) => <span key={r} className={ut.lineup[r] ? '' : 'neg'}>{t('roleS.' + r)}</span>)}
            <span>OVR <b className="text-white">{ovr}</b></span>
            <button className="gb ghost xs" data-auto onClick={() => { autoLineup(ut); refresh(); }}>{t('roster.auto')}</button>
          </div>
        </div>
        <div className="gp-b scroll" style={{ paddingTop: 0 }}>
          <table className="gt sq-table"><thead><tr><th>{t('role')}</th><th>{t('name')}</th><th>{t('age')}</th><th>OVR</th><th>{t('pot')}</th><th>{t('p.cond')}</th><th>{t('form')}</th><th /></tr></thead>
            <tbody>{rows.map(({ p, slot }, i) => (
              <tr key={p.id} className={`click ${p.id === ui.selPlayer ? 'sel' : ''} ${i === starterIds.length && i > 0 ? 'sep' : ''}`} data-sel={p.id} onClick={() => { ui.selPlayer = p.id; refresh(); }}>
                <td><RoleTag r={slot || p.role} /></td>
                <td><div className="nm2"><Face p={p} size="sm" />{p.ign}{slot && slot !== p.role && <span className="warn text-xs">{t('roster.offRole')}</span>}</div></td>
                <td className="n">{p.age}</td>
                <td className={`n v-${vClass(p.ovr)}`}>{p.ovr}</td>
                <td className="n"><span className={`v-${vClass(p.potential)}`}>{p.potential}</span></td>
                <td><CondMini p={p} /></td>
                <td><FormArrow f={p.form} /></td>
                <td><span className={`k-label ${slot ? 'text-white' : ''}`} style={{ fontSize: '.7rem' }}>{slot ? t('roster.starter') : t('roster.sub')}</span></td>
              </tr>
            ))}</tbody></table>
        </div>
      </div>
      <div className="gp" id="detail"><div className="gp-b scroll">{sel && <PlayerDetail p={sel} />}</div></div>
    </div>
  );
}

// ---------- Chiến thuật ----------
type TacKey = Exclude<keyof TacticsT, 'personal' | 'day'>;
export function Tactics() {
  const ut = userTeam();
  S.tactics ??= defaultTactics();
  const T = S.tactics;
  const lp = lineupPlayers(ut);
  const keys: TacKey[] = ['tempo', 'obj', 'style', 'focus', 'jungle'];
  return (
    <div className="cols fill stag" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)' }}>
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('tac.title')}</h3><button className="gb ghost xs" data-treset onClick={() => { S.tactics = defaultTactics(); refresh(); }}>{t('tac.reset')}</button></div>
        <div className="gp-b scroll gap-4">
          <p className="muted text-sm m-0">{t('tac.sub')}</p>
          {keys.map((k) => (
            <div key={k} className="flex flex-col gap-2 pb-3 border-b border-line">
              <div><b className="k-title" style={{ fontSize: '.92rem' }}>{t('tac.' + k)}</b>{k !== 'jungle' && <div className="muted text-sm">{t('tac.h.' + k)}</div>}</div>
              <div className="chips">{(TACTIC_OPTS[k] as string[]).map((o) => (
                <button key={o} className={`chp ${T[k] === o ? 'on' : ''}`} data-tk={k} data-tv={o} onClick={() => { (T as unknown as Record<string, string>)[k] = o; refresh(); }}>{t(`tac.${k}.${o}`)}</button>
              ))}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('tac.personal')}</h3></div>
        <div className="gp-b scroll gap-2">
          <p className="muted text-sm m-0">{t('tac.h.personal')}</p>
          {lp.map(({ role, p }) => (
            <div key={role} className="flex items-center gap-3 py-2 border-b border-line">
              <RoleTag r={role} /><Face p={p} size="sm" />
              <div className="grow min-w-0"><b>{p ? p.ign : '—'}</b>
                {p && <div className="muted text-xs">{t('attr.aggression')} {p.stats.aggression} · {t('attr.patience')} {p.stats.patience}{traitsOf(p).length ? ' · ' + traitsOf(p).map((x) => t('trait.' + x)).join(', ') : ''}</div>}</div>
              <div className="chips">{PERSONAL_OPTS.map((o) => (
                <button key={o} className={`chp sm ${(T.personal[role] || 'standard') === o ? 'on' : ''}`} data-pr={role} data-pv={o} onClick={() => { T.personal[role] = o; refresh(); }}>{t('tac.pt.' + o)}</button>
              ))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
