// Giao diện quản lý CLB: nhiệm vụ ban lãnh đạo, cơ sở vật chất, nhà tài trợ, kỳ chuyển nhượng, chấn thương
import { S, userTeam } from '../../engine/state';
import { FACS, FAC_COST, FAC_UPKEEP, facLv, upgradeFac, missionProgress, missionGoal, sponsorOffers, signDeal, windowOpen } from '../../engine/club';
import { TICKS } from '../../engine/career';
import { t } from '../../i18n';
import { refresh, toast } from '../store';
import { fullMoney } from '../helpers';
import type { Player } from '../../engine/types';

export const InjTag = ({ p }: { p: Player }) => (p.injury ? <em className={`inj k-${p.injury.kind}`} title={t('inj.' + p.injury.kind)}>✚ {Math.max(1, p.injury.until - S.day)}{t('inj.d')}</em> : null);

export function Missions() {
  const list = (S.missions || []).slice(0, 6);
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('mis.title')}</h3></div>
      <div className="gp-b">{list.length ? <div className="mis-list">{list.map((m) => {
        const goal = missionGoal(m), prog = Math.min(goal, missionProgress(m));
        const pctv = m.kind === 'chem' || m.kind === 'fans' ? Math.max(0, Math.min(1, (prog - m.base) / Math.max(1, goal - m.base))) : prog / goal;
        return (
          <div key={m.id} className={`mis ${m.done ? 'done' : m.failed ? 'fail' : ''}`}>
            <div className="grow min-w-0"><b>{t('mis.' + m.kind, { n: m.target })}</b>
              <small className="muted">{m.done ? t('mis.done') : m.failed ? t('mis.failed') : t('mis.left', { n: Math.max(0, m.deadline - S.day) })} · {t('mis.reward', { money: fullMoney(m.reward) })}</small></div>
            <div className="mis-p"><div className="mtr hi"><i style={{ width: `${Math.round(pctv * 100)}%` }} /></div><small>{m.kind === 'fans' ? `${Math.round(prog)}K / ${goal}K` : `${prog} / ${goal}`}</small></div>
          </div>
        );
      })}</div> : <p className="muted text-sm m-0">{t('mis.none')}</p>}</div>
    </div>
  );
}

const FAC_ICON: Record<string, string> = { house: '⌂', training: '⚙', gym: '♥', analysis: '◈' };
export function Facilities() {
  const ut = userTeam();
  return (
    <div className="gp fac">
      <div className="gp-h"><h3 className="k-title">{t('fac.title')}</h3></div>
      <div className="gp-b"><div className="fac-g">{FACS.map((k) => {
        const lv = facLv(k);
        return (
          <div key={k} className="fac-c">
            <span className="fac-i">{FAC_ICON[k]}</span>
            <div className="grow min-w-0"><b>{t('fac.' + k)} <span className="muted">· {t('fac.lv', { n: lv })}</span></b><small className="muted">{t('fac.' + k + 'D')}</small>
              <div className="fac-pips">{[1, 2, 3].map((l) => <i key={l} className={l <= lv ? 'on' : ''} />)}</div></div>
            <button className="gb sm" data-fac={k} disabled={lv >= 3 || ut.budget < FAC_COST[lv + 1]} onClick={() => { if (upgradeFac(k)) toast(t('fac.ok'), 'ok'); refresh(); }}>
              {lv >= 3 ? t('br.max') : `${t('fac.up')} · ${fullMoney(FAC_COST[lv + 1])}`}
            </button>
            {lv > 0 && <small className="muted fac-u">{t('fac.upkeep', { money: fullMoney(FAC_UPKEEP[lv] * TICKS) })}</small>}
          </div>
        );
      })}</div></div>
    </div>
  );
}

export function Sponsors() {
  const d = S.deal && S.deal.season === S.season ? S.deal : null;
  const offers = d ? [] : sponsorOffers();
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('sp.title')}</h3></div>
      <div className="gp-b">
        {d ? (
          <div className="sp-c on"><b className="k-disp">{d.brand}</b><span>{t('sp.base', { money: fullMoney(d.base) })} · {t('sp.bonus', { money: fullMoney(d.bonus) })}</span><small className="muted">{t('sp.cond.' + d.cond, { n: d.target >= 1000 ? `${(d.target / 1000).toFixed(2)}M` : `${d.target}K` })}</small></div>
        ) : (
          <>
            <p className="muted text-sm mt-0">{t('sp.pick')}</p>
            <div className="sp-g">{offers.map((o) => (
              <div key={o.id} className="sp-c">
                <b className="k-disp">{o.brand}</b>
                <span>{t('sp.base', { money: fullMoney(o.base) })}</span>
                <span className="up">{t('sp.bonus', { money: fullMoney(o.bonus) })}</span>
                <small className="muted">{t('sp.cond.' + o.cond, { n: o.target >= 1000 ? `${(o.target / 1000).toFixed(2)}M` : `${o.target}K` })}</small>
                <button className="gb primary sm" data-deal={o.id} onClick={() => { if (signDeal(o.id)) toast(t('sp.signed', { brand: o.brand }), 'ok'); refresh(); }}>{t('sp.sign')}</button>
              </div>
            ))}</div>
          </>
        )}
      </div>
    </div>
  );
}

export const WindowBadge = () => <span className={`win-b ${windowOpen() ? 'open' : ''}`} title={t('win.hint')}>{windowOpen() ? t('win.open') : t('win.closed')}</span>;
