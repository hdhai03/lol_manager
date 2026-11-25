// Màn tổng kết ván (kiểu bảng kết quả phát sóng): chỉ số trận, sát thương lên tướng trước/sau 14 phút, chênh lệch vàng.
import { useState } from 'react';
import { champSplash } from '../../engine/data';
import { S } from '../../engine/state';
import { recordGame } from '../../engine/sim';
import { t } from '../../i18n';
import { Badge, Champ, Face, RoleTag, RuneMini } from '../components';
import type { ReactNode } from 'react';
import type { GameResult, Match, Side } from '../../engine/types';

const kf = (n: number) => (n / 1000).toFixed(1) + 'K';

function GoldChart({ gd }: { gd: number[] }) {
  const amp = Math.max(1000, ...gd.map((v) => Math.abs(v)));
  const W = 600, H = 200;
  const X = (m: number) => 30 + (m / Math.max(gd.length - 1, 1)) * (W - 40);
  const Y = (v: number) => H / 2 - (v / amp) * (H / 2 - 14);
  const line = gd.map((v, m) => `${X(m).toFixed(1)},${Y(v).toFixed(1)}`).join(' L');
  const area = `M${X(0)},${H / 2} L${line} L${X(gd.length - 1)},${H / 2} Z`;
  const ticks: number[] = [];
  for (let m = 5; m < gd.length; m += 5) ticks.push(m);
  return (
    <svg className="pg-chart" viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none">
      <defs><clipPath id="pgUp"><rect x="0" y="0" width={W} height={H / 2} /></clipPath><clipPath id="pgDn"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath></defs>
      {ticks.map((m) => <g key={m}><line x1={X(m)} y1="6" x2={X(m)} y2={H - 6} className="gl" /><text x={X(m)} y={H + 14} className="tx">{m}</text></g>)}
      <line x1="30" y1={H / 2} x2={W - 10} y2={H / 2} className="zero" />
      <path d={area} className="up" clipPath="url(#pgUp)" /><path d={area} className="dn" clipPath="url(#pgDn)" />
      <text x="2" y="16" className="tx l">+{kf(amp)}</text><text x="2" y={H / 2 + 4} className="tx l">0</text><text x="2" y={H - 4} className="tx l">-{kf(amp)}</text>
    </svg>
  );
}

function Scoreboard({ g }: { g: GameResult }) {
  const table = (s: Side) => (
    <table className="tbl sb gt"><thead><tr><th /><th><span className="flex items-center gap-2"><Badge id={s === 'B' ? g.blue : g.red} size="sm" />{S.teams[s === 'B' ? g.blue : g.red].short}</span></th><th>KDA</th><th>CS</th><th>{t('pg.gold')}</th><th>DMG</th></tr></thead>
      <tbody>{g.players.filter((x) => x.side === s).map((x) => {
        const p = x.pid ? S.players[x.pid] : undefined;
        return (
          <tr key={x.pid ?? x.role} className={g.mvp === x.pid ? 'mvp' : ''}>
            <td><span className="flex items-center gap-1"><Champ id={x.champ} size={28} /><RuneMini r={g.runes?.[x.side + x.role]} size={18} /></span></td><td><span className="flex items-center gap-2"><Face p={p} size="xs" /><RoleTag r={x.role} /><b>{p ? p.ign : '?'}</b></span></td>
            <td className="n">{x.k}/{x.d}/{x.a}</td><td className="n">{x.cs}</td><td className="n">{(x.gold / 1000).toFixed(1)}k</td><td className="n">{(x.dmg / 1000).toFixed(1)}k</td>
          </tr>
        );
      })}</tbody></table>
  );
  return <div className="pg-panel scroll-x"><h3>{t('m.scoreboard')}</h3>{table('B')}{table('R')}</div>;
}

