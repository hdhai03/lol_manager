// Sân đấu 3D (three.js) cho màn xem trận.
// Nhận "mục tiêu" vị trí của 10 tướng từ bộ mô phỏng theo phút (toạ độ 0..100 của bản đồ 2D)
// rồi diễn giải liên tục: đi lại, giao tranh, bắn kỹ năng, chết/hồi sinh, lính, trụ, rồng, baron.
/* global THREE */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
let loading = null;
function loadScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error(url));
    document.head.appendChild(s);
  });
}
export function loadThree() {
  if (window.THREE && THREE.OrbitControls) return Promise.resolve(true);
  loading ??= loadScript(THREE_URL).then(() => loadScript(ORBIT_URL)).then(() => true);
  return loading;
}
export function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

// toạ độ bản đồ (0..100) -> thế giới (x, z) trong khoảng -100..100
const W = (p) => ({ x: (p[0] - 50) * 2, z: (p[1] - 50) * 2 });
const LANES = {
  top: [[9, 91], [9, 84], [9, 10], [84, 10], [91, 9]],
  mid: [[9, 91], [16, 84], [84, 16], [91, 9]],
  bot: [[9, 91], [16, 91], [90, 91], [91, 9]],
};
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function polyAt(pts, t) {
  let d = t * polyLen(pts);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l) return [a[0] + (b[0] - a[0]) * (d / l), a[1] + (b[1] - a[1]) * (d / l)];
    d -= l;
  }
  return pts[pts.length - 1];
}
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - tt * dx, p[1] - a[1] - tt * dy);
}

const COL = { B: 0x4c8df6, R: 0xf2575f };
const COL_LIGHT = { B: 0x9cc8ff, R: 0xffb0a0 };

