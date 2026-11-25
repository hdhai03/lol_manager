// Thống kê nâng cao, so sánh 2 tuyển thủ, danh sách phát lại, thành tựu
import { DB, champSplash as champSplashUrl } from '../../engine/data';
import { S } from '../../engine/state';
import { ROLES } from '../../engine/util';
import { ACH, achUnlocked } from '../../engine/ach';
import { t, cname } from '../../i18n';
import { ui, refresh } from '../store';
import { Badge, Face, LeagueBadge, RoleTag } from '../components';
import { openPlayer } from './Squad';
import type { Player, SeasonStats } from '../../engine/types';

type Col = 'g' | 'wr' | 'kda' | 'kp' | 'dpm' | 'cspm' | 'gpm' | 'vspm' | 'mvp' | 'rt';
const COLS: Col[] = ['g', 'wr', 'kda', 'kp', 'dpm', 'cspm', 'gpm', 'vspm', 'mvp', 'rt'];
export function statsOf(s: SeasonStats): Record<Col, number> {
  const g = Math.max(1, s.g), min = Math.max(1, s.min);
  return { g: s.g, wr: s.w / g, kda: (s.k + s.a) / Math.max(1, s.d), kp: s.tk ? (s.k + s.a) / s.tk : 0, dpm: s.dmg / min, cspm: s.cs / min, gpm: s.gold / min, vspm: (s.vs || 0) / min, mvp: s.mvp, rt: (s.rt || 0) / g };
}
const fmt = (c: Col, v: number) => (c === 'wr' || c === 'kp' ? `${Math.round(v * 100)}%` : c === 'g' || c === 'mvp' || c === 'dpm' || c === 'gpm' ? String(Math.round(v)) : v.toFixed(c === 'rt' ? 2 : 1));

