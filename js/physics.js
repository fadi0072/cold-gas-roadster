/* Cold Gas Roadster — physics model.
 * Pure JS, no DOM. Loaded as a classic script in the page (global RSPhys) and by tests/sim-check.js in Node.
 *
 * Sources for the published numbers (Tesla claims, Oct 15 2026 event):
 *   2 carbon-overwrapped pressure vessels, ~250 kg of air in 600 L, 10 nozzles, 1 MW, 0–60 mph 0.81 s (live),
 *   fan suction "up to 2 g", tires alone ~1.26 g, "half the mass of Model S Plaid".
 * Everything else (fill pressure, regulator, nozzle sizing, dry mass, course geometry) is an engineering estimate.
 */
(function (root) {
  'use strict';

  // ---------- gas constants (dry air) ----------
  const G = 9.80665;
  const R = 287.05;          // J/(kg·K)
  const GAM = 1.4;
  const CV = 717.6;          // J/(kg·K)
  const CP = 1004.6;
  const EXPO = (GAM - 1) / GAM;                                   // 0.2857
  const CHOKE = Math.pow(2 / (GAM + 1), (GAM + 1) / (2 * (GAM - 1))); // 0.5787
  const ELEVATION = 160;     // m, McGregor TX (approx.)
  const P_AMB = 101325 * Math.pow(1 - 2.25577e-5 * ELEVATION, 5.25588);

  // ---------- tank: 2 × COPV, 600 L total ----------
  const TANK = {
    V: 0.600,          // m³ (Tesla)
    mFull: 250,        // kg (Tesla)
    b: 4.8e-4,         // simplified compressibility Z = 1 + b·ρ (≈1.2 at full fill)
    hAin: 650,         // W/K gas ↔ liner convection (est.)
    Cwall: 40000,      // J/K liner + overwrap heat capacity (est.)
    hAout: 25,         // W/K liner ↔ ambient (carbon overwrap insulates)
    Pmax: 430e5,
    compW: 60000,      // onboard compressor electrical power (est.)
    compEff: 0.6,
  };

  // ---------- car ----------
  const CAR = {
    dry: 1100,         // kg (est. from "half the mass of Model S Plaid")
    L: 4.4, W: 1.95, H: 1.15,
    cmH: 0.5,          // CM height above ground on wheels
    box: { xf: 2.2, xr: -2.2, yb: -0.5, yt: 0.62, z: 0.97 },
    mu: 1.26,          // tire-only grip (Tesla)
    power: 1.0e6,      // 1 MW (Tesla)
    Fdrive: 45000,     // wheel force limit (est.)
    vmax: 104,         // ~233 mph, ">230 mph" (Tesla)
    CdA: 0.62, ClA: 0.55, crr: 0.012,
    suction: 13000,    // N ≈ 1 × weight at full tank -> ~2 g normal load (Tesla: "up to 2 g")
    fanKW: 14,         // est. fan power for that suction through a 5 mm skirt gap
    gLimit: 6.5,       // suspension / occupant limit on the ramp (est.)
    CdAair: 1.1,
  };

  // ---------- course (recreated McGregor demo layout; dimensions estimated) ----------
  const COURSE = {
    startX: 90,
    launchGate: 200,
    X0: 290,           // ramp entry
    Rs: 6.0,           // ramp surface radius -> exit lip at 12 m
    brakeZone: [228, 288],
    lz1: [250, 287],
    lz2: [2, 48],
    barrierX: -476,
    cp2: 262,          // checkpoint: parked before the ramp
    cp3: 262,          // checkpoint: parked on LZ-1, facing back
    cp4: 12,           // checkpoint: parked on LZ-2, facing the hill
    cp5: -216,         // checkpoint: parked on the refill pad (mesa, 18 m)
    cp6: -318,         // checkpoint: parked on LZ-3 (landing mesa, 10 m)
    // Mesa section (west of the pad): hill climb, refill pad, canyon gap, landing mesa, summit tower
    hillFoot: -60, hillTop: -180,
    refill: [-232, -200], refillRate: 12,   // kg/s from the ground cart
    canyonEdge: -250, canyonFar: -292,
    lz3: [-300, -346],
    towerSign: -407, tower: [-441, -421], towerTop: 20, mesaH: 10, plateauH: 18,
  };
  // Elevation profile (x, height). Near-vertical pairs make cliffs and the tower.
  const TERRAIN = [
    [-480, 10], [-441, 10], [-440.98, 20], [-421.02, 20], [-421, 10], [-292, 10], [-291.98, -25],
    [-250.02, -25], [-250, 18], [-180, 18], [-60, 0], [420, 0],
  ];
  function terrainH(x) {
    if (x <= TERRAIN[0][0]) return { h: TERRAIN[0][1], slope: 0 };
    for (let i = 1; i < TERRAIN.length; i++) {
      const a = TERRAIN[i - 1], b = TERRAIN[i];
      if (x <= b[0]) {
        const sl = (b[1] - a[1]) / (b[0] - a[0]);
        return { h: a[1] + sl * (x - a[0]), slope: sl };
      }
    }
    return { h: TERRAIN[TERRAIN.length - 1][1], slope: 0 };
  }

  // Five-car row, parked broadside. Order as the Roadster meets it heading -x.
  const VEHICLES = (function () {
    const spec = [
      { name: 'Model 3', w: 1.85, h: 1.44, len: 4.72 },
      { name: 'Model Y', w: 1.92, h: 1.62, len: 4.75 },
      { name: 'Cybertruck', w: 2.03, h: 1.79, len: 5.68 },
      { name: 'Cybercab', w: 1.90, h: 1.45, len: 4.30 },
      { name: 'Semi', w: 2.60, h: 3.90, len: 6.40 },
    ];
    let x = 74.0;
    return spec.map((v) => {
      const o = Object.assign({}, v, { x2: x, x1: x - v.w });
      x -= v.w + 0.9;
      return o;
    });
  })();
  const ROW_X1 = VEHICLES[VEHICLES.length - 1].x1;
  const ROW_X2 = VEHICLES[0].x2;

  // ---------- 10 nozzles (body frame: x forward, y up, z right) ----------
  // d = exhaust direction; thrust acts along -d.
  const NOZZLES = [
    { id: 'B1', g: 'boost', p: [-2.22, 0.05, 0.42], d: [-1, 0, 0], F: 6000 },
    { id: 'B2', g: 'boost', p: [-2.22, 0.05, -0.42], d: [-1, 0, 0], F: 6000 },
    { id: 'LF1', g: 'lift', p: [1.35, -0.42, 0.62], d: [0, -1, 0], F: 6000, arm: 1.35 },
    { id: 'LF2', g: 'lift', p: [1.35, -0.42, -0.62], d: [0, -1, 0], F: 6000, arm: 1.35 },
    { id: 'LR1', g: 'lift', p: [-1.35, -0.42, 0.62], d: [0, -1, 0], F: 6000, arm: -1.35 },
    { id: 'LR2', g: 'lift', p: [-1.35, -0.42, -0.62], d: [0, -1, 0], F: 6000, arm: -1.35 },
    { id: 'SLu', g: 'roll', p: [0, 0.1, -0.98], d: [0, 1, 0], F: 3500, sense: -1 },
    { id: 'SLd', g: 'roll', p: [0, 0.1, -0.98], d: [0, -1, 0], F: 3500, sense: 1 },
    { id: 'SRu', g: 'roll', p: [0, 0.1, 0.98], d: [0, 1, 0], F: 3500, sense: 1 },
    { id: 'SRd', g: 'roll', p: [0, 0.1, 0.98], d: [0, -1, 0], F: 3500, sense: -1 },
  ];
  const ROLL_ARM = 0.98;
  const P_DESIGN = 80e5, T_DESIGN = 293.15;

  // Nozzle design: expand from 80 bar to ambient at the design point.
  const PR_D = P_AMB / P_DESIGN;
  const ME_D = Math.sqrt((Math.pow(PR_D, -EXPO) - 1) * 2 / (GAM - 1));
  const EPS = (1 / ME_D) * Math.pow((2 / (GAM + 1)) * (1 + (GAM - 1) / 2 * ME_D * ME_D), (GAM + 1) / (2 * (GAM - 1)));
  const CF_D = 0.975 * Math.sqrt(2 * GAM * GAM / (GAM - 1) * Math.pow(2 / (GAM + 1), (GAM + 1) / (GAM - 1)) * (1 - Math.pow(PR_D, EXPO))) * 0.98;
  NOZZLES.forEach((n) => {
    n.At = n.F / (CF_D * P_DESIGN);
    n.Ae = n.At * EPS;
    n.dThroat = Math.sqrt(4 * n.At / Math.PI);
  });

  function tankP(m, T) {
    const rho = m / TANK.V;
    return rho * R * T * (1 + TANK.b * rho);
  }
  function muJT(T) { // Joule–Thomson coefficient of air, K/bar (simplified)
    return Math.min(0.38, Math.max(0.05, 0.12 * Math.pow(293 / T, 1.6)));
  }
  function satVapor(Tc) { // Pa, Magnus
    return 610.94 * Math.exp(17.625 * Tc / (Tc + 243.04));
  }
  function dewPointC(Tc, RH) {
    const g = Math.log(Math.max(0.01, RH)) + 17.625 * Tc / (243.04 + Tc);
    return 243.04 * g / (17.625 - g);
  }

  // Choked-nozzle performance per m² of throat at plenum p0, T0.
  function nozzleUnit(p0, T0, pa) {
    if (!(p0 > pa / 0.528 + 0.2e5)) return { mdot: 0, F: 0, ve: 0, pe: 0, Te: T0, sep: false, under: false, ok: false };
    const mdot = 0.98 * p0 * Math.sqrt(GAM / (R * T0)) * CHOKE;
    const pe = p0 * PR_D;
    const ve = 0.975 * Math.sqrt(2 * GAM / (GAM - 1) * R * T0 * (1 - Math.pow(PR_D, EXPO)));
    let pterm = (pe - pa) * EPS;
    let sep = false;
    if (pe < 0.4 * pa) { sep = true; pterm = (0.4 * pa - pa) * EPS * Math.sqrt(pe / (0.4 * pa)); }
    const F = Math.max(0, mdot * ve + pterm);
    return { mdot, F, ve, pe, Te: T0 * Math.pow(PR_D, EXPO), sep, under: pe > 1.15 * pa, ok: true };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapPi(a) { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; }

  function surfaceAt(x) { // ground or vehicle roof under x
    for (const v of VEHICLES) if (x >= v.x1 && x <= v.x2) return { h: v.h, v };
    return { h: 0, v: null };
  }

  // ---------- simulation ----------
  function createSim(opt) {
    opt = opt || {};
    const Tamb = 273.15 + (opt.ambientC != null ? opt.ambientC : 24);
    const fill = opt.fill != null ? opt.fill : TANK.mFull;
    const s = {
      t: 0, mode: 'ground', x: COURSE.startX, y: CAR.cmH, vx: 0, vy: 0,
      th: 0, ph: 0, wth: 0, wph: 0, dir: 1, alpha: 0, v: 0,
      tank: { m: fill, T: opt.tankT || Tamb, Tw: opt.tankT || Tamb }, fillMass: fill, refilling: false, gy: 0, grade: 0, sinceEdge: 9,
      fan: 0, fanMode: 'auto', seal: 1,
      assist: opt.assist !== false,
      env: { Tamb, RH: opt.RH != null ? opt.RH : 0.55, pa: P_AMB, rho: P_AMB / (R * Tamb) },
      reg: { set: (opt.regBar || 80) * 1e5, p0: 0, T0: Tamb, mode: 'REG', dP: 0 },
      cmd: new Float64Array(10), valve: new Float64Array(10),
      nF: new Float64Array(10), nM: new Float64Array(10),
      mdot: 0, mdotIn: 0, impulse: 0, used: 0,
      drive: { F: 0, P: 0, N: 0, trac: 0, slip: false },
      gLoad: 1, accel: 0, maxG: 1, rollAccum: 0, airTime: 0, sinceRamp: 9, cushion: false,
      lastLandVy: 0, unit: null, crash: null, events: [],
    };
    return s;
  }

  function mass(s) { return CAR.dry + s.tank.m; }

  function placeGround(s, x, dir, v) {
    const g = terrainH(x);
    s.mode = 'ground'; s.x = x; s.y = g.h + CAR.cmH; s.gy = g.h; s.dir = dir;
    s.vx = (v || 0) * dir; s.vy = 0; s.th = (dir > 0 ? 0 : Math.PI) + Math.atan(clamp(g.slope, -0.5, 0.5)); s.ph = dir > 0 ? 0 : Math.PI;
    s.wth = 0; s.wph = 0; s.crash = null; s.cushion = false; s.alpha = 0; s.v = 0;
  }

  function bodyAxes(th, ph) {
    const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    return {
      f: [ct, st, 0],
      u: [-st * cp, ct * cp, sp],
      r: [st * sp, -ct * sp, cp],
    };
  }
  function toWorld(s, p) {
    const a = bodyAxes(s.th, s.ph);
    return [
      s.x + a.f[0] * p[0] + a.u[0] * p[1] + a.r[0] * p[2],
      s.y + a.f[1] * p[0] + a.u[1] * p[1] + a.r[1] * p[2],
      a.f[2] * p[0] + a.u[2] * p[1] + a.r[2] * p[2],
    ];
  }

  function rampPos(alpha) {
    const Rc = COURSE.Rs - CAR.cmH;
    return [COURSE.X0 + Rc * Math.sin(alpha), COURSE.Rs - Rc * Math.cos(alpha)];
  }

  function emit(s, type, data) { s.events.push(Object.assign({ type, t: s.t }, data || {})); }

  function crash(s, reason) {
    if (s.mode === 'crashed') return;
    s.mode = 'crashed';
    s.crash = { reason, t: s.t };
    s.wth += (Math.random() - 0.5) * 4; s.wph += (Math.random() - 0.5) * 6;
    emit(s, 'crash', { reason });
  }

  // ---- flight control: input -> 10 valve commands ----
  function control(s, inp, unit) {
    const cmd = s.cmd; cmd.fill(0);
    if (s.mode === 'crashed') return;
    if (inp.boost) { cmd[0] = cmd[1] = 1; }
    let L = inp.lift ? 1 : 0, p = 0, r = 0;
    const m = mass(s);
    const Fn = unit.F * NOZZLES[2].At;        // one lift nozzle, valve fully open
    const Fr = unit.F * NOZZLES[6].At;        // one roll nozzle
    if (s.mode === 'air') {
      const cth = Math.cos(s.th), cph = Math.cos(s.ph), sph = Math.sin(s.ph);
      const uy = cth * cph;
      if (s.assist) {
        if (uy < 0.2) L = 0; // never push toward the ground
        // touchdown cushion
        const below = Math.max(surfaceAt(s.x - 2).h, surfaceAt(s.x).h, surfaceAt(s.x + 2).h, terrainH(s.x - 2.5).h, terrainH(s.x).h, terrainH(s.x + 2.5).h);
        const clr = s.y - CAR.cmH - below;
        const Fup = 4 * Fn * uy;
        const aNet = Fup / m - G;
        if (!inp.lift && uy > 0.6 && aNet > 0.5) {
          const vt = -1.0;
          if (s.vy < vt) {
            const aReq = (s.vy * s.vy - vt * vt) / (2 * Math.max(0.15, clr));
            if (aReq > 0.8 * aNet) s.cushion = true;
            if (s.cushion) L = clamp((aReq + G) * m / Fup, 0, 1);
          } else s.cushion = false;
        }
        // pitch hold
        if (Math.abs(cph) > 0.25 && Fn > 0) {
          const Ieff = inertia(s).yaw * sph * sph + inertia(s).pitch * cph * cph;
          let wc;
          if (inp.pitch) wc = inp.pitch * 1.8 * Math.sign(cph);
          else {
            const lvl = Math.abs(wrapPi(s.th)) < Math.PI / 2 ? 0 : Math.PI;
            wc = clamp(3.0 * wrapPi(lvl - s.th), -2, 2);
          }
          const tauW = Ieff * 10 * (wc - s.wth);
          p = clamp((tauW / cph) / (2 * Fn * 1.35), -1, 1);
          if (Math.abs(p) < 0.04) p = 0;
        }
        // roll: command rate, snap upright when close
        let wr = null;
        if (inp.roll) wr = inp.roll * 4.5;
        else {
          const base = cth >= 0 ? 0 : Math.PI;
          const err = wrapPi(base - s.ph);
          if (Math.abs(err) < 1.75) wr = clamp(4 * err, -4.5, 4.5);
        }
        if (wr !== null && Fr > 0) {
          r = clamp(inertia(s).roll * 12 * (wr - s.wph) / (2 * Fr * ROLL_ARM), -1, 1);
          if (Math.abs(r) < 0.04) r = 0;
        }
      } else {
        p = inp.pitch || 0;
        r = inp.roll || 0;
      }
    }
    const front = clamp(L + p, 0, 1), rear = clamp(L - p, 0, 1);
    cmd[2] = cmd[3] = front; cmd[4] = cmd[5] = rear;
    if (r > 0) { cmd[7] = cmd[8] = r; } else if (r < 0) { cmd[6] = cmd[9] = -r; }
    if (s.tank.m < 0.3) cmd.fill(0);
  }

  function inertia(s) {
    const m = mass(s);
    return {
      roll: m * (CAR.W * CAR.W + CAR.H * CAR.H) / 12 * 0.9,
      pitch: m * (CAR.L * CAR.L + CAR.H * CAR.H) / 12 * 0.85,
      yaw: m * (CAR.L * CAR.L + CAR.W * CAR.W) / 12 * 0.85,
    };
  }

  // ---- one physics step ----
  function step(s, inp, dt) {
    s.t += dt;
    const env = s.env, tk = s.tank, reg = s.reg;

    // regulator + plenum
    const Pt = tankP(tk.m, tk.T);
    const pAvail = Pt - (1.5e5 + 0.04e5 * s.mdot);
    const wasReg = reg.mode;
    reg.p0 = tk.m > 0.3 ? Math.max(0, Math.min(reg.set - 0.10e5 * s.mdot, pAvail)) : 0;
    reg.mode = pAvail < reg.set ? 'BLOWDOWN' : 'REG';
    if (wasReg === 'REG' && reg.mode === 'BLOWDOWN' && s.mdot > 0.5) emit(s, 'regDropout', { P: Pt });
    reg.dP = Math.max(0, Pt - reg.p0) / 1e5;
    reg.T0 = Math.max(70, tk.T - muJT(tk.T) * reg.dP);
    const unit = nozzleUnit(reg.p0, reg.T0, env.pa);
    s.unit = unit; s.Pt = Pt;

    control(s, inp, unit);

    // valves (solenoid lag ~12 ms) -> per-nozzle flow & thrust
    let mdot = 0;
    for (let i = 0; i < 10; i++) {
      s.valve[i] += (s.cmd[i] - s.valve[i]) * Math.min(1, dt / 0.012);
      if (s.valve[i] < 1e-3) s.valve[i] = 0;
      const k = NOZZLES[i].At * s.valve[i];
      s.nM[i] = unit.mdot * k; s.nF[i] = unit.F * k; mdot += s.nM[i];
    }
    if (mdot * dt > tk.m - 0.05) {
      const sc = Math.max(0, tk.m - 0.05) / Math.max(1e-9, mdot * dt);
      for (let i = 0; i < 10; i++) { s.nM[i] *= sc; s.nF[i] *= sc; }
      mdot *= sc;
    }
    s.mdot = mdot;

    // refill: ground cart on the mesa pad, or the slow onboard compressor anywhere on the ground
    s.mdotIn = 0; let Tin = env.Tamb + 15;
    const fillTo = s.fillMass || TANK.mFull;
    s.refilling = s.mode === 'ground' && Math.abs(s.vx) < 0.3 && s.x >= COURSE.refill[0] && s.x <= COURSE.refill[1] && tk.m < fillTo - 0.05 && mdot === 0;
    if (s.refilling) { s.mdotIn = Math.min(COURSE.refillRate, (fillTo - tk.m) / dt); Tin = env.Tamb + 20; }
    else if ((s.mode === 'ground') && mdot === 0 && tk.m < fillTo - 0.3 && Pt < TANK.Pmax && Pt > 2 * env.pa && !inp.noCompressor) {
      s.mdotIn = TANK.compW * TANK.compEff / (R * env.Tamb * Math.log(Pt / env.pa));
    }

    // tank energy balance (open system, real-ish pressure). Filling heats the gas: inflow brings enthalpy cp·T.
    const Qw = TANK.hAin * (tk.Tw - tk.T);
    const dTdt = (-mdot * R * tk.T + Qw + s.mdotIn * (CP * Tin - CV * tk.T)) / (Math.max(0.5, tk.m) * CV);
    tk.m = Math.max(0, tk.m + (s.mdotIn - mdot) * dt);
    tk.T = Math.max(60, tk.T + dTdt * dt);
    tk.Tw += (TANK.hAout * (env.Tamb - tk.Tw) - Qw) / TANK.Cwall * dt;
    s.used += mdot * dt;

    // fan suction (skirts vent fast when lift is commanded)
    const liftCmd = s.cmd[2] + s.cmd[3] + s.cmd[4] + s.cmd[5];
    const fanOn = s.fanMode === 'auto' && (s.mode === 'ground' || s.mode === 'ramp') && liftCmd === 0;
    s.fan += ((fanOn ? 1 : 0) - s.fan) * Math.min(1, dt / (fanOn ? 0.35 : 0.12));

    let Fboost = s.nF[0] + s.nF[1];
    let Flift = s.nF[2] + s.nF[3] + s.nF[4] + s.nF[5];
    s.impulse += (Fboost + Flift + s.nF[6] + s.nF[7] + s.nF[8] + s.nF[9]) * dt;

    const m = mass(s);
    if (s.mode === 'ground') stepGround(s, inp, dt, m, Fboost, Flift);
    else if (s.mode === 'ramp') stepRamp(s, inp, dt, m, Fboost, Flift);
    else if (s.mode === 'air') stepAir(s, inp, dt, m, Fboost);
    else if (s.mode === 'crashed') stepCrashed(s, dt);

    if (s.mode !== 'crashed' && (s.x < COURSE.barrierX - 2 || s.x > COURSE.X0 + 60)) crash(s, 'Left the test site');
    s.maxG = Math.max(s.maxG, s.gLoad);
  }

  function driveForce(s, inp, vf, N, dt) {
    const trac = CAR.mu * Math.max(0, N);
    let F = 0;
    if (inp.throttle && vf < CAR.vmax) F += inp.throttle * Math.min(CAR.Fdrive, CAR.power / Math.max(0.5, Math.abs(vf)));
    if (inp.brake) {
      if (vf > 0.3) F -= inp.brake * trac;
      else F -= inp.brake * (vf > -5 ? 6000 : 0); // reverse creep
    }
    const Fx = clamp(F, -trac, trac);
    s.drive.slip = Math.abs(F) > trac;
    s.drive.F = Fx; s.drive.N = N; s.drive.trac = trac;
    s.drive.P = Math.max(0, Fx * vf) / 0.92;
    return Fx;
  }

  function stepGround(s, inp, dt, m, Fboost, Flift) {
    const vf = s.vx * s.dir;
    const g0 = terrainH(s.x);
    const slope = clamp(g0.slope, -0.5, 0.5), sinG = slope / Math.sqrt(1 + slope * slope), cosG = 1 / Math.sqrt(1 + slope * slope);
    const S = CAR.suction * s.fan * s.seal;
    const down = 0.5 * s.env.rho * CAR.ClA * vf * vf;
    const N = m * G * cosG + S + down - Flift;
    if (N < 0) {
      s.mode = 'air'; s.vy = 0.2; s.airTime = 0; s.rollAccum = 0; s.cushion = false; s.sinceRamp = 9; s.sinceEdge = 9;
      emit(s, 'takeoff', { x: s.x });
      return;
    }
    const Fx = driveForce(s, inp, vf, N, dt);
    const drag = 0.5 * s.env.rho * CAR.CdA * vf * Math.abs(vf);
    const rr = CAR.crr * N * Math.sign(vf);
    const a = (Fx + Fboost - drag - rr) / m - s.dir * G * sinG;   // gravity along the grade
    let nv = vf + a * dt;
    if (inp.brake && vf > 0 && nv < 0) nv = 0;
    if (!inp.throttle && !inp.brake && !Fboost && Math.abs(nv) < 0.05 && Math.abs(sinG) < 0.02) nv = 0;
    if (inp.brake && Math.abs(nv) < 0.3 && !inp.throttle) nv = 0; // parking brake holds on hills
    s.vx = nv * s.dir;
    s.x += s.vx * dt;
    s.accel = a / G; s.gLoad = Math.hypot(a, N / m) / G;
    s.grade = slope;
    // follow the elevation profile; cliffs up are a wall, cliffs down send the car airborne
    const g1 = terrainH(s.x);
    if (g1.h > g0.h + 1.0) { crash(s, s.x < COURSE.tower[1] + 1 && s.x > COURSE.tower[0] - 1 ? 'Drove into the tower' : 'Drove into the cliff'); return; }
    if (g1.h < g0.h - 1.0) {
      s.mode = 'air'; s.y = g0.h + CAR.cmH; s.vy = 0; s.airTime = 0; s.rollAccum = 0; s.cushion = false; s.sinceRamp = 9;
      s.th = s.dir > 0 ? 0 : Math.PI; s.wth = -s.dir * 0.35; s.sinceEdge = 0; // tail skims the lip, nose drops
      emit(s, 'edge', { x: s.x, v: Math.abs(s.vx) });
      return;
    }
    s.y = g1.h + CAR.cmH; s.gy = g1.h; s.vy = 0;
    s.th = (s.dir > 0 ? 0 : Math.PI) + Math.atan(clamp(g1.slope, -0.5, 0.5));

    if (s.dir > 0 && s.x >= COURSE.X0 && s.x - s.vx * dt < COURSE.X0) {
      s.mode = 'ramp'; s.alpha = (s.x - COURSE.X0) / (COURSE.Rs - CAR.cmH); s.v = nv;
      emit(s, 'rampEnter', { v: nv, g: nv * nv / ((COURSE.Rs - CAR.cmH) * G) + 1 });
    }
    // barrier
    const front = s.dir < 0 ? s.x - 2.2 : s.x + 2.2;
    if (front < COURSE.barrierX && s.dir < 0) {
      if (Math.abs(s.vx) > 4) crash(s, 'Hit the barrier at ' + Math.round(Math.abs(s.vx) * 2.237) + ' mph');
      else { s.x = COURSE.barrierX + 2.2; s.vx = 0; }
    }
    if (s.dir > 0 && s.x > COURSE.X0 + 2) crash(s, 'Ran into the ramp structure');
    const hit = surfaceAt(s.x + 2.2 * Math.sign(s.vx || s.dir)).v || surfaceAt(s.x).v;
    if (hit && s.mode !== 'crashed') crash(s, 'Drove into the ' + hit.name);
  }

  function stepRamp(s, inp, dt, m, Fboost, Flift) {
    const Rc = COURSE.Rs - CAR.cmH;
    const al = s.alpha;
    s.seal = 0.86; // car floor can't follow 6 m curvature perfectly; skirts make up most of the gap
    const S = CAR.suction * s.fan * s.seal;
    const N = m * s.v * s.v / Rc + m * G * Math.cos(al) + S - Flift;
    s.gLoad = s.v * s.v / (Rc * G) + Math.cos(al);
    if (s.gLoad > CAR.gLimit) { crash(s, 'Suspension overload: ' + s.gLoad.toFixed(1) + ' g at the ramp'); return; }
    if (N < 0) {
      const [px, py] = rampPos(al);
      s.mode = 'air'; s.x = px; s.y = py; s.vx = s.v * Math.cos(al); s.vy = s.v * Math.sin(al);
      s.th = al; s.ph = 0; s.wth = s.v / Rc; s.wph = 0; s.airTime = 0; s.rollAccum = 0; s.sinceRamp = 0;
      emit(s, 'detach', { alpha: al });
      return;
    }
    const Fx = driveForce(s, inp, s.v, N, dt);
    const drag = 0.5 * s.env.rho * CAR.CdA * s.v * Math.abs(s.v);
    const a = (Fx + Fboost - drag - CAR.crr * N * Math.sign(s.v)) / m - G * Math.sin(al);
    s.v += a * dt;
    s.alpha += s.v / Rc * dt;
    s.accel = a / G;
    if (s.alpha >= Math.PI) {
      const [px, py] = rampPos(Math.PI);
      s.mode = 'air'; s.x = px; s.y = py; s.vx = -s.v; s.vy = 0;
      s.th = Math.PI; s.ph = 0; s.wth = s.v / Rc; s.wph = 0; s.airTime = 0; s.rollAccum = 0; s.sinceRamp = 0;
      s.seal = 1;
      emit(s, 'rampExit', { v: s.v });
      return;
    }
    if (s.alpha <= 0) {
      s.seal = 1;
      placeGround(s, COURSE.X0 + s.alpha * Rc - 0.01, 1, s.v);
      return;
    }
    const [px, py] = rampPos(s.alpha);
    s.x = px; s.y = py; s.th = s.alpha; s.ph = 0; s.wth = s.v / Rc;
    s.vx = s.v * Math.cos(s.alpha); s.vy = s.v * Math.sin(s.alpha);
  }

  function stepAir(s, inp, dt, m, Fboost) {
    const I = inertia(s);
    const ax = bodyAxes(s.th, s.ph);
    let Fx = 0, Fy = -m * G, tauZ = 0, tauX = 0;
    for (let i = 0; i < 10; i++) {
      const F = s.nF[i]; if (!F) continue;
      const n = NOZZLES[i];
      // thrust along -d (body), projected to the plane
      const tb = [-n.d[0] * F, -n.d[1] * F, -n.d[2] * F];
      Fx += ax.f[0] * tb[0] + ax.u[0] * tb[1] + ax.r[0] * tb[2];
      Fy += ax.f[1] * tb[0] + ax.u[1] * tb[1] + ax.r[1] * tb[2];
      // body torque r × F
      const p = n.p;
      tauX += p[1] * tb[2] - p[2] * tb[1];
      tauZ += p[0] * tb[1] - p[1] * tb[0];
    }
    const sp = Math.hypot(s.vx, s.vy);
    const dragK = 0.5 * s.env.rho * CAR.CdAair * sp;
    Fx -= dragK * s.vx; Fy -= dragK * s.vy;
    s.vx += Fx / m * dt; s.vy += Fy / m * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;

    const cph = Math.cos(s.ph), sph = Math.sin(s.ph);
    const Ieff = I.yaw * sph * sph + I.pitch * cph * cph;
    s.wth += (tauZ * cph - 350 * s.wth) / Ieff * dt;
    s.wph += (tauX - 120 * s.wph) / I.roll * dt;
    s.th += s.wth * dt; s.ph += s.wph * dt;
    s.rollAccum += s.wph * dt;
    s.airTime += dt; s.sinceRamp += dt; s.sinceEdge += dt;
    s.gLoad = Math.hypot(Fx / m, Fy / m + G) / G;
    s.accel = 0;
    s.drive.P = 0;
    collideAir(s);
  }

  const CORNERS = (function () {
    const b = CAR.box, out = [];
    for (const x of [b.xr, b.xf]) for (const y of [b.yb, b.yt]) for (const z of [-b.z, b.z]) out.push([x, y, z]);
    return out;
  })();

  function wallName(x) {
    if (x <= COURSE.tower[1] + 0.5 && x >= COURSE.tower[0] - 0.5) return 'Hit the side of the tower';
    if (x < COURSE.canyonEdge && x > COURSE.canyonFar - 3) return 'Hit the canyon wall';
    return 'Hit the cliff';
  }

  function collideAir(s) {
    let ground = false, minY = Infinity, minClr = Infinity, contactH = 0;
    for (const c of CORNERS) {
      const w = toWorld(s, c);
      const su = surfaceAt(w[0]);
      if (su.v && w[1] < su.h && w[1] > 0) { crash(s, 'Clipped the ' + su.v.name); return; }
      const th = terrainH(w[0]).h;
      // just after driving off a cliff the trailing corners skim the lip while the nose drops: not a landing
      if (s.sinceEdge < 0.8 && th > terrainH(s.x).h + 0.5 && w[1] > th - 1.2) continue;
      if (w[1] < th - 1.2) { crash(s, wallName(w[0])); return; }
      if (w[1] < th) { ground = true; contactH = th; }
      minY = Math.min(minY, w[1]); minClr = Math.min(minClr, w[1] - th);
      // ramp shell
      if (s.sinceRamp > 0.6) {
        const rx = w[0] - COURSE.X0, ry = w[1] - COURSE.Rs, rr = Math.hypot(rx, ry);
        if (rx > -0.1 && rr > COURSE.Rs - 0.05 && rr < COURSE.Rs + 0.6) { crash(s, 'Fell into the ramp'); return; }
      }
      if (w[0] < COURSE.barrierX && w[1] < 1.2) { crash(s, 'Hit the barrier'); return; }
    }
    s.minY = minY; s.minClr = minClr;
    if (!ground) return;
    const under = terrainH(s.x).h;
    if (Math.abs(under - contactH) > 0.5) { crash(s, under < contactH ? 'Landed half off the edge' : 'Came down on the edge'); return; }
    if (under < -5) { crash(s, 'Fell into the canyon'); return; }
    const uy = Math.cos(s.th) * Math.cos(s.ph);
    const pitchErr = Math.abs(Math.sin(s.th));
    if (uy > 0.85 && pitchErr < 0.45) {
      if (s.vy > -5.5) {
        const vy = s.vy;
        const dir = Math.cos(s.th) > 0 ? 1 : -1;
        const turns = s.rollAccum / (2 * Math.PI);
        const air = s.airTime;
        placeGround(s, s.x, dir, s.vx * dir * 0.97);
        s.lastLandVy = vy;
        emit(s, 'land', { vy, x: s.x, turns, air });
      } else crash(s, 'Hit the ground at ' + (-s.vy).toFixed(1) + ' m/s');
    } else crash(s, uy < 0 ? 'Landed on the roof' : 'Landed on its side');
  }

  function stepCrashed(s, dt) {
    s.vy -= G * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.th += s.wth * dt; s.ph += s.wph * dt;
    const floor = terrainH(s.x).h + 0.6;
    if (s.y < floor) {
      s.y = floor; s.vy = Math.abs(s.vy) * 0.25;
      s.vx *= 0.55; s.wth *= 0.5; s.wph *= 0.5;
    }
    s.vx *= Math.exp(-0.6 * dt);
    s.gLoad = 0; s.drive.P = 0;
  }

  // ---------- scripted autopilot (the event car drove itself) ----------
  // a = { phase, mark }. Shared by the game's "Watch it drive itself" and tests/sim-check.js.
  const AUTO_START = ['launch', 'cruise', 'run3', 'climb', 'runCanyon', 'runTower'];
  function autopilot(s, a) {
    const i = {}, t = s.t;
    const go = (p) => { a.phase = p; a.mark = t; };
    switch (a.phase) {
      case 'launch': i.throttle = 1; i.boost = s.vx < 26.8; if (s.x > 150) go('brake'); break;
      case 'brake': if (s.vx > 13) i.brake = 1; else go('cruise'); break;
      case 'cruise': if (s.mode === 'ramp') i.throttle = s.v < 9 ? 0.6 : 0; else i.throttle = s.vx < 13 ? 0.3 : 0; if (s.mode === 'air') go('roll'); break;
      case 'roll': i.roll = 1; if (Math.abs(s.ph) > 1.8) go('fall'); break;
      case 'fall': if (s.mode === 'ground') go('stop1'); break;
      case 'stop1': i.brake = 1; if (Math.abs(s.vx) < 0.2 && t - a.mark > 1.0) go('run3'); break;
      case 'run3': if (s.vx > -16) i.throttle = 1; if (s.x < ROW_X2 + 24) go('jump'); break;
      case 'jump': i.lift = true; if (t - a.mark > 1.0) go('flip'); break;
      case 'flip': i.roll = 1; if (Math.abs(s.rollAccum) > 4.6) go('coast'); break;
      case 'coast': if (s.mode === 'ground') go('stop3'); break;
      case 'stop3': i.brake = 1; if (Math.abs(s.vx) < 0.2 && t - a.mark > 1.2) go('climb'); break;
      case 'climb': if (s.vx > -20) i.throttle = 1; if (s.x < COURSE.refill[1] + 5) go('refillStop'); break;
      case 'refillStop': i.brake = 1; if (Math.abs(s.vx) < 0.2) go('refillWait'); break;
      case 'refillWait': i.brake = 1; if (s.tank.m >= s.fillMass - 0.3 && t - a.mark > 1.0) go('runCanyon'); break;
      case 'runCanyon': if (s.vx > -22) i.throttle = 1; if (s.x < COURSE.canyonEdge + 1.5) go('canyonLift'); break;
      case 'canyonLift': i.lift = true; if (t - a.mark > 1.0) go('glide'); break;
      case 'glide': if (s.mode === 'ground' && s.x < COURSE.canyonFar) go('stop4'); break;
      case 'stop4': i.brake = 1; if (Math.abs(s.vx) < 0.2 && t - a.mark > 1.2) go('runTower'); break;
      case 'runTower': if (s.vx > -4.5) i.throttle = 0.35; if (s.x < COURSE.towerSign - 1.5) go('towerLift'); break;
      case 'towerLift': i.lift = true; if (t - a.mark > 1.5) go('hover'); break;
      case 'hover': if (s.mode === 'ground') go('stop5'); break;
      default: i.brake = 1;
    }
    return i;
  }

  root.RSPhys = {
    autopilot, AUTO_START,
    G, R, GAM, CV, CP, P_AMB, EPS, ME_D, PR_D, CF_D, P_DESIGN,
    TANK, CAR, COURSE, VEHICLES, ROW_X1, ROW_X2, NOZZLES, TERRAIN,
    tankP, muJT, nozzleUnit, satVapor, dewPointC, surfaceAt, terrainH, bodyAxes, toWorld, rampPos,
    createSim, step, mass, placeGround, inertia, wrapPi, clamp,
  };
})(typeof window !== 'undefined' ? window : globalThis);