function groundTexture() {
  const N = 1024, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const s = N / 100;
  // cỏ + nhiễu
  const grad = g.createRadialGradient(N / 2, N / 2, N * .1, N / 2, N / 2, N * .75);
  grad.addColorStop(0, '#2f5a3a'); grad.addColorStop(1, '#1a3324');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40},${60 + Math.random() * 50},${30 + Math.random() * 30},${Math.random() * .25})`;
    const r = Math.random() * 6 + 1;
    g.beginPath(); g.arc(Math.random() * N, Math.random() * N, r, 0, 7); g.fill();
  }
  // sông
  g.strokeStyle = 'rgba(70,140,170,.85)'; g.lineWidth = 9 * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(4 * s, 8 * s); g.bezierCurveTo(30 * s, 30 * s, 70 * s, 70 * s, 96 * s, 92 * s); g.stroke();
  g.strokeStyle = 'rgba(150,210,230,.25)'; g.lineWidth = 3 * s; g.stroke();
  // đường
  const lane = (pts) => {
    g.strokeStyle = 'rgba(150,130,95,.95)'; g.lineWidth = 6 * s; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.stroke();
    g.strokeStyle = 'rgba(190,170,130,.35)'; g.lineWidth = 2.5 * s; g.stroke();
  };
  Object.values(LANES).forEach(lane);
  // nền nhà chính
  for (const [x, y, c2] of [[9, 91, '#20345e'], [91, 9, '#5a2230']]) {
    g.fillStyle = c2; g.beginPath(); g.arc(x * s, y * s, 13 * s, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = .6 * s; g.stroke();
  }
  // hố rồng/baron
  for (const [x, y] of [[67, 69], [33, 31]]) { g.fillStyle = 'rgba(40,60,50,.9)'; g.beginPath(); g.arc(x * s, y * s, 5 * s, 0, 7); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function portraitTexture(url, color) {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  const draw = (img) => {
    g.clearRect(0, 0, N, N);
    g.save(); g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 14, 0, 7); g.clip();
    if (img) g.drawImage(img, 0, 0, N, N); else { g.fillStyle = '#223'; g.fillRect(0, 0, N, N); }
    g.restore();
    g.lineWidth = 14; g.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 10, 0, 7); g.stroke();
    tex.needsUpdate = true;
  };
  draw(null);
  const img = new Image();
  img.onload = () => draw(img);
  img.src = url;
  return tex;
}

export function createArena(container, opts) {
  const { picks, champUrl, names, towerIds } = opts; // picks: {B:{role:champ}, R:{...}}
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1418);
  scene.fog = new THREE.Fog(0x0c1418, 230, 420);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 1, 1000);
  camera.position.set(-30, 95, 110);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08;
  controls.maxPolarAngle = Math.PI * .44; controls.minDistance = 40; controls.maxDistance = 300;
  controls.target.set(0, 0, 0);
  let userUntil = 0;
  controls.addEventListener('start', () => { userUntil = performance.now() + 7000; });

  // ánh sáng
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a2a1e, .75));
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.25);
  sun.position.set(-90, 160, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 400 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6fd6ff, .35); rim.position.set(120, 60, -120); scene.add(rim);

  // địa hình
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: .95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // địa hình bao quanh + vách đá viền sân
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x14241b, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -.2; outer.receiveShadow = true; scene.add(outer);
  const cliffM = new THREE.MeshStandardMaterial({ color: 0x2c3a33, roughness: .95, flatShading: true });
  for (let i = 0; i < 90; i++) {
    const side = i % 4, tt = Math.random() * 230 - 115;
    const x = side === 0 ? -116 : side === 1 ? 116 : tt, z = side === 2 ? -116 : side === 3 ? 116 : tt;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + Math.random() * 7, 0), cliffM);
    rock.position.set(x + (Math.random() - .5) * 8, Math.random() * 3, z + (Math.random() - .5) * 8);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, 0); rock.castShadow = true; rock.receiveShadow = true;
    scene.add(rock);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x3a8db0, transparent: true, opacity: 0, roughness: .2 }));
  water.rotation.x = -Math.PI / 2; water.position.y = .05; scene.add(water);

  // rừng: cây + đá (instanced), tránh đường/sông/nền nhà
  const segs = Object.values(LANES).flatMap((pts) => pts.slice(1).map((b, i) => [pts[i], b]));
  const onRiver = (p) => { for (let i = 0; i <= 20; i++) { const tt = i / 20; const bx = (1 - tt) ** 3 * 4 + 3 * (1 - tt) ** 2 * tt * 30 + 3 * (1 - tt) * tt * tt * 70 + tt ** 3 * 96; const by = (1 - tt) ** 3 * 8 + 3 * (1 - tt) ** 2 * tt * 30 + 3 * (1 - tt) * tt * tt * 70 + tt ** 3 * 92; if (Math.hypot(p[0] - bx, p[1] - by) < 7) return true; } return false; };
  const okSpot = (p) => segs.every(([a, b]) => distToSeg(p, a, b) > 5.5) && !onRiver(p) && Math.hypot(p[0] - 9, p[1] - 91) > 16 && Math.hypot(p[0] - 91, p[1] - 9) > 16
    && Math.hypot(p[0] - 67, p[1] - 69) > 8 && Math.hypot(p[0] - 33, p[1] - 31) > 8;
  const spots = [];
  for (let i = 0; i < 2400 && spots.length < 420; i++) { const p = [3 + Math.random() * 94, 3 + Math.random() * 94]; if (okSpot(p)) spots.push(p); }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .7, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 8, 7), new THREE.MeshStandardMaterial({ color: 0x1f4a2c, roughness: .9 }), spots.length);
  crown.castShadow = true; trunk.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  spots.forEach((p, i) => {
    const w = W(p); const k = .7 + Math.random() * .7;
    sc.set(k, k, k); pos.set(w.x, 1.5 * k, w.z); m4.compose(pos, q, sc); trunk.setMatrixAt(i, m4);
    pos.set(w.x, 6 * k, w.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6); m4.compose(pos, q, sc); crown.setMatrixAt(i, m4);
    crown.setColorAt(i, new THREE.Color().setHSL(.36 + Math.random() * .05, .45, .18 + Math.random() * .08));
  });
  scene.add(trunk, crown);

  // nền nhà + nhà chính
  const nexus = {};
  for (const sd of ['B', 'R']) {
    const b = W(sd === 'B' ? [9, 91] : [91, 9]);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(16, 18, 2, 32), new THREE.MeshStandardMaterial({ color: 0x3b4152, roughness: .6, metalness: .2 }));
    plat.position.set(b.x, 1, b.z); plat.receiveShadow = true; scene.add(plat);
    const crys = new THREE.Mesh(new THREE.OctahedronGeometry(6, 0), new THREE.MeshStandardMaterial({ color: COL[sd], emissive: COL[sd], emissiveIntensity: .9, roughness: .2, metalness: .3 }));
    crys.position.set(b.x, 10, b.z); crys.castShadow = true; scene.add(crys);
    const light = new THREE.PointLight(COL[sd], 1.4, 60); light.position.set(b.x, 14, b.z); scene.add(light);
    nexus[sd] = { crys, light, alive: true };
  }

  // trụ
  const towers = {};
  for (const [id, p] of Object.entries(towerIds)) {
    const sd = id[0];
    const w = W(p);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 9, 8), new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: .7, metalness: .3 }));
    base.position.y = 4.5; base.castShadow = true;
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(1.8, 0), new THREE.MeshStandardMaterial({ color: COL[sd], emissive: COL[sd], emissiveIntensity: 1.1 }));
    top.position.y = 11;
    g.add(base, top); g.position.set(w.x, 0, w.z);
    scene.add(g);
    towers[id] = { g, top, side: sd, alive: true, fall: 0 };
  }

  // quái lớn
  const mkMonster = (p, color, size) => {
    const w = W(p);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, roughness: .4 }));
    body.scale.set(1.3, .9, 1); body.position.y = size; body.castShadow = true;
    const wingM = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .2, side: THREE.DoubleSide, transparent: true, opacity: .85 });
    const w1 = new THREE.Mesh(new THREE.ConeGeometry(size * .8, size * 2.2, 3), wingM); w1.rotation.z = Math.PI / 2.4; w1.position.set(-size * 1.2, size * 1.5, 0);
    const w2 = w1.clone(); w2.rotation.z = -Math.PI / 2.4; w2.position.x = size * 1.2;
    g.add(body, w1, w2); g.position.set(w.x, 0, w.z);
    scene.add(g);
    return { g, body, alive: true, respawn: 0 };
  };
  const dragon = mkMonster([67, 69], 0xff8a3d, 3);
  const baron = mkMonster([33, 31], 0x9a5cff, 4.5);

  // tướng
  const units = {};
  const ringGeo = new THREE.RingGeometry(2.4, 3.1, 32);
  for (const sd of ['B', 'R']) for (const role of Object.keys(picks[sd])) {
    const key = sd + role;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COL[sd], transparent: true, opacity: .9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .15;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2, 4.5, 14), new THREE.MeshStandardMaterial({ color: COL[sd], emissive: COL[sd], emissiveIntensity: .25, roughness: .45, metalness: .3 }));
    body.position.y = 2.25; body.castShadow = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: portraitTexture(champUrl(picks[sd][role]), COL[sd]), depthWrite: false }));
    sprite.scale.set(7, 7, 1); sprite.position.y = 9;
    g.add(ring, body, sprite);
    const start = W(sd === 'B' ? [9, 91] : [91, 9]);
    g.position.set(start.x + (Math.random() - .5) * 6, 0, start.z + (Math.random() - .5) * 6);
    scene.add(g);
    const label = document.createElement('div');
    label.className = `u3 u3-${sd}`;
    label.innerHTML = `<b>${names[key] || ''}</b><span><i></i></span>`;
    container.appendChild(label);
    units[key] = { key, side: sd, g, body, sprite, ring, label, hpEl: label.querySelector('i'), hp: 1, target: g.position.clone(), alive: true, cd: Math.random(), dying: 0, diedAt: null, deadVis: false };
  }

  // lính
  const minions = [];
  const minGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const minMat = { B: new THREE.MeshStandardMaterial({ color: 0x6f9cf0, roughness: .5 }), R: new THREE.MeshStandardMaterial({ color: 0xe5736a, roughness: .5 }) };
  let waveClock = 0;
  const spawnWave = () => {
    for (const sd of ['B', 'R']) for (const lane of Object.keys(LANES)) for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(minGeo, minMat[sd]); m.castShadow = true;
      scene.add(m);
      minions.push({ m, side: sd, lane, t: sd === 'B' ? .06 - i * .012 : .94 + i * .012, life: 0, hp: 1, fighting: 0 });
    }
  };

  // hiệu ứng: đạn kỹ năng, vụ nổ
  const shots = [];
  const shotGeo = new THREE.SphereGeometry(.7, 10, 8);
  const shotMat = { B: new THREE.MeshBasicMaterial({ color: COL_LIGHT.B }), R: new THREE.MeshBasicMaterial({ color: COL_LIGHT.R }) };
  const bursts = [];
  const burstGeo = new THREE.SphereGeometry(1, 16, 12);
  const fire = (from, to, sd, big) => {
    const m = new THREE.Mesh(shotGeo, shotMat[sd]);
    m.position.copy(from); m.position.y += 5;
    if (big) m.scale.setScalar(1.8);
    scene.add(m);
    shots.push({ m, to: to.clone().setY(4), t: 0, sd });
  };
  const burst = (p, color, size = 6) => {
    const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(p); m.position.y = Math.max(m.position.y, 3);
    scene.add(m);
    bursts.push({ m, t: 0, size });
  };

  // ---- API cho bộ mô phỏng ----
  let focus = new THREE.Vector3(0, 0, 0);
  let focusUntil = 0;
  const api = {
    setTargets(tok) {
      for (const [k, tk] of Object.entries(tok)) {
        const u = units[k]; if (!u) continue;
        const w = W(tk.pos);
        u.target.set(w.x, 0, w.z);
        if (tk.dead > 0 && u.alive) { u.alive = false; u.dying = 1; u.diedAt = tk.diedAt ? W(tk.diedAt) : null; }
        if (tk.dead === 0 && !u.alive && u.deadVis) { u.alive = true; u.deadVis = false; u.hp = 1; const b = W(k[0] === 'B' ? [9, 91] : [91, 9]); u.g.position.set(b.x, 0, b.z); u.g.visible = true; u.g.scale.setScalar(1); burst(u.g.position, COL_LIGHT[u.side], 5); }
      }
    },
    flash(p, sd, big) { const w = W(p); const v = new THREE.Vector3(w.x, 2, w.z); burst(v, COL_LIGHT[sd], big ? 14 : 8); api.focus(p, 2500); },
    focus(p, ms = 3000) { const w = W(p); focus.set(w.x, 0, w.z); focusUntil = performance.now() + ms; },
    towerDown(id) { const tw = towers[id]; if (tw && tw.alive) { tw.alive = false; burst(tw.g.position.clone().setY(8), 0xffd39a, 10); } },
    objective(kind, sd) { const mo = kind === 'baron' ? baron : dragon; mo.alive = false; mo.respawn = kind === 'baron' ? 6 : 5; burst(mo.g.position.clone().setY(4), COL_LIGHT[sd], 16); },
    minuteTick(lead) { api.lead = lead; for (const mo of [dragon, baron]) if (!mo.alive && --mo.respawn <= 0) mo.alive = true; },
    nexusDown(sd) { const n = nexus[sd]; n.alive = false; burst(n.crys.position, 0xffffff, 30); },
    setSpeed(s) { api.speed = s; },
    lead: 0, speed: 1,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); container.querySelectorAll('.u3').forEach((x) => x.remove()); renderer.domElement.remove(); },
  };

  // ---- vòng lặp ----
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  });
  ro.observe(container);
  let last = performance.now(), raf = 0;
  const tmp = new THREE.Vector3();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const rdt = Math.min(.05, (now - last) / 1000); last = now;
    const dt = rdt * Math.min(api.speed, 8); // giây "trong trận" (giới hạn để mắt còn theo kịp)
    const all = Object.values(units);

    // tướng: di chuyển, giao tranh, chết
    for (const u of all) {
      if (!u.alive) {
        if (u.dying > 0) {
          // diễn lại pha giao tranh ngắn rồi ngã xuống
          if (u.diedAt) { tmp.set(u.diedAt.x, 0, u.diedAt.z); u.g.position.lerp(tmp, Math.min(1, rdt * 6)); }
          u.dying -= rdt * 1.6;
          u.hp = Math.max(0, u.dying * .4);
          if (u.dying <= .4) { u.g.scale.setScalar(Math.max(.01, u.dying / .4)); u.g.position.y = -(1 - u.dying / .4) * 3; }
          if (u.dying <= 0) { u.deadVis = true; u.g.visible = false; burst(u.g.position.clone().setY(3), 0x9aa4b6, 6); }
        }
        continue;
      }
      const d = tmp.copy(u.target).sub(u.g.position); d.y = 0;
      const dist = d.length();
      const sp = 14 * dt + dist * Math.min(1, dt * .9);
      if (dist > .4) u.g.position.addScaledVector(d.normalize(), Math.min(dist, sp));
      u.g.position.y = Math.abs(Math.sin(now / 160 + u.cd * 9)) * (dist > 2 ? .5 : 0);
      // tìm địch gần nhất
      let foe = null, fd = 1e9;
      for (const v of all) if (v.alive && v.side !== u.side) { const dd = v.g.position.distanceTo(u.g.position); if (dd < fd) { fd = dd; foe = v; } }
      u.cd -= dt;
      if (foe && fd < 22 && u.cd <= 0) { fire(u.g.position, foe.g.position, u.side, Math.random() < .15); u.cd = .6 + Math.random() * .7; foe.hp = Math.max(.15, foe.hp - .06); }
      if (!foe || fd > 30) u.hp = Math.min(1, u.hp + dt * .05);
    }

    // lính
    waveClock -= dt;
    if (waveClock <= 0) { spawnWave(); waveClock = 30; }
    const front = Math.max(.2, Math.min(.8, .5 + (api.lead || 0) * .5));
    for (let i = minions.length - 1; i >= 0; i--) {
      const mn = minions[i];
      const goal = mn.side === 'B' ? front - .015 : front + .015;
      const step = .012 * dt;
      if (mn.side === 'B' ? mn.t < goal : mn.t > goal) mn.t += mn.side === 'B' ? step : -step;
      else { mn.fighting += dt; if (Math.random() < dt * .8) { const p = polyAt(LANES[mn.lane], mn.side === 'B' ? front + .015 : front - .015); const w = W(p); fire(mn.m.position, new THREE.Vector3(w.x, 0, w.z), mn.side, false); } }
      const p = polyAt(LANES[mn.lane], Math.max(0, Math.min(1, mn.t)));
      const w = W(p);
      mn.m.position.set(w.x + Math.sin(i) * 1.6, .7, w.z + Math.cos(i) * 1.6);
      mn.life += dt;
      if (mn.fighting > 8 + (i % 5) * 1.5 || mn.life > 70) { scene.remove(mn.m); minions.splice(i, 1); }
    }

    // đạn & vụ nổ
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.t += rdt * 3.2;
      s.m.position.lerp(s.to, Math.min(1, s.t));
      if (s.t >= 1) { burst(s.m.position, COL_LIGHT[s.sd], 2.2); scene.remove(s.m); shots.splice(i, 1); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.t += rdt * 1.8;
      b.m.scale.setScalar(.3 + b.t * b.size); b.m.material.opacity = Math.max(0, .8 * (1 - b.t));
      if (b.t >= 1) { scene.remove(b.m); b.m.material.dispose(); bursts.splice(i, 1); }
    }

    // trụ, quái, nhà chính
    for (const tw of Object.values(towers)) {
      tw.top.rotation.y += rdt;
      if (!tw.alive && tw.fall < 1) { tw.fall = Math.min(1, tw.fall + rdt * .8); tw.g.scale.y = 1 - tw.fall * .75; tw.g.rotation.z = tw.fall * .25; tw.top.visible = false; }
    }
    for (const mo of [dragon, baron]) {
      mo.g.visible = mo.alive;
      mo.body.position.y = mo.body.geometry.parameters.radius + Math.sin(now / 500) * .6;
      mo.g.rotation.y += rdt * .3;
    }
    for (const sd of ['B', 'R']) {
      const n = nexus[sd];
      n.crys.rotation.y += rdt * .6;
      if (!n.alive) { n.crys.scale.multiplyScalar(.97); n.light.intensity *= .95; }
    }
    water.material.opacity = 0;

    // camera bám theo hành động
    if (now > userUntil) {
      let fx = focus;
      if (now > focusUntil) {
        const live = all.filter((u) => u.alive);
        const c = new THREE.Vector3();
        live.forEach((u) => c.add(u.g.position));
        if (live.length) c.multiplyScalar(1 / live.length);
        fx = c;
      }
      controls.target.lerp(fx, Math.min(1, rdt * 1.5));
      const want = tmp.copy(controls.target).add(new THREE.Vector3(-22, 78, 92));
      camera.position.lerp(want, Math.min(1, rdt * .9));
    }
    controls.update();
    renderer.render(scene, camera);

    // nhãn tên + máu
    const w2 = container.clientWidth, h2 = container.clientHeight;
    for (const u of all) {
      const vis = u.g.visible && !u.deadVis;
      u.label.style.display = vis ? '' : 'none';
      if (!vis) continue;
      tmp.copy(u.g.position); tmp.y += 13;
      tmp.project(camera);
      u.label.style.transform = `translate(${(tmp.x * .5 + .5) * w2}px, ${(-tmp.y * .5 + .5) * h2}px) translate(-50%, -100%)`;
      u.hpEl.style.width = `${Math.round(u.hp * 100)}%`;
    }
  };
  raf = requestAnimationFrame(loop);
  return api;
}
