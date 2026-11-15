// =============================================================
//  PIT WALL 26 — シミュレーション本体
// =============================================================
'use strict';
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const fmtT = t => { if (!isFinite(t)) return '-'; const m = Math.floor(t / 60); const s = (t - m * 60).toFixed(3).padStart(6, '0'); return `${m}:${s}`; };
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPEEDS = [1, 2, 5, 10, 25, 50, 100, 250, 500];

// ---------- 保存 ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('pw26_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pw26_' + k, JSON.stringify(v)); } catch (e) {} },
};
const zeroPoints = () => Object.fromEntries(Object.keys(STRENGTH_POINTS).map(k => [k, 0]));
let champ = store.get('champ26', null) || zeroPoints();
let roundIdx = store.get('round', 0);

const ALL_DRIVERS = [];
TEAMS.forEach(t => t.drivers.forEach(d => { d.team = t; ALL_DRIVERS.push(d); }));

// 2026年の実データ（平均グリッド位置・ランキング・リタイア率）からマシンとドライバーの強さを算出
function computePace() {
  const tg = TEAMS.map(t => t.drivers.reduce((s, d) => s + (AVG_GRID[d.code] || 15), 0) / t.drivers.length);
  const gmin = Math.min(...tg), gmax = Math.max(...tg);
  const pmax = Math.max(...Object.values(STRENGTH_POINTS), 1);
  TEAMS.forEach((t, i) => {
    t.pace = 1 - (tg[i] - gmin) / (gmax - gmin) * 0.5;
    t.points = t.drivers.reduce((s, d) => s + (champ[d.code] || 0), 0);
    t.reliability = (DNF_RATE_2026[t.realId] ?? 0.12) * 0.55;
    const [a, b] = t.drivers;
    t.drivers.forEach(d => {
      const mate = d === a ? b : a;
      const delta = (AVG_GRID[mate.code] || 15) - (AVG_GRID[d.code] || 15);
      d.skill = clamp(0.93 + clamp(delta * 0.008, -0.05, 0.05) + (STRENGTH_POINTS[d.code] || 0) / pmax * 0.04, 0.8, 0.995);
    });
  });
}
computePace();

// =============================================================
//  コース形状（Catmull-Rom スプライン → 弧長テーブル）
// =============================================================
function buildTrack(shape) {
  // 1) 元データを等間隔に再サンプリング → 2) ガウス平滑化でカクつきを除去 → 3) Catmull-Rom で補間
  const n0 = shape.length, seg = [0];
  for (let i = 1; i <= n0; i++) { const p = shape[i - 1], q = shape[i % n0]; seg.push(seg[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const per0 = seg[n0], M = 720, rs = [];
  for (let k = 0, j = 0; k < M; k++) {
    const t = k / M * per0; while (seg[j + 1] < t) j++;
    const p = shape[j], q = shape[(j + 1) % n0], u = (t - seg[j]) / ((seg[j + 1] - seg[j]) || 1);
    rs.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
  }
  const W = [1, 4, 8, 11, 12, 11, 8, 4, 1], wsum = W.reduce((a, b) => a + b, 0), sm = [];
  for (let i = 0; i < M; i++) { let x = 0, y = 0; W.forEach((w, k) => { const p = rs[(i + k - 4 + M) % M]; x += p[0] * w; y += p[1] * w; }); sm.push([x / wsum, y / wsum]); }
  const pts = [];
  const n = sm.length;
  for (let i = 0; i < n; i++) {
    const p0 = sm[(i - 1 + n) % n], p1 = sm[i], p2 = sm[(i + 1) % n], p3 = sm[(i + 2) % n];
    const per = 4;
    for (let k = 0; k < per; k++) { const t = k / per;
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  return {
    pts, cum, total,
    at(frac) { // frac 0..1 → [x,y,angle]
      frac = ((frac % 1) + 1) % 1;
      const target = frac * total;
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < target) lo = m; else hi = m; }
      const a = pts[lo % pts.length], b = pts[(lo + 1) % pts.length];
      const seg = cum[lo + 1] - cum[lo] || 1;
      const u = (target - cum[lo]) / seg;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
    },
  };
}

// 速度プロファイル：曲率からコーナーの限界速度を出し、加速・ブレーキ限界で前後に伝播
// （実車同様、コーナーで減速しストレートで加速する）。戻り値 vAt(frac) は m/s、T0 は1周の基準時間
function makeProfile(track, L) {
  const K = 2400, ds = L / K, ang = [], v = new Float32Array(K);
  for (let i = 0; i < K; i++) ang.push(track.at(i / K)[2]);
  const kap = new Float32Array(K);
  for (let i = 0; i < K; i++) { let d = ang[(i + 1) % K] - ang[i]; d = Math.atan2(Math.sin(d), Math.cos(d)); kap[i] = Math.abs(d) / ds; }
  const ks = new Float32Array(K);
  for (let i = 0; i < K; i++) { let t = 0; for (let k = -6; k <= 6; k++) t += kap[(i + k + K) % K]; ks[i] = t / 13; }
  const VMAX = 94, ALAT = 36;
  for (let i = 0; i < K; i++) v[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(ks[i], 1e-5)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i <= K; i++) { const a = v[(i - 1) % K], acc = 3 + 12 * (1 - a / VMAX); const lim = Math.sqrt(a * a + 2 * acc * ds); if (v[i % K] > lim) v[i % K] = lim; }
    for (let i = K - 1; i >= 0; i--) { const b = v[(i + 1) % K], lim = Math.sqrt(b * b + 2 * 42 * ds); if (v[i] > lim) v[i] = lim; }
  }
  let T0 = 0; for (let i = 0; i < K; i++) T0 += ds / v[i];
  return { T0, v, vAt(frac) { const f = (((frac % 1) + 1) % 1) * K, i = Math.floor(f), u = f - i; return v[i] * (1 - u) + v[(i + 1) % K] * u; } };
}

// 地形（木・建物・観客席）を決定論的に生成
function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function terrainFeatures(c) {
  let h = 0; for (const ch of c.id) h = h * 31 + ch.charCodeAt(0);
  const r = seeded(h + 7);
  const f = [];
  for (let i = 0; i < 70; i++) f.push({ type: r() < 0.7 ? 'tree' : 'bldg', x: r() * 100, y: r() * 100, s: 1 + r() * 2.5 });
  return f;
}

function drawTrack(ctx, w, h, c, track, opts = {}) {
  const k = Math.min(w, h) * 0.88 / 100, ox = (w - 100 * k) / 2, oy = (h - 100 * k) / 2;
  const sx = x => ox + x * k;
  const sy = y => oy + y * k;
  const night = c.night;
  // 地面
  ctx.fillStyle = night ? shade(c.terrain, -0.55) : c.terrain;
  ctx.fillRect(0, 0, w, h);
  if (c.water) { ctx.fillStyle = night ? '#0b1f33' : '#2a6fa8'; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.5, w * 0.18, h * 0.14, 0.3, 0, Math.PI * 2); ctx.fill(); }
  for (const f of (c._feat || (c._feat = terrainFeatures(c)))) {
    if (f.type === 'tree') { ctx.fillStyle = night ? 'rgba(0,30,0,.5)' : 'rgba(20,60,20,.55)'; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), f.s * w / 220, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = night ? 'rgba(255,220,140,.25)' : 'rgba(120,120,120,.5)'; ctx.fillRect(sx(f.x), sy(f.y), f.s * w / 120, f.s * w / 160); }
  }
  const path = () => { ctx.beginPath(); track.pts.forEach((p, i) => i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1]))); ctx.closePath(); };
  const tw = Math.max(opts.mini ? 3 : 5, Math.min(w, h) / (opts.mini ? 40 : 60));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  path(); ctx.strokeStyle = night ? '#3a3f2a' : '#9aa37a'; ctx.lineWidth = tw * 2.4; ctx.stroke(); // ランオフ
  path(); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = tw + 3; ctx.stroke();               // 白線
  path(); ctx.strokeStyle = '#d11'; ctx.setLineDash([tw * 0.6, tw * 0.6]); ctx.lineWidth = tw + 3; ctx.stroke(); ctx.setLineDash([]);
  path(); ctx.strokeStyle = opts.wet ? mix('#3b3e45', '#1d2836', opts.wet) : '#3b3e45'; ctx.lineWidth = tw; ctx.stroke();
  if (night) { path(); ctx.strokeStyle = 'rgba(255,240,200,.12)'; ctx.lineWidth = tw * 3.2; ctx.stroke(); }
  // ピットレーン
  const pl = [];
  for (let f = -0.035; f <= 0.035; f += 0.005) { const [x, y, a] = track.at(f); pl.push([sx(x) + Math.sin(a) * tw * 1.4, sy(y) - Math.cos(a) * tw * 1.4]); }
  ctx.beginPath(); pl.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.strokeStyle = '#555'; ctx.lineWidth = tw * 0.6; ctx.stroke();
  // ピットガレージ
  ctx.fillStyle = '#ccc';
  for (let i = 0; i < 11; i++) { const [x, y, a] = track.at(-0.03 + i * 0.006); ctx.save(); ctx.translate(sx(x) + Math.sin(a) * tw * 2.2, sy(y) - Math.cos(a) * tw * 2.2); ctx.rotate(a); ctx.fillStyle = TEAMS[i].color; ctx.fillRect(-tw * 0.4, -tw * 0.3, tw * 0.8, tw * 0.6); ctx.restore(); }
  // スタートライン
  const [x0, y0, a0] = track.at(0);
  ctx.save(); ctx.translate(sx(x0), sy(y0)); ctx.rotate(a0);
  for (let i = -3; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#000' : '#fff'; ctx.fillRect(j * tw / 6, i * tw / 6, tw / 6, tw / 6); }
  ctx.restore();
  return { sx, sy, tw };
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = v => clamp(Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k), 0, 255); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function mix(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const c = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t); return `rgb(${c(16)},${c(8)},${c(0)})`; }

