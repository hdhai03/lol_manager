// Sự nghiệp HLV + Tài chính (thương hiệu, sổ thu chi theo tuần)
import { S, userTeam, teamPlayers, teamSalary, saveGame } from '../../engine/state';
import { Missions, Sponsors } from './Club';
import { Achievements } from './Stats';
import { money } from '../../engine/util';
import { ensureCareer, ensureBrand, objTarget, switchTeam, setContent, upgradeMerch, fanFestival, merchPerDay, CONTENT_COST, MERCH_UPGRADE, FEST_COST, TICKS, LEDGER_CATS, type LedgerCat } from '../../engine/career';
import { t } from '../../i18n';
import { refresh, toast } from '../store';
import { Badge, Face, LeagueBadge, RoleTag } from '../components';
import { fullMoney } from '../helpers';
import { openPlayer } from './Squad';
import { openTeam } from './TeamProfile';
import { teamOvr } from '../../engine/state';

const Meter = ({ v, cls }: { v: number; cls?: string }) => <div className={`mtr ${cls || (v >= 60 ? 'hi' : v >= 30 ? 'mid' : 'lo')}`}><i style={{ width: `${Math.max(2, Math.min(100, v))}%` }} /></div>;

export function Career() {
  const c = ensureCareer();
  const ut = userTeam();
  const n = Object.values(S.teams).filter((x) => x.league === ut.league).length;
  const total = c.w + c.l;
  const titles = c.hist.flatMap((h) => h.titles);
  return (
    <div className="car stag">
      <div className="car-top">
        <div className="gp car-kpi"><div className="gp-b">
          <small className="k-label">{t('car.rep')}</small><b className="k-disp">{Math.round(c.rep)}</b><Meter v={c.rep} cls="rep" /><span className="muted text-xs">{t(c.rep >= 75 ? 'car.repElite' : c.rep >= 55 ? 'car.repGood' : c.rep >= 35 ? 'car.repMid' : 'car.repLow')}</span>
        </div></div>
        <div className="gp car-kpi"><div className="gp-b">
          <small className="k-label">{t('car.conf')}</small><b className={`k-disp ${c.conf < 30 ? 'neg' : ''}`}>{Math.round(c.conf)}</b><Meter v={c.conf} /><span className="muted text-xs">{t(c.conf >= 60 ? 'car.confHi' : c.conf >= 30 ? 'car.confMid' : 'car.confLo')}</span>
        </div></div>
        <div className="gp car-kpi"><div className="gp-b">
          <small className="k-label">{t('car.obj')}</small><b className="car-obj">{t('goal.' + c.obj)}</b><span className="muted text-xs">{t('car.objRank', { n: objTarget(c.obj, n) })}</span>
        </div></div>
        <div className="gp car-kpi"><div className="gp-b">
          <small className="k-label">{t('car.record')}</small><b className="k-disp">{c.w}-{c.l}</b><span className="muted text-xs">{total ? `${Math.round((c.w / total) * 100)}% · ` : ''}{t('car.titles', { n: titles.length })}</span>
        </div></div>
      </div>
      {(c.sacked || c.offers.length > 0) && (
        <div className={`gp car-off ${c.sacked ? 'sacked' : ''}`}>
          <div className="gp-h"><h3 className="k-title">{c.sacked ? t('car.sackedT') : t('car.offersT')}</h3></div>
          <div className="gp-b">
            <p className="muted text-sm mt-0">{c.sacked ? t('car.sackedD', { team: ut.name }) : t('car.offersD')}</p>
            <div className="car-offers">{c.offers.map((o) => {
              const tm = S.teams[o.team];
              return (
                <div key={o.team} className="car-o">
                  <button className="car-ob" onClick={() => openTeam(o.team)}><Badge id={o.team} size="lg" /></button>
                  <div className="grow min-w-0"><b>{tm.name}</b><div className="muted text-xs flex items-center gap-2"><LeagueBadge id={tm.league} size="xs" />{tm.league} · OVR {teamOvr(tm)}</div></div>
                  <button className="gb primary sm" data-job={o.team} disabled={S.phase !== 'offseason' && !c.sacked} onClick={() => { switchTeam(o.team); saveGame(); toast(t('car.joined', { team: tm.name }), 'ok'); refresh(); }}>{t('car.accept')}</button>
                </div>
              );
            })}{!c.offers.length && <p className="muted">—</p>}</div>
            {!c.sacked && S.phase !== 'offseason' && <p className="muted text-xs mb-0">{t('car.offseasonOnly')}</p>}
          </div>
        </div>
      )}
      <Missions />
      <Achievements />
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('car.history')}</h3></div>
        <div className="gp-b" style={{ overflowX: 'auto' }}>
          <table className="gt"><thead><tr><th>{t('car.season')}</th><th>{t('team')}</th><th>{t('car.best')}</th><th>{t('car.series')}</th><th>{t('car.conf')}</th><th>{t('tp.trophies')}</th></tr></thead>
            <tbody>
              <tr className="me"><td className="n">{S.season}</td><td><div className="nm2"><Badge id={ut.id} size="sm" />{ut.name}</div></td><td className="n">{c.best ? `#${c.best}` : '—'}</td><td className="n">{c.sw}-{c.sl}</td><td className="n">{Math.round(c.conf)}</td><td className="text-sm">{ut.trophies.filter((x) => x.endsWith(String(S.season))).join(', ') || '—'}</td></tr>
              {c.hist.map((h) => (
                <tr key={h.season + h.team}><td className="n">{h.season}</td><td><div className="nm2"><Badge id={h.team} size="sm" />{S.teams[h.team]?.name}</div></td><td className="n">{h.best ? `#${h.best}` : '—'}</td><td className="n">{h.w}-{h.l}</td><td className="n">{h.conf}</td><td className="text-sm">{h.titles.join(', ') || '—'}</td></tr>
              ))}
            </tbody></table>
          <p className="muted text-xs">{t('car.hint')}</p>
        </div>
      </div>
    </div>
  );
}

