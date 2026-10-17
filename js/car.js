/* Cold Gas Roadster — the Roadster model.
 * Faceted wedge body lofted from 11 cross-sections (matches the reveal car: knife-edge nose with light bar,
 * rising beltline crease, black lower body, bronze glass canopy, tall rear wing, six-blade wheels).
 * Origin = centre of mass; ground is at y = -cmH.
 */
(function () {
  'use strict';
  const P = window.RSPhys;

  // Half cross-sections (z, y above ground) from outer-bottom to top-centre:
  // 0 sill bottom · 1 top of black sill · 2 beltline crease · 3 shoulder · 4 deck/cabin base · 5 roof edge · 6 centre
  const SECTIONS = [
    { x: 2.26, p: [[0.70, 0.20], [0.78, 0.27], [0.80, 0.36], [0.74, 0.42], [0.55, 0.44], [0.30, 0.445], [0, 0.445]] },
    { x: 2.10, p: [[0.86, 0.17], [0.93, 0.28], [0.96, 0.42], [0.90, 0.50], [0.66, 0.53], [0.36, 0.545], [0, 0.55]] },
    { x: 1.75, p: [[0.92, 0.16], [0.99, 0.30], [1.00, 0.52], [0.95, 0.61], [0.70, 0.645], [0.38, 0.655], [0, 0.655]] },
    { x: 1.25, p: [[0.92, 0.16], [0.99, 0.32], [1.00, 0.58], [0.95, 0.69], [0.70, 0.735], [0.40, 0.745], [0, 0.745]] },
    { x: 0.62, p: [[0.93, 0.16], [0.99, 0.34], [1.00, 0.62], [0.95, 0.76], [0.70, 0.82], [0.46, 0.845], [0, 0.85]] },
    { x: 0.15, p: [[0.93, 0.16], [0.99, 0.36], [1.00, 0.64], [0.95, 0.79], [0.72, 0.85], [0.52, 1.05], [0, 1.10]] },
    { x: -0.40, p: [[0.93, 0.16], [0.99, 0.40], [1.01, 0.66], [0.96, 0.81], [0.74, 0.87], [0.54, 1.08], [0, 1.13]] },
    { x: -0.95, p: [[0.94, 0.16], [1.00, 0.45], [1.02, 0.69], [0.97, 0.84], [0.75, 0.90], [0.52, 1.00], [0, 1.04]] },
    { x: -1.45, p: [[0.95, 0.16], [1.01, 0.50], [1.03, 0.71], [0.98, 0.86], [0.76, 0.91], [0.48, 0.94], [0, 0.95]] },
    { x: -1.95, p: [[0.94, 0.18], [1.00, 0.52], [1.02, 0.72], [0.96, 0.85], [0.74, 0.89], [0.46, 0.91], [0, 0.91]] },
    { x: -2.24, p: [[0.88, 0.24], [0.94, 0.52], [0.96, 0.70], [0.90, 0.82], [0.70, 0.85], [0.44, 0.86], [0, 0.86]] },
  ];
  const M = { PAINT: 0, CARBON: 1, GLASS: 2, ROOF: 3, TRIM: 4 };

  function matOf(seg, half) {
    const cabin = seg >= 4 && seg <= 6;
    if (half <= 0) return M.CARBON;                     // bottom + black sill
    if (half === 4) return cabin ? M.GLASS : M.PAINT;   // side glass
    if (half === 5) return cabin ? M.ROOF : seg === 7 ? M.TRIM : M.PAINT; // windscreen/roof, louvred engine cover
    return M.PAINT;
  }

  function loftBody() {
    const n = SECTIONS[0].p.length, ringLen = 2 * n - 1, pos = [], groups = {};
    const rings = SECTIONS.map((s) => {
      const r = s.p.map(([z, y]) => [s.x, y, z]);
      for (let k = n - 2; k >= 0; k--) r.push([s.x, s.p[k][1], -s.p[k][0]]);
      return r;
    });
    rings.forEach((r) => r.forEach((p) => pos.push(p[0], p[1], p[2])));
    const add = (m, a, b, c) => (groups[m] = groups[m] || []).push(a, b, c);
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < ringLen; j++) {
        const j2 = (j + 1) % ringLen;
        const a = i * ringLen + j, b = i * ringLen + j2, c = (i + 1) * ringLen + j, d = (i + 1) * ringLen + j2;
        const half = j <= n - 2 ? j : j < 2 * n - 2 ? 2 * n - 3 - j : -1;
        const m = matOf(i, half);
        add(m, a, c, b); add(m, b, c, d);
      }
    }
    const cap = (ri, m, flip) => {
      const r = rings[ri]; let cx = 0, cy = 0, cz = 0;
      r.forEach((p) => { cx += p[0]; cy += p[1]; cz += p[2]; });
      const ci = pos.length / 3; pos.push(cx / r.length, cy / r.length, cz / r.length);
      for (let j = 0; j < ringLen; j++) {
        const a = ri * ringLen + j, b = ri * ringLen + (j + 1) % ringLen;
        if (flip) add(m, ci, b, a); else add(m, ci, a, b);
      }
    };
    cap(0, M.CARBON, false); cap(rings.length - 1, M.TRIM, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const idx = [];
    Object.keys(groups).forEach((m) => { geo.addGroup(idx.length, groups[m].length, +m); idx.push(...groups[m]); });
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }

  // Small studio-style cube map so paint and glass catch highlights (no PMREM: it fails on software GL).
  let envCache = null;
  function studioEnv() {
    if (envCache) return envCache;
    const face = (top, bottom, strip) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      if (strip) { g.fillStyle = strip; g.fillRect(8, 14, 48, 10); }
      return c;
    };
    const sky = '#8fa9cf', hor = '#f0b98f', gnd = '#3b3326';
    const t = new THREE.CubeTexture([
      face(sky, hor, 'rgba(255,240,225,0.9)'), face(sky, hor, 'rgba(200,225,255,0.7)'),
      face('#c9daf2', '#c9daf2', 'rgba(255,255,255,0.95)'), face(gnd, gnd),
      face(sky, hor), face(sky, hor, 'rgba(255,214,180,0.8)'),
    ]);
    t.encoding = THREE.sRGBEncoding; t.needsUpdate = true;
    envCache = t; return t;
  }

  function glowTexture(rgb) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.25, 'rgba(' + rgb + ',0.45)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function glowSprite(rgb, sx, sy, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(rgb), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: opacity || 0.8 }));
    s.scale.set(sx, sy, 1); return s;
  }

  function sidewallTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.translate(256, 256); g.fillStyle = 'rgba(200,204,210,0.75)';
    g.font = '700 30px "Archivo", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['TROFEO', 'RS', 'TROFEO', 'RS'].forEach((w, k) => {
      const base = k * Math.PI / 2;
      for (let i = 0; i < w.length; i++) {
        g.save(); g.rotate(base + (i - w.length / 2) * 0.075); g.translate(0, -229); g.fillText(w[i], 0, 0); g.restore();
      }
    });
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  function buildWheel(mats, side) {
    const hub = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 40, 1), mats.rubber);
    tire.rotation.x = Math.PI / 2; tire.castShadow = true; hub.add(tire);
    const wall = new THREE.Mesh(new THREE.RingGeometry(0.278, 0.358, 48), mats.sidewall); wall.position.z = 0.141; hub.add(wall);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), mats.well); back.position.z = 0.09; hub.add(back);
    const barrel = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.272, 48), mats.barrel); barrel.position.z = 0.118; hub.add(barrel);
    const lip = new THREE.Mesh(new THREE.RingGeometry(0.266, 0.282, 48), mats.lip); lip.position.z = 0.142; hub.add(lip);
    const blade = new THREE.Shape();
    blade.moveTo(0.03, -0.032); blade.lineTo(0.262, -0.011); blade.lineTo(0.262, 0.011); blade.lineTo(0.03, 0.032); blade.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.03, bevelEnabled: false });
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(bladeGeo, mats.spoke);
      s.rotation.z = k * Math.PI / 3; s.position.z = 0.112; hub.add(s);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 20), mats.spoke);
    cap.rotation.x = Math.PI / 2; cap.position.z = 0.135; hub.add(cap);
    if (side < 0) hub.scale.z = -1;
    return hub;
  }

  function buildRoadster() {
    const env = studioEnv();
    const paint = new THREE.MeshPhysicalMaterial({ color: '#e9ebed', roughness: 0.4, metalness: 0.06, clearcoat: 0.45, clearcoatRoughness: 0.25, flatShading: true, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.55 });
    const carbon = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.5, metalness: 0.25, flatShading: true, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#5a3b22', roughness: 0.06, metalness: 0.55, clearcoat: 1, flatShading: true, side: THREE.DoubleSide, envMap: env, envMapIntensity: 1.0 });
    const roof = new THREE.MeshPhysicalMaterial({ color: '#0c1017', roughness: 0.05, metalness: 0.7, clearcoat: 1, flatShading: true, side: THREE.DoubleSide, envMap: env, envMapIntensity: 1.1 });
    const trim = new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.6, metalness: 0.3, flatShading: true, side: THREE.DoubleSide });
    const wheelMats = {
      rubber: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.92 }),
      sidewall: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.9, map: sidewallTexture() }),
      well: new THREE.MeshBasicMaterial({ color: '#050506' }),
      barrel: new THREE.MeshStandardMaterial({ color: '#e4e6e8', roughness: 0.35, metalness: 0.2, envMap: env, envMapIntensity: 0.6 }),
      lip: new THREE.MeshStandardMaterial({ color: '#b8bec6', roughness: 0.25, metalness: 0.9, envMap: env }),
      spoke: new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.22, metalness: 0.6, envMap: env, envMapIntensity: 0.9 }),
    };

    const group = new THREE.Group();
    const body = new THREE.Group(); body.position.y = -P.CAR.cmH; group.add(body);
    const shell = new THREE.Mesh(loftBody(), [paint, carbon, glass, roof, trim]);
    shell.castShadow = true; shell.receiveShadow = true; body.add(shell);

    const dark = new THREE.MeshBasicMaterial({ color: '#060708', side: THREE.DoubleSide });
    // wheel arches, side intakes, door seams, hood vents
    for (const sz of [1, -1]) {
      for (const wx of [1.38, -1.38]) {
        const arch = new THREE.Mesh(new THREE.RingGeometry(0.375, 0.455, 40, 1, 0, Math.PI), dark);
        arch.position.set(wx, 0.36, 1.025 * sz); body.add(arch);
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.5 }));
        cal.position.set(wx + 0.13, 0.48, 0.97 * sz); body.add(cal);
      }
      const intake = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.18), dark);
      intake.position.set(-0.98, 0.64, 1.035 * sz); intake.rotation.y = sz > 0 ? 0 : Math.PI; body.add(intake);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.4, 0.01), dark);
      seam.position.set(0.58, 0.56, 1.012 * sz); seam.rotation.z = 0.12; body.add(seam);
      const seam2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.34, 0.01), dark);
      seam2.position.set(-0.72, 0.6, 1.02 * sz); body.add(seam2);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.2), dark);
      vent.position.set(1.0, 0.79, 0.3 * sz); vent.rotation.z = -0.166; body.add(vent);
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: '#eaf6ff' }));
      drl.position.set(1.25, 0.752, 0.3 * sz); body.add(drl);
    }
    // diffuser fins
    for (const z of [-0.5, -0.17, 0.17, 0.5]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.025), trim); f.position.set(-2.06, 0.24, z); body.add(f);
    }
    // splitter
    const split = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 1.66), carbon); split.position.set(2.1, 0.17, 0); body.add(split);

    // light bars + glow
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 1.3), new THREE.MeshBasicMaterial({ color: '#eef8ff' }));
    front.position.set(2.258, 0.432, 0); body.add(front);
    const fGlow = glowSprite('220,240,255', 2.2, 0.5, 0.75); fGlow.position.set(2.32, 0.43, 0); body.add(fGlow);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 1.74), new THREE.MeshBasicMaterial({ color: '#ff3640' }));
    tail.position.set(-2.245, 0.8, 0); body.add(tail);
    const tGlow = glowSprite('255,60,60', 2.4, 0.55, 0.7); tGlow.position.set(-2.3, 0.8, 0); body.add(tGlow);

    // wheels
    const wheels = [];
    for (const x of [1.38, -1.38]) for (const z of [0.9, -0.9]) {
      const w = buildWheel(wheelMats, z); w.position.set(x, 0.36, z); body.add(w); wheels.push(w);
    }

    // rear wing on a swan-neck pylon
    const wing = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.045, 1.94), paint); plate.rotation.z = -0.14; plate.castShadow = true; wing.add(plate);
    const lipW = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.94), carbon); lipW.position.set(-0.32, 0.05, 0); wing.add(lipW);
    for (const z of [0.97, -0.97]) {
      const ep = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.03), paint); ep.position.set(0, -0.07, z); ep.rotation.z = -0.14; wing.add(ep);
    }
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.44), carbon); pylon.position.set(0.12, -0.27, 0); pylon.rotation.z = 0.28; wing.add(pylon);
    wing.position.set(-2.0, 1.4 - P.CAR.cmH, 0); group.add(wing);

    // 10 nozzles + plume cones
    const nozMat = new THREE.MeshStandardMaterial({ color: '#2a2e33', metalness: 0.8, roughness: 0.35 });
    const nozMatOn = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: '#9fe3ff', emissiveIntensity: 0.9 });
    const nozzles = [], plumes = [];
    const coneGeo = new THREE.ConeGeometry(0.16, 1.5, 14, 1, true); coneGeo.translate(0, -0.75, 0); coneGeo.rotateX(Math.PI);
    const yAxis = new THREE.Vector3(0, 1, 0);
    P.NOZZLES.forEach((n) => {
      const d = new THREE.Vector3(n.d[0], n.d[1], n.d[2]);
      const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.035, 0.1, 10), nozMat);
      nz.position.set(n.p[0], n.p[1], n.p[2]); nz.quaternion.setFromUnitVectors(yAxis, d); group.add(nz); nozzles.push(nz);
      const pc = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      pc.position.copy(nz.position); pc.quaternion.setFromUnitVectors(yAxis, d); pc.visible = false; group.add(pc); plumes.push(pc);
    });

    function setPaint(hex) { paint.color.set(hex); }
    return { group, wheels, wing, wingT: 0, nozzles, plumes, nozMat, nozMatOn, acc: new Float64Array(10), setPaint, paint };
  }

  window.RSCar = { buildRoadster, glowSprite, glowTexture };
})();
