import { S, userTeam, teamPlayers } from '../../engine/state';
import { t2Plan, t2Lineup, t2Table, T2_NAME } from '../../engine/tier2';
import { loanModal } from './Staff';
import { ATTR_GROUPS, money } from '../../engine/util';
import {
  SERVERS, SERVER_OF, ladder as soloLadder, accTier, recruitable, ensureSoloq, ensureAcademy, academyPlayers, ACADEMY_MAX, inviteCost, potRange,
  inviteToAcademy, promoteFromAcademy, releaseFromAcademy,
} from '../../engine/academy';
import { t, getLang } from '../../i18n';
import { ladderData, refreshLadder } from '../../engine/ladder';
import { useState } from 'react';
import { ui, refresh, toast } from '../store';
import { Champ, CondMini, Face, RoleTag, RankTxt, RoleIcon } from '../components';
import { isMine, pct, vClass } from '../helpers';
import { openPlayer } from './Squad';
import type { AttrGroup } from '../../engine/types';

export function Training() {
  const ac = ensureAcademy();
  const ps = [...teamPlayers(userTeam()), ...academyPlayers()];
  return (
    <div className="cols fill stag" style={{ gridTemplateColumns: 'minmax(280px, .8fr) minmax(0, 1.6fr)' }}>
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('ac.plan')}</h3></div>
        <div className="gp-b gap-3">
          <p className="muted text-sm m-0">{t('ac.planHint')}</p>
          <div className="flex flex-col gap-2">{(Object.keys(ATTR_GROUPS) as AttrGroup[]).map((g) => (
            <button key={g} className={`task ${S.training === g ? 'sel' : ''}`} data-train={g} onClick={() => { S.training = g; S.trainingSetDay = S.day; refresh(); }}>
              <div className="flex flex-col"><b>{t('train.' + g)}</b><span className="muted text-xs">{ATTR_GROUPS[g].map((a) => t('attr.' + a)).join(' · ')}</span></div>
            </button>
          ))}</div>
          <div className="sub-h mt-2">{t('ac.intensity')}</div>
          <div className="chips">{(['light', 'normal', 'hard'] as const).map((k) => <button key={k} className={`chp ${ac.intensity === k ? 'on' : ''}`} data-int={k} onClick={() => { ac.intensity = k; S.trainingSetDay = S.day; refresh(); }}>{t('ac.int.' + k)}</button>)}</div>
          <p className="muted text-sm m-0">{t('ac.intHint.' + ac.intensity)}</p>
        </div>
      </div>
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('ac.progress')}</h3></div>
        <div className="gp-b scroll" style={{ paddingTop: 0 }}>
          <table className="gt"><thead><tr><th>{t('role')}</th><th>{t('name')}</th><th>{t('age')}</th><th>OVR</th><th>{t('pot')}</th><th>{t('ac.change')}</th><th>{t('p.cond')}</th></tr></thead>
            <tbody>{ps.map((p) => {
              const d = p.ovr - (p.ovrStart ?? p.ovr);
              return (
                <tr key={p.id} className="click" data-player={p.id} onClick={() => openPlayer(p.id)}>
                  <td><RoleTag r={p.role} /></td><td><div className="nm2"><Face p={p} size="sm" />{p.ign}{p.academyOf && <em className="tagx">{t('ac.tag')}</em>}</div></td>
                  <td className="n">{p.age}</td><td className={`n v-${vClass(p.ovr)}`}>{p.ovr}</td><td className="n">{p.potential}</td>
                  <td className={`n ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`}>{d > 0 ? '+' : ''}{d}</td><td><CondMini p={p} /></td>
                </tr>
              );
            })}</tbody></table>
        </div>
      </div>
    </div>
  );
}

