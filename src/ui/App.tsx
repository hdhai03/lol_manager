import { useEffect } from 'react';
import { t } from '../i18n';
import { ui, useVersion } from './store';
import { S } from '../engine/state';
import { ModalHost, ToastHost } from './components';
import { Backdrop } from './Backdrop';
import { onKey } from './actions';
import { MenuScreen, AboutScreen, LoadScreen } from './screens/Menu';
import { NewGameScreen } from './screens/NewGame';
import { GameShell } from './screens/GameShell';
import { MatchDay } from './match/MatchDay';
import { Ceremony, Wrapped, ReplayView, Sacked } from './Overlays';

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
      {s === 'game' && !ui.matchDay && !ui.replay && <GameShell />}
      {s === 'game' && !ui.matchDay && ui.replay && <ReplayView key={ui.replay} />}
      {s === 'game' && !ui.matchDay && !ui.replay && <Ceremony />}
      {s === 'game' && !ui.matchDay && !ui.replay && !S.ceremony && <Wrapped />}
      {s === 'game' && !ui.matchDay && !ui.replay && !S.ceremony && (!S.wrapped || S.wrapped.seen) && <Sacked />}
      {s === 'game' && ui.matchDay && <MatchDay key={ui.matchDay.id} match={ui.matchDay} />}
      <ModalHost />
      <ToastHost />
      {ui.busy && ui.busy !== 'advance' && (
        <div className="busy"><div><i />{t(ui.busy === 'newseason' ? 'top.newSeason' : 'btn.simNext')}…</div></div>
      )}
    </>
  );
}
