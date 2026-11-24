// Ngày thi đấu: cấm/chọn và xem trận trực tiếp
import { DB } from './data.js';
import { t, cname } from './i18n.js';
import { S, teamOvr, lineupPlayers, addNews, fillLineup } from './state.js';
import {
  DRAFT_ORDER, newDraft, aiChoose, applyDraftAction, autoDraft, draftTaken, openRoles, champFit, swapPicks, simulateGame, recordGame, simSeries, compTraits,
} from './sim.js';
import { ROLES, esc, logistic } from './util.js';
import { badge, champIcon, roleTag, ovrTag, compTitle, face, leagueBadge, roleIcon, bgArt } from './ui.js';
import { champImg, champArt, champTile } from './data.js';
const roleIconSvg = (r) => roleIcon(r);

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
  return `${bgArt()}<div class="md-head">
    <div class="muted small row center gap">${leagueBadge(comp.league === 'INTL' ? (comp.phase === 'msi' ? 'MSI' : 'WORLDS') : comp.league, 'xs')} ${esc(compTitle(comp))} · ${t('m.bo', { n: match.bo })}</div>
    <div class="md-score">${badge(match.a, 'lg')}<span class="md-sname">${esc(S.teams[match.a].name)}</span>
      <b>${match.winsA} - ${match.winsB}</b>
      <span class="md-sname">${esc(S.teams[match.b].name)}</span>${badge(match.b, 'lg')}</div>
  </div>`;
}

