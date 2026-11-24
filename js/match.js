// Ngày thi đấu: cấm/chọn và xem trận trực tiếp
import { DB } from './data.js';
import { t, cname } from './i18n.js';
import { S, teamOvr, lineupPlayers, addNews, fillLineup } from './state.js';
import {
  DRAFT_ORDER, newDraft, aiChoose, applyDraftAction, autoDraft, draftTaken, openRoles, champFit, simulateGame, recordGame, simSeries, compTraits,
} from './sim.js';
import { ROLES, esc, logistic } from './util.js';
import { badge, champIcon, roleTag, ovrTag, compTitle } from './ui.js';

let overlay = null;
let match = null;
let onFinish = null;
let speed = 3;

function root() {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'matchday';
    document.body.appendChild(overlay);
  }
  return overlay;
}
function close() {
  overlay?.remove();
  overlay = null;
}

const me = () => S.userTeam;
const need = () => Math.ceil(match.bo / 2);
function sides() {
  const gi = match.games.length;
  const aBlue = gi % 2 === 0 ? match.aBlueFirst !== false : match.aBlueFirst === false;
  return aBlue ? { blue: match.a, red: match.b } : { blue: match.b, red: match.a };
}

export function openMatchDay(m, done) {
  match = m;
  onFinish = done;
  fillLineup(S.teams[m.a]);
  fillLineup(S.teams[m.b]);
  try { speed = +(localStorage.getItem('lolm_speed') || 3); } catch { speed = 3; }
  preMatch();
}

function header() {
  const comp = S.comps[match.comp];
  return `<div class="md-head">
    <div class="muted small">${esc(compTitle(comp))} · ${t('m.bo', { n: match.bo })}</div>
    <div class="md-score">${badge(match.a, 'lg')}<span class="md-sname">${esc(S.teams[match.a].name)}</span>
      <b>${match.winsA} - ${match.winsB}</b>
      <span class="md-sname">${esc(S.teams[match.b].name)}</span>${badge(match.b, 'lg')}</div>
  </div>`;
}

function preMatch() {
  const A = S.teams[match.a], B = S.teams[match.b];
  const pA = logistic((teamOvr(A) - teamOvr(B)) / 4.2);
  const mine = match.a === me() ? pA : 1 - pA;
  const line = (tm) => lineupPlayers(tm).map(({ role, p }) => `<div class="list-row">${roleTag(role)}<b class="grow">${p ? esc(p.ign) : '—'}</b>
    <span class="pool-mini">${p ? p.pool.slice(0, 3).map((x) => champIcon(x.c, 22)).join('') : ''}</span>${p ? ovrTag(p.ovr) : ''}</div>`).join('');
  root().innerHTML = `<div class="md-inner">${header()}
    <div class="md-game muted">${t('m.game', { n: match.games.length + 1 })}</div>
    <div class="two">
      <div class="card"><h3>${badge(A.id, 'sm')} ${esc(A.name)} ${ovrTag(teamOvr(A))}</h3>${line(A)}</div>
      <div class="card"><h3>${badge(B.id, 'sm')} ${esc(B.name)} ${ovrTag(teamOvr(B))}</h3>${line(B)}</div>
    </div>
    <div class="card center"><div class="muted small">${t('m.winProb')}</div><div class="prob"><i style="width:${Math.round(mine * 100)}%"></i><span>${Math.round(mine * 100)}%</span></div></div>
    <div class="md-actions">
      <button class="btn primary big" data-a="manual">${t('m.manualDraft')}</button>
      <button class="btn big" data-a="auto">${t('m.autoDraft')}</button>
      <button class="btn ghost big" data-a="quick">${t('m.quickSim')}</button>
    </div></div>`;
  root().querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'manual') draftScreen();
    else if (a === 'auto') { const { blue, red } = sides(); liveGame(autoDraft(blue, red)); }
    else { simSeries(match); seriesEnd(); }
  });
}

// ---------------- Cấm / chọn ----------------
let draft = null, dsel = null, drole = null, dfilter = 'all', dq = '';