// =============================================================
//  セットアップ画面
// =============================================================
// 選んだ選択肢（グランプリ・チーム・スタートタイヤ・オプション・倍速・カメラ）を保存して次回も復元
const prefs = store.get('prefs', {});
const savePrefs = () => store.set('prefs', prefs);
const setup = {
  circuit: CIRCUITS.find(c => c.id === prefs.circuit) || CIRCUITS[roundIdx % CIRCUITS.length],
  team: TEAMS.find(t => t.id === prefs.team) || TEAMS[0],
  tyres: Array.isArray(prefs.tyres) ? prefs.tyres.slice(0, 2) : ['M', 'M'], weather: null,
};
if ('radio' in prefs) $('#optRadio').checked = prefs.radio;
if ('autoSlow' in prefs) $('#optAutoSlow').checked = prefs.autoSlow;
$('#optRadio').onchange = () => { prefs.radio = $('#optRadio').checked; savePrefs(); };
$('#optAutoSlow').onchange = () => { prefs.autoSlow = $('#optAutoSlow').checked; savePrefs(); };
function chooseWeather(c) { return pick(c.weather); }

function renderSetup() {
  const sel = $('#circuitSel');
  sel.innerHTML = CIRCUITS.map((c, i) => `<option value="${i}">R${i + 1}  ${c.name} — ${c.track}</option>`).join('');
  sel.value = CIRCUITS.indexOf(setup.circuit);
  sel.onchange = () => { setup.circuit = CIRCUITS[+sel.value]; prefs.circuit = setup.circuit.id; savePrefs(); setup.weather = chooseWeather(setup.circuit); renderCircuitInfo(); };
  setup.weather = chooseWeather(setup.circuit);
  renderCircuitInfo();
  renderTeams();
}
function forecastText(wx) {
  if (!wx.rain.length) return '☀️ ドライ予報';
  if (wx.rain.some(r => r.s <= 0.02)) return '🌧️ スタート時から雨';
  return '🌦️ レース中に雨の可能性あり';
}
function renderCircuitInfo() {
  const c = setup.circuit;
  $('#circuitInfo').innerHTML = `<b>${c.track}</b>　${c.laps}周 / 1周 ${c.len.toFixed(3)} km / 総距離 ${(c.laps * c.len).toFixed(3)} km<br>
    持ち込み: <b>${c.comp}</b>（H/M/S）　ピットロス 約${c.pitLoss}秒　タイヤ攻撃性 ${'●'.repeat(Math.round(c.deg * 3))}　抜きにくさ ${'●'.repeat(Math.round(c.ovt * 5))}<br>
    天候: 過去の本番（${c.weather.map(w => w.year).join(', ')}）からランダム → <b>${forecastText(setup.weather)}</b><br>
    グリッド: <b>${REAL_GRIDS[c.id] ? '2026年の実際の決勝スターティンググリッド' : '未開催のため予選シミュレーション'}</b>`;
  const cv = $('#previewCanvas'); const ctx = cv.getContext('2d');
  c._track = c._track || buildTrack(c.shape);
  drawTrack(ctx, cv.width, cv.height, c, c._track);
  renderTyreSetup();
}
function renderTeams() {
  const sorted = [...TEAMS].sort((a, b) => b.pace - a.pace);
  $('#teamGrid').innerHTML = sorted.map(t => `<div class="team-card ${t === setup.team ? 'sel' : ''}" data-id="${t.id}">
    <div class="stripe" style="background:${t.color}"></div>
    <div class="tn">${t.name}</div><div class="td">${t.drivers.map(d => d.code).join(' / ')} · 今季 ${t.points}pt</div>
    <div class="pace"><i style="width:${Math.round((t.pace - 0.5) * 200)}%"></i></div></div>`).join('');
  document.querySelectorAll('.team-card').forEach(el => el.onclick = () => { setup.team = TEAMS.find(t => t.id === el.dataset.id); prefs.team = setup.team.id; savePrefs(); renderTeams(); renderTyreSetup(); });
}
function tyreBtn(k, sel, extra = '') { const c = COMPOUNDS[k]; return `<button class="tbtn ${sel ? 'sel' : ''}" data-k="${k}" ${extra} style="border-color:${c.color};color:${c.color}">${k}</button>`; }
function renderTyreSetup() {
  $('#tyreSetup').innerHTML = setup.team.drivers.map((d, i) => `<div class="tyre-row" data-i="${i}">
    <div class="dn">#${d.num} ${d.name}<small>${d.quirk}</small></div>
    ${['S', 'M', 'H', 'I', 'W'].map(k => tyreBtn(k, setup.tyres[i] === k)).join('')}</div>`).join('');
  document.querySelectorAll('#tyreSetup .tyre-row').forEach(row => row.querySelectorAll('.tbtn').forEach(b => b.onclick = () => { setup.tyres[+row.dataset.i] = b.dataset.k; prefs.tyres = setup.tyres; savePrefs(); renderTyreSetup(); }));
}

// =============================================================
//  レースシミュレーション
// =============================================================
let R = null; // race state

function qualifying(c) {
  const real = REAL_GRIDS[c.id];
  if (real) return real.map(code => ALL_DRIVERS.find(d => d.code === code)).filter(Boolean);
  // 予選：マシン速さ＋ドライバー一発の速さ＋ばらつき
  return ALL_DRIVERS.map(d => ({ d, t: (1 - d.team.pace) * 3.0 + (1 - d.skill) * 1.6 + gauss() * 0.18 + (setup.weather.rain.some(r => r.s <= 0.02) ? (1 - d.wet) * 2 : 0) }))
    .sort((a, b) => a.t - b.t).map(x => x.d);
}

