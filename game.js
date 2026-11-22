'use strict';
/* SOLMAR: Neon Heist — GTA-style open-world browser game.
   You are Dario Vega. Steal cars, dodge the cops, run three jobs
   and escape to the yacht with the money. Canvas + WebAudio. No assets. */

// ---------- tiny utils ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---------- canvas + HUD handles ----------
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const mm = document.getElementById('minimap');
const mmc = mm.getContext('2d');
const el = (id) => document.getElementById(id);
const hudHealth = el('healthFill'), hudMoney = el('money'), hudStars = el('stars'),
  hudObj = el('objective'), hudMission = el('mission'), hudBanner = el('banner'),
  hudAmmo = el('ammo'), hudSpeed = el('speed');

// ---------- audio ----------
let AC = null, engOsc = null, engGain = null, sirenOn = false, sirenHi = false, sirenInt = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type, vol, slide) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), ac.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur);
}
const sfx = {
  shoot() { tone(900, 0.08, 'square', 0.05, 180); },
  pickup() { tone(660, 0.1, 'sine', 0.09); setTimeout(() => tone(990, 0.16, 'sine', 0.09), 90); },
  crash() { tone(120, 0.25, 'sawtooth', 0.11, 40); },
  cash() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.09), i * 90)); },
  carjack() { tone(280, 0.16, 'square', 0.08, 620); },
  busted() { tone(440, 0.5, 'sawtooth', 0.1, 110); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.1), i * 130)); }
};
function sirenSet(on) {
  if (on === sirenOn) return;
  sirenOn = on;
  if (!on) { if (sirenInt) clearInterval(sirenInt); sirenInt = null; return; }
  sirenInt = setInterval(() => {
    sirenHi = !sirenHi;
    tone(sirenHi ? 950 : 700, 0.32, 'sine', 0.045);
  }, 340);
}
function engineStart() {
  const ac = audio(); if (!ac || engOsc) return;
  engOsc = ac.createOscillator(); engGain = ac.createGain();
  engOsc.type = 'sawtooth'; engOsc.frequency.setValueAtTime(50, ac.currentTime);
  engGain.gain.setValueAtTime(0.03, ac.currentTime);
  engOsc.connect(engGain); engGain.connect(ac.destination);
  engOsc.start();
}
function engineSet(frac) {
  if (engOsc) engOsc.frequency.setTargetAtTime(45 + frac * 110, AC.currentTime, 0.05);
}
function engineStop() {
  if (!engOsc) return;
  try { engOsc.stop(); } catch (e) { /* already stopped */ }
  engOsc = null; engGain = null;
}

// ---------- world: neon grid city ----------
const WORLD = 2400, ROAD_STEP = 300, ROAD_W = 70;
const ROAD_C = [];
for (let i = 0; i < 8; i++) ROAD_C.push(150 + i * ROAD_STEP);
const buildings = [], palms = [];
(function buildCity() {
  const rng = mulberry32(20261123);
  const neon = ['#ff2d95', '#00e5ff', '#ffe600', '#7c4dff', '#00ff9d', '#ff6b35'];
  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const x0 = 150 + bx * ROAD_STEP + ROAD_W / 2 + 12;
      const y0 = 150 + by * ROAD_STEP + ROAD_W / 2 + 12;
      const w = ROAD_STEP - ROAD_W - 24, h = ROAD_STEP - ROAD_W - 24;
      if (rng() < 0.5) {
        buildings.push({ x: x0, y: y0, w, h, c: pick(rng, neon), seed: randi(0, 999) });
      } else {
        buildings.push({ x: x0, y: y0, w: w * 0.46, h, c: pick(rng, neon), seed: randi(0, 999) });
        buildings.push({ x: x0 + w * 0.54, y: y0, w: w * 0.46, h, c: pick(rng, neon), seed: randi(0, 999) });
      }
      if (rng() < 0.55) palms.push({ x: x0 + rand(24, w - 24), y: y0 + rand(24, h - 24) });
    }
  }
})();
function pointInBuildings(x, y) {
  for (const b of buildings) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  return null;
}
function resolveCircle(x, y, r) {
  for (const b of buildings) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy, dd = dx * dx + dy * dy;
    if (dd < r * r) {
      if (dd > 0.01) { const d = Math.sqrt(dd); x = cx + dx / d * r; y = cy + dy / d * r; }
      else {
        const pl = x - b.x + r, pr = b.x + b.w - x + r, pt = y - b.y + r, pb = b.y + b.h - y + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x - r; else if (m === pr) x = b.x + b.w + r;
        else if (m === pt) y = b.y - r; else y = b.y + b.h + r;
      }
    }
  }
  return [clamp(x, 24, WORLD - 24), clamp(y, 24, WORLD - 24)];
}

