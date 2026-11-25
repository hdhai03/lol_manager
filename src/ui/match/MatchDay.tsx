// Ngày thi đấu: màn chuẩn bị → cấm/chọn → xem trận → tổng kết ván → kết thúc loạt.
import { useState } from 'react';
import { isRival, h2h } from '../../engine/world';
import { S, teamOvr, lineupPlayers, addNews, fillLineup, saveGame } from '../../engine/state';
import { autoDraft, simSeries } from '../../engine/sim';
import { progressComps } from '../../engine/season';
import { logistic } from '../../engine/util';
import { t } from '../../i18n';
import { ui, refresh, openModal } from '../store';
import { Badge, Champ, Face, LeagueBadge, Ovr, RoleTag, faceSrc, MatchCut } from '../components';
import { compLogoId, compTitle } from '../helpers';
import { DraftScreen } from './Draft';
import { Boosts } from '../pages/Practice';
import { openScout, Press } from '../pages/Scout';
import { teamChem } from '../../engine/life';
import { LiveGame } from './Live';
import { PostGame } from './PostGame';
import type { Draft, GameResult, Match } from '../../engine/types';

type Phase = { k: 'pre' } | { k: 'draft' } | { k: 'live'; d: Draft } | { k: 'post'; g: GameResult } | { k: 'end' };

export function sidesOf(m: Match): { blue: string; red: string } {
  const gi = m.games.length;
  const aBlue = gi % 2 === 0 ? m.aBlueFirst !== false : m.aBlueFirst === false;
  return aBlue ? { blue: m.a, red: m.b } : { blue: m.b, red: m.a };
}

export function SeriesHead({ m }: { m: Match }) {
  const comp = S.comps[m.comp];
  return (
    <div className="md-head">
      <div className="k-label flex items-center justify-center gap-2"><LeagueBadge id={compLogoId(comp)} size="xs" />{compTitle(comp)} · {t('m.bo', { n: m.bo })}</div>
      <div className="md-score">
        <Badge id={m.a} size="lg" /><span className="md-sname">{S.teams[m.a].name}</span>
        <b>{m.winsA} - {m.winsB}</b>
        <span className="md-sname">{S.teams[m.b].name}</span><Badge id={m.b} size="lg" />
      </div>
    </div>
  );
}

function PreMatch({ m, go }: { m: Match; go: (a: 'manual' | 'auto' | 'quick') => void }) {
  const A = S.teams[m.a], B = S.teams[m.b];
  const pA = logistic((teamOvr(A) - teamOvr(B)) / 4.2);
  const mine = m.a === S.userTeam ? pA : 1 - pA;
  const comp = S.comps[m.comp];
  const Side = ({ id, right }: { id: string; right?: boolean }) => (
    <div className={`vsx-side ${right ? 'r' : ''}`}>
      <div className="vsx-team"><Badge id={id} size="xl" /><div><b className="k-disp">{S.teams[id].name}</b><span className="k-label">OVR <Ovr v={teamOvr(S.teams[id])} /></span></div></div>
      <div className="vsx-line">{lineupPlayers(S.teams[id]).map(({ role, p }) => {
        const fs = faceSrc(p);
        return (
          <div key={role} className="vsx-p">
            {fs ? <img src={fs} alt="" /> : <span className="ini">{p ? p.ign.slice(0, 2).toUpperCase() : '—'}</span>}
            <div className="cap"><RoleTag r={role} /><b>{p ? p.ign : '—'}</b><span className="flex gap-1 justify-center">{p?.pool.slice(0, 3).map((x) => <Champ key={x.c} id={x.c} size={18} />)}</span></div>
            {p && <span className="o">{p.ovr}</span>}
          </div>
        );
      })}</div>
    </div>
  );
  return (
    <div className="vsx">
      <div className="vsx-top k-label"><LeagueBadge id={compLogoId(comp)} size="sm" />{compTitle(comp)} · {t('m.bo', { n: m.bo })} · {t('m.game', { n: m.games.length + 1 })}{isRival(m.a, m.b) && <em className="derby" title={t('dby.h2h', h2h(m.a, m.b))}>{t('dby.tag')} · {h2h(m.a, m.b).w}-{h2h(m.a, m.b).l}</em>}</div>
      <div className="vsx-main">
        <Side id={m.a} />
        <div className="vsx-mid"><b className="k-disp">VS</b><div className="k-num vsx-sc">{m.winsA} - {m.winsB}</div></div>
        <Side id={m.b} right />
      </div>
      <div className="vsx-prob">
        <span className="k-label">{t('m.winProb')}</span>
        <div className="prob"><i style={{ width: `${Math.round(mine * 100)}%` }} /></div>
        <b className="k-num">{Math.round(mine * 100)}%</b>
      </div>
      <div className="vsx-bst">
        <span className="k-label">{t('pr.chem')} <b className="text-white">{Math.round(teamChem(S.userTeam))}</b></span>
        <button className="gb sm" data-scout onClick={() => openScout(m.a === S.userTeam ? m.b : m.a)}>{t('sc.open')}</button>
        {m.games.length === 0 && S.pressDay !== S.day && <button className="gb sm" data-press-open onClick={() => openModal(() => <Press ctx="pre" opp={m.a === S.userTeam ? m.b : m.a} seed={S.day} />)}>{t('pc.open')}</button>}
        {(!!S.boosts?.length || !!S.boostActive) && <><span className="k-label">{t('bst.title')}</span><Boosts compact /></>}
      </div>
      <div className="md-actions">
        <button className="gb primary" data-a="manual" style={{ minHeight: '3rem', padding: '0 2rem' }} onClick={() => go('manual')}>{t('m.manualDraft')}</button>
        <button className="gb" data-a="auto" style={{ minHeight: '3rem' }} onClick={() => go('auto')}>{t('m.autoDraft')}</button>
        <button className="gb ghost" data-a="quick" style={{ minHeight: '3rem' }} onClick={() => go('quick')}>{t('m.quickSim')}</button>
      </div>
    </div>
  );
}

