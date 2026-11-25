// Dải thông tin CLB kiểu FC: giá trị CLB, tổng lương / trần, đồng điệu đội hình
import { S, userTeam, teamSalary } from '../../engine/state';
import { salaryCap, teamColor, clubValue, valueRank, LUX_RATE } from '../../engine/squadx';
import { money } from '../../engine/util';
import { t } from '../../i18n';

const TC_ICON: Record<string, string> = { nation: '⚑', champs: '♛', academy: '❀', duo: '∞' };
export function TeamColorIcons({ teamId }: { teamId?: string }) {
  const tm = teamId ? S.teams[teamId] : userTeam();
  const tc = teamColor(tm);
  if (!tc.items.length) return <span className="muted text-xs">{t('tc.none')}</span>;
  return (
    <span className="tc-ic">{tc.items.map((x) => (
      <span key={x.kind} className={`tc k-${x.kind}`} title={`${t('tc.' + x.kind)} (${t('tc.lv', { n: x.level })}): ${x.who.join(', ')}`}><i>{TC_ICON[x.kind]}</i><b>{x.level}</b></span>
    ))}</span>
  );
}
export function ClubStrip() {
  const ut = userTeam();
  const { cap, floor } = salaryCap(ut.league);
  const pay = teamSalary(ut);
  const over = pay > cap;
  const tc = teamColor(ut);
  const hist = (S.valueHist || []).slice(0, 8).reverse();
  const v = clubValue(ut);
  const prev = hist.length > 1 ? hist[0].v : v;
  return (
    <div className="cstrip">
      <div className="cs-k"><small>{t('cv.value')}</small><b className="k-num">{money(v)}</b><em className={v >= prev ? 'up' : 'down'}>#{valueRank(ut)} {t('cv.world')}</em></div>
      <div className="cs-k"><small>{t('cap.total')}</small><b className={`k-num ${over ? 'down' : ''}`}>{money(pay)} <span className="muted">/ {money(cap)}</span></b>
        <div className={`mtr ${over ? 'lo' : pay > cap * 0.9 ? 'mid' : 'hi'}`}><i style={{ width: `${Math.min(100, (pay / cap) * 100)}%` }} /></div>
        <em className="muted">{over ? t('cap.tax', { money: money((pay - cap) * LUX_RATE) }) : pay < floor ? t('cap.floor', { money: money(floor) }) : t('cap.ok')}</em></div>
      <div className="cs-k"><small>{t('tc.title')} {tc.bonus > 0 && <span className="up">+{tc.bonus.toFixed(1)}</span>}</small><TeamColorIcons /></div>
    </div>
  );
}