export function PostGame({ m, g, onNext, onFinish }: { m: Match; g: GameResult; onNext: (a: 'manual' | 'auto' | 'quick') => void; onFinish: () => void }) {
  useState(() => { if (!g.recorded) { g.recorded = true; recordGame(m, g, true); } return 0; });
  const [sb, setSb] = useState(false);
  const over = m.done;
  const side = (s: Side) => (s === 'B' ? g.blue : g.red);
  const sum = (s: Side, k: 'k' | 'd' | 'a' | 'gold') => g.players.filter((x) => x.side === s).reduce((a, x) => a + x[k], 0);
  const ob = g.obj || { B: {}, R: {} };
  const winsOf = (tid: string) => (tid === m.a ? m.winsA : m.winsB);
  const cnt = (n?: number) => (n ? <b className="pg-n">{n}</b> : <span className="pg-dash" />);
  const drakes = (s: Side) => (g.drakes[s].length ? <span className="dk">{g.drakes[s].map((d, i) => <i key={i} className={`dr-${d}`} title={t('drake.' + d)} />)}</span> : <span className="pg-dash" />);
  const bans = (s: Side) => <span className="pg-bans">{(g.bans[s] || []).map((c) => <Champ key={c} id={c} size={30} />)}</span>;
  const Row = ({ label, l, r, dimL, dimR }: { label: string; l: ReactNode; r: ReactNode; dimL?: boolean; dimR?: boolean }) => (
    <div className="pg-row"><span className={dimL ? 'dim' : ''}>{l}</span><b>{label}</b><span className={dimR ? 'dim' : ''}>{r}</span></div>
  );
  const kda = (s: Side) => `${sum(s, 'k')}/${sum(s, 'd')}/${sum(s, 'a')}`;
  const gB = sum('B', 'gold'), gR = sum('R', 'gold');
  const maxD = Math.max(...g.players.map((x) => x.dmg), 1);
  const DmgCol = ({ s }: { s: Side }) => <div>{g.players.filter((x) => x.side === s).map((x) => {
    const p = x.pid ? S.players[x.pid] : undefined;
    return (
      <div key={x.pid ?? x.role + s} className={`pg-d ${s}`}><Champ id={x.champ} size={46} />
        <div className="pg-dm"><span>{p ? p.ign : '?'}{g.mvp === x.pid && <> <em className="tagx">MVP</em></>}</span><b>{kf(x.dmg)}</b>
          <div className="pg-bar"><i className="late" style={{ width: `${(x.dmg / maxD) * 100}%` }} /><i className="early" style={{ width: `${((x.dmgEarly ?? 0) / maxD) * 100}%` }} /></div></div></div>
    );
  })}</div>;
  const mvpC = g.players.find((x) => x.pid === g.mvp)?.champ || g.picks[g.winner].Mid!;
  const Head = ({ s }: { s: Side }) => (
    <div className={`pg-team ${s}`}><Badge id={side(s)} size="lg" /><b>{S.teams[side(s)].short}</b><span className="pg-sc">{winsOf(side(s))}</span><span className="pg-res">{g.winner === s ? t('pg.victory') : t('pg.defeat')}</span></div>
  );
  const mm = `${String(Math.floor(g.durS / 60)).padStart(2, '0')}:${String(g.durS % 60).padStart(2, '0')}`;
  return (
    <div className="pg">
      <div className="pg-bg" style={{ backgroundImage: `url('${champSplash(mvpC)}')` }} />
      <div className="pg-head"><Head s="B" /><div className="pg-time"><small>{t('pg.time')}</small><b>{mm}</b></div><Head s="R" /></div>
      <div className="pg-grid">
        <div className="pg-left">
          <div className="pg-panel"><h3>{t('pg.stats')}</h3>
            <Row label="KDA" l={kda('B')} r={kda('R')} dimL={g.winner !== 'B'} dimR={g.winner !== 'R'} />
            <Row label={t('pg.gold')} l={kf(gB)} r={kf(gR)} dimL={gB < gR} dimR={gR < gB} />
            <Row label={t('pg.towers')} l={g.towers.B} r={g.towers.R} />
            <Row label={t('pg.inhibs')} l={cnt(ob.B.inhibs)} r={cnt(ob.R.inhibs)} />
            <Row label={t('pg.grubs')} l={cnt(ob.B.grubs)} r={cnt(ob.R.grubs)} />
            <Row label={t('pg.heralds')} l={cnt(ob.B.heralds)} r={cnt(ob.R.heralds)} />
            <Row label={t('pg.dragons')} l={drakes('B')} r={drakes('R')} />
            <Row label={t('pg.elders')} l={cnt(ob.B.elders)} r={cnt(ob.R.elders)} />
            <Row label={t('pg.barons')} l={cnt(ob.B.barons)} r={cnt(ob.R.barons)} />
            <Row label={t('pg.bans')} l={bans('B')} r={bans('R')} />
          </div>
          <div className="pg-actions">
            {over ? <button className="pg-cont" data-fin onClick={onFinish}>{t('pg.continue')}</button> : (
              <>
                <button className="pg-cont" data-a="manual" onClick={() => onNext('manual')}>{t('m.manualDraft')}</button>
                <div className="pg-sub"><button className="gb" data-a="auto" onClick={() => onNext('auto')}>{t('m.autoDraft')}</button><button className="gb ghost" data-a="quick" onClick={() => onNext('quick')}>{t('m.quickSim')}</button></div>
              </>
            )}
            <button className="gb ghost sm" data-sb onClick={() => setSb((x) => !x)}>{t('m.scoreboard')}</button>
          </div>
        </div>
        <div className="pg-right">
          <div className="pg-panel"><h3>{t('pg.damage')}</h3><div className="pg-dmg"><DmgCol s="B" /><DmgCol s="R" /></div>
            <div className="pg-legend"><span><i className="late" />{t('pg.after14')}</span><span><i className="early" />{t('pg.until14')}</span></div></div>
          <div className="pg-panel"><h3>{t('pg.goldDiff')}</h3><GoldChart gd={g.gold} /></div>
        </div>
      </div>
      {sb && <div className="pg-sbwrap"><Scoreboard g={g} /></div>}
    </div>
  );
}
