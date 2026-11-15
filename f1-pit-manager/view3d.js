// =============================================================
//  PIT WALL 26 — 3D ビュー（three.js r128）
// =============================================================
'use strict';
const V3 = (() => {
  // サーキットごとの高低差（m）の目安
  const ELEV = { AUS: 3, CHN: 6, JPN: 30, BHR: 10, SAU: 4, MIA: 3, CAN: 4, MON: 28, ESP: 22, AUT: 45, GBR: 9, BEL: 48, HUN: 22, NED: 18, ITA: 6, MAD: 12, AZE: 20, SIN: 3, USA: 32, MEX: 6, BRA: 30, LVG: 2, QAT: 4, ABU: 4 };
  const N = 2400;           // コースのサンプル数
  const TRACK_W = 14;       // コース幅 (m)
  const PIT_OFF = 24;       // ピットレーンのオフセット (m)
  let S = null;             // 現在のシーン状態

  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function hashStr(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function rng(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function canvasTex(w, h, draw, repeat) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }

  // ---------------- コース幾何 ----------------
  function makeGeo(c, track, L) {
    const scale = L / track.total;
    const r = rng(hashStr(c.id));
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    const amp = ELEV[c.id] ?? 8;
    const elev = f => amp * 0.5 * (Math.sin(2 * Math.PI * f + ph[0]) + 0.5 * Math.sin(4 * Math.PI * f + ph[1]) + 0.25 * Math.sin(6 * Math.PI * f + ph[2])) / 1.75;
    const pos = f => { const [x, y, a] = track.at(f); return { x: (x - 50) * scale, z: (y - 50) * scale, a, y: elev(((f % 1) + 1) % 1) }; };
    return { scale, elev, pos, amp };
  }

  function ribbon(G, fromF, toF, steps, offIn, offOut, y, colorFn) {
    const P = [], C = [], UV = [], I = [];
    let len = 0, prev = null;
    for (let i = 0; i <= steps; i++) {
      const f = fromF + (toF - fromF) * i / steps;
      const p = G.pos(f);
      const nx = -Math.sin(p.a), nz = Math.cos(p.a);
      if (prev) len += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
      P.push(p.x + nx * offIn, p.y + y, p.z + nz * offIn, p.x + nx * offOut, p.y + y, p.z + nz * offOut);
      UV.push(0, len / 12, 1, len / 12);
      if (colorFn) { const col = colorFn(len); C.push(...col, ...col); }
      if (i < steps) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I); g.computeVertexNormals();
    return g;
  }

  // ---------------- マシン（2026年規定風） ----------------
  // 形状をまとめて描画回数を減らすためのジオメトリ結合
  function mergeParts(parts) {
    const P = [], Nn = [], U = [];
    parts.forEach(([geo, m]) => {
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(m);
      const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv ? g.attributes.uv.array : null;
      for (let i = 0; i < p.length; i++) { P.push(p[i]); Nn.push(n[i]); }
      for (let i = 0; i < p.length / 3; i++) { U.push(uv ? uv[i * 2] : 0, uv ? uv[i * 2 + 1] : 0); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return g;
  }
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const CAR_X0 = -2.65, CAR_X1 = 2.95, CAR_Y1 = 1.1;

  // 側面プロファイルを押し出し、前後方向に絞り込んだ形状（UVは側面図に対応）
  function profileBody(pts, width, taper) {
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -width / 2);
    const p = g.attributes.position; const uv = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, p.getZ(i) * taper(x));
      uv.push((x - CAR_X0) / (CAR_X1 - CAR_X0), y / CAR_Y1);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const chassisTaper = x => x > 0.9 ? lerp(1, 0.32, (x - 0.9) / 2.0) : x < -1.3 ? lerp(1, 0.6, (-1.3 - x) / 1.2) : 1;
  const podTaper = x => x < -0.3 ? lerp(1, 0.42, (-0.3 - x) / 1.6) : x > 0.45 ? lerp(1, 0.85, (x - 0.45) / 0.3) : 1;
  const CHASSIS = [[2.95, 0.2], [2.95, 0.3], [2.1, 0.44], [1.15, 0.6], [0.75, 0.66], [0.35, 0.66], [0.0, 0.72], [-0.2, 1.02], [-0.55, 1.02], [-0.9, 0.86], [-1.7, 0.68], [-2.35, 0.5], [-2.45, 0.32], [-2.3, 0.14], [-0.6, 0.1], [1.2, 0.16], [2.6, 0.18]];
  const POD = [[0.75, 0.58], [0.72, 0.3], [0.2, 0.18], [-1.8, 0.18], [-2.05, 0.3], [-1.2, 0.5], [-0.3, 0.62], [0.55, 0.64]];
  const POD_W = 1.5, CH_W = 0.66;

  const liveryCache = new Map();
  function lum(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
  function paintLivery(team) {
    if (liveryCache.has(team.id)) return liveryCache.get(team.id);
    const t = canvasTex(1024, 256, (x, w, h) => {
      const body = team.body || team.color, c2 = team.color2, c3 = team.color3;
      x.fillStyle = body; x.fillRect(0, 0, w, h);
      const X = gx => (gx - CAR_X0) / (CAR_X1 - CAR_X0) * w, Y = gy => (1 - gy / CAR_Y1) * h;
      if (team.livery === 'split') {
        x.fillStyle = c2; x.beginPath(); x.moveTo(0, Y(0.42)); x.lineTo(X(2.95), Y(0.3)); x.lineTo(w, h); x.lineTo(0, h); x.fill();
        x.beginPath(); x.moveTo(0, 0); x.lineTo(X(-1.1), 0); x.lineTo(X(-0.4), Y(0.5)); x.lineTo(0, Y(0.42)); x.fill();
        x.strokeStyle = c3; x.lineWidth = 6; x.beginPath(); x.moveTo(X(-1.1), 0); x.lineTo(X(-0.4), Y(0.5)); x.lineTo(X(2.95), Y(0.33)); x.stroke();
      } else if (team.livery === 'bull') {
        x.fillStyle = c3; x.beginPath(); x.moveTo(X(1.9), 0); x.lineTo(w, 0); x.lineTo(w, h); x.lineTo(X(2.3), h); x.fill();
        // 抽象的なスウッシュ（ロゴではない）
        x.fillStyle = c3; x.beginPath(); x.arc(X(-0.75), Y(0.85), 34, 0, 7); x.fill();
        x.fillStyle = c2; for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(X(-1.2 + i * 0.35), Y(0.72 - i * 0.04), 70 - i * 10, 16, -0.2, 0, 7); x.fill(); }
        x.fillStyle = c2; x.fillRect(X(-0.2), Y(0.36), X(0.6) - X(-0.2), 10);
      } else if (team.livery === 'fade') {
        const g = x.createLinearGradient(X(-2.6), 0, X(1.2), 0); g.addColorStop(0, c2); g.addColorStop(1, body);
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.fillStyle = c3; x.fillRect(0, Y(0.4), w, 7); x.fillRect(X(1.0), Y(0.58), X(2.95) - X(1.0), 5);
      } else {
        x.fillStyle = c2; x.beginPath(); x.moveTo(X(-2.4), Y(0.75)); x.lineTo(X(2.95), Y(0.36)); x.lineTo(X(2.95), Y(0.26)); x.lineTo(X(-2.4), Y(0.55)); x.fill();
        x.fillStyle = c3; x.fillRect(0, Y(0.2), w, 6);
      }
      // パネルライン
      x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; [X(-0.2), X(0.75), X(-1.7)].forEach(px => { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); });
    });
    liveryCache.set(team.id, t);
    return t;
  }
  function textTex(text, color, bg, w = 512, h = 128, font = 'italic 900 78px sans-serif') {
    return canvasTex(w, h, (x) => { if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); } x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 4); });
  }

  function makeCar(car) {
    const team = car.team, body = team.body || team.color;
    const g = new THREE.Group();
    const livery = new THREE.MeshStandardMaterial({ map: paintLivery(team), roughness: 0.32, metalness: 0.35 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.2 });
    const acc = new THREE.MeshStandardMaterial({ color: lum(body) < 0.2 ? team.color2 : body, roughness: 0.35, metalness: 0.3 });
    const parts = { liv: [], carbon: [], acc: [] };
    parts.liv.push([profileBody(CHASSIS, CH_W, chassisTaper), new THREE.Matrix4()]);
    parts.liv.push([profileBody(POD, POD_W, podTaper), new THREE.Matrix4()]);
    // フロア・ディフューザー
    parts.carbon.push([new THREE.BoxGeometry(3.7, 0.05, 1.55), M4(-0.55, 0.07, 0)]);
    parts.carbon.push([new THREE.BoxGeometry(0.7, 0.22, 1.1), M4(-2.35, 0.17, 0, 0, 0, 0.25)]);
    // フロントウイング（3枚エレメント＋翼端板）
    parts.acc.push([new THREE.BoxGeometry(0.42, 0.035, 1.9), M4(2.9, 0.1, 0)]);
    parts.carbon.push([new THREE.BoxGeometry(0.3, 0.03, 1.82), M4(2.72, 0.16, 0, 0, 0, 0.25)]);
    parts.acc.push([new THREE.BoxGeometry(0.24, 0.03, 1.74), M4(2.58, 0.23, 0, 0, 0, 0.45)]);
    [1, -1].forEach(s => parts.carbon.push([new THREE.BoxGeometry(0.72, 0.3, 0.03), M4(2.75, 0.2, 0.96 * s)]));
    // リアウイング（メイン＋フラップ＋翼端板＋ビームウイング＋スワンネック）
    parts.acc.push([new THREE.BoxGeometry(0.44, 0.04, 1.0), M4(-2.45, 0.9, 0, 0, 0, -0.1)]);
    parts.carbon.push([new THREE.BoxGeometry(0.3, 0.03, 1.0), M4(-2.28, 1.04, 0, 0, 0, -0.45)]);
    [1, -1].forEach(s => parts.liv.push([new THREE.BoxGeometry(0.8, 0.62, 0.03), M4(-2.4, 0.84, 0.52 * s)]));
    parts.carbon.push([new THREE.BoxGeometry(0.28, 0.03, 0.9), M4(-2.55, 0.42, 0)]);
    parts.carbon.push([new THREE.BoxGeometry(0.22, 0.42, 0.04), M4(-2.3, 0.66, 0)]);
    // エンジンカバーのシャークフィン
    parts.liv.push([new THREE.BoxGeometry(1.2, 0.3, 0.025), M4(-1.45, 0.88, 0, 0, 0, -0.12)]);
    // サスペンションアーム
    [[1.75, 0.82], [-1.62, 0.82]].forEach(([wx, wz]) => [1, -1].forEach(s => {
      [[0.38, 0.06], [0.24, -0.06]].forEach(([y, dx]) => { const len = wz - 0.25; parts.carbon.push([new THREE.BoxGeometry(0.05, 0.025, len), M4(wx + dx, y, s * (0.25 + len / 2), 0, 0, 0)]); });
    }));
    // ミラー
    [1, -1].forEach(s => parts.carbon.push([new THREE.BoxGeometry(0.16, 0.07, 0.1), M4(0.8, 0.74, 0.47 * s)]));
    // ヘイロー
    const haloCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.15, 0.7, 0.33), new THREE.Vector3(0.15, 0.92, 0.32), new THREE.Vector3(0.55, 0.95, 0), new THREE.Vector3(0.15, 0.92, -0.32), new THREE.Vector3(-0.15, 0.7, -0.33)]);
    parts.carbon.push([new THREE.TubeGeometry(haloCurve, 20, 0.035, 6, false), new THREE.Matrix4()]);
    parts.carbon.push([new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), M4(0.78, 0.8, 0, 0, 0, 0.95)]);
    Object.entries({ liv: livery, carbon, acc }).forEach(([k, mat]) => { const m = new THREE.Mesh(mergeParts(parts[k]), mat); g.add(m); });
    // ヘルメット・Tカメラ（1台目=黒、2台目=蛍光イエロー：実際のF1と同じ見分け方）
    const helmetMat = new THREE.MeshStandardMaterial({ color: car.pIdx === 1 || car.d === team.drivers[1] ? team.color3 : team.color2, roughness: 0.25, metalness: 0.2 });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), helmetMat); helmet.position.set(0.18, 0.84, 0); g.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 })); visor.position.set(0.31, 0.86, 0); g.add(visor);
    const tcam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: car.d === team.drivers[0] ? 0x111111 : 0xe8ff00 })); tcam.position.set(-0.35, 1.07, 0); g.add(tcam);
    // デカール：サイドポッドのチーム名、ノーズとエンドプレートのゼッケン
    const dark = lum(body) < 0.45;
    const nameMat = new THREE.MeshBasicMaterial({ map: textTex(team.name.toUpperCase(), dark ? '#ffffff' : '#111111'), transparent: true });
    const podZ = POD_W / 2 * podTaper(-0.75) + 0.035;
    [1, -1].forEach(s => { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.29), nameMat); d.position.set(-0.75, 0.38, podZ * s); d.rotation.y = s > 0 ? 0 : Math.PI; g.add(d); });
    const numMat = new THREE.MeshBasicMaterial({ map: textTex(String(car.d.num), dark ? '#ffffff' : '#111111', null, 128, 128, '900 96px sans-serif'), transparent: true });
    const nose = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), numMat); nose.position.set(1.85, 0.5, 0); nose.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); g.add(nose);
    [1, -1].forEach(s => { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), numMat); d.position.set(-2.4, 0.88, (0.52 + 0.02) * s); d.rotation.y = s > 0 ? 0 : Math.PI; g.add(d); });
    // タイヤ（2026年は18インチ・前輪が細め）
    const wheels = [];
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.35, metalness: 0.8 });
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xffd400 });
    const tyreGeo = { f: new THREE.CylinderGeometry(0.355, 0.355, 0.3, 20), r: new THREE.CylinderGeometry(0.36, 0.36, 0.38, 20) };
    [[1.75, 0.82, 'f'], [-1.62, 0.84, 'r']].forEach(([x, z, k]) => [1, -1].forEach(s => {
      const wg = new THREE.Group(); wg.position.set(x, 0.36, z * s);
      const w = k === 'f' ? 0.3 : 0.38;
      const t = new THREE.Mesh(tyreGeo[k], tyreMat); t.rotation.x = Math.PI / 2; wg.add(t);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, w + 0.01, 14), rimMat); rim.rotation.x = Math.PI / 2; wg.add(rim);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 4, 20), bandMat); band.position.z = (w / 2 + 0.006) * s; wg.add(band);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.02), carbon); spoke.position.z = (w / 2 + 0.01) * s; wg.add(spoke);
      g.add(wg); wheels.push(wg);
    }));
    g.userData = { wheels, bandMat, lat: 0 };
    return g;
  }

  function makePerson(color) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 1.1, 8), m); body.position.y = 0.95; g.add(body);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x222222 })); legs.position.y = 0.3; g.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })); head.position.y = 1.68; g.add(head);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), m); armL.position.set(0, 1.2, 0.3); g.add(armL);
    const armR = armL.clone(); armR.position.z = -0.3; g.add(armR);
    g.userData = { armL, armR };
    return g;
  }

  // ---------------- シーン構築 ----------------
  function init(container, R) {
    dispose();
    const c = R.c;
    const G = makeGeo(c, R.track, R.L);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    container.innerHTML = ''; container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const night = !!c.night;
    const skyCol = new THREE.Color(night ? 0x060a18 : 0x8cc4f0);
    scene.background = skyCol.clone();
    scene.fog = new THREE.Fog(skyCol.clone(), 2500, 9000);
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.5, 9000);

    const hemi = new THREE.HemisphereLight(night ? 0x8090c0 : 0xdfefff, night ? 0x202018 : 0x4a5a30, night ? 0.75 : 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(night ? 0xfff2d8 : 0xffffff, night ? 0.6 : 1.0);
    sun.position.set(400, 800, 300); scene.add(sun);

    // 範囲
    const samples = [];
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < 420; i++) { const p = G.pos(i / 420); samples.push(p); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, ext = Math.max(maxX - minX, maxZ - minZ);
    const r = rng(hashStr(c.id) + 3);
    const noise = (x, z) => Math.sin(x * 0.004 + 1.3) * Math.cos(z * 0.005 + 0.7) + 0.5 * Math.sin(x * 0.011 + z * 0.009);
    const nearest = (x, z) => { let bd = 1e12, bh = 0; for (const p of samples) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bh = p.y; } } return [Math.sqrt(bd), bh]; };
    const heightAt = (x, z) => { const [d, h] = nearest(x, z); const base = h - 1 + noise(x, z) * (G.amp * 0.25 + 2) * smooth(60, 400, d); return Math.min(h - 0.6, base) * (d < 70 ? 1 : 0) + (d < 70 ? 0 : base) + (d > 450 ? (d - 450) * 0.04 : 0); };

    // 地形
    const size = ext * 2.4, seg = 170;
    const tg = new THREE.PlaneGeometry(size, size, seg, seg); tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position; const cols = [];
    const base = new THREE.Color(c.terrain); base.multiplyScalar(night ? 0.45 : 0.72);
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i) + cx, z = tp.getZ(i) + cz;
      tp.setX(i, x); tp.setZ(i, z); tp.setY(i, heightAt(x, z));
      const v = 0.85 + noise(x * 3, z * 3) * 0.1 + r() * 0.06;
      cols.push(base.r * v, base.g * v, base.b * v);
    }
    tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); tg.computeVertexNormals();
    scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })));

    // 水面
    if (c.water) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(ext * 0.16, 40), new THREE.MeshStandardMaterial({ color: night ? 0x0a1a30 : 0x2f6fa8, roughness: 0.15, metalness: 0.4 }));
      w.rotation.x = -Math.PI / 2; w.scale.set(1, 0.7, 1);
      // コースから離れた場所を探す
      let best = [cx, cz], bd = 0;
      for (let k = 0; k < 60; k++) { const x = cx + (r() - 0.5) * ext * 0.9, z = cz + (r() - 0.5) * ext * 0.9; const [d] = nearest(x, z); if (d > bd) { bd = d; best = [x, z]; } }
      w.scale.multiplyScalar(Math.min(1, bd / (ext * 0.16)));
      w.position.set(best[0], heightAt(best[0], best[1]) + 0.6, best[1]); scene.add(w);
    }

    // ランオフ・縁石・アスファルト
    const asphaltTex = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#4a4d52'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { const v = 60 + Math.random() * 40; x.fillStyle = `rgb(${v},${v},${v + 4})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } x.fillStyle = '#ddd'; x.fillRect(2, 0, 3, h); x.fillRect(w - 5, 0, 3, h); }, true);
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.0, color: night ? 0x9a9a9a : 0xffffff });
    const runoffCol = new THREE.Color(night ? 0x3a3a2a : 0xb9b08a);
    scene.add(new THREE.Mesh(ribbon(G, 0, 1, N, -TRACK_W / 2 - 14, TRACK_W / 2 + 14, 0.02, () => [runoffCol.r, runoffCol.g, runoffCol.b]), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const kerb = (len) => Math.floor(len / 4) % 2 ? [0.85, 0.05, 0.05] : [0.95, 0.95, 0.95];
    const kmat = new THREE.MeshLambertMaterial({ vertexColors: true });
    scene.add(new THREE.Mesh(ribbon(G, 0, 1, N * 2, TRACK_W / 2, TRACK_W / 2 + 1.4, 0.09, kerb), kmat));
    scene.add(new THREE.Mesh(ribbon(G, 0, 1, N * 2, -TRACK_W / 2 - 1.4, -TRACK_W / 2, 0.09, kerb), kmat));
    const road = new THREE.Mesh(ribbon(G, 0, 1, N, -TRACK_W / 2, TRACK_W / 2, 0.1), asphalt);
    scene.add(road);

    // スタートライン
    const chk = canvasTex(64, 16, (x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#000' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); } });
    const p0 = G.pos(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 1.6), new THREE.MeshBasicMaterial({ map: chk }));
    line.rotation.set(-Math.PI / 2, 0, -p0.a + Math.PI / 2); line.position.set(p0.x, p0.y + 0.13, p0.z); scene.add(line);
    // グリッドの白線
    for (let i = 0; i < 22; i++) {
      const f = -(i * 8 + 4) / R.L, p = G.pos(f), side = i % 2 ? 1 : -1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.rotation.set(-Math.PI / 2, 0, -p.a + Math.PI / 2);
      m.position.set(p.x - Math.sin(p.a) * side * 3, p.y + 0.13, p.z + Math.cos(p.a) * side * 3); scene.add(m);
    }

    // ピットレーン・ガレージ
    const pitFrom = -0.035, pitTo = 0.035;
    scene.add(new THREE.Mesh(ribbon(G, pitFrom, pitTo, 120, -PIT_OFF - 5, -PIT_OFF + 5, 0.1), asphalt));
    scene.add(new THREE.Mesh(ribbon(G, pitFrom + 0.004, pitTo - 0.004, 120, -PIT_OFF - 18, -PIT_OFF - 5, 0.05, () => [0.55, 0.55, 0.58]), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const boxF = TEAMS.map((t, i) => -0.028 + i * 0.0052);
    const garageMat = new THREE.MeshStandardMaterial({ color: night ? 0x555a66 : 0xdadde3, roughness: 0.6 });
    TEAMS.forEach((t, i) => {
      const p = G.pos(boxF[i]); t.body = t.body || t.color;
      const gx = p.x - Math.sin(p.a) * (PIT_OFF + 22), gz = p.z + Math.cos(p.a) * (PIT_OFF + 22);
      const gar = new THREE.Mesh(new THREE.BoxGeometry(R.L * 0.0052 * 0.92, 8, 14), garageMat);
      gar.position.set(gx, p.y + 4, gz); gar.rotation.y = -p.a; scene.add(gar);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(R.L * 0.0052 * 0.85, 2, 0.3), new THREE.MeshBasicMaterial({ color: t.color }));
      sign.position.set(p.x - Math.sin(p.a) * (PIT_OFF + 14.8), p.y + 6.5, p.z + Math.cos(p.a) * (PIT_OFF + 14.8)); sign.rotation.y = -p.a; scene.add(sign);
    });
    // ピットビル上の屋根
    {
      const p = G.pos(0);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(R.L * 0.064, 1.2, 20), new THREE.MeshStandardMaterial({ color: 0x30343c }));
      roof.position.set(p.x - Math.sin(p.a) * (PIT_OFF + 22), p.y + 8.6, p.z + Math.cos(p.a) * (PIT_OFF + 22)); roof.rotation.y = -p.a; scene.add(roof);
    }

    // グランドスタンド（観客）
    const crowdTex = canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#333'; x.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { x.fillStyle = `hsl(${Math.random() * 360},60%,${40 + Math.random() * 30}%)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, true);
    const standMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
    const standF = [-0.02, 0, 0.02, 0.25, 0.5, 0.75];
    standF.forEach(f => {
      const p = G.pos(f), side = f === 0 || Math.abs(f) < 0.03 ? 1 : (r() < 0.5 ? 1 : -1);
      const off = TRACK_W / 2 + 26;
      const st = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 12), standMat);
      st.position.set(p.x - Math.sin(p.a) * off * side, p.y + 5, p.z + Math.cos(p.a) * off * side);
      st.rotation.y = -p.a; st.rotation.x = side * 0.35; scene.add(st);
    });

    const mtx = new THREE.Matrix4();

    // ---- バリア・市街地 ----
    const STREET = ['MON', 'SIN', 'AZE', 'LVG', 'MIA', 'MAD'];
    const isStreet = STREET.includes(c.id);
    const wallTex = canvasTex(256, 32, (x, w, h) => { x.fillStyle = '#d9d9d9'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#c00' : '#ddd'; } x.fillStyle = TEAMS[0].color; x.fillRect(0, h - 6, w, 6); x.fillStyle = '#333'; x.font = 'bold 18px sans-serif'; x.fillText('PIT WALL 26', 20, 20); x.fillText('FORMULA', 150, 20); }, true);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8, side: THREE.DoubleSide });
    const fenceMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    function wall(off, h, y0, mat, skipPit) {
      const P = [], UV = [], I = []; let len = 0, prev = null, k = 0;
      const segs = [];
      if (skipPit) { segs.push([0.045, 0.955]); } else segs.push([0, 1]);
      segs.forEach(([f0, f1]) => {
        const steps = Math.round(N * (f1 - f0));
        for (let i = 0; i <= steps; i++) {
          const f = f0 + (f1 - f0) * i / steps, p = G.pos(f);
          const x = p.x - Math.sin(p.a) * off, z = p.z + Math.cos(p.a) * off;
          if (prev) len += Math.hypot(x - prev[0], z - prev[1]); prev = [x, z];
          P.push(x, p.y + y0, z, x, p.y + y0 + h, z); UV.push(len / 30, 0, len / 30, 1);
          if (i < steps) I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
          k += 2;
        }
        prev = null;
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, mat));
    }
    const wOff = isStreet ? TRACK_W / 2 + 4 : TRACK_W / 2 + 26;
    wall(wOff, 1.1, 0, wallMat, false);
    wall(-wOff, 1.1, 0, wallMat, true);
    wall(wOff, 3.5, 1.1, fenceMat, false);
    wall(-wOff, 3.5, 1.1, fenceMat, true);
    if (isStreet) {
      const bTex = canvasTex(64, 128, (x, w, h) => { x.fillStyle = night ? '#1a1c24' : '#b8b4aa'; x.fillRect(0, 0, w, h); for (let yy = 6; yy < h; yy += 12) for (let xx = 4; xx < w; xx += 10) { x.fillStyle = night ? (Math.random() < 0.55 ? '#ffd98a' : '#2a2c34') : (Math.random() < 0.5 ? '#6f8fa8' : '#58708a'); x.fillRect(xx, yy, 6, 7); } }, true);
      const bMat = new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.7 });
      const nB = 420, bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bMat, nB); let nb = 0;
      for (let k = 0; k < nB * 5 && nb < nB; k++) {
        const x = cx + (r() - 0.5) * size * 0.8, z = cz + (r() - 0.5) * size * 0.8;
        const [d] = nearest(x, z); if (d < 30 || d > 600) continue;
        const bw = 15 + r() * 30, bh = 10 + r() * (c.id === 'MON' ? 45 : c.id === 'LVG' || c.id === 'SIN' ? 110 : 40);
        mtx.compose(new THREE.Vector3(x, heightAt(x, z) + bh / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 3, 0)), new THREE.Vector3(bw, bh, 15 + r() * 25));
        bld.setMatrixAt(nb++, mtx);
      }
      bld.count = nb; scene.add(bld);
    }

    // 木
    const treeCount = 700;
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 11, 6), new THREE.MeshLambertMaterial({ color: night ? 0x0f2a12 : 0x2c5a26 }), treeCount);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 5), new THREE.MeshLambertMaterial({ color: 0x4a3420 }), treeCount);
    let placed = 0;
    for (let k = 0; k < treeCount * 4 && placed < treeCount; k++) {
      const x = cx + (r() - 0.5) * size * 0.9, z = cz + (r() - 0.5) * size * 0.9;
      const [d] = nearest(x, z); if (d < 45 || (isStreet && d < 600 && r() < 0.85)) continue;
      const s = 0.7 + r() * 0.9, y = heightAt(x, z);
      mtx.makeScale(s, s, s); mtx.setPosition(x, y + 6.5 * s, z); trees.setMatrixAt(placed, mtx);
      mtx.makeScale(s, s, s); mtx.setPosition(x, y + 1.5 * s, z); trunks.setMatrixAt(placed, mtx);
      placed++;
    }
    trees.count = trunks.count = placed; scene.add(trees, trunks);

    // ナイトレースの照明柱
    if (night) {
      const poleMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
      for (let i = 0; i < 70; i++) {
        const p = G.pos(i / 70), side = i % 2 ? 1 : -1, off = TRACK_W / 2 + 9;
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 4), poleMat);
        pole.position.set(p.x - Math.sin(p.a) * off * side, p.y + 14, p.z + Math.cos(p.a) * off * side); pole.rotation.y = -p.a; scene.add(pole);
      }
    }

    // マシン
    const cars = new Map();
    R.cars.forEach(car => { const m = makeCar(car); scene.add(m); cars.set(car, m); });
    // セーフティカー
    const sc = new THREE.Group();
    { const b = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.9, 1.9), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.6, roughness: 0.3 })); b.position.y = 0.75; sc.add(b);
      const t = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x223344 })); t.position.set(-0.3, 1.45, 0); sc.add(t);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xffb000 })); l.position.set(-0.3, 1.85, 0); sc.add(l); sc.userData.light = l; }
    sc.visible = false; scene.add(sc);

    // ピットクルー（プレイヤーチームのボックス）
    const ti = TEAMS.indexOf(R.cars.find(c => c.player).team);
    const crew = [];
    for (let i = 0; i < 12; i++) { const p = makePerson(i < 8 ? R.cars.find(c => c.player).team.color : 0xcccccc); scene.add(p); crew.push(p); }

    // 雨
    const rainN = 2500, rp = new Float32Array(rainN * 3);
    for (let i = 0; i < rainN; i++) { rp[i * 3] = (Math.random() - 0.5) * 160; rp[i * 3 + 1] = Math.random() * 60; rp[i * 3 + 2] = (Math.random() - 0.5) * 160; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    const rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xaabbdd, size: 0.25, transparent: true, opacity: 0.7 }));
    scene.add(rain);

    // トラックサイドカメラの位置
    const tvCams = [];
    for (let i = 0; i < 18; i++) { const f = i / 18, p = G.pos(f), side = i % 2 ? 1 : -1, off = TRACK_W / 2 + 30; tvCams.push({ f, x: p.x - Math.sin(p.a) * off * side, y: p.y + 9, z: p.z + Math.cos(p.a) * off * side }); }

    S = { renderer, scene, camera, G, cars, sc, crew, rain, tvCams, boxF, ti, cx, cz, ext, container, mode: 'chase', focus: 'p0', orbit: { a: 0.6, d: 1, drag: null }, camPos: new THREE.Vector3(cx, ext, cz + ext), camLook: new THREE.Vector3(cx, 0, cz), asphalt, skyCol, night, labels: null, lastWet: -1 };
    setupInput(renderer.domElement);
    resize();
    return S;
  }

  function setupInput(el) {
    let last = null;
    el.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (!last || !S) return; S.orbit.a -= (e.clientX - last[0]) * 0.008; S.orbit.d = Math.max(0.15, Math.min(2.2, S.orbit.d * (1 + (e.clientY - last[1]) * 0.004))); last = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', () => last = null);
    el.addEventListener('wheel', e => { if (!S) return; e.preventDefault(); S.orbit.d = Math.max(0.15, Math.min(2.2, S.orbit.d * (1 + e.deltaY * 0.001))); }, { passive: false });
  }

  function resize() {
    if (!S) return;
    const w = S.container.clientWidth, h = S.container.clientHeight || w * 0.75;
    S.renderer.setSize(w, h, false);
    S.renderer.domElement.style.width = '100%'; S.renderer.domElement.style.height = '100%';
    S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
  }

  // 車の位置（ピット中はピットレーン上でボックスに停止）
  function carPlace(R, car, idx) {
    const G = S.G;
    if (car.pitTimer > 0) {
      const tIdx = TEAMS.indexOf(car.team), fb = S.boxF[tIdx];
      const el = car.pitTotal - car.pitTimer, laneT = (car.pitTotal - car.pitStationary) / 2;
      let f, off = PIT_OFF, stationary = false;
      if (el < laneT) f = -0.035 + (fb + 0.035) * (el / laneT);
      else if (el < laneT + car.pitStationary) { f = fb; stationary = true; off = PIT_OFF + 2.5; }
      else f = fb + (0.035 - fb) * ((el - laneT - car.pitStationary) / laneT);
      const p = G.pos(f + car.lap);
      return { x: p.x - Math.sin(p.a) * off, y: p.y + 0.1, z: p.z + Math.cos(p.a) * off, a: p.a, slope: 0, stationary, pf: stationary ? (el - laneT) / car.pitStationary : -1 };
    }
    const f = car.dist / R.L;
    const p = G.pos(f), p2 = G.pos(f + 4 / R.L);
    // 並走時の横方向オフセット
    const m = S.cars.get(car);
    let target = 0;
    if (car.passing && R.time < car.passUntil) target = 3.2 * (idx % 2 ? 1 : -1);
    else if (car.gapAhead < 0.35) target = 1.4 * (idx % 2 ? 1 : -1);
    if (R.dist0 === undefined && car.lap === 0 && car.dist < 0) target = (car.grid % 2 ? -3 : 3);
    m.userData.lat += (target - m.userData.lat) * 0.08;
    const lat = m.userData.lat;
    return { x: p.x - Math.sin(p.a) * lat, y: p.y + 0.1, z: p.z + Math.cos(p.a) * lat, a: p.a, slope: Math.atan2(p2.y - p.y, 4) };
  }

  function focusCar(R, ord) {
    if (S.focus === 'leader') return ord.find(c => !c.out) || ord[0];
    if (S.focus.startsWith('code:')) { const c = R.cars.find(x => x.d.code === S.focus.slice(5)); if (c) return c; }
    const pl = R.cars.filter(c => c.player).sort((a, b) => a.pIdx - b.pIdx);
    const c = pl[S.focus === 'p1' ? 1 : 0];
    return c.out ? (ord.find(x => !x.out) || c) : c;
  }

  function render(R, ord, labelCanvas) {
    if (!S) return;
    const { scene, camera, cars } = S;
    const now = performance.now() / 1000;
    // 路面の濡れ具合
    const wq = Math.round(R.wet * 20);
    if (wq !== S.lastWet) {
      S.lastWet = wq;
      S.asphalt.roughness = 0.92 - R.wet * 0.75; S.asphalt.metalness = R.wet * 0.35;
      S.asphalt.color.setScalar((S.night ? 0.6 : 1) * (1 - R.wet * 0.45));
      const sky = S.skyCol.clone().lerp(new THREE.Color(S.night ? 0x05070c : 0x5a6470), Math.min(1, R.rainNow * 1.4));
      scene.background = sky; scene.fog.color = sky;
    }
    const camDist = S.camera.position.distanceTo(S.camLook);
    const carScale = S.mode === 'heli' || S.mode === 'top' ? Math.max(1, Math.min(14, camDist / 70)) : 1;
    ord.forEach((car, i) => {
      const m = cars.get(car);
      if (car.out) { if (!car._parked) { car._parked = carPlace(R, car, i); } const p = car._parked; m.position.set(p.x - Math.sin(p.a) * 12, p.y, p.z + Math.cos(p.a) * 12); m.rotation.set(0, -p.a + 0.9, 0); m.scale.setScalar(carScale); return; }
      const p = carPlace(R, car, i);
      m.position.set(p.x, p.y, p.z);
      m.rotation.set(0, -p.a, p.slope);
      m.scale.setScalar(carScale);
      const spin = car.pitTimer > 0 && car._lastPitSpin ? 0 : (R.L / car.curLT) * 0.05;
      m.userData.wheels.forEach(w => w.rotation.z -= spin);
      const showTyre = p.stationary && p.pf > 0.5 ? car.newTyre : car.tyre;
      m.userData.bandMat.color.set(COMPOUNDS[showTyre].color);
      car._p3 = p;
    });
    // SC
    if (R.sc && R.sc.type === 'SC') {
      const lead = ord.find(c => !c.out && !c.finished && c.pitTimer <= 0);
      if (lead) { const p = S.G.pos(lead.dist / R.L + 60 / R.L); S.sc.position.set(p.x, p.y + 0.1, p.z); S.sc.rotation.set(0, -p.a, 0); S.sc.visible = true; S.sc.scale.setScalar(carScale); S.sc.userData.light.material.color.set(Math.floor(now * 4) % 2 ? 0xffb000 : 0x553300); }
    } else S.sc.visible = false;

    // ピットクルー
    const pl = R.cars.filter(c => c.player);
    const pitting = pl.find(c => c.pitTimer > 0 && c._p3 && c._p3.stationary);
    const fb = S.boxF[S.ti]; const bp = S.G.pos(fb);
    const ax = -Math.sin(bp.a), az = Math.cos(bp.a), dx = Math.cos(bp.a), dz = Math.sin(bp.a);
    const boxX = bp.x + ax * (PIT_OFF + 2.5), boxZ = bp.z + az * (PIT_OFF + 2.5);
    // 4輪×(ガン, 外す, 付ける) ＋ ジャッキ前後 ＋ ロリポップ等
    const spots = [];
    [[1.7, 1], [1.7, -1], [-1.65, 1], [-1.65, -1]].forEach(([lx, s]) => { spots.push([lx, s * 1.8]); spots.push([lx + 0.7, s * 2.4]); });
    spots.push([4.2, 0], [-3.6, 0], [0, 3.4], [2.5, -3.2]);
    S.crew.forEach((p, i) => {
      const [lx, lz] = spots[i];
      const away = pitting ? 0 : 1;
      const ox = lx + (lx > 0 ? 1 : -1) * away * 0.5, oz = lz + (lz >= 0 ? 1 : -1) * away * 4 + (lz === 0 ? -away * 6 : 0);
      p.position.set(boxX + dx * ox + ax * oz, bp.y + 0.1, boxZ + dz * ox + az * oz);
      p.rotation.y = -bp.a + (lz > 0 ? -Math.PI / 2 : lz < 0 ? Math.PI / 2 : 0);
      const k = pitting ? Math.sin(now * 14 + i) * 0.4 : 0;
      p.userData.armL.rotation.x = k; p.userData.armR.rotation.x = -k;
      p.scale.setScalar(S.mode === 'heli' || S.mode === 'top' ? Math.min(carScale, 4) : 1);
    });

    // カメラ
    const fc = focusCar(R, ord);
    const fp = fc._p3 || fc._parked || { x: S.cx, y: 0, z: S.cz, a: 0 };
    const fwd = new THREE.Vector3(Math.cos(fp.a), 0, Math.sin(fp.a));
    let wantPos, wantLook;
    if (S.mode === 'chase') {
      const d = 13 * S.orbit.d + 3;
      wantPos = new THREE.Vector3(fp.x, fp.y + 3.2 + d * 0.15, fp.z).addScaledVector(fwd, -d);
      wantLook = new THREE.Vector3(fp.x, fp.y + 1.2, fp.z).addScaledVector(fwd, 8);
    } else if (S.mode === 'tv') {
      const f = ((fc.dist / R.L) % 1 + 1) % 1;
      let best = S.tvCams[0], bd = 9;
      for (const cam of S.tvCams) { let d = f - cam.f; if (d < -0.5) d += 1; if (d > 0.5) d -= 1; if (Math.abs(d + 0.012) < bd) { bd = Math.abs(d + 0.012); best = cam; } }
      if (fc.pitTimer > 0) best = { x: fp.x - Math.sin(fp.a) * -20 + Math.cos(fp.a) * 30, y: fp.y + 8, z: fp.z + Math.cos(fp.a) * -20 + Math.sin(fp.a) * 30 };
      wantPos = new THREE.Vector3(best.x, best.y, best.z);
      wantLook = new THREE.Vector3(fp.x, fp.y + 0.8, fp.z);
      camera.fov = Math.max(8, Math.min(50, wantPos.distanceTo(wantLook) * 0.35));
      camera.updateProjectionMatrix();
    } else if (S.mode === 'top') { // 俯瞰（真上からコース全体）
      const H = S.ext * 0.95 * S.orbit.d / Math.tan(25 * Math.PI / 180) * 0.62;
      wantLook = new THREE.Vector3(S.cx, 0, S.cz);
      wantPos = new THREE.Vector3(S.cx, H, S.cz + H * 0.02);
    } else { // heli
      S.orbit.a += 0.0006;
      const R0 = S.ext * 0.85 * S.orbit.d;
      wantLook = new THREE.Vector3(S.cx + (fp.x - S.cx) * 0.3, 0, S.cz + (fp.z - S.cz) * 0.3);
      wantPos = new THREE.Vector3(wantLook.x + Math.cos(S.orbit.a) * R0, R0 * 0.75, wantLook.z + Math.sin(S.orbit.a) * R0);
    }
    if (S.mode !== 'tv' && camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    if (S.mode === 'chase') {
      // 車に対する相対位置をなめらかに追従（倍速でも置いていかれない）
      const carV = new THREE.Vector3(fp.x, fp.y, fp.z);
      const off = wantPos.clone().sub(carV), lo = wantLook.clone().sub(carV);
      if (!S.camOff || S._snap) { S.camOff = off; S.lookOff = lo; }
      S.camOff.lerp(off, 0.12); S.lookOff.lerp(lo, 0.2);
      S.camPos.copy(carV).add(S.camOff); S.camLook.copy(carV).add(S.lookOff);
    } else {
      const k = S.mode === 'tv' ? 1 : 0.15;
      S.camPos.lerp(wantPos, S._snap ? 1 : k); S.camLook.lerp(wantLook, S._snap ? 1 : (S.mode === 'tv' ? 0.5 : 0.25));
    }
    S._snap = false;
    camera.position.copy(S.camPos); camera.lookAt(S.camLook);
    const cd = S.camPos.distanceTo(S.camLook);
    scene.fog.near = 2500 - R.rainNow * 2350 + cd * 0.9; scene.fog.far = 9000 - R.rainNow * 8000 + cd * 1.5;

    // 雨
    S.rain.visible = R.rainNow > 0.02;
    if (S.rain.visible) {
      const a = S.rain.geometry.attributes.position; const n = Math.floor(a.count * Math.min(1, R.rainNow * 1.3));
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - 1.6; if (y < 0) y += 60; a.setY(i, i < n ? y : -999); }
      a.needsUpdate = true; S.rain.position.set(camera.position.x, camera.position.y - 30, camera.position.z);
    }
    S.renderer.render(scene, camera);

    // ラベル
    if (labelCanvas) {
      const ctx = labelCanvas.getContext('2d');
      const w = labelCanvas.width = labelCanvas.clientWidth * 2, h = labelCanvas.height = labelCanvas.clientHeight * 2;
      ctx.clearRect(0, 0, w, h);
      ctx.font = 'bold 22px sans-serif';
      ord.forEach((car, i) => {
        if (car.out) return;
        if (!(car.player || i < 3 || car === fc)) return;
        const p = car._p3; if (!p) return;
        const v = new THREE.Vector3(p.x, p.y + 2.2 * carScale, p.z).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
        const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
        const label = `${i + 1} ${car.d.code}`;
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(x - tw / 2, y - 30, tw, 28);
        ctx.fillStyle = car.team.color; ctx.fillRect(x - tw / 2, y - 30, 5, 28);
        ctx.fillStyle = '#fff'; ctx.fillText(label, x - tw / 2 + 9, y - 9);
      });
    }
  }

  function setMode(m) { if (S) { S.mode = m; S._snap = true; S.orbit.d = 1; } }
  function setFocus(f) { if (S) { S.focus = f; S._snap = true; } }

  function dispose() {
    if (!S) return;
    S.renderer.dispose(); S.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    S.renderer.domElement.remove(); S = null;
  }

  // ---------------- 表彰式 ----------------
  let P = null;
  function podium(canvas, top, circuit) {
    if (P) { P.stop = true; P.renderer.dispose(); }
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a1a);
    scene.fog = new THREE.Fog(0x070a1a, 30, 80);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0x8899ff, 0x221111, 0.6));
    const spots = [];
    [-4, 0, 4].forEach((x, i) => { const s = new THREE.SpotLight(0xfff4e0, 1.6, 40, 0.35, 0.5); s.position.set(x, 14, 8); s.target.position.set(x, 1, 0); scene.add(s, s.target); spots.push(s); });
    // ステージ
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.4, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const bd = canvasTex(1024, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2a0008'); g.addColorStop(0.5, '#e10600'); g.addColorStop(1, '#2a0008'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = 'italic 900 90px sans-serif'; x.textAlign = 'center'; x.fillText(circuit.name, w / 2, 120); x.font = '700 44px sans-serif'; x.fillText('PIT WALL 26 · PODIUM', w / 2, 200); });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: bd })); back.position.set(0, 7, -5); scene.add(back);
    // 表彰台
    const blocks = [{ i: 1, x: -3.4, h: 1.3 }, { i: 0, x: 0, h: 1.9 }, { i: 2, x: 3.4, h: 0.9 }];
    const people = [];
    blocks.forEach(b => {
      const car = top[b.i]; if (!car) return;
      const numTex = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#eee'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.font = '900 90px sans-serif'; x.textAlign = 'center'; x.fillText(b.i + 1, w / 2, 100); });
      const mats = [0, 0, 0, 0, 1, 0].map(k => k ? new THREE.MeshStandardMaterial({ map: numTex }) : new THREE.MeshStandardMaterial({ color: 0xe8e8e8 }));
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.2, b.h, 2.4), mats); box.position.set(b.x, b.h / 2, 0); scene.add(box);
      const p = makePerson(car.team.color); p.position.set(b.x, b.h, 0); p.scale.setScalar(1.05); scene.add(p);
      p.userData.helmet = new THREE.Color(car.team.color2);
      p.children[2].material = new THREE.MeshStandardMaterial({ color: car.team.color2, roughness: 0.3 });
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0x0f4a1f, metalness: 0.5 }));
      p.add(bottle); bottle.position.set(0.35, 1.6, 0.35);
      if (b.i === 0) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.08, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2 })); tr.position.set(-0.3, 2.1, -0.3); p.add(tr); }
      const nameTex = canvasTex(512, 96, (x, w, h) => { x.fillStyle = car.team.color; x.fillRect(0, 0, 10, h); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(10, 0, w, h); x.fillStyle = '#fff'; x.font = '800 44px sans-serif'; x.fillText(car.d.name, 24, 46); x.fillStyle = '#ccc'; x.font = '500 28px sans-serif'; x.fillText(car.team.name, 24, 82); });
      const name = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true })); name.position.set(b.x, Math.min(0.45, b.h * 0.3), 1.22); scene.add(name);
      people.push({ p, b, bottle });
    });
    // 紙吹雪・シャンパン
    const CN = 900, cp = new Float32Array(CN * 3), cc = new Float32Array(CN * 3), cv = [];
    for (let i = 0; i < CN; i++) { cp[i * 3] = (Math.random() - 0.5) * 20; cp[i * 3 + 1] = 10 + Math.random() * 20; cp[i * 3 + 2] = (Math.random() - 0.5) * 8; const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6); cc.set([col.r, col.g, col.b], i * 3); cv.push(0.02 + Math.random() * 0.04); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const conf = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.18, vertexColors: true })); scene.add(conf);
    const SN = 600, sp = new Float32Array(SN * 3).fill(-99), svel = new Float32Array(SN * 3), slife = new Float32Array(SN);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const spray = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.09, color: 0xfff3c0, transparent: true, opacity: 0.85 })); scene.add(spray);
    let si = 0;
    P = { renderer, stop: false };
    const t0 = performance.now();
    const me = P;
    function frame() {
      if (me.stop || !canvas.isConnected || !document.getElementById('podium').classList.contains('active')) return;
      const t = (performance.now() - t0) / 1000;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      const d = Math.max(10, 22 - t * 2.2) * (camera.aspect < 1 ? 1.25 : 1);
      camera.position.set(Math.sin(t * 0.15) * 4, 3.2 + d * 0.12, d); camera.lookAt(0, 2.6, 0);
      spots.forEach((s, i) => s.intensity = 1.3 + Math.sin(t * 2 + i) * 0.3);
      people.forEach(({ p, b, bottle }) => {
        const k = t > 1.5 ? Math.sin(t * 5 + b.i) * 0.6 : 0;
        p.userData.armL.rotation.x = Math.PI * 0.85 + k * 0.3; p.userData.armL.position.y = 1.55;
        p.userData.armR.rotation.x = -Math.PI * 0.75 - k * 0.3; p.userData.armR.position.y = 1.55;
        if (t > 3) for (let n = 0; n < 4; n++) {
          const i = si++ % SN; const wp = new THREE.Vector3(); bottle.getWorldPosition(wp);
          sp[i * 3] = wp.x; sp[i * 3 + 1] = wp.y + 0.2; sp[i * 3 + 2] = wp.z;
          svel[i * 3] = (Math.random() - 0.5) * 0.15 + (b.i === 1 ? 0.06 : b.i === 2 ? -0.06 : 0); svel[i * 3 + 1] = 0.12 + Math.random() * 0.12; svel[i * 3 + 2] = (Math.random() - 0.3) * 0.12; slife[i] = 1;
        }
      });
      for (let i = 0; i < SN; i++) { if (slife[i] <= 0) continue; sp[i * 3] += svel[i * 3]; sp[i * 3 + 1] += svel[i * 3 + 1]; sp[i * 3 + 2] += svel[i * 3 + 2]; svel[i * 3 + 1] -= 0.008; slife[i] -= 0.015; if (slife[i] <= 0) sp[i * 3 + 1] = -99; }
      sg.attributes.position.needsUpdate = true;
      if (t > 2.2) { for (let i = 0; i < CN; i++) { cp[i * 3 + 1] -= cv[i]; cp[i * 3] += Math.sin(t * 2 + i) * 0.01; if (cp[i * 3 + 1] < 0) cp[i * 3 + 1] = 18; } cg.attributes.position.needsUpdate = true; }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  return { init, render, resize, dispose, setMode, setFocus, podium, get active() { return !!S; }, get state() { return S; } };
})();
