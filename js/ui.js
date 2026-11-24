import { DB, champImg, itemImg, teamLogo, leagueLogo, playerFace, isDarkLogo } from './data.js';
import { t, cname, iname, getLang, setLang } from './i18n.js';
import {
  S, setState, newGame, team, player, userTeam, teamPlayers, teamSalary, teamOvr, autoLineup, lineupPlayers,
  addNews, saveGame, listSaves, loadSave, deleteSave, exportSave, importSave,
} from './state.js';
import {
  PHASES, startPhase, standings, advanceDay, userMatchToday, nextUserMatch, allPhaseMatches, leagueTeams,
  startNewSeason, makeOffer, acceptOffer, releasePlayer, renewCost, renewContract, askingPrice, seasonDate, setAutoSave, progressComps,
} from './season.js';
import { ROLES, ATTRS, esc, money, clamp } from './util.js';
import { openMatchDay } from './match.js';

const app = () => document.getElementById('app');
export const view = { screen: 'menu', tab: 'dashboard', filters: {} };

// ---------------- Thành phần dùng chung ----------------
export function badge(teamId, size = 'md') {
  const tm = S ? S.teams[teamId] : null;
  const src = tm || DB.teams[teamId] || { short: '?', name: teamId };
  const h = tm ? tm.hue : [...(src.name || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
  const logo = teamLogo(teamId);
  if (logo) return `<span class="badge badge-${size} logo ${isDarkLogo(logo) ? 'on-light' : ''}" title="${esc(src.name || src.display)}"><img src="${logo}" alt="${esc(src.short || '')}" loading="lazy"></span>`;
  return `<span class="badge badge-${size}" style="--h:${h}" title="${esc(src.name)}">${esc(src.short || '?')}</span>`;
}
export function leagueBadge(id, size = 'sm') {
  const src = leagueLogo(id === 'INTL' ? 'WORLDS' : id);
  if (!src) return '';
  return `<span class="lg-logo lg-${size} ${isDarkLogo(src) ? 'on-light' : ''}" title="${esc(id)}"><img src="${src}" alt="${esc(id)}" loading="lazy"></span>`;
}
// mini face tuyển thủ; không có ảnh thì dùng chữ cái đầu
export function face(p, size = 'md') {
  if (!p) return `<span class="face face-${size} none"></span>`;
  const src = playerFace(p.id);
  if (src) return `<span class="face face-${size}"><img src="${src}" alt="${esc(p.ign)}" loading="lazy"></span>`;
  return `<span class="face face-${size} none">${esc((p.ign || '?').slice(0, 2).toUpperCase())}</span>`;
}
export const champIcon = (id, size = 32, extra = '') => id
  ? `<img class="champ" loading="lazy" src="${champImg(id)}" width="${size}" height="${size}" alt="${esc(cname(id))}" title="${esc(cname(id))}" ${extra}>`
  : `<span class="champ empty" style="width:${size}px;height:${size}px"></span>`;
export const roleTag = (r) => `<span class="role role-${r}" title="${t('role.' + r)}">${t('roleS.' + r)}</span>`;
export const ovrTag = (v) => `<span class="ovr ${v >= 88 ? 'o-s' : v >= 80 ? 'o-a' : v >= 72 ? 'o-b' : v >= 64 ? 'o-c' : 'o-d'}">${v}</span>`;
const flag = (c) => c ? `<span class="muted small">${esc(c)}</span>` : '';
const pct = (x) => `${Math.round(x * 100)}%`;

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
    <button class="${l === 'vi' ? 'on' : ''}" data-lang="vi">🇻🇳 VI</button>
    <button class="${l === 'en' ? 'on' : ''}" data-lang="en">🇬🇧 EN</button></div>`;
}
function bindLang(root) {
  root.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => { setLang(b.dataset.lang); render(); });
}

export const compTitle = (c) => (c.league === 'INTL' ? t('phase.' + c.phase) : `${c.name} ${t('phase.' + c.phase)}`);

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
  app().innerHTML = `
  <div class="menu-screen">
    <div class="menu-top">${langSwitch()}</div>
    <div class="menu-hero">
      <div class="logo">RIFT<span>MANAGER</span></div>
      <div class="tag"><span class="beta">${t('app.beta')}</span> ${t('app.tagline')}</div>
    </div>
    <div class="menu-cards">
      ${saves.length ? `<button class="menu-card accent" data-act="continue"><b>${t('menu.continue')}</b><span>${esc(saves[0].manager)} · ${esc(saves[0].team)} · ${t('season', { y: saves[0].season })}</span></button>` : ''}
      <button class="menu-card" data-act="new"><b>${t('menu.new')}</b><span>${t('menu.newDesc')}</span></button>
      <button class="menu-card" data-act="load"><b>${t('menu.load')}</b><span>${t('menu.loadDesc')}</span></button>
      <button class="menu-card disabled" disabled><b>${t('menu.multiplayer')} <em class="soon">${t('menu.soon')}</em></b><span>—</span></button>
      <button class="menu-card small" data-act="about"><b>${t('menu.about')}</b></button>
    </div>
    <div class="menu-foot muted small">${t('menu.dataInfo', { teams: Object.keys(DB.teams).length, players: Object.keys(DB.players).length, patch: m.proPatch, games: m.gamesAnalyzed })}</div>
  </div>`;
  bindLang(app());
  app().querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'continue') { loadSave(saves[0].slot); startGameUI(); }
    else go(a === 'new' ? 'new' : a, { newLeague: null, newTeam: null });
  });
}

function renderAbout() {
  app().innerHTML = `<div class="page narrow"><button class="btn ghost" data-back>${t('menu.back')}</button>
    <h1>${t('about.title')}</h1><p>${t('about.body')}</p><p class="muted small">${t('about.riot')}</p>
    <p class="muted small">Data Dragon ${esc(DB.meta.ddragon)} · ${esc(DB.meta.generated.slice(0, 10))}</p></div>`;
  app().querySelector('[data-back]').onclick = () => go('menu');
}

function renderLoad() {
  const saves = listSaves();
  app().innerHTML = `<div class="page narrow"><button class="btn ghost" data-back>${t('menu.back')}</button>
    <h1>${t('load.title')}</h1>
    <div class="list">${saves.length ? saves.map((s) => `
      <div class="list-row">
        ${badge(s.team)}<div class="grow"><b>${s.slot === 'auto' ? t('load.slot.auto') : t('load.slot', { n: s.slot })}</b>
        <div class="muted small">${esc(s.manager)} · ${esc(s.team)} · ${t('season', { y: s.season })} · ${t('phase.' + s.phase)} · ${new Date(s.savedAt).toLocaleString(getLang())}</div></div>
        <button class="btn primary" data-load="${esc(s.slot)}">${t('load.load')}</button>
        <button class="btn ghost danger" data-del="${esc(s.slot)}">${t('load.delete')}</button>
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
function difficulty(ovr, lg) {
  const all = Object.keys(DB.teams).filter((x) => DB.teams[x].league === lg).map((x) => previewTeam(x).ovr).sort((a, b) => b - a);
  const rank = all.indexOf(ovr);
  const f = rank / Math.max(all.length - 1, 1);
  return f < 0.25 ? 'easy' : f < 0.55 ? 'normal' : f < 0.8 ? 'hard' : 'vhard';
}

function renderNew() {
  const lg = view.newLeague;
  const leagues = DB.leagues;
  let body;
  if (!lg) {
    body = `<h1>${t('new.chooseLeague')}</h1><div class="grid cards">${leagues.map((L) => {
      const n = Object.values(DB.teams).filter((x) => x.league === L.id).length;
      return `<button class="league-card" data-lg="${L.id}"><div class="row gap">${leagueBadge(L.id, 'lg')}<b>${L.id}</b></div><span>${esc(L.name)}</span><span class="muted small">${esc(L.region)} · ${t('new.teams', { n })}</span>
        <div class="bar"><i style="width:${L.strength * 100}%"></i></div></button>`;
    }).join('')}</div>`;
  } else {
    const ids = Object.keys(DB.teams).filter((x) => DB.teams[x].league === lg).sort((a, b) => previewTeam(b).ovr - previewTeam(a).ovr);
    const sel = view.newTeam || ids[0];
    view.newTeam = sel;
    const pv = previewTeam(sel);
    body = `<button class="btn ghost" data-backlg>← ${t('new.chooseLeague')}</button><h1 class="row gap">${leagueBadge(lg, 'md')} ${t('new.chooseTeam')} — ${lg}</h1>
    <div class="new-layout">
      <div class="team-pick">${ids.map((id) => {
        const p = previewTeam(id);
        return `<button class="team-row ${id === sel ? 'on' : ''}" data-team="${esc(id)}">${badge(id)}<span class="grow">${esc(p.tm.display || id)}</span>${ovrTag(p.ovr)}</button>`;
      }).join('')}</div>
      <div class="card team-preview">
        <div class="row gap">${badge(sel, 'lg')}<div><h2>${esc(pv.tm.display || sel)}</h2><div class="muted">${esc(pv.tm.location || '')} · HLV ${esc(pv.tm.coach || '—')}</div></div></div>
        <div class="kv">
          <div><span>${t('new.strength')}</span>${ovrTag(pv.ovr)}</div>
          <div><span>${t('new.budget')}</span><b>${money(pv.tm.budget)}</b></div>
          <div><span>${t('new.salary')}</span><b>${money(pv.salary)}</b></div>
          <div><span>${t('new.difficulty')}</span><b>${t('diff.' + difficulty(pv.ovr, lg))}</b></div>
        </div>
        <table class="tbl"><tbody>${pv.ps.map((p) => `<tr><td>${face({ id: p.link, ign: p.ign }, 'sm')}</td><td>${roleTag(p.role)}</td><td><b>${esc(p.ign)}</b> <span class="muted small">${esc(p.name || '')}</span></td><td>${(p.pool || []).slice(0, 3).map((c) => champIcon(c.c, 22)).join('')}</td><td>${ovrTag(p.ovr)}</td></tr>`).join('')}</tbody></table>
        <label class="field">${t('new.manager')}<input id="mgr" maxlength="24" placeholder="${t('new.managerPh')}" value="${esc(view.mgr || '')}"></label>
        <button class="btn primary big" data-start>${t('new.start')}</button>
      </div>
    </div>`;
  }
  app().innerHTML = `<div class="page"><div class="row between"><button class="btn ghost" data-menu>${t('menu.back')}</button>${langSwitch()}</div>${body}</div>`;
  const r = app();
  bindLang(r);
  r.querySelector('[data-menu]').onclick = () => go('menu');
  r.querySelectorAll('[data-lg]').forEach((b) => b.onclick = () => { view.newLeague = b.dataset.lg; view.newTeam = null; render(); });
  r.querySelector('[data-backlg]')?.addEventListener('click', () => { view.newLeague = null; render(); });
  r.querySelectorAll('[data-team]').forEach((b) => b.onclick = () => { view.mgr = r.querySelector('#mgr').value; view.newTeam = b.dataset.team; render(); });
  r.querySelector('[data-start]')?.addEventListener('click', () => {
    const name = r.querySelector('#mgr').value.trim() || (getLang() === 'vi' ? 'HLV' : 'Coach');
    newGame({ teamId: view.newTeam, manager: name });
    startPhase('split1');
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
  view.tab = 'dashboard';
  go('game');
}

// ---------------- Màn hình chính trong game ----------------
const TABS = ['dashboard', 'roster', 'schedule', 'standings', 'transfers', 'meta', 'world', 'finance'];
const TAB_ICON = { dashboard: '🏠', roster: '👥', schedule: '📅', standings: '📊', transfers: '🔁', meta: '🧙', world: '🌍', finance: '💰' };

function newsText(n) {
  const p = {};
  for (const [k, v] of Object.entries(n.params || {})) p[k] = v && v.$t ? t(v.$t) : (k === 'fee' ? money(v) : v);
  return t(n.key, p);
}

function renderGame() {
  const ut = userTeam();
  const um = userMatchToday();
  const date = seasonDate(S.day - (S.seasonStartDay || 0));
  const action = S.phase === 'offseason'
    ? `<button class="btn primary" data-act="newseason">${t('top.newSeason')}</button>`
    : um ? `<button class="btn primary pulse" data-act="match">${t('top.toMatch')}</button>`
      : `<button class="btn ghost" data-act="simnext" title="${t('top.simWeek')}">⏩</button><button class="btn primary" data-act="advance">${t('top.continue')}</button>`;
  app().innerHTML = `
  <div class="game">
    <header class="topbar">
      <div class="row gap tb-team">${badge(ut.id)}<div><b>${esc(ut.name)}</b><div class="muted small row gap">${leagueBadge(ut.league, 'xs')} ${esc(S.manager)} · ${ut.league}</div></div></div>
      <div class="tb-info"><div><span class="muted small">${t('season', { y: S.season })}</span><b>${t('phase.' + S.phase)}</b></div>
        <div><span class="muted small">${date.toLocaleDateString(getLang(), { day: '2-digit', month: '2-digit' })}</span><b class="${ut.budget < 0 ? 'neg' : ''}">${money(ut.budget)}</b></div></div>
      <div class="row gap tb-actions">${langSwitch()}<button class="btn ghost" data-act="save">💾 ${t('top.save')}</button><button class="btn ghost" data-act="menu">☰</button>${action}</div>
    </header>
    <nav class="sidenav">${TABS.map((x) => `<button class="${view.tab === x ? 'on' : ''}" data-tab="${x}"><span>${TAB_ICON[x]}</span><em>${t('nav.' + x)}</em></button>`).join('')}</nav>
    <main class="content" id="content"></main>
  </div>`;
  const r = app();
  bindLang(r);
  r.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { view.tab = b.dataset.tab; render(); });
  r.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => topAction(b.dataset.act));
  const c = r.querySelector('#content');
  ({ dashboard, roster, schedule, standingsTab, transfers, metaTab, world, finance })[tabFn(view.tab)](c);
}
const tabFn = (x) => ({ standings: 'standingsTab', meta: 'metaTab' }[x] || x);

async function topAction(a) {
  if (a === 'save') {
    const m = modal(`<h2>${t('top.save')}</h2><div class="list">${[1, 2, 3].map((n) => `<button class="btn" data-slot="${n}">${t('load.slot', { n })}</button>`).join('')}</div>
      <hr><button class="btn ghost" data-export>⬇ ${t('set.export')}</button>`);
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
    openMatchDay(userMatchToday(), () => { progressComps(); saveGame('auto'); render(); });
  } else if (a === 'newseason') {
    startNewSeason();
    S.seasonStartDay = S.day;
    saveGame('auto');
    view.tab = 'dashboard';
    render();
  }
}

// ---------- Tổng quan ----------
function dashboard(c) {
  const ut = userTeam();
  const nm = nextUserMatch();
  const lg = ut.league;
  const split = S.phase === 'split2' || S.phase === 'playoffs2' ? 'split2' : 'split1';
  const st = standings(S.comps[`${S.season}-${split}-${lg}`]);
  const myRank = st.findIndex((r) => r.team === ut.id) + 1;
  const recent = allPhaseMatches().concat(...Object.values(S.comps).filter((x) => !S.phaseComps.includes(x.id)).map((x) => x.matches))
    .filter((m) => m.done && (m.a === ut.id || m.b === ut.id)).sort((a, b) => b.day - a.day).slice(0, 5);
  const offers = (S.offers || []).filter((o) => S.players[o.pid]?.teamId === ut.id);
  const expiring = teamPlayers(ut).filter((p) => p.contractUntil <= S.season && !(S.renewed || []).includes(p.id));
  let next = '';
  if (S.phase === 'offseason') {
    next = `<div class="card hl"><h2>${t('dash.offseasonTitle', { y: S.season })}</h2><p>${t('dash.offseasonBody')}</p></div>`;
  } else if (nm) {
    const opp = nm.a === ut.id ? nm.b : nm.a;
    const comp = S.comps[nm.comp];
    next = `<div class="card hl next-match">
      <div class="muted small">${t('dash.nextMatch')} · ${compTitle(comp)} · ${t('m.bo', { n: nm.bo })} · ${t('sch.day', { d: nm.day - (S.seasonStartDay || 0) + 1 })}</div>
      <div class="vs-line">${badge(ut.id, 'lg')}<div class="vs-mid"><b>${ovrTag(teamOvr(ut))}</b><span>VS</span><b>${ovrTag(teamOvr(S.teams[opp]))}</b></div>${badge(opp, 'lg')}</div>
      <div class="vs-names"><span>${esc(ut.name)}</span><span>${esc(S.teams[opp].name)}</span></div>
    </div>`;
  } else {
    next = `<div class="card"><p class="muted">${t('dash.eliminated')}</p></div>`;
  }
  c.innerHTML = `
  <div class="dash">
    <div class="col">
      ${next}
      ${offers.length ? `<div class="card"><h3>${t('dash.offers')}</h3>${offers.map((o) => `<div class="list-row">${badge(o.from)}<span class="grow">${t('dash.offerLine', { team: esc(S.teams[o.from].name), player: `<b>${esc(S.players[o.pid].ign)}</b>`, fee: `<b>${money(o.amount)}</b>` })}</span>
        <button class="btn primary sm" data-accept="${o.id}">${t('dash.accept')}</button><button class="btn ghost sm" data-decline="${o.id}">${t('dash.decline')}</button></div>`).join('')}</div>` : ''}
      ${S.phase === 'offseason' && expiring.length ? `<div class="card"><h3>${t('dash.expiring')}</h3>${expiring.map((p) => playerRow(p, `<button class="btn sm" data-renew="${esc(p.id)}">${t('p.renew')}</button>`)).join('')}</div>` : ''}
      <div class="card"><h3>${t('dash.news')}</h3><div class="news">${S.news.slice(0, 14).map((n) => `<div class="${n.important ? 'imp' : ''}">${newsText(n)}</div>`).join('')}</div></div>
    </div>
    <div class="col">
      <div class="card stats-mini">
        <div><span class="muted small">${t('dash.teamOvr')}</span>${ovrTag(teamOvr(ut))}</div>
        <div><span class="muted small">${t('dash.standing')} (${lg})</span><b>${myRank ? '#' + myRank : '—'}</b></div>
        <div><span class="muted small">${t('dash.board')}</span><b class="small">${t(S.goal || 'goal.playoffs')}</b></div>
      </div>
      <div class="card"><h3 class="row gap">${leagueBadge(lg, 'sm')} ${lg} ${t('phase.' + split)}</h3>${standingsTable(st, ut.id, true)}</div>
      <div class="card"><h3>${t('dash.lastResults')}</h3>${recent.length ? recent.map(resultRow).join('') : '<p class="muted">—</p>'}</div>
      ${ut.trophies.length ? `<div class="card"><h3>${t('dash.trophies')}</h3>${ut.trophies.map((x) => `<div>🏆 ${esc(x)}</div>`).join('')}</div>` : ''}
    </div>
  </div>`;
  c.querySelectorAll('[data-accept]').forEach((b) => b.onclick = () => { acceptOffer(b.dataset.accept); toast(t('tr.done'), 'ok'); render(); });
  c.querySelectorAll('[data-decline]').forEach((b) => b.onclick = () => { S.offers = S.offers.filter((o) => o.id !== b.dataset.decline); render(); });
  bindPlayerLinks(c);
}

function resultRow(m) {
  const ut = S.userTeam;
  const opp = m.a === ut ? m.b : m.a;
  const my = m.a === ut ? m.winsA : m.winsB, their = m.a === ut ? m.winsB : m.winsA;
  const win = m.winner === ut;
  return `<div class="list-row"><span class="wl ${win ? 'w' : 'l'}">${win ? t('common.win') : t('common.loss')}</span>${badge(opp, 'sm')}<span class="grow">${esc(S.teams[opp].name)}</span><b>${my}-${their}</b><span class="muted small">${S.comps[m.comp]?.name || ''}</span></div>`;
}

function standingsTable(st, hl, compact = false) {
  if (!st.length) return `<p class="muted">${t('st.notStarted')}</p>`;
  return `<table class="tbl standings"><thead><tr><th>${t('st.rank')}</th><th>${t('team')}</th><th>${t('st.w')}</th><th>${t('st.l')}</th>${compact ? '' : `<th>${t('st.diff')}</th><th>${t('st.form')}</th><th>OVR</th>`}</tr></thead><tbody>
    ${st.map((r, i) => `<tr class="${r.team === hl ? 'me' : ''} ${i < 4 ? 'qual' : ''}"><td>${i + 1}</td><td class="tname">${badge(r.team, 'sm')} <span>${esc(compact ? S.teams[r.team].short : S.teams[r.team].name)}</span></td><td>${r.w}</td><td>${r.l}</td>
    ${compact ? '' : `<td>${r.gw - r.gl > 0 ? '+' : ''}${r.gw - r.gl}</td><td>${r.streak.slice(-5).map((x) => `<span class="dot ${x}"></span>`).join('')}</td><td>${ovrTag(teamOvr(S.teams[r.team]))}</td>`}</tr>`).join('')}
  </tbody></table>`;
}

// ---------- Đội hình ----------
function playerRow(p, extra = '', showTeam = false) {
  return `<div class="list-row prow" data-player="${esc(p.id)}">${face(p, 'sm')}${roleTag(p.role)}
    <div class="grow"><b>${esc(p.ign)}</b> ${p.rookie ? `<em class="tagx">${t('p.rookie')}</em>` : ''} <span class="muted small">${esc(p.name)}</span>
    <div class="muted small">${showTeam ? (p.teamId ? esc(S.teams[p.teamId].short) + ' · ' : t('p.freeAgent') + ' · ') : ''}${t('age')} ${p.age} · ${flag(p.country)}</div></div>
    <div class="pool-mini">${p.pool.slice(0, 3).map((x) => champIcon(x.c, 24)).join('')}</div>
    ${formArrow(p.form)}${ovrTag(p.ovr)}${extra}</div>`;
}
const formArrow = (f) => `<span class="form ${f > 1 ? 'up' : f < -1 ? 'down' : ''}" title="${t('form')}">${f > 1 ? '▲' : f < -1 ? '▼' : '•'}</span>`;

function bindPlayerLinks(c) {
  c.querySelectorAll('[data-player]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    playerModal(el.dataset.player);
  }));
  c.querySelectorAll('[data-renew]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); renewModal(b.dataset.renew); });
}

function roster(c) {
  const ut = userTeam();
  const lp = lineupPlayers(ut);
  const starters = new Set(Object.values(ut.lineup));
  const bench = teamPlayers(ut).filter((p) => !starters.has(p.id));
  c.innerHTML = `
  <div class="row between wrap"><h1>${t('nav.roster')} <span class="muted small">${t('roster.count', { n: ut.roster.length })}</span></h1>
    <div class="row gap"><span class="muted">${t('dash.teamOvr')}</span>${ovrTag(teamOvr(ut))}<button class="btn ghost" data-auto>${t('roster.auto')}</button></div></div>
  <div class="lineup">${lp.map(({ role, p }) => `
    <div class="slot card ${p ? '' : 'empty'}" data-slot="${role}" ${p ? `data-player="${esc(p.id)}"` : ''}>
      <div class="slot-role">${roleTag(role)}</div>
      ${p ? `${face(p, 'lg')}<div class="slot-ign">${esc(p.ign)}</div>${p.role !== role ? `<div class="warn small">${t('roster.offRole')}</div>` : ''}
      <div class="slot-ovr">${ovrTag(p.ovr)} ${formArrow(p.form)}</div><div class="pool-mini">${p.pool.slice(0, 3).map((x) => champIcon(x.c, 26)).join('')}</div>`
    : `<div class="muted">${t('roster.empty')}</div>`}
    </div>`).join('')}</div>
  <div class="two">
    <div class="card"><h3>${t('roster.bench')}</h3>${bench.length ? bench.map((p) => playerRow(p, `<button class="btn sm" data-starter="${esc(p.id)}">${t('roster.setStarter')}</button>`)).join('') : '<p class="muted">—</p>'}</div>
    <div class="card"><h3>${t('roster.training')}</h3><p class="muted small">${t('roster.trainingDesc')}</p>
      <div class="chips">${ATTRS.map((a) => `<button class="chip ${S.training === a ? 'on' : ''}" data-train="${a}">${t('attr.' + a)}</button>`).join('')}</div></div>
  </div>`;
  c.querySelector('[data-auto]').onclick = () => { autoLineup(ut); render(); };
  c.querySelectorAll('[data-train]').forEach((b) => b.onclick = () => { S.training = b.dataset.train; render(); });
  c.querySelectorAll('[data-starter]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const p = S.players[b.dataset.starter];
    const m = modal(`<h3>${t('roster.setStarter')}: ${esc(p.ign)}</h3><div class="chips">${ROLES.map((r) => `<button class="chip ${r === p.role ? 'on' : ''}" data-r="${r}">${t('role.' + r)}${ut.lineup[r] ? ` (${esc(S.players[ut.lineup[r]].ign)})` : ''}</button>`).join('')}</div>`);
    m.querySelectorAll('[data-r]').forEach((x) => x.onclick = () => {
      for (const r of ROLES) if (ut.lineup[r] === p.id) delete ut.lineup[r];
      ut.lineup[x.dataset.r] = p.id;
      closeModal();
      render();
    });
  });
  bindPlayerLinks(c);
}

// ---------- Hồ sơ tuyển thủ ----------
export function playerModal(pid) {
  const p = S.players[pid];
  if (!p) return;
  const ut = userTeam();
  const mine = p.teamId === ut.id;
  const rec = p.record;
  const ss = p.season;
  const listed = (S.listed || []).includes(p.id);
  let actions = '';
  if (mine) {
    actions = `<button class="btn" data-list>${listed ? t('p.unlist') : t('p.sell')}</button><button class="btn ghost danger" data-release>${t('p.release')}</button>
      ${p.contractUntil <= S.season + (S.phase === 'offseason' ? 0 : 0) && !(S.renewed || []).includes(p.id) ? `<button class="btn primary" data-renew="${esc(p.id)}">${t('p.renew')}</button>` : ''}`;
  } else {
    actions = `<button class="btn primary" data-buy>${p.teamId ? t('p.buy') : t('p.sign')}</button>`;
  }
  const m = modal(`
    <div class="pm-head">${face(p, 'xl')}
      <div class="grow"><h2>${esc(p.ign)} ${listed ? `<em class="tagx">${t('p.listed')}</em>` : ''}</h2>
      <div class="muted">${esc(p.name)} ${p.native ? '· ' + esc(p.native) : ''}</div>
      <div class="muted small row gap">${roleTag(p.role)} ${p.teamId ? badge(p.teamId, 'sm') + ' ' + esc(S.teams[p.teamId].name) : t('p.freeAgent')} · ${t('age')} ${p.age} · ${esc(p.country)}</div></div>
      <div class="pm-ovr">${ovrTag(p.ovr)}<span class="muted small">${t('pot')} ${p.potential}</span></div></div>
    <div class="two">
      <div>${ATTRS.map((a) => `<div class="attr"><span>${t('attr.' + a)}</span><div class="bar"><i style="width:${p.stats[a]}%"></i></div><b>${p.stats[a]}</b></div>`).join('')}
        <div class="kv small">
          <div><span>${t('salary')}</span><b>${money(p.salary)}</b></div><div><span>${t('value')}</span><b>${money(p.value)}</b></div>
          <div><span>${t('contract')}</span><b>${p.contractUntil}</b></div><div><span>${t('form')}</span><b>${p.form > 0 ? '+' : ''}${p.form.toFixed(1)}</b></div>
          ${p.teamId && !mine ? `<div><span>${t('p.asking')}</span><b>${money(askingPrice(p))}</b></div>` : ''}
        </div></div>
      <div><h4>${t('p.pool')}</h4><div class="pool">${p.pool.slice(0, 8).map((x) => `<div class="pool-c">${champIcon(x.c, 36)}<span class="small">${x.g}${t('p.games').slice(0, 1).toLowerCase()} · ${x.g ? pct(x.w / x.g) : '-'}</span></div>`).join('') || '<span class="muted">—</span>'}</div>
        ${rec ? `<h4>${t('p.real')}</h4><div class="kv small">
          <div><span>${t('p.games')}</span><b>${p.realGames}</b></div><div><span>${t('p.wr')}</span><b>${pct(rec.wr)}</b></div>
          <div><span>${t('p.kda')}</span><b>${rec.kda}</b></div><div><span>${t('p.cspm')}</span><b>${rec.cspm}</b></div>
          <div><span>${t('p.dpm')}</span><b>${rec.dpm}</b></div><div><span>${t('p.gpm')}</span><b>${rec.gpm}</b></div></div>` : ''}
        <h4>${t('p.seasonStats')}</h4><div class="kv small">
          <div><span>${t('p.games')}</span><b>${ss.g}</b></div><div><span>${t('p.wr')}</span><b>${ss.g ? pct(ss.w / ss.g) : '-'}</b></div>
          <div><span>${t('p.kda')}</span><b>${ss.g ? ((ss.k + ss.a) / Math.max(ss.d, 1)).toFixed(2) : '-'}</b></div><div><span>${t('p.mvp')}</span><b>${ss.mvp}</b></div></div>
        ${(p.titles || []).length ? `<h4>${t('p.titles')}</h4>${p.titles.map((x) => `<div class="small">🏆 ${esc(x)}</div>`).join('')}` : ''}
      </div>
    </div>
    <div class="row end gap">${actions}</div>`, { wide: true });
  m.querySelector('[data-buy]')?.addEventListener('click', () => offerModal(p.id));
  m.querySelector('[data-list]')?.addEventListener('click', () => {
    S.listed = S.listed || [];
    S.listed = listed ? S.listed.filter((x) => x !== p.id) : [...S.listed, p.id];
    playerModal(p.id);
  });
  m.querySelector('[data-release]')?.addEventListener('click', async () => {
    const cost = Math.round(p.salary * 0.5 * Math.max(1, p.contractUntil - S.season + 1));
    if (await confirmBox(t('p.releaseConfirm', { player: p.ign, cost: money(cost) }))) { releasePlayer(p.id); render(); }
  });
  m.querySelector('[data-renew]')?.addEventListener('click', () => renewModal(p.id));
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

// ---------- Lịch thi đấu ----------
function schedule(c) {
  const only = view.filters.schMine !== false;
  const ms = allPhaseMatches().filter((m) => !only || m.a === S.userTeam || m.b === S.userTeam).sort((a, b) => a.day - b.day);
  const byDay = {};
  for (const m of ms) (byDay[m.day] ??= []).push(m);
  c.innerHTML = `<div class="row between wrap"><h1>${t('sch.title')} — ${t('phase.' + S.phase)}</h1>
    <label class="row gap small"><input type="checkbox" data-mine ${only ? 'checked' : ''}> ${t('sch.onlyMine')}</label></div>
    ${Object.entries(byDay).map(([d, list]) => `<div class="card"><h4>${t('sch.day', { d: d - (S.seasonStartDay || 0) + 1 })} ${+d === S.day ? `<em class="tagx">${t('sch.today')}</em>` : ''}</h4>
      ${list.map((m) => `<div class="list-row match-row ${m.a === S.userTeam || m.b === S.userTeam ? 'me' : ''}"><span class="muted small w60">${S.comps[m.comp].name}</span>
        <span class="tm right">${esc(S.teams[m.a].short)} ${badge(m.a, 'sm')}</span>
        <b class="score">${m.done ? `${m.winsA} - ${m.winsB}` : t('m.bo', { n: m.bo })}</b>
        <span class="tm">${badge(m.b, 'sm')} ${esc(S.teams[m.b].short)}</span></div>`).join('')}</div>`).join('') || `<p class="muted">${t('dash.noMatch')}</p>`}`;
  c.querySelector('[data-mine]').onchange = (e) => { view.filters.schMine = e.target.checked; render(); };
}

// ---------- Bảng xếp hạng ----------
function bracketHtml(comp) {
  return `<div class="bracket">${comp.rounds.map((r) => `<div class="b-round">${r.map((id) => {
    const m = comp.matches.find((x) => x.id === id);
    const row = (tid, w) => `<div class="b-team ${m.done && m.winner === tid ? 'win' : ''} ${tid === S.userTeam ? 'me' : ''}">${badge(tid, 'sm')}<span>${esc(S.teams[tid].short)}</span><b>${m.games.length ? w : ''}</b></div>`;
    return `<div class="b-match">${row(m.a, m.winsA)}${row(m.b, m.winsB)}</div>`;
  }).join('')}</div>`).join('')}</div>`;
}

function standingsTab(c) {
  const lg = view.filters.stLeague || userTeam().league;
  const y = S.season;
  const comps = Object.values(S.comps).filter((x) => x.id.startsWith(y + '-') && (x.league === lg || (lg === 'INTL' && x.league === 'INTL')));
  const tabs = [...DB.leagues.map((l) => l.id), 'INTL'];
  c.innerHTML = `<h1>${t('st.title')} — ${t('season', { y })}</h1>
    <div class="chips">${tabs.map((x) => `<button class="chip row gap ${x === lg ? 'on' : ''}" data-lg="${x}">${leagueBadge(x, 'xs')}${x === 'INTL' ? 'MSI / Worlds' : x}</button>`).join('')}</div>
    ${comps.length ? comps.map((comp) => {
      const title = `${leagueBadge(comp.league === 'INTL' ? (comp.phase === 'msi' ? 'MSI' : 'WORLDS') : comp.league, 'sm')} ${compTitle(comp)}`;
      if (comp.type === 'league') return `<div class="card"><h3>${title}</h3>${standingsTable(standings(comp), S.userTeam)}</div>`;
      if (comp.type === 'groups') return `<div class="card"><h3>${title}</h3><div class="groups">${comp.groups.map((_, gi) => `<div><h4>${t('st.group', { g: 'ABCD'[gi] })}</h4>${standingsTable(standings(comp, gi), S.userTeam, true)}</div>`).join('')}</div></div>`;
      return `<div class="card"><h3>${title} — ${t('st.bracket')}</h3>${bracketHtml(comp)}</div>`;
    }).join('') : `<p class="muted">${t('st.notStarted')}</p>`}`;
  c.querySelectorAll('[data-lg]').forEach((b) => b.onclick = () => { view.filters.stLeague = b.dataset.lg; render(); });
}

// ---------- Chuyển nhượng ----------
function transfers(c) {
  const f = view.filters;
  f.trRole ??= 'all'; f.trLeague ??= 'all'; f.trSort ??= 'ovr'; f.trQ ??= '';
  const q = f.trQ.toLowerCase();
  let list = Object.values(S.players).filter((p) => !p.retired && p.teamId !== S.userTeam && (p.teamId || S.freeAgents.includes(p.id)));
  if (f.trRole !== 'all') list = list.filter((p) => p.role === f.trRole);
  if (f.trLeague === 'FA') list = list.filter((p) => !p.teamId);
  else if (f.trLeague !== 'all') list = list.filter((p) => p.teamId && S.teams[p.teamId].league === f.trLeague);
  if (q) list = list.filter((p) => p.ign.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.teamId || '').toLowerCase().includes(q));
  const key = { ovr: (p) => -p.ovr, pot: (p) => -p.potential, val: (p) => -p.value, age: (p) => p.age }[f.trSort];
  list.sort((a, b) => key(a) - key(b));
  const total = list.length;
  list = list.slice(0, 80);
  c.innerHTML = `<div class="row between wrap"><h1>${t('tr.title')}</h1><div><span class="muted">${t('top.budget')}:</span> <b>${money(userTeam().budget)}</b> · ${t('roster.count', { n: userTeam().roster.length })}</div></div>
    <div class="filters">
      <input type="search" placeholder="${t('tr.search')}" value="${esc(f.trQ)}" data-q>
      <select data-f="trRole"><option value="all">${t('meta.allRoles')}</option>${ROLES.map((r) => `<option value="${r}" ${f.trRole === r ? 'selected' : ''}>${t('role.' + r)}</option>`).join('')}</select>
      <select data-f="trLeague"><option value="all">${t('tr.all')}</option><option value="FA" ${f.trLeague === 'FA' ? 'selected' : ''}>${t('tr.free')}</option>${DB.leagues.map((l) => `<option value="${l.id}" ${f.trLeague === l.id ? 'selected' : ''}>${l.id}</option>`).join('')}</select>
      <select data-f="trSort">${['ovr', 'pot', 'val', 'age'].map((s) => `<option value="${s}" ${f.trSort === s ? 'selected' : ''}>${t('tr.sort' + s[0].toUpperCase() + s.slice(1))}</option>`).join('')}</select>
    </div>
    <p class="muted small">${t('tr.showing', { n: list.length, total })}</p>
    <div class="card">${list.map((p) => playerRow(p, `<span class="price">${p.teamId ? money(askingPrice(p)) : t('p.freeAgent')}</span>`, true)).join('')}</div>`;
  c.querySelector('[data-q]').oninput = debounce((e) => { f.trQ = e.target.value; render(); const i = document.querySelector('[data-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
  c.querySelectorAll('[data-f]').forEach((s) => s.onchange = () => { f[s.dataset.f] = s.value; render(); });
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
  c.innerHTML = `<h1>${t('meta.title')}</h1><p class="muted">${t('meta.desc', { games: DB.meta.gamesAnalyzed, patch: DB.meta.proPatch })}</p>
  <div class="filters"><input type="search" placeholder="${t('meta.search')}" value="${esc(f.mQ)}" data-q>
    <div class="chips">${['all', ...ROLES].map((r) => `<button class="chip ${f.mRole === r ? 'on' : ''}" data-r="${r}">${r === 'all' ? t('meta.allRoles') : t('role.' + r)}</button>`).join('')}</div></div>
  <div class="card scroll-x"><table class="tbl meta"><thead><tr><th>${t('meta.tier')}</th><th></th><th>${t('name')}</th><th>${t('role')}</th><th>${t('meta.presence')}</th><th>${t('meta.picks')}</th><th>${t('meta.bans')}</th><th>${t('meta.wr')}</th><th>${t('meta.build')}</th></tr></thead><tbody>
  ${list.map((x) => `<tr><td><span class="tier t-${x.tier}">${x.tier}</span></td><td>${champIcon(x.id, 34)}</td><td><b>${esc(cname(x.id))}</b><div class="muted small">${esc(getLang() === 'vi' ? x.titleVi : x.title)}</div></td>
    <td>${x.roles.map(roleTag).join(' ')}</td><td>${pct(x.presence)}</td><td>${x.picks}</td><td>${x.bans}</td><td>${x.picks ? pct(x.wr) : '-'}</td>
    <td class="build">${x.build.slice(0, 5).map((i) => DB.items[i] ? `<img loading="lazy" src="${itemImg(i)}" width="24" height="24" alt="${esc(iname(i))}" title="${esc(iname(i))}">` : '').join('')}</td></tr>`).join('')}
  </tbody></table></div>`;
  c.querySelector('[data-q]').oninput = debounce((e) => { f.mQ = e.target.value; render(); const i = document.querySelector('[data-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
  c.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { f.mRole = b.dataset.r; render(); });
}

// ---------- Thế giới ----------
function world(c) {
  const ranks = Object.values(S.teams).map((x) => ({ id: x.id, ovr: teamOvr(x) })).sort((a, b) => b.ovr - a.ovr).slice(0, 20);
  const pls = Object.values(S.players).filter((p) => p.teamId && p.season.g >= 3);
  const leader = (fn, n = 5) => pls.sort((a, b) => fn(b) - fn(a)).slice(0, n);
  const kda = (p) => (p.season.k + p.season.a) / Math.max(p.season.d, 1);
  c.innerHTML = `<h1>${t('world.title')}</h1>
  <div class="two">
    <div class="card"><h3>${t('world.powerRank')}</h3><table class="tbl"><tbody>${ranks.map((r, i) => `<tr class="${r.id === S.userTeam ? 'me' : ''}"><td>${i + 1}</td><td class="tname">${badge(r.id, 'sm')} ${esc(S.teams[r.id].name)}</td><td class="muted">${S.teams[r.id].league}</td><td>${ovrTag(r.ovr)}</td></tr>`).join('')}</tbody></table></div>
    <div>
      <div class="card"><h3>${t('world.history')}</h3>${S.history.length ? S.history.slice(0, 30).map((h) => `<div class="list-row">${badge(h.champ, 'sm')}<span class="grow"><b>${esc(S.teams[h.champ].name)}</b></span><span class="muted small">${esc(h.title)}</span></div>`).join('') : `<p class="muted">${t('world.noHistory')}</p>`}</div>
      <div class="card"><h3>${t('world.leaders')}</h3>
        <h4>${t('p.kda')}</h4>${leader(kda).map((p) => playerRow(p, `<b>${kda(p).toFixed(2)}</b>`, true)).join('')}
        <h4>${t('p.mvp')}</h4>${leader((p) => p.season.mvp).map((p) => playerRow(p, `<b>${p.season.mvp}</b>`, true)).join('')}
      </div>
    </div>
  </div>`;
  bindPlayerLinks(c);
}

// ---------- Tài chính ----------
function finance(c) {
  const ut = userTeam();
  const fp = (f) => {
    const p = { ...(f.params || {}) };
    return t(f.key, p);
  };
  c.innerHTML = `<h1>${t('fin.title')}</h1>
  <div class="stats-mini card">
    <div><span class="muted small">${t('fin.balance')}</span><b class="${ut.budget < 0 ? 'neg' : ''}">${money(ut.budget)}</b></div>
    <div><span class="muted small">${t('fin.payroll')}</span><b>${money(teamSalary(ut))}</b></div>
    <div><span class="muted small">${t('fin.sponsorY')}</span><b>${money(ut.sponsor)}</b></div>
  </div>
  <div class="card"><h3>${t('fin.log')}</h3>${S.finance.filter((f) => f.amount).slice(0, 60).map((f) => `<div class="list-row"><span class="grow">${esc(fp(f))}</span><span class="muted small">${t('season', { y: f.season })}</span><b class="${f.amount < 0 ? 'neg' : 'pos'}">${f.amount > 0 ? '+' : ''}${money(f.amount)}</b></div>`).join('') || '<p class="muted">—</p>'}</div>
  <div class="card"><h3>${t('nav.roster')}</h3><table class="tbl"><thead><tr><th>${t('player')}</th><th>${t('role')}</th><th>${t('salary')}</th><th>${t('contract')}</th><th>${t('value')}</th></tr></thead><tbody>
    ${teamPlayers(ut).map((p) => `<tr data-player="${esc(p.id)}" class="clickable"><td><b>${esc(p.ign)}</b></td><td>${roleTag(p.role)}</td><td>${money(p.salary)}</td><td>${p.contractUntil}</td><td>${money(p.value)}</td></tr>`).join('')}</tbody></table></div>`;
  bindPlayerLinks(c);
}

export { PHASES, clamp };
