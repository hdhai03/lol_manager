import type { ReactElement } from 'react';
import { S, userTeam } from '../../engine/state';
import { PHASES } from '../../engine/season';
import { t } from '../../i18n';
import { ui } from '../store';
import { Badge, LangSwitch } from '../components';
import { GROUPS, TABS, groupOf, unreadCount, markTasks } from '../helpers';
import { openGroup, openTab, topAction } from '../actions';
import { IcMenu, IcSave } from '../icons';
import { Home } from '../pages/Home';
import { Inbox } from '../pages/Inbox';
import { Roster, Tactics } from '../pages/Squad';
import { Transfers } from '../pages/Transfers';
import { Training, Youth, Ladder } from '../pages/Academy';
import { Schedule } from '../pages/Schedule';
import { Standings } from '../pages/Standings';
import { Power, Records } from '../pages/Rankings';
import { Meta, World, Finance } from '../pages/Office';

const PAGES: Record<string, () => ReactElement> = {
  dashboard: Home, inbox: Inbox, roster: Roster, tactics: Tactics, transfers: Transfers,
  training: Training, youth: Youth, ladder: Ladder,
  schedule: Schedule, standings: Standings, power: Power, records: Records, meta: Meta, world: World, finance: Finance,
};
/** trang tự cuộn (danh sách dài); còn lại vừa đúng một màn hình */
const SCROLLS = new Set(['schedule', 'standings', 'records', 'meta', 'world', 'finance', 'power']);

export function GameShell() {
  const ut = userTeam();
  const grp = groupOf(ui.tab);
  ui.lastSub[grp] = ui.tab;
  if (ui.tab === 'inbox' && (S.inboxSeen || 0) < (S.newsSeq || 0)) { ui.inboxPrev = S.inboxSeen || 0; S.inboxSeen = S.newsSeq || 0; }
  markTasks(ui.tab);
  const unread = unreadCount();
  const phaseIdx = S.phase ? PHASES.indexOf(S.phase) : PHASES.length;
  const Page = PAGES[ui.tab] || Home;
  return (
    <div className="shell game">
      <header className="hud">
        <div className="logo">RM</div>
        <div className="sect"><span className="k-label">{t('season', { y: S.season })} · {t('phase.' + S.phase)}</span><b>{t('nav.' + grp)}</b></div>
        <nav className="nav" aria-label="main">
          {TABS.map((g) => (
            <button key={g} className={`nv ${g === grp ? 'on' : ''}`} data-grp={g} onClick={() => openGroup(g)}>
              {t('nav.' + g)}{g === 'inbox' && unread > 0 && <span className="nb">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </nav>
        <div className="right">
          <div className="ctl">
            <button className="ib" data-act="save" title={`${t('top.save')} (S)`} aria-label={t('top.save')} onClick={() => void topAction('save')}><IcSave /></button>
            <button className="ib" data-act="menu" title={`${t('nav.menu')} (Esc)`} aria-label={t('nav.menu')} onClick={() => void topAction('menu')}><IcMenu /></button>
            <LangSwitch />
          </div>
          <div className="club-w club">
            <Badge id={ut.id} size="md" />
            <div>
              <div className="flex items-center gap-2"><span className="nm">{ut.name}</span></div>
              <div className="segs" title={`${t('season', { y: S.season })} · ${t('phase.' + S.phase)}`}>
                {PHASES.map((p, i) => <i key={p} className={i < phaseIdx ? 'on' : i === phaseIdx ? 'cur' : ''} />)}
              </div>
            </div>
          </div>
        </div>
      </header>
      {GROUPS[grp].length > 1 && (
        <nav className="subnav subtabs">
          {GROUPS[grp].map((x) => <button key={x} className={ui.tab === x ? 'on' : ''} data-tab={x} onClick={() => openTab(x)}>{t('nav.' + x)}</button>)}
          <span className="ml-auto flex items-center gap-1 muted text-xs"><kbd className="kc">Q</kbd><kbd className="kc">E</kbd></span>
        </nav>
      )}
      <main className={`view ${SCROLLS.has(ui.tab) ? 'scroll' : ''}`} key={ui.tab} id="content">
        <Page />
      </main>
    </div>
  );
}
