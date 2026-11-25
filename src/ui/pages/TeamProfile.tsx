// Hồ sơ đội: đội hình, danh hiệu, thành tích mùa, đối đầu với đội của bạn, kết quả gần đây
import { S, teamOvr, lineupPlayers, teamPlayers } from '../../engine/state';
import { coachStyle, isRival } from '../../engine/world';
import { gprTable } from '../../engine/gpr';
import { teamChem } from '../../engine/life';
import { t } from '../../i18n';
import { openModal, closeModal } from '../store';
import { Badge, Face, LeagueBadge, Ovr, RoleTag } from '../components';
import { openPlayer } from './Squad';
import type { Match } from '../../engine/types';

function seriesOf(tid: string): Match[] {
  return Object.values(S.comps).flatMap((c) => c.matches).filter((m) => m.done && (m.a === tid || m.b === tid)).sort((a, b) => b.day - a.day);
}
function TeamProfile({ id }: { id: string }) {
  const tm = S.teams[id];
  const ps = lineupPlayers(tm).filter((x) => x.p);
  const subs = teamPlayers(tm).filter((p) => !ps.some((x) => x.p!.id === p.id));
  const all = seriesOf(id);
  const thisY = all.filter((m) => S.comps[m.comp]?.id.startsWith(`${S.season}-`));
  const w = thisY.filter((m) => m.winner === id).length;
  const h2h = id === S.userTeam ? [] : all.filter((m) => m.a === S.userTeam || m.b === S.userTeam);
  const hw = h2h.filter((m) => m.winner === S.userTeam).length;
  const gpr = gprTable().find((r) => r.team === id);
  const cups = [...tm.trophies].reverse();
  return (
    <div className="tp">
      <div className="tp-hero">
        <Badge id={id} size="xl" />
        <div className="tp-t">
          <small className="k-label flex items-center gap-2"><LeagueBadge id={tm.league} size="xs" />{tm.league}{tm.coach ? ` · HLV ${tm.coach}` : ''}{id !== S.userTeam ? ` · ${t('cs.' + coachStyle(id))}` : ''}{id !== S.userTeam && isRival(id, S.userTeam) && <em className="derby">{t('dby.tag')}</em>}</small>
          <b className="k-disp">{tm.name}</b>
          <div className="tp-kpis">
            <span><small>OVR</small><Ovr v={teamOvr(tm)} /></span>
            {gpr && <span><small>GPR</small><b>#{gpr.rank}</b></span>}
            <span><small>{t('tp.season')}</small><b>{w}-{thisY.length - w}</b></span>
            <span><small>{t('pr.chem')}</small><b>{Math.round(teamChem(id))}</b></span>
            <span><small>{t('tp.trophies')}</small><b>{tm.trophies.length}</b></span>
          </div>
        </div>
      </div>
      <div className="tp-grid">
        <div className="tp-sec">
          <h4>{t('nav.roster')}</h4>
          <div className="tp-roster">{ps.map(({ role, p }) => (
            <button key={role} className="tp-p" data-player={p!.id} onClick={() => { closeModal(); openPlayer(p!.id); }}>
              <Face p={p!} size="lg" /><span className="tp-pn"><RoleTag r={role} /><b>{p!.ign}</b></span><Ovr v={p!.ovr} />
            </button>
          ))}</div>
          {!!subs.length && <div className="tp-subs muted text-sm">{t('roster.sub')}: {subs.map((p) => p.ign).join(', ')}</div>}
        </div>
        <div className="tp-sec">
          {id !== S.userTeam && (
            <>
              <h4>{t('tp.h2h')}</h4>
              <div className="tp-h2h"><Badge id={S.userTeam} size="md" /><b className="k-num">{hw} - {h2h.length - hw}</b><Badge id={id} size="md" /></div>
            </>
          )}
          <h4>{t('tp.recent')}</h4>
          <div className="tp-rec">{all.slice(0, 6).map((m) => {
            const opp = m.a === id ? m.b : m.a, won = m.winner === id;
            return <div key={m.id} className={`tp-r ${won ? 'w' : 'l'}`}><b>{won ? 'W' : 'L'}</b><Badge id={opp} size="sm" /><span>{S.teams[opp].short}</span><span className="k-num">{m.a === id ? m.winsA : m.winsB}-{m.a === id ? m.winsB : m.winsA}</span></div>;
          })}{!all.length && <p className="muted text-sm">—</p>}</div>
          <h4>{t('tp.trophies')}</h4>
          <div className="tp-cups">{cups.length ? cups.slice(0, 12).map((c, i) => <span key={i} className="tp-cup">🏆 {c}</span>) : <p className="muted text-sm">{t('tp.noTrophy')}</p>}</div>
        </div>
      </div>
    </div>
  );
}
export function openTeam(id: string): void {
  if (!S.teams[id]) return;
  openModal(() => <TeamProfile id={id} />, { wide: true });
}