function draftScreen() {
  const { blue, red } = sides();
  draft = newDraft(blue, red);
  dsel = null; drole = null; dfilter = 'all'; dq = '';
  renderDraft();
}

function mySide() { return draft.blue === me() ? 'B' : 'R'; }

function renderDraft() {
  const done = draft.step >= DRAFT_ORDER.length;
  const [side, type] = done ? [null, null] : DRAFT_ORDER[draft.step];
  const myTurn = !done && side === mySide();
  const taken = draftTaken(draft);
  const myLine = Object.fromEntries(lineupPlayers(S.teams[me()]).map(({ role, p }) => [role, p]));
  const myOpen = openRoles(draft, mySide());
  if (myTurn && type === 'pick' && (!drole || !myOpen.includes(drole))) drole = myOpen[0];
  let champs = DB.champList.filter((c) => dfilter === 'all' || c.roles.includes(dfilter));
  if (dq) champs = champs.filter((c) => (c.name + ' ' + c.nameVi).toLowerCase().includes(dq.toLowerCase()));
  const fitRole = type === 'pick' ? drole : null;
  const tierOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  champs.sort((a, b) => (fitRole ? champFit(myLine[fitRole], b.id, fitRole) - champFit(myLine[fitRole], a.id, fitRole) : tierOrder[a.tier] - tierOrder[b.tier] || b.presence - a.presence));

  const sideCol = (s) => {
    const tid = s === 'B' ? draft.blue : draft.red;
    const line = Object.fromEntries(lineupPlayers(S.teams[tid]).map(({ role, p }) => [role, p]));
    const tr = compTraits(Object.values(draft.picks[s]));
    const activeSlot = !done && side === s && type === 'pick';
    return `<div class="d-side ${s === 'B' ? 'blue' : 'red'}">
      <div class="d-team">${badge(tid, 'sm')} <b>${esc(S.teams[tid].short)}</b> <span class="muted small">${s === 'B' ? t('m.blue') : t('m.red')}</span></div>
      <div class="d-bans">${[0, 1, 2, 3, 4].map((i) => `<span class="d-ban">${draft.bans[s][i] ? champIcon(draft.bans[s][i], 30) : ''}</span>`).join('')}</div>
      ${ROLES.map((r) => {
        const c = draft.picks[s][r];
        const sel = s === mySide() && myTurn && type === 'pick' && r === drole && !c;
        return `<div class="d-slot ${sel ? 'sel' : ''} ${activeSlot && !c ? 'act' : ''}" ${s === mySide() && !c ? `data-role="${r}"` : ''}>
          ${c ? champIcon(c, 44) : `<span class="champ empty" style="width:44px;height:44px"></span>`}
          <div class="grow">${roleTag(r)} <b>${line[r] ? esc(line[r].ign) : '—'}</b><div class="small muted">${c ? esc(cname(c)) + ` · ${t('m.fit')} ${Math.round(champFit(line[r], c, r))}` : ''}</div></div></div>`;
      }).join('')}
      <div class="small muted">${t('m.tanks')}: ${tr.tanks} · ${t('m.apShare')}: ${Math.round(tr.apShare * 100)}%</div>
    </div>`;
  };

  root().innerHTML = `<div class="md-inner draft">${header()}
    <div class="d-turn ${myTurn ? 'mine' : ''}">${done ? '' : myTurn ? t('m.yourTurn', { action: t(type === 'ban' ? 'm.banA' : 'm.pickA') }) : t('m.aiTurn', { action: t(type === 'ban' ? 'm.ban' : 'm.pick') })}
      <span class="muted small">(${draft.step + (done ? 0 : 1)}/20)</span></div>
    <div class="d-grid">
      ${sideCol('B')}
      <div class="d-center">
        <div class="filters"><input type="search" placeholder="${t('meta.search')}" value="${esc(dq)}" data-q>
          <div class="chips">${['all', ...ROLES].map((r) => `<button class="chip sm ${dfilter === r ? 'on' : ''}" data-f="${r}">${r === 'all' ? t('meta.allRoles') : t('roleS.' + r)}</button>`).join('')}</div></div>
        <div class="d-champs">${champs.map((c) => {
          const dis = taken.has(c.id);
          const fit = fitRole ? Math.round(champFit(myLine[fitRole], c.id, fitRole)) : null;
          return `<button class="d-champ ${dis ? 'dis' : ''} ${dsel === c.id ? 'on' : ''}" ${dis || !myTurn ? 'disabled' : ''} data-c="${c.id}">
            ${champIcon(c.id, 52)}<span class="tier t-${c.tier}">${c.tier}</span>${fit !== null && !dis ? `<span class="fit">${fit}</span>` : ''}<em>${esc(cname(c.id))}</em></button>`;
        }).join('')}</div>
        <div class="row center gap">${done ? `<button class="btn primary big" data-start>${t('m.startGame')}</button>`
          : myTurn ? `<button class="btn primary big" data-confirm ${dsel ? '' : 'disabled'}>${t('m.confirm')} ${dsel ? '· ' + esc(cname(dsel)) + (type === 'pick' ? ` → ${t('roleS.' + drole)}` : '') : ''}</button>` : ''}</div>
      </div>
      ${sideCol('R')}
    </div></div>`;

  const r = root();
  r.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => {
    dsel = b.dataset.c;
    if (type === 'pick') {
      const c = DB.champions[dsel];
      if (!c.roles.includes(drole)) { const alt = c.roles.find((x) => myOpen.includes(x)); if (alt) drole = alt; }
    }
    renderDraft();
  });
  r.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => { drole = b.dataset.role; renderDraft(); });
  r.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { dfilter = b.dataset.f; renderDraft(); });
  const qi = r.querySelector('[data-q]');
  qi.oninput = () => { dq = qi.value; renderDraft(); const n = root().querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  r.querySelector('[data-confirm]')?.addEventListener('click', () => {
    if (!dsel) return;
    applyDraftAction(draft, dsel, type === 'pick' ? drole : null);
    dsel = null;
    renderDraft();
  });
  r.querySelector('[data-start]')?.addEventListener('click', () => liveGame(draft));
  if (!done && !myTurn) {
    setTimeout(() => {
      if (!overlay || draft.step >= DRAFT_ORDER.length || DRAFT_ORDER[draft.step][0] === mySide()) return;
      const ch = aiChoose(draft);
      applyDraftAction(draft, ch.champ, ch.role);
      renderDraft();
    }, 450);
  }
}

