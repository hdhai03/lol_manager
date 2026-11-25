// Hồ sơ tuyển thủ (bổ sung): động lực, ngoại binh & hòa nhập, kèm cặp, luyện đổi vị trí.
import { S, userTeam, teamPlayers } from '../../engine/state';
import { ambitionOf } from '../../engine/market';
import { isImport, adaptOf, langOf, teamLang, mentorOf, menteeOf, mentorOk, setMentor, startSwap, swapRate, ovrAs, importsIn, IMPORT_MAX } from '../../engine/squad2';
import { academyPlayers } from '../../engine/academy';
import { ROLES } from '../../engine/util';
import { t } from '../../i18n';
import { refresh, toast } from '../store';
import { RoleIcon } from '../components';
import type { Player, Role } from '../../engine/types';

export function PlayerX({ p }: { p: Player }) {
  const ut = userTeam();
  const mine = p.teamId === ut.id || p.academyOf === ut.id;
  const lg = p.teamId ? S.teams[p.teamId].league : ut.league;
  const imp = isImport(p, lg);
  const adapt = Math.round(adaptOf(p));
  const amb = ambitionOf(p);
  const mentor = mentorOf(p.id), mentee = menteeOf(p.id);
  const sw = S.swap?.[p.id];
  const mentors = mine && p.age <= 22 ? teamPlayers(ut).filter((m) => !mentorOk(p, m)) : [];
  return (
    <div className="pdx">
      <div className="pdx-row">
        <span className="pdx-k">{t('amb.label')}</span><b title={t('amb.' + amb + 'D')}>{t('amb.' + amb)}</b>
        {p.wantsOut && <span className="pdx-bad">{t('p.wantsOut')}</span>}
        {imp && <span className="pdx-tag" title={t('imp.hint', { max: IMPORT_MAX })}>{t('imp.tag')}</span>}
        {(p.resid || []).length > 0 && <span className="pdx-tag ok">{t('imp.resident', { lg: p.resid!.join(', ') })}</span>}
      </div>
      {p.adapt != null && p.teamId && (
        <div className="ab"><span>{t('imp.adapt', { lang: t('lang.' + langOf(p)), team: t('lang.' + teamLang(S.teams[p.teamId])) })}</span><div className="bar"><i style={{ width: `${adapt}%` }} /></div><b>{adapt}</b></div>
      )}
      {mine && (
        <div className="pdx-grid">
          <div>
            <div className="sub-h">{t('mt.title')}</div>
            {mentee ? <p className="text-sm m-0">{t('mt.mentoring', { player: mentee.ign })}</p>
              : p.age <= 22 ? (
                <select className="gin sm" data-mentor value={mentor?.id || ''} onChange={(e) => { const err = setMentor(p.id, e.target.value || null); if (err) toast(t(err), 'err'); refresh(); }}>
                  <option value="">{t('mt.none')}</option>
                  {mentor && !mentors.includes(mentor) && <option value={mentor.id}>{mentor.ign}</option>}
                  {mentors.map((m) => <option key={m.id} value={m.id}>{m.ign} · {t('role.' + m.role)} · {m.ovr}</option>)}
                </select>
              ) : <p className="muted text-sm m-0">{t('mt.hint')}</p>}
          </div>
          <div>
            <div className="sub-h">{t('sw.title')}</div>
            <div className="chips">{ROLES.filter((r) => r !== p.role).map((r: Role) => (
              <button key={r} className={`chp sm ${sw?.to === r ? 'on' : ''}`} data-swap={r} title={`${t('role.' + r)} · OVR ${ovrAs(p, r)}`} onClick={() => { startSwap(p.id, sw?.to === r ? null : r); refresh(); }}><RoleIcon r={r} /></button>
            ))}</div>
            {sw ? <div className="ab mt-1"><span>{t('sw.prog', { role: t('role.' + sw.to), ovr: ovrAs(p, sw.to) })}</span><div className="bar teal"><i style={{ width: `${Math.min(100, sw.prog)}%` }} /></div><b>{Math.ceil((100 - sw.prog) / swapRate(p))}{t('sw.days')}</b></div>
              : <p className="muted text-xs m-0 mt-1">{t('sw.hint')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** dải thông tin ngoại binh của đội (trang đội hình) */
export function ImportStrip() {
  const ut = userTeam();
  const n = importsIn(ut).length;
  const pend = [...teamPlayers(ut), ...academyPlayers()].filter((p) => p.adapt != null).length;
  return <span className={`imp-strip ${n > IMPORT_MAX ? 'bad' : ''}`} title={t('imp.hint', { max: IMPORT_MAX })}>{t('imp.count', { n, max: IMPORT_MAX })}{pend ? ` · ${t('imp.adapting', { n: pend })}` : ''}</span>;
}
