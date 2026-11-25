// Luyện tập: scrim, lệnh xếp hạng đơn, độ ăn ý theo cặp, thẻ tăng cường
import { S, userTeam, teamPlayers, lineupPlayers } from '../../engine/state';
import { ROLES } from '../../engine/util';
import { chemOf, teamChem, scrimPartners, SQ_ORDERS, sqOrder, DUO_OF, activateBoost, type SqOrder } from '../../engine/life';
import { t } from '../../i18n';
import { refresh } from '../store';
import { Badge, CondMini, Face, RoleTag } from '../components';
import { openPlayer } from './Squad';
import type { Player, Role } from '../../engine/types';

const chemCls = (v: number) => (v >= 80 ? 'c5' : v >= 68 ? 'c4' : v >= 56 ? 'c3' : v >= 44 ? 'c2' : 'c1');
export const BOOST_ICON: Record<string, string> = { focus: '◎', synergy: '∞', meta: '◆', fresh: '✚', prep: '⚑' };

function ChemMatrix() {
  const ut = userTeam();
  const st = lineupPlayers(ut).filter((x) => x.p) as { role: Role; p: Player }[];
  const avg = teamChem(ut.id);
  const duo = (a: Role, b: Role) => DUO_OF[a] === b || DUO_OF[b] === a;
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('pr.chem')}</h3><span className={`chem-big ${chemCls(avg)}`}>{Math.round(avg)}</span></div>
      <div className="gp-b">
        <div className="chem-m" style={{ gridTemplateColumns: `minmax(90px, 1.2fr) repeat(${st.length}, minmax(0, 1fr))` }}>
          <span />
          {st.map(({ role, p }) => <span key={role} className="cm-h"><Face p={p} size="xs" /><RoleTag r={role} /></span>)}
          {st.map(({ role: ra, p: a }) => (
            <div key={ra} className="cm-row">
              <span className="cm-n"><RoleTag r={ra} /><b>{a.ign}</b></span>
              {st.map(({ role: rb, p: b }) => {
                if (a.id === b.id) return <span key={rb} className="cm-c self" />;
                const v = chemOf(a.id, b.id);
                return <span key={rb} className={`cm-c ${chemCls(v)} ${duo(ra, rb) ? 'duo' : ''}`} title={`${a.ign} × ${b.ign}`}>{Math.round(v)}</span>;
              })}
            </div>
          ))}
        </div>
        <p className="muted text-xs mt-3">{t('pr.chemHint')}</p>
      </div>
    </div>
  );
}

function Scrim() {
  const plan = (S.scrimPlan ??= { on: false, opp: null });
  const partners = scrimPartners();
  const ut = userTeam();
  const league = Object.values(S.teams).filter((x) => x.league === ut.league && x.id !== ut.id);
  const set = (p: Partial<typeof plan>) => { Object.assign(plan, p); refresh(); };
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('pr.scrim')}</h3>
        <label className="tg"><input type="checkbox" data-scrim checked={plan.on} onChange={(e) => set({ on: e.target.checked })} /> {t('pr.scrimOn')}</label>
      </div>
      <div className="gp-b">
        <p className="muted text-sm mt-0">{t('pr.scrimHint')}</p>
        <div className="sc-part">
          <button className={`sc-t ${!plan.opp ? 'on' : ''}`} data-sopp="auto" onClick={() => set({ opp: null })}><span className="sc-auto">⟳</span><small>{t('pr.auto')}</small></button>
          {league.map((x) => (
            <button key={x.id} className={`sc-t ${plan.opp === x.id ? 'on' : ''} ${partners.includes(x.id) ? '' : 'sc-off'}`} data-sopp={x.id} onClick={() => set({ opp: x.id })} title={x.name}>
              <Badge id={x.id} size="md" /><small>{x.short}</small>
            </button>
          ))}
        </div>
        {!!S.scrims?.length && (
          <div className="sc-log">
            {S.scrims.slice(0, 6).map((r, i) => (
              <div key={i} className={`sc-r ${r.win ? 'w' : 'l'}`}><b>{r.win ? t('pr.w') : t('pr.l')}</b><Badge id={r.opp} size="sm" /><span>{S.teams[r.opp]?.short}</span><span className="muted">{r.k[0]}-{r.k[1]} · {Math.round(r.mins)}'</span><small className="muted">{S.day - r.day <= 0 ? t('feed.today') : t('feed.daysAgo', { n: S.day - r.day })}</small></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SoloOrders() {
  const ut = userTeam();
  const ps = teamPlayers(ut).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const setO = (pid: string, o: SqOrder) => { S.sqOrder ??= {}; S.sqOrder[pid] = o; refresh(); };
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('pr.solo')}</h3>
        <div className="flex gap-1">{SQ_ORDERS.map((o) => <button key={o} className="gb ghost xs" data-sqall={o} onClick={() => { for (const p of ps) { S.sqOrder ??= {}; S.sqOrder[p.id] = o; } refresh(); }} title={t('pr.allTo', { o: t('sq.' + o) })}>{t('sq.' + o)}</button>)}</div>
      </div>
      <div className="gp-b">
        <div className="sq-list">
          {ps.map((p) => (
            <div key={p.id} className="sq-row">
              <span className="sq-p" onClick={() => openPlayer(p.id)}><RoleTag r={p.role} /><Face p={p} size="sm" /><b>{p.ign}</b></span>
              <CondMini p={p} />
              <div className="seg sq-seg">{SQ_ORDERS.map((o) => <button key={o} className={`chip ${sqOrder(p.id) === o ? 'on' : ''}`} data-sq={`${p.id}:${o}`} onClick={() => setO(p.id, o)}>{t('sq.' + o)}</button>)}</div>
            </div>
          ))}
        </div>
        <div className="sq-legend">{SQ_ORDERS.map((o) => <div key={o}><b>{t('sq.' + o)}</b><span>{t('sq.' + o + 'D')}</span></div>)}</div>
      </div>
    </div>
  );
}

export function Boosts({ compact = false }: { compact?: boolean }) {
  const list = S.boosts || [];
  return (
    <div className={compact ? 'bst-c' : 'gp'}>
      {!compact && <div className="gp-h"><h3 className="k-title">{t('bst.title')}</h3><span className="gp-r">{list.length}/6</span></div>}
      <div className={compact ? '' : 'gp-b'}>
        {!list.length ? <p className="muted text-sm m-0">{t('bst.none')}</p> : (
          <div className="bst-list">
            {list.map((b) => {
              const on = S.boostActive?.id === b.id;
              return (
                <button key={b.id} className={`bst k-${b.kind} ${on ? 'on' : ''}`} data-boost={b.id} onClick={() => { activateBoost(on ? null : b.id); refresh(); }}>
                  <span className="bi">{BOOST_ICON[b.kind]}</span>
                  <span className="bt"><b>{t('bst.' + b.kind)}</b><small>{t('bst.' + b.kind + 'D')}</small></span>
                  <em>{on ? t('bst.active') : t('bst.use')}</em>
                </button>
              );
            })}
          </div>
        )}
        {!compact && <p className="muted text-xs mt-3">{t('bst.hint')}</p>}
      </div>
    </div>
  );
}

export function Practice() {
  return (
    <div className="prac stag">
      <div className="prac-l"><Scrim /><SoloOrders /></div>
      <div className="prac-r"><ChemMatrix /><Boosts /></div>
    </div>
  );
}
