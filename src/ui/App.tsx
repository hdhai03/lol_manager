import { useEffect } from 'react';
import { champSplash } from '../engine/data';
import { t } from '../i18n';
import { ui, useVersion } from './store';
import { ModalHost, ToastHost } from './components';
import { featuredChamp } from './helpers';
import { onKey } from './actions';
import { MenuScreen, AboutScreen, LoadScreen } from './screens/Menu';
import { NewGameScreen } from './screens/NewGame';
import { GameShell } from './screens/GameShell';
import { MatchDay } from './match/MatchDay';

/** nền sân khấu: ánh teal, splash tướng mờ bên phải, sàn nứt, nhiễu hạt */
export function Stage({ champ }: { champ?: string }) {
  return (
    <div className="stage" aria-hidden="true">
      <div className="st-glow" />
      <div className="st-art" style={{ backgroundImage: `url('${champSplash(champ || featuredChamp())}')` }} />
      <div className="st-floor" />
      <div className="st-vig" />
      <div className="st-grain" />
    </div>
  );
}

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
      <Stage />
      {s === 'menu' && <MenuScreen />}
      {s === 'about' && <AboutScreen />}
      {s === 'load' && <LoadScreen />}
      {s === 'new' && <NewGameScreen />}
      {s === 'game' && <GameShell />}
      {s === 'game' && ui.matchDay && <MatchDay key={ui.matchDay.id} match={ui.matchDay} />}
      <ModalHost />
      <ToastHost />
      {ui.busy && ui.busy !== 'advance' && (
        <div className="busy"><div><i />{t(ui.busy === 'newseason' ? 'top.newSeason' : 'btn.simNext')}…</div></div>
      )}
    </>
  );
}
