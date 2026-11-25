import type { ReactNode } from 'react';
import { openTeam } from './TeamProfile';
import { DB, champSplash } from '../../engine/data';
import { S, userTeam, teamOvr, lineupPlayers, teamSalary } from '../../engine/state';
import { standings, nextUserMatch, acceptOffer } from '../../engine/season';
import { gprTable } from '../../engine/gpr';
import { clamp, money } from '../../engine/util';
import { t, getLang } from '../../i18n';
import { ui, refresh, toast, openModal } from '../store';
import { Badge, LeagueBadge, RoleIcon, Stars, faceSrc } from '../components';
import {
  compTitle, currentSplitComp, fmtD, fullMoney, hash, kfmt, newsText, primaryAction, recordOf, relDay, taskLabel, todayTasks, TASK_TAB,
} from '../helpers';
import { openTab, topAction } from '../actions';
import { openPlayer, renewModal } from './Squad';
import {
  IcChart, IcComment, IcContract, IcHeart, IcInvite, IcLineup, IcMail, IcMoney, IcPlay, IcRest, IcScout, IcSwords, IcTactic, IcTrain, IcTrophy, IcUsers, IcVerified,
} from '../icons';
import type { DailyTask, NewsItem } from '../../engine/types';

const TASK_ICON: Record<string, (p: object) => ReactNode> = {
  match: IcPlay, tactics: IcTactic, training: IcTrain, rest: IcRest, scout: IcScout, finance: IcMoney, squad: IcUsers,
  offers: IcMail, renew: IcContract, lineup: IcLineup, gpr: IcChart, standings: IcChart,
};