function startRace() {
  const c = setup.circuit;
  c._track = c._track || buildTrack(c.shape);
  const grid = qualifying(c);
  const L = c.len * 1000;
  const prof = makeProfile(c._track, L);
  const wetStart = setup.weather.rain.find(r => r.s <= 0.02);
  R = {
    c, L, prof, track: c._track, wx: setup.weather, time: 0, leaderLap: 0, checkered: false, finished: false,
    sc: null, scCar: 0, wet: wetStart ? wetStart.i * 0.9 : 0, rainNow: 0, target: SPEEDS.includes(prefs.speed) ? prefs.speed : 10, slowUntil: 0, paused: false,
    radioOn: $('#optRadio').checked, autoSlow: $('#optAutoSlow').checked, finishOrder: [], yellow: 0, log: [],
    cars: grid.map((d, i) => {
      const player = d.team === setup.team;
      const pIdx = player ? d.team.drivers.indexOf(d) : -1;
      let tyre = player ? setup.tyres[pIdx] : aiStartTyre(c, d, i, wetStart);
      return {
        d, team: d.team, player, pIdx, grid: i + 1, dist: -i * 8 - 4, lap: 0, lapStart: 0, lastLap: NaN, bestLap: Infinity,
        tyre, wear: 0, age: 0, used: new Set([tyre]), mode: 'std', energy: 100, ovMode: false, box: null, nextTyre: player ? 'H' : null,
        pitTimer: 0, pitTotal: 0, pitStationary: 0, out: false, reason: '', stops: 0, finished: false, finishTime: 0,
        curLT: 0, cooldown: 0, passing: null, passUntil: 0, gapAhead: 99, stuck: 0, mismatchLaps: 0,
        pitAt: Math.round(rnd(62, 78)), radioCD: 0, damage: 0, posPrev: i + 1, penalty: 0,
      };
    }),
  };
  R.cars.forEach(car => car.curLT = lapTime(car));
  showScreen('race');
  buildRaceUI();
  R.is3d = false;
  if (window.THREE) { try { V3.init($('#view3d'), R); R.is3d = true; if (prefs.cam) V3.setMode(prefs.cam); } catch (e) { console.warn('3D init failed', e); } }
  $('#trackWrap').classList.toggle('is3d', R.is3d);
  $('#camBar').style.display = R.is3d ? '' : 'none';
  resizeCanvas(); if (R.is3d) V3.resize();
  addLog(`<b>${c.name}</b> スタート！ 天候データ: ${R.wx.year}年`);
  event('ライツアウト！', '#e10600');
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function aiStartTyre(c, d, gridPos, wetStart) {
  if (wetStart) return wetStart.i > 0.6 ? 'W' : 'I';
  // トップ10はミディアム中心、後方はハード/ソフトのギャンブルも
  const r = Math.random();
  if (c.deg > 1.2) return r < 0.7 ? 'M' : 'H';
  if (gridPos >= 10 && r < 0.35) return 'H';
  if (c.ovt > 0.7 && r < 0.3) return 'S';
  return r < 0.15 ? 'S' : 'M';
}

function rainAt(frac) {
  let v = 0;
  for (const r of R.wx.rain) {
    const ramp = 0.02;
    if (frac >= r.s - ramp && frac <= r.e + ramp) {
      const k = Math.min(1, (frac - (r.s - ramp)) / ramp, ((r.e + ramp) - frac) / ramp);
      v = Math.max(v, r.i * clamp(k, 0, 1));
    }
  }
  return v;
}

function idealTyre(wet) { return wet < 0.13 ? 'dry' : wet < 0.55 ? 'I' : 'W'; }
const isDry = t => t === 'S' || t === 'M' || t === 'H';

// 許容帯は重なりを持たせる（インターは幅広く使える）
function tyreMismatch(car) {
  const w = R.wet;
  if (isDry(car.tyre)) return w < 0.15 ? 0 : w < 0.55 ? 2 : 3;
  if (car.tyre === 'I') return w >= 0.08 && w <= 0.72 ? 0 : 1;
  return w >= 0.48 ? 0 : w >= 0.12 ? 1 : 2;
}

function lapTime(car) {
  const c = R.c, d = car.d, s = c.baseLap / 90, comp = COMPOUNDS[car.tyre], w = R.wet;
  if (R.sc && R.sc.type === 'SC') return c.baseLap * 1.48;
  let lt = c.baseLap;
  lt += (1 - car.team.pace) * 4.2 * s;
  lt += (1 - d.skill) * 3.0 * s;
  lt += car.damage * s;
  const equivLaps = car.wear * comp.life / 100;
  if (isDry(car.tyre)) {
    lt += comp.offset * s + comp.deg * equivLaps * s * c.deg;
    lt += Math.max(0, w - 0.12) * 48 * s;
  } else if (car.tyre === 'I') {
    lt += comp.deg * equivLaps * s * 0.6;
    lt += w < 0.15 ? (0.15 - w) * 16 * s + 1.2 * s : w > 0.6 ? (w - 0.6) * 20 * s : 0;
  } else {
    lt += comp.deg * equivLaps * s * 0.5;
    lt += w < 0.55 ? (0.55 - w) * 12 * s + 1.0 * s : 0;
  }
  if (car.wear > 72) lt += Math.pow((car.wear - 72) / 10, 2) * 0.45 * s; // タイヤの崖
  lt += w * 11 * s + w * (1 - d.wet) * 5 * s;              // 雨そのもの＋ウェット適性
  lt += (1 - Math.max(0, car.lap) / c.laps) * 2.7 * s;       // 燃料搭載量
  lt += car.mode === 'push' ? -0.32 * s : car.mode === 'save' ? 0.5 * s : 0;
  lt += car.ovMode ? -0.22 * s : 0;
  lt += gauss() * (0.1 + (1 - d.cons) * 0.55) * s;
  if (car.lap === 0) lt += 4.5 * s + (car.grid - 1) * 0.12;   // スタンディングスタート
  if (R.sc && R.sc.type === 'VSC') lt = Math.max(lt, c.baseLap * 1.36);
  return lt;
}

function wearPerLap(car) {
  const c = R.c, d = car.d, comp = COMPOUNDS[car.tyre];
  let k = (100 / comp.life) * (isDry(car.tyre) ? c.deg : 0.9);
  k *= 1.25 - d.tyre * 0.45;
  k *= 1 + (d.aggr - 0.6) * 0.25;
  k *= car.mode === 'push' ? 1.35 : car.mode === 'save' ? 0.72 : 1;
  if (car.tyre === 'I' && R.wet < 0.12) k *= 2.4;
  if (car.tyre === 'W' && R.wet < 0.4) k *= 2.8;
  if (isDry(car.tyre) && R.wet > 0.2) k *= 0.6;
  if (car.stuck > 0) k *= 1.12; // ダーティエア
  if (R.sc) k *= R.sc.type === 'SC' ? 0.3 : 0.45;
  return k;
}

// ---------- メインループ ----------
let lastFrame = 0;
function effectiveSpeed() { return performance.now() < R.slowUntil ? 1 : R.target; }
function loop(now) {
  if (!R || R.finished) return;
  const realDt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!R.paused) {
    let simDt = realDt * effectiveSpeed();
    const step = 0.2;
    let guard = 0;
    while (simDt > 0 && !R.finished && guard++ < 4000) { const dt = Math.min(step, simDt); tick(dt); simDt -= dt; }
  }
  drawRace();
  updateUI();
  if (!R.finished) requestAnimationFrame(loop);
}

// そのマシンの現在地での速度（m/s）：コーナーで遅く、ストレートで速い
function spAt(car) { return R.prof.vAt(car.dist / R.L) * R.prof.T0 / car.curLT; }

function running() { return R.cars.filter(c => !c.out && !c.finished); }
function order() {
  return [...R.cars].sort((a, b) => {
    if (a.out !== b.out) return a.out ? 1 : -1;
    if (a.out && b.out) return b.dist - a.dist;
    if (a.finished && b.finished) return a.finishRank - b.finishRank;
    if (a.finished !== b.finished) { // 完走者はゴールした周回数で比較
      const fa = a.finished ? R.c.laps : Math.floor(a.dist / R.L), fb = b.finished ? R.c.laps : Math.floor(b.dist / R.L);
      if (fa !== fb) return fb - fa;
      return a.finished ? -1 : 1;
    }
    return b.dist - a.dist;
  });
}