/** HLV chỉ đạo đội học viện ở giải hạng 2: chọn 5 người, lối chơi, người được ưu tiên cho thi đấu */
function T2Panel() {
  const acad = academyPlayers();
  if (acad.length < 3) return null;
  const plan = t2Plan();
  const line = t2Lineup();
  const lg = userTeam().league;
  const row = t2Table(lg).findIndex((x) => x.parent === S.userTeam);
  const me = t2Table(lg)[row];
  return (
    <div className="t2p">
      <div className="sub-h mt-3">{t('t2p.title', { league: T2_NAME[lg] || lg })}{me && <span className="muted text-xs"> · #{row + 1} · {me.w}-{me.l}</span>}</div>
      <div className="t2p-line">{acad.map((p) => {
        const on = line.includes(p.id);
        return <button key={p.id} className={`chp sm ${on ? 'on' : ''}`} data-t2p={p.id} onClick={() => {
          const cur = t2Lineup();
          plan.line = on ? cur.filter((x) => x !== p.id) : [...cur.filter((x) => x !== p.id).slice(0, 4), p.id];
          refresh();
        }}><RoleIcon r={p.role} />{p.ign}</button>;
      })}</div>
      <div className="ph-row"><span className="k-label">{t('t2p.style')}</span>
        <div className="chips">{(['aggressive', 'balanced', 'safe'] as const).map((k) => <button key={k} className={`chp sm ${plan.style === k ? 'on' : ''}`} data-t2s={k} title={t('t2p.' + k + 'D')} onClick={() => { plan.style = k; refresh(); }}>{t('t2p.' + k)}</button>)}</div></div>
      <div className="ph-row"><span className="k-label">{t('t2p.focus')}</span>
        <select className="gin sm" data-t2f value={plan.focus || ''} onChange={(e) => { plan.focus = e.target.value || null; refresh(); }}>
          <option value="">{t('mt.none')}</option>{line.map((id) => <option key={id} value={id}>{S.players[id]?.ign}</option>)}
        </select></div>
      {plan.log.length > 0 && <div className="t2p-log">{plan.log.map((x, i) => <span key={i} className={x.my > x.th ? 'w' : 'l'}>{x.my}-{x.th} <small>{x.opp}</small></span>)}</div>}
    </div>
  );
}

export function Youth() {
  const ac = ensureAcademy();
  const sv = ac.focus;
  const am = soloLadder(sv).map((a, i) => ({ a, rank: i + 1 })).filter(({ a }) => recruitable(a));
  const acad = academyPlayers();
  return (
    <div className="cols fill stag" style={{ gridTemplateColumns: 'minmax(280px, .8fr) minmax(0, 1.6fr)' }}>
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('ac.mine', { n: acad.length, max: ACADEMY_MAX })}</h3></div>
        <div className="gp-b scroll gap-1">
          {acad.length ? acad.map((p) => (
            <div key={p.id} className="ac-row flex items-center gap-2 py-2 border-b border-line cursor-pointer" data-player={p.id} onClick={() => openPlayer(p.id)}>
              <Face p={p} size="sm" /><RoleTag r={p.role} />
              <div className="grow min-w-0"><b>{p.ign}</b><div className="muted text-xs">{t('age')} {p.age} · OVR {p.ovr} · {t('pot')} {p.potential}{p.t2 && p.t2.g ? ` · ${t('ac.t2stat', { g: p.t2.g, r: (p.t2.r / p.t2.g).toFixed(1) })}` : ''}</div></div>
              <button className="gb ghost xs" data-aloan={p.id} onClick={(e) => { e.stopPropagation(); loanModal(p.id); }}>{t('p.loan')}</button>
              <button className="gb primary xs" data-promote={p.id} onClick={(e) => { e.stopPropagation(); toast(promoteFromAcademy(p.id) ? t('ac.promoted') : t('ac.err.roster'), 'ok'); refresh(); }}>{t('ac.promote')}</button>
              <button className="gb ghost xs" data-arel={p.id} onClick={(e) => { e.stopPropagation(); releaseFromAcademy(p.id); refresh(); }}>{t('ac.release')}</button>
            </div>
          )) : <p className="muted text-sm">{t('ac.emptyAcad')}</p>}
          <p className="muted text-sm">{t('ac.promoteHint')}</p>
          <T2Panel />
          <div className="sub-h mt-3">{t('cl.title')}</div>
          {(S.clash || []).length ? (S.clash || []).slice(0, 5).map((c, i) => (
            <div key={i} className={`cl-r ${c.mineRank === 1 ? 'w' : ''}`}><b>#{c.mineRank}</b><span className="grow">{t('cl.res', { winner: c.winner, mvp: c.mvp })}</span><small className="muted">{S.day - c.day <= 0 ? t('feed.today') : t('feed.daysAgo', { n: S.day - c.day })}</small></div>
          )) : <p className="muted text-sm">{t('cl.none')}</p>}
        </div>
      </div>
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('ac.scout')}</h3>
          <div className="chips">{SERVERS.map((x) => <button key={x} className={`chp sm ${x === sv ? 'on' : ''}`} data-focus={x} onClick={() => { ac.focus = x; refresh(); }}>{x}</button>)}</div></div>
        <div className="gp-b scroll" style={{ paddingTop: '.4rem' }}>
          <p className="muted text-sm mt-0">{t('ac.scoutHint', { server: sv, days: ac.days[sv] || 0 })}</p>
          <table className="gt"><thead><tr><th>#</th><th>{t('ac.account')}</th><th>{t('role')}</th><th>{t('age')}</th><th>{t('ac.rank')}</th><th>{t('ac.estPot')}</th><th>{t('ac.cost')}</th><th /></tr></thead>
            <tbody>{am.slice(0, 40).map(({ a, rank }) => {
              const [lo, hi] = potRange(sv, a);
              return (
                <tr key={a.id}>
                  <td className="n">{rank}</td>
                  <td><b>{a.name}</b>{a.real && <span className="lad-acc">#{a.tag}</span>}{a.real && <span className="lad-real">OP.GG</span>}<div className="flex gap-1 mt-1">{Object.keys(a.ch).slice(0, 3).map((ch) => <Champ key={ch} id={ch} size={20} />)}</div></td>
                  <td><RoleTag r={a.pr!.role} /></td><td className="n">{a.pr!.age}</td>
                  <td><RankTxt tier={accTier(sv, a)} lp={a.lp} /></td>
                  <td className="n">{lo}-{hi}</td><td className="n">{money(inviteCost(a, sv))}</td>
                  <td><button className="gb xs" data-invite={a.id} onClick={() => {
                    const r = inviteToAcademy(sv, a.id);
                    toast(r.ok ? t('ac.joined', { player: r.p.ign }) : t('ac.err.' + r.why), r.ok ? 'ok' : 'err');
                  }}>{t('ac.invite')}</button></td>
                </tr>
              );
            })}</tbody></table>
        </div>
      </div>
    </div>
  );
}

