import './styles/style.css';
import { loadData, setOnAssets } from './engine/data';
import { setLang, getLang, t } from './ui/i18n';
import { render } from './ui/ui';

setLang(getLang());
const boot = document.querySelector('.boot');
loadData((p) => { if (boot) boot.textContent = `Rift Manager · ${Math.round(p * 100)}%`; })
  .then(() => {
    // ảnh splash/loading tải xong thì vẽ lại (trừ khi đang ở màn thi đấu/cửa sổ)
    setOnAssets(() => { if (!document.querySelector('.matchday, .modal-wrap')) render(); });
    render();
  })
  .catch((e) => {
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="page narrow"><h1>Rift Manager</h1><p>${t('err.data')}</p><pre class="muted small">${String(e)}</pre></div>`;
  });