function SeriesEnd({ m, onClose }: { m: Match; onClose: () => void }) {
  const won = m.winner === S.userTeam;
  return (
    <div className="md-inner sx-end">
      <SeriesHead m={m} />
      <div className={`result ${won ? 'win' : 'loss'}`}>{t('m.seriesWin', { team: S.teams[m.winner!].name, a: Math.max(m.winsA, m.winsB), b: Math.min(m.winsA, m.winsB) })}</div>
      <div className="flex justify-center gap-3 flex-wrap my-6">{lineupPlayers(S.teams[S.userTeam]).map(({ role, p }) => <div key={role} className="flex flex-col items-center gap-1"><Face p={p} size="lg" /><b className="text-sm">{p?.ign}</b></div>)}</div>
      <Press ctx={won ? 'win' : 'loss'} opp={m.a === S.userTeam ? m.b : m.a} seed={S.day + m.winsA * 7} />
      <div className="md-actions"><button className="gb primary" data-close style={{ minHeight: '3rem', padding: '0 2.4rem' }} onClick={onClose}>{t('m.finish')}</button></div>
    </div>
  );
}

export function MatchDay({ match }: { match: Match }) {
  const [ph, setPh] = useState<Phase>(() => {
    fillLineup(S.teams[match.a]);
    fillLineup(S.teams[match.b]);
    return { k: 'pre' };
  });
  const finishSeries = () => {
    const me = S.userTeam;
    const opp = match.a === me ? match.b : match.a;
    const my = match.a === me ? match.winsA : match.winsB;
    const th = match.a === me ? match.winsB : match.winsA;
    addNews(match.winner === me ? 'news.userWin' : 'news.userLoss', { team: S.teams[me].name, opp: S.teams[opp].name, a: my, b: th }, true);
    S.userMatchesPlayed = (S.userMatchesPlayed || 0) + 1;
    setPh({ k: 'end' });
  };
  const choose = (a: 'manual' | 'auto' | 'quick') => {
    if (a === 'manual') setPh({ k: 'draft' });
    else if (a === 'auto') { const { blue, red } = sidesOf(match); setPh({ k: 'live', d: autoDraft(blue, red, match.fearless || []) }); }
    else { if (!match.done) simSeries(match); finishSeries(); }
  };
  const close = () => {
    ui.matchDay = null;
    progressComps();
    saveGame('auto');
    refresh();
  };
  return (
    <div className="matchday">
      <MatchCut key={'cut-' + ph.k} />
      {ph.k === 'pre' && <div className="md-inner md-wide"><PreMatch m={match} go={choose} /></div>}
      {ph.k === 'draft' && <DraftScreen m={match} onLeave={() => setPh({ k: 'pre' })} onStart={(d) => setPh({ k: 'live', d })} />}
      {ph.k === 'live' && <LiveGame m={match} d={ph.d} onEnd={(g) => setPh({ k: 'post', g })} onSkipAll={finishSeries} />}
      {ph.k === 'post' && <PostGame m={match} g={ph.g} onNext={choose} onFinish={finishSeries} />}
      {ph.k === 'end' && <SeriesEnd m={match} onClose={close} />}
    </div>
  );
}
