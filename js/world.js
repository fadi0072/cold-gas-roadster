/* Cold Gas Roadster — Three.js world: McGregor test pad, ramp, five-car row, plume particles, cameras. */
(function () {
  'use strict';
  const P = window.RSPhys;
  const C = P.COURSE;

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function speckle(g, w, h, base, cols, n, rmax) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.2 + Math.random() * 0.5;
      const r = 0.5 + Math.random() * rmax;
      g.fillRect(Math.random() * w, Math.random() * h, r, r);
    }
    g.globalAlpha = 1;
  }
  function textTex(lines, opt) {
    opt = opt || {};
    return canvasTex(opt.w || 512, opt.h || 192, (g, w, h) => {
      g.fillStyle = opt.bg || '#10161d'; g.fillRect(0, 0, w, h);
      g.fillStyle = opt.fg || '#f2f5f7'; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, i) => {
        g.font = (l.weight || 700) + ' ' + (l.size || 72) + 'px "Archivo", "Helvetica Neue", Arial, sans-serif';
        g.fillText(l.text, w / 2, h * (lines.length === 1 ? 0.5 : (i + 0.75) / (lines.length + 0.5)));
      });
    });
  }

  function qualityProfile(q) {
    if (q === 'low') return { pr: Math.min(window.devicePixelRatio || 1, 1.25), shadow: 1024, shadows: true, crowd: 260, trees: 40, particles: 1800 };
    return { pr: Math.min(window.devicePixelRatio || 1, 2), shadow: 2048, shadows: true, crowd: 640, trees: 90, particles: 4000 };
  }

  function createWorld(canvas, opts) {
    opts = opts || {};
    let Q = qualityProfile(opts.quality || 'high');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Q.pr);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = Q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const horizon = new THREE.Color('#ebb790');
    scene.fog = new THREE.Fog(horizon, 220, 1700);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 6000);

    // ---- sky: gradient, sun, soft procedural clouds
    const sunDir = new THREE.Vector3(-0.55, 0.24, 0.8).normalize();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#223a66') }, mid: { value: new THREE.Color('#8ca5c6') }, hor: { value: horizon }, sun: { value: sunDir } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun; varying vec3 vD;',
        'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }',
        'float fbm(vec2 p){ float a=0.5, s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }',
        'void main(){ float y = max(vD.y, 0.0);',
        ' vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, y)); c = mix(c, top, smoothstep(0.2, 0.85, y));',
        ' float s = max(dot(normalize(vD), sun), 0.0);',
        ' c += vec3(1.0,0.75,0.5)*pow(s, 400.0)*2.5 + vec3(1.0,0.66,0.4)*pow(s, 24.0)*0.35 + vec3(1.0,0.6,0.35)*pow(s,4.0)*0.12;',
        ' vec2 uv = vD.xz / max(0.08, vD.y) * 0.9;',
        ' float cl = smoothstep(0.55, 0.85, fbm(uv*0.6 + 3.0)) * smoothstep(0.02, 0.25, y) * (1.0 - smoothstep(0.5, 0.9, y));',
        ' c = mix(c, mix(vec3(1.0,0.86,0.76), vec3(0.95,0.93,0.96), y*1.5) * (0.85 + 0.3*s), cl*0.55);',
        ' if (vD.y < 0.0) c = hor*0.92;',
        ' gl_FragColor = vec4(c,1.0); }',
      ].join('\n'),
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(4000, 40, 20), skyMat));

    // ---- lights
    scene.add(new THREE.HemisphereLight('#c6d6ee', '#7a6646', 0.9));
    const fill = new THREE.DirectionalLight('#9fb6d8', 0.45); fill.position.set(0.4, 0.5, -0.8); scene.add(fill);
    const sunL = new THREE.DirectionalLight('#ffd2a1', 2.2);
    sunL.castShadow = true;
    sunL.shadow.mapSize.set(Q.shadow, Q.shadow);
    Object.assign(sunL.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 320 });
    sunL.shadow.bias = -0.0005; sunL.shadow.normalBias = 0.02;
    scene.add(sunL, sunL.target);

    // ---- ground follows the elevation profile (hill, mesa, canyon, tower); steep faces shade to rock
    const grass = canvasTex(512, 512, (g, w, h) => speckle(g, w, h, '#8b8052', ['#a0935f', '#6e6a40', '#b6a873', '#5d5a37', '#7d7a4a'], 12000, 3), [1, 1]);
    const asphalt = canvasTex(512, 512, (g, w, h) => speckle(g, w, h, '#383b3f', ['#4a4d51', '#2b2e31', '#56595d'], 16000, 2), [1, 1]);
    const ground = new THREE.Mesh(terrainGeometry(-4000, 4000, -4000, 4000, 1 / 15, true), new THREE.MeshStandardMaterial({ map: grass, roughness: 1, vertexColors: true }));
    ground.receiveShadow = true; scene.add(ground);
    const road = new THREE.Mesh(terrainGeometry(-478, -56, -10, 10, 1 / 8, false, 0.03), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 }));
    road.receiveShadow = true; scene.add(road);
    const hillMat = new THREE.MeshStandardMaterial({ color: '#6f6a4a', roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.95 + (i / 25) * Math.PI * 0.9;
      const r = 1300 + Math.random() * 600;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(160 + Math.random() * 220, 40 + Math.random() * 70, 7), hillMat);
      hill.position.set(Math.cos(a) * r + 150, P.terrainH(Math.cos(a) * r + 150).h, Math.sin(a) * r); hill.scale.z = 0.5; scene.add(hill);
    }

    // ---- pad + markings
    const asphaltR = asphalt.clone(); asphaltR.repeat.set(70, 3); asphaltR.needsUpdate = true;
    const padLen = C.X0 + 100 - 14;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(padLen, 24), new THREE.MeshStandardMaterial({ map: asphaltR, roughness: 0.9 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(-56 + padLen / 2, 0.01, -3); pad.receiveShadow = true; scene.add(pad);
    const paint = (x1, x2, z1, z2, mat, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), mat);
      m.rotation.x = -Math.PI / 2; m.position.set((x1 + x2) / 2, y || 0.02, (z1 + z2) / 2); m.receiveShadow = true; scene.add(m); return m;
    };
    const white = new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.8 });
    paint(-60, C.X0, 4.4, 4.6, white); paint(-60, C.X0, -4.6, -4.4, white);
    for (let x = -50; x < C.X0 - 10; x += 12) paint(x, x + 5, -0.08, 0.08, white, 0.021);
    const marks = canvasTex(512, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (const y of [38, 90]) { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(10,10,10,0.85)'); gr.addColorStop(1, 'rgba(10,10,10,0)'); g.fillStyle = gr; g.fillRect(0, y - 9, w, 18); }
    });
    paint(C.startX, C.startX + 26, -1.6, 1.6, new THREE.MeshStandardMaterial({ map: marks, transparent: true, roughness: 0.9 }), 0.022);
    const checker = canvasTex(64, 512, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#eee'; g.fillRect(x * 32, y * 32, 32, 32); } });
    paint(C.startX - 0.5, C.startX + 0.5, -4.4, 4.4, new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8 }));
    const stripes = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#dedede' : '#c3352b'; g.fillRect(i * 32, 0, 32, h); } }, [30, 1]);
    const curb = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7 });
    paint(C.brakeZone[0], C.brakeZone[1], 4.6, 5.4, curb, 0.03); paint(C.brakeZone[0], C.brakeZone[1], -5.4, -4.6, curb, 0.03);
    const lzTex = (label) => canvasTex(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#f2c84b'; g.lineWidth = 12; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = 'rgba(242,200,75,0.92)'; g.font = '800 120px "Archivo", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, w / 2, h / 2 + 6);
    });
    const lzMat = (l) => new THREE.MeshStandardMaterial({ map: lzTex(l), transparent: true, roughness: 0.8 });
    paint(C.lz1[0], C.lz1[1], -4, 4, lzMat('LZ-1'), 0.025);
    paint(C.lz2[0], C.lz2[1], -4, 4, lzMat('LZ-2'), 0.025);
    paint(C.lz3[1], C.lz3[0], -4, 4, lzMat('LZ-3'), C.mesaH + 0.035);
    paint(C.tower[0] + 1, C.tower[1] - 1, -4, 4, lzMat('SUMMIT'), C.towerTop + 0.035);
    const hatch = canvasTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(242,200,75,0.85)'; g.lineWidth = 14; for (let i = -h; i < w + h; i += 48) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16); }, [3, 1]);
    paint(C.refill[0], C.refill[1], -4.2, 4.2, new THREE.MeshStandardMaterial({ map: hatch, transparent: true, roughness: 0.8 }), C.plateauH + 0.035);
    paint(C.canyonEdge, C.canyonEdge + 1.2, -10, 10, new THREE.MeshBasicMaterial({ color: '#ff5a4e' }), C.plateauH + 0.04);
    for (let x = C.hillFoot - 30; x > C.hillTop; x -= 12) { const h = P.terrainH(x - 2.5).h; paint(x - 5, x, -0.08, 0.08, white, h + 0.05); }
    for (let x = C.hillTop; x > C.canyonEdge + 3; x -= 12) paint(x - 5, x, -0.08, 0.08, white, C.plateauH + 0.045);
    for (let x = C.canyonFar - 3; x > C.tower[1] + 3; x -= 12) paint(x - 5, x, -0.08, 0.08, white, C.mesaH + 0.045);

    // ---- signs
    const sign = (x, z, lines, opt, baseY) => {
      const g = new THREE.Group();
      const bw = opt.w || 4, bh = opt.h || 1.5;
      const tex = textTex(lines, { bg: opt.bg, fg: opt.fg, w: 512, h: Math.round(512 * bh / bw) });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      board.position.y = opt.y || 2.2; g.add(board);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, opt.y || 2.2, 8), new THREE.MeshStandardMaterial({ color: '#555' }));
      post.position.y = (opt.y || 2.2) / 2 - 0.4; g.add(post);
      if (opt.west) g.rotation.y = Math.PI;
      g.position.set(x, baseY || 0, z); scene.add(g); return g;
    };
    for (let d = 50; d <= 150; d += 50) sign(C.startX + d, -7.5, [{ text: d + ' m', size: 96 }], { w: 2.4, h: 1.0 });
    sign(C.startX - 3, -8, [{ text: 'LAUNCH', size: 80 }, { text: '0–60 TIMED', size: 44, weight: 500 }], { w: 4, h: 1.6, y: 2.6 });
    sign(222, -8, [{ text: 'RAMP AHEAD', size: 70 }, { text: 'ENTER UNDER 35 MPH', size: 44, weight: 600 }], { w: 4.6, h: 1.7, y: 2.6, bg: '#5a1712' });
    sign(P.ROW_X2 + 22, -8, [{ text: 'KICKFLIP', size: 80 }, { text: 'LIFT OFF HERE', size: 44, weight: 600 }], { w: 4.2, h: 1.6, y: 2.6, bg: '#123a52' });
    sign(C.hillFoot + 6, -8, [{ text: 'HILL CLIMB', size: 76 }, { text: 'MESA 18 m · REFILL PAD', size: 42, weight: 600 }], { w: 4.6, h: 1.7, y: 2.6, bg: '#2b3a1c' });
    sign(C.refill[1] + 4, -8, [{ text: 'REFILL', size: 86 }, { text: 'STOP IN THE YELLOW BOX', size: 40, weight: 600 }], { w: 4.4, h: 1.7, y: 2.6, bg: '#5a4a10' }, C.plateauH);
    sign(C.canyonEdge + 14, -8, [{ text: 'CANYON', size: 86 }, { text: 'LIFT AT THE RED LINE', size: 42, weight: 600 }], { w: 4.4, h: 1.7, y: 2.6, bg: '#5a1712' }, C.plateauH);
    sign(C.towerSign, -8, [{ text: 'SUMMIT', size: 86 }, { text: 'LIFT OFF HERE · 10 m UP', size: 40, weight: 600 }], { w: 4.4, h: 1.7, y: 2.6, bg: '#123a52' }, C.mesaH);

    scene.add(buildRamp());
    P.VEHICLES.forEach((v, i) => scene.add(buildVehicle(v, i)));
    const barrelMat = new THREE.MeshStandardMaterial({ color: '#e8771f', roughness: 0.6 });
    for (let z = -4.5; z <= 4.5; z += 1.0) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), barrelMat);
      b.position.set(C.barrierX - 0.5, C.mesaH + 0.55, z); b.castShadow = true; scene.add(b);
    }
    const cart = buildRefillCart(); cart.position.set(C.refill[0] + 16, C.plateauH, -7.2); scene.add(cart);
    buildTowerTrim(scene);
    buildBackdrop(scene, Q);

    // ---- car + contact shadow
    const car = RSCar.buildRoadster(); scene.add(car.group);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.9), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
      transparent: true, depthWrite: false,
    }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; blob.renderOrder = 1; scene.add(blob);

    const parts = createParticles(Q.particles); scene.add(parts.points);
    // landing shock rings
    const rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 48);
    function shock(x, y, k) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
      r.rotation.x = -Math.PI / 2; r.position.set(x, y + 0.08, 0); r.userData = { t: 0, k };
      scene.add(r); rings.push(r);
    }
    function updateRings(dt) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i], u = r.userData; u.t += dt;
        const f = u.t / 0.6;
        if (f >= 1) { scene.remove(r); r.material.dispose(); rings.splice(i, 1); continue; }
        const sc = 1 + f * (6 + 6 * u.k);
        r.scale.set(sc, sc, 1); r.material.opacity = 0.7 * (1 - f);
      }
    }

    const state = { camMode: 'side', camPos: new THREE.Vector3(80, 4, 20), camLook: new THREE.Vector3(90, 1, 0), orbit: 0.6, orbitPitch: 0.16, orbitVel: 0, dragging: false, shake: 0, shakeOn: true, cut: false, frame: { x: 0.5, y: 0.5 } };

    function resize() {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      parts.mat.uniforms.uScale.value = h * 0.5 / Math.tan(42 * Math.PI / 360) * renderer.getPixelRatio();
    }

    // drag-to-rotate in the showroom
    let lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', (e) => { if (!state.showroom) return; state.dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!state.dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      state.orbit -= dx * 0.008; state.orbitVel = -dx * 0.008;
      state.orbitPitch = THREE.MathUtils.clamp(state.orbitPitch + dy * 0.004, 0.02, 0.6);
    });
    const endDrag = () => { state.dragging = false; };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

    const qz = new THREE.Quaternion(), qx = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0);
    const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3();

    function syncCar(s, dt) {
      const g = car.group;
      g.position.set(s.x, s.y, 0);
      qz.setFromAxisAngle(Z, s.th); qx.setFromAxisAngle(X, s.ph);
      g.quaternion.copy(qz).multiply(qx);
      const sp = s.mode === 'ramp' ? s.v : s.vx * s.dir;
      car.wheels.forEach((w) => { w.rotation.z -= sp * dt / 0.36; });
      const deploy = state.showroom || s.mode === 'ramp' || (s.mode === 'ground' && (Math.abs(s.vx) < 40 || s.drive.F < 0)) ? 1 : 0;
      car.wingT += (deploy - car.wingT) * Math.min(1, dt * 4);
      car.wing.position.y = 1.4 - P.CAR.cmH + 0.1 * car.wingT; car.wing.rotation.z = -0.12 * car.wingT;
      // plume length follows the expansion state: under-expanded jets flare longer, fading ones shrink
      const u = s.unit || {}, ex = u.ok ? THREE.MathUtils.clamp((u.pe || 0) / s.env.pa, 0.55, 1.6) : 0.6;
      for (let i = 0; i < 10; i++) {
        const v = s.valve[i], pc = car.plumes[i];
        pc.visible = v > 0.02;
        if (pc.visible) { pc.scale.set(0.7 + v * 0.6, (0.4 + v * 1.1) * ex, 0.7 + v * 0.6); pc.material.opacity = 0.3 * v; }
        car.nozzles[i].material = v > 0.02 ? car.nozMatOn : car.nozMat;
      }
      const gh = P.terrainH(s.x).h;
      const hgt = Math.max(0, s.y - P.CAR.cmH - gh);
      blob.position.set(s.x, gh + 0.03, 0); blob.visible = s.mode !== 'ramp';
      const k = Math.max(0, 1 - hgt / 9);
      blob.material.opacity = 0.9 * k; blob.scale.set(1 + hgt * 0.08, 1 + hgt * 0.08, 1);
      // refill cart pulses while the hose is connected
      cart.userData.t += dt;
      cart.userData.lamp.material.emissiveIntensity = s.refilling ? 0.6 + 0.6 * Math.abs(Math.sin(cart.userData.t * 6)) : 0.08;
      cart.userData.hose.visible = s.refilling || (s.mode === 'ground' && Math.abs(s.vx) < 0.3 && s.x >= C.refill[0] && s.x <= C.refill[1]);
      if (cart.userData.hose.visible) {
        const hx = s.x - 1.6 - cart.position.x, hz = 0.9 - cart.position.z;
        cart.userData.hose.scale.set(1, Math.hypot(hx, hz), 1); cart.userData.hose.rotation.y = Math.atan2(hx, hz);
      }
    }

    function emitPlumes(s, dt, RH) {
      const k = 26 * (0.35 + 0.65 * RH) * (Q.particles / 4000);
      for (let i = 0; i < 10; i++) {
        const md = s.nM[i]; if (md < 0.02) continue;
        const n = P.NOZZLES[i];
        car.acc[i] += md * dt * k;
        if (car.acc[i] < 1) continue;
        tmpV.set(n.p[0], n.p[1], n.p[2]).applyQuaternion(car.group.quaternion).add(car.group.position);
        tmpD.set(n.d[0], n.d[1], n.d[2]).applyQuaternion(car.group.quaternion);
        while (car.acc[i] >= 1) {
          car.acc[i] -= 1;
          const sp = 26 + Math.random() * 18;
          parts.spawn(tmpV.x + tmpD.x * 0.15, tmpV.y + tmpD.y * 0.15, tmpV.z + tmpD.z * 0.15,
            s.vx + tmpD.x * sp + (Math.random() - 0.5) * 5, s.vy + tmpD.y * sp + (Math.random() - 0.5) * 5, tmpD.z * sp + (Math.random() - 0.5) * 5,
            0.25, 1.6 + Math.random() * 1.2, (1.3 + Math.random() * 1.7) * (0.6 + 0.8 * RH), 0.36 * (0.3 + 0.7 * RH), 0.94, 0.97, 1.0);
        }
      }
      // tyre smoke on hard launches; dust pulled from under the skirts when the fan is working
      const gh = P.terrainH(s.x).h;
      if (s.mode === 'ground' && s.drive.slip && Math.abs(s.vx) < 20 && Math.random() < 0.6) {
        parts.spawn(s.x - s.dir * 1.4, gh + 0.2, (Math.random() < 0.5 ? -0.9 : 0.9), -s.dir * 2, 0.6, (Math.random() - 0.5) * 2, 0.3, 1.4, 1.4, 0.25, 0.8, 0.8, 0.82);
      }
      if (s.mode === 'ground' && s.fan > 0.6 && Math.abs(s.vx) > 6 && Math.random() < 0.35) {
        parts.spawn(s.x - s.dir * 2.3, gh + 0.15, (Math.random() - 0.5) * 1.8, -s.dir * 1.5, 0.3, (Math.random() - 0.5) * 1.5, 0.2, 0.9, 0.8, 0.12, 0.62, 0.56, 0.44);
      }
      // refill: a wisp of vapour at the hose coupling
      if (s.refilling && Math.random() < 0.3) parts.spawn(s.x - 1.6, gh + 0.5, 0.9, (Math.random() - 0.5), 0.8, (Math.random() - 0.5), 0.15, 0.8, 0.9, 0.25, 0.95, 0.97, 1.0);
    }

    function burst(x, y, n, rgb) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
        parts.spawn(x, y, 0, Math.cos(a) * sp, Math.abs(Math.sin(a)) * sp * 0.6, (Math.random() - 0.5) * sp, 0.4, 2.2 + Math.random() * 2, 2.5 + Math.random() * 2, 0.55, rgb[0], rgb[1], rgb[2]);
      }
    }

    const desP = new THREE.Vector3(), desL = new THREE.Vector3();
    function updateCamera(s, dt) {
      const k = 1 - Math.exp(-dt * (state.camMode === 'chase' ? 6 : 3.2));
      let fov = 42;
      if (state.showroom) {
        if (!state.dragging) { state.orbitVel *= Math.exp(-dt * 2); state.orbit += dt * 0.12 + state.orbitVel * 0.1; }
        const r = 9.4 * Math.max(1, 1.15 / camera.aspect);
        desP.set(s.x + Math.cos(state.orbit) * r * Math.cos(state.orbitPitch), 0.6 + Math.sin(state.orbitPitch) * r, Math.sin(state.orbit) * r * Math.cos(state.orbitPitch));
        desL.set(s.x, 0.15, 0);
        fov = 34;
      } else if (state.camMode === 'chase') {
        const vh = Math.hypot(s.vx, s.vy);
        const fx = s.mode === 'ground' ? s.dir : (vh > 2 ? s.vx / vh : s.dir), fy = s.mode === 'ground' || vh < 2 ? 0 : s.vy / vh;
        desP.set(s.x - fx * 11, s.y - fy * 11 + 3.4, 2.5);
        desL.set(s.x + fx * 6, s.y + fy * 6 + 0.6, 0);
        fov = 50 + Math.min(16, vh * 0.18);
      } else if (state.camMode === 'stands') {
        desP.set(C.startX + 70, 7, 38); desL.set(s.x, s.y, 0);
        fov = THREE.MathUtils.clamp(2 * Math.atan(9 / Math.hypot(s.x - desP.x, 38)) * 180 / Math.PI, 8, 42);
      } else {
        const lead = THREE.MathUtils.clamp(s.vx * 0.33, -9, 9);
        const sp = Math.hypot(s.vx, s.vy);
        desP.set(s.x + lead, Math.max(2.4, s.y * 0.7 + 2.6), 16 + Math.min(7, sp * 0.1) + (s.mode === 'ramp' ? 6 : 0));
        desL.set(s.x + lead * 0.6, s.y * 0.85 + 0.7, 0);
        fov = 42 + Math.min(10, sp * 0.12);
      }
      const kk = state.cut ? 1 : k; state.cut = false;
      state.camPos.lerp(desP, state.showroom ? 1 : kk); state.camLook.lerp(desL, state.showroom ? 1 : Math.min(1, kk * 1.4));
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
      camera.position.copy(state.camPos);
      if (state.shake > 0) {
        state.shake = Math.max(0, state.shake - dt * 2.5);
        if (state.shakeOn) { camera.position.x += (Math.random() - 0.5) * state.shake * 0.6; camera.position.y += (Math.random() - 0.5) * state.shake * 0.6; }
      }
      camera.lookAt(state.camLook);
      // frame the subject inside the visible area (UI panels cover part of the screen)
      const w = renderer.domElement.clientWidth || 1, h = renderer.domElement.clientHeight || 1;
      const fxp = state.showroom ? state.frame.x : 0.5, fyp = state.showroom ? state.frame.y : 0.5;
      if (fxp !== 0.5 || fyp !== 0.5) camera.setViewOffset(w, h, w * (0.5 - fxp), h * (0.5 - fyp), w, h); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
      const gy = P.terrainH(s.x).h;
      sunL.position.set(s.x + sunDir.x * 120, gy + sunDir.y * 120, sunDir.z * 120);
      sunL.target.position.set(s.x, gy, 0);
    }

    function render(s, dt, RH, emit) {
      syncCar(s, dt);
      if (emit) emitPlumes(s, dt, RH);
      parts.update(dt);
      updateRings(dt);
      updateCamera(s, dt);
      renderer.render(scene, camera);
    }

    function setQuality(q) {
      Q = qualityProfile(q);
      renderer.setPixelRatio(Q.pr); resize();
    }

    window.addEventListener('resize', resize);
    resize();
    return { renderer, scene, camera, car, parts, state, render, resize, burst, shock, setQuality };
  }

  // Ground mesh that follows RSPhys.terrainH along x. Dense sampling near the mesa section, coarse elsewhere.
  function terrainGeometry(x0, x1, z0, z1, uvScale, colorBySlope, lift) {
    const xs = [];
    for (let x = x0; x < -500; x += 60) xs.push(x);
    for (let x = -500; x <= -50; x += 0.5) xs.push(x);
    for (const t of P.TERRAIN) if (t[0] > -500 && t[0] < -50) xs.push(t[0]);
    for (let x = -50; x <= x1; x += 60) xs.push(x);
    xs.push(x1);
    const u = Array.from(new Set(xs.filter((x) => x >= x0 && x <= x1))).sort((a, b) => a - b);
    const pos = [], uv = [], col = [], idx = [];
    const rock = [0.55, 0.47, 0.36], flat = [1, 1, 1];
    for (let i = 0; i < u.length; i++) {
      const x = u[i], t = P.terrainH(x), h = t.h + (lift || 0);
      const steep = Math.min(1, Math.abs(t.slope) / 1.2);
      for (const z of [z0, z1]) {
        pos.push(x, h, z); uv.push(x * uvScale, z * uvScale);
        if (colorBySlope) col.push(flat[0] + (rock[0] - flat[0]) * steep, flat[1] + (rock[1] - flat[1]) * steep, flat[2] + (rock[2] - flat[2]) * steep);
      }
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (colorBySlope) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }

  function buildRefillCart() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#c9ced4', metalness: 0.6, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 1.6), dark); body.position.y = 0.95; body.castShadow = true; g.add(body);
    for (const z of [-0.45, 0.45]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 3.0, 18), steel); t.rotation.z = Math.PI / 2; t.position.set(0, 1.95, z); t.castShadow = true; g.add(t); }
    for (const x of [-1.1, 1.1]) for (const z of [-0.7, 0.7]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), new THREE.MeshStandardMaterial({ color: '#111' })); w.rotation.x = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w); }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), new THREE.MeshStandardMaterial({ color: '#eef2f4', roughness: 0.4 })); panel.position.set(0.9, 1.1, 0.83); g.add(panel);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffb547', emissive: '#ffb547', emissiveIntensity: 0.08 })); lamp.position.set(1.4, 1.85, 0.6); g.add(lamp);
    const halo = RSCar.glowSprite('255,181,71', 1.6, 1.6, 0.35); halo.position.copy(lamp.position); g.add(halo);
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), new THREE.MeshStandardMaterial({ color: '#1b1e22', roughness: 0.9 }));
    hose.geometry.translate(0, 0.5, 0); hose.geometry.rotateX(Math.PI / 2); hose.position.set(0, 0.45, 0.8); hose.visible = false; g.add(hose);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), new THREE.MeshBasicMaterial({ map: textTex([{ text: 'GROUND AIR · 450 bar', size: 54 }], { w: 640, h: 172, bg: '#5a4a10' }) }));
    label.position.set(0, 0.95, 0.81); g.add(label);
    g.userData = { lamp, hose, t: 0 };
    return g;
  }

  function buildTowerTrim(scene) {
    const ledMat = new THREE.MeshBasicMaterial({ color: '#bfefff' });
    const x0 = C.tower[0], x1 = C.tower[1], y = C.towerTop + 0.05;
    for (const z of [-5.2, 5.2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, 0.1), ledMat); m.position.set((x0 + x1) / 2, y, z); scene.add(m); }
    for (const x of [x0 + 0.05, x1 - 0.05]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 10.4), ledMat); m.position.set(x, y, 0); scene.add(m); }
    for (let i = 0; i < 6; i++) { const s = RSCar.glowSprite('170,230,255', 2.2, 2.2, 0.4); s.position.set(x0 + 2 + i * (x1 - x0 - 4) / 5, y + 0.2, 5.2); scene.add(s); }
    // beacon on the summit
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), new THREE.MeshStandardMaterial({ color: '#8f9399' })); mast.position.set(x0 + 1.2, y + 3, -5.5); scene.add(mast);
    const beacon = RSCar.glowSprite('255,80,80', 3, 3, 0.8); beacon.position.set(x0 + 1.2, y + 6.2, -5.5); scene.add(beacon);
  }

  // ---------------------------------------------------------------------------
  function buildRamp() {
    const g = new THREE.Group();
    const Rs = C.Rs, T = 0.38, W = 2.6, N = 96;
    const pos = [], idx = [], uv = [];
    const pt = (a, r, z) => [C.X0 + r * Math.sin(a), Rs - r * Math.cos(a), z];
    const prof = [[Rs, -W], [Rs, W], [Rs + T, W], [Rs + T, -W], [Rs, -W]];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI * i / N;
      for (let j = 0; j < prof.length; j++) { pos.push(...pt(a, prof[j][0], prof[j][1])); uv.push(a * Rs / 2, j / 4); }
    }
    const S = prof.length;
    for (let i = 0; i < N; i++) for (let j = 0; j < S - 1; j++) { const a = i * S + j, b = a + 1, c = a + S, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const tex = canvasTex(256, 256, (c, w, h) => { speckle(c, w, h, '#4b4f54', ['#5b6066', '#3e4246'], 3000, 2); c.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < h; y += 32) c.fillRect(0, y, w, 4); }, [1, 1]);
    const shell = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide }));
    shell.castShadow = true; shell.receiveShadow = true; g.add(shell);
    const ledMat = new THREE.MeshBasicMaterial({ color: '#bfefff' });
    for (const z of [-W + 0.05, W - 0.05]) {
      const pts = []; for (let i = 0; i <= 40; i++) { const a = Math.PI * i / 40; pts.push(new THREE.Vector3(...pt(a, Rs - 0.03, z))); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.035, 6), ledMat));
      for (let i = 1; i < 10; i++) { const s = RSCar.glowSprite('170,230,255', 1.1, 1.1, 0.45); s.position.set(...pt(Math.PI * i / 10, Rs - 0.1, z)); g.add(s); }
    }
    const steel = new THREE.MeshStandardMaterial({ color: '#8b9097', metalness: 0.6, roughness: 0.45 });
    [0.45, 0.85, 1.25, 1.6, 1.95, 2.3, 2.65, 2.95, 3.12].forEach((a) => {
      const [x, y] = pt(a, Rs + T, 0);
      const top = Math.max(y, 0.3) + 0.25;
      for (const z of [-W - 0.45, W + 0.45]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, top, 0.28), steel); col.position.set(x, top / 2, z); col.castShadow = true; g.add(col); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2 * W + 1.2), steel);
      const [bx, by] = pt(a, Rs + T + 0.15, 0); beam.position.set(bx, by, 0); beam.rotation.z = -a; g.add(beam);
    });
    return g;
  }

  function extrudeProfile(pts, depth, bevel) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  function simpleWheel(r, w, x, y, z, parent) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22), new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.9 }));
    tire.rotation.x = Math.PI / 2; tire.position.set(x, y, z); tire.castShadow = true; parent.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 1.02, 12), new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.85, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(x, y, z); parent.add(rim);
  }

  function buildVehicle(v, i) {
    const g = new THREE.Group();
    const colors = ['#b3201f', '#3d5a80', '#c9ccd0', '#c9a96b', '#f0f0ee'];
    const metal = i === 2;
    const mat = new THREE.MeshPhysicalMaterial({ color: colors[i], metalness: metal ? 0.9 : 0.2, roughness: metal ? 0.38 : 0.35, clearcoat: metal ? 0 : 1 });
    const glass = new THREE.MeshStandardMaterial({ color: '#111820', metalness: 0.8, roughness: 0.15 });
    const L = v.len, H = v.h, hl = L / 2;
    let prof;
    if (v.name === 'Cybertruck') prof = [[-hl, 0.35], [hl, 0.35], [hl, 1.05], [-0.25 * L, H], [-hl, 1.25]];
    else if (v.name === 'Semi') prof = [[-hl, 0.45], [hl, 0.45], [hl, 1.6], [hl - 0.6, H * 0.7, hl - 1.4, H], [hl - 2.6, H], [hl - 2.6, 1.3], [-hl, 1.3]];
    else if (v.name === 'Cybercab') prof = [[-hl, 0.3], [hl, 0.3], [hl + 0.05, 0.6, hl - 0.6, 0.85], [0.3, H, -0.6, H], [-hl + 0.2, 1.0, -hl, 0.7]];
    else { const f = v.name === 'Model Y' ? 0.05 : 0.15; prof = [[-hl, 0.3], [hl, 0.3], [hl + 0.05, 0.65, hl - 0.8, 0.85], [f * L, H, -0.15 * L, H], [-hl + 0.4, H * 0.92, -hl, 0.8]]; }
    const body = new THREE.Mesh(extrudeProfile(prof, v.w - 0.12, 0.06), mat);
    body.castShadow = true; body.receiveShadow = true; g.add(body);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(L * 0.35, 0.02, v.w * 0.82), glass);
    gl.position.set(v.name === 'Semi' ? hl - 1.9 : 0, H - 0.005, 0); if (v.name !== 'Cybertruck') g.add(gl);
    const r = v.name === 'Semi' ? 0.52 : 0.36;
    const wx = v.name === 'Semi' ? [hl - 1.0, -hl + 1.2, -hl + 2.6] : [hl - 0.85, -hl + 0.85];
    for (const x of wx) for (const z of [v.w / 2 - 0.2, -v.w / 2 + 0.2]) simpleWheel(r, 0.28, x, r, z, g);
    if (v.name === 'Semi') { const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, 0.15, v.w - 0.3), new THREE.MeshStandardMaterial({ color: '#2b2f33' })); deck.position.set(-hl + L * 0.28, 1.25, 0); g.add(deck); }
    g.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2;
    g.position.set((v.x1 + v.x2) / 2, 0, -0.5);
    return g;
  }

  function buildBackdrop(scene, Q) {
    const steel = new THREE.MeshStandardMaterial({ color: '#8f9399', metalness: 0.5, roughness: 0.6 });
    const concrete = new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.95 });
    const stand = (x, z, h) => {
      const g = new THREE.Group();
      for (const dx of [-5, 5]) for (const dz of [-5, 5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), steel); l.position.set(dx, h / 2, dz); g.add(l); }
      for (let y = 8; y < h; y += 8) { const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 11), steel); b.position.y = y; g.add(b); }
      const base = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 16), concrete); base.position.set(0, 3, 6); g.add(base);
      g.position.set(x, 0, z); scene.add(g);
    };
    stand(420, -320, 46); stand(-160, -420, 38); stand(640, -520, 30);
    const wt = new THREE.Group();
    const tankM = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12), new THREE.MeshStandardMaterial({ color: '#e7e4dc', roughness: 0.6 }));
    tankM.position.y = 34; tankM.scale.y = 0.75; wt.add(tankM);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 30, 6), steel); l.position.set(Math.cos(a) * 6, 15, Math.sin(a) * 6); wt.add(l); }
    wt.position.set(80, 0, -460); scene.add(wt);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 24, 18), new THREE.MeshStandardMaterial({ color: '#d8d6cf', metalness: 0.3, roughness: 0.5 }));
      t.rotation.z = Math.PI / 2; t.position.set(250 + i * 9, 3.2, -240 - i * 2); scene.add(t);
    }
    const gs = new THREE.Group();
    for (let r = 0; r < 6; r++) { const step = new THREE.Mesh(new THREE.BoxGeometry(120, 0.6, 1.6), concrete); step.position.set(0, 0.3 + r * 0.6, -r * 1.6); gs.add(step); }
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), new THREE.MeshStandardMaterial({ roughness: 0.9 }), Q.crowd);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < Q.crowd; i++) {
      const r = i % 6;
      m4.makeTranslation((Math.random() - 0.5) * 116, 1.05 + r * 0.6, -r * 1.6 + (Math.random() - 0.5) * 0.3);
      crowd.setMatrixAt(i, m4);
      col.setHSL(Math.random(), 0.2 + Math.random() * 0.25, 0.22 + Math.random() * 0.3); crowd.setColorAt(i, col);
    }
    gs.add(crowd);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(44, 9), new THREE.MeshBasicMaterial({
      map: textTex([{ text: 'R O A D S T E R', size: 120, weight: 800 }, { text: 'McGREGOR · TEXAS · 10.15.2026', size: 44, weight: 500 }], { w: 1600, h: 330, bg: '#05080c', fg: '#eef3f6' }),
    }));
    wall.position.set(0, 9.5, -14); gs.add(wall);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(45, 10, 0.6), steel); frame.position.set(0, 9.5, -14.35); gs.add(frame);
    for (const x of [-18, 18]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), steel); p.position.set(x, 2.5, -14.3); gs.add(p); }
    gs.position.set(170, 0, -26); scene.add(gs);
    for (let x = 0; x <= C.X0; x += 60) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 8), steel); p.position.set(x, 7, -16); scene.add(p);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.4), new THREE.MeshBasicMaterial({ color: '#fff4dc' })); head.position.set(x, 14, -15.7); scene.add(head);
      const halo = RSCar.glowSprite('255,236,200', 7, 5, 0.5); halo.position.set(x, 14, -15.3); scene.add(halo);
    }
    const treeMat = new THREE.MeshStandardMaterial({ color: '#4d5a32', roughness: 1, flatShading: true });
    for (let i = 0; i < Q.trees; i++) {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + Math.random() * 3, 0), treeMat);
      t.position.set(-400 + Math.random() * 1100, 1.5, -140 - Math.random() * 600); t.scale.y = 0.7; scene.add(t);
    }
  }

  // ---------------------------------------------------------------------------
  function createParticles(N) {
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N), color = new Float32Array(N * 3);
    const age = new Float32Array(N), life = new Float32Array(N), grow = new Float32Array(N), a0 = new Float32Array(N), rot = new Float32Array(N);
    let head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
    // puff texture: soft core with lumpy edge
    const puff = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      for (let i = 0; i < 18; i++) {
        const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 }, map: { value: puff } },
      vertexShader: [
        'attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aRot; uniform float uScale; varying float vA; varying vec3 vC; varying float vR;',
        'void main(){ vA = aAlpha; vC = aColor; vR = aRot; vec4 mv = modelViewMatrix*vec4(position,1.0);',
        ' gl_PointSize = min(640.0, aSize * uScale / max(0.5, -mv.z)); gl_Position = projectionMatrix*mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D map; varying float vA; varying vec3 vC; varying float vR;',
        'void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vR), co = cos(vR); c = mat2(co,-s,s,co)*c;',
        ' vec4 t = texture2D(map, c + 0.5); float a = t.a * vA * 1.6; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }',
      ].join('\n'),
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    function spawn(x, y, z, vx, vy, vz, s0, g, l, al, r, gg, b) {
      const i = head; head = (head + 1) % N;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      size[i] = s0; grow[i] = g; life[i] = l; age[i] = 0; a0[i] = al; rot[i] = Math.random() * 6.28;
      color[i * 3] = r; color[i * 3 + 1] = gg; color[i * 3 + 2] = b;
      geo.attributes.aRot.needsUpdate = true;
    }
    function update(dt) {
      const drag = Math.exp(-dt / 0.22);
      for (let i = 0; i < N; i++) {
        if (age[i] >= life[i]) { alpha[i] = 0; continue; }
        age[i] += dt;
        const j = i * 3;
        vel[j] = 1.4 + (vel[j] - 1.4) * drag; vel[j + 1] = -0.35 + (vel[j + 1] + 0.35) * drag; vel[j + 2] = 0.6 + (vel[j + 2] - 0.6) * drag;
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        const floor = P.terrainH(pos[j]).h + 0.2;
        if (pos[j + 1] < floor) {
          pos[j + 1] = floor;
          if (vel[j + 1] < 0) { const sp = -vel[j + 1] * 0.8; vel[j + 1] = 0; vel[j] += (Math.random() - 0.5) * sp * 2; vel[j + 2] += (Math.random() - 0.5) * sp * 2; }
        }
        size[i] += grow[i] * dt * (1 - age[i] / life[i] * 0.6);
        const f = age[i] / life[i];
        alpha[i] = a0[i] * Math.min(1, age[i] / 0.04) * Math.pow(1 - f, 1.6);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aColor.needsUpdate = true;
    }
    return { points, mat, spawn, update };
  }

  window.RSWorld = { createWorld };
})();