const CAT_CLR: Record<LedgerCat, string> = { sponsor: '#6ee7a8', merch: '#7cc4ff', prize: '#ffcf6e', transfer: '#c8aaff', salary: '#ff8f8f', staff: '#ffb27a', other: '#9aa3b2' };
function WeekChart() {
  const rows = [...(S.ledger || [])].slice(0, 10).reverse();
  if (!rows.length) return <p className="muted text-sm">{t('fin.noWeeks')}</p>;
  const v = (r: Record<string, unknown>, c: LedgerCat) => (r[c] as number) || 0;
  const max = Math.max(1, ...rows.map((r) => Math.max(LEDGER_CATS.reduce((s, c) => s + Math.max(0, v(r, c)), 0), LEDGER_CATS.reduce((s, c) => s - Math.min(0, v(r, c)), 0))));
  return (
    <>
      <div className="wk-chart">{rows.map((r) => {
        const net = LEDGER_CATS.reduce((s, c) => s + v(r, c), 0);
        return (
          <div key={r.key} className="wk-col" title={`${t('fin.week', { n: r.week })}: ${net >= 0 ? '+' : ''}${money(net)}`}>
            <div className="wk-up">{LEDGER_CATS.filter((c) => v(r, c) > 0).map((c) => <i key={c} style={{ height: `${(v(r, c) / max) * 100}%`, background: CAT_CLR[c] }} />)}</div>
            <div className="wk-dn">{LEDGER_CATS.filter((c) => v(r, c) < 0).map((c) => <i key={c} style={{ height: `${(-v(r, c) / max) * 100}%`, background: CAT_CLR[c] }} />)}</div>
            <small className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '+' : ''}{money(net)}</small>
            <span className="muted">{t('fin.wk', { n: r.week })}</span>
          </div>
        );
      })}</div>
      <div className="wk-leg">{LEDGER_CATS.map((c) => <span key={c}><i style={{ background: CAT_CLR[c] }} />{t('fin.cat.' + c)}</span>)}</div>
      <table className="gt mt-3"><thead><tr><th>{t('fin.weekH')}</th>{LEDGER_CATS.map((c) => <th key={c}>{t('fin.cat.' + c)}</th>)}<th>{t('fin.netH')}</th></tr></thead>
        <tbody>{[...rows].reverse().map((r) => {
          const net = LEDGER_CATS.reduce((s, c) => s + v(r, c), 0);
          return <tr key={r.key}><td className="n">{t('fin.week', { n: r.week })}</td>{LEDGER_CATS.map((c) => <td key={c} className={`n ${v(r, c) < 0 ? 'down' : v(r, c) > 0 ? 'up' : 'muted'}`}>{v(r, c) ? money(v(r, c)) : '·'}</td>)}<td className={`n ${net < 0 ? 'down' : 'up'}`}><b>{money(net)}</b></td></tr>;
        })}</tbody></table>
    </>
  );
}

