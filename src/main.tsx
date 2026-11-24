import './styles/style.css';
import './styles/game.css';
import './styles/broadcast.css';
import './styles/match.css';
import './styles/tailwind.css';
import { createRoot } from 'react-dom/client';
import { loadData, setOnAssets } from './engine/data';
import { setLang, getLang, t } from './i18n';
import { refresh } from './ui/store';
import { App } from './ui/App';

setLang(getLang());
const el = document.getElementById('app')!;
const boot = el.querySelector('.boot');
loadData((p) => { if (boot) boot.textContent = `Rift Manager · ${Math.round(p * 100)}%`; })
  .then(() => {
    setOnAssets(() => refresh()); // ảnh splash/loading tải xong thì vẽ lại
    createRoot(el).render(<App />);
  })
  .catch((e) => {
    console.error(e);
    el.innerHTML = `<div class="pick"><h1>Rift Manager</h1><p>${t('err.data')}</p><pre class="muted">${String(e)}</pre></div>`;
  });