function tick(dt) {
  R.time += dt;
  const leader = order()[0];
  const frac = clamp(leader.dist / (R.L * R.c.laps), 0, 1);
  // ---- 天候 ----
  const prevRain = R.rainNow;
  R.rainNow = rainAt(frac);
  if (R.rainNow > R.wet) R.wet += (R.rainNow - R.wet) * dt / 70;
  else R.wet = Math.max(R.rainNow, R.wet - dt / 1100);
  if (prevRain < 0.05 && R.rainNow >= 0.05) { event('雨が降り始めた', '#2f7dff', true); addLog('🌧️ <b>雨</b>が降り始めました'); playerRadio(pick(RADIO.rain).replace('{n}', Math.ceil(rnd(1, 15)))); }
  if (prevRain >= 0.05 && R.rainNow < 0.05) { event('雨が止んだ', '#ffd400', true); addLog('🌤️ 雨が止みました'); }
  if (R.rainNow > 0.6 && prevRain <= 0.6) playerRadio(pick(RADIO.rainHeavy));
  // 雨の強さが変わったら（小雨⇄雨⇄強い雨）等倍に戻す
  const tier = r => r > 0.6 ? 3 : r > 0.25 ? 2 : r >= 0.05 ? 1 : 0;
  const t0 = tier(prevRain), t1 = tier(R.rainNow);
  if (t0 !== t1 && t0 > 0 && t1 > 0) { const nm = ['', '小雨', '雨', '強い雨'][t1]; event(`天候変化: ${nm}`, '#2f7dff', true); addLog(`🌧️ 雨が<b>${nm}</b>に変化`); }
  if (R._wetIdeal !== idealTyre(R.wet)) {
    if (R._wetIdeal) { const t = idealTyre(R.wet); addLog(`路面: <b>${t === 'dry' ? 'スリック' : COMPOUNDS[t].jp}</b>コンディション`); event(`路面: ${t === 'dry' ? 'スリック' : COMPOUNDS[t].jp}コンディション`, '#2fd34a', true); if (t === 'dry') playerRadio(pick(RADIO.drying)); }
    R._wetIdeal = idealTyre(R.wet);
  }

  // ---- 移動 ----
  const ord = order().filter(c => !c.out && !c.finished);
  const scOn = R.sc && R.sc.type === 'SC';
  for (let i = 0; i < ord.length; i++) {
    const car = ord[i];
    car.cooldown -= dt;
    if (car.pitTimer > 0) {
      car.pitTimer -= dt;
      if (car.pitTimer <= 0) pitExit(car);
      continue;
    }
    let sp = spAt(car);
    if (scOn && i > 0) { // SC中は隊列を詰める
      const gT = (ord[i - 1].dist - car.dist) / sp;
      if (ord[i - 1].pitTimer <= 0 && gT > 1.0 && gT < R.c.baseLap * 0.8) sp *= 1.35;
    }
    car.dist += sp * dt;
    // エネルギー（自動デプロイ＆回生）
    if (car.ovMode) car.energy = Math.max(0, car.energy - dt * 1.6);
    else car.energy = Math.min(100, car.energy + dt * (car.mode === 'save' ? 0.9 : car.mode === 'push' ? 0.25 : 0.55));
    if (car.dist >= (car.lap + 1) * R.L) onLap(car);
  }

  // ---- バトル／オーバーテイク ----
  const ord2 = order().filter(c => !c.out && !c.finished && c.pitTimer <= 0);
  for (let i = 1; i < ord2.length; i++) {
    const a = ord2[i - 1], b = ord2[i];
    const sp = spAt(b);
    const gap = a.dist - b.dist;
    if (gap > R.L * 0.5) { b.gapAhead = 99; b.ovMode = false; continue; }
    const gT = gap / sp;
    b.gapAhead = gT;
    // 2026 オーバーテイクモード：前車と1秒以内で追加デプロイ（ドライバーが自動使用）
    b.ovMode = !R.sc && gT < 1.0 && b.energy > 15 && b.lap >= 1;
    const minGap = (scOn ? 0.55 : 0.2) * sp;
    if (gap >= minGap) { if (gT > 1.2) b.stuck = 0; continue; }
    if (b.passing === a && R.time < b.passUntil) continue;
    const faster = a.curLT - b.curLT;
    if (!R.sc && faster > 0.05 * (R.c.baseLap / 90) && b.cooldown <= 0 && !R.yellow) {
      b.cooldown = b.curLT * 0.33;
      const s = R.c.baseLap / 90;
      let p = 0.12 + (faster / s) * 0.3 + (b.d.ovt - 0.75) * 0.7 + (b.ovMode ? 0.12 : 0) - R.c.ovt * 0.28 - (a.d.ovt - 0.75) * 0.3;
      p *= 0.8 + b.d.aggr * 0.4;
      if (Math.random() < clamp(p, 0.015, 0.85)) {
        b.passing = a; b.passUntil = R.time + 2.5; b.stuck = 0;
        if (b.player) radio(b, pick(RADIO.pass));
        if (a.player && Math.random() < 0.6) radio(a, pick(RADIO.passed));
        // 接触リスク
        if (Math.random() < 0.0035 * (a.d.aggr + b.d.aggr) * (1 + R.wet * 2)) collision(a, b);
        continue;
      }
    }
    b.dist = a.dist - minGap;
    b.stuck += dt;
    if (b.player && b.stuck > b.curLT * 4 && Math.random() < 0.01) { radio(b, pick(RADIO.blocked).replace('{car}', a.d.code)); b.stuck = 0; }
  }

  if (R.yellow > 0) R.yellow -= dt;
  if (running().length === 0 && !R.finished) finishRace();
}

function onLap(car) {
  car.lap++;
  const over = (car.dist - car.lap * R.L) / spAt(car); // ティック内の超過分を補間
  const tNow = R.time - Math.max(0, over);
  const lt = tNow - car.lapStart; car.lapStart = tNow;
  if (car.lap > 1) { car.lastLap = lt; if (lt < car.bestLap) car.bestLap = lt; }
  car.wear = Math.min(100, car.wear + wearPerLap(car));
  car.age++;
  const c = R.c;

  // ゴール判定
  if (R.checkered || (car.lap >= c.laps)) {
    if (!R.checkered) { R.checkered = true; R.leaderLap = c.laps; addLog(`🏁 <b>${car.d.name}</b> がチェッカー！`); event('チェッカーフラッグ', '#fff'); }
    car.finished = true; car.finishTime = tNow; car.finishRank = R.finishOrder.length; R.finishOrder.push(car);
    return;
  }
  // リーダー周回
  const isLeader = order()[0] === car;
  if (isLeader) {
    R.leaderLap = car.lap;
    if (R.sc && car.lap >= R.sc.until) endSC();
    if (car.lap === c.laps - 1) event('ファイナルラップ', '#fff');
    if (car.lap === c.laps - 10) checkCompoundRule();
  }
  // トラブル・クラッシュ判定
  const mm = tyreMismatch(car);
  const pRel = car.team.reliability / c.laps * (1 + R.wet * 0.5);
  let pCrash = (0.03 + (1 - car.d.cons) * 0.13) / c.laps * (1 + R.wet * 2.2) * (car.mode === 'push' ? 1.3 : 1) * (1 + (car.d.aggr - 0.6));
  if (mm >= 2) pCrash *= 4 * mm;
  if (car.wear > 92) pCrash *= 3;
  if (R.sc) pCrash *= 0.1;
  if (car.lap > 0 && Math.random() < pRel) { retire(car, 'failure'); return; }
  if (car.lap > 0 && Math.random() < pCrash) { retire(car, 'crash'); return; }

  // 戦略
  if (!car.player) aiStrategy(car);
  else playerChecks(car);

  if (car.box) { pitEnter(car); return; }
  car.curLT = lapTime(car);
}

function playerChecks(car) {
  const mm = tyreMismatch(car);
  if (mm >= 1) { car.mismatchLaps++; if (car.mismatchLaps === 1 || car.mismatchLaps % 3 === 0) { radio(car, mm >= 2 ? pick(RADIO.rainHeavy) : idealTyre(R.wet) === 'dry' ? pick(RADIO.drying) : 'このタイヤじゃ合わない、交換しよう', true); event(`${car.d.code}: タイヤが路面に合っていない`, '#ffd400'); } }
  else car.mismatchLaps = 0;
  if (car.wear > 70 && !car._warned70) { car._warned70 = true; radio(car, pick(RADIO.tyresGone)); event(`${car.d.code}: ピットの検討タイミング（摩耗 ${Math.round(car.wear)}%）`, '#ff8a1f', true); }
  if (car.wear > 85 && !car._warned85) { car._warned85 = true; if (car.d.temper > 0.5) radio(car, pick(RADIO.complainStrat), true); else radio(car, pick(RADIO.tyresGone), true); event(`${car.d.code}: タイヤの崖！`, '#e10600', true); }
  // ドライバーの性格：戦略眼のあるドライバーは自分から提案
  if (car.d.quirk.includes('提案') && car.wear > 60 && Math.random() < 0.2 && !car.box) radio(car, 'そろそろボックスしたほうがいいと思う');
  if (car.d.temper > 0.7 && car.stuck > 0 && Math.random() < 0.08) radio(car, 'アンダーカットを狙おう、早く入れてくれ！');
}

function aiStrategy(car) {
  const c = R.c, left = c.laps - car.lap;
  const ideal = idealTyre(R.wet);
  const mm = tyreMismatch(car);
  if (mm >= 1) { car.mismatchLaps++; if (car.mismatchLaps >= (mm >= 2 ? 1 : 2) + (Math.random() < 0.4 ? 1 : 0) && left > 1) { car.box = ideal === 'dry' ? chooseDry(car, left, true) : ideal; return; } }
  else car.mismatchLaps = 0;
  if (left <= 2) return;
  if (!isDry(car.tyre)) { if (car.wear > car.pitAt + 8 && left > 5) car.box = car.tyre; return; }
  // SC中のチープストップ
  if (R.sc && R.leaderLap <= R._scFreshLap + 1 && car.wear > 28 && left > 6) { car.box = chooseDry(car, left); return; }
  // 2コンパウンドルールのための最終スティント
  const needRule = !R.anyWet && [...car.used].filter(isDry).length < 2;
  if (car.wear >= car.pitAt || (car.wear > 55 && left * wearPerLap(car) > 100 - car.wear + 25 && left < 12) || (needRule && left <= 6)) {
    car.box = chooseDry(car, left);
  }
}
function chooseDry(car, left, fromWet) {
  const lifeLeft = k => COMPOUNDS[k].life * (0.78 / R.c.deg) * (1.25 - car.d.tyre * 0.45) ** -1;
  const usedDry = [...car.used].filter(isDry);
  let opts = ['S', 'M', 'H'];
  if (!R.anyWet && usedDry.length === 1 && !fromWet) opts = opts.filter(k => k !== usedDry[0]);
  let best = opts.find(k => lifeLeft(k) >= left) || 'H';
  if (!opts.includes(best)) best = opts[opts.length - 1];
  return best;
}