// ---------- entities ----------
const CAR_COLORS = ['#ff4757', '#2ed573', '#ffa502', '#eccc68', '#70a1ff', '#ff7f50', '#a55eea', '#f368e0'];
const player = { x: 150, y: 300, angle: -Math.PI / 2, health: 100, money: 0, ammo: 24, onFoot: true, car: null, punchCd: 0, speed: 0 };
let wanted = 0, crimeTimer = 0, unseenTimer = 0, spawnTimer = 0, crimeCd = 0;
const cars = [], peds = [], cops = [], bullets = [], parts = [];
let gameState = 'title', missionIdx = 0, missionStage = 0, bankProgress = 0, playTime = 0;
let bannerTimer = 0;
const cam = { x: 0, y: 0 };

function makeCar(x, y, angle, color, o) {
  return Object.assign({ x, y, angle, speed: 0, color, driver: true, cop: false, parked: false, hp: 100, axis: 'x', dir: 1, lane: 0 }, o || {});
}
function spawnTraffic() {
  for (let i = 0; i < 16; i++) {
    const vertical = Math.random() < 0.5;
    const road = ROAD_C[randi(0, 7)];
    const along = rand(100, WORLD - 100);
    const c = makeCar(
      vertical ? road + rand(-16, 16) : along,
      vertical ? along : road + rand(-16, 16),
      vertical ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI),
      CAR_COLORS[i % CAR_COLORS.length]);
    c.axis = vertical ? 'y' : 'x';
    c.dir = (c.angle === 0 || c.angle === Math.PI / 2) ? 1 : -1;
    c.speed = rand(60, 120);
    c.lane = rand(-16, 16);
    cars.push(c);
  }
  // parked cars along road edges
  for (let i = 0; i < 10; i++) {
    const road = ROAD_C[randi(0, 7)];
    const along = rand(200, WORLD - 200);
    const vertical = Math.random() < 0.5;
    const c = makeCar(
      vertical ? road + 26 : along,
      vertical ? along : road + 26,
      vertical ? Math.PI / 2 : 0,
      CAR_COLORS[randi(0, CAR_COLORS.length - 1)]);
    c.parked = true; c.driver = false;
    cars.push(c);
  }
}
function spawnPeds() {
  for (let i = 0; i < 16; i++) {
    const road = ROAD_C[randi(0, 7)];
    const along = rand(100, WORLD - 100);
    const vertical = Math.random() < 0.5;
    const p = { x: vertical ? road + rand(-30, 30) : along, y: vertical ? along : road + rand(-30, 30), tx: 0, ty: 0, speed: rand(45, 70), c: CAR_COLORS[randi(0, CAR_COLORS.length - 1)], angle: 0 };
    pickPedTarget(p);
    peds.push(p);
  }
}
function pickPedTarget(p) {
  const road = ROAD_C[randi(0, 7)];
  const along = rand(100, WORLD - 100);
  const vertical = Math.random() < 0.5;
  p.tx = vertical ? road + rand(-30, 30) : along;
  p.ty = vertical ? along : road + rand(-30, 30);
}
function burst(x, y, c, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.3, spd);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), max: 0.8, c });
  }
}

// ---------- input ----------
const keys = {};
let mouseX = 0, mouseY = 0;
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key.toLowerCase() === 'e' && !e.repeat) tryEnterCar();
  if ((e.key === 'r' || e.key === 'R') && gameState !== 'playing') startGame();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
cv.addEventListener('mousemove', (e) => {
  const r = cv.getBoundingClientRect();
  mouseX = e.clientX - r.left; mouseY = e.clientY - r.top;
});
cv.addEventListener('mousedown', (e) => { if (e.button === 0) shoot(); });

