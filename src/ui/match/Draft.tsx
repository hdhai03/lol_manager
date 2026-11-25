// Cấm/chọn theo lượt; tướng xếp tạm vào vị trí hợp nhất, người chơi đổi tướng giữa các tuyển thủ bất cứ lúc nào.
import { useEffect, useMemo, useReducer, useState } from 'react';
import { DB, champImg, champArt, champTile } from '../../engine/data';
import { S, lineupPlayers } from '../../engine/state';
import { DRAFT_ORDER, newDraft, aiChoose, applyDraftAction, draftTaken, openRoles, champFit, swapPicks, compTraits } from '../../engine/sim';
import { ROLES } from '../../engine/util';
import { t, cname } from '../../i18n';
import { Badge, LeagueBadge, RoleIcon, RuneMini } from '../components';
import { opggPos } from '../../engine/runes';
import { compLogoId, compTitle } from '../helpers';
import { sidesOf } from './MatchDay';
import type { Draft, Match, Player, Role, Side } from '../../engine/types';

const lineOf = (tid: string): Partial<Record<Role, Player | null>> => Object.fromEntries(lineupPlayers(S.teams[tid]).map(({ role, p }) => [role, p]));

export function DraftScreen({ m, onLeave, onStart }: { m: Match; onLeave: () => void; onStart: (d: Draft) => void }) {
  const draft = useMemo(() => { const { blue, red } = sidesOf(m); return newDraft(blue, red, m.fearless || []); }, [m]);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [dsel, setDsel] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Role>('all');
  const [q, setQ] = useState('');
  const [swapSel, setSwapSel] = useState<Role | null>(null);
  const me = S.userTeam;
  const ms: Side = draft.blue === me ? 'B' : 'R';
  const done = draft.step >= DRAFT_ORDER.length;
  const [side, type] = done ? [null, null] : DRAFT_ORDER[draft.step];
  const myTurn = !done && side === ms;

  // lượt của máy
  useEffect(() => {
    if (done || myTurn) return;
    const h = setTimeout(() => {
      const ch = aiChoose(draft);
      applyDraftAction(draft, ch.champ, ch.role);
      bump();
    }, 550);
    return () => clearTimeout(h);
  }, [draft.step, done, myTurn, draft]);

  const taken = draftTaken(draft);
  const myLine = lineOf(me);
  const comp = S.comps[m.comp];
  let champs = DB.champList.filter((c) => filter === 'all' || c.roles.includes(filter));
  if (q) champs = champs.filter((c) => (c.name + ' ' + c.nameVi).toLowerCase().includes(q.toLowerCase()));
  const myOpen = openRoles(draft, ms);
  const bestFit = (cid: string) => Math.round(Math.max(...myOpen.map((r) => champFit(myLine[r], cid, r)), 0));
  const tr = compTraits(Object.values(draft.picks[ms]));

  const Bans = ({ s }: { s: Side }) => {
    const next = !done && side === s && type === 'ban' ? draft.bans[s].length : -1;
    const arr = [0, 1, 2, 3, 4].map((i) => (
      <div key={i} className={`dr-ban ${i === next ? 'next' : ''}`}>{draft.bans[s][i] && <img src={champImg(draft.bans[s][i])} alt={cname(draft.bans[s][i])} title={cname(draft.bans[s][i])} />}</div>
    ));
    return <>{s === 'B' ? arr : arr.reverse()}</>;
  };
  const Slots = ({ s }: { s: Side }) => {
    const line = lineOf(s === 'B' ? draft.blue : draft.red);
    const firstEmpty = !done && side === s && type === 'pick' ? ROLES.find((r) => !draft.picks[s][r]) : null;
    const order = s === 'B' ? [...ROLES].reverse() : ROLES;
    return <>{order.map((r) => {
      const c = draft.picks[s][r];
      const p = line[r];
      const mine = s === ms;
      const cls = [s === 'R' ? 'red' : '', r === firstEmpty ? 'active' : '', mine && c ? 'swappable' : '', mine && swapSel === r ? 'swap-sel' : ''].join(' ');
      return (
        <div key={r} className={`dr-slot ${cls}`} data-swap={mine && c ? r : undefined} onClick={mine && c ? () => {
          if (!swapSel) setSwapSel(r);
          else if (swapSel === r) setSwapSel(null);
          else { swapPicks(draft, ms, swapSel, r); setSwapSel(null); }
        } : undefined}>
          {c ? <div className="art" style={{ backgroundImage: `url('${champArt(c)}')` }} /> : <div className="glyph"><RoleIcon r={r} /></div>}
          <span className={`rl role-${r}`} title={t('role.' + r)}><RoleIcon r={r} /></span>
          {c && mine && <span className="ft">{Math.round(champFit(p, c, r))}</span>}
          {c && <span className="drn"><RuneMini r={opggPos(c, r)?.runes?.[0]} size={22} /></span>}
          <span className="cn">{c ? cname(c) : ''}</span><span className="pn">{p ? p.ign : '—'}</span>
        </div>
      );
    })}</>;
  };
  const Wins = ({ tid }: { tid: string }) => {
    const n = tid === m.a ? m.winsA : m.winsB;
    return <span className="wins">{Array.from({ length: Math.ceil(m.bo / 2) }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
  };

  return (
    <div className="draft">
      <div className="dr-top"><button data-leave onClick={onLeave}>‹ {t('dr.leave')}</button><span>{compTitle(comp)}</span>
        <span className="fl-note">{m.bo > 1 ? `${t('dr.fearless')}${draft.locked.length ? ` · ${t('dr.fearlessN', { n: draft.locked.length })}` : ''}` : ''}</span></div>
      <div className="dr-mid">
        <div className="dr-panel">
          <div className="dr-ph"><h3>{t('dr.champions')}</h3>
            <div className="dr-roles">{(['all', ...ROLES] as const).map((r) => <button key={r} className={filter === r ? 'on' : ''} data-f={r} onClick={() => setFilter(r)}>{r === 'all' ? t('tr.all') : <span className={`role-${r}`} title={t('role.' + r)}><RoleIcon r={r} /></span>}</button>)}</div>
            <label className="dr-search"><input type="search" placeholder={t('meta.search')} value={q} data-q onChange={(e) => setQ(e.target.value)} /></label></div>
          <div className="dr-grid">{champs.map((c) => {
            const dis = taken.has(c.id);
            const fl = draft.locked.includes(c.id);
            return (
              <button key={c.id} className={`dr-c ${dis ? 'dis' : ''} ${fl ? 'fl' : ''} ${dsel === c.id ? 'on' : ''}`} title={fl ? t('dr.fearlessUsed') : ''} disabled={dis || !myTurn} data-c={c.id} onClick={() => setDsel(c.id)}>
                <img loading="lazy" src={champTile(c.id)} alt="" />{['S', 'A'].includes(c.tier) && <span className="hx">{c.tier}</span>}
                {myTurn && type === 'pick' && !dis && <span className="fit">{bestFit(c.id)}</span>}<em>{cname(c.id)}</em>
              </button>
            );
          })}</div>
          <div className="dr-foot">
            <span className="msg">{done ? t('dr.swapHint') : myTurn ? (dsel ? cname(dsel) : t(type === 'ban' ? 'dr.selectBan' : 'dr.selectPick')) : t('dr.waiting')}
              <br /><span className="dr-comp">{t('m.tanks')}: {tr.tanks} · {t('m.apShare')}: {Math.round(tr.apShare * 100)}% · {t('dr.swapHint')}</span></span>
            {done ? <button className="gb primary" data-start style={{ minHeight: '3rem', padding: '0 2rem' }} onClick={() => onStart(draft)}>{t('m.startGame')}</button>
              : <button className={`gb ${myTurn && dsel ? 'primary' : ''}`} data-confirm disabled={!(myTurn && dsel)} onClick={() => { if (dsel) { applyDraftAction(draft, dsel, null); setDsel(null); bump(); } }}>{t(type === 'ban' ? 'dr.ban' : 'dr.pick')}</button>}
          </div>
        </div>
        <div className="dr-banrow"><div className="dr-bans l"><Bans s="B" /></div><div className="dr-bans r"><Bans s="R" /></div></div>
      </div>
      <div className="dr-progress"><i style={{ width: `${(draft.step / DRAFT_ORDER.length) * 100}%` }} /></div>
      <div className="dr-bar">
        <Slots s="B" />
        <div className="dr-center">
          <div className="t1">{compTitle(comp)} · {t('m.bo', { n: m.bo })} · {t('dr.game', { n: m.games.length + 1 })}</div>
          <div className="t2">{draft.blue === me ? t('dr.firstPick') : ' '}</div>
          <div className="tms"><Badge id={draft.blue} size="lg" /><LeagueBadge id={compLogoId(comp)} size="sm" /><Badge id={draft.red} size="lg" /></div>
          <div className="tms"><Wins tid={draft.blue} /><span className="t3">PATCH {DB.meta.proPatch}</span><Wins tid={draft.red} /></div>
          <div className="t3">{done ? t('dr.done') : myTurn ? <>{t(type === 'ban' ? 'dr.bans' : 'dr.picks')} · <b>{t('dr.yourTurn')}</b></> : t('dr.waiting')}</div>
        </div>
        <Slots s="R" />
      </div>
    </div>
  );
}