function pitEnter(car) {
  const c = R.c;
  const stationary = car.team.pitCrew + Math.abs(gauss()) * 0.35 + (Math.random() < 0.045 ? rnd(2, 9) : 0) + (car.damage ? 6 : 0);
  const loss = c.pitLoss * (R.sc ? (R.sc.type === 'SC' ? 0.55 : 0.62) : 1);
  car.pitStationary = stationary; car.pitTotal = loss + stationary; car.pitTimer = car.pitTotal;
  car.newTyre = car.box; car.box = null; car.stops++;
  car.dist = car.lap * R.L; // ピットはコントロールライン上で処理
  if (car.player) {
    addLog(`🔧 <b>${car.d.code}</b> ピットイン → ${COMPOUNDS[car.newTyre].jp}`);
    event(`${car.d.code} BOX BOX`, car.team.color, true);
    car._pitAnimStart = R.time;
  }
}
function pitExit(car) {
  car.tyre = car.newTyre; car.used.add(car.tyre); if (!isDry(car.tyre)) R.anyWet = true;
  car.wear = 0; car.age = 0; car.damage = 0; car._warned70 = car._warned85 = false; car.mismatchLaps = 0;
  car.curLT = lapTime(car) + (R.c.baseLap / 90) * 1.2; // アウトラップ
  if (car.player) {
    const st = car.pitStationary;
    addLog(`⏱️ <b>${car.d.code}</b> 静止時間 ${st.toFixed(1)}秒`);
    if (st < car.team.pitCrew + 0.15) radio(car, pick(RADIO.pitGood));
    else if (st > car.team.pitCrew + 1.5) radio(car, pick(RADIO.pitBad));
    event(`${car.d.code} ピットアウト P${order().indexOf(car) + 1}`, car.team.color);
  }
}

function collision(a, b) {
  const victim = Math.random() < 0.5 ? a : b;
  addLog(`💥 <b>${a.d.code}</b> と <b>${b.d.code}</b> が接触！`);
  if (Math.random() < 0.45) retire(victim, 'crash');
  else { victim.damage = rnd(0.4, 1.4); if (!victim.player) victim.box = victim.tyre === 'S' ? 'M' : victim.tyre; if (victim.player) { radio(victim, 'フロントウイングが壊れた！', true); event(`${victim.d.code}: ダメージ`, '#e10600'); } }
}

function retire(car, kind) {
  car.out = true; car.reason = kind === 'crash' ? 'クラッシュ' : 'トラブル'; car.ovMode = false;
  addLog(`${kind === 'crash' ? '💥' : '⚙️'} <b>${car.d.name}</b> ${car.reason}でリタイア（L${car.lap}）`);
  if (car.player) radio(car, pick(kind === 'crash' ? RADIO.crash : RADIO.failure), true);
  event(`${car.d.code} リタイア`, '#e10600');
  // 事故の度合いで SC / VSC / 黄旗
  const r = Math.random();
  let type = 'SC'; // リタイアが出たら必ずセーフティカー
  if (R.checkered || R.leaderLap >= R.c.laps - 1) type = null;
  if (!type) { R.yellow = R.c.baseLap * 0.5; return; }
  deploySC(type);
}

function deploySC(type) {
  const c = R.c;
  const laps = type === 'SC' ? Math.max(2, Math.round(c.scLaps + rnd(-1, 2))) : Math.round(rnd(2, 3.4));
  if (R.sc) { R.sc.until = Math.max(R.sc.until, R.leaderLap + laps); if (type === 'SC' && R.sc.type === 'VSC') { R.sc.type = 'SC'; } }
  else R.sc = { type, until: R.leaderLap + laps, fresh: true };
  R.scCar = 0;
  addLog(`🚨 <b>${type === 'SC' ? 'セーフティカー' : 'バーチャル・セーフティカー'}</b>（約${laps}周）`);
  event(type === 'SC' ? 'SAFETY CAR' : 'VIRTUAL SAFETY CAR', '#ffd400', true);
  R.cars.filter(c => c.player && !c.out).forEach(c => { if (Math.random() < 0.6) radio(c, pick(RADIO.sc), true); });
  R.cars.forEach(c => { if (!c.out && !c.finished && c.pitTimer <= 0) c.curLT = lapTime(c); });
  R._scFreshLap = R.leaderLap;
}
function endSC() {
  addLog(`🟢 ${R.sc.type} 終了、グリーンフラッグ`);
  event(R.sc.type === 'SC' ? 'SC IN THIS LAP → GREEN' : 'VSC ENDING → GREEN', '#2fd34a', true);
  R.sc = null;
  R.cars.forEach(c => { if (!c.out && !c.finished && c.pitTimer <= 0) c.curLT = lapTime(c); });
}
function checkCompoundRule() {
  if (R.anyWet) return;
  R.cars.filter(c => c.player && !c.out).forEach(c => {
    if ([...c.used].filter(isDry).length < 2) { radio(c, '2種類目のコンパウンドをまだ使ってないぞ！', true); event(`${c.d.code}: 2コンパウンド義務 未消化`, '#e10600', true); }
  });
}

function finishRace() {
  R.finished = true;
  // 2コンパウンドルール違反は失格
  const res = order();
  res.forEach(c => { if (!c.out && !R.anyWet && [...c.used].filter(isDry).length < 2) { c.dsq = true; } });
  const classified = res.filter(c => !c.out && !c.dsq);
  classified.forEach((c, i) => { c.pos = i + 1; c.pts = POINTS[i] || 0; champ[c.d.code] = (champ[c.d.code] || 0) + c.pts; });
  store.set('champ26', champ);
  roundIdx = CIRCUITS.indexOf(R.c) + 1; store.set('round', roundIdx);
  R.cars.filter(c => c.player).forEach(c => {
    if (c.out || c.dsq) return;
    radio(c, pick(c.pos === 1 ? RADIO.win : c.pos <= 3 ? RADIO.podium : c.pos <= 10 ? RADIO.points : RADIO.noPoints), true);
  });
  computePace();
  setTimeout(() => showPodium(res, classified), 1200);
}

// =============================================================
//  無線・イベント
// =============================================================
let ttsQueue = 0;
function radio(car, text, important) {
  if (!car.player) return;
  const cd = important ? 6 : car.curLT * 2; // 重要でない無線は2周に1回まで
  if (R.time - car.radioCD < cd && !R.finished) return;
  car.radioCD = R.time;
  const feed = $('#radioFeed');
  const el = document.createElement('div');
  el.className = 'radio-msg'; el.style.borderColor = car.team.color;
  el.innerHTML = `<b>📻 ${car.d.name}</b>${text}`;
  feed.appendChild(el);
  while (feed.children.length > 3) feed.removeChild(feed.firstChild);
  setTimeout(() => el.remove(), 6000);
  addLog(`📻 <b>${car.d.code}</b>「${text}」`);
  if (R.radioOn && 'speechSynthesis' in window && ttsQueue < 2) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.rate = 1.15 + car.d.temper * 0.2; u.pitch = 0.8 + car.pIdx * 0.3;
    ttsQueue++; u.onend = u.onerror = () => ttsQueue--;
    speechSynthesis.speak(u);
  }
}
function playerRadio(text) { const c = R.cars.find(c => c.player && !c.out && !c.finished); if (c) radio(c, text); }
function slowDown() { if (R && R.autoSlow && R.target > 1) R.slowUntil = performance.now() + 8000; }
function event(text, color, slow) {
  const b = $('#eventBanner'); if (!b) return;
  b.textContent = text; b.style.display = 'block'; b.style.background = color; b.style.color = ['#fff', '#ffd400', '#2fd34a', '#ff8a1f'].includes(color) || color.startsWith('#e8') ? '#000' : '#fff';
  clearTimeout(event._t); event._t = setTimeout(() => b.style.display = 'none', 2600);
  if (slow) slowDown();
}
function addLog(html) {
  const lap = R ? `L${R.leaderLap}` : '';
  const d = document.createElement('div'); d.innerHTML = `<span style="color:#666">${lap}</span> ${html}`;
  const log = $('#log'); log.prepend(d); while (log.children.length > 80) log.lastChild.remove();
}

