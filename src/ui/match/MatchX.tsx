// Giao diện chiều sâu trận đấu: kế hoạch đầu trận, nói chuyện với đội, cảnh báo AI đã nghiên cứu bạn.
import { useState } from 'react';
import { S } from '../../engine/state';
import { LVL1, PATHS, WARDS, defaultEarly, teamTalk, TONES, topHabits, temperOf, type Tone } from '../../engine/matchx';
import { coachStyle } from '../../engine/world';
import { t } from '../../i18n';
import { refresh } from '../store';
import { Champ } from '../components';
import type { Match, Player } from '../../engine/types';

/** đang dẫn / bị dẫn / hòa trong loạt (góc nhìn người chơi) */
export function talkCtx(m: Match): 'lead' | 'trail' | 'even' {
  const my = m.a === S.userTeam ? m.winsA : m.winsB, th = m.a === S.userTeam ? m.winsB : m.winsA;
  return my > th ? 'lead' : my < th ? 'trail' : 'even';
}

export function EarlyPlanBox() {
  S.tactics.early ??= defaultEarly();
  const e = S.tactics.early;
  const row = <K extends 'lvl1' | 'path' | 'ward'>(k: K, opts: readonly string[]) => (
    <div className="ph-row"><span className="k-label">{t('ep.' + k)}</span>
      <div className="chips">{opts.map((o) => <button key={o} className={`chp sm ${e[k] === o ? 'on' : ''}`} data-ep={`${k}:${o}`} title={t(`ep.${k}.${o}D`)} onClick={() => { (e as Record<string, string>)[k] = o; refresh(); }}>{t(`ep.${k}.${o}`)}</button>)}</div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 pb-3 border-b border-line">
      <div><b className="k-title" style={{ fontSize: '.92rem' }}>{t('ep.title')}</b><div className="muted text-sm">{t('ep.hint')}</div></div>
      {row('lvl1', LVL1)}{row('path', PATHS)}{row('ward', WARDS)}
    </div>
  );
}

/** đội AI thường làm gì ở cấp 1 (theo cá tính HLV) + cảnh báo tướng tủ đã bị nghiên cứu */
export function OppTendency({ opp }: { opp: string }) {
  const st = coachStyle(opp);
  const lv = st === 'aggressive' ? 'invade' : st === 'safe' ? 'defend' : null;
  const hab = topHabits(3);
  return (
    <div className="opp-tend text-sm">
      <span className="muted">{t('ep.oppStyle')}:</span> <b>{t('cs.' + st)}</b>{lv && <span className="muted"> · {t('ep.oppLvl1', { v: t('ep.lvl1.' + lv) })}</span>}
      {hab.length > 0 && <span className="habit-w">{t('ai.studied')}{hab.map((c) => <Champ key={c} id={c} size={18} />)}</span>}
    </div>
  );
}

const FACE: Record<string, string> = { up: '▲', down: '▼', flat: '•' };
/** nói chuyện với đội: một lần trước mỗi ván */
export function TeamTalk({ m, ctx }: { m: Match; ctx: 'pre' | 'lead' | 'trail' | 'even' }) {
  const key = `${m.id}:${m.games.length}`;
  const [res, setRes] = useState<{ tone: Tone; list: ReturnType<typeof teamTalk> } | null>(null);
  const done = (S.talks?.[key] ?? 0) > 0 && !res;
  if (done) return null;
  return (
    <div className="talk">
      <div className="talk-h"><small className="k-label">{t('tt.title')}</small><span className="muted text-xs">{t('tt.ctx.' + ctx)}</span></div>
      {!res ? (
        <div className="talk-o">{TONES.map((tone) => (
          <button key={tone} className="gb sm" data-talk={tone} title={t('tt.' + tone + 'D')} onClick={() => {
            const list = teamTalk(S.userTeam, tone, ctx);
            (S.talks ??= {})[key] = S.day + 1;
            // gọn dữ liệu: chỉ giữ các lần nói chuyện gần đây
            for (const k of Object.keys(S.talks)) if (S.talks[k] < S.day - 30) delete S.talks[k];
            setRes({ tone, list }); refresh();
          }}>{t('tt.' + tone)}</button>
        ))}</div>
      ) : (
        <div className="talk-r">{res.list.map((x) => {
          const p = S.players[x.pid] as Player | undefined;
          const dir = x.d > 0.15 ? 'up' : x.d < -0.15 ? 'down' : 'flat';
          return <span key={x.pid} className={`talk-p ${dir}`} title={p ? t('tmp.' + temperOf(p)) : ''}><i>{FACE[dir]}</i>{x.ign}<small>{p ? t('tmp.' + temperOf(p)) : ''}</small></span>;
        })}</div>
      )}
    </div>
  );
}
