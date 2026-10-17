/* Cold Gas Roadster — in-game gauges, thruster map, attitude dial, key indicators, Gas Lab. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const P = window.RSPhys, C = P.COURSE;
  const bar = (p) => (p / 1e5).toFixed(0);
  const degC = (T) => (T - 273.15).toFixed(0);
  const last = {};
  function set(id, text) { if (last[id] !== text) { last[id] = text; $(id).textContent = text; } }
  function chip(id, text, cls) { const k = text + cls; if (last[id] === k) return; last[id] = k; const el = $(id); el.textContent = text; el.className = 'chip' + (cls ? ' ' + cls : ''); }
  function sumF(s, a, b) { let f = 0; for (let i = a; i < b; i++) f += s.nF[i]; return f; }

  function stripPct(x) { return Math.max(0, Math.min(100, (x - C.barrierX) / (C.X0 + 8 - C.barrierX) * 100)); }
  function buildStrip() {
    const el = $('strip'); el.innerHTML = '';
    const mk = (x, cls) => { const i = document.createElement('i'); i.style.left = stripPct(x) + '%'; if (cls) i.className = cls; el.appendChild(i); };
    mk(C.startX); mk(C.launchGate); mk(C.X0, 'ramp'); mk((P.ROW_X1 + P.ROW_X2) / 2, 'row'); mk(C.lz1[0]); mk(C.lz2[1]);
    mk(C.hillFoot); mk((C.refill[0] + C.refill[1]) / 2, 'row'); mk(C.canyonEdge, 'ramp'); mk((C.tower[0] + C.tower[1]) / 2, 'row');
    el.appendChild(document.createElement('b'));
  }

  function update(s, ctx) {
    const m = P.mass(s);
    const v = s.mode === 'ramp' ? Math.abs(s.v) : Math.hypot(s.vx, s.vy);
    const kmh = ctx.units === 'kmh';
    const shown = kmh ? v * 3.6 : v * 2.23694;
    set('spd', String(Math.round(shown)));
    set('spdUnit', kmh ? 'km/h' : 'mph');
    $('spdArc').style.strokeDasharray = Math.min(100, v / 80 * 100).toFixed(1) + ' 100';
    const label = s.mode === 'ramp' ? 'Load' : s.mode === 'air' ? 'Thrust/wt' : 'Accel';
    set('gLbl', label);
    set('gval', s.mode === 'ramp' ? s.gLoad.toFixed(1) + ' g' : s.mode === 'air' ? (sumF(s, 2, 6) / (m * P.G)).toFixed(2) : Math.abs(s.accel).toFixed(2) + ' g');
    const onSurf = s.mode === 'ground' || s.mode === 'ramp';
    set('grip', onSurf ? (s.drive.trac / (m * P.G)).toFixed(2) + ' g' : '—');
    set('pow', Math.round(s.drive.P / 1000) + ' kW');
    chip('modeChip', { ground: 'On ground', ramp: 'On ramp', air: 'Airborne', crashed: 'Crashed' }[s.mode], s.mode === 'crashed' ? 'crit' : s.mode === 'air' ? 'on' : '');
    chip('fanChip', s.fanMode === 'off' ? 'Fan off' : s.fan > 0.5 ? 'Suction ' + ((m * P.G + P.CAR.suction * s.fan * s.seal) / (m * P.G)).toFixed(1) + ' g' : 'Fan venting', s.fanMode === 'off' ? 'warn' : s.fan > 0.5 ? 'on' : '');
    chip('assistChip', s.assist ? 'Assist on' : 'Manual', s.assist ? 'on' : 'warn');

    const tk = s.tank, u = s.unit || {};
    const frac = Math.max(0, tk.m / P.TANK.mFull);
    $('airArc').style.strokeDasharray = (frac * 100).toFixed(1) + ' 100';
    $('airArc').setAttribute('class', 'ring-val' + (tk.m < 1 ? ' empty' : frac < 0.25 ? ' low' : ''));
    $('airArc').parentNode.parentNode.classList.toggle('frost', tk.T < 273.15);
    set('tankKg', tk.m.toFixed(0));
    set('tP', bar(s.Pt || 0) + ' bar');
    set('tT', degC(tk.T) + ' °C');
    $('tT').style.color = tk.T < 233 ? 'var(--ice)' : '';
    const Ft = sumF(s, 0, 10);
    set('thr', (Ft / 1000).toFixed(1) + ' kN');
    set('mdot', s.mdot.toFixed(1) + ' kg/s');
    chip('regChip', s.refilling ? 'Refilling' : tk.m < 1 ? 'Empty' : s.reg.mode === 'REG' ? 'Regulated' : 'Fading', s.refilling ? 'ok' : tk.m < 1 ? 'crit' : s.reg.mode === 'REG' ? 'on' : 'warn');
    $('airArc').parentNode.parentNode.classList.toggle('filling', !!s.refilling);
    if (s.refilling) set('compLine', 'Hose connected · +' + s.mdotIn.toFixed(0) + ' kg/s · full in ' + Math.ceil(((s.fillMass || P.TANK.mFull) - tk.m) / Math.max(0.1, s.mdotIn)) + ' s · gas warming');
    else if (s.mdotIn > 0) set('compLine', 'Onboard compressor +' + s.mdotIn.toFixed(2) + ' kg/s (slow)');
    else set('compLine', 'Jet exits at ' + degC(u.Te || tk.T) + ' °C, so moisture freezes into a cloud');
    // pressure gauge
    const Pb = (s.Pt || 0) / 1e5, reg = ctx.reg || 80;
    $('pgArc').style.strokeDasharray = Math.min(100, Pb / 450 * 100).toFixed(1) + ' 100';
    $('pgArc').setAttribute('class', 'pg-val' + (Pb < reg ? ' low' : tk.T > 333 ? ' hot' : ''));
    $('pgNeedle').setAttribute('transform', 'rotate(' + (-90 + 180 * Math.min(1, Pb / 450)).toFixed(1) + ' 100 100)');
    $('pgSet').setAttribute('transform', 'rotate(' + (-90 + 180 * reg / 450).toFixed(1) + ' 100 100)');
    set('pgVal', Pb.toFixed(0));
    const note = $('pgNote');
    const nt = s.refilling ? 'rising · ' + degC(tk.T) + ' °C' : tk.m < 1 ? 'empty' : Pb < reg ? 'under set point: fading' : s.mdot > 0.5 ? 'dropping' : 'steady';
    if (last.pgNote !== nt) { last.pgNote = nt; note.textContent = nt; note.className = s.refilling ? 'ok' : Pb < reg ? 'warn' : ''; }
    nozzles(s);
    attitude(s);
    $('strip').querySelector('b').style.left = stripPct(s.x) + '%';
  }

  function nozzles(s) {
    const c = $('nozMap'); if (c.offsetParent === null) return;
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const sx = (x) => W / 2 + x * 85, sy = (z) => 112 + z * 78;
    g.fillStyle = 'rgba(242,244,247,0.06)'; g.strokeStyle = 'rgba(242,244,247,0.3)'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sx(-2.22), sy(-0.88)); g.lineTo(sx(1.75), sy(-1.0)); g.lineTo(sx(2.26), sy(-0.7)); g.lineTo(sx(2.26), sy(0.7)); g.lineTo(sx(1.75), sy(1.0)); g.lineTo(sx(-2.22), sy(0.88)); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(12,16,23,0.9)'; g.beginPath(); g.moveTo(sx(0.62), sy(-0.7)); g.lineTo(sx(-0.95), sy(-0.75)); g.lineTo(sx(-0.95), sy(0.75)); g.lineTo(sx(0.62), sy(0.7)); g.closePath(); g.fill();
    g.font = '600 19px "Archivo", Arial, sans-serif'; g.fillStyle = '#8790a0'; g.textBaseline = 'alphabetic';
    g.textAlign = 'left'; g.fillText('◀ BOOST', 10, H - 8);
    g.textAlign = 'center'; g.fillText('● LIFT (under)', W / 2, H - 8);
    g.textAlign = 'right'; g.fillText('ROLL (sides) ▲▼', W - 10, H - 8);
    P.NOZZLES.forEach((n, i) => {
      const v = s.valve[i];
      let x = sx(n.p[0]), y = sy(n.p[2]);
      if (n.g === 'roll') { x += n.d[1] > 0 ? -16 : 16; y += n.p[2] > 0 ? 16 : -16; }
      if (n.g === 'boost') x -= 10;
      const r = n.g === 'roll' ? 10 : 13;
      if (v > 0.02) { g.beginPath(); g.arc(x, y, r + 8, 0, Math.PI * 2); g.fillStyle = 'rgba(143,216,255,' + (0.2 * v) + ')'; g.fill(); }
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = v > 0.02 ? 'rgba(143,216,255,' + (0.4 + 0.6 * v) + ')' : 'rgba(15,20,29,1)';
      g.fill(); g.strokeStyle = v > 0.02 ? '#8fd8ff' : 'rgba(242,244,247,0.35)'; g.lineWidth = 2; g.stroke();
      if (n.g === 'roll') {
        g.fillStyle = v > 0.02 ? '#0a0d13' : 'rgba(242,244,247,0.55)';
        const dy = n.d[1] > 0 ? -1 : 1;
        g.beginPath(); g.moveTo(x, y + dy * 6); g.lineTo(x - 5, y - dy * 4); g.lineTo(x + 5, y - dy * 4); g.fill();
      }
    });
  }

  function attitude(s) {
    const on = s.mode === 'air';
    $('att').hidden = !on; if (!on) return;
    const c = $('attC'), g = c.getContext('2d'), W = c.width, R = W / 2 - 10;
    const uy = Math.cos(s.th) * Math.cos(s.ph), uz = Math.sin(s.ph);
    g.clearRect(0, 0, W, W);
    g.save(); g.translate(W / 2, W / 2);
    g.fillStyle = 'rgba(13,17,25,0.8)'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(242,244,247,0.25)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(143,216,255,0.12)'; g.beginPath(); g.arc(0, 0, R - 2, 0, Math.PI); g.fill();
    g.fillStyle = 'rgba(242,244,247,0.6)'; g.beginPath(); g.moveTo(0, -R + 4); g.lineTo(-7, -R + 16); g.lineTo(7, -R + 16); g.fill();
    g.rotate(Math.atan2(uz, uy));
    const up = uy > 0.5;
    g.fillStyle = up ? '#f2f4f7' : '#ffb547';
    g.beginPath(); g.moveTo(-46, 16); g.lineTo(46, 16); g.lineTo(42, -2); g.lineTo(22, -8); g.lineTo(12, -24); g.lineTo(-12, -24); g.lineTo(-22, -8); g.lineTo(-42, -2); g.closePath(); g.fill();
    g.fillStyle = '#121418'; g.fillRect(-44, 16, 16, 10); g.fillRect(28, 16, 16, 10);
    g.restore();
    const deg = Math.round(Math.acos(Math.max(-1, Math.min(1, uy))) * 180 / Math.PI);
    set('attTxt', (up ? 'Upright' : uy < -0.5 ? 'Upside down' : 'Tilted ' + deg + '°') + ' · ' + Math.max(0, s.y - P.CAR.cmH).toFixed(0) + ' m up');
  }

  function keys(held) {
    document.querySelectorAll('#keysHud span').forEach((el) => {
      const k = el.dataset.k;
      const on = held.has(k) || (k === 'KeyW' && held.has('ArrowUp')) || (k === 'KeyS' && held.has('ArrowDown')) || (k === 'KeyA' && held.has('ArrowLeft')) || (k === 'KeyD' && held.has('ArrowRight')) || (k === 'ShiftLeft' && held.has('ShiftRight'));
      el.classList.toggle('down', on);
    });
  }

  // ---------- Gas Lab ----------
  function lab(s, ctx) {
    const tk = s.tank, u = s.unit || {};
    const rho = tk.m / P.TANK.V, Z = 1 + P.TANK.b * rho;
    $('eqTank').textContent = 'density ρ = m / V = ' + tk.m.toFixed(1) + ' / 0.600 = ' + rho.toFixed(0) + ' kg/m³\nstiffness Z = 1 + bρ = ' + Z.toFixed(3) + '\npressure p = Z·ρ·R·T = ' + bar(s.Pt) + ' bar';
    const T0 = ctx.startTank ? ctx.startTank.T : tk.T, m0 = ctx.startTank ? ctx.startTank.m : tk.m;
    const Tad = T0 * Math.pow(Math.max(0.001, tk.m / m0), 0.4);
    $('eqCool').textContent = 'if no heat came in: T = T₀·(m/m₀)^0.4 = ' + degC(Tad) + ' °C\nactual: ' + degC(tk.T) + ' °C (the tank wall at ' + degC(tk.Tw) + ' °C warms it back)';
    $('eqReg').textContent = 'set ' + ctx.reg + ' bar → feed p₀ = ' + (s.reg.p0 / 1e5).toFixed(1) + ' bar · ' + (s.reg.mode === 'REG' ? 'holding steady' : 'tank too low, thrust fading') +
      '\nthrottling chills it: ΔT = ' + P.muJT(tk.T).toFixed(2) + ' K/bar × ' + s.reg.dP.toFixed(0) + ' bar = ' + (P.muJT(tk.T) * s.reg.dP).toFixed(0) + ' K\nfeed temperature T₀ = ' + degC(s.reg.T0) + ' °C';
    const At = P.NOZZLES[2].At;
    $('eqFlow').textContent = 'ṁ = Cd·A*·p₀·√(γ/RT₀)·0.579\none lift nozzle (' + (P.NOZZLES[2].dThroat * 1000).toFixed(1) + ' mm throat): ' + ((u.mdot || 0) * At).toFixed(2) + ' kg/s when open\nall nozzles right now: ' + s.mdot.toFixed(2) + ' kg/s';
    const pa = s.env.pa;
    const stt = !u.ok ? 'not choked' : u.sep ? 'jet peels off the bell' : u.under ? 'under-expanded' : u.pe < 0.85 * pa ? 'over-expanded' : 'matched to the air outside';
    $('eqThrust').textContent = 'exit Mach ' + P.ME_D.toFixed(2) + ' · area ratio ' + P.EPS.toFixed(1) +
      '\nexit pₑ = ' + ((u.pe || 0) / 1e5).toFixed(2) + ' bar vs outside ' + (pa / 1e5).toFixed(2) + ' bar → ' + stt +
      '\njet speed vₑ = ' + (u.ve || 0).toFixed(0) + ' m/s · Isp ≈ ' + (u.mdot ? (u.F / u.mdot / P.G).toFixed(0) : '—') + ' s' +
      '\nF = ṁvₑ + (pₑ−pₐ)Aₑ = ' + ((u.F || 0) * At / 1000).toFixed(2) + ' kN per lift nozzle';
    $('eqCloud').textContent = 'jet exit Tₑ = T₀·(pₑ/p₀)^0.286 = ' + degC(u.Te || tk.T) + ' °C\ndew point of the air: ' + P.dewPointC(s.env.Tamb - 273.15, s.env.RH).toFixed(0) + ' °C at ' + Math.round(s.env.RH * 100) + '% humidity\n→ water vapour freezes on contact: ice fog';
    set('skP', bar(s.Pt) + ' bar'); set('skT', degC(tk.T) + ' °C');
    spark('spP', ctx.hist.P, ctx.reg, 'bar', 'regulator ' + ctx.reg);
    spark('spT', ctx.hist.T, 0, '°C', 'freezing');
  }

  function bindSparkHover() {
    ['spP', 'spT'].forEach((id) => {
      const c = $(id);
      c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); c._hover = (e.clientX - r.left) / r.width; });
      c.addEventListener('pointerleave', () => { c._hover = null; });
    });
  }

  function spark(id, data, ref, unit, refLabel) {
    const c = $(id), g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (data.length < 2) return;
    let lo = Math.min(ref, ...data), hi = Math.max(ref, ...data);
    if (hi - lo < 10) { hi += 5; lo -= 5; }
    const pad = 8, left = 64, N = 450, xs = (i) => left + (i / (N - 1)) * (W - left - pad), ys = (v) => pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad);
    g.font = '400 18px "Martian Mono", monospace'; g.fillStyle = '#8790a0'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(hi.toFixed(0), left - 10, ys(hi)); g.fillText(lo.toFixed(0), left - 10, ys(lo));
    g.strokeStyle = 'rgba(242,244,247,0.10)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(left, ys(hi)); g.lineTo(W - pad, ys(hi)); g.moveTo(left, ys(lo)); g.lineTo(W - pad, ys(lo)); g.stroke();
    g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,181,71,0.6)'; g.beginPath(); g.moveTo(left, ys(ref)); g.lineTo(W - pad, ys(ref)); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,181,71,0.9)'; g.textAlign = 'left'; g.font = '400 16px "Martian Mono", monospace'; g.fillText(refLabel, left + 6, ys(ref) - 12);
    const off = N - data.length;
    g.beginPath(); data.forEach((v, i) => { const x = xs(i + off), y = ys(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.lineTo(xs(N - 1), H - pad); g.lineTo(xs(off), H - pad); g.closePath(); g.fillStyle = 'rgba(143,216,255,0.10)'; g.fill();
    g.beginPath(); data.forEach((v, i) => { const x = xs(i + off), y = ys(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokeStyle = '#8fd8ff'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
    const ex = xs(N - 1), ey = ys(data[data.length - 1]);
    g.beginPath(); g.arc(ex, ey, 7, 0, Math.PI * 2); g.fillStyle = '#8fd8ff'; g.fill(); g.strokeStyle = '#0f141d'; g.lineWidth = 3; g.stroke();
    if (c._hover != null) {
      const i = Math.round(((c._hover * W - left) / (W - left - pad)) * (N - 1)) - off;
      if (i >= 0 && i < data.length) {
        const x = xs(i + off), y = ys(data[i]);
        g.strokeStyle = 'rgba(242,244,247,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, pad); g.lineTo(x, H - pad); g.stroke();
        g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fillStyle = '#f2f4f7'; g.fill();
        g.textAlign = x > W * 0.7 ? 'right' : 'left'; g.font = '600 18px "Martian Mono", monospace';
        g.fillText(data[i].toFixed(0) + ' ' + unit + ' · ' + ((data.length - 1 - i) * 0.2).toFixed(0) + ' s ago', x + (x > W * 0.7 ? -10 : 10), Math.max(18, y - 16));
      }
    }
  }

  window.RSHud = { buildStrip, update, keys, lab, bindSparkHover };
})();