// =============================================================
//  レース画面 UI
// =============================================================
function buildRaceUI() {
  $('#speedBar').innerHTML = SPEEDS.map(s => `<button data-s="${s}" class="${s === R.target ? 'sel' : ''}">${s}x</button>`).join('') + '<span class="cur" id="curSpeed"></span>';
  $('#speedBar').querySelectorAll('button').forEach(b => b.onclick = () => { R.target = +b.dataset.s; R.slowUntil = 0; prefs.speed = R.target; savePrefs(); $('#speedBar').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); });
  const pl = R.cars.filter(c => c.player).sort((a, b) => a.pIdx - b.pIdx);
  const cams = [['top', '俯瞰'], ['heli', 'ヘリ'], ['tv', '中継'], ['chase', '1台追尾']];
  const foc = [['p0', pl[0].d.code], ['p1', pl[1].d.code], ['leader', 'トップ']];
  $('#camBar').innerHTML = cams.map(([k, l]) => `<button data-cam="${k}" class="${k === (prefs.cam || 'chase') ? 'sel' : ''}">${l}</button>`).join('') + '<span class="sep"></span>' +
    foc.map(([k, l]) => `<button data-foc="${k}" class="${k === 'p0' ? 'sel' : ''}">${l}</button>`).join('');
  $('#camBar').querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { V3.setMode(b.dataset.cam); prefs.cam = b.dataset.cam; savePrefs(); $('#camBar').querySelectorAll('[data-cam]').forEach(x => x.classList.toggle('sel', x === b)); });
  $('#camBar').querySelectorAll('[data-foc]').forEach(b => b.onclick = () => setFocus(b.dataset.foc));
  $('#tower').onclick = e => { const row = e.target.closest('.trow'); if (row && R.is3d) setFocus('code:' + row.dataset.code); };
  $('#btnPause').onclick = () => { R.paused = !R.paused; $('#btnPause').textContent = R.paused ? '▶' : '⏸'; };
  $('#btnRadioToggle').onclick = () => { R.radioOn = !R.radioOn; $('#btnRadioToggle').style.opacity = R.radioOn ? 1 : 0.4; if (!R.radioOn) speechSynthesis && speechSynthesis.cancel(); };
  $('#btnRadioToggle').style.opacity = R.radioOn ? 1 : 0.4;
  $('#log').innerHTML = '';
  const cards = R.cars.filter(c => c.player).sort((a, b) => a.pIdx - b.pIdx);
  $('#carCards').innerHTML = cards.map(c => `<div class="card" id="card${c.pIdx}" style="border-color:${c.team.color}">
    <div class="hd"><div class="nm">#${c.d.num} ${c.d.name}<small>${c.d.quirk}</small></div><div class="pos">P-</div></div>
    <div class="stats">
      <div>タイヤ<b class="ty"></b></div><div>摩耗<b class="wr"></b><div class="bar"><i class="wrb"></i></div></div>
      <div>ERS<b class="en"></b><div class="bar"><i class="enb" style="background:#00d2ff"></i></div></div><div>前車差<b class="ga"></b></div>
      <div>前周<b class="ll"></b></div><div>ベスト<b class="bl"></b></div><div>ストップ<b class="st"></b></div><div>モード<b class="ov"></b></div>
    </div>
    <div class="ctl"><span class="lbl">ドライビング指示</span>
      <button class="modebtn" data-m="save">セーブ</button><button class="modebtn" data-m="std">スタンダード</button><button class="modebtn" data-m="push">プッシュ</button></div>
    <div class="ctl"><span class="lbl">次のタイヤ</span>${['S', 'M', 'H', 'I', 'W'].map(k => tyreBtn(k, c.nextTyre === k)).join('')}</div>
    <div class="ctl"><button class="boxbtn">BOX</button></div>
    <canvas class="pitcanvas" width="400" height="70"></canvas>
    <div class="status"></div></div>`).join('');
  cards.forEach(c => {
    const el = $('#card' + c.pIdx);
    el.querySelectorAll('.modebtn').forEach(b => b.onclick = () => { c.mode = b.dataset.m; });
    el.querySelectorAll('.tbtn').forEach(b => b.onclick = () => { c.nextTyre = b.dataset.k; if (c.box) c.box = c.nextTyre; el.querySelectorAll('.tbtn').forEach(x => x.classList.toggle('sel', x === b)); });
    el.querySelector('.boxbtn').onclick = () => {
      if (c.out || c.finished) return;
      if (c.box) { c.box = null; addLog(`<b>${c.d.code}</b> ボックス取り消し`); }
      else { c.box = c.nextTyre; addLog(`📣 <b>${c.d.code}</b> にボックス指示（${COMPOUNDS[c.box].jp}）`); c.radioCD = -99; radio(c, pick(RADIO.boxConfirm), true); }
    };
  });
  resizeCanvas();
}
function setFocus(f) {
  if (!R.is3d) return;
  V3.setFocus(f); R.focus = f;
  $('#camBar').querySelectorAll('[data-foc]').forEach(x => x.classList.toggle('sel', x.dataset.foc === f));
}
function resizeCanvas() {
  const cv = $('#trackCanvas'); const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round((R && R.is3d ? r.width : r.width * 0.75) * dpr);
  if (R) R._mmKey = null;
}
window.addEventListener('resize', () => { if (R && !R.finished) { resizeCanvas(); if (R.is3d) V3.resize(); } });

let uiTick = 0;
function updateUI() {
  const c = R.c; const ord = order(); const leader = ord[0];
  $('#lapInfo').textContent = `LAP ${Math.min(c.laps, R.leaderLap + 1)}/${c.laps}`;
  const f = $('#flagInfo');
  if (R.checkered) { f.className = 'flag chk'; f.textContent = 'CHEQUERED'; }
  else if (R.sc) { f.className = 'flag ' + R.sc.type.toLowerCase(); f.textContent = R.sc.type; }
  else if (R.yellow > 0) { f.className = 'flag yel'; f.textContent = 'YELLOW'; }
  else { f.className = 'flag green'; f.textContent = 'GREEN'; }
  const rainTxt = R.rainNow > 0.6 ? '🌧️ 強い雨' : R.rainNow > 0.25 ? '🌧️ 雨' : R.rainNow > 0.03 ? '🌦️ 小雨' : '☀️ 晴れ';
  $('#weatherInfo').innerHTML = `${rainTxt}　路面 ${R.wet < 0.05 ? 'ドライ' : R.wet < 0.13 ? 'ダンプ' : R.wet < 0.55 ? 'ウェット' : 'ヘビーウェット'}（${Math.round(R.wet * 100)}%）<br>${c.name}`;
  $('#curSpeed').textContent = `実行 ${effectiveSpeed()}x`;
  if (uiTick++ % 6) return; // 以下は重いので間引き

  const refSp = R.L / c.baseLap;
  $('#tower').innerHTML = ord.map((car, i) => {
    let g;
    if (car.out) g = 'DNF';
    else if (car.finished && R.finished && car.dsq) g = 'DSQ';
    else if (i === 0) g = car.finished ? 'WIN' : 'LEADER';
    else {
      const dl = leader.dist - car.dist;
      if (car.finished) g = '+' + fmtGap(car.finishTime - leader.finishTime);
      else if (dl >= R.L && !leader.finished) g = `+${Math.floor(dl / R.L)}L`;
      else g = '+' + fmtGap(dl / refSp);
    }
    if (car.pitTimer > 0) g = 'PIT';
    const t = COMPOUNDS[car.tyre];
    return `<div class="trow ${car.player ? 'me' : ''} ${car.out ? 'out' : ''} ${R.focus === 'code:' + car.d.code ? 'focus' : ''}" data-code="${car.d.code}"><span class="p">${i + 1}</span><span class="c" style="background:${car.team.color}"></span>
      <span class="cd">${car.d.code}</span><span class="g">${g}</span><span class="tdot" style="border-color:${t.color};color:${t.color}">${car.age}</span></div>`;
  }).join('');

  R.cars.filter(x => x.player).forEach(car => {
    const el = $('#card' + car.pIdx); if (!el) return;
    const pos = ord.indexOf(car) + 1;
    el.querySelector('.pos').textContent = car.out ? 'DNF' : 'P' + pos;
    const t = COMPOUNDS[car.tyre];
    el.querySelector('.ty').innerHTML = `<span style="color:${t.color}">${t.jp}</span> ${car.age}周`;
    el.querySelector('.wr').textContent = Math.round(car.wear) + '%';
    const wb = el.querySelector('.wrb'); wb.style.width = car.wear + '%'; wb.style.background = car.wear > 75 ? '#e10600' : car.wear > 50 ? '#ffd400' : '#2fd34a';
    el.querySelector('.en').textContent = Math.round(car.energy) + '%';
    el.querySelector('.enb').style.width = car.energy + '%';
    el.querySelector('.ga').textContent = car.gapAhead < 50 && pos > 1 ? car.gapAhead.toFixed(1) + 's' : '-';
    el.querySelector('.ll').textContent = isFinite(car.lastLap) ? fmtT(car.lastLap) : '-';
    el.querySelector('.bl').textContent = isFinite(car.bestLap) ? fmtT(car.bestLap) : '-';
    el.querySelector('.st').textContent = car.stops;
    el.querySelector('.ov').innerHTML = car.ovMode ? '<span style="color:#00d2ff">OVERTAKE</span>' : { save: 'SAVE', std: 'STD', push: 'PUSH' }[car.mode];
    el.querySelectorAll('.modebtn').forEach(b => b.classList.toggle('sel', b.dataset.m === car.mode));
    const bb = el.querySelector('.boxbtn');
    bb.classList.toggle('on', !!car.box);
    bb.textContent = car.pitTimer > 0 ? 'IN PIT…' : car.box ? `BOX 指示中（${COMPOUNDS[car.box].jp}）— タップで取消` : `BOX（${COMPOUNDS[car.nextTyre].jp}に交換）`;
    const mm = tyreMismatch(car);
    let st = '';
    if (car.out) st = `リタイア：${car.reason}`;
    else if (car.finished) st = '🏁 フィニッシュ';
    else if (mm) st = '⚠️ タイヤが路面コンディションに合っていません';
    else if (!R.anyWet && [...car.used].filter(isDry).length < 2) st = 'ℹ️ 2種類のドライコンパウンド使用義務 未消化';
    if (car.damage) st += ' 🔧ダメージあり';
    el.querySelector('.status').textContent = st;
  });
}
const fmtGap = s => s >= 60 ? fmtT(s) : s.toFixed(1);

