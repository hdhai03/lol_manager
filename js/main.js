import { loadData, setOnAssets } from './data.js';
import { setLang, getLang, t } from './i18n.js';
import { render } from './ui.js';

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
    document.getElementById('app').innerHTML = `<div class="page narrow"><h1>⚠️</h1><p>${t('err.data')}</p><pre class="muted small">${String(e)}</pre></div>`;
  });
