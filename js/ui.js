import { DB, champImg, champArt, champTile, champSplash, itemImg, teamLogo, leagueLogo, playerFace, isDarkLogo, src as asset } from './data.js';
import { t, cname, iname, getLang, setLang } from './i18n.js';
import {
  S, setState, newGame, userTeam, teamPlayers, teamSalary, teamOvr, autoLineup, lineupPlayers,
  addNews, saveGame, listSaves, loadSave, deleteSave, exportSave, importSave,
} from './state.js';
import {
  PHASES, startPhase, standings, advanceDay, userMatchToday, nextUserMatch, allPhaseMatches, leagueTeams,
  startNewSeason, makeOffer, acceptOffer, releasePlayer, renewCost, renewContract, askingPrice, seasonDate, setAutoSave, progressComps,
} from './season.js';
import { ROLES, ATTRS, ATTR_GROUPS, esc, money, clamp } from './util.js';
import { gprTable, leagueStrength, ensureGpr } from './gpr.js';
import { AWARD_KEYS } from './awards.js';
import { PHASE_WINDOW } from './formats.js';
import { traitsOf, BAD_TRAITS, groupScore, TACTIC_OPTS, PERSONAL_OPTS, defaultTactics } from './attrs.js';
import { openMatchDay } from './match.js';

const app = () => document.getElementById('app');
export const view = { screen: 'menu', tab: 'dashboard', filters: {} };

// ---------------- Biểu tượng ----------------
const ROLE_PATH = {
  Top: 'M3 3h15l-4 4H7v7l-4 4V3zm7 7h4v4h-4z',
  Jungle: 'M6 2c1.2 5.2 3.2 9 6 12.2C14.8 11 16.8 7.2 18 2c.3 7.4-1.6 13.4-6 20C7.6 15.4 5.7 9.4 6 2z',
  Mid: 'M3 17 17 3h4v4L7 21H3v-4zm0-14h7l-3 3H6v1L3 10V3zm18 18h-7l3-3h1v-1l3-3v7z',
  Bot: 'M21 21H6l4-4h7v-7l4-4v15zM10 10h4v4h-4z',
  Support: 'M12 3l3 4-3 3-3-3 3-3zM2 8h6l4 4 4-4h6l-5 5h-3l-2 8-2-8H7L2 8z',
};
export const roleIcon = (r) => `<svg class="ricon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ROLE_PATH[r]}"/></svg>`;
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  load: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3zM12 11v5m-3-3 3 3 3-3" stroke="#0b1317" stroke-width="1.6" fill="currentColor"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.5"/><circle cx="16.5" cy="8.5" r="3"/><path d="M1.5 20c.5-4 3.2-6 6.5-6s6 2 6.5 6zM14 14.3c3.6-.6 7.6.6 8.5 5.7H16c-.3-2.4-1-4.2-2-5.7z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.3 8v8h2.6v-8zM12 5.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M2 5h20v14H2zm2 2v.5l8 5.5 8-5.5V7z"/></svg>',
  invite: '<svg viewBox="0 0 64 64"><path d="M6 26 32 8l26 18v30H6z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M6 26l26 18 26-18" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M22 14h20v8a10 10 0 0 1-20 0zm10 18v5m-5 2h10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M22 16h-4a4 4 0 0 0 4 6m20-6h4a4 4 0 0 1-4 6" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
  trophy: '<svg viewBox="0 0 64 64"><path d="M18 8h28v14a14 14 0 0 1-28 0zM32 36v10m-10 8h20M18 12H8v4a10 10 0 0 0 10 10m28-14h10v4a10 10 0 0 1-10 10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tactic: '<svg viewBox="0 0 24 24"><path d="M2 5h20v14H2zm2 2v10h7V7zm9 0v10h7V7zM5 9h2v2H5zm2 4h2v2H7zm9-3h2v4h-2z"/></svg>',
  contract: '<svg viewBox="0 0 24 24"><path d="M5 2h10l4 4v16H5zm3 7h8v1.6H8zm0 4h8v1.6H8zm0 4h5v1.6H8z"/></svg>',
};