// ピット作業アニメーション（クルー配置）
function drawPitAnim(car) {
  const el = $('#card' + car.pIdx); if (!el) return;
  const cv = el.querySelector('.pitcanvas');
  if (car.pitTimer <= 0) { cv.style.display = 'none'; return; }
  cv.style.display = 'block';
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  const elapsed = car.pitTotal - car.pitTimer;
  const laneT = (car.pitTotal - car.pitStationary) / 2;
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = car.team.color; ctx.fillRect(0, 0, w, 6);
  ctx.fillStyle = '#ddd'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('PIT LANE 80km/h', 6, 20);
  let carX, phase;
  if (elapsed < laneT) { carX = (elapsed / laneT) * (w / 2); phase = 0; }
  else if (elapsed < laneT + car.pitStationary) { carX = w / 2; phase = (elapsed - laneT) / car.pitStationary; }
  else { carX = w / 2 + ((elapsed - laneT - car.pitStationary) / laneT) * (w / 2); phase = 2; }
  // ボックス枠
  ctx.strokeStyle = '#fff'; ctx.strokeRect(w / 2 - 34, 22, 68, 40);
  // クルー（タイヤガン×4, ジャッキ×2, その他）
  const crew = [[-26, 22], [26, 22], [-26, 62], [26, 62], [-44, 42], [44, 42], [-30, 12], [30, 12]];
  const near = phase > 0 && phase < 1;
  crew.forEach(([dx, dy], i) => {
    const off = near ? 0 : 10;
    ctx.fillStyle = i < 4 ? car.team.color : '#bbb';
    ctx.beginPath(); ctx.arc(w / 2 + dx * (1 + off / 30), dy + (dy < 42 ? -off / 3 : off / 3), 5, 0, 7); ctx.fill();
  });
  // 車
  ctx.save(); ctx.translate(carX, 42);
  ctx.fillStyle = car.team.color; ctx.fillRect(-22, -6, 44, 12); ctx.fillRect(-26, -10, 6, 20); ctx.fillRect(18, -9, 6, 18);
  const tc = phase === 1 || phase === 2 ? COMPOUNDS[car.newTyre].color : COMPOUNDS[car.tyre].color;
  ctx.fillStyle = '#111'; [[-14, -10], [10, -10], [-14, 10], [10, 10]].forEach(([x, y]) => { ctx.fillRect(x - 5, y - 4, 10, 8); ctx.strokeStyle = near && phase > 0.45 ? COMPOUNDS[car.newTyre].color : tc; ctx.strokeRect(x - 5, y - 4, 10, 8); });
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
  ctx.fillText(near ? `${(phase * car.pitStationary).toFixed(1)}s` : '', w / 2 + 40, 20);
}