function addWanted(n) {
  if (wanted >= 5) return;
  wanted = Math.min(5, wanted + n);
  crimeTimer = 8;
  unseenTimer = 0;
}
function nearestCar(maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of cars) {
    const dd = d2(player.x, player.y, c.x, c.y);
    if (dd < bd) { bd = dd; best = c; }
  }
  return best;
}
function tryEnterCar() {
  if (gameState !== 'playing') return;
  if (!player.onFoot) { // exit car
    const c = player.car;
    player.onFoot = true; player.car = null; player.speed = 0;
    player.x = c.x + Math.cos(c.angle + Math.PI / 2) * 30;
    player.y = c.y + Math.sin(c.angle + Math.PI / 2) * 30;
    const p = resolveCircle(player.x, player.y, 14);
    player.x = p[0]; player.y = p[1];
    engineStop();
    return;
  }
  const c = nearestCar(64);
  if (!c) return;
  if (c.cop) return; // can't steal a cop car
  if (c.driver) { // carjack!
    c.driver = false;
    addWanted(1);
    sfx.carjack();
    burst(c.x, c.y, '#ffffff', 8, 120);
    const flee = { x: c.x + rand(-40, 40), y: c.y + rand(-40, 40), tx: 0, ty: 0, speed: 110, c: '#ffffff', angle: 0 };
    pickPedTarget(flee);
    peds.push(flee);
  }
  player.onFoot = false; player.car = c; c.parked = false;
  engineStart();
}
function shoot() {
  if (gameState !== 'playing' || !player.onFoot || player.ammo <= 0) return;
  player.ammo--;
  const wx = cam.x + mouseX, wy = cam.y + mouseY;
  const a = Math.atan2(wy - player.y, wx - player.x);
  player.angle = a;
  bullets.push({ x: player.x + Math.cos(a) * 20, y: player.y + Math.sin(a) * 20, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: 0.9 });
  sfx.shoot();
  burst(player.x + Math.cos(a) * 24, player.y + Math.sin(a) * 24, '#ffe600', 3, 90);
}

// ---------- player update ----------
function updatePlayer(dt) {
  if (player.punchCd > 0) player.punchCd -= dt;
  const up = keys['w'] || keys['arrowup'], down = keys['s'] || keys['arrowdown'],
    left = keys['a'] || keys['arrowleft'], right = keys['d'] || keys['arrowright'];
  if (player.onFoot) {
    let mx = (right ? 1 : 0) - (left ? 1 : 0), my = (down ? 1 : 0) - (up ? 1 : 0);
    if (mx || my) {
      const m = Math.hypot(mx, my); mx /= m; my /= m;
      player.x += mx * 190 * dt; player.y += my * 190 * dt;
      player.angle = Math.atan2(my, mx);
    }
    const p = resolveCircle(player.x, player.y, 14);
    player.x = p[0]; player.y = p[1];
    player.speed = (mx || my) ? 190 : 0;
    if (wanted === 0 && player.health < 100) player.health = Math.min(100, player.health + 6 * dt);
  } else {
    const c = player.car;
    const accel = up ? 340 : down ? -220 : 0;
    c.speed = clamp(c.speed + accel * dt, -160, 430);
    if (!up && !down) c.speed *= Math.pow(0.4, dt); // coast / friction
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const spdFrac = Math.abs(c.speed) / 430;
    c.angle += steer * (c.speed >= 0 ? 1 : -1) * 2.4 * spdFrac * dt;
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    const hit = resolveCircle(nx, ny, 20);
    if (Math.abs(hit[0] - nx) > 0.5 || Math.abs(hit[1] - ny) > 0.5) {
      if (Math.abs(c.speed) > 200) { sfx.crash(); burst(c.x, c.y, '#ffb142', 10, 160); damageCar(c, 8); }
      c.speed *= 0.4;
    }
    c.x = hit[0]; c.y = hit[1];
    player.x = c.x; player.y = c.y; player.angle = c.angle; player.speed = Math.abs(c.speed);
    engineSet(spdFrac);
    // run over pedestrians
    if (Math.abs(c.speed) > 120) {
      for (let i = peds.length - 1; i >= 0; i--) {
        if (d2(c.x, c.y, peds[i].x, peds[i].y) < 26 * 26) {
          burst(peds[i].x, peds[i].y, '#ff4757', 12, 200);
          peds.splice(i, 1);
          addWanted(1); sfx.crash();
        }
      }
    }
  }
}
function damageCar(c, n) {
  c.hp -= n;
  if (c.hp <= 0) explodeCar(c);
}
function explodeCar(c) {
  burst(c.x, c.y, '#ff6b35', 26, 320);
  burst(c.x, c.y, '#ffe600', 18, 220);
  sfx.crash();
  const idx = cars.indexOf(c);
  if (idx >= 0) cars.splice(idx, 1);
  if (player.car === c) {
    player.car = null; player.onFoot = true; player.health -= 25;
    player.x = c.x + 30; player.y = c.y;
    const p = resolveCircle(player.x, player.y, 14);
    player.x = p[0]; player.y = p[1];
    engineStop();
    addWanted(1);
    if (player.health <= 0) endGame('wasted');
  }
}