// ---------------- Xem trận trực tiếp ----------------
let timer = null;

function liveGame(d) {
  const g = simulateGame(d);
  const pmap = Object.fromEntries(g.players.map((x) => [x.side + x.role, x]));
  const tShort = (s) => esc(S.teams[s === 'B' ? g.blue : g.red].short);
  const ign = (s, r) => { const x = pmap[s + r]; return x && S.players[x.pid] ? esc(S.players[x.pid].ign) : '?'; };
  let minute = 0, evIdx = 0;
  const live = { kills: { B: 0, R: 0 }, towers: { B: 0, R: 0 }, drakes: { B: 0, R: 0 }, barons: { B: 0, R: 0 } };
  const feed = [];

  const evText = (e) => {
    const p = { min: e.m, team: tShort(e.side) };
    const os = e.side === 'B' ? 'R' : 'B';
    if (e.killer) { p.killer = ign(e.side, e.killer); p.victim = ign(os, e.victim); }
    if (e.drake) p.drake = t('drake.' + e.drake);
    if (e.n) p.n = e.n;
    if (e.type === 'teamfight') { p.kb = e.side === 'B' ? e.kb : e.kr; p.kr = e.side === 'B' ? e.kr : e.kb; }
    return t('ev.' + e.type, p);
  };

  const picksCol = (s) => ROLES.map((r) => `<div class="lv-p">${champIcon(g.picks[s][r], 34)}<span>${ign(s, r)}</span></div>`).join('');

  root().innerHTML = `<div class="md-inner live">${header()}
    <div class="lv-top">
      <div class="lv-team blue">${badge(g.blue, 'sm')} ${tShort('B')}</div>
      <div class="lv-mid"><div class="lv-k"><b id="kB">0</b><span id="clock">00:00</span><b id="kR">0</b></div>
        <div class="lv-obj small"><span id="oB"></span><span id="oR"></span></div></div>
      <div class="lv-team red">${tShort('R')} ${badge(g.red, 'sm')}</div>
    </div>
    <div class="lv-body">
      <div class="lv-picks blue">${picksCol('B')}</div>
      <div class="lv-center">
        <div class="card"><div class="small muted">${t('m.gold')}</div><svg id="gold" viewBox="0 0 300 80" preserveAspectRatio="none"><line x1="0" y1="40" x2="300" y2="40" class="axis"/><polyline id="gl" points="" /></svg><div class="small center" id="gd">0</div></div>
        <div class="card feed" id="feed"></div>
      </div>
      <div class="lv-picks red">${picksCol('R')}</div>
    </div>
    <div class="row center gap lv-ctrl"><span class="muted small">${t('m.speed')}</span>
      ${[1, 3, 8].map((x) => `<button class="chip ${speed === x ? 'on' : ''}" data-sp="${x}">${x}x</button>`).join('')}
      <button class="btn ghost" data-skip>${t('m.skip')}</button></div>
  </div>`;

  const r = root();
  const upd = () => {
    r.querySelector('#kB').textContent = live.kills.B;
    r.querySelector('#kR').textContent = live.kills.R;
    r.querySelector('#clock').textContent = `${String(minute).padStart(2, '0')}:00`;
    r.querySelector('#oB').textContent = `🏰${live.towers.B} 🐉${live.drakes.B} 👑${live.barons.B}`;
    r.querySelector('#oR').textContent = `👑${live.barons.R} 🐉${live.drakes.R} 🏰${live.towers.R}`;
    const pts = g.gold.slice(0, minute + 1).map((v, i) => `${(i / g.dur) * 300},${40 - (v / 15000) * 38}`).join(' ');
    r.querySelector('#gl').setAttribute('points', pts);
    const gd = g.gold[Math.min(minute, g.dur)];
    const gdEl = r.querySelector('#gd');
    gdEl.textContent = `${gd > 0 ? tShort('B') + ' +' : gd < 0 ? tShort('R') + ' +' : ''}${Math.abs(gd).toLocaleString()}`;
    gdEl.className = `small center ${gd > 0 ? 'blue-t' : gd < 0 ? 'red-t' : ''}`;
    r.querySelector('#feed').innerHTML = feed.slice(-40).reverse().map((x) => `<div class="${x.side === 'B' ? 'blue-t' : 'red-t'}">${x.text}</div>`).join('');
  };
  const applyEv = (e) => {
    if (e.type === 'kill' || e.type === 'firstblood') live.kills[e.side]++;
    if (e.type === 'teamfight') { live.kills.B += e.kb; live.kills.R += e.kr; }
    if (e.type === 'tower' || e.type === 'firsttower') live.towers[e.side]++;
    if (e.type === 'dragon') live.drakes[e.side]++;
    if (e.type === 'baron') live.barons[e.side]++;
    feed.push({ side: e.side, text: evText(e) });
  };
  const step = () => {
    minute++;
    while (evIdx < g.events.length && g.events[evIdx].m <= minute) applyEv(g.events[evIdx++]);
    upd();
    if (minute >= g.dur) { clearInterval(timer); timer = null; setTimeout(() => postGame(g), 900); }
  };
  const run = () => { clearInterval(timer); timer = setInterval(step, 1000 / speed); };
  r.querySelectorAll('[data-sp]').forEach((b) => b.onclick = () => {
    speed = +b.dataset.sp;
    try { localStorage.setItem('lolm_speed', speed); } catch { /* */ }
    r.querySelectorAll('[data-sp]').forEach((x) => x.classList.toggle('on', x === b));
    run();
  });
  r.querySelector('[data-skip]').onclick = () => {
    clearInterval(timer); timer = null;
    while (minute < g.dur) { minute++; while (evIdx < g.events.length && g.events[evIdx].m <= minute) applyEv(g.events[evIdx++]); }
    upd();
    postGame(g);
  };
  upd();
  run();
}

