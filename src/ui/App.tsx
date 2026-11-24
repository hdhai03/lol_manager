import { useEffect } from 'react';
import { t } from '../i18n';
import { ui, useVersion } from './store';
import { ModalHost, ToastHost } from './components';
import { Backdrop } from './Backdrop';
import { onKey } from './actions';
import { MenuScreen, AboutScreen, LoadScreen } from './screens/Menu';
import { NewGameScreen } from './screens/NewGame';
import { GameShell } from './screens/GameShell';
import { MatchDay } from './match/MatchDay';

export function App() {
  useVersion();
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  document.title = `${t('app.title')} — ${t('app.tagline')}`;
  const s = ui.screen;
  return (
    <>
      <Backdrop />
      {s === 'menu' && <MenuScreen />}
      {s === 'about' && <AboutScreen />}
      {s === 'load' && <LoadScreen />}
      {s === 'new' && <NewGameScreen />}
      {s === 'game' && !ui.matchDay && <GameShell />}
      {s === 'game' && ui.matchDay && <MatchDay key={ui.matchDay.id} match={ui.matchDay} />}
      <ModalHost />
      <ToastHost />
      {ui.busy && ui.busy !== 'advance' && (
        <div className="busy"><div><i />{t(ui.busy === 'newseason' ? 'top.newSeason' : 'btn.simNext')}…</div></div>
      )}
    </>
  );
}