// ---------- traffic / peds / cops ----------
function updateTraffic(dt) {
  for (const c of cars) {
    if (c.parked || c.cop) continue;
    if (c.axis === 'x') {
      c.x += c.dir * c.speed * dt;
      if (c.x < 40) c.x = WORLD - 40; else if (c.x > WORLD - 40) c.x = 40;
    } else {
      c.y += c.dir * c.speed * dt;
      if (c.y < 40) c.y = WORLD - 40; else if (c.y > WORLD - 40) c.y = 40;
    }
  }
}
function updateCarCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dd = d2(a.x, a.y, b.x, b.y);
      if (dd < 40 * 40 && dd > 0.01) {
        const d = Math.sqrt(dd), nx = (b.x - a.x) / d, ny = (b.y - a.y) / d, push = (40 - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        if ((a === player.car || b === player.car) && Math.abs(a.speed - b.speed) > 120) {
          if (crimeCd <= 0) { addWanted(1); crimeCd = 2; }
          sfx.crash();
          damageCar(a === player.car ? b : a, 6);
          const pa = a === player.car ? a : b;
          pa.speed *= 0.6;
        }
      }
    }
  }
}
function updatePeds(dt) {
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    p.angle = a;
    p.x += Math.cos(a) * p.speed * dt; p.y += Math.sin(a) * p.speed * dt;
    if (d2(p.x, p.y, p.tx, p.ty) < 12 * 12) pickPedTarget(p);
    const q = resolveCircle(p.x, p.y, 12); p.x = q[0]; p.y = q[1];
  }
  if (peds.length < 10 && Math.random() < dt * 0.5) { // keep the city alive
    const road = ROAD_C[randi(0, 7)];
    const p = { x: road + rand(-30, 30), y: rand(100, WORLD - 100), tx: 0, ty: 0, speed: rand(45, 70), c: CAR_COLORS[randi(0, CAR_COLORS.length - 1)], angle: 0 };
    pickPedTarget(p); peds.push(p);
  }
}
function spawnCop() {
  const a = rand(0, TAU);
  const sx = clamp(player.x + Math.cos(a) * 520, 60, WORLD - 60);
  const sy = clamp(player.y + Math.sin(a) * 520, 60, WORLD - 60);
  if (wanted >= 2 && Math.random() < 0.6) {
    const c = makeCar(sx, sy, 0, '#1e3799', { cop: true, hp: 120 });
    cars.push(c);
    cops.push({ onFoot: false, car: c, hp: 120, ramCd: 0 });
  } else {
    const p = resolveCircle(sx, sy, 14);
    cops.push({ onFoot: true, x: p[0], y: p[1], angle: 0, hp: 100, punchCd: 0 });
  }
}
function copTargets() {
  const wantCars = Math.min(5, wanted);
  const wantFoot = wanted >= 3 ? 2 : wanted >= 1 ? 1 : 0;
  let nCars = 0, nFoot = 0;
  for (const k of cops) { if (k.onFoot) nFoot++; else nCars++; }
  return { nCars, nFoot, wantCars, wantFoot };
}
function updateCops(dt) {
  spawnTimer -= dt;
  const t = copTargets();
  if (spawnTimer <= 0 && (t.nCars < t.wantCars || t.nFoot < t.wantFoot)) { spawnCop(); spawnTimer = 1.4; }
  for (let i = cops.length - 1; i >= 0; i--) {
    const k = cops[i];
    if (k.hp <= 0) { // cop down
      burst(k.onFoot ? k.x : k.car.x, k.onFoot ? k.y : k.car.y, '#ffffff', 14, 200);
      if (!k.onFoot) { const ci = cars.indexOf(k.car); if (ci >= 0) cars.splice(ci, 1); }
      cops.splice(i, 1);
      continue;
    }
    if (k.onFoot) {
      const a = Math.atan2(player.y - k.y, player.x - k.x);
      k.angle = a;
      k.x += Math.cos(a) * 205 * dt; k.y += Math.sin(a) * 205 * dt;
      const p = resolveCircle(k.x, k.y, 14); k.x = p[0]; k.y = p[1];
      k.punchCd -= dt;
      const dd = d2(k.x, k.y, player.x, player.y);
      if (dd < 24 * 24 && k.punchCd <= 0) {
        k.punchCd = 0.8;
        if (player.onFoot) {
          player.health -= 9; sfx.crash();
          if (player.health <= 0) endGame('wasted');
        } else if (player.car) {
          damageCar(player.car, 6);
        }
      }
    } else {
      const c = k.car;
      const want = Math.atan2(player.y - c.y, player.x - c.x);
      let da = want - c.angle;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      c.angle += clamp(da, -2.6 * dt, 2.6 * dt);
      c.speed = clamp(c.speed + 260 * dt, 0, 300 + wanted * 18);
      const nx = c.x + Math.cos(c.angle) * c.speed * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * dt;
      const hit = resolveCircle(nx, ny, 20);
      if (Math.abs(hit[0] - nx) > 0.5 || Math.abs(hit[1] - ny) > 0.5) c.speed *= 0.5;
      c.x = hit[0]; c.y = hit[1];
      k.ramCd -= dt;
      const dd = d2(c.x, c.y, player.x, player.y);
      if (dd < 34 * 34 && k.ramCd <= 0) {
        k.ramCd = 1.0;
        if (player.onFoot) { endGame('busted'); return; }
        damageCar(player.car, 14); sfx.crash();
        burst(c.x, c.y, '#ffb142', 8, 140);
        c.speed *= 0.3;
      }
    }
  }
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.x > WORLD || b.y < 0 || b.y > WORLD;
    if (!dead && pointInBuildings(b.x, b.y)) { burst(b.x, b.y, '#ffe600', 4, 100); dead = true; }
    if (!dead) {
      for (const c of cars) {
        if (d2(b.x, b.y, c.x, c.y) < 24 * 24) {
          damageCar(c, 22); burst(b.x, b.y, '#ffb142', 6, 140); dead = true;
          if (crimeCd <= 0) { addWanted(1); crimeCd = 2; }
          break;
        }
      }
    }
    if (!dead) {
      for (let j = cops.length - 1; j >= 0; j--) {
        const k = cops[j];
        if (!k.onFoot) continue;
        if (d2(b.x, b.y, k.x, k.y) < 16 * 16) {
          k.hp -= 34; burst(b.x, b.y, '#ffffff', 6, 140); dead = true;
          if (crimeCd <= 0) { addWanted(1); crimeCd = 2; }
          break;
        }
      }
    }
    if (!dead) {
      for (let j = peds.length - 1; j >= 0; j--) {
        if (d2(b.x, b.y, peds[j].x, peds[j].y) < 14 * 14) {
          burst(peds[j].x, peds[j].y, '#ff4757', 10, 180);
          peds.splice(j, 1); dead = true;
          if (crimeCd <= 0) { addWanted(1); crimeCd = 2; }
          break;
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}
function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
}
function updateWanted(dt) {
  if (crimeTimer > 0) crimeTimer -= dt;
  if (crimeCd > 0) crimeCd -= dt;
  sirenSet(wanted > 0);
  if (wanted > 0 && crimeTimer <= 0) {
    let seen = false;
    for (const k of cops) {
      const kx = k.onFoot ? k.x : k.car.x, ky = k.onFoot ? k.y : k.car.y;
      if (d2(kx, ky, player.x, player.y) < 350 * 350) { seen = true; break; }
    }
    if (!seen) {
      unseenTimer += dt;
      if (unseenTimer > 4) { wanted--; unseenTimer = 0; }
    } else unseenTimer = 0;
  }
}

// ---------- missions ----------
const MARKERS = {
  pickup: { x: 1950, y: 1950, c: '#ff2d95', label: 'PICKUP' },
  garage: { x: 450, y: 450, c: '#00ff9d', label: 'GARAGE' },
  safehouse: { x: 2250, y: 450, c: '#ffe600', label: 'SAFEHOUSE' },
  bank: { x: 750, y: 1650, c: '#ffa502', label: 'BANK' },
  yacht: { x: 150, y: 2250, c: '#00e5ff', label: 'YACHT' }
};
const MISSIONS = [
  { name: 'JOB 1 — NEON PICKUP', obj: ['Reach the pink marker', 'Bring the package back to the garage'] },
  { name: 'JOB 2 — GETAWAY', obj: ['Lose the heat (wanted to zero)', 'Reach the yellow safehouse'] },
  { name: 'JOB 3 — THE BIG SCORE', obj: ['Reach the bank', 'Hold E to crack the safe', 'Escape to the yacht'] }
];
function currentMarker() {
  if (missionIdx === 0) return missionStage === 0 ? MARKERS.pickup : MARKERS.garage;
  if (missionIdx === 1) return missionStage === 0 ? null : MARKERS.safehouse;
  return missionStage === 0 ? MARKERS.bank : missionStage === 1 ? MARKERS.bank : MARKERS.yacht;
}
function updateMissions(dt) {
  if (missionIdx === 0) {
    if (missionStage === 0 && d2(player.x, player.y, MARKERS.pickup.x, MARKERS.pickup.y) < 46 * 46) {
      missionStage = 1; player.money += 500; sfx.cash();
      showBanner('PACKAGE SECURED — $500! Take it to the garage');
    } else if (missionStage === 1 && d2(player.x, player.y, MARKERS.garage.x, MARKERS.garage.y) < 46 * 46) {
      missionIdx = 1; missionStage = 0; player.ammo += 12;
      wanted = 2; crimeTimer = 8;
      showBanner('JOB 1 DONE! The heat is on — lose the cops!');
      sfx.cash();
    }
  } else if (missionIdx === 1) {
    if (missionStage === 0 && wanted === 0) {
      missionStage = 1;
      showBanner('CLEAN! Now reach the safehouse');
      sfx.pickup();
    } else if (missionStage === 1 && d2(player.x, player.y, MARKERS.safehouse.x, MARKERS.safehouse.y) < 46 * 46) {
      missionIdx = 2; missionStage = 0; player.money += 800; player.ammo += 12;
      showBanner('JOB 2 DONE! +$800 — One last score: the bank');
      sfx.cash();
    }
  } else if (missionIdx === 2) {
    if (missionStage === 0 && d2(player.x, player.y, MARKERS.bank.x, MARKERS.bank.y) < 46 * 46) {
      missionStage = 1; bankProgress = 0;
      showBanner('HOLD E to crack the safe!');
    } else if (missionStage === 1) {
      const near = d2(player.x, player.y, MARKERS.bank.x, MARKERS.bank.y) < 60 * 60;
      if (near && player.onFoot && keys['e']) {
        bankProgress += dt;
        if (Math.random() < dt * 2) { wanted = Math.max(wanted, 3); crimeTimer = 8; }
        if (bankProgress >= 3) {
          missionStage = 2; player.money += 5000;
          showBanner('SAFE CRACKED! +$5000 — RUN to the yacht!');
          sfx.cash();
        }
      } else if (!near) {
        bankProgress = Math.max(0, bankProgress - dt * 2);
      }
    } else if (missionStage === 2 && d2(player.x, player.y, MARKERS.yacht.x, MARKERS.yacht.y) < 46 * 46) {
      endGame('win');
    }
  }
}

// ---------- rendering ----------
function drawCar(c) {
  ctx.save();
  ctx.translate(c.x - cam.x, c.y - cam.y);
  ctx.rotate(c.angle);
  ctx.fillStyle = c.cop ? '#1e3799' : c.color;
  ctx.fillRect(-20, -11, 40, 22);
  ctx.fillStyle = 'rgba(180,230,255,0.85)';
  ctx.fillRect(-6, -9, 12, 18);
  if (c.cop) {
    ctx.fillStyle = '#ff3838'; ctx.fillRect(-16, -11, 7, 5);
    ctx.fillStyle = '#2e86ff'; ctx.fillRect(-16, 6, 7, 5);
  }
  if (c.hp < 60) { ctx.fillStyle = 'rgba(255,107,53,0.85)'; ctx.fillRect(12, -8, 8, 16); }
  ctx.restore();
}
function drawPerson(x, y, angle, c) {
  ctx.save();
  ctx.translate(x - cam.x, y - cam.y);
  ctx.rotate(angle);
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffeaa7';
  ctx.beginPath(); ctx.arc(6, 0, 5, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawWorld() {
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + cv.width, y1 = cam.y + cv.height;
  // city blocks (sidewalk tone)
  ctx.fillStyle = '#171722';
  for (let bx = 0; bx < 7; bx++) for (let by = 0; by < 7; by++) {
    const x = 150 + bx * ROAD_STEP + ROAD_W / 2, y = 150 + by * ROAD_STEP + ROAD_W / 2;
    if (x + ROAD_STEP - ROAD_W < x0 || x > x1 || y + ROAD_STEP - ROAD_W < y0 || y > y1) continue;
    ctx.fillRect(x - cam.x, y - cam.y, ROAD_STEP - ROAD_W, ROAD_STEP - ROAD_W);
  }
  // roads
  ctx.fillStyle = '#23232e';
  for (const r of ROAD_C) {
    if (r + ROAD_W / 2 > x0 && r - ROAD_W / 2 < x1) ctx.fillRect(r - ROAD_W / 2 - cam.x, 0, ROAD_W, cv.height);
    if (r + ROAD_W / 2 > y0 && r - ROAD_W / 2 < y1) ctx.fillRect(0, r - ROAD_W / 2 - cam.y, cv.width, ROAD_W);
  }
  // centre dashes
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const r of ROAD_C) {
    if (r > y0 && r < y1) { ctx.moveTo(0, r - cam.y); ctx.lineTo(cv.width, r - cam.y); }
    if (r > x0 && r < x1) { ctx.moveTo(r - cam.x, 0); ctx.lineTo(r - cam.x, cv.height); }
  }
  ctx.stroke(); ctx.setLineDash([]);
  // mission marker
  const mk = currentMarker();
  if (mk && gameState === 'playing') {
    const pulse = 30 + Math.sin(performance.now() / 180) * 8;
    ctx.strokeStyle = mk.c; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(mk.x - cam.x, mk.y - cam.y, pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = mk.c; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(mk.label, mk.x - cam.x, mk.y - cam.y - pulse - 8);
    if (missionIdx === 2 && missionStage === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(mk.x - cam.x - 40, mk.y - cam.y + pulse + 6, 80, 10);
      ctx.fillStyle = '#ffa502';
      ctx.fillRect(mk.x - cam.x - 40, mk.y - cam.y + pulse + 6, 80 * (bankProgress / 3), 10);
    }
  }
  // palms
  for (const p of palms) {
    if (p.x < x0 - 20 || p.x > x1 + 20 || p.y < y0 - 20 || p.y > y1 + 20) continue;
    ctx.fillStyle = '#2ed573';
    ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a4a21';
    ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, 3, 0, TAU); ctx.fill();
  }
  // buildings with neon trim + windows
  for (const b of buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = '#1a1a26';
    ctx.fillRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
    ctx.strokeStyle = b.c; ctx.lineWidth = 3;
    ctx.strokeRect(b.x - cam.x + 1.5, b.y - cam.y + 1.5, b.w - 3, b.h - 3);
    const rng = mulberry32(b.seed);
    ctx.fillStyle = b.c;
    const cols = Math.floor(b.w / 26), rows = Math.floor(b.h / 26);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (rng() < 0.45) ctx.fillRect(b.x - cam.x + 10 + i * 26, b.y - cam.y + 10 + j * 26, 12, 12);
    }
  }
  // cars
  for (const c of cars) drawCar(c);
  // player-car marker
  if (!player.onFoot && player.car) {
    ctx.fillStyle = '#00ff9d';
    ctx.beginPath();
    ctx.moveTo(player.car.x - cam.x, player.car.y - cam.y - 26);
    ctx.lineTo(player.car.x - cam.x - 7, player.car.y - cam.y - 36);
    ctx.lineTo(player.car.x - cam.x + 7, player.car.y - cam.y - 36);
    ctx.closePath(); ctx.fill();
  }
  // pedestrians
  for (const p of peds) drawPerson(p.x, p.y, p.angle, p.c);
  // cops on foot
  for (const k of cops) if (k.onFoot) drawPerson(k.x, k.y, k.angle, '#1e3799');
  // player on foot
  if (player.onFoot) {
    drawPerson(player.x, player.y, player.angle, '#00ff9d');
    ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x - cam.x + Math.cos(player.angle) * 12, player.y - cam.y + Math.sin(player.angle) * 12);
    ctx.lineTo(player.x - cam.x + Math.cos(player.angle) * 24, player.y - cam.y + Math.sin(player.angle) * 24);
    ctx.stroke();
  }
  // bullets
  ctx.fillStyle = '#ffe600';
  for (const b of bullets) {
    ctx.beginPath(); ctx.arc(b.x - cam.x, b.y - cam.y, 3, 0, TAU); ctx.fill();
  }
  // particles
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, 4, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawMinimap() {
  const s = mm.width / WORLD;
  mmc.fillStyle = '#0c0c14';
  mmc.fillRect(0, 0, mm.width, mm.height);
  mmc.strokeStyle = '#3a3a4a'; mmc.lineWidth = 2;
  for (const r of ROAD_C) {
    mmc.beginPath(); mmc.moveTo(r * s, 0); mmc.lineTo(r * s, mm.height); mmc.stroke();
    mmc.beginPath(); mmc.moveTo(0, r * s); mmc.lineTo(mm.width, r * s); mmc.stroke();
  }
  const mk = currentMarker();
  if (mk && gameState === 'playing') {
    mmc.fillStyle = mk.c;
    mmc.beginPath(); mmc.arc(mk.x * s, mk.y * s, 5, 0, TAU); mmc.fill();
  }
  mmc.fillStyle = '#ffffff';
  for (const c of cars) { if (!c.cop) mmc.fillRect(c.x * s - 1, c.y * s - 1, 2, 2); }
  mmc.fillStyle = '#ff3838';
  for (const k of cops) {
    const kx = k.onFoot ? k.x : k.car.x, ky = k.onFoot ? k.y : k.car.y;
    mmc.beginPath(); mmc.arc(kx * s, ky * s, 3, 0, TAU); mmc.fill();
  }
  mmc.fillStyle = '#00ff9d';
  mmc.beginPath(); mmc.arc(player.x * s, player.y * s, 4, 0, TAU); mmc.fill();
}

// ---------- HUD + flow ----------
function updateHUD() {
  hudHealth.style.width = Math.max(0, player.health) + '%';
  hudHealth.style.background = player.health > 50 ? '#2ed573' : player.health > 25 ? '#ffa502' : '#ff4757';
  hudMoney.textContent = '$' + player.money.toLocaleString();
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '☆';
  hudStars.textContent = stars;
  hudStars.style.color = wanted > 0 ? '#ff4757' : '#888888';
  hudMission.textContent = MISSIONS[missionIdx].name;
  hudObj.textContent = '» ' + MISSIONS[missionIdx].obj[Math.min(missionStage, MISSIONS[missionIdx].obj.length - 1)];
  hudAmmo.textContent = player.onFoot ? ('AMMO ' + player.ammo) : '';
  hudSpeed.textContent = player.onFoot ? '' : ('SPEED ' + Math.round(Math.abs(player.car ? player.car.speed : 0) * 0.36) + ' km/h');
}
function showBanner(t) { hudBanner.textContent = t; bannerTimer = 4; }
function resetGame() {
  cars.length = 0; peds.length = 0; cops.length = 0; bullets.length = 0; parts.length = 0;
  player.x = 150; player.y = 300; player.angle = -Math.PI / 2; player.health = 100;
  player.money = 0; player.ammo = 24; player.onFoot = true; player.car = null; player.speed = 0;
  wanted = 0; crimeTimer = 0; unseenTimer = 0; spawnTimer = 0; crimeCd = 0;
  missionIdx = 0; missionStage = 0; bankProgress = 0; playTime = 0;
  spawnTraffic(); spawnPeds();
  el('titleScreen').style.display = 'none';
  el('endScreen').style.display = 'none';
  showBanner('JOB 1 — Steal a car, reach the pink marker!');
}
function startGame() {
  audio();
  resetGame();
  gameState = 'playing';
  engineStop(); sirenSet(false);
}
function endGame(kind) {
  engineStop(); sirenSet(false);
  gameState = kind;
  const end = el('endScreen'), title = el('endTitle'), sub = el('endSub');
  if (kind === 'win') {
    title.textContent = '🏆 YOU WIN!';
    sub.textContent = 'Dario escaped to the yacht with $' + player.money.toLocaleString() + ' in ' + Math.round(playTime) + 's. SOLMAR is yours!';
    sfx.win();
  } else if (kind === 'busted') {
    title.textContent = '🚔 BUSTED!';
    sub.textContent = 'The cops caught Dario. The money is gone. Press R to try again.';
    sfx.busted();
  } else {
    title.textContent = '💀 WASTED!';
    sub.textContent = "Dario didn't make it. Press R to try again.";
    sfx.busted();
  }
  end.style.display = 'flex';
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (gameState === 'playing') {
    playTime += dt;
    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) hudBanner.textContent = ''; }
    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updateCops(dt);
    updateBullets(dt);
    updateParticles(dt);
    updateWanted(dt);
    updateMissions(dt);
    updateCarCollisions();
    cam.x = clamp(player.x - cv.width / 2, 0, WORLD - cv.width);
    cam.y = clamp(player.y - cv.height / 2, 0, WORLD - cv.height);
  }
  drawWorld();
  drawMinimap();
  updateHUD();
}

// ---------- boot ----------
el('startBtn').addEventListener('click', startGame);
el('retryBtn').addEventListener('click', startGame);
spawnTraffic(); spawnPeds();
requestAnimationFrame(loop);