function postGame(g) {
  if (g.recorded) return;
  g.recorded = true;
  recordGame(match, g, true);
  const won = g.winnerId === me();
  const row = (x) => {
    const p = S.players[x.pid];
    return `<tr class="${g.mvp === x.pid ? 'mvp' : ''}"><td>${champIcon(x.champ, 28)}</td><td>${roleTag(x.role)} <b>${p ? esc(p.ign) : '?'}</b>${g.mvp === x.pid ? ` <em class="tagx">${t('m.mvp')}</em>` : ''}</td>
      <td>${x.k}/${x.d}/${x.a}</td><td>${x.cs}</td><td>${(x.gold / 1000).toFixed(1)}k</td><td>${(x.dmg / 1000).toFixed(1)}k</td></tr>`;
  };
  const table = (s) => `<table class="tbl sb"><thead><tr><th></th><th>${badge(s === 'B' ? g.blue : g.red, 'sm')} ${esc(S.teams[s === 'B' ? g.blue : g.red].short)} ${g.winner === s ? '🏆' : ''}</th><th>KDA</th><th>CS</th><th>${t('p.gpm').split('/')[0]}</th><th>DMG</th></tr></thead>
    <tbody>${g.players.filter((x) => x.side === s).map(row).join('')}</tbody></table>`;
  const over = match.done;
  root().innerHTML = `<div class="md-inner">${header()}
    <div class="result ${won ? 'win' : 'loss'}">${won ? t('m.victory') : t('m.defeat')}</div>
    <div class="center muted">${t('m.duration')}: ${g.dur}:00 · ${t('m.kills')} ${g.kills.B}-${g.kills.R} · ${t('m.towers')} ${g.towers.B}-${g.towers.R} · ${t('m.dragons')} ${g.drakes.B.length}-${g.drakes.R.length}</div>
    <div class="card scroll-x"><h3>${t('m.scoreboard')}</h3>${table('B')}${table('R')}</div>
    <div class="md-actions">${over ? `<button class="btn primary big" data-fin>${t('m.finish')}</button>`
      : `<button class="btn primary big" data-a="manual">${t('m.manualDraft')}</button><button class="btn big" data-a="auto">${t('m.autoDraft')}</button><button class="btn ghost big" data-a="quick">${t('m.quickSim')}</button>`}</div></div>`;
  const r = root();
  r.querySelector('[data-fin]')?.addEventListener('click', seriesEnd);
  r.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'manual') draftScreen();
    else if (a === 'auto') { const { blue, red } = sides(); liveGame(autoDraft(blue, red)); }
    else { simSeries(match); seriesEnd(); }
  });
}

function seriesEnd() {
  const won = match.winner === me();
  const opp = match.a === me() ? match.b : match.a;
  const my = match.a === me() ? match.winsA : match.winsB;
  const th = match.a === me() ? match.winsB : match.winsA;
  addNews(won ? 'news.userWin' : 'news.userLoss', { team: S.teams[me()].name, opp: S.teams[opp].name, a: my, b: th }, true);
  S.userMatchesPlayed = (S.userMatchesPlayed || 0) + 1;
  root().innerHTML = `<div class="md-inner">${header()}
    <div class="result ${won ? 'win' : 'loss'}">${t('m.seriesWin', { team: esc(S.teams[match.winner].name), a: Math.max(match.winsA, match.winsB), b: Math.min(match.winsA, match.winsB) })}</div>
    <div class="md-actions"><button class="btn primary big" data-close>${t('m.finish')}</button></div></div>`;
  root().querySelector('[data-close]').onclick = () => { close(); onFinish && onFinish(); };
}
export { need };