function preMatch() {
  const A = S.teams[match.a], B = S.teams[match.b];
  const pA = logistic((teamOvr(A) - teamOvr(B)) / 4.2);
  const mine = match.a === me() ? pA : 1 - pA;
  const line = (tm) => lineupPlayers(tm).map(({ role, p }) => `<div class="list-row">${face(p, 'sm')}${roleTag(role)}<b class="grow">${p ? esc(p.ign) : '—'}</b>
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
// Chọn theo lượt; tướng được xếp tạm vào vị trí hợp nhất, người chơi đổi tướng giữa các tuyển thủ bất cứ lúc nào.
let draft = null, dsel = null, dfilter = 'all', dq = '', swapSel = null;

function draftScreen() {
  const { blue, red } = sides();
  draft = newDraft(blue, red);
  dsel = null; dfilter = 'all'; dq = ''; swapSel = null;
  renderDraft();
}

function mySide() { return draft.blue === me() ? 'B' : 'R'; }
const lineOf = (tid) => Object.fromEntries(lineupPlayers(S.teams[tid]).map(({ role, p }) => [role, p]));

function renderDraft() {
  const done = draft.step >= DRAFT_ORDER.length;
  const [side, type] = done ? [null, null] : DRAFT_ORDER[draft.step];
  const ms = mySide();
  const myTurn = !done && side === ms;
  const taken = draftTaken(draft);
  const myLine = lineOf(me());
  const comp = S.comps[match.comp];
  let champs = DB.champList.filter((c) => dfilter === 'all' || c.roles.includes(dfilter));
  if (dq) champs = champs.filter((c) => (c.name + ' ' + c.nameVi).toLowerCase().includes(dq.toLowerCase()));
  const myOpen = openRoles(draft, ms);
  const bestFit = (cid) => Math.round(Math.max(...myOpen.map((r) => champFit(myLine[r], cid, r)), 0));
  const lgId = comp.league === 'INTL' ? (comp.phase === 'msi' ? 'MSI' : 'WORLDS') : comp.league;

  const bans = (s) => {
    const next = !done && side === s && type === 'ban' ? draft.bans[s].length : -1;
    const arr = [0, 1, 2, 3, 4].map((i) => `<div class="dr-ban ${i === next ? 'next' : ''}">${draft.bans[s][i] ? `<img src="${champImg(draft.bans[s][i])}" alt="${esc(cname(draft.bans[s][i]))}" title="${esc(cname(draft.bans[s][i]))}">` : ''}</div>`);
    return s === 'B' ? arr.join('') : arr.reverse().join('');
  };
  const slots = (s) => {
    const tid = s === 'B' ? draft.blue : draft.red;
    const line = lineOf(tid);
    const firstEmpty = !done && side === s && type === 'pick' ? ROLES.find((r) => !draft.picks[s][r]) : null;
    const order = s === 'B' ? [...ROLES].reverse() : ROLES;
    return order.map((r) => {
      const c = draft.picks[s][r];
      const p = line[r];
      const mine = s === ms;
      const cls = [s === 'R' ? 'red' : '', r === firstEmpty ? 'active' : '', mine && c ? 'swappable' : '', mine && swapSel === r ? 'swap-sel' : ''].join(' ');
      return `<div class="dr-slot ${cls}" ${mine && c ? `data-swap="${r}"` : ''}>
        ${c ? `<div class="art" style="background-image:url('${champArt(c)}')"></div>` : `<div class="glyph">${roleIconSvg(r)}</div>`}
        <span class="rl">${t('roleS.' + r)}</span>${c && mine ? `<span class="ft">${Math.round(champFit(p, c, r))}</span>` : ''}
        <span class="cn">${c ? esc(cname(c)) : ''}</span><span class="pn">${p ? esc(p.ign) : '—'}</span></div>`;
    }).join('');
  };
  const wins = (tid) => {
    const n = tid === match.a ? match.winsA : match.winsB;
    return `<span class="wins">${Array.from({ length: Math.ceil(match.bo / 2) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  };
  const status = done ? t('dr.done') : myTurn ? `${t(type === 'ban' ? 'dr.bans' : 'dr.picks')} · <b>${t('dr.yourTurn')}</b>` : t('dr.waiting');
  const trB = compTraits(Object.values(draft.picks.B)), trR = compTraits(Object.values(draft.picks.R));
  const tr = ms === 'B' ? trB : trR;

  root().innerHTML = `<div class="draft">
    <div class="dr-top"><button data-leave>‹ ${t('dr.leave')}</button><span>${esc(compTitle(comp))}</span><span></span></div>
    <div class="dr-mid">
      <div class="dr-panel">
        <div class="dr-ph"><h3>${t('dr.champions')}</h3>
          <div class="dr-roles">${['all', ...ROLES].map((r) => `<button class="${dfilter === r ? 'on' : ''}" data-f="${r}">${r === 'all' ? t('tr.all') : t('roleS.' + r)}</button>`).join('')}</div>
          <label class="dr-search">⌕<input type="search" placeholder="${t('meta.search')}" value="${esc(dq)}" data-q></label></div>
        <div class="dr-grid">${champs.map((c) => {
          const dis = taken.has(c.id);
          return `<button class="dr-c ${dis ? 'dis' : ''} ${dsel === c.id ? 'on' : ''}" ${dis || !myTurn ? 'disabled' : ''} data-c="${c.id}">
            <img loading="lazy" src="${champTile(c.id)}" alt="">${['S', 'A'].includes(c.tier) ? `<span class="hx">${c.tier}</span>` : ''}
            ${myTurn && type === 'pick' && !dis ? `<span class="fit">${bestFit(c.id)}</span>` : ''}<em>${esc(cname(c.id))}</em></button>`;
        }).join('')}</div>
        <div class="dr-foot"><span class="msg">${done ? t('dr.swapHint') : myTurn ? (dsel ? esc(cname(dsel)) : t(type === 'ban' ? 'dr.selectBan' : 'dr.selectPick')) : t('dr.waiting')}
          <br><span class="dr-comp">${t('m.tanks')}: ${tr.tanks} · ${t('m.apShare')}: ${Math.round(tr.apShare * 100)}% · ${t('dr.swapHint')}</span></span>
          ${done ? `<button class="btn primary big" data-start>${t('m.startGame')}</button>`
            : `<button class="btn ${myTurn && dsel ? 'act' : ''}" data-confirm ${myTurn && dsel ? '' : 'disabled'}>${t(type === 'ban' ? 'dr.ban' : 'dr.pick')}</button>`}</div>
      </div>
      <div class="dr-banrow"><div class="dr-bans l">${bans('B')}</div><div class="dr-bans r">${bans('R')}</div></div>
    </div>
    <div class="dr-progress"><i style="width:${(draft.step / DRAFT_ORDER.length) * 100}%"></i></div>
    <div class="dr-bar">
      ${slots('B')}
      <div class="dr-center">
        <div class="t1">${esc(compTitle(comp))} · ${t('m.bo', { n: match.bo })} · ${t('dr.game', { n: match.games.length + 1 })}</div>
        <div class="t2">${draft.blue === me() ? t('dr.firstPick') : '&nbsp;'}</div>
        <div class="tms">${badge(draft.blue, 'lg')}${leagueBadge(lgId, 'sm')}${badge(draft.red, 'lg')}</div>
        <div class="tms">${wins(draft.blue)}<span class="t3">PATCH ${esc(DB.meta.proPatch)}</span>${wins(draft.red)}</div>
        <div class="t3">${status}</div>
      </div>
      ${slots('R')}
    </div></div>`;

  const r = root();
  r.querySelector('[data-leave]').onclick = () => preMatch();
  r.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { dsel = b.dataset.c; renderDraft(); });
  r.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { dfilter = b.dataset.f; renderDraft(); });
  r.querySelectorAll('[data-swap]').forEach((el) => el.onclick = () => {
    const role = el.dataset.swap;
    if (!swapSel) swapSel = role;
    else if (swapSel === role) swapSel = null;
    else { swapPicks(draft, ms, swapSel, role); swapSel = null; }
    renderDraft();
  });
  const qi = r.querySelector('[data-q]');
  qi.oninput = () => { dq = qi.value; renderDraft(); const n = root().querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  r.querySelector('[data-confirm]')?.addEventListener('click', () => {
    if (!dsel) return;
    applyDraftAction(draft, dsel, null);
    dsel = null;
    renderDraft();
  });
  r.querySelector('[data-start]')?.addEventListener('click', () => liveGame(draft));
  if (!done && !myTurn) {
    setTimeout(() => {
      if (!overlay || !draft || draft.step >= DRAFT_ORDER.length || DRAFT_ORDER[draft.step][0] === mySide()) return;
      const ch = aiChoose(draft);
      applyDraftAction(draft, ch.champ, ch.role);
      renderDraft();
    }, 550);
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

  const picksCol = (s) => ROLES.map((r) => `<div class="lv-p">${champIcon(g.picks[s][r], 34)}${face(S.players[pmap[s + r]?.pid], 'xs')}<span>${ign(s, r)}</span></div>`).join('');

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
        <div class="card feed-live" id="feed"></div>
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
    return `<tr class="${g.mvp === x.pid ? 'mvp' : ''}"><td>${champIcon(x.champ, 28)}</td><td class="row gap">${face(p, 'xs')}${roleTag(x.role)} <b>${p ? esc(p.ign) : '?'}</b>${g.mvp === x.pid ? ` <em class="tagx">${t('m.mvp')}</em>` : ''}</td>
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