// ---------------- Thành phần dùng chung ----------------
export function badge(teamId, size = 'md') {
  const tm = S ? S.teams[teamId] : null;
  const src = tm || DB.teams[teamId] || { short: '?', name: teamId };
  const h = tm ? tm.hue : [...(src.name || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
  const logo = teamLogo(teamId);
  const title = esc((tm && tm.name) || src.display || src.name);
  if (logo) return `<span class="badge badge-${size} logo ${isDarkLogo(logo) ? 'on-light' : ''}" title="${title}"><img src="${asset(logo)}" alt="${esc(src.short || '')}" loading="lazy"></span>`;
  return `<span class="badge badge-${size}" style="--h:${h}" title="${title}">${esc(src.short || '?')}</span>`;
}
export function leagueBadge(id, size = 'sm') {
  const lp = leagueLogo(id === 'INTL' ? 'WORLDS' : id);
  if (!lp) return '';
  return `<span class="lg-logo lg-${size} ${isDarkLogo(lp) ? 'on-light' : ''}" title="${esc(id)}"><img src="${asset(lp)}" alt="${esc(id)}" loading="lazy"></span>`;
}
export function face(p, size = 'md', extra = '') {
  if (!p) return `<span class="face face-${size} ${extra} none"></span>`;
  const fp = playerFace(p.id);
  if (fp) return `<span class="face face-${size} ${extra}"><img src="${asset(fp)}" alt="${esc(p.ign)}" loading="lazy"></span>`;
  return `<span class="face face-${size} ${extra} none">${esc((p.ign || '?').slice(0, 2).toUpperCase())}</span>`;
}
export const faceSrc = (p) => (p && playerFace(p.id) ? asset(playerFace(p.id)) : null);
export const champIcon = (id, size = 32, extra = '') => id
  ? `<img class="champ" loading="lazy" src="${size >= 44 ? champTile(id) : champImg(id)}" width="${size}" height="${size}" alt="${esc(cname(id))}" title="${esc(cname(id))}" ${extra}>`
  : `<span class="champ empty" style="width:${size}px;height:${size}px"></span>`;
export const roleTag = (r) => `<span class="role role-${r}" title="${t('role.' + r)}">${t('roleS.' + r)}</span>`;
export const vClass = (v) => (v >= 88 ? 's' : v >= 80 ? 'a' : v >= 70 ? 'b' : v >= 60 ? 'c' : 'd');
export const ovrTag = (v) => `<span class="ovr o-${vClass(v)}">${v}</span>`;
const pct = (x) => `${Math.round(x * 100)}%`;
const CC = { 'South Korea': 'KR', China: 'CN', Vietnam: 'VN', Taiwan: 'TW', 'Hong Kong': 'HK', Japan: 'JP', Brazil: 'BR', 'United States': 'US', Canada: 'CA', France: 'FR', Germany: 'DE', Spain: 'ES', Denmark: 'DK', Poland: 'PL', Sweden: 'SE', 'United Kingdom': 'GB', Belgium: 'BE', Netherlands: 'NL', Australia: 'AU', Turkey: 'TR', Czech_Republic: 'CZ', 'Czech Republic': 'CZ', Slovenia: 'SI', Greece: 'GR', Croatia: 'HR', Italy: 'IT', Portugal: 'PT', Argentina: 'AR', Chile: 'CL', Mexico: 'MX', Philippines: 'PH', Thailand: 'TH', Malaysia: 'MY', Singapore: 'SG', Indonesia: 'ID', Macau: 'MO', Ukraine: 'UA', Russia: 'RU', Lithuania: 'LT', Bulgaria: 'BG', Romania: 'RO', Hungary: 'HU', Austria: 'AT', Switzerland: 'CH', Norway: 'NO', Finland: 'FI', Ireland: 'IE', Israel: 'IL', Peru: 'PE', Uruguay: 'UY', Colombia: 'CO' };
const cc = (country) => (country ? `<span class="cc" title="${esc(country)}">${esc(CC[country] || country.slice(0, 3).toUpperCase())}</span>` : '');
const fullMoney = (k) => `${k < 0 ? '-' : ''}$ ${Math.round(Math.abs(k) * 1000).toLocaleString('en-US')}`;
const pHead = (title, right = '') => `<div class="p-head"><h3>${title}</h3>${right}</div>`;
function stars(ovr) {
  const n = clamp(Math.round((ovr - 58) / 6), 1, 5);
  return `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}

export function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
}

export function modal(html, { wide = false, onClose } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog"><button class="modal-x" data-close aria-label="${t('common.close')}">✕</button>${html}</div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) { closeModal(); onClose && onClose(); }
  });
  document.body.appendChild(wrap);
  return wrap.querySelector('.modal');
}
export function closeModal() { document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()); }

function confirmBox(msg) {
  return new Promise((res) => {
    const m = modal(`<p>${esc(msg)}</p><div class="row end gap"><button class="btn ghost" data-no>${t('common.cancel')}</button><button class="btn primary" data-yes>${t('common.ok')}</button></div>`);
    m.querySelector('[data-yes]').onclick = () => { closeModal(); res(true); };
    m.querySelector('[data-no]').onclick = () => { closeModal(); res(false); };
  });
}

function langSwitch() {
  const l = getLang();
  return `<div class="lang" role="group" aria-label="${t('lang.label')}">
    <button class="${l === 'vi' ? 'on' : ''}" data-lang="vi">VI</button>
    <button class="${l === 'en' ? 'on' : ''}" data-lang="en">EN</button></div>`;
}
function bindLang(root) {
  root.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => { setLang(b.dataset.lang); render(); });
}

export const compTitle = (c) => (c.stage ? `${c.name} · ${t('stage.' + c.stage)}` : `${c.name} ${t('phase.' + c.phase)}`);
export const compLogoId = (c) => c.logo || (c.league === 'INTL' ? (c.phase === 'msi' ? 'MSI' : 'WORLDS') : c.league);

// ảnh nền: splash mờ của tướng tủ ngôi sao đội người chơi (hoặc tướng meta)
function featuredChamp() {
  if (S && userTeam()) {
    const star = teamPlayers(userTeam()).sort((a, b) => b.ovr - a.ovr)[0];
    if (star && star.pool[0]) return star.pool[0].c;
  }
  return DB.champList.filter((c) => c.tier === 'S').sort((a, b) => b.presence - a.presence)[0].id;
}
export const bgArt = (id) => `<div class="bg-art" aria-hidden="true"><i style="background-image:url('${champSplash(id || featuredChamp())}')"></i></div>`;

// ---------------- Router ----------------
export function render() {
  document.title = `${t('app.title')} — ${t('app.tagline')}`;
  if (view.screen === 'menu') return renderMenu();
  if (view.screen === 'load') return renderLoad();
  if (view.screen === 'about') return renderAbout();
  if (view.screen === 'new') return renderNew();
  if (view.screen === 'game') return renderGame();
}
export function go(screen, extra = {}) { Object.assign(view, { screen }, extra); render(); window.scrollTo(0, 0); }

// ---------------- Menu chính ----------------
function renderMenu() {
  const saves = listSaves();
  const m = DB.meta;
  const topChamps = DB.champList.filter((c) => c.tier === 'S').sort((a, b) => b.presence - a.presence).slice(0, 10);
  app().innerHTML = `${bgArt()}
  <div class="menu-screen">
    <div class="menu-top">${langSwitch()}</div>
    <div>
      <div class="brand"><div class="mono">RM</div><div><div class="brand-name">Rift Manager</div>
        <div class="brand-tag"><span class="beta">${t('app.beta')}</span> ${t('app.tagline')}</div></div></div>
      <div class="menu-list">
        ${saves.length ? `<button class="menu-item sel" data-act="continue"><span><b>${t('menu.continue')}</b><span class="d">${esc(saves[0].manager)} · ${esc(saves[0].team)} · ${t('season', { y: saves[0].season })}</span></span></button>` : ''}
        <button class="menu-item ${saves.length ? '' : 'sel'}" data-act="new"><span><b>${t('menu.new')}</b><span class="d">${t('menu.newDesc')}</span></span></button>
        <button class="menu-item" data-act="load"><span><b>${t('menu.load')}</b><span class="d">${t('menu.loadDesc')}</span></span></button>
        <button class="menu-item" disabled><span><b>${t('menu.multiplayer')} <em class="soon">${t('menu.soon')}</em></b></span></button>
        <button class="menu-item" data-act="about"><span><b>${t('menu.about')}</b></span></button>
      </div>
    </div>
    <div class="card feature">
      <div class="f-top">${leagueBadge('WORLDS', 'md')}<div><b>${t('menu.metaTitle')}</b><div class="muted small">Patch ${esc(m.proPatch)}</div></div></div>
      <div class="f-art">${topChamps.map((c) => `<div class="center">${champIcon(c.id, 56)}<div class="small" style="margin-top:.3rem">${esc(cname(c.id))}</div></div>`).join('')}<span class="new-flag">${t('menu.new2')}</span></div>
      <div class="f-text"><p style="margin:0 0 .4rem">${t('menu.metaBody', { games: m.gamesAnalyzed })}</p>
        <div class="row gap wrap">${DB.leagues.map((l) => leagueBadge(l.id, 'md')).join('')}</div></div>
    </div>
    <div class="menu-foot">${t('menu.dataInfo', { teams: Object.keys(DB.teams).length, players: Object.keys(DB.players).length, patch: m.proPatch, games: m.gamesAnalyzed })}</div>
  </div>`;
  bindLang(app());
  app().querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'continue') { loadSave(saves[0].slot); startGameUI(); }
    else go(a, { newLeague: null, newTeam: null });
  });
}

function renderAbout() {
  app().innerHTML = `<div class="page narrow"><button class="btn ghost" data-back>${t('menu.back')}</button>
    <h1 style="margin-top:1rem">${t('about.title')}</h1><div class="card"><p>${t('about.body')}</p><p class="muted small">${t('about.riot')}</p>
    <p class="muted small">Data Dragon ${esc(DB.meta.ddragon)} · ${esc(DB.meta.generated.slice(0, 10))}</p></div></div>`;
  app().querySelector('[data-back]').onclick = () => go('menu');
}

function renderLoad() {
  const saves = listSaves();
  app().innerHTML = `<div class="page narrow"><button class="btn ghost" data-back>${t('menu.back')}</button>
    <h1 style="margin-top:1rem">${t('load.title')}</h1>
    <div class="card">${saves.length ? saves.map((s) => `
      <div class="list-row">
        ${badge(s.team)}<div class="grow"><b>${s.slot === 'auto' ? t('load.slot.auto') : t('load.slot', { n: s.slot })}</b>
        <div class="muted small">${esc(s.manager)} · ${esc(s.team)} · ${t('season', { y: s.season })} · ${t('phase.' + s.phase)} · ${new Date(s.savedAt).toLocaleString(getLang())}</div></div>
        <button class="btn primary sm" data-load="${esc(s.slot)}">${t('load.load')}</button>
        <button class="btn ghost danger sm" data-del="${esc(s.slot)}">${t('load.delete')}</button>
      </div>`).join('') : `<p class="muted">${t('load.empty')}</p>`}</div>
    <label class="btn">${t('load.import')}<input type="file" accept=".json,application/json" hidden data-import></label>
  </div>`;
  const r = app();
  r.querySelector('[data-back]').onclick = () => go('menu');
  r.querySelectorAll('[data-load]').forEach((b) => b.onclick = () => { loadSave(b.dataset.load); startGameUI(); });
  r.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (await confirmBox(t('load.confirmDelete'))) { deleteSave(b.dataset.del); render(); } });
  r.querySelector('[data-import]').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((txt) => { try { importSave(txt); startGameUI(); } catch { toast(t('load.bad'), 'err'); } });
  };
}

// ---------------- Sự nghiệp mới ----------------
function previewTeam(tid) {
  const tm = DB.teams[tid];
  const ps = tm.players.map((l) => DB.players[l]).filter(Boolean);
  const starters = ROLES.map((r) => ps.filter((p) => p.role === r).sort((a, b) => b.ovr - a.ovr)[0]).filter(Boolean);
  const ovr = Math.round(starters.reduce((s, p) => s + p.ovr, 0) / Math.max(starters.length, 1));
  return { tm, ps, starters, ovr, salary: ps.reduce((s, p) => s + p.salary, 0) };
}
const leagueIds = (lg) => Object.keys(DB.teams).filter((x) => DB.teams[x].league === lg).sort((a, b) => previewTeam(b).ovr - previewTeam(a).ovr);
const level = (x, hi, lo) => (x >= hi ? 'high' : x >= lo ? 'medium' : 'low');

function renderNew() {
  const lg = view.newLeague;
  let body;
  if (!lg) {
    body = `<h1>${t('new.chooseLeague')}</h1><div class="league-grid">${DB.leagues.map((L) => {
      const n = Object.values(DB.teams).filter((x) => x.league === L.id).length;
      return `<button class="league-tile" data-lg="${L.id}">${leagueBadge(L.id, 'lg')}<b>${L.id}</b><span>${esc(L.name)}</span>
        <span class="muted small">${esc(L.region)} · ${t('new.teams', { n })}</span><div class="bar"><i style="width:${L.strength * 100}%"></i></div></button>`;
    }).join('')}</div>`;
  } else {
    const ids = leagueIds(lg);
    const sel = ids.includes(view.newTeam) ? view.newTeam : ids[0];
    view.newTeam = sel;
    const pv = previewTeam(sel);
    const L = DB.leagueById[lg];
    const rank = ids.indexOf(sel) + 1;
    const star = [...pv.ps].sort((a, b) => b.ovr - a.ovr)[0];
    const diff = rank <= 2 ? 'easy' : rank <= Math.ceil(ids.length / 2) ? 'normal' : rank < ids.length - 1 ? 'hard' : 'vhard';
    const goal = rank <= 2 ? 'goal.title' : rank <= 4 ? 'goal.contend' : rank <= 6 ? 'goal.playoffs' : 'goal.develop';
    const fin = level(pv.tm.budget - pv.salary * 0.4, 3000, 800);
    const young = pv.ps.filter((p) => p.age <= 21);
    const youth = level(young.reduce((s, p) => s + (p.potential - p.ovr), 0), 25, 8);
    const diffClass = { easy: 'g-green', normal: 'g-blue', hard: 'g-orange', vhard: 'g-red' }[diff];
    const lvlClass = { high: 'g-green', medium: 'g-gold', low: 'g-red' };
    body = `<div class="pick-grid">
      <div class="pick-team">
        <div class="region">${leagueBadge(lg, 'sm')} ${esc(L.region)}</div>
        <div class="card hl pick-card">
          <div class="tname-big">${esc(pv.tm.display || sel)}</div>
          <div class="arrows"><button class="arrow-btn" data-step="-1" aria-label="prev">◀</button>${badge(sel, 'hero')}<button class="arrow-btn" data-step="1" aria-label="next">▶</button></div>
          ${stars(pv.ovr)}
        </div>
        <div class="league-name">${esc(L.name)}</div>
      </div>
      <div class="tile">
        <div class="lbl">${t('new.star')}</div><div class="val">${esc(star.ign)}</div>
        <div style="margin:.6rem auto">${face({ id: star.link, ign: star.ign }, 'xl')}</div>
        <div>${roleTag(star.role)} ${ovrTag(star.ovr)}</div>
      </div>
      <div class="tile">
        <div class="lbl">${t('new.strength')}</div><div class="huge">${pv.ovr}</div>
        <div class="split"><div><span>${t('new.powerRank')}</span><span class="n">#${rank}</span></div><div><span>${t('new.players')}</span><span class="n">${pv.ps.length}</span></div></div>
        <div class="divider"></div>
        <div class="split"><div><span>${t('new.budget')}</span><b class="val">${money(pv.tm.budget)}</b></div><div><span>${t('new.salary')}</span><b class="val">${money(pv.salary)}</b></div></div>
      </div>
      <div class="pick-side">
        <div class="tile grad ${diffClass}"><div class="lbl">${t('new.difficulty')}</div><div class="val">${t('diff.' + diff)}</div></div>
        <div class="tile grad ${lvlClass[fin]}"><div class="lbl">${t('new.finance')}</div><div class="val">${t('lvl.' + fin)}</div></div>
        <div class="tile grad ${lvlClass[youth]}"><div class="lbl">${t('new.youth')}</div><div class="val">${t('lvl.' + youth)}</div></div>
      </div>
      <div class="tile">
        <div class="lbl">${t('new.coach')}</div><div class="val">${esc(pv.tm.coach || '—')}</div>
        <div class="divider"></div>
        <div class="pick-roster">${pv.starters.map((p) => `<div class="pr">${face({ id: p.link, ign: p.ign }, 'md')}<span>${esc(p.ign)}</span>${roleTag(p.role)}</div>`).join('')}</div>
      </div>
      <div class="tile"><div class="lbl">${t('dash.board')}</div><div class="val" style="font-size:1.15rem;margin-top:.3rem">${t(goal)}</div></div>
    </div>
    <div class="seg" style="margin-top:1rem">${ids.map((id) => `<button class="icon-btn ${id === sel ? 'on' : ''}" data-team="${esc(id)}" title="${esc(DB.teams[id].display)}">${badge(id, 'sm')}</button>`).join('')}</div>
    <div class="pick-start"><label class="field">${t('new.manager')}<input id="mgr" maxlength="24" placeholder="${t('new.managerPh')}" value="${esc(view.mgr || '')}"></label>
      <button class="btn primary big" data-start>${t('new.start')}</button></div>`;
  }
  app().innerHTML = `<div class="page"><div class="row between" style="margin-bottom:1rem">${lg ? `<button class="btn ghost" data-backlg>← ${t('new.chooseLeague')}</button>` : `<button class="btn ghost" data-menu>${t('menu.back')}</button>`}${langSwitch()}</div>${body}</div>`;
  const r = app();
  bindLang(r);
  const keepName = () => { const i = r.querySelector('#mgr'); if (i) view.mgr = i.value; };
  r.querySelector('[data-menu]')?.addEventListener('click', () => go('menu'));
  r.querySelectorAll('[data-lg]').forEach((b) => b.onclick = () => { view.newLeague = b.dataset.lg; view.newTeam = null; render(); });
  r.querySelector('[data-backlg]')?.addEventListener('click', () => { keepName(); view.newLeague = null; render(); });
  r.querySelectorAll('[data-team]').forEach((b) => b.onclick = () => { keepName(); view.newTeam = b.dataset.team; render(); });
  r.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
    keepName();
    const ids = leagueIds(lg);
    view.newTeam = ids[(ids.indexOf(view.newTeam) + +b.dataset.step + ids.length) % ids.length];
    render();
  });
  r.querySelector('[data-start]')?.addEventListener('click', () => {
    const name = r.querySelector('#mgr').value.trim() || (getLang() === 'vi' ? 'HLV' : 'Coach');
    newGame({ teamId: view.newTeam, manager: name });
    startPhase('kickoff');
    S.seasonStartDay = 0;
    const ovr = teamOvr(userTeam());
    const rank = leagueTeams(userTeam().league).map((x) => teamOvr(S.teams[x])).sort((a, b) => b - a).indexOf(ovr);
    S.goal = rank <= 1 ? 'goal.title' : rank <= 3 ? 'goal.contend' : rank <= 6 ? 'goal.playoffs' : 'goal.develop';
    addNews('news.welcome', { manager: name, team: userTeam().name, goal: { $t: S.goal } }, true);
    saveGame('auto');
    startGameUI();
  });
}

export function startGameUI() {
  setAutoSave(() => saveGame('auto'));
  ensureGpr();
  // save cũ (thể thức Split 1/2): bắt đầu lại mùa hiện tại theo thể thức 2026
  if (S && !PHASES.includes(S.phase)) {
    for (const id of Object.keys(S.comps)) if (id.startsWith(`${S.season}-`)) delete S.comps[id];
    S.phaseStart = {};
    S.seasonStartDay = S.day;
    startPhase('kickoff');
  }
  view.tab = 'dashboard';
  view.selPlayer = null;
  go('game');
}

// ---------------- Khung game ----------------
const TABS = ['dashboard', 'roster', 'tactics', 'transfers', 'schedule', 'standings', 'power', 'records', 'meta', 'world', 'finance'];

function newsText(n) {
  const p = {};
  for (const [k, v] of Object.entries(n.params || {})) p[k] = v && v.$t ? t(v.$t) : (k === 'fee' ? money(v) : v);
  return t(n.key, p);
}

function primaryAction() {
  if (S.phase === 'offseason') return { act: 'newseason', label: t('top.newSeason') };
  if (userMatchToday()) return { act: 'match', label: t('btn.play') };
  return { act: 'advance', label: t('btn.advance') };
}

function renderGame() {
  const ut = userTeam();
  const pa = primaryAction();
  const date = seasonDate(S.day - (S.seasonStartDay || 0));
  const phaseIdx = PHASES.indexOf(S.phase);
  const entering = view.lastTab !== view.tab;
  view.lastTab = view.tab;
  app().innerHTML = `
  <div class="game">${bgArt()}
    <header class="topnav">
      <div class="mono sm">RM</div>
      <div class="sect">${t('nav.' + view.tab)}</div>
      <nav class="tabs">${TABS.map((x) => `<button class="${view.tab === x ? 'on' : ''}" data-tab="${x}">${t('nav.' + x)}</button>`).join('')}</nav>
      <div class="tn-ctl">
        <button class="btn sm primary tn-act" data-act="${pa.act}" title="Enter">${pa.label}</button>
        ${pa.act === 'advance' ? `<button class="btn sm ghost tn-act" data-act="simnext" title="F">${t('btn.simNext')}</button>` : ''}
        <button class="icon-btn" data-act="save" title="${t('top.save')} (S)" aria-label="${t('top.save')}"><svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v5h8V5H7zm5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg></button>
        <button class="icon-btn" data-act="menu" title="${t('nav.menu')} (Esc)" aria-label="${t('nav.menu')}"><svg viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg></button>
        ${langSwitch()}</div>
      <div class="club">${badge(ut.id, 'md')}<div><div class="nm">${esc(ut.name)}</div>
        <div class="club-sub">${date.toLocaleDateString(getLang(), { day: '2-digit', month: '2-digit' })} · <b class="${ut.budget < 0 ? 'neg' : ''}">${money(ut.budget)}</b></div>
        <div class="prog" title="${t('season', { y: S.season })} · ${t('phase.' + S.phase)}">${PHASES.map((_, i) => `<i class="${i <= phaseIdx ? 'on' : ''}"></i>`).join('')}</div></div></div>
    </header>
    <main class="content ${entering ? 'enter' : ''}" id="content"></main>
  </div>`;
  const r = app();
  bindLang(r);
  r.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { view.tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  r.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => topAction(b.dataset.act));
  const c = r.querySelector('#content');
  markTasks(view.tab);
  ({ dashboard, roster, tactics, schedule, standingsTab, power, records, transfers, metaTab, world, finance })[tabFn(view.tab)](c);
}
// ---------- Chiến thuật ----------
function tactics(c) {
  const ut = userTeam();
  S.tactics ??= defaultTactics();
  const T = S.tactics;
  const lp = lineupPlayers(ut);
  const group = (k) => `<div class="tac-row"><div class="tac-l"><b>${t('tac.' + k)}</b>${['tempo', 'obj', 'style', 'focus'].includes(k) ? `<span class="muted small">${t('tac.h.' + k)}</span>` : ''}</div>
    <div class="seg">${TACTIC_OPTS[k].map((o) => `<button class="chip ${T[k] === o ? 'on' : ''}" data-tk="${k}" data-tv="${o}">${t(`tac.${k}.${o}`)}</button>`).join('')}</div></div>`;
  c.innerHTML = `<div class="page-h"><h2>${t('tac.title')}</h2><p class="muted">${t('tac.sub')}</p></div>
    <div class="tac-grid">
      <div class="card">${['tempo', 'obj', 'style', 'focus', 'jungle'].map(group).join('')}
        <div class="btn-row"><button class="btn sm ghost" data-treset>${t('tac.reset')}</button></div></div>
      <div class="card"><h3>${t('tac.personal')}</h3><p class="muted small">${t('tac.h.personal')}</p>
        ${lp.map(({ role, p }) => `<div class="tac-p">${roleTag(role)}${face(p, 'sm')}<div class="grow"><b>${p ? esc(p.ign) : '—'}</b>
          ${p ? `<div class="muted small">${t('attr.aggression')} ${p.stats.aggression} · ${t('attr.patience')} ${p.stats.patience}${traitsOf(p).length ? ' · ' + traitsOf(p).map((x) => t('trait.' + x)).join(', ') : ''}</div>` : ''}</div>
          <div class="seg sm">${PERSONAL_OPTS.map((o) => `<button class="chip sm ${(T.personal[role] || 'standard') === o ? 'on' : ''}" data-pr="${role}" data-pv="${o}">${t('tac.pt.' + o)}</button>`).join('')}</div></div>`).join('')}
      </div>
    </div>`;
  c.querySelectorAll('[data-tk]').forEach((b) => b.onclick = () => { T[b.dataset.tk] = b.dataset.tv; tactics(c); });
  c.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { T.personal[b.dataset.pr] = b.dataset.pv; tactics(c); });
  c.querySelector('[data-treset]').onclick = () => { S.tactics = defaultTactics(); tactics(c); };
}
const tabFn = (x) => ({ standings: 'standingsTab', meta: 'metaTab' }[x] || x);

async function topAction(a) {
  if (a === 'save') {
    const m = modal(`<h3>${t('top.save')}</h3><div class="list">${[1, 2, 3].map((n) => `<button class="btn" data-slot="${n}">${t('load.slot', { n })}</button>`).join('')}</div>
      <hr><button class="btn ghost" data-export>${t('set.export')}</button>`);
    m.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => { saveGame(b.dataset.slot); saveGame('auto'); closeModal(); toast(t('top.saved'), 'ok'); });
    m.querySelector('[data-export]').onclick = () => {
      const blob = new Blob([exportSave()], { type: 'application/json' });
      const aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(blob);
      aEl.download = `rift-manager-${S.userTeam.replace(/\W+/g, '_')}-${S.season}.json`;
      aEl.click();
    };
  } else if (a === 'menu') {
    if (await confirmBox(t('set.quitConfirm'))) { saveGame('auto'); setState(null); go('menu'); }
  } else if (a === 'advance') {
    advanceDay();
    saveGame('auto');
    render();
  } else if (a === 'simnext') {
    const phase = S.phase;
    for (let i = 0; i < 300 && S.phase === phase && !userMatchToday(); i++) advanceDay();
    saveGame('auto');
    render();
  } else if (a === 'match') {
    if (!userMatchToday()) return;
    openMatchDay(userMatchToday(), () => { progressComps(); saveGame('auto'); render(); });
  } else if (a === 'newseason') {
    startNewSeason();
    S.seasonStartDay = S.day;
    saveGame('auto');
    view.tab = 'dashboard';
    render();
  } else if (a === 'prevtab' || a === 'nexttab') {
    const i = TABS.indexOf(view.tab) + (a === 'nexttab' ? 1 : -1);
    view.tab = TABS[(i + TABS.length) % TABS.length];
    render();
  } else if (a === 'training') {
    view.tab = 'roster';
    render();
  }
}

// phím tắt kiểu tay cầm
document.addEventListener('keydown', (e) => {
  if (view.screen !== 'game' || !S) return;
  if (document.querySelector('.modal-wrap, .matchday, .draft')) return;
  if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const map = { enter: primaryAction().act, f: primaryAction().act === 'advance' ? 'simnext' : null, s: 'save', q: 'prevtab', e: 'nexttab', escape: 'menu' };
  if (map[k]) { e.preventDefault(); topAction(map[k]); }
});

// ---------- Việc cần làm trong ngày (thay đổi theo từng ngày, làm xong thì biến mất) ----------
const TASK_TAB = { training: 'roster', squad: 'roster', rest: 'roster', scout: 'transfers', tactics: 'tactics', finance: 'finance', lineup: 'roster', gpr: 'power', standings: 'standings' };
function todayTasks() {
  const ut = userTeam();
  if (!S.tasks || S.tasks.day !== S.day) {
    // sinh việc cho ngày mới
    const items = [];
    const nm = nextUserMatch();
    const comp = nm && S.comps[nm.comp];
    if (userMatchToday()) items.push({ id: 'match', kind: 'match' });
    if (nm && comp && (comp.league === 'INTL' || ['playoffs', 'rtm', 'playin', 'knockout', 'regional', 'promotion'].includes(comp.stage)) && nm.day - S.day <= 1 && S.tacticsFor !== nm.id) {
      const opp = nm.a === ut.id ? nm.b : nm.a;
      items.push({ id: 'tactics', kind: 'tactics', opp: S.teams[opp].short, mid: nm.id });
    }
    if (S.day - (S.trainingSetDay ?? -99) >= 7) items.push({ id: 'training', kind: 'training' });
    const tired = teamPlayers(ut).filter((p) => Object.values(ut.lineup).includes(p.id) && (p.cond ?? 100) < 62);
    if (tired.length) items.push({ id: 'rest', kind: 'rest', who: tired.map((p) => p.ign).join(', ') });
    if (ut.roster.length < 7 || (S.day % 6 === 0)) items.push({ id: 'scout', kind: 'scout' });
    if (ut.budget < 0) items.push({ id: 'finance', kind: 'finance' });
    if (S.phase === 'offseason') items.push({ id: 'squad', kind: 'squad' });
    S.tasks = { day: S.day, items, done: [] };
  }
  const offers = (S.offers || []).filter((o) => S.players[o.pid]?.teamId === ut.id);
  const expiring = teamPlayers(ut).filter((p) => p.contractUntil <= S.season && !(S.renewed || []).includes(p.id));
  const list = S.tasks.items.filter((x) => !S.tasks.done.includes(x.id) && !(x.kind === 'match' && !userMatchToday()) && !(x.kind === 'training' && (S.trainingSetDay ?? -99) >= S.tasks.day));
  // việc theo trạng thái: tự biến mất khi đã xử lý
  if (offers.length) list.push({ id: 'offers', kind: 'offers', n: offers.length });
  if (S.phase === 'offseason' && expiring.length) list.push({ id: 'renew', kind: 'renew', n: expiring.length });
  if (ROLES.some((r) => !ut.lineup[r])) list.push({ id: 'lineup', kind: 'lineup' });
  return list;
}
// đánh dấu xong khi người chơi mở đúng mục liên quan
function markTasks(tab) {
  if (!S.tasks) return;
  for (const x of S.tasks.items) if (TASK_TAB[x.kind] === tab && x.kind !== 'training' && !S.tasks.done.includes(x.id)) {
    S.tasks.done.push(x.id);
    if (x.kind === 'tactics') S.tacticsFor = x.mid;
  }
}
function taskLabel(x) {
  return t('task.' + x.kind, { n: x.n, opp: esc(x.opp || ''), who: esc(x.who || '') });
}

// ---------- Trang chủ ----------
// giai đoạn vòng tròn gần nhất của giải (để hiện bảng xếp hạng)
function currentSplitComp(lg) {
  const list = Object.values(S.comps).filter((c) => c.id.startsWith(`${S.season}-`) && c.league === lg && c.type !== 'bracket');
  return list[list.length - 1] || null;
}
function recordOf(teamId) {
  const comp = currentSplitComp(S.teams[teamId].league);
  const st = standings(comp);
  const i = st.findIndex((r) => r.team === teamId);
  return i < 0 ? null : { rank: i + 1, w: st[i].w, l: st[i].l };
}
function userMatches() {
  return Object.values(S.comps).filter((c) => c.id.startsWith(`${S.season}-`)).flatMap((c) => c.matches)
    .filter((m) => m.a === S.userTeam || m.b === S.userTeam);
}
const hash = (s) => [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7);
const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n));

function postHtml(n) {
  const text = newsText(n);
  const p = n.params || {};
  const findTeam = (name) => Object.values(S.teams).find((x) => x.name === name);
  const findPlayer = (ign) => Object.values(S.players).find((x) => x.ign === ign);
  let author = t('feed.esports'), handle = '@riftesports', av = leagueBadge(userTeam().league, 'md');
  if (/transfer|signedFA|released|contractExpired|offer/.test(n.key)) {
    author = t('feed.transfers'); handle = '@rifttransfers';
    const pl = p.player && findPlayer(p.player);
    const fs = faceSrc(pl);
    av = fs ? `<img class="pf" src="${fs}" alt="">` : (pl && pl.teamId ? badge(pl.teamId, 'md') : av);
  } else if (/Champ|userWin|userLoss/.test(n.key)) {
    const tm = findTeam(p.team);
    if (tm) av = badge(tm.id, 'md');
  } else if (n.key === 'news.welcome') {
    author = t('feed.board'); handle = '@' + userTeam().short.toLowerCase(); av = badge(userTeam().id, 'md');
  } else if (/msi|worlds/i.test(n.key)) {
    av = leagueBadge(/msi/i.test(n.key) ? 'MSI' : 'WORLDS', 'md');
  }
  const h = hash(text);
  const ago = S.day - n.day <= 0 ? t('feed.today') : t('feed.daysAgo', { n: S.day - n.day });
  const scale = n.important ? 6 : 1;
  return `<div class="post"><div class="av">${av}</div><div class="grow">
    <div class="who">${esc(author)}<small>${handle} · ${ago}</small></div>
    <p>${esc(text)}</p>
    <div class="eng"><span>${t('feed.likes', { n: kfmt((h % 400 + 40) * scale * 4) })}</span><span>${t('feed.comments', { n: kfmt((h % 180 + 12) * scale) })}</span></div></div></div>`;
}

// thẻ tin lớn kiểu mạng xã hội (ảnh + chú thích)
function socialCard(n) {
  const p = n.params || {};
  const text = newsText(n);
  const tm = Object.values(S.teams).find((x) => x.name === p.team || x.name === p.to) || (n.key === 'news.welcome' ? userTeam() : null);
  const pl = p.player && Object.values(S.players).find((x) => x.ign === p.player);
  const metaChamps = DB.champList.filter((c) => c.tier === 'S');
  const art = champSplash(metaChamps[hash(text) % metaChamps.length].id);
  const hueTeam = tm || (pl && pl.teamId && S.teams[pl.teamId]) || userTeam();
  let visual;
  const fs = faceSrc(pl);
  if (fs) visual = `<img class="s-face" src="${fs}" alt="">`;
  else if (tm) visual = `<span class="s-logo">${badge(tm.id, 'hero')}</span>`;
  else visual = `<span class="s-logo">${leagueBadge(/msi/i.test(n.key) ? 'MSI' : /worlds/i.test(n.key) ? 'WORLDS' : userTeam().league, 'xl')}</span>`;
  const author = /transfer|signedFA|released|contractExpired|offer/.test(n.key) ? t('feed.transfers') : n.key === 'news.welcome' ? t('feed.board') : t('feed.esports');
  const h = hash(text);
  return `<article class="social" style="--h:${hueTeam.hue}">
    <div class="s-img" style="background-image:url('${art}')"></div><div class="s-shade"></div>
    ${n.day >= S.day - 1 ? `<span class="new-flag">${t('menu.new2')}</span>` : ''}
    <div class="s-head"><span class="s-av">${badge(hueTeam.id, 'md')}</span><div><b>${esc(author)}</b><small>${n.day >= S.day ? t('feed.today') : t('feed.daysAgo', { n: S.day - n.day })}</small></div></div>
    <div class="s-visual">${visual}</div>
    <div class="s-cap"><p>${esc(text)}</p>
      <div class="s-eng"><span>${t('feed.likes', { n: kfmt((h % 400 + 60) * 12) })}</span><span>${t('feed.comments', { n: kfmt(h % 180 + 20) })}</span><span class="grow"></span><button class="btn sm ghost" data-tab-go="world">${t('dash.showMore')}</button></div></div>
  </article>`;
}

function calendarHtml() {
  const base = seasonDate(S.day - (S.seasonStartDay || 0));
  const off = view.calOffset || 0;
  const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + off, 1));
  const ms = userMatches();
  const byDate = {};
  for (const m of ms) byDate[seasonDate(m.day - (S.seasonStartDay || 0)).toISOString().slice(0, 10)] = m;
  const todayKey = base.toISOString().slice(0, 10);
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const m = byDate[key];
    const out = d.getUTCMonth() !== first.getUTCMonth();
    if (i >= 35 && out) break;
    let inner = d.getUTCDate();
    let cls = out ? 'out' : '';
    if (m) {
      const opp = m.a === S.userTeam ? m.b : m.a;
      cls += ` match ${m.done ? 'played' : ''}`;
      inner = `${badge(opp, 'sm')}${m.done ? `<span class="mk ${m.winner === S.userTeam ? 'W' : 'L'}"></span>` : '<span class="mk"></span>'}`;
    }
    if (key === todayKey) cls += ' today';
    cells.push(`<div class="d ${cls}" title="${key}">${inner}</div>`);
  }
  const dows = getLang() === 'vi' ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return `<div class="cal-head"><button data-cal="-1" aria-label="prev">‹</button><span>${first.toLocaleDateString(getLang(), { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span><button data-cal="1" aria-label="next">›</button></div>
    <div class="cal">${dows.map((x) => `<div class="dow">${x}</div>`).join('')}${cells.join('')}</div>
    <div class="cal-legend"><span><i></i>${t('cal.match')}</span><span><i class="W"></i>${t('cal.win')}</span><span><i class="L"></i>${t('cal.loss')}</span></div>`;
}

function dashboard(c) {
  const ut = userTeam();
  const nm = nextUserMatch();
  const today = seasonDate(S.day - (S.seasonStartDay || 0));
  const offers = (S.offers || []).filter((o) => S.players[o.pid]?.teamId === ut.id);
  const expiring = teamPlayers(ut).filter((p) => p.contractUntil <= S.season && !(S.renewed || []).includes(p.id));
  const pa = primaryAction();
  const daysTo = nm ? nm.day - S.day : null;

  // Trận tiếp theo
  let nextPanel;
  if (S.phase === 'offseason') {
    nextPanel = `${pHead(t('dash.offseasonTitle', { y: S.season }))}<div class="nm-empty"><p>${t('dash.offseasonBody')}</p></div>
      <div class="btn-row"><button class="btn" data-act="training">${t('btn.training')}</button><span></span><button class="btn primary" data-act="newseason">${t('top.newSeason')}</button></div>`;
  } else if (nm) {
    const comp = S.comps[nm.comp];
    const opp = nm.a === ut.id ? nm.b : nm.a;
    const rec = (id) => { const r = recordOf(id); return r ? t('dash.record', r) : esc(S.teams[id].league); };
    nextPanel = `${pHead(t('dash.nextMatch'), `<div class="sub"><b>${esc(compTitle(comp))} ${S.season}</b><br>${t('sch.day', { d: nm.day - (S.seasonStartDay || 0) + 1 })} · ${t('m.bo', { n: nm.bo })}</div>`)}
      <div class="nm-body">
        <div class="nm-team">${badge(ut.id, 'xl')}<b>${esc(ut.name)}</b><span>${rec(ut.id)}</span></div>
        <div class="nm-vs">${ovrTag(teamOvr(ut))} VS ${ovrTag(teamOvr(S.teams[opp]))}</div>
        <div class="nm-team">${badge(opp, 'xl')}<b>${esc(S.teams[opp].name)}</b><span>${rec(opp)}</span></div>
      </div>
      <div class="btn-row"><button class="btn" data-act="training">${t('btn.training')}</button>
        ${pa.act === 'match' ? `<button class="btn" data-act="save">${t('top.save')}</button>` : `<button class="btn" data-act="advance">${t('btn.advance')}</button>`}
        ${pa.act === 'match' ? `<button class="btn primary pulse" data-act="match">${t('btn.play')}</button>` : `<button class="btn primary" data-act="simnext">${t('btn.simNext')}</button>`}</div>`;
  } else {
    nextPanel = `${pHead(t('dash.nextMatch'))}<div class="nm-empty"><p>${t('dash.eliminated')}</p></div>
      <div class="btn-row"><button class="btn" data-act="training">${t('btn.training')}</button><button class="btn" data-act="advance">${t('btn.advance')}</button><button class="btn primary" data-act="simnext">${t('btn.simNext')}</button></div>`;
  }

  // Đội của bạn
  const lp = lineupPlayers(ut);
  const teamPanel = `${pHead(t('dash.yourTeam'), stars(teamOvr(ut)))}
    <div class="yt-row">${badge(ut.id, 'sm')}<b>${esc(ut.short)}</b><span class="muted small">OVR</span>${ovrTag(teamOvr(ut))}<span class="muted small" title="${t('gpr.title')}">GPR</span><b class="gpr-rank">#${gprTable().find((r) => r.team === ut.id)?.rank ?? '-'}</b><button class="btn sm" data-tab-go="roster">${t('btn.manage')}</button></div>
    <div class="yt-players">${lp.map(({ role, p }) => {
      const fs = faceSrc(p);
      return `<div class="yt-p" ${p ? `data-player="${esc(p.id)}"` : ''}>${fs ? `<img src="${fs}" alt="">` : `<span class="ini">${p ? esc(p.ign.slice(0, 2).toUpperCase()) : '—'}</span>`}
        ${p ? ovrTag(p.ovr) : ''}<div class="cap"><small>${t('roleS.' + role)}</small><b>${p ? esc(p.ign) : '—'}</b></div></div>`;
    }).join('')}</div>`;

  // Tiền
  const payroll = teamSalary(ut);
  const moneyPanel = `${pHead(t('dash.money'))}
    <div class="money-big"><span class="${ut.budget < 0 ? 'neg' : ''}">${fullMoney(ut.budget)}</span></div>
    <div class="money-rows"><div><span>${t('fin.payroll')}</span><b>${fullMoney(payroll)}</b></div>
      <div><span>${t('fin.sponsorY')}</span><b>${fullMoney(ut.sponsor)}</b></div>
      <div><span>${t('fin.net')}</span><b class="${ut.sponsor - payroll < 0 ? 'neg' : 'pos'}">${fullMoney(ut.sponsor - payroll)}</b></div></div>
    <button class="btn" data-tab-go="finance">${t('nav.finance')}</button>`;

  // BXH
  const lgs = DB.leagues.map((l) => l.id);
  const hl = lgs.includes(view.homeLg) ? view.homeLg : ut.league;
  const st = standings(currentSplitComp(hl));
  const stPanel = `${pHead(`${leagueBadge(hl, 'sm')} ${t('st.title')}`, `<div class="st-switch"><button data-hl="-1" aria-label="prev">‹</button>${hl}<button data-hl="1" aria-label="next">›</button></div>`)}
    <div class="mini-st">${st.length ? `<table class="tbl"><thead><tr><th>#</th><th>${t('team')}</th><th>${t('st.w')}</th><th>${t('st.l')}</th></tr></thead><tbody>
      ${st.map((r, i) => `<tr class="${r.team === ut.id ? 'me' : ''} ${i < 4 ? 'qual' : ''}"><td>${i + 1}</td><td class="tname">${badge(r.team, 'sm')} ${esc(S.teams[r.team].name)}</td><td>${r.w}</td><td>${r.l}</td></tr>`).join('')}
      </tbody></table>` : `<p class="muted">${t('st.notStarted')}</p>`}</div>`;

  const alerts = [
    ...offers.map((o) => `<div class="alert-row">${badge(o.from, 'sm')}<span class="grow">${t('dash.offerLine', { team: esc(S.teams[o.from].name), player: `<b>${esc(S.players[o.pid].ign)}</b>`, fee: `<b>${money(o.amount)}</b>` })}</span>
      <button class="btn primary sm" data-accept="${o.id}">${t('dash.accept')}</button><button class="btn ghost sm" data-decline="${o.id}">${t('dash.decline')}</button></div>`),
    ...(S.phase === 'offseason' ? expiring.map((p) => `<div class="alert-row">${face(p, 'sm')}<span class="grow">${t('dash.expiringLine', { player: `<b>${esc(p.ign)}</b>` })}</span>
      <button class="btn sm" data-renew="${esc(p.id)}">${t('p.renew')}</button></div>`) : []),
  ];

  // ----- Khu "Central" kiểu FC: ngày, sự kiện, nút Advance, danh sách việc, thẻ tin lớn -----
  let evTitle, evIcon = ICON.invite;
  if (S.phase === 'offseason') { evTitle = t('dash.offseasonTitle', { y: S.season }); evIcon = ICON.contract; }
  else if (nm) {
    const opp = nm.a === ut.id ? nm.b : nm.a;
    evTitle = `${compTitle(S.comps[nm.comp])}<br>${esc(ut.short)} <span class="vs">vs</span> ${esc(S.teams[opp].short)}`;
    if (S.comps[nm.comp].league === 'INTL') evIcon = ICON.trophy;
  } else evTitle = t('dash.noMatchTitle');
  const actions = todayTasks().map((x) => ({ label: taskLabel(x), act: x.kind === 'match' ? 'match' : null, go: ['offers', 'renew'].includes(x.kind) ? 'alerts' : null, tab: TASK_TAB[x.kind] || null }));
  const newsList = S.news.slice(0, 6);
  view.newsIdx = clamp(view.newsIdx || 0, 0, Math.max(newsList.length - 1, 0));
  const ni = newsList[view.newsIdx];

  c.innerHTML = `
  <section class="central">
    <div class="c-left">
      <div class="c-date">${today.toLocaleDateString(getLang(), { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' })}</div>
      <div class="c-next">${S.phase === 'offseason' ? t('phase.offseason') : nm ? (daysTo <= 0 ? t('dash.today') : t('dash.nextIn', { n: daysTo })) : t('dash.noMatch')}</div>
      <div class="c-event"><div class="c-title">${evTitle}</div></div>
      <button class="btn pill c-adv" data-act="${pa.act}">${pa.label}</button>
      <div class="c-tasks-h">${t('task.title')}${actions.length ? ` · ${actions.length}` : ''}</div>
      <div class="c-actions">${actions.length ? '' : `<div class="c-none">${t('task.none')}</div>`}${actions.map((a, i) => `<button class="c-row ${i === 0 ? 'sel' : ''}" ${a.act ? `data-act="${a.act}"` : ''} ${a.tab ? `data-tab-go="${a.tab}"` : ''} ${a.go ? `data-scroll="${a.go}"` : ''}>${a.label}</button>`).join('')}</div>
    </div>
    <div class="c-right">${ni ? socialCard(ni) : ''}
      <div class="dots"><button data-news="-1" aria-label="prev">‹</button>${newsList.map((_, i) => `<i class="${i === view.newsIdx ? 'on' : ''}"></i>`).join('')}<button data-news="1" aria-label="next">›</button></div>
    </div>
  </section>
  ${alerts.length ? `<div class="card alerts" id="alerts">${alerts.join('')}</div>` : ''}
`;
  c.querySelectorAll('[data-news]').forEach((b) => b.onclick = () => { view.newsIdx = (view.newsIdx + +b.dataset.news + newsList.length) % newsList.length; render(); });
  c.querySelectorAll('[data-scroll]').forEach((b) => b.onclick = () => document.getElementById(b.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  c.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => topAction(b.dataset.act));
  c.querySelectorAll('[data-tab-go]').forEach((b) => b.onclick = () => { view.tab = b.dataset.tabGo; render(); });
  c.querySelectorAll('[data-cal]').forEach((b) => b.onclick = () => { view.calOffset = (view.calOffset || 0) + +b.dataset.cal; render(); });
  c.querySelectorAll('[data-hl]').forEach((b) => b.onclick = () => { view.homeLg = lgs[(lgs.indexOf(hl) + +b.dataset.hl + lgs.length) % lgs.length]; render(); });
  c.querySelectorAll('[data-accept]').forEach((b) => b.onclick = () => { acceptOffer(b.dataset.accept); toast(t('tr.done'), 'ok'); render(); });
  c.querySelectorAll('[data-decline]').forEach((b) => b.onclick = () => { S.offers = S.offers.filter((o) => o.id !== b.dataset.decline); render(); });
  bindPlayerLinks(c);
}

function standingsTable(st, hl, compact = false) {
  if (!st.length) return `<p class="muted">${t('st.notStarted')}</p>`;
  return `<table class="tbl standings"><thead><tr><th>${t('st.rank')}</th><th>${t('team')}</th><th>${t('st.w')}</th><th>${t('st.l')}</th>${compact ? '' : `<th>${t('st.diff')}</th><th>${t('st.form')}</th><th>OVR</th>`}</tr></thead><tbody>
    ${st.map((r, i) => `<tr class="${r.team === hl ? 'me' : ''} ${i < 4 ? 'qual' : ''}"><td>${i + 1}</td><td class="tname">${badge(r.team, 'sm')} <span>${esc(compact ? S.teams[r.team].short : S.teams[r.team].name)}</span></td><td>${r.w}</td><td>${r.l}</td>
    ${compact ? '' : `<td>${r.gw - r.gl > 0 ? '+' : ''}${r.gw - r.gl}</td><td>${r.streak.slice(-5).map((x) => `<span class="dot ${x}"></span>`).join('')}</td><td>${ovrTag(teamOvr(S.teams[r.team]))}</td>`}</tr>`).join('')}
  </tbody></table>`;
}

// ---------- Danh sách tuyển thủ dạng dòng ----------
function playerRow(p, extra = '', showTeam = false) {
  return `<div class="list-row prow" data-player="${esc(p.id)}">${face(p, 'sm')}${roleTag(p.role)}
    <div class="grow"><b>${esc(p.ign)}</b> ${p.rookie ? `<em class="tagx">${t('p.rookie')}</em>` : ''} <span class="muted small">${esc(p.name)}</span>
    <div class="muted small">${showTeam ? (p.teamId ? esc(S.teams[p.teamId].short) + ' · ' : t('p.freeAgent') + ' · ') : ''}${t('age')} ${p.age}</div></div>
    <div class="pool-mini">${p.pool.slice(0, 3).map((x) => champIcon(x.c, 24)).join('')}</div>
    ${formArrow(p.form)}${ovrTag(p.ovr)}${extra}</div>`;
}
const formArrow = (f) => `<span class="form ${f > 1 ? 'up' : f < -1 ? 'down' : ''}" title="${t('form')}">${f > 1 ? '▲' : f < -1 ? '▼' : '–'}</span>`;

function bindPlayerLinks(c) {
  c.querySelectorAll('[data-player]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    playerModal(el.dataset.player);
  }));
  c.querySelectorAll('[data-renew]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); renewModal(b.dataset.renew); });
}

// thống kê tích luỹ từ các trận mô phỏng (mùa này + sự nghiệp trong game)
const simLine = (st) => {
  if (!st || !st.g) return null;
  const m = Math.max(st.min || st.g * 30, 1);
  return { g: st.g, wr: st.w / st.g, kda: ((st.k + st.a) / Math.max(st.d, 1)).toFixed(2), cspm: (st.cs / m).toFixed(1), dpm: Math.round((st.dmg || 0) / m), mvp: st.mvp || 0 };
};
function simStatsHtml(p) {
  const rows = [['p.thisSeason', simLine(p.season)], ['p.career', simLine(p.career)]];
  if (!rows.some(([, r]) => r)) return `<p class="muted small">${t('p.noGames')}</p>`;
  return `<table class="tbl sim-st"><thead><tr><th></th><th>${t('p.games')}</th><th>${t('st.wr')}</th><th>KDA</th><th>CS/${t('min')}</th><th>${t('p.dpmS')}</th><th>MVP</th></tr></thead><tbody>
    ${rows.map(([k, r]) => `<tr><td>${t(k)}</td>${r ? `<td>${r.g}</td><td>${pct(r.wr)}</td><td>${r.kda}</td><td>${r.cspm}</td><td>${r.dpm}</td><td>${r.mvp}</td>` : '<td colspan="6" class="muted">—</td>'}</tr>`).join('')}</tbody></table>`;
}

// ---------- Hồ sơ tuyển thủ (dùng cho cả panel đội hình và cửa sổ) ----------
function playerDetail(p) {
  const ut = userTeam();
  const mine = p.teamId === ut.id;
  const rec = p.record;
  const ss = p.season;
  const listed = (S.listed || []).includes(p.id);
  const lineRole = ROLES.find((r) => ut.lineup[r] === p.id);
  const trend = p.form > 1 ? '⏶' : p.form < -1 ? '⏷' : '–';
  const kda = ss.g ? ((ss.k + ss.a) / Math.max(ss.d, 1)).toFixed(2) : '–';
  const cond = Math.round(p.cond ?? 100);
  const traits = traitsOf(p);
  let actions;
  if (mine) {
    actions = `<div class="chips" style="width:100%">${ROLES.map((r) => `<button class="chip sm ${lineRole === r ? 'on' : ''}" data-setrole="${r}">${roleIcon(r)} ${t('roleS.' + r)}</button>`).join('')}</div>
      <button class="btn sm" data-list>${listed ? t('p.unlist') : t('p.sell')}</button><button class="btn sm ghost danger" data-release>${t('p.release')}</button>
      ${p.contractUntil <= S.season && !(S.renewed || []).includes(p.id) ? `<button class="btn sm primary" data-renew="${esc(p.id)}">${t('p.renew')}</button>` : ''}`;
  } else {
    actions = `<button class="btn primary" data-buy>${p.teamId ? t('p.buy') : t('p.sign')}</button>${p.teamId ? `<span class="muted small">${t('p.asking')}: <b style="color:var(--sky)">${money(askingPrice(p))}</b></span>` : ''}`;
  }
  return `
    <div class="pd-head"><div class="grow">
      <div class="pd-top"><span class="o">${p.ovr}</span><span class="sep">|</span><span>${t('roleS.' + p.role)}</span></div>
      <div class="pd-real">${esc(p.name || '')} ${p.native ? '· ' + esc(p.native) : ''}</div>
      <div class="pd-name">${cc(p.country)} ${esc(p.ign)} ${listed ? `<em class="tagx">${t('p.listed')}</em>` : ''}</div></div>
      <div class="pd-photo">${faceSrc(p) ? `<img src="${faceSrc(p)}" alt="${esc(p.ign)}">` : `<span class="ini">${esc(p.ign.slice(0, 2).toUpperCase())}</span>`}
        <span class="pd-club">${p.teamId ? badge(p.teamId, 'md') : `<span class="tagx">${t('p.freeAgent')}</span>`}</span></div></div>
    <div class="pd-meta">
      <div><span>${t('pot')}</span><b class="o">${p.ovr} - ${p.potential}</b></div>
      <div><span>${t('age')}</span><b>${p.age}</b></div>
      <div><span>${t('salary')}</span><b>${money(p.salary)}</b></div>
      <div><span>${t('contract')}</span><b>${p.contractUntil}</b></div>
      <div><span>${t('value')}</span><b>${money(p.value)}</b></div>
    </div>
    <div class="pd-sub" style="margin-top:.4rem">${t('p.attrs')}</div>
    <div class="attr-groups">${Object.entries(ATTR_GROUPS).map(([g, list]) => `<div class="ag ${S.training === g && mine ? 'train' : ''}"><div class="ag-h"><span>${t('grp.' + g)}</span><b class="v-${vClass(groupScore(p, g))}">${groupScore(p, g)}</b></div>
      ${list.map((a) => `<div class="attr-bar" title="${esc(t('ad.' + a))}"><span>${t('attr.' + a)}</span><div class="bar ${a === 'aggression' ? 'style' : ''}"><i class="v-${vClass(p.stats[a])}" style="width:${clamp(p.stats[a], 0, 100)}%"></i></div><b class="v-${vClass(p.stats[a])}">${p.stats[a]}</b></div>`).join('')}</div>`).join('')}</div>
    <div style="height:1.1rem"></div>
    <div class="pd-cols">
      <div><div class="pd-sub">${t('p.summary')}</div>
        <div class="pd-status">
          <div><span>${t('p.cond')}</span><div class="bar ${cond < 60 ? 'low' : ''}"><i style="width:${cond}%"></i></div><b>${cond}</b></div>
          <div><span>${t('p.morale')}</span><div class="bar"><i style="width:${Math.round(p.morale ?? 70)}%"></i></div><b>${Math.round(p.morale ?? 70)}</b></div>
          <div><span>${t('form')}</span><b>${p.form > 0 ? '+' : ''}${p.form.toFixed(1)} ${trend}</b></div>
        </div>
        <div class="pd-sub" style="margin-top:.8rem">${t('p.traits')}</div>
        <div class="traits">${traits.length ? traits.map((x) => `<span class="trait ${BAD_TRAITS.has(x) ? 'bad' : ''}" title="${esc(t('td.' + x))}">${t('trait.' + x)}</span>`).join('') : `<span class="muted small">${t('p.noTraits')}</span>`}</div>
      </div>
      <div><div class="pd-sub">${t('p.pool')}</div>
        <div class="pool">${p.pool.slice(0, 8).map((x) => `<div class="pool-c">${champIcon(x.c, 38)}<span>${x.g} · ${x.g ? pct(x.w / x.g) : '–'}</span></div>`).join('') || '<span class="muted">—</span>'}</div>
        <div class="pd-sub" style="margin-top:1rem">${t('p.simStats')}</div>
        ${simStatsHtml(p)}
      </div>
    </div>
    ${mine ? `<div class="pd-sub" style="margin-top:1.2rem">${t('p.dev')}</div>
      <div class="pd-row2"><span>${t('p.plan')}</span><span class="chips" style="margin:0">${Object.keys(ATTR_GROUPS).map((g) => `<button class="chip sm ${S.training === g ? 'on' : ''}" data-train="${g}">${t('train.' + g)}</button>`).join('')}</span>
      <span>${t('p.progress')}</span><div class="prog-line"><b>${p.ovr}</b><div class="bar"><i style="width:${clamp(((p.ovr - 40) / Math.max(p.potential - 40, 1)) * 100, 4, 100)}%"></i></div><b>${p.potential}</b></div></div>` : ''}
    ${(p.titles || []).length ? `<div class="pd-sub" style="margin-top:1rem">${t('p.titles')}</div><div class="small">${p.titles.map((x) => esc(x)).join(' · ')}</div>` : ''}
    ${(p.awards || []).length ? `<div class="pd-sub" style="margin-top:1rem">${t('p.awards')}</div><div class="small">${p.awards.map((x) => { const [k, ev] = x.split('|'); return `<span class="aw-tag">${t('rec.' + k)}</span> ${esc(ev)}`; }).join(' · ')}</div>` : ''}
    <div class="pd-actions">${actions}</div>`;
}

function bindDetail(root, p, refresh) {
  const ut = userTeam();
  root.querySelector('[data-buy]')?.addEventListener('click', () => offerModal(p.id));
  root.querySelector('[data-list]')?.addEventListener('click', () => {
    const listed = (S.listed || []).includes(p.id);
    S.listed = listed ? S.listed.filter((x) => x !== p.id) : [...(S.listed || []), p.id];
    refresh();
  });
  root.querySelector('[data-release]')?.addEventListener('click', async () => {
    const cost = Math.round(p.salary * 0.5 * Math.max(1, p.contractUntil - S.season + 1));
    if (await confirmBox(t('p.releaseConfirm', { player: p.ign, cost: money(cost) }))) { releasePlayer(p.id); view.selPlayer = null; closeModal(); render(); }
  });
  root.querySelector('[data-renew]')?.addEventListener('click', () => renewModal(p.id));
  root.querySelectorAll('[data-setrole]').forEach((b) => b.onclick = () => {
    const r = b.dataset.setrole;
    const prevRole = ROLES.find((x) => ut.lineup[x] === p.id);
    const displaced = ut.lineup[r];
    if (prevRole) delete ut.lineup[prevRole];
    if (displaced && prevRole && displaced !== p.id) ut.lineup[prevRole] = displaced;
    ut.lineup[r] = p.id;
    refresh();
  });
  root.querySelectorAll('[data-train]').forEach((b) => b.onclick = () => { S.training = b.dataset.train; S.trainingSetDay = S.day; refresh(); });
}

export function playerModal(pid) {
  const p = S.players[pid];
  if (!p) return;
  const m = modal(playerDetail(p), { wide: true });
  bindDetail(m, p, () => { render(); playerModal(pid); });
}

function offerModal(pid) {
  const p = S.players[pid];
  const ask = p.teamId ? askingPrice(p) : 0;
  const m = modal(`<h3>${p.teamId ? t('p.buy') : t('p.sign')}: ${esc(p.ign)}</h3>
    ${p.teamId ? `<p>${t('p.asking')}: <b>${money(ask)}</b> · ${t('top.budget')}: <b>${money(userTeam().budget)}</b></p>
    <label class="field">${t('p.offerAmount')}<input type="number" id="amt" min="0" step="10" value="${ask}"></label>` : `<p>${t('salary')}: <b>${money(Math.round(p.salary * 1.05))}</b></p>`}
    <div class="row end gap"><button class="btn ghost" data-close>${t('common.cancel')}</button><button class="btn primary" data-send>${p.teamId ? t('p.send') : t('p.sign')}</button></div>`);
  m.querySelector('[data-send]').onclick = () => {
    const amt = p.teamId ? Math.max(0, parseInt(m.querySelector('#amt').value, 10) || 0) : 0;
    const r = makeOffer(p.id, amt);
    if (r.ok) { closeModal(); toast(t('tr.done'), 'ok'); render(); } else toast(t(r.reason), 'err');
  };
}

function renewModal(pid) {
  const p = S.players[pid];
  const sal = renewCost(p);
  const m = modal(`<h3>${t('p.renew')}: ${esc(p.ign)}</h3><p>${t('p.renewAsk', { player: esc(p.ign), salary: money(sal) })}</p>
    <div class="row gap">${[1, 2, 3].map((y) => `<button class="btn" data-y="${y}">${t('p.years', { n: y })}</button>`).join('')}</div>`);
  m.querySelectorAll('[data-y]').forEach((b) => b.onclick = () => { renewContract(p.id, sal, +b.dataset.y); closeModal(); toast(t('p.renewed'), 'ok'); render(); });
}

// ---------- Đội hình ----------
function roster(c) {
  const ut = userTeam();
  const lp = lineupPlayers(ut);
  const starterIds = lp.filter((x) => x.p).map((x) => x.p.id);
  const bench = teamPlayers(ut).filter((p) => !starterIds.includes(p.id)).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const rows = [...lp.filter((x) => x.p).map((x) => ({ p: x.p, slot: x.role })), ...bench.map((p) => ({ p, slot: null }))];
  if (!rows.find((r) => r.p.id === view.selPlayer)) view.selPlayer = rows[0]?.p.id;
  const sel = S.players[view.selPlayer];
  const ovr = teamOvr(ut);
  c.innerHTML = `
  <div class="squad-head"><div class="muted">${t('roster.count', { n: ut.roster.length })} · ${t('roster.hint')}</div>
    <div class="lineup-sum">${badge(ut.id, 'md')}<div class="grid">${ROLES.map((r) => `<span class="${ut.lineup[r] ? '' : 'miss'}">${t('roleS.' + r)} ${teamPlayers(ut).filter((p) => p.role === r).length}</span>`).join('')}</div>
      <div class="ring" style="--p:${clamp((ovr - 50) * 2.2, 5, 100)}"><b>${ovr}</b></div><button class="btn sm ghost" data-auto>${t('roster.auto')}</button></div></div>
  <div class="squad">
    <div class="card sq-wrap"><table class="sq-table"><thead><tr><th>${t('role')}</th><th>${t('name')}</th><th class="hide-sm">${t('age')}</th><th>OVR</th><th>${t('pot')}</th><th class="hide-sm">${t('p.cond')}</th><th class="hide-sm">${t('form')}</th><th></th></tr></thead><tbody>
      ${rows.map(({ p, slot }, i) => `<tr class="${p.id === view.selPlayer ? 'sel' : ''} ${i === starterIds.length && i > 0 ? 'sep' : ''}" data-sel="${esc(p.id)}">
        <td>${roleTag(slot || p.role)}</td><td><div class="sq-name">${face(p, 'sm')}${esc(p.ign)}${slot && slot !== p.role ? ` <span class="warn small">${t('roster.offRole')}</span>` : ''}</div></td>
        <td class="hide-sm">${p.age}</td><td><b class="v-${vClass(p.ovr)}">${p.ovr}</b></td>
        <td class="pot"><span class="v-${vClass(p.ovr)}">${p.ovr}</span> - <span class="v-${vClass(p.potential)}">${p.potential}</span></td>
        <td class="hide-sm"><span class="cond-mini ${(p.cond ?? 100) < 60 ? 'low' : ''}"><i style="width:${Math.round(p.cond ?? 100)}%"></i></span></td>
        <td class="hide-sm">${formArrow(p.form)}</td><td><span class="st-tag ${slot ? 'on' : ''}">${slot ? t('roster.starter') : t('roster.sub')}</span></td></tr>`).join('')}
    </tbody></table></div>
    <div class="card" id="detail">${sel ? playerDetail(sel) : ''}</div>
  </div>`;
  c.querySelector('[data-auto]').onclick = () => { autoLineup(ut); render(); };
  c.querySelectorAll('[data-sel]').forEach((tr) => tr.onclick = () => { view.selPlayer = tr.dataset.sel; render(); });
  if (sel) bindDetail(c.querySelector('#detail'), sel, render);
}

// ---------- Lịch thi đấu chung (kiểu trang lịch LoL Esports) ----------
// giờ phát sóng quen thuộc của từng giải (giờ Việt Nam)
const SLOT = { LCK: ['15:00', '17:30'], LPL: ['16:00', '18:00', '20:00'], LEC: ['23:00', '01:00'], LCS: ['05:00', '07:00'], LCP: ['14:00', '16:30'], CBLOL: ['04:00', '06:00'], VCS: ['17:00', '19:00'], INTL: ['14:00', '17:00', '20:00', '23:00'] };
const slotKey = (tm) => { const h = +tm.slice(0, 2); return (h < 9 ? h + 24 : h) * 60 + +tm.slice(3); };
const PHASE_KIND = { kickoff: 'region', fst: 'intl', spring: 'region', msi: 'intl', summer: 'region', worlds: 'intl', offseason: 'off' };
const fmtD = (d, o) => d.toLocaleDateString(getLang(), { timeZone: 'UTC', ...o });
const relDay = (abs) => seasonDate(abs - (S.seasonStartDay || 0));

function schedule(c) {
  const f = view.filters;
  f.schLeagues ??= null; // null = tất cả
  f.schBack ??= 1; f.schFwd ??= 5;
  const all = Object.values(S.comps).filter((x) => x.id.startsWith(`${S.season}-`));
  const lgOf = (comp) => (comp.league === 'INTL' ? 'INTL' : comp.league);
  const shown = (comp) => !f.schLeagues || f.schLeagues.includes(lgOf(comp));
  let ms = all.flatMap((comp) => comp.matches.map((m) => ({ m, comp }))).filter(({ comp, m }) => shown(comp) && (!f.schMine || m.a === S.userTeam || m.b === S.userTeam));
  // giờ thi đấu trong ngày
  const perDay = {};
  for (const x of ms) (perDay[`${x.m.day}|${lgOf(x.comp)}`] ??= []).push(x);
  for (const [k, list] of Object.entries(perDay)) {
    const sl = SLOT[k.split('|')[1]] || SLOT.INTL;
    list.forEach((x, i) => { x.time = sl[i % sl.length]; });
  }
  const days = [...new Set(ms.map((x) => x.m.day))].sort((a, b) => a - b);
  const anchor = f.schDay ?? S.day;
  let ai = days.findIndex((d) => d >= anchor);
  if (ai < 0) ai = days.length - 1;
  const from = Math.max(0, ai - f.schBack), to = Math.min(days.length, ai + f.schFwd);
  const win = days.slice(from, to);
  // thành tích trong giai đoạn vòng tròn (W-L dưới tên đội)
  const recCache = {};
  const rec = (comp, tid) => {
    if (comp.type === 'bracket') return '';
    recCache[comp.id] ??= Object.fromEntries((comp.type === 'swiss' ? comp.teams.map((t) => ({ team: t, w: comp.rec[t][0], l: comp.rec[t][1] })) : standings(comp)).map((r) => [r.team, `${r.w}-${r.l}`]));
    return recCache[comp.id][tid] || '';
  };
  const spoil = f.schSpoil !== false;
  const row = ({ m, comp, time }) => {
    const mine = m.a === S.userTeam || m.b === S.userTeam;
    const score = m.done ? (spoil ? `<b class="${m.winner === m.a ? 'w' : ''}">${m.winsA}</b><i>-</i><b class="${m.winner === m.b ? 'w' : ''}">${m.winsB}</b>` : `<span class="eye">${t('sch.hidden')}</span>`) : '<span class="vs">VS</span>';
    const team = (tid, side) => `<div class="sm-team ${side} ${m.done && spoil && m.winner !== tid ? 'lost' : ''}">${side === 'r' ? badge(tid, 'md') : ''}<span><b>${esc(S.teams[tid].short)}</b><small>${rec(comp, tid)}</small></span>${side === 'l' ? badge(tid, 'md') : ''}</div>`;
    const live = !m.done && m.day === S.day;
    return `<div class="sm-row ${mine ? 'me' : ''} ${live ? 'live' : ''}">
      <div class="sm-main"><span class="sm-time">${live ? `<em class="tagx">${t('sch.today')}</em>` : time}</span>${team(m.a, 'l')}<div class="sm-score">${score}</div>${team(m.b, 'r')}
        <span class="sm-act">${mine && live ? `<button class="btn sm primary" data-act="match">${t('btn.play')}</button>` : ''}</span></div>
      <div class="sm-foot">${leagueBadge(compLogoId(comp), 'xs')}<span class="sf-t">${esc(comp.name)} • ${esc(t('stage.' + comp.stage))}${m.node && !/^P\d$/.test(m.node) ? ` · ${esc(m.node)}` : ''}${m.swiss ? ` · ${m.swiss}` : ''}</span><b>Bo${m.bo}</b></div></div>`;
  };
  const leagues = [...DB.leagues.map((l) => l.id), 'INTL'];
  const head = relDay(anchor);
  const phases = PHASES.filter((p) => p !== 'offseason');
  const curI = PHASES.indexOf(S.phase);
  const gpr = gprTable().slice(0, 5);
  c.innerHTML = `<div class="sch">
    <aside class="sch-side card">${phases.map((p, i) => { const [[m1, d1], [m2, d2]] = PHASE_WINDOW[p];
      return `<div class="sp-item ${i === curI ? 'on' : i < curI ? 'past' : ''}"><small>${t(PHASE_KIND[p] === 'intl' ? 'sch.intl' : 'sch.allRegions')}</small><b>${t('phase.' + p)}</b>
        <span>${fmtD(new Date(Date.UTC(S.season, m1, d1)), { day: '2-digit', month: '2-digit' })} - ${fmtD(new Date(Date.UTC(S.season, m2, d2)), { day: '2-digit', month: '2-digit' })}</span></div>`; }).join('')}</aside>
    <section class="sch-main">
      <div class="sch-top"><div class="sch-date"><small>${fmtD(head, { weekday: 'long' })}</small><b>${fmtD(head, { day: 'numeric', month: 'short' })}</b></div>
        <div class="sch-nav"><button class="btn sm ghost" data-sday="-1" aria-label="prev">‹</button><button class="btn sm" data-stoday>${t('sch.todayBtn')}</button><button class="btn sm ghost" data-sday="1" aria-label="next">›</button></div>
        <div class="sch-filters"><details class="lg-pick"><summary class="btn sm">${f.schLeagues ? t('sch.nLeagues', { n: f.schLeagues.length }) : t('sch.allLeagues')}</summary>
          <div class="lg-menu">${leagues.map((lg) => `<label><input type="checkbox" data-lgf="${lg}" ${!f.schLeagues || f.schLeagues.includes(lg) ? 'checked' : ''}>${leagueBadge(lg === 'INTL' ? 'WORLDS' : lg, 'xs')} ${lg === 'INTL' ? t('sch.intl') : lg}</label>`).join('')}
          <button class="btn sm ghost" data-lgall>${t('sch.allLeagues')}</button></div></details>
          <label class="tg"><input type="checkbox" data-mine ${f.schMine ? 'checked' : ''}> ${t('sch.onlyMine')}</label>
          <label class="tg"><input type="checkbox" data-spoil ${spoil ? 'checked' : ''}> ${t('sch.spoilers')}</label></div></div>
      ${from > 0 ? `<button class="btn ghost wide" data-more="back">${t('sch.loadEarlier')}</button>` : ''}
      ${win.map((d) => {
        const list = ms.filter((x) => x.m.day === d).sort((a, b) => slotKey(a.time) - slotKey(b.time));
        return `<div class="card sch-day ${d === S.day ? 'today' : ''}"><div class="sd-h"><b>${fmtD(relDay(d), { weekday: 'long', day: 'numeric', month: 'short' })}</b>${d === S.day ? `<em class="tagx">${t('sch.today')}</em>` : ''}</div>${list.map(row).join('')}</div>`;
      }).join('') || `<div class="card"><b>${t('sch.none')}</b><p class="muted small">${t('sch.noneHint')}</p></div>`}
      ${to < days.length ? `<button class="btn ghost wide" data-more="fwd">${t('sch.loadMore')}</button>` : `<p class="muted small center">${t('sch.nextStage')}</p>`}
    </section>
    <aside class="sch-right">
      <div class="card"><div class="p-head"><h3>${t('gpr.title')}</h3></div><div class="muted small" style="margin:-.4rem 0 .5rem">${t('gpr.powered')}</div>
        ${gpr.map((r) => `<div class="gr-mini ${r.team === S.userTeam ? 'me' : ''}"><b>${r.rank}</b>${badge(r.team, 'sm')}<span>${esc(S.teams[r.team].short)}</span><small>${r.score}</small></div>`).join('')}
        <button class="link-btn" data-tab-go="power">${t('gpr.viewFull')} ›</button></div>
      <div class="card"><div class="p-head"><h3>${t('dash.news')}</h3></div>${S.news.slice(0, 4).map((n) => `<div class="nw-mini">${esc(newsText(n))}</div>`).join('')}</div>
    </aside></div>`;
  const re = () => schedule(c);
  c.querySelectorAll('[data-sday]').forEach((b) => b.onclick = () => {
    const i = Math.max(0, Math.min(days.length - 1, ai + +b.dataset.sday));
    f.schDay = days[i]; f.schBack = 1; f.schFwd = 5; re();
  });
  c.querySelector('[data-stoday]').onclick = () => { f.schDay = null; f.schBack = 1; f.schFwd = 5; re(); };
  c.querySelectorAll('[data-more]').forEach((b) => b.onclick = () => { if (b.dataset.more === 'back') f.schBack += 4; else f.schFwd += 4; re(); });
  c.querySelector('[data-mine]').onchange = (e) => { f.schMine = e.target.checked; re(); };
  c.querySelector('[data-spoil]').onchange = (e) => { f.schSpoil = e.target.checked; re(); };
  c.querySelectorAll('[data-lgf]').forEach((b) => b.onchange = () => {
    const on = [...c.querySelectorAll('[data-lgf]')].filter((x) => x.checked).map((x) => x.dataset.lgf);
    f.schLeagues = on.length === leagues.length ? null : on;
    re(); c.querySelector('.lg-pick').open = true;
  });
  c.querySelector('[data-lgall]').onclick = () => { f.schLeagues = null; re(); };
  c.querySelectorAll('[data-tab-go]').forEach((b) => b.onclick = () => { view.tab = b.dataset.tabGo; render(); });
  c.querySelectorAll('[data-act=match]').forEach((b) => b.onclick = () => topAction('match'));
  c.querySelector('.sch-day.today')?.scrollIntoView({ block: 'nearest' });
}

// ---------- Kỷ lục & Vinh danh ----------
function records(c) {
  const f = view.filters;
  f.recTab ??= 'hall';
  f.recLg ??= 'all';
  S.hall ??= []; S.records ??= { game: {}, event: {} }; S.evstats ??= {};
  const pn = (w) => (w ? `<b data-player="${esc(w.pid)}" class="plink">${esc(w.ign)}</b>${w.team ? ` <span class="muted small">${esc(w.team)}</span>` : ''}` : '—');
  const ctx = (r) => `<span class="muted small">${esc(r.event)} ${r.season}</span>`;
  const mmss = (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
  const tabs = ['hall', 'events', 'records', 'titles', 'career'];
  const lgOk = (lg) => f.recLg === 'all' || lg === f.recLg;
  let body = '';
  if (f.recTab === 'hall') {
    const list = S.hall.filter((h) => lgOk(h.league));
    body = list.length ? `<div class="scroll-x"><table class="tbl rec-t"><thead><tr><th>${t('rec.event')}</th><th>${t('rec.champ')}</th><th>${t('rec.mvp')}</th><th>${t('rec.fmvp')}</th><th>${t('rec.allpro')}</th><th>${t('rec.rookie')}</th></tr></thead><tbody>
      ${list.map((h) => `<tr><td><span class="row gap">${leagueBadge(h.league === 'INTL' ? (h.event === 'MSI' ? 'MSI' : h.event === 'Worlds' ? 'WORLDS' : 'FST') : h.league, 'xs')}<b>${esc(h.title)}</b> ${h.season}</span></td>
        <td><b>${esc(h.champ)}</b> <span class="muted small">${t('rec.over')} ${esc(h.runner)}</span></td><td>${pn(h.mvp)}</td><td>${pn(h.fmvp)}</td>
        <td class="small">${ROLES.map((r) => h.allpro[r] ? `${t('roleS.' + r)}: ${pn(h.allpro[r])}` : '').filter(Boolean).join('<br>')}</td><td>${pn(h.rookie)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${t('rec.noneYet')}</p>`;
  } else if (f.recTab === 'events') {
    const evs = Object.entries(S.evstats).filter(([, E]) => lgOk(E.league));
    f.recEv = evs.some(([k]) => k === f.recEv) ? f.recEv : evs[0]?.[0];
    const E = S.evstats[f.recEv];
    const rows = E ? Object.entries(E.players).map(([pid, r]) => ({ pid, g: r[0], w: r[1], k: r[2], d: r[3], a: r[4], cs: r[5], dmg: r[6], min: r[8], mvp: r[9] })) : [];
    f.recSort ??= 'kda';
    const key = { kda: (x) => (x.k + x.a) / Math.max(x.d, 1), k: (x) => x.k, a: (x) => x.a, dpm: (x) => x.dmg / Math.max(x.min, 1), cspm: (x) => x.cs / Math.max(x.min, 1), mvp: (x) => x.mvp, g: (x) => x.g }[f.recSort];
    rows.sort((a, b) => key(b) - key(a));
    const th = (k, l) => `<th><button class="th-sort ${f.recSort === k ? 'on' : ''}" data-rsort="${k}">${l}</button></th>`;
    body = `<div class="seg">${evs.map(([k]) => `<button class="chip ${k === f.recEv ? 'on' : ''}" data-rev="${esc(k)}">${esc(k)}</button>`).join('') || `<span class="muted">${t('rec.noneYet')}</span>`}</div>
      ${rows.length ? `<div class="scroll-x"><table class="tbl rec-t"><thead><tr><th>#</th><th>${t('name')}</th>${th('g', t('p.games'))}<th>${t('st.wr')}</th>${th('k', t('rec.k'))}${th('a', t('rec.a'))}${th('kda', 'KDA')}${th('cspm', 'CS/' + t('min'))}${th('dpm', t('p.dpmS'))}${th('mvp', 'MVP')}</tr></thead><tbody>
        ${rows.slice(0, 60).map((x, i) => { const p = S.players[x.pid]; return `<tr class="${p?.teamId === S.userTeam ? 'me' : ''}"><td>${i + 1}</td><td>${p ? `<span class="row gap">${roleTag(E.role?.[x.pid] || p.role)}${pn({ pid: x.pid, ign: p.ign, team: p.teamId ? S.teams[p.teamId].short : '' })}</span>` : '?'}</td>
          <td>${x.g}</td><td>${pct(x.w / x.g)}</td><td>${x.k}</td><td>${x.a}</td><td>${key === undefined ? '' : ((x.k + x.a) / Math.max(x.d, 1)).toFixed(2)}</td><td>${(x.cs / Math.max(x.min, 1)).toFixed(1)}</td><td>${Math.round(x.dmg / Math.max(x.min, 1))}</td><td>${x.mvp}</td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
  } else if (f.recTab === 'records') {
    const G = S.records.game, E = S.records.event;
    const card = (label, r, fmt = (v) => v, champ = true) => `<div class="rec-card"><small>${label}</small><b>${r ? fmt(r.v) : '—'}</b>${r ? `<div>${r.ign ? pn(r) : esc(r.teams)}${champ && r.champ ? ` · ${esc(cname(r.champ))}` : ''}</div>${ctx(r)}` : ''}</div>`;
    body = `<h3>${t('rec.single')}</h3><div class="rec-grid">
      ${card(t('rec.mostKills'), G.kills)}${card(t('rec.mostAssists'), G.assists)}${card(t('rec.mostCs'), G.cs)}${card(t('rec.mostDmg'), G.dmg, (v) => (v / 1000).toFixed(1) + 'K')}${card(t('rec.mostGold'), G.gold, (v) => (v / 1000).toFixed(1) + 'K')}
      ${card(t('rec.longest'), G.longest, mmss, false)}${card(t('rec.shortest'), G.shortest, mmss, false)}${card(t('rec.bloodiest'), G.bloodiest, (v) => v, false)}</div>
      <h3>${t('rec.inEvent')}</h3><div class="rec-grid">${card(t('rec.evKills'), E.kills)}${card(t('rec.evKda'), E.kda)}${card(t('rec.evMvps'), E.mvps)}</div>`;
  } else if (f.recTab === 'titles') {
    const teams = Object.values(S.teams).map((tm) => ({ tm, n: tm.trophies.length, intl: tm.trophies.filter((x) => /^(MSI|Worlds|First Stand)/.test(x)).length })).filter((x) => x.n).sort((a, b) => b.intl - a.intl || b.n - a.n).slice(0, 20);
    const ppl = Object.values(S.players).map((p) => {
      const aw = p.awards || [];
      const cnt = (k) => aw.filter((x) => x.startsWith(k + '|')).length;
      return { p, titles: (p.titles || []).length, mvp: cnt('mvp'), fmvp: cnt('fmvp'), allpro: cnt('allpro') };
    }).filter((x) => x.titles || x.mvp || x.fmvp || x.allpro).sort((a, b) => b.mvp * 3 + b.fmvp * 2 + b.titles - (a.mvp * 3 + a.fmvp * 2 + a.titles)).slice(0, 25);
    body = `<div class="two"><div><h3>${t('rec.teamTitles')}</h3><table class="tbl rec-t"><thead><tr><th>${t('team')}</th><th>${t('rec.titles')}</th><th>${t('rec.intlTitles')}</th></tr></thead><tbody>
      ${teams.map((x) => `<tr class="${x.tm.id === S.userTeam ? 'me' : ''}"><td class="row gap">${badge(x.tm.id, 'sm')} ${esc(x.tm.name)}</td><td>${x.n}</td><td>${x.intl}</td></tr>`).join('') || `<tr><td colspan="3" class="muted">${t('rec.noneYet')}</td></tr>`}</tbody></table></div>
      <div><h3>${t('rec.playerTitles')}</h3><table class="tbl rec-t"><thead><tr><th>${t('name')}</th><th>${t('rec.titles')}</th><th>MVP</th><th>${t('rec.fmvpS')}</th><th>All-Pro</th></tr></thead><tbody>
      ${ppl.map((x) => `<tr class="${x.p.teamId === S.userTeam ? 'me' : ''}"><td>${pn({ pid: x.p.id, ign: x.p.ign, team: x.p.teamId ? S.teams[x.p.teamId].short : '' })}</td><td>${x.titles}</td><td>${x.mvp}</td><td>${x.fmvp}</td><td>${x.allpro}</td></tr>`).join('') || `<tr><td colspan="5" class="muted">${t('rec.noneYet')}</td></tr>`}</tbody></table></div></div>`;
  } else {
    const ps = Object.values(S.players).filter((p) => p.career && p.career.g && !p.retired && lgOk(p.teamId ? S.teams[p.teamId].league : ''));
    const top = (fn, min = 0) => ps.filter((p) => p.career.g >= min).sort((a, b) => fn(b) - fn(a)).slice(0, 10);
    const box = (label, list, fn, fmt = (v) => v) => `<div class="rec-card list"><small>${label}</small>${list.map((p, i) => `<div class="rl"><span>${i + 1}</span>${pn({ pid: p.id, ign: p.ign, team: p.teamId ? S.teams[p.teamId].short : '' })}<b>${fmt(fn(p))}</b></div>`).join('') || '—'}</div>`;
    body = `<div class="rec-grid">${box(t('rec.cKills'), top((p) => p.career.k), (p) => p.career.k)}${box(t('rec.cGames'), top((p) => p.career.g), (p) => p.career.g)}
      ${box(t('rec.cWins'), top((p) => p.career.w), (p) => p.career.w)}${box(t('rec.cKda'), top((p) => (p.career.k + p.career.a) / Math.max(p.career.d, 1), 20), (p) => (p.career.k + p.career.a) / Math.max(p.career.d, 1), (v) => v.toFixed(2))}
      ${box(t('rec.cMvp'), top((p) => p.career.mvp), (p) => p.career.mvp)}</div>`;
  }
  c.innerHTML = `<div class="gpr-hero rec-hero"><h1>${t('rec.title')}</h1><p>${t('rec.sub')}</p></div>
    <div class="row between wrap gap"><div class="seg">${tabs.map((k) => `<button class="chip ${f.recTab === k ? 'on' : ''}" data-rtab="${k}">${t('rec.tab.' + k)}</button>`).join('')}</div>
      <select data-rlg><option value="all">${t('gpr.allLeagues')}</option>${[...DB.leagues.map((l) => l.id), 'INTL'].map((l) => `<option value="${l}" ${f.recLg === l ? 'selected' : ''}>${l === 'INTL' ? t('sch.intl') : l}</option>`).join('')}</select></div>
    <div class="card rec-body">${body}</div>`;
  c.querySelectorAll('[data-rtab]').forEach((b) => b.onclick = () => { f.recTab = b.dataset.rtab; records(c); });
  c.querySelectorAll('[data-rev]').forEach((b) => b.onclick = () => { f.recEv = b.dataset.rev; records(c); });
  c.querySelectorAll('[data-rsort]').forEach((b) => b.onclick = () => { f.recSort = b.dataset.rsort; records(c); });
  c.querySelector('[data-rlg]').onchange = (e) => { f.recLg = e.target.value; records(c); };
  bindPlayerLinks(c);
}

// ---------- Bảng xếp hạng sức mạnh toàn cầu ----------
const ordn = (n) => (getLang() === 'vi' ? `#${n}` : `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`);
function power(c) {
  const f = view.filters;
  const g = S.gpr;
  const snaps = g.snaps.map((sn, i) => ({ i, sn })).filter((x) => x.sn.season === S.season);
  const sel = f.gprSnap ?? null;
  const rows = gprTable(sel).filter((r) => !f.gprLeague || r.league === f.gprLeague);
  const lgs = leagueStrength();
  const ev = (key, place) => `<span class="gp-ev ${place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : ''} ${place ? '' : 'none'}">${leagueBadge(key, 'xs') || `<i>${key === 'FST' ? 'FS' : key[0]}</i>`}<b>${place ? ordn(place) : '-'}</b></span>`;
  const label = sel == null ? t('gpr.current') : t('gpr.after', { phase: t('phase.' + g.snaps[sel].phase) });
  const upd = sel == null ? relDay(S.day) : relDay(g.snaps[sel].day);
  c.innerHTML = `<div class="gpr-hero"><h1>${t('gpr.title')}</h1><p>${t('gpr.powered')}</p><span class="gp-season">${S.season}</span></div>
  <div class="gpr-grid">
    <div class="card gpr-main">
      <div class="gp-head"><div><select data-snap><option value="">${t('gpr.current')}</option>${snaps.map((x) => `<option value="${x.i}" ${sel === x.i ? 'selected' : ''}>${t('gpr.after', { phase: t('phase.' + x.sn.phase) })}</option>`).join('')}</select>
          <div class="muted small">${t('gpr.updated')}: ${fmtD(upd, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${esc(label)}</div></div>
        <select data-glg><option value="">${t('gpr.allLeagues')}</option>${DB.leagues.map((l) => `<option ${f.gprLeague === l.id ? 'selected' : ''}>${l.id}</option>`).join('')}</select></div>
      <div class="scroll-x"><table class="tbl gpr-t"><thead><tr><th>#</th><th>${t('team')}</th><th>${t('gpr.score')}</th><th>${t('gpr.wl')}</th><th>${t('gpr.intl')}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.team === S.userTeam ? 'me' : ''}"><td class="gp-rank"><b>${r.rank}</b>${r.delta ? `<span class="${r.delta > 0 ? 'up' : 'down'}">${r.delta > 0 ? '▲' : '▼'}${Math.abs(r.delta)}</span>` : ''}</td>
        <td><div class="gp-team">${badge(r.team, 'md')}<span><b>${esc(S.teams[r.team].short)}</b><small>${r.league}</small></span></div></td>
        <td class="gp-score">${t('gpr.pts', { n: r.score })}</td>
        <td>${r.wl[0]}-${r.wl[1]} <span class="muted">(${(r.wl[0] / Math.max(1, r.wl[0] + r.wl[1])).toFixed(3).replace(/^0/, '')})</span></td>
        <td><div class="gp-evs">${ev('FST', r.intl.fst)}${ev('MSI', r.intl.msi)}${ev('WORLDS', r.intl.worlds)}</div></td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <aside class="card gpr-side"><h3>${t('gpr.what')}</h3><p class="muted small">${t('gpr.whatText')}</p>
      <div class="gp-box"><h4>${t('gpr.teamPerf')}</h4>
        ${['context', 'recent', 'exec', 'opp'].map((k) => `<div class="gp-f"><b>${t('gpr.f.' + k)}</b><span>${t('gpr.fd.' + k)}</span></div>`).join('')}</div>
      <div class="gp-box"><h4>${t('gpr.regional')}</h4>${lgs.map((x) => `<div class="gp-lg">${leagueBadge(x.lg, 'xs')}<b>${x.lg}:</b> ${x.v}</div>`).join('')}
        <div class="gp-f"><b>${t('gpr.f.intl')}</b><span>${t('gpr.fd.intl')}</span></div></div>
      <p class="muted small">${t('gpr.formula')}</p></aside>
  </div>`;
  c.querySelector('[data-snap]').onchange = (e) => { f.gprSnap = e.target.value === '' ? null : +e.target.value; power(c); };
  c.querySelector('[data-glg]').onchange = (e) => { f.gprLeague = e.target.value || null; power(c); };
}

// ---------- Bảng xếp hạng ----------
// nhánh đấu: cột theo vòng, nhánh thắng ở trên, nhánh thua ở dưới; trận chưa xác định đội hiện "Chờ"
function bracketHtml(comp) {
  if (!comp.nodes) return '';
  const cols = Math.max(...comp.nodes.map((n) => n.col)) + 1;
  const hasLo = comp.nodes.some((n) => n.lo);
  const seedName = (sv) => (typeof sv === 'number' ? (comp.seeds[sv - 1] ? null : `#${sv}`) : t(sv[0] === 'W' ? 'br.winner' : 'br.loser', { m: sv.slice(2) }));
  const cell = (n) => {
    const m = comp.matches.find((x) => x.id === comp.mk[n.k]);
    const row = (tid, w, sv) => tid ? `<div class="b-team ${m && m.done && m.winner === tid ? 'win' : ''} ${tid === S.userTeam ? 'me' : ''}">${badge(tid, 'sm')}<span>${esc(S.teams[tid].short)}</span><b>${m && m.games.length ? w : ''}</b></div>`
      : `<div class="b-team tbd"><span>${esc(seedName(sv) || '?')}</span></div>`;
    const a = m ? m.a : (typeof n.a === 'number' ? comp.seeds[n.a - 1] : null);
    const b = m ? m.b : (typeof n.b === 'number' ? comp.seeds[n.b - 1] : null);
    return `<div class="b-match ${n.k === 'GF' || n.k === 'F' ? 'final' : ''}"><div class="b-k">${esc(n.k)}${m ? ` · Bo${m.bo}` : ''}</div>${row(a, m ? m.winsA : 0, n.a)}${row(b, m ? m.winsB : 0, n.b)}</div>`;
  };
  const lane = (lo) => `<div class="bracket">${Array.from({ length: cols }, (_, ci) => {
    const ns = comp.nodes.filter((n) => n.col === ci && !!n.lo === lo);
    return `<div class="b-round">${ns.map(cell).join('')}</div>`;
  }).join('')}</div>`;
  return `${hasLo ? `<div class="b-lbl">${t('br.upper')}</div>` : ''}${lane(false)}${hasLo ? `<div class="b-lbl">${t('br.lower')}</div>${lane(true)}` : ''}`;
}
function swissHtml(comp) {
  const rows = comp.teams.map((tm) => ({ tm, r: comp.rec[tm] })).sort((x, y) => y.r[0] - x.r[0] || x.r[1] - y.r[1]);
  const st = (r) => (r[0] >= 3 ? 'adv' : r[1] >= 3 ? 'out' : '');
  return `<div class="swiss">${rows.map(({ tm, r }) => `<div class="sw-row ${st(r)} ${tm === S.userTeam ? 'me' : ''}">${badge(tm, 'sm')}<span>${esc(S.teams[tm].short)}</span><b>${r[0]}-${r[1]}</b></div>`).join('')}</div>
    <div class="muted small" style="margin-top:.5rem">${t('st.swissHint')}</div>`;
}
function leagueHtml(comp) {
  if (!comp.groups || comp.groups.length <= 1) return standingsTable(standings(comp), S.userTeam);
  // LCK Cup: điểm nhóm (thắng Bo3 = 1, thắng Super Week Bo5 = 2)
  const pts = [0, 0];
  if (comp.cross) for (const m of comp.matches) if (m.done) pts[comp.groups[0].teams.includes(m.winner) ? 0 : 1] += m.superWeek ? 2 : 1;
  return `<div class="groups">${comp.groups.map((g, gi) => `<div><h4>${g.name ? esc(g.name) : t('st.group', { g: 'ABCD'[gi] })}${comp.cross ? ` · ${t('st.points', { n: pts[gi] })}` : ''}${comp.winnersGroup != null ? ` · ${t(comp.winnersGroup === gi ? 'st.winnersGroup' : 'st.losersGroup')}` : ''}</h4>${standingsTable(standings(comp, gi), S.userTeam, true)}</div>`).join('')}</div>`;
}

function standingsTab(c) {
  const lg = view.filters.stLeague || userTeam().league;
  const y = S.season;
  const comps = Object.values(S.comps).filter((x) => x.id.startsWith(y + '-') && (x.league === lg || (lg === 'INTL' && x.league === 'INTL')));
  const tabs = [...DB.leagues.map((l) => l.id), 'INTL'];
  c.innerHTML = `<div class="seg">${tabs.map((x) => `<button class="chip row gap ${x === lg ? 'on' : ''}" data-lg="${x}">${leagueBadge(x, 'xs')}${x === 'INTL' ? 'First Stand / MSI / Worlds' : x}</button>`).join('')}</div>
    <div class="card fmt-card"><b>${t('fmt.title')}</b><p class="muted small">${t('fmt.' + lg)}</p></div>
    ${comps.length ? [...comps].reverse().map((comp) => {
      const title = `<span class="row gap">${leagueBadge(compLogoId(comp), 'sm')} ${esc(compTitle(comp))} ${y}</span>`;
      const tag = comp.done ? `<span class="muted small">${t('st.done')}</span>` : `<em class="tagx">${t('st.live')}</em>`;
      if (comp.type === 'league') return `<div class="card">${pHead(title, tag)}${leagueHtml(comp)}</div>`;
      if (comp.type === 'swiss') return `<div class="card">${pHead(title, tag)}${swissHtml(comp)}</div>`;
      if (comp.type === 'groups') return '';
      return `<div class="card">${pHead(title, tag)}${bracketHtml(comp)}</div>`;
    }).join('') : `<p class="muted">${t('st.notStarted')}</p>`}`;
  c.querySelectorAll('[data-lg]').forEach((b) => b.onclick = () => { view.filters.stLeague = b.dataset.lg; render(); });
}

// ---------- Chuyển nhượng (thẻ) ----------
function transfers(c) {
  const f = view.filters;
  f.trRole ??= 'all'; f.trLeague ??= 'all'; f.trSort ??= 'ovr'; f.trQ ??= ''; f.trPage ??= 0;
  const q = f.trQ.toLowerCase();
  let list = Object.values(S.players).filter((p) => !p.retired && p.teamId !== S.userTeam && (p.teamId || S.freeAgents.includes(p.id)));
  if (f.trRole !== 'all') list = list.filter((p) => p.role === f.trRole);
  if (f.trLeague === 'FA') list = list.filter((p) => !p.teamId);
  else if (f.trLeague !== 'all') list = list.filter((p) => p.teamId && S.teams[p.teamId].league === f.trLeague);
  if (q) list = list.filter((p) => p.ign.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.teamId || '').toLowerCase().includes(q));
  const key = { ovr: (p) => -p.ovr, pot: (p) => -p.potential, val: (p) => -(p.teamId ? askingPrice(p) : p.value), age: (p) => p.age }[f.trSort];
  list.sort((a, b) => key(a) - key(b));
  const per = 12;
  const pages = Math.max(1, Math.ceil(list.length / per));
  f.trPage = clamp(f.trPage, 0, pages - 1);
  const shown = list.slice(f.trPage * per, f.trPage * per + per);
  const card = (p, i) => {
    const rank = f.trPage * per + i + 1;
    const rec = simLine(p.season) || simLine(p.career);
    const price = p.teamId ? askingPrice(p) : p.salary;
    return `<div class="pcard" data-player="${esc(p.id)}">
      <div class="pc-top"><span class="pc-rank ${rank <= 3 ? 'r' + rank : ''}">${rank}</span>${face(p, 'md', 'sq')}
        <div class="pc-id"><b>${esc(p.ign)}</b> <span class="age">- ${p.age}</span><div>${cc(p.country)} OVR ${p.ovr} / POT ${p.potential}</div></div>
        <div class="pc-role">${roleIcon(p.role)}<span>${p.teamId ? esc(S.teams[p.teamId].short) : t('p.freeAgent')}</span></div></div>
      <div class="pc-price">${p.teamId ? '' : '<span class="small muted">' + t('salary') + '</span>'}${money(price)}</div>
      <div class="pc-sub">${rec ? `${rec.g} ${t('p.games').toLowerCase()} · ${pct(rec.wr)}` : `<span class="muted">${p.rookie ? t('p.rookie') : '—'}</span>`}</div>
      <div class="pc-bot"><div class="st"><b>${rec ? rec.cspm : '–'}</b><small>CS/${t('min')}</small></div>
        <button class="btn primary sm" data-offer="${esc(p.id)}">${p.teamId ? t('tr.offer') : t('p.sign')}</button>
        <div class="st"><b>${rec ? rec.kda : '–'}</b><small>KDA</small></div></div></div>`;
  };
  c.innerHTML = `<div class="card">
    <div class="mk-head"><h3>${t('tr.title')}</h3>
      <div class="mk-tools"><button class="icon-btn ${f.trRole === 'all' ? 'on' : ''}" data-role="all">${t('tr.all')}</button>${ROLES.map((r) => `<button class="icon-btn ${f.trRole === r ? 'on' : ''}" data-role="${r}" title="${t('role.' + r)}">${roleIcon(r)}</button>`).join('')}</div>
      <div class="pager">${t('tr.players', { n: list.length, p: f.trPage + 1, pages })}<button data-page="-1" ${f.trPage === 0 ? 'disabled' : ''} aria-label="prev">‹</button><button data-page="1" ${f.trPage >= pages - 1 ? 'disabled' : ''} aria-label="next">›</button></div></div>
    <div class="row between wrap" style="margin-bottom:1rem">
      <div class="seg" style="margin:0">${['all', ...DB.leagues.map((l) => l.id), 'FA'].map((x) => `<button class="chip ${f.trLeague === x ? 'on' : ''}" data-lg="${x}">${x === 'all' ? t('tr.all') : x === 'FA' ? t('tr.free') : x}</button>`).join('')}</div>
      <div class="row gap"><input type="search" placeholder="${t('tr.search')}" value="${esc(f.trQ)}" data-q>
        <select data-sort>${['ovr', 'pot', 'val', 'age'].map((s) => `<option value="${s}" ${f.trSort === s ? 'selected' : ''}>${t('tr.sort' + s[0].toUpperCase() + s.slice(1))}</option>`).join('')}</select></div></div>
    <div class="mk-grid">${shown.map(card).join('') || `<p class="muted">—</p>`}</div>
    <p class="muted small" style="margin:1rem 0 0">${t('top.budget')}: <b style="color:var(--text)">${money(userTeam().budget)}</b> · ${t('roster.count', { n: userTeam().roster.length })}</p></div>`;
  c.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => { f.trRole = b.dataset.role; f.trPage = 0; render(); });
  c.querySelectorAll('[data-lg]').forEach((b) => b.onclick = () => { f.trLeague = b.dataset.lg; f.trPage = 0; render(); });
  c.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => { f.trPage += +b.dataset.page; render(); });
  c.querySelector('[data-sort]').onchange = (e) => { f.trSort = e.target.value; f.trPage = 0; render(); };
  c.querySelector('[data-q]').oninput = debounce((e) => { f.trQ = e.target.value; f.trPage = 0; render(); const i = document.querySelector('[data-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
  c.querySelectorAll('[data-offer]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); offerModal(b.dataset.offer); });
  bindPlayerLinks(c);
}
function debounce(fn, ms) { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }

// ---------- Tướng & Meta ----------
function metaTab(c) {
  const f = view.filters;
  f.mRole ??= 'all'; f.mQ ??= '';
  const tierOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  let list = DB.champList.filter((x) => f.mRole === 'all' || x.roles.includes(f.mRole));
  if (f.mQ) { const q = f.mQ.toLowerCase(); list = list.filter((x) => x.name.toLowerCase().includes(q) || x.nameVi.toLowerCase().includes(q)); }
  list.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.presence - a.presence);
  c.innerHTML = `<div class="card">
  <div class="mk-head"><h3>${t('meta.title')}</h3>
    <div class="mk-tools"><button class="icon-btn ${f.mRole === 'all' ? 'on' : ''}" data-r="all">${t('tr.all')}</button>${ROLES.map((r) => `<button class="icon-btn ${f.mRole === r ? 'on' : ''}" data-r="${r}" title="${t('role.' + r)}">${roleIcon(r)}</button>`).join('')}
    <input type="search" placeholder="${t('meta.search')}" value="${esc(f.mQ)}" data-q></div></div>
  <p class="muted small">${t('meta.desc', { games: DB.meta.gamesAnalyzed, patch: DB.meta.proPatch })}</p>
  <div class="scroll-x"><table class="tbl meta"><thead><tr><th>${t('meta.tier')}</th><th></th><th>${t('name')}</th><th>${t('role')}</th><th>${t('meta.presence')}</th><th>${t('meta.picks')}</th><th>${t('meta.bans')}</th><th>${t('meta.wr')}</th><th>${t('meta.build')}</th></tr></thead><tbody>
  ${list.map((x) => `<tr><td><span class="tier t-${x.tier}">${x.tier}</span></td><td>${champIcon(x.id, 36)}</td><td><b>${esc(cname(x.id))}</b><div class="muted small">${esc(getLang() === 'vi' ? x.titleVi : x.title)}</div></td>
    <td>${x.roles.map(roleTag).join(' ')}</td><td>${pct(x.presence)}</td><td>${x.picks}</td><td>${x.bans}</td><td>${x.picks ? pct(x.wr) : '-'}</td>
    <td class="build">${x.build.slice(0, 5).map((i) => DB.items[i] ? `<img loading="lazy" src="${itemImg(i)}" width="24" height="24" alt="${esc(iname(i))}" title="${esc(iname(i))}">` : '').join('')}</td></tr>`).join('')}
  </tbody></table></div></div>`;
  c.querySelector('[data-q]').oninput = debounce((e) => { f.mQ = e.target.value; render(); const i = document.querySelector('[data-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
  c.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { f.mRole = b.dataset.r; render(); });
}

// ---------- Thế giới ----------
function world(c) {
  const ranks = Object.values(S.teams).map((x) => ({ id: x.id, ovr: teamOvr(x) })).sort((a, b) => b.ovr - a.ovr).slice(0, 20);
  const pls = Object.values(S.players).filter((p) => p.teamId && p.season.g >= 3);
  const leader = (fn, n = 5) => [...pls].sort((a, b) => fn(b) - fn(a)).slice(0, n);
  const kda = (p) => (p.season.k + p.season.a) / Math.max(p.season.d, 1);
  c.innerHTML = `
  <div class="two">
    <div class="card">${pHead(t('world.powerRank'))}<table class="tbl"><tbody>${ranks.map((r, i) => `<tr class="${r.id === S.userTeam ? 'me' : ''}"><td>${i + 1}</td><td class="tname">${badge(r.id, 'sm')} ${esc(S.teams[r.id].name)}</td><td>${leagueBadge(S.teams[r.id].league, 'xs')}</td><td>${ovrTag(r.ovr)}</td></tr>`).join('')}</tbody></table></div>
    <div>
      <div class="card">${pHead(t('world.history'))}${S.history.length ? S.history.slice(0, 30).map((h) => `<div class="list-row">${badge(h.champ, 'sm')}<span class="grow"><b>${esc(S.teams[h.champ].name)}</b></span><span class="muted small">${esc(h.title)}</span></div>`).join('') : `<p class="muted">${t('world.noHistory')}</p>`}</div>
      <div class="card">${pHead(t('world.leaders'))}
        <h4>${t('p.kda')}</h4>${leader(kda).map((p) => playerRow(p, `<b>${kda(p).toFixed(2)}</b>`, true)).join('') || '<p class="muted">—</p>'}
        <h4>${t('p.mvp')}</h4>${leader((p) => p.season.mvp).map((p) => playerRow(p, `<b>${p.season.mvp}</b>`, true)).join('') || '<p class="muted">—</p>'}
      </div>
    </div>
  </div>`;
  bindPlayerLinks(c);
}

// ---------- Tài chính ----------
function finance(c) {
  const ut = userTeam();
  c.innerHTML = `
  <div class="card stats-mini">
    <div><span class="muted small">${t('fin.balance')}</span><b class="${ut.budget < 0 ? 'neg' : ''}">${fullMoney(ut.budget)}</b></div>
    <div><span class="muted small">${t('fin.payroll')}</span><b>${fullMoney(teamSalary(ut))}</b></div>
    <div><span class="muted small">${t('fin.sponsorY')}</span><b>${fullMoney(ut.sponsor)}</b></div>
  </div>
  <div class="two">
  <div class="card">${pHead(t('fin.log'))}${S.finance.filter((f) => f.amount).slice(0, 60).map((f) => `<div class="list-row"><span class="grow">${esc(t(f.key, f.params || {}))}</span><span class="muted small">${t('season', { y: f.season })}</span><b class="${f.amount < 0 ? 'neg' : 'pos'}">${f.amount > 0 ? '+' : ''}${money(f.amount)}</b></div>`).join('') || '<p class="muted">—</p>'}</div>
  <div class="card">${pHead(t('fin.contracts'))}<table class="tbl"><thead><tr><th>${t('player')}</th><th>${t('role')}</th><th>${t('salary')}</th><th>${t('contract')}</th><th>${t('value')}</th></tr></thead><tbody>
    ${teamPlayers(ut).map((p) => `<tr data-player="${esc(p.id)}" class="clickable"><td class="tname">${face(p, 'xs')} ${esc(p.ign)}</td><td>${roleTag(p.role)}</td><td>${money(p.salary)}</td><td>${p.contractUntil}</td><td>${money(p.value)}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
  bindPlayerLinks(c);
}

export { PHASES, clamp };