export function Ladder() {
  const f = ui.filters;
  ensureSoloq();
  f.lsv ??= SERVER_OF[userTeam().league] || 'KR';
  const list = soloLadder(f.lsv).slice(0, 150);
  const ld = ladderData(), real = !!ld?.servers[f.lsv]?.length;
  const [busy, setBusy] = useState(false);
  return (
    <div className="gp fill stag">
      <div className="gp-h"><h3 className="k-title">{t('ac.ladder', { server: f.lsv })}</h3>
        <div className="chips">{SERVERS.map((x) => <button key={x} className={`chp sm ${x === f.lsv ? 'on' : ''}`} data-lsv={x} onClick={() => { f.lsv = x; refresh(); }}>{x}</button>)}</div></div>
      <div className="gp-b scroll" style={{ paddingTop: '.4rem' }}>
        <div className="lad-src">
          <span className="muted text-sm">{real ? t('ac.realSrc', { n: ld!.servers[f.lsv].length, time: new Date(ld!.fetched).toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }) }) : f.lsv === 'CN' ? t('ac.noCn') : t('ac.simOnly')}</span>
          <button className="gb ghost xs" data-lsync disabled={busy} onClick={() => { setBusy(true); void refreshLadder(true).finally(() => { setBusy(false); refresh(); }); }}>{busy ? '…' : t('ac.sync')}</button>
        </div>
        <p className="muted text-sm mt-0">{t('ac.ladderHint')}</p>
        <table className="gt ladder-t"><thead><tr><th>#</th><th>{t('ac.account')}</th><th>{t('role')}</th><th>{t('ac.tierH')}</th><th>LP</th><th>{t('ac.wl')}</th><th>{t('st.wr')}</th><th>{t('ac.champs')}</th><th /></tr></thead>
          <tbody>{list.map((a, i) => {
            const p = a.pid ? S.players[a.pid] : null;
            const tag = p ? (p.teamId ? S.teams[p.teamId].short : p.academyOf ? t('ac.tag') : t('p.freeAgent')) : '';
            const g = a.w + a.l;
            return (
              <tr key={a.id} className={`${isMine(p) ? 'me' : ''} ${p ? 'click' : ''}`} data-player={p?.id} onClick={() => p && openPlayer(p.id)}>
                <td className="n">{i + 1}</td>
                <td>{p ? <><b>{tag && <span className="muted">{tag} </span>}{p.ign}</b>{a.real && <span className="lad-acc">{a.name}#{a.tag}</span>}</>
                  : a.real ? <><b>{a.name}</b><span className="lad-acc">#{a.tag}</span>{a.pro && <span className="lad-pro">{a.pro.team ? `${a.pro.team} · ` : ''}{a.pro.nick}</span>}</>
                  : <><b>{a.name}</b> <span className="muted text-xs">{t('ac.amateur')}</span></>}</td>
                <td><RoleTag r={p ? p.role : a.pr!.role} /></td>
                <td><RankTxt tier={accTier(f.lsv!, a)} /></td>
                <td className="n">{a.lp}</td><td className="n">{a.w}-{a.l}</td><td className="n">{g ? pct(a.w / g) : '–'}</td>
                <td><div className="flex gap-1">{Object.keys(a.ch).slice(0, 4).map((ch) => <Champ key={ch} id={ch} size={22} />)}</div></td>
                <td>{recruitable(a) && <button className="gb xs" data-linvite={a.id} title={`${t('age')} ${a.pr!.age} · ${t('ac.estPot')} ${potRange(f.lsv!, a).join('-')} · ${money(inviteCost(a, f.lsv))}`} onClick={(e) => {
                  e.stopPropagation();
                  const r = inviteToAcademy(f.lsv!, a.id);
                  toast(r.ok ? t('ac.joined', { player: r.p.ign }) : t('ac.err.' + r.why), r.ok ? 'ok' : 'err');
                  refresh();
                }}>{t('ac.invite')}</button>}</td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </div>
  );
}
