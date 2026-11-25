import { S, userTeam, teamPlayers } from '../../engine/state';
import { nextUserMatch } from '../../engine/season';
import { SERVER_OF, ladder } from '../../engine/academy';
import { t } from '../../i18n';
import { ui, refresh } from '../store';
import { compTitle, newsText } from '../helpers';
import { openTab } from '../actions';
import { EV_CHOICES, resolveEvent, pendingEvents, type GEvent } from '../../engine/life';
import { Face } from '../components';
import { toast } from '../store';
import { fullMoney } from '../helpers';

function EventCard({ e }: { e: GEvent }) {
  const a = e.pid ? S.players[e.pid] : null, b = e.pid2 ? S.players[e.pid2] : null;
  const prm = { player: a?.ign || '', player2: b?.ign || '', money: fullMoney(e.amount || 0) };
  return (
    <div className={`ev-card k-${e.kind}`} data-ev={e.id}>
      <div className="ev-faces">{a && <Face p={a} size="md" />}{b && <Face p={b} size="md" />}</div>
      <div className="ev-body">
        <small className="k-label">{t('ev.kind')} · {S.day - e.day <= 0 ? t('feed.today') : t('feed.daysAgo', { n: S.day - e.day })}</small>
        <b>{t('ev.' + e.kind + '.t', prm)}</b>
        <p>{t('ev.' + e.kind + '.d', prm)}</p>
        <div className="ev-ch">{EV_CHOICES[e.kind].map((c) => (
          <button key={c} className="gb sm" data-evc={c} onClick={() => { const out = resolveEvent(e.id, c); if (out) toast(t('ev.out.' + out, prm), 'ok'); refresh(); }}>
            <b>{t('ev.' + e.kind + '.' + c, prm)}</b><small>{t('ev.' + e.kind + '.' + c + 'D', prm)}</small>
          </button>
        ))}</div>
      </div>
    </div>
  );
}

const NEWS_CAT = (k: string): string => (/userWin|userLoss|splitStart|kickoff|fstStart|springStart|summerStart|msiStart|worldsStart/.test(k) ? 'match'
  : /offer|transfer|signedFA|contract|release|sold|bought/.test(k) ? 'transfer'
    : /academy|promotedYouth/.test(k) ? 'academy'
      : /qualified|Champ|awards|promoted|promoFail/.test(k) ? 'event' : 'general');
const CATS = ['all', 'player', 'match', 'transfer', 'event', 'academy', 'general'];

export function Inbox() {
  const f = ui.filters;
  f.inCat ??= 'all';
  const ut = userTeam();
  const live: { cat: string; text: string; tab: string }[] = [];
  for (const p of teamPlayers(ut)) {
    if ((p.cond ?? 100) < 60) live.push({ cat: 'player', text: t('in.tired', { player: p.ign, n: Math.round(p.cond ?? 0) }), tab: 'roster' });
    if ((p.morale ?? 70) < 45) live.push({ cat: 'player', text: t('in.morale', { player: p.ign }), tab: 'roster' });
    if (p.contractUntil <= S.season && !(S.renewed || []).includes(p.id)) live.push({ cat: 'player', text: t('in.contract', { player: p.ign }), tab: 'roster' });
  }
  const nm = nextUserMatch();
  if (nm) {
    const opp = nm.a === ut.id ? nm.b : nm.a;
    const d = nm.day - S.day;
    const comp = compTitle(S.comps[nm.comp]);
    live.push({ cat: 'match', text: d <= 0 ? t('in.matchToday', { opp: S.teams[opp].name, comp }) : t('in.matchIn', { n: d, opp: S.teams[opp].name, comp }), tab: 'schedule' });
  }
  const mine = new Set(ut.roster);
  const sv = SERVER_OF[ut.league];
  if (sv) ladder(sv).slice(0, 10).forEach((a, i) => { if (a.pid && mine.has(a.pid)) live.push({ cat: 'player', text: t('in.soloq', { player: S.players[a.pid].ign, rank: i + 1, server: sv }), tab: 'ladder' }); });
  const show = (c: string) => f.inCat === 'all' || f.inCat === c;
  const items = S.news.map((n) => ({ n, cat: NEWS_CAT(n.key) })).filter((x) => show(x.cat));
  const prev = ui.inboxPrev ?? 0;
  const lv = live.filter((x) => show(x.cat));
  return (
    <div className="inbox gp fill stag">
      <div className="gp-h">
        <div className="chips">{CATS.map((k) => <button key={k} className={`chp sm ${f.inCat === k ? 'on' : ''}`} data-incat={k} onClick={() => { f.inCat = k; refresh(); }}>{t('in.cat.' + k)}</button>)}</div>
        <span className="gp-r">{items.length + lv.length}</span>
      </div>
      <div className="gp-b scroll in-list" style={{ padding: '0 1.1rem 1rem' }}>
        {pendingEvents().map((e) => <EventCard key={e.id} e={e} />)}
        {lv.map((x, i) => (
          <button key={'l' + i} className="in-row live task" style={{ fontSize: '.95rem' }} data-tab-go={x.tab} onClick={() => openTab(x.tab)}>
            <span className="tagx">{t('in.cat.' + x.cat)}</span><span className="grow">{x.text}</span><span className="k-label" style={{ fontSize: '.72rem' }}>{t('in.now')}</span>
          </button>
        ))}
        {items.map(({ n, cat }) => (
          <div key={n.id} className={`in-row flex items-center gap-3 py-3 border-b border-line ${(n.id || 0) > prev ? 'unread' : ''}`}>
            <span className="k-label" style={{ width: '6.5rem', flex: 'none', fontSize: '.72rem', color: (n.id || 0) > prev ? 'var(--new)' : undefined }}>{t('in.cat.' + cat)}</span>
            <span className="grow" style={{ fontWeight: (n.id || 0) > prev ? 700 : 400 }}>{newsText(n)}</span>
            <span className="muted text-sm whitespace-nowrap">{n.season !== S.season ? n.season : S.day - n.day <= 0 ? t('feed.today') : t('feed.daysAgo', { n: S.day - n.day })}</span>
          </div>
        ))}
        {!lv.length && !items.length && <p className="muted">{t('in.empty')}</p>}
      </div>
    </div>
  );
}
