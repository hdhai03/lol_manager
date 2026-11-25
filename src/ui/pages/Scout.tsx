// Báo cáo trinh sát đối thủ + họp báo
import { useState } from 'react';
import { coachStyle } from '../../engine/world';
import { S } from '../../engine/state';
import { scoutReport, applyScout, pressQuestion, pressAnswer, type PressCtx, type PressTone } from '../../engine/scout';
import { t, cname } from '../../i18n';
import { openModal, refresh, toast } from '../store';
import { Badge, Champ, Face, Ovr, RoleTag } from '../components';
import { TIER_L } from '../../engine/runes';

function ScoutBody({ opp, close }: { opp: string; close: () => void }) {
  const r = scoutReport(opp);
  const tm = S.teams[opp];
  return (
    <div className="sc">
      <div className="sc-h"><Badge id={opp} size="lg" /><div className="grow"><small className="k-label">{t('sc.title')}</small><b className="k-disp">{tm.name}</b>
        <div className="muted text-sm">{t('sc.recent', { w: r.recent.w, l: r.recent.l })} · {t('sc.depth', { n: r.depth })}</div></div></div>
      <div className="sc-style"><small className="k-label">{t('sc.style')}</small><b>{t('sc.st.' + r.style)}</b><span className="muted text-sm">{t('sc.why.' + r.styleWhy)} · {t('sc.coach', { coach: tm.coach || '?', style: t('cs.' + coachStyle(opp)) })}</span></div>
      <div className="sc-ps">{r.players.map((sp, i) => (
        <div key={sp.role} className={`sc-p ${i === 0 ? 'top' : ''}`}>
          <Face p={sp.p} size="md" />
          <div className="sc-pn"><span className="flex items-center gap-2"><RoleTag r={sp.role} /><b>{sp.p.ign}</b>{i === 0 && <em className="tagx">{t('sc.danger')}</em>}</span><span className="muted text-xs">{t('sc.threat')} {sp.danger}</span></div>
          <Ovr v={sp.p.ovr} />
          <div className="sc-ch">{sp.champs.map((c) => <span key={c.c} className="sc-c" title={`${cname(c.c)} · ${c.g} ${t('sc.games')} · ${Math.round(c.wr * 100)}%`}><Champ id={c.c} size={32} /><small>{TIER_L[c.tier - 1] || 'D'}</small></span>)}</div>
        </div>
      ))}</div>
      <div className="sc-sug">
        <div><small className="k-label">{t('sc.bans')}</small><div className="flex gap-2 mt-1">{r.bans.map((c) => <Champ key={c} id={c} size={40} />)}</div></div>
        <div><small className="k-label">{t('sc.counter')}</small><div className="flex gap-2 flex-wrap mt-1">{Object.entries(r.tactics).map(([k, v]) => <span key={k} className="tagx">{t('tac.' + k)}: {t(`tac.${k}.${v}`)}</span>)}</div></div>
      </div>
      <div className="flex justify-end gap-2 mt-2"><button className="gb ghost" onClick={close}>{t('common.close')}</button><button className="gb primary" data-scout-apply onClick={() => { applyScout(r); toast(t('sc.applied'), 'ok'); close(); refresh(); }}>{t('sc.apply')}</button></div>
    </div>
  );
}
export function openScout(opp: string): void { openModal((close) => <ScoutBody opp={opp} close={close} />, { wide: true }); }

/** khung họp báo: một câu hỏi, ba cách trả lời */
export function Press({ ctx, opp, seed }: { ctx: PressCtx; opp: string; seed: number }) {
  const [done, setDone] = useState<string | null>(null);
  const q = pressQuestion(ctx, seed);
  return (
    <div className="press">
      <small className="k-label">{t('pc.title')}</small>
      <b className="press-q">“{t('pc.q.' + q, { opp: S.teams[opp]?.short || '' })}”</b>
      {done ? <p className="press-out">{t('pc.out.' + done)}</p> : (
        <div className="press-a">{(['confident', 'humble', 'provoke'] as PressTone[]).map((tone) => (
          <button key={tone} className="gb sm" data-press={tone} onClick={() => { setDone(pressAnswer(ctx, tone, opp)); refresh(); }}>
            <b>{t('pc.t.' + tone)}</b><small>{t(`pc.a.${ctx}.${tone}`, { opp: S.teams[opp]?.short || '' })}</small>
          </button>
        ))}</div>
      )}
    </div>
  );
}