// ---------- Khu "Central": ngày, sự kiện kế tiếp, nút tiến, việc trong ngày ----------
function Central() {
  const ut = userTeam();
  const nm = nextUserMatch();
  const pa = primaryAction();
  const daysTo = nm ? nm.day - S.day : null;
  let small = '', title: ReactNode, Icon = IcInvite;
  if (S.phase === 'offseason') { title = t('dash.offseasonTitle', { y: S.season }); small = t('phase.offseason'); Icon = IcInvite; }
  else if (nm) {
    const opp = nm.a === ut.id ? nm.b : nm.a;
    const comp = S.comps[nm.comp];
    small = compTitle(comp);
    title = <>{ut.short} <span className="muted">vs</span> {S.teams[opp].short}</>;
    Icon = comp.league === 'INTL' ? IcTrophy : IcSwords;
  } else title = t('dash.noMatchTitle');
  const tasks = todayTasks();
  const run = (x: DailyTask) => {
    if (x.kind === 'match') void topAction('match');
    else if (x.kind === 'offers') offersModal();
    else if (x.kind === 'renew') openTab('roster');
    else if (TASK_TAB[x.kind]) openTab(TASK_TAB[x.kind]);
  };
  return (
    <section className="ctr">
      <div className="date k-disp">{fmtD(relDay(S.day), { weekday: 'long', day: '2-digit', month: 'short' })}</div>
      <div className="next">{S.phase === 'offseason' ? t('phase.offseason') : nm ? (daysTo! <= 0 ? t('dash.today') : t('dash.nextIn', { n: daysTo })) : t('dash.noMatch')}</div>
      <div className="event">
        <Icon />
        <div className="tt k-disp">{small && <small>{small}</small>}{title}</div>
      </div>
      <div>
        <button className={`pill ${pa.act === 'match' ? 'hot' : ''}`} data-act={pa.act} onClick={() => void topAction(pa.act)}>
          {pa.label} <kbd>Enter</kbd>
        </button>
      </div>
      <div className="tasks-h k-label"><span>{t('task.title')}</span>{tasks.length > 0 && <span>{tasks.length}</span>}</div>
      <div className="tasks">
        {tasks.length === 0 && <div className="none">{t('task.none')}</div>}
        {tasks.map((x, i) => {
          const I = TASK_ICON[x.kind] || IcMail;
          return (
            <button key={x.id} className={`task ${i === 0 ? 'sel' : ''}`} data-kind={x.kind} {...(x.kind === 'match' ? { 'data-act': 'match' } : {})} onClick={() => run(x)}>
              <I /><span>{taskLabel(x)}</span><span className="go">›</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function offersModal(): void {
  openModal((close) => {
    const ut = userTeam();
    const offers = (S.offers || []).filter((o) => S.players[o.pid]?.teamId === ut.id);
    if (!offers.length) { setTimeout(close); return null; }
    return (
      <>
        <h3>{t('dash.offers')}</h3>
        <div className="flex flex-col gap-2">{offers.map((o) => (
          <div key={o.id} className="alert">
            <Badge id={o.from} size="sm" />
            <span className="grow">{t('dash.offerLine', { team: S.teams[o.from].name, player: S.players[o.pid].ign, fee: money(o.amount) })}</span>
            <button className="gb primary xs" onClick={() => { acceptOffer(o.id); toast(t('tr.done'), 'ok'); refresh(); }}>{t('dash.accept')}</button>
            <button className="gb ghost xs" onClick={() => { S.offers = (S.offers || []).filter((x) => x.id !== o.id); refresh(); }}>{t('dash.decline')}</button>
          </div>
        ))}</div>
      </>
    );
  }, { wide: true });
}

// ---------- Thẻ trận tiếp theo + dải lịch 7 ngày ----------
function WeekStrip() {
  const mine = Object.values(S.comps).filter((c) => c.id.startsWith(`${S.season}-`)).flatMap((c) => c.matches).filter((m) => m.a === S.userTeam || m.b === S.userTeam);
  const byDay = new Map(mine.map((m) => [m.day, m]));
  const days = Array.from({ length: 7 }, (_, i) => S.day - 2 + i);
  return (
    <div className="week">{days.map((d) => {
      const m = byDay.get(d);
      const opp = m ? (m.a === S.userTeam ? m.b : m.a) : null;
      return (
        <div key={d} className={`d ${d === S.day ? 'today' : ''}`} title={fmtD(relDay(d), { day: '2-digit', month: '2-digit' })}>
          <span>{fmtD(relDay(d), { weekday: 'short' })}</span>
          {opp ? <Badge id={opp} size="xs" /> : <b>{relDay(d).getUTCDate()}</b>}
          {m && <i className={m.done ? (m.winner === S.userTeam ? 'W' : 'L') : ''} />}
        </div>
      );
    })}</div>
  );
}

function NextMatch() {
  const ut = userTeam();
  const nm = nextUserMatch();
  const pa = primaryAction();
  const rec = (id: string) => { const r = recordOf(id); return r ? t('dash.record', r) : S.teams[id].league; };
  let body: ReactNode, right: ReactNode = null;
  if (S.phase === 'offseason') {
    body = <div className="flex-1 grid place-items-center text-center muted px-4">{t('dash.offseasonBody')}</div>;
  } else if (nm) {
    const comp = S.comps[nm.comp];
    const opp = nm.a === ut.id ? nm.b : nm.a;
    right = <><LeagueBadge id={comp.league === 'INTL' ? (comp.phase === 'msi' ? 'MSI' : 'WORLDS') : comp.league} size="xs" /><span>{comp.name} {S.season}</span><span className="muted">· Bo{nm.bo}</span></>;
    body = (
      <div className="nm">
        <div className="tm"><Badge id={ut.id} size="xl" /><b>{ut.name}</b><span>{rec(ut.id)}</span></div>
        <div className="vs"><b>VS</b><div className="ov"><span>OVR <em>{teamOvr(ut)}</em></span><span><em>{teamOvr(S.teams[opp])}</em> OVR</span></div></div>
        <div className="tm"><Badge id={opp} size="xl" /><b>{S.teams[opp].name}</b><span>{rec(opp)}</span></div>
      </div>
    );
  } else body = <div className="flex-1 grid place-items-center text-center muted px-4">{t('dash.eliminated')}</div>;
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('dash.nextMatch')}</h3><div className="gp-r">{right}</div></div>
      <div className="gp-b">
        {body}
        <WeekStrip />
        <div className="nm-acts">
          <button className="gb" data-act="training" onClick={() => openTab('training')}>{t('btn.training')}</button>
          {S.phase === 'offseason'
            ? <button className="gb" onClick={() => openTab('transfers')}>{t('nav.transfers')}</button>
            : <button className="gb" data-act="tactics" onClick={() => openTab('tactics')}>{t('nav.tactics')}</button>}
          {pa.act === 'match' ? <button className="gb primary pulse" data-act="match" onClick={() => void topAction('match')}>{t('btn.play')}</button>
            : pa.act === 'newseason' ? <button className="gb primary" data-act="newseason" onClick={() => void topAction('newseason')}>{t('top.newSeason')}</button>
              : <button className="gb primary" data-act="simnext" title="F" onClick={() => void topAction('simnext')}>{t('btn.simNext')}</button>}
        </div>
      </div>
    </div>
  );
}

// ---------- Đội của bạn: 5 chân dung đứng ----------
function YourTeam() {
  const ut = userTeam();
  const ovr = teamOvr(ut);
  const gpr = gprTable().find((r) => r.team === ut.id)?.rank;
  return (
    <div className="gp">
      <div className="gp-h"><h3 className="k-title">{t('dash.yourTeam')}</h3><div className="gp-r"><Stars ovr={ovr} /></div></div>
      <div className="gp-b">
        <div className="yt-meta">
          <Badge id={ut.id} size="sm" /><b>{ut.short}</b>
          <span>OVR <b>{ovr}</b></span><span title={t('gpr.title')}>GPR <b>#{gpr ?? '-'}</b></span>
          <span className="money" title={t('dash.money')}>{fullMoney(ut.budget)}</span>
        </div>
        <div className="yt">{lineupPlayers(ut).map(({ role, p }) => {
          const fs = faceSrc(p);
          const cond = Math.round(p?.cond ?? 100);
          return (
            <div key={role} className="ytp" data-player={p?.id} onClick={() => p && openPlayer(p.id)}>
              {fs ? <img src={fs} alt="" /> : <span className="ini">{p ? p.ign.slice(0, 2).toUpperCase() : '—'}</span>}
              {p && <span className="o">{p.ovr}</span>}
              {p && <span className={`cnd ${cond < 60 ? 'low' : ''}`}><i style={{ width: `${cond}%` }} /></span>}
              <div className="cap"><small className={`role-${role}`} title={t('role.' + role)}><RoleIcon r={role} /></small><b>{p ? p.ign : '—'}</b></div>
            </div>
          );
        })}</div>
        <div className="flex justify-between k-label mt-2" style={{ fontSize: '.72rem' }}>
          <span>{t('fin.payroll')} {money(teamSalary(ut))}</span><span>{t('fin.sponsorY')} {money(ut.sponsor)}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- Thẻ mạng xã hội lớn (lật bằng mũi tên/chấm) ----------
function SocialCard({ n }: { n: NewsItem }) {
  const p = (n.params || {}) as Record<string, unknown>;
  const text = newsText(n);
  const tm = Object.values(S.teams).find((x) => x.name === p.team || x.name === p.to) || (n.key === 'news.welcome' ? userTeam() : null);
  const pl = typeof p.player === 'string' ? Object.values(S.players).find((x) => x.ign === p.player) : undefined;
  const meta = DB.champList.filter((c) => c.tier === 'S');
  const h = hash(text);
  const art = champSplash(pl?.pool[0]?.c || meta[h % meta.length].id);
  const avTeam = tm || (pl?.teamId ? S.teams[pl.teamId] : null) || userTeam();
  const fs = faceSrc(pl);
  const author = /transfer|signedFA|released|contractExpired|offer/.test(n.key) ? t('feed.transfers') : n.key === 'news.welcome' ? t('feed.board') : t('feed.esports');
  const lg = /msi/i.test(n.key) ? 'MSI' : /worlds/i.test(n.key) ? 'WORLDS' : userTeam().league;
  return (
    <article className="social">
      <div className="img" style={{ backgroundImage: `url('${art}')` }} />
      <div className="shade" />
      {n.day >= S.day - 1 && <span className="flag">{t('menu.new2')}</span>}
      <div className="head"><Badge id={avTeam.id} size="md" /><div><b>{author}<IcVerified /></b><small>{n.day >= S.day ? t('feed.today') : fmtD(relDay(n.day), { day: 'numeric', month: 'long' })}</small></div></div>
      <div className="vis">{fs ? <img className="face" src={fs} alt="" /> : tm ? <Badge id={tm.id} size="hero" /> : <LeagueBadge id={lg} size="xl" />}</div>
      <div className="cap">
        <p>{text}</p>
        <div className="eng">
          <span><IcHeart />{kfmt((h % 400 + 60) * 12)}</span><span><IcComment />{kfmt(h % 180 + 20)}</span>
          <span className="grow" /><button className="gb ghost xs" onClick={() => openTab('inbox')}>{t('dash.showMore')}</button>
        </div>
      </div>
    </article>
  );
}
function FanPost({ p }: { p: NonNullable<typeof S.social>[number] }) {
  const pl = p.pid ? S.players[p.pid] : undefined;
  const fs = faceSrc(pl);
  const art = champSplash(pl?.pool[0]?.c || DB.champList.filter((c) => c.tier === 'S')[hash(p.id) % Math.max(1, DB.champList.filter((c) => c.tier === 'S').length)].id);
  return (
    <article className={`social fan m-${p.mood}`}>
      <div className="img" style={{ backgroundImage: `url('${art}')` }} />
      <div className="shade" />
      {p.day >= S.day - 1 && <span className="flag">{t('menu.new2')}</span>}
      <div className="head"><span className="fan-av">{p.handle.slice(1, 3).toUpperCase()}</span><div><b>{p.handle}</b><small>{p.day >= S.day ? t('feed.today') : fmtD(relDay(p.day), { day: 'numeric', month: 'long' })}</small></div></div>
      <div className="vis">{fs ? <img className="face" src={fs} alt="" /> : p.team ? <Badge id={p.team} size="hero" /> : <LeagueBadge id={userTeam().league} size="xl" />}</div>
      <div className="cap">
        <p>{t(p.key, p.params)}</p>
        <div className="eng"><span><IcHeart />{kfmt(p.likes)}</span><span><IcComment />{kfmt(Math.round(p.likes / 9))}</span><span className="grow" /></div>
      </div>
    </article>
  );
}
function Social() {
  type It = { k: 'n'; n: NewsItem; d: number; id: string } | { k: 'p'; p: NonNullable<typeof S.social>[number]; d: number; id: string };
  const list: It[] = [...(S.social || []).slice(0, 5).map((p) => ({ k: 'p' as const, p, d: p.day, id: p.id })), ...S.news.slice(0, 5).map((n) => ({ k: 'n' as const, n, d: n.day, id: 'n' + n.id }))].sort((a, b) => b.d - a.d).slice(0, 8);
  ui.newsIdx = clamp(ui.newsIdx || 0, 0, Math.max(list.length - 1, 0));
  const it = list[ui.newsIdx];
  const step = (d: number) => { ui.newsIdx = (ui.newsIdx + d + list.length) % list.length; refresh(); };
  return (
    <div className="social-w">
      {it ? (it.k === 'n' ? <SocialCard key={it.id} n={it.n} /> : <FanPost key={it.id} p={it.p} />) : <div className="social" />}
      <div className="dots">
        <button className="arrowb" data-news="-1" aria-label="prev" onClick={() => step(-1)}>‹</button>
        {list.map((x, i) => <i key={x.id} className={i === ui.newsIdx ? 'on' : ''} onClick={() => { ui.newsIdx = i; refresh(); }} />)}
        <button className="arrowb" data-news="1" aria-label="next" onClick={() => step(1)}>›</button>
      </div>
    </div>
  );
}

// ---------- BXH thu nhỏ có đổi giải ----------
function MiniStandings() {
  const ut = userTeam();
  const lgs: string[] = DB.leagues.map((l) => l.id);
  const hl = ui.homeLg && lgs.includes(ui.homeLg) ? ui.homeLg : ut.league;
  const comp = currentSplitComp(hl);
  const st = standings(comp);
  const step = (d: number) => { ui.homeLg = lgs[(lgs.indexOf(hl) + d + lgs.length) % lgs.length]; refresh(); };
  return (
    <div className="gp">
      <div className="gp-h">
        <h3 className="k-title flex items-center gap-2"><LeagueBadge id={hl} size="xs" />{t('st.title')}</h3>
        <div className="switch"><button className="arrowb" data-hl="-1" aria-label="prev" onClick={() => step(-1)}>‹</button>{hl}<button className="arrowb" data-hl="1" aria-label="next" onClick={() => step(1)}>›</button></div>
      </div>
      <div className="gp-b scroll" style={{ paddingTop: '.4rem' }}>
        {comp && <div className="k-label mb-1" style={{ fontSize: '.7rem' }}>{compTitle(comp)}</div>}
        {st.length ? (
          <table className="mst"><thead><tr><th>#</th><th>{t('team')}</th><th className="n">{getLang() === 'vi' ? 'T' : 'W'}</th><th className="n">{getLang() === 'vi' ? 'B' : 'L'}</th></tr></thead>
            <tbody>{st.map((r, i) => (
              <tr key={r.team} className={`click ${r.team === ut.id ? 'me' : ''} ${i < 4 ? 'q' : ''}`} data-team={r.team} onClick={() => openTeam(r.team)}>
                <td><span className="rk">{i + 1}</span></td><td><div className="tn"><Badge id={r.team} size="xs" />{S.teams[r.team].short}</div></td><td className="n">{r.w}</td><td className="n">{r.l}</td>
              </tr>
            ))}</tbody></table>
        ) : <p className="muted">{t('st.notStarted')}</p>}
        <button className="gb ghost xs mt-2 self-start" onClick={() => openTab('standings')}>{t('dash.showMore')} ›</button>
      </div>
    </div>
  );
}

export function Home() {
  void renewModal;
  return (
    <div className="home stag">
      <Central />
      <NextMatch />
      <Social />
      <YourTeam />
      <MiniStandings />
    </div>
  );
}
