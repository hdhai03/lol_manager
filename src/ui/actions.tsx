// Hành động cấp game: lưu, thoát, qua ngày, giả lập, vào trận, mùa mới, phím tắt.
import { S, setState, saveGame, exportSave, userTeam, addNews, teamOvr } from '../engine/state';
import { PHASES, startPhase, userMatchToday, leagueTeams, setAutoSave } from '../engine/season';
import { ensureGpr } from '../engine/gpr';
import { newGame } from '../engine/state';
import { t } from '../i18n';
import { ui, go, refresh, openModal, closeModal, toast } from './store';
import { confirmBox } from './components';
import { GROUPS, TABS, groupOf, primaryAction, type ActKey } from './helpers';
import { runSim } from './simClient';

export function openTab(tab: string): void {
  ui.enter = ui.tab !== tab;
  ui.tab = tab;
  ui.lastSub[groupOf(tab)] = tab;
  refresh();
}
export function openGroup(g: string): void { openTab(ui.lastSub[g] || GROUPS[g][0]); }

export function startGameUI(): void {
  setAutoSave(() => saveGame('auto'));
  ensureGpr();
  // save cũ (thể thức Split 1/2): bắt đầu lại mùa hiện tại theo thể thức 2026
  if (S && (!S.phase || !PHASES.includes(S.phase))) {
    for (const id of Object.keys(S.comps)) if (id.startsWith(`${S.season}-`)) delete S.comps[id];
    S.phaseStart = {};
    S.seasonStartDay = S.day;
    startPhase('kickoff');
  }
  go('game', { tab: 'dashboard', selPlayer: null, lastSub: {} });
}

export function createCareer(teamId: string, manager: string): void {
  const st = newGame({ teamId, manager });
  setState(st);
  startPhase('kickoff');
  S.seasonStartDay = 0;
  const ovr = teamOvr(userTeam());
  const rank = leagueTeams(userTeam().league).map((x) => teamOvr(S.teams[x])).sort((a, b) => b - a).indexOf(ovr);
  S.goal = rank <= 1 ? 'goal.title' : rank <= 3 ? 'goal.contend' : rank <= 6 ? 'goal.playoffs' : 'goal.develop';
  addNews('news.welcome', { manager, team: userTeam().name, goal: { $t: S.goal } }, true);
  saveGame('auto');
  startGameUI();
}

function saveModal(): void {
  openModal((close) => (
    <>
      <h3>{t('top.save')}</h3>
      <div className="flex flex-col gap-2 mb-4">
        {[1, 2, 3].map((n) => (
          <button key={n} className="gb" data-slot={n} onClick={() => { saveGame(String(n)); saveGame('auto'); close(); toast(t('top.saved'), 'ok'); }}>{t('load.slot', { n })}</button>
        ))}
      </div>
      <button className="gb ghost" onClick={() => {
        const blob = new Blob([exportSave()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `rift-manager-${S.userTeam.replace(/\W+/g, '_')}-${S.season}.json`;
        a.click();
      }}>{t('set.export')}</button>
    </>
  ));
}

export async function topAction(a: ActKey): Promise<void> {
  if (ui.busy) return;
  switch (a) {
    case 'save': saveModal(); break;
    case 'menu':
      if (await confirmBox(t('set.quitConfirm'))) { saveGame('auto'); setState(null as never); go('menu'); }
      break;
    case 'advance': await runSim('advance'); break;
    case 'simnext': await runSim('simnext'); break;
    case 'match': {
      const m = userMatchToday();
      if (m) { closeModal(); ui.matchDay = m; refresh(); }
      break;
    }
    case 'newseason': await runSim('newseason'); ui.tab = 'dashboard'; refresh(); break;
    case 'prevtab': case 'nexttab': {
      const i = TABS.indexOf(groupOf(ui.tab)) + (a === 'nexttab' ? 1 : -1);
      openGroup(TABS[(i + TABS.length) % TABS.length]);
      break;
    }
    case 'training': openTab('training'); break;
  }
}

/** phím tắt kiểu tay cầm */
export function onKey(e: KeyboardEvent): void {
  if (ui.screen !== 'game' || !S || ui.modal || ui.matchDay || ui.busy) return;
  const el = e.target as HTMLElement;
  if (el.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const pa = primaryAction().act;
  const map: Record<string, ActKey | null> = { enter: pa, f: pa === 'advance' ? 'simnext' : null, s: 'save', q: 'prevtab', e: 'nexttab', escape: 'menu' };
  const k = map[e.key.toLowerCase()];
  if (k) { e.preventDefault(); void topAction(k); }
}