function BrandPanel() {
  const b = ensureBrand();
  const ut = userTeam();
  const festWait = S.festDay != null ? Math.max(0, 30 - (S.day - S.festDay)) : 0;
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('br.title')}</h3></div>
      <div className="gp-b brandp">
        <div className="br-kpis">
          <div><small>{t('br.fans')}</small><b className="k-disp">{b.fans >= 1000 ? `${(b.fans / 1000).toFixed(2)}M` : `${Math.round(b.fans)}K`}</b><span className={b.fans >= b.fansStart ? 'up' : 'down'}>{b.fans >= b.fansStart ? '▲' : '▼'} {Math.abs(((b.fans / b.fansStart) - 1) * 100).toFixed(1)}%</span></div>
          <div><small>{t('br.hype')}</small><b className="k-disp">{Math.round(b.hype)}</b><Meter v={b.hype} cls="hype" /></div>
          <div><small>{t('br.merch')}</small><b className="k-disp">{money(merchPerDay(b) * TICKS)}</b><span className="muted">{t('br.perSeason')}</span></div>
        </div>
        <div className="br-opt">
          <div className="br-h"><b>{t('br.content')}</b><span className="muted text-xs">{t('br.contentD')}</span></div>
          <div className="seg">{[0, 1, 2, 3].map((l) => <button key={l} className={`chip ${b.content === l ? 'on' : ''}`} data-content={l} onClick={() => { setContent(l); refresh(); }}>{t('br.lv' + l)}{l ? ` · ${fullMoney(CONTENT_COST[l] * TICKS)}/${t('br.season')}` : ''}</button>)}</div>
        </div>
        <div className="br-opt">
          <div className="br-h"><b>{t('br.store', { n: b.merch })}</b><span className="muted text-xs">{t('br.storeD')}</span></div>
          <button className="gb sm" data-merch disabled={b.merch >= 3 || ut.budget < (MERCH_UPGRADE[b.merch + 1] ?? Infinity)} onClick={() => { if (upgradeMerch()) toast(t('br.storeOk'), 'ok'); refresh(); }}>{b.merch >= 3 ? t('br.max') : t('br.upgrade', { cost: fullMoney(MERCH_UPGRADE[b.merch + 1]) })}</button>
        </div>
        <div className="br-opt">
          <div className="br-h"><b>{t('br.fest')}</b><span className="muted text-xs">{t('br.festD')}</span></div>
          <button className="gb sm" data-fest disabled={festWait > 0 || ut.budget < FEST_COST} onClick={() => { if (fanFestival()) toast(t('br.festOk'), 'ok'); refresh(); }}>{festWait ? t('br.festWait', { n: festWait }) : t('br.festGo', { cost: fullMoney(FEST_COST) })}</button>
        </div>
      </div>
    </div>
  );
}

export function Finance() {
  const ut = userTeam();
  const pay = teamSalary(ut);
  const Big = ({ l, v, cls = '' }: { l: string; v: string; cls?: string }) => (
    <div className="gp"><div className="gp-b"><span className="k-label">{l}</span><b className={`k-disp mt-1 ${cls}`} style={{ fontSize: 'clamp(1.2rem, 2vw, 1.8rem)' }}>{v}</b></div></div>
  );
  return (
    <div className="flex flex-col gap-4 stag">
      <div className="grid md:grid-cols-4 gap-3">
        <Big l={t('fin.balance')} v={fullMoney(ut.budget)} cls={ut.budget < 0 ? 'neg' : ''} />
        <Big l={t('fin.payroll')} v={fullMoney(pay)} />
        <Big l={t('fin.sponsorY')} v={fullMoney(ut.sponsor)} />
        <Big l={t('fin.net')} v={fullMoney(ut.sponsor - pay)} cls={ut.sponsor - pay < 0 ? 'neg' : 'pos'} />
      </div>
      <div className="fin-grid">
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('fin.weekly')}</h3></div>
          <div className="gp-b" style={{ overflowX: 'auto' }}><WeekChart /></div>
        </div>
        <div className="flex flex-col gap-4"><BrandPanel /><Sponsors /></div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('fin.log')}</h3></div>
          <div className="gp-b">{S.finance.filter((x) => x.amount).slice(0, 40).map((x, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-line"><span className="grow">{t(x.key, x.params || {})}</span><span className="muted text-xs">{t('season', { y: x.season })}</span><b className={`k-num ${x.amount < 0 ? 'neg' : 'pos'}`}>{x.amount > 0 ? '+' : ''}{money(x.amount)}</b></div>
          ))}{!S.finance.some((x) => x.amount) && <p className="muted">—</p>}</div>
        </div>
        <div className="gp">
          <div className="gp-h"><h3 className="k-title">{t('fin.contracts')}</h3></div>
          <div className="gp-b"><table className="gt"><thead><tr><th>{t('player')}</th><th>{t('role')}</th><th>{t('salary')}</th><th>{t('contract')}</th><th>{t('value')}</th></tr></thead>
            <tbody>{teamPlayers(ut).map((p) => (
              <tr key={p.id} className="click" data-player={p.id} onClick={() => openPlayer(p.id)}>
                <td><div className="nm2"><Face p={p} size="xs" />{p.ign}</div></td><td><RoleTag r={p.role} /></td><td className="n">{money(p.salary)}</td><td className="n">{p.contractUntil}</td><td className="n">{money(p.value)}</td>
              </tr>
            ))}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