function drawRace() {
  const ord = order();
  if (R.is3d) V3.render(R, ord, $('#labels'));
  const cv = $('#trackCanvas'); const ctx = cv.getContext('2d'); const w = cv.width, h = cv.height;
  const c = R.c;
  const key = `${w}x${h}:${Math.round(R.wet * 10)}`;
  if (R._mmKey !== key) {
    R._mmKey = key; R._mm = document.createElement('canvas'); R._mm.width = w; R._mm.height = h;
    R._mmGeo = drawTrack(R._mm.getContext('2d'), w, h, c, R.track, { wet: R.wet, mini: R.is3d });
  }
  ctx.drawImage(R._mm, 0, 0);
  const { sx, sy, tw } = R._mmGeo;
  // 車
  [...ord].reverse().forEach((car, ri) => {
    if (car.out) return;
    let frac = (car.dist / R.L);
    let [x, y, a] = R.track.at(frac);
    let px = sx(x), py = sy(y);
    if (car.pitTimer > 0) { const pf = (car.pitTotal - car.pitTimer) / car.pitTotal; [x, y, a] = R.track.at(-0.035 + pf * 0.07); px = sx(x) + Math.sin(a) * tw * 1.4; py = sy(y) - Math.cos(a) * tw * 1.4; }
    const r = car.player ? tw * 0.75 : tw * 0.55;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fillStyle = car.team.color; ctx.fill();
    ctx.lineWidth = car.player ? 3 : 1.5; ctx.strokeStyle = car.player ? '#fff' : car.team.color2; ctx.stroke();
    if (car.ovMode) { ctx.beginPath(); ctx.arc(px, py, r + 3, 0, 7); ctx.strokeStyle = '#00d2ff'; ctx.lineWidth = 2; ctx.stroke(); }
    if (car.player || ord.indexOf(car) < 3) {
      ctx.font = `bold ${Math.round(tw * 0.9)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      const label = `${ord.indexOf(car) + 1} ${car.d.code}`;
      ctx.strokeText(label, px + r + 3, py - r); ctx.fillText(label, px + r + 3, py - r);
    }
  });
  // セーフティカー
  if (R.sc && R.sc.type === 'SC') {
    const lead = ord.find(c => !c.out && !c.finished);
    if (lead) { const [x, y] = R.track.at(lead.dist / R.L + 0.012); ctx.beginPath(); ctx.arc(sx(x), sy(y), tw * 0.6, 0, 7); ctx.fillStyle = '#ffd400'; ctx.fill(); ctx.fillStyle = '#000'; ctx.font = `bold ${Math.round(tw * 0.6)}px sans-serif`; ctx.fillText('SC', sx(x) - tw * 0.4, sy(y) + tw * 0.2); }
  }
  if (R.sc && R.sc.type === 'VSC') { ctx.fillStyle = 'rgba(255,200,0,.12)'; ctx.fillRect(0, 0, w, h); }
  // 雨
  if (R.rainNow > 0.02 && !R.is3d) {
    ctx.strokeStyle = `rgba(180,200,255,${0.25 + R.rainNow * 0.4})`; ctx.lineWidth = 1;
    const n = Math.round(R.rainNow * 260); const t = performance.now() / 4;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = (i * 97.13 + t * 0.6) % w, y = (i * 53.7 + t * 2.2) % h; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); }
    ctx.stroke();
    ctx.fillStyle = `rgba(30,40,60,${R.rainNow * 0.25})`; ctx.fillRect(0, 0, w, h);
  }
  R.cars.filter(c => c.player).forEach(drawPitAnim);
}

// =============================================================
//  表彰式
// =============================================================
function showPodium(res, classified) {
  showScreen('podium');
  const top = classified.slice(0, 3);
  const meCodes = R.cars.filter(c => c.player).map(c => c.d.code);
  $('#resultTable').innerHTML = `<h2 style="margin:6px 0">${R.c.name} 結果　<small style="color:#888">天候: ${R.wx.year}年</small></h2>
    <table><tr><th>POS</th><th>ドライバー</th><th>チーム</th><th>タイム/差</th><th>ストップ</th><th class="num">PTS</th></tr>
    ${res.map(c => {
      const pos = c.out ? 'DNF' : c.dsq ? 'DSQ' : c.pos;
      const gap = c.out ? c.reason : c.dsq ? 'コンパウンド義務違反' : c.pos === 1 ? fmtT(c.finishTime) : (c.lap < R.c.laps ? `+${R.c.laps - c.lap}L` : '+' + (c.finishTime - classified[0].finishTime).toFixed(3));
      return `<tr class="${meCodes.includes(c.d.code) ? 'me' : ''}"><td>${pos}</td><td>${c.d.name}</td><td><span style="color:${c.team.color}">■</span> ${c.team.name}</td><td>${gap}</td><td>${c.stops}</td><td class="num">${c.pts || 0}</td></tr>`;
    }).join('')}</table>`;
  $('#btnNext').onclick = () => { setup.circuit = CIRCUITS[roundIdx % CIRCUITS.length]; prefs.circuit = setup.circuit.id; savePrefs(); showScreen('setup'); renderSetup(); };
  $('#btnToStandings').onclick = openStandings;
  if (R.is3d) V3.dispose();
  let ok3d = false;
  if (window.THREE) { try { V3.podium($('#podiumCanvas'), top, R.c); ok3d = true; } catch (e) { console.warn(e); } }
  if (!ok3d) podiumAnim(top);
}
function podiumAnim(top) {
  const cv = $('#podiumCanvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
  resize();
  const parts = [];
  const t0 = performance.now();
  const blocks = [{ i: 1, x: 0.25, hgt: 0.22 }, { i: 0, x: 0.5, hgt: 0.32 }, { i: 2, x: 0.75, hgt: 0.15 }];
  if ('speechSynthesis' in window && R.radioOn && top[0]) { const u = new SpeechSynthesisUtterance(`優勝は、${top[0].team.name}、${top[0].d.name}！`); u.lang = 'ja-JP'; speechSynthesis.speak(u); }
  function frame(now) {
    if (!$('#podium').classList.contains('active')) return;
    const t = (now - t0) / 1000, w = cv.width, h = cv.height, ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0f2a'); g.addColorStop(1, '#2a0a12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // スポットライト
    for (let k = 0; k < 3; k++) { const x = w * (0.25 + k * 0.25) + Math.sin(t * 0.7 + k) * w * 0.05; const lg = ctx.createRadialGradient(x, h * 0.55, 10, x, h * 0.55, w * 0.25); lg.addColorStop(0, 'rgba(255,255,230,.22)'); lg.addColorStop(1, 'rgba(255,255,230,0)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h); }
    // 観客
    for (let i = 0; i < 120; i++) { ctx.fillStyle = `hsl(${(i * 47) % 360},50%,${30 + (i % 3) * 8}%)`; const x = (i * 37.7) % w; const y = h * 0.82 + ((i * 13) % 30) * dpr + Math.sin(t * 6 + i) * 3 * dpr; ctx.beginPath(); ctx.arc(x, y, 6 * dpr, 0, 7); ctx.fill(); }
    // 表彰台
    ctx.textAlign = 'center';
    blocks.forEach(b => {
      const car = top[b.i]; if (!car) return;
      const rise = clamp((t - 0.3 * (2 - b.i)) / 1.2, 0, 1);
      const bw = w * 0.22, bh = h * b.hgt * rise, bx = w * b.x - bw / 2, by = h * 0.8 - bh;
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#111'; ctx.font = `900 ${Math.round(h * 0.07)}px sans-serif`; ctx.fillText(b.i + 1, w * b.x, by + h * 0.08);
      if (rise >= 1) {
        // ドライバー
        const py = by - h * 0.09;
        ctx.fillStyle = car.team.color; ctx.fillRect(w * b.x - h * 0.03, py - h * 0.02, h * 0.06, h * 0.1);
        ctx.beginPath(); ctx.arc(w * b.x, py - h * 0.05, h * 0.035, 0, 7); ctx.fillStyle = '#f0c8a0'; ctx.fill();
        ctx.fillStyle = car.team.color2; ctx.fillRect(w * b.x - h * 0.035, py - h * 0.09, h * 0.07, h * 0.02);
        const arm = Math.sin(t * 4 + b.i) * 0.3;
        ctx.strokeStyle = car.team.color; ctx.lineWidth = h * 0.012;
        ctx.beginPath(); ctx.moveTo(w * b.x - h * 0.03, py); ctx.lineTo(w * b.x - h * 0.06, py - h * (0.07 + arm * 0.05)); ctx.moveTo(w * b.x + h * 0.03, py); ctx.lineTo(w * b.x + h * 0.06, py - h * (0.07 - arm * 0.05)); ctx.stroke();
        // トロフィー
        ctx.fillStyle = '#ffd700'; ctx.fillRect(w * b.x + h * 0.055, py - h * 0.1, h * 0.02, h * 0.04);
        ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(h * 0.035)}px sans-serif`;
        ctx.fillText(car.d.name, w * b.x, by + bh * 0.62 + h * 0.03);
        ctx.fillStyle = car.team.color; ctx.font = `600 ${Math.round(h * 0.028)}px sans-serif`;
        ctx.fillText(car.team.name, w * b.x, by + bh * 0.62 + h * 0.07);
        // シャンパン
        if (t > 3.2 && Math.random() < 0.6) for (let k = 0; k < 3; k++) parts.push({ x: w * b.x + h * 0.06, y: py - h * 0.1, vx: rnd(-3, 3) * dpr, vy: rnd(-9, -4) * dpr, life: 1, c: 'rgba(255,240,180,' });
      }
    });
    if (t > 2.5 && Math.random() < 0.9) for (let k = 0; k < 4; k++) parts.push({ x: rnd(0, w), y: -10, vx: rnd(-1, 1) * dpr, vy: rnd(1, 3) * dpr, life: 1.4, c: `hsla(${rnd(0, 360)},90%,60%,`, conf: true });
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += p.conf ? 0.02 : 0.25 * dpr; p.life -= 0.012;
      if (p.life <= 0 || p.y > h) { parts.splice(i, 1); continue; }
      ctx.fillStyle = p.c + Math.min(1, p.life) + ')';
      if (p.conf) ctx.fillRect(p.x, p.y, 5 * dpr, 3 * dpr); else { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 * dpr, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = '#fff'; ctx.font = `900 italic ${Math.round(h * 0.06)}px sans-serif`; ctx.fillText(R.c.name.toUpperCase(), w / 2, h * 0.1);
    ctx.textAlign = 'left';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// =============================================================
//  ランキング
// =============================================================
function openStandings() {
  $('#standingsModal').classList.remove('hidden');
  renderStandings('drv');
}
function renderStandings(tab) {
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const me = setup.team;
  if (tab === 'drv') {
    const rows = [...ALL_DRIVERS].sort((a, b) => (champ[b.code] || 0) - (champ[a.code] || 0));
    $('#standingsBody').innerHTML = `<table><tr><th>#</th><th>ドライバー</th><th>チーム</th><th class="num">PTS</th></tr>${rows.map((d, i) => `<tr class="${d.team === me ? 'me' : ''}"><td>${i + 1}</td><td>${d.name}</td><td><span style="color:${d.team.color}">■</span> ${d.team.name}</td><td class="num">${champ[d.code] || 0}</td></tr>`).join('')}</table>`;
  } else {
    const rows = TEAMS.map(t => ({ t, p: t.drivers.reduce((s, d) => s + (champ[d.code] || 0), 0) })).sort((a, b) => b.p - a.p);
    $('#standingsBody').innerHTML = `<table><tr><th>#</th><th>チーム</th><th class="num">PTS</th></tr>${rows.map((r, i) => `<tr class="${r.t === me ? 'me' : ''}"><td>${i + 1}</td><td><span style="color:${r.t.color}">■</span> ${r.t.name}</td><td class="num">${r.p}</td></tr>`).join('')}</table>`;
  }
}
document.querySelectorAll('.tabs [data-tab]').forEach(b => b.onclick = () => renderStandings(b.dataset.tab));
$('#closeStandings').onclick = () => $('#standingsModal').classList.add('hidden');
$('#btnStandings').onclick = openStandings;
$('#btnReset').onclick = () => { const b = $('#btnReset'); if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'もう一度タップでリセット'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'シーズンをリセット'; }, 3000); return; } delete b.dataset.armed; b.textContent = 'シーズンをリセット'; { champ = zeroPoints(); roundIdx = 0; store.set('champ26', champ); store.set('round', 0); computePace(); setup.circuit = CIRCUITS[0]; renderSetup(); } };
$('#btnStart').onclick = startRace;

function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }

renderSetup();