export function Spark({ v, w = 120, h = 28 }: { v: number[]; w?: number; h?: number }) {
  if (v.length < 2) return <span className="muted text-xs">—</span>;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - ((x - 2) / 8) * h}`).join(' ');
  const avg = v.reduce((s, x) => s + x, 0) / v.length;
  return <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}><line x1="0" x2={w} y1={h - ((avg - 2) / 8) * h} y2={h - ((avg - 2) / 8) * h} /><polyline points={pts} /></svg>;
}

function Compare({ a, b }: { a: Player; b: Player }) {
  const sa = statsOf(a.season), sb = statsOf(b.season);
  return (
    <div className="gp cmp">
      <div className="gp-h"><h3 className="k-title">{t('stx.compare')}</h3><button className="gb ghost xs" onClick={() => { ui.filters.cmp = []; refresh(); }}>{t('stx.clear')}</button></div>
      <div className="gp-b">
        <div className="cmp-h">{[a, b].map((p, i) => <div key={p.id} className={`cmp-p ${i ? 'r' : ''}`}><Face p={p} size="lg" /><b>{p.ign}</b><span className="muted text-xs">{p.teamId ? S.teams[p.teamId].short : '—'} · OVR {p.ovr}</span><Spark v={p.fh || []} /></div>)}</div>
        {COLS.map((c) => {
          const x = sa[c], y = sb[c], m = Math.max(Math.abs(x), Math.abs(y), 1e-6);
          return (
            <div key={c} className="cmp-r">
              <b className={x > y ? 'up' : ''}>{fmt(c, x)}</b>
              <div className="cmp-bar l"><i style={{ width: `${(x / m) * 100}%` }} /></div>
              <span>{t('stx.' + c)}</span>
              <div className="cmp-bar r"><i style={{ width: `${(y / m) * 100}%` }} /></div>
              <b className={y > x ? 'up' : ''}>{fmt(c, y)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Stats() {
  const f = ui.filters;
  f.sxLg ??= S.teams[S.userTeam].league; f.sxRole ??= 'all'; f.sxSort ??= 'rt'; f.cmp ??= [];
  const min = 3;
  const rows = Object.values(S.players).filter((p) => p.teamId && !p.retired && p.season.g >= min && (f.sxLg === 'all' || S.teams[p.teamId].league === f.sxLg) && (f.sxRole === 'all' || p.role === f.sxRole))
    .map((p) => ({ p, s: statsOf(p.season) })).sort((a, b) => b.s[f.sxSort as Col] - a.s[f.sxSort as Col]).slice(0, 80);
  const cmp = (f.cmp as string[]).map((id) => S.players[id]).filter(Boolean);
  const toggle = (id: string) => { const c = f.cmp as string[]; f.cmp = c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2); refresh(); };
  return (
    <div className="flex flex-col gap-4 stag">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="chips">{['all', ...DB.leagues.map((l) => l.id)].map((lg) => <button key={lg} className={`chp sm ${f.sxLg === lg ? 'on' : ''}`} data-sxlg={lg} onClick={() => { f.sxLg = lg; refresh(); }}>{lg === 'all' ? t('tr.all') : <><LeagueBadge id={lg} size="xs" />{lg}</>}</button>)}</div>
        <div className="chips">{(['all', ...ROLES] as const).map((r) => <button key={r} className={`chp sm ${f.sxRole === r ? 'on' : ''}`} data-sxr={r} onClick={() => { f.sxRole = r; refresh(); }}>{r === 'all' ? t('tr.all') : <RoleTag r={r} />}</button>)}</div>
      </div>
      {cmp.length === 2 && <Compare a={cmp[0]} b={cmp[1]} />}
      <div className="gp">
        <div className="gp-h"><h3 className="k-title">{t('stx.title', { y: S.season })}</h3><span className="gp-r">{t('stx.pick2')}</span></div>
        <div className="gp-b" style={{ overflowX: 'auto' }}>
          <table className="gt stx"><thead><tr><th /><th>{t('player')}</th><th>{t('stx.form')}</th>{COLS.map((c) => <th key={c} className={`click ${f.sxSort === c ? 'on' : ''}`} data-sort={c} onClick={() => { f.sxSort = c; refresh(); }}>{t('stx.' + c)}{f.sxSort === c ? ' ▾' : ''}</th>)}</tr></thead>
            <tbody>{rows.map(({ p, s }) => (
              <tr key={p.id} className={`click ${p.teamId === S.userTeam ? 'me' : ''} ${(f.cmp as string[]).includes(p.id) ? 'sel' : ''}`} onClick={() => openPlayer(p.id)}>
                <td><input type="checkbox" data-cmp={p.id} checked={(f.cmp as string[]).includes(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(p.id)} /></td>
                <td><div className="nm2"><RoleTag r={p.role} /><Badge id={p.teamId!} size="sm" />{p.ign}</div></td>
                <td><Spark v={p.fh || []} w={80} h={22} /></td>
                {COLS.map((c) => <td key={c} className={`n ${f.sxSort === c ? 'text-white' : ''}`}>{fmt(c, s[c])}</td>)}
              </tr>
            ))}</tbody></table>
          {!rows.length && <p className="muted">{t('stx.none', { n: min })}</p>}
        </div>
      </div>
    </div>
  );
}

export function Replays() {
  const list = S.replays || [];
  if (!list.length) return <p className="muted">{t('rp.none')}</p>;
  return (
    <div className="rp-list">{list.map((r) => (
      <button key={r.id} className={`rpl-row ${r.star ? 'star' : ''}`} data-replay={r.id} onClick={() => { ui.replay = r.id; refresh(); }}>
        <span className="rp-t">{r.star ? '★ ' : ''}{r.comp} {r.season} · {t('dr.game', { n: r.game })}</span>
        <span className="rp-m"><Badge id={r.a} size="sm" /><b className={r.winner === r.a ? 'up' : ''}>{S.teams[r.a]?.short}</b><span className="k-num">{r.k[0]} - {r.k[1]}</span><b className={r.winner === r.b ? 'up' : ''}>{S.teams[r.b]?.short}</b><Badge id={r.b} size="sm" /></span>
        <span className="muted text-sm">{Math.floor(r.durS / 60)}:{String(r.durS % 60).padStart(2, '0')} · ▶ {t('rp.watch')}</span>
      </button>
    ))}</div>
  );
}

export function Achievements() {
  const have = achUnlocked();
  const n = ACH.filter((a) => have[a.id]).length;
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('ach.title')}</h3><span className="gp-r">{n}/{ACH.length}</span></div>
      <div className="gp-b"><div className="ach-g">{ACH.map((a) => (
        <div key={a.id} className={`ach ${have[a.id] ? 'on' : ''} tr-${a.tier}`} title={t('ach.' + a.id + 'D')}>
          <span className="ach-i">{have[a.id] ? a.icon : '🔒'}</span>
          <div className="min-w-0"><b>{t('ach.' + a.id)}</b><small>{have[a.id] ? have[a.id] : t('ach.' + a.id + 'D')}</small></div>
        </div>
      ))}</div></div>
    </div>
  );
}

// ---------- trang phục vô địch & All-Star ----------
export function SkinsView() {
  const list = S.skins || [];
  if (!list.length) return <p className="muted">{t('sk.none')}</p>;
  return (
    <div className="sk-list">{list.map((s) => (
      <div key={s.season + s.team} className={`sk-set ${s.team === S.userTeam ? 'me' : ''}`}>
        <div className="sk-h"><Badge id={s.team} size="md" /><div><b>{t('sk.name', { team: S.teams[s.team]?.short ?? s.team, y: s.season })}</b><small className="muted">{s.title}</small></div></div>
        <div className="sk-g">{s.picks.map((x) => (
          <div key={x.role} className="sk-c"><div className="sk-art" style={{ backgroundImage: `url('${champSplashUrl(x.champ)}')` }} /><div className="sk-cap"><b>{x.ign}</b><small>{cname(x.champ)}</small></div></div>
        ))}</div>
      </div>
    ))}</div>
  );
}
export function AllStarView() {
  const as = S.allstar;
  if (!as) return <p className="muted">{t('as.none')}</p>;
  const P = (id?: string) => (id ? S.players[id] : undefined);
  return (
    <div className="as">
      <div className="as-top">
        <div className="as-k"><small>{t('as.1v1')}</small><b>{P(as.oneVone)?.ign}</b><span className="muted text-xs">{t('as.final', { a: P(as.oneVoneFinal[0])?.ign ?? '', b: P(as.oneVoneFinal[1])?.ign ?? '' })}</span></div>
        <div className="as-k"><small>{t('as.aram')}</small><b>{t('as.' + as.aram)}</b></div>
      </div>
      <div className="as-rows">{Object.entries(as.roster).map(([lg, r]) => (
        <div key={lg} className="as-row"><span className="as-lg"><LeagueBadge id={lg} size="sm" />{lg}</span>
          {ROLES.map((role) => { const p = P(r[role]); return <span key={role} className={`as-p ${p?.teamId === S.userTeam ? 'me' : ''}`}>{p && <><Face p={p} size="sm" /><span><b>{p.ign}</b><small className="muted">{p.teamId ? S.teams[p.teamId].short : ''}</small></span></>}</span>; })}
        </div>
      ))}</div>
    </div>
  );
}
