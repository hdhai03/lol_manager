import { loadData } from './data.js';
import { setLang, getLang, t } from './i18n.js';
import { render } from './ui.js';

setLang(getLang());
loadData()
  .then(() => render())
  .catch((e) => {
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="page narrow"><h1>⚠️</h1><p>${t('err.data')}</p><pre class="muted small">${String(e)}</pre></div>`;
  });
