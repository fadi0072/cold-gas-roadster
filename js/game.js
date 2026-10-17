/* Cold Gas Roadster — game flow, input, coach logic, guided prompts, autopilot, app shell (install, offline). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  if (!window.THREE) { RSUI.loadError(); return; }
  const P = window.RSPhys, C = P.COURSE, UI = window.RSUI, HUD = window.RSHud;
  const MPH = 2.23694, LIMIT = 15.65; // 35 mph in m/s
  const NAMES = ['Launch', 'Invert', 'Kickflip', 'Climb & refill', 'Canyon jump', 'Summit hover'];
  const LAST = 5;
  const touch = matchMedia('(pointer: coarse)').matches || location.hash.indexOf('touch') >= 0;
  if (touch) document.body.classList.add('touch');

  // ---------- settings ----------
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEF = { assist: true, guided: true, tempC: 24, RH: 55, reg: 80, fill: 250, units: 'mph', quality: 'auto', sound: true, shake: !reduced, paint: '#e9ebed' };
  const settings = Object.assign({}, DEF);
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  Object.assign(settings, load('cgr.settings2') || {});
  let best = load('cgr.best') || {};

  let world, audio, sim;
  const app = {
    screen: 'loading', run: 'full', stage: 0, paused: false, slow: false, countdown: 0, lastCount: null,
    stats: [], checkpoint: [], stable: 0, failShown: false, pitchArmed: false, lastHud: 0, auto: null,
    startTank: null, startP: 0, dropoutT: null, logs: [], cams: ['side', 'chase', 'stands'], cam: 0,
    hist: { P: [], T: [], t: 0 }, doneAt: null, prompt: null, prompted: {}, goT: 0, autoHeld: new Set(),
    q: 'high', frameAvg: 16, downgraded: false, rotateDismissed: false,
  };
  const keys = new Set();

  function effQuality() {
    if (settings.quality !== 'auto') return settings.quality === 'low' ? 'low' : 'high';
    return touch || innerWidth < 900 || (navigator.deviceMemory && navigator.deviceMemory <= 4) ? 'low' : 'high';
  }

  // ---------- boot ----------
  function boot(data) {
    if (data && data.settings) Object.assign(settings, data.settings);
    UI.loading(25, 'Building the McGregor test pad…');
    setTimeout(() => {
      try {
        app.q = effQuality();
        world = RSWorld.createWorld($('scene'), { quality: app.q });
      } catch (e) { UI.loadError(); return; }
      UI.loading(70, 'Pressurising the tanks…');
      audio = RSAudio.createAudio(); audio.setMuted(!settings.sound);
      world.car.setPaint(settings.paint);
      world.state.shakeOn = settings.shake;
      sim = newSim(); P.placeGround(sim, C.startX, 1, 0);
      UI.init({ settings, onSetting, onAction });
      HUD.buildStrip(); HUD.bindSparkHover();
      bindKeys(); bindTouch(); bindGameButtons(); setupInstall();
      UI.best(best, settings.units);
      app.firstVisit = !load('cgr.seen');
      $('firstTime').hidden = !app.firstVisit;
      requestAnimationFrame(frame);
      setTimeout(() => {
        UI.loading(100, 'Ready'); toHome();
        const h = location.hash;
        if (h.indexOf('autopilot') >= 0) startRun('full', 0, true);
        else if (h.indexOf('record') >= 0) { /* recorder drives the game */ }
        else if (/guide|settings|science/.test(h)) UI.selectTab(h.match(/guide|settings|science/)[0]);
        else if (app.firstVisit || h.indexOf('welcome') >= 0) UI.showWelcome((choice) => {
          save('cgr.seen', true); $('firstTime').hidden = true;
          if (choice === 'run') startRun('full', 0, false); else if (choice === 'auto') startRun('full', 0, true);
        });
      }, 250);
    }, 30);
  }

  function newSim() {
    const s = P.createSim({ ambientC: settings.tempC, RH: settings.RH / 100, regBar: settings.reg, fill: settings.fill, assist: settings.assist });
    s.fan = 1; return s;
  }
  const snapTank = () => ({ m: sim.tank.m, T: sim.tank.T, Tw: sim.tank.Tw });
  const fullTank = () => ({ m: settings.fill, T: sim.env.Tamb, Tw: sim.env.Tamb });

  function onSetting(key, val) {
    settings[key] = val; save('cgr.settings2', settings);
    if (key === 'assist' && sim) sim.assist = val;
    if (key === 'sound' && audio) { audio.setMuted(!val); muteIcon(); }
    if (key === 'shake' && world) world.state.shakeOn = val;
    if (key === 'paint' && world) world.car.setPaint(val);
    if (key === 'quality' && world) { app.q = effQuality(); world.setQuality(app.q); }
    if (['tempC', 'RH', 'reg', 'fill'].includes(key) && app.screen === 'home') { sim = newSim(); P.placeGround(sim, C.startX, 1, 0); }
    if (key === 'units') UI.best(best, val);
    UI.resetCoach();
  }
  function onAction(name, arg) {
    if (name === 'run') startRun('full', 0, false);
    else if (name === 'auto') startRun('full', 0, true);
    else if (name === 'practice') startRun('practice', arg, false);
    else if (name === 'reset') { Object.assign(settings, DEF); save('cgr.settings2', settings); onSetting('paint', DEF.paint); onSetting('quality', DEF.quality); audio.setMuted(!settings.sound); }
    else if (name === 'install') doInstall();
    else if (name === 'fullscreen') goFullscreen();
  }

  // ---------- run / stage flow ----------
  function startRun(mode, stage, auto) {
    audio.start(); audio.setMuted(!settings.sound);
    sim = newSim();
    app.auto = auto ? { phase: P.AUTO_START[stage], mark: 0 } : null;
    app.lowAir = 0; UI.lowAir(0, null);
    if (auto) sim.assist = true;
    app.run = mode; app.stats = []; app.checkpoint = []; app.logs = []; app.dropoutT = null; app.doneAt = null;
    app.hist = { P: [], T: [], t: 0 };
    app.startTank = snapTank(); app.startP = P.tankP(sim.tank.m, sim.tank.T);
    app.checkpoint[stage] = snapTank();
    placeAtStage(stage);
    UI.hideOverlays(); $('lab').hidden = true;
    UI.screen('game'); $('touch').hidden = !touch;
    world.state.showroom = false; world.state.cut = true;
    app.screen = 'play'; app.paused = false;
    document.querySelectorAll('#stepper li').forEach((el) => el.classList.remove('done', 'on'));
    beginStage(stage);
    rotateHint();
    log('Tank loaded: ' + sim.tank.m.toFixed(0) + ' kg at ' + bar(app.startP) + ' bar, ' + degC(sim.tank.T) + ' °C');
  }

  function placeAtStage(i) {
    const spots = [[C.startX, 1], [C.cp2, 1], [C.cp3, -1], [C.cp4, -1], [C.cp5, -1], [C.cp6, -1]];
    P.placeGround(sim, spots[i][0], spots[i][1], 0);
    world.state.cut = true;
  }

  function beginStage(i) {
    app.stage = i; app.stable = 0; app.failShown = false; app.prompted = {}; app.prompt = null; UI.prompt(null);
    app.stats[i] = { startUsed: sim.used, motionT: null, t060: null, topMph: 0, entryMph: null, entryG: null, maxG: 0, exitMph: null, exited: false, landVy: null, turns: 0, clear: null, done: false, refillFrom: null, refillT: null, refillPeakT: -999, edgeV: null, minP: 1e9 };
    app.idleT = 0;
    document.querySelectorAll('#stepper li').forEach((el) => el.classList.toggle('on', +el.dataset.s === i));
    UI.resetCoach();
    UI.banner(i);
    if (i === 0) { app.countdown = 3.2; app.lastCount = null; app.goT = 0; }
    else app.countdown = 0;
  }

  function retryStage(full) {
    const i = app.stage;
    const snap = full ? fullTank() : (app.checkpoint[i] || fullTank());
    if (full) app.checkpoint[i] = snap;
    Object.assign(sim.tank, snap);
    sim.valve.fill(0); sim.cmd.fill(0); sim.mdot = 0; sim.events.length = 0; sim.fan = 1; sim.seal = 1; sim.maxG = 1;
    sim.assist = app.auto ? true : settings.assist;
    if (app.auto) { app.auto.phase = P.AUTO_START[i]; app.auto.mark = 0; }
    app.lowAir = 0; UI.lowAir(0, null);
    placeAtStage(i);
    UI.hideOverlays();
    app.screen = 'play'; app.paused = false;
    beginStage(i);
    log('Retry stage ' + (i + 1) + (full ? ' with a full tank' : '') + ': ' + sim.tank.m.toFixed(0) + ' kg');
  }

  function completeStage(i) {
    const st = app.stats[i];
    if (st.done) return;
    st.done = true; st.air = sim.used - st.startUsed;
    document.querySelector('#stepper li[data-s="' + i + '"]').classList.add('done');
    if (!app.auto) {
      if (i === 0 && st.t060 && (!best.t060 || st.t060 < best.t060)) best.t060 = st.t060;
      if (i === 1 && st.landVy != null && (!best.land || Math.abs(st.landVy) < best.land)) best.land = Math.abs(st.landVy);
      if (i === 2 && st.turns >= 0.9) best.flips = (best.flips || 0) + 1;
      save('cgr.best', best);
    }
    log('Stage ' + (i + 1) + ' done, ' + st.air.toFixed(1) + ' kg of air');
    vibrate(20);
    if (app.run === 'practice' || i === LAST) { app.screen = 'done'; app.doneAt = performance.now(); UI.prompt(null); return; }
    app.checkpoint[i + 1] = snapTank();
    beginStage(i + 1);
  }

  function rowHeightUnder(x) { let h = 0; for (const v of P.VEHICLES) if (x + 2.2 > v.x1 && x - 2.2 < v.x2) h = Math.max(h, v.h); return h; }
  const speedOf = (s) => (s.mode === 'ramp' ? Math.abs(s.v) : Math.hypot(s.vx, s.vy));
  const limitText = () => (settings.units === 'kmh' ? '56 km/h' : '35 mph');

  function stageLogic(h) {
    const st = app.stats[app.stage]; if (!st || app.screen !== 'play') return;
    if (sim.mode === 'crashed') { if (!app.failShown && sim.t - sim.crash.t > 1.3) showFail(); return; }
    st.topMph = Math.max(st.topMph, speedOf(sim) * MPH);
    if (app.stage === 0) {
      if (st.motionT === null && Math.abs(sim.vx) > 0.05) st.motionT = sim.t - h;
      if (st.t060 === null && st.motionT !== null && sim.vx >= 26.8224) {
        st.t060 = sim.t - st.motionT;
        UI.toast('0–60 mph · ' + st.t060.toFixed(2) + ' s', st.t060 <= 0.85 ? 'Demo pace. Tesla showed 0.81 s live.' : 'Tesla did 0.81 s. Hold both buttons from a standstill.', 2600);
      }
      if (sim.x >= C.launchGate) completeStage(0);
    } else if (app.stage === 1) {
      if (sim.mode === 'ramp') st.maxG = Math.max(st.maxG, sim.gLoad);
      if (st.landVy !== null && sim.mode === 'ground') { app.stable += h; if (app.stable > 0.6) completeStage(1); }
    } else if (app.stage === 2) {
      if (sim.mode === 'air' && sim.x < P.ROW_X2 + 2.3 && sim.x > P.ROW_X1 - 2.3 && sim.minY != null) {
        const c = sim.minY - rowHeightUnder(sim.x); st.clear = st.clear == null ? c : Math.min(st.clear, c);
      }
      if (sim.mode === 'ground' && sim.x < P.ROW_X1 - 2.5 && Math.abs(sim.vx) < 0.4) { app.stable += h; if (app.stable > 0.5) completeStage(2); } else app.stable = 0;
    } else if (app.stage === 3) {
      if (sim.refilling) {
        if (st.refillFrom === null) { st.refillFrom = sim.tank.m; st.refillT = sim.t; UI.toast('Hose connected', 'Pressure and temperature both climb while it fills', 2200); }
        st.refillPeakT = Math.max(st.refillPeakT, sim.tank.T);
      }
      if (st.refillFrom !== null && sim.tank.m >= sim.fillMass - 0.3 && sim.mode === 'ground') { st.refillT = sim.t - st.refillT; completeStage(3); }
    } else if (app.stage === 4) {
      st.minP = Math.min(st.minP, sim.Pt || 1e9);
      if (st.landVy !== null && sim.mode === 'ground') { app.stable += h; if (app.stable > 0.6) completeStage(4); }
    } else {
      st.minP = Math.min(st.minP, sim.Pt || 1e9);
      const onPad = sim.x <= C.tower[1] && sim.x >= C.tower[0] && sim.gy >= C.towerTop - 0.1;
      if (sim.mode === 'ground' && onPad && Math.abs(sim.vx) < 0.4) { app.stable += h; if (app.stable > 0.5) completeStage(5); } else app.stable = 0;
    }
  }

  // which guide step is the player on?
  function coachStep() {
    const s = sim, st = app.stats[app.stage] || {};
    if (app.stage === 0) return app.countdown > 0 ? 0 : st.t060 == null ? 1 : 2;
    if (app.stage === 1) {
      if (st.exited) { if (s.mode === 'air') return Math.cos(s.th) * Math.cos(s.ph) < 0.6 ? 2 : 3; return 3; }
      if (s.mode === 'ramp') return 1;
      return speedOf(s) > LIMIT ? 0 : 1;
    }
    if (app.stage === 2) {
      if (s.mode === 'air') return 2;
      if (s.x > P.ROW_X2) return s.x < P.ROW_X2 + 30 ? 1 : 0;
      return 3;
    }
    if (app.stage === 3) {
      if (st.refillFrom !== null || s.refilling) return 2;
      return s.x > C.refill[1] + 30 ? 0 : 1;
    }
    if (app.stage === 4) {
      if (st.exited) return s.mode === 'air' ? 2 : 3;
      return s.x > C.canyonEdge + 12 ? 0 : 1;
    }
    if (s.mode === 'air') return 2;
    if (s.gy >= C.towerTop - 0.1) return 3;
    return s.x > C.towerSign + 10 ? 0 : 1;
  }

  // Guided mode: slow motion until the right input arrives
  const PROMPTS = {
    launch: { keys: ['throttle', 'boost'], title: 'Launch now', text: 'Hold both together to fire the motors and the rear jets.', ok: (i) => i.throttle },
    brake: { keys: ['brake'], title: 'Brake for the loop', text: 'Hold it until you are under the speed limit shown on the sign.', ok: (i) => i.brake },
    roll: { keys: ['roll'], title: 'You are upside down', text: 'Hold roll to turn the car the right way up.', ok: (i) => i.roll },
    land: { keys: ['lift'], title: 'Falling fast', text: 'Tap lift to slow down before you touch the ground.', ok: (i) => i.lift },
    lift: { keys: ['lift'], title: 'Lift off here', text: 'Hold lift for about one second to rise over the cars.', ok: (i) => i.lift },
    flip: { keys: ['roll'], title: 'Spin now', text: 'Hold roll to spin a full circle while you are high.', ok: (i) => i.roll },
    refill: { keys: ['brake'], title: 'Stop in the yellow box', text: 'Hold brake now so you stop inside the refill box.', ok: (i) => i.brake },
    edge: { keys: ['lift'], title: 'The edge is here', text: 'Hold lift for one second as you cross the red line.', ok: (i) => i.lift },
    tower: { keys: ['lift'], title: 'Lift off for the summit', text: 'Hold lift for about a second and a half to rise above the pad.', ok: (i) => i.lift },
  };
  function guided(inp) {
    if (!settings.guided || app.auto || app.screen !== 'play' || sim.mode === 'crashed') { if (app.prompt) endPrompt(); return; }
    if (app.prompt) { if (PROMPTS[app.prompt].ok(inp)) { endPrompt(); UI.toast('Nice', '', 700); } return; }
    const s = sim, st = app.stats[app.stage] || {}, sp = speedOf(s), uy = Math.cos(s.th) * Math.cos(s.ph);
    let want = null;
    if (app.stage === 0 && app.countdown <= 0 && st.motionT === null && app.goT > 1.2) want = 'launch';
    else if (app.stage === 1 && s.mode === 'ground' && !st.exited && s.x > 210 && s.x < C.X0 - 4 && sp > LIMIT + 1.5) want = 'brake';
    else if (app.stage === 1 && s.mode === 'air' && st.exited && uy < 0 && s.airTime > 0.15) want = 'roll';
    else if (app.stage === 1 && s.mode === 'air' && !s.assist && uy > 0.8 && s.vy < -4.5 && s.y < 8) want = 'land';
    else if (app.stage === 2 && s.mode === 'ground' && s.x < P.ROW_X2 + 27 && s.x > P.ROW_X2 + 8 && s.vx < -3) want = 'lift';
    else if (app.stage === 2 && s.mode === 'air' && s.airTime > 0.45 && Math.abs(s.rollAccum) < 0.4 && s.x > P.ROW_X1) want = 'flip';
    else if (app.stage === 3 && s.mode === 'ground' && s.x < C.refill[1] + 16 && s.x > C.refill[0] && s.vx < -4) want = 'refill';
    else if (app.stage === 4 && s.mode === 'ground' && s.x < C.canyonEdge + 9 && s.x > C.canyonEdge && s.vx < -8) want = 'edge';
    else if (app.stage === 5 && s.mode === 'ground' && s.x < C.towerSign + 4 && s.x > C.towerSign - 3 && s.vx < -1) want = 'tower';
    if (want && !app.prompted[want] && !PROMPTS[want].ok(inp)) { app.prompt = want; app.prompted[want] = true; UI.prompt(PROMPTS[want]); vibrate(12); }
  }
  function endPrompt() { app.prompt = null; UI.prompt(null); }

  function processEvents() {
    const st = app.stats[app.stage];
    for (const e of sim.events) {
      if (e.type === 'rampEnter') { if (st) { st.entryMph = e.v * MPH; st.entryG = e.g; } log('Into the loop at ' + spdTxt(e.v) + ' (' + e.g.toFixed(1) + ' g at the bottom)'); }
      else if (e.type === 'rampExit' || e.type === 'detach') {
        if (st) { st.exitMph = e.v != null ? e.v * MPH : null; st.exited = true; }
        if (e.type === 'detach') UI.toast('Lost the ramp', 'Not enough speed or suction to stay on', 1800);
        log(e.type === 'rampExit' ? 'Left the top upside down at ' + spdTxt(e.v) : 'Fell off the ramp');
      } else if (e.type === 'edge') {
        if (st) { st.exited = true; st.edgeV = e.v; }
        UI.toast('Off the edge at ' + spdTxt(e.v), e.v < 18 ? 'That may be too slow. Hold lift now.' : 'Hold lift for one second', 1800);
        log('Left the mesa edge at ' + spdTxt(e.v));
      } else if (e.type === 'land') {
        audio.thud(Math.abs(e.vy) / 2.5); vibrate(Math.min(60, 10 + Math.abs(e.vy) * 8));
        world.state.shake = Math.min(1, Math.abs(e.vy) / 5);
        world.shock(e.x, sim.gy, Math.min(1.5, Math.abs(e.vy) / 2.5));
        world.burst(e.x, sim.gy + 0.3, Math.round(10 + Math.abs(e.vy) * 8), [0.93, 0.96, 1.0]);
        const v = Math.abs(e.vy).toFixed(1);
        if (st && app.stage === 4 && e.x < C.canyonFar) { st.landVy = e.vy; UI.toast('Made it across · ' + v + ' m/s', 'Now brake to a stop on LZ-3', 2200); }
        if (st && app.stage === 5 && sim.gy >= C.towerTop - 0.1) { st.landVy = e.vy; UI.toast('On the summit · ' + v + ' m/s', 'Brake to a stop in the middle of the pad', 2200); }
        if (st && app.stage === 1 && st.exited) { st.landVy = e.vy; UI.toast('Touchdown · ' + v + ' m/s', Math.abs(e.vy) < 1.5 ? 'Feather soft, right in the ice fog' : 'Under 1.5 m/s counts as feather soft', 2200); }
        if (st && app.stage === 2 && e.x < P.ROW_X1) {
          st.landVy = e.vy; st.turns = Math.abs(e.turns);
          UI.toast(st.turns >= 0.9 ? 'Kickflip × ' + Math.round(st.turns) : 'Over the cars', 'Touchdown ' + v + ' m/s. Now brake to a stop.', 2200);
        }
        log('Touchdown at ' + v + ' m/s after ' + Math.round(Math.abs(e.turns) * 360) + '° of roll');
      } else if (e.type === 'takeoff') { if (st && app.stage >= 4) { st.exited = true; if (st.edgeV == null) st.edgeV = Math.abs(sim.vx); } log('Lift-off at ' + e.x.toFixed(0) + ' m'); }
      else if (e.type === 'regDropout') {
        app.dropoutT = sim.t;
        UI.toast('Tank pressure low', 'Below ' + settings.reg + ' bar, the thrusters get weaker', 2200);
        log('Regulator dropout: tank ' + bar(e.P) + ' bar is under the ' + settings.reg + ' bar set point');
      } else if (e.type === 'crash') {
        audio.thud(3); world.state.shake = 1.2; vibrate([60, 40, 90]);
        world.burst(sim.x, sim.y, 70, [0.55, 0.47, 0.36]);
        endPrompt(); log('Crash: ' + e.reason);
      }
    }
    sim.events.length = 0;
  }

  function showFail() { app.failShown = true; UI.showFail(app.stage, sim.crash.reason, sim.tank.m); }

  function showResults() {
    const rows = [], badges = [];
    let total = 0;
    for (let i = 0; i <= LAST; i++) {
      const st = app.stats[i];
      if (!st || !st.done) { badges.push({ name: NAMES[i], medal: 'Not played', tier: 'none', short: '—' }); continue; }
      total += st.air;
      let txt = '', b;
      if (i === 0) {
        txt = (st.t060 != null ? '0–60 mph in ' + st.t060.toFixed(2) + ' s (Tesla: 0.81 s)' : 'Did not reach 60 mph') + ', top ' + spdTxt(st.topMph / MPH);
        b = st.t060 == null ? { tier: 'bronze', medal: 'Steady' } : st.t060 <= 0.85 ? { tier: 'gold', medal: 'Demo pace' } : st.t060 <= 1.0 ? { tier: 'silver', medal: 'Quick' } : { tier: 'bronze', medal: 'Steady' };
        b.short = st.t060 ? st.t060.toFixed(2) : '—';
      } else if (i === 1) {
        const v = Math.abs(st.landVy || 0);
        txt = 'Loop entry ' + spdTxt((st.entryMph || 0) / MPH) + ' (' + (st.maxG || st.entryG || 0).toFixed(1) + ' g), touchdown ' + v.toFixed(1) + ' m/s';
        b = v <= 1.5 ? { tier: 'gold', medal: 'Feather landing' } : v <= 3 ? { tier: 'silver', medal: 'Firm landing' } : { tier: 'bronze', medal: 'Hard landing' };
        b.short = v.toFixed(1);
      } else if (i === 2) {
        const v = Math.abs(st.landVy || 0);
        txt = (Math.round(st.turns * 10) / 10) + ' spins, ' + (st.clear != null ? st.clear.toFixed(1) + ' m above the roofs' : 'cleared the row') + ', touchdown ' + v.toFixed(1) + ' m/s';
        b = st.turns >= 0.9 ? (v <= 2 ? { tier: 'gold', medal: 'Clean kickflip' } : { tier: 'silver', medal: 'Kickflip' }) : { tier: 'bronze', medal: 'Jump, no flip' };
        b.short = (Math.round(st.turns * 10) / 10) + '×';
      } else if (i === 3) {
        const added = sim.fillMass - (st.refillFrom || sim.fillMass);
        txt = 'Arrived with ' + (st.refillFrom || 0).toFixed(0) + ' kg, took on ' + added.toFixed(0) + ' kg in ' + (st.refillT || 0).toFixed(0) + ' s; gas peaked at ' + degC(st.refillPeakT) + ' °C';
        b = (st.refillT || 99) < 20 ? { tier: 'gold', medal: 'First try' } : { tier: 'silver', medal: 'Refilled' }; b.short = '+' + added.toFixed(0);
      } else if (i === 4) {
        const v = Math.abs(st.landVy || 0);
        txt = 'Edge at ' + spdTxt(st.edgeV || 0) + ', touchdown ' + v.toFixed(1) + ' m/s, pressure fell to ' + bar(st.minP) + ' bar in the air';
        b = v <= 1.5 ? { tier: 'gold', medal: 'Clean crossing' } : v <= 3 ? { tier: 'silver', medal: 'Crossed' } : { tier: 'bronze', medal: 'Rough landing' }; b.short = v.toFixed(1);
      } else {
        const v = Math.abs(st.landVy || 0);
        txt = 'Touchdown ' + v.toFixed(1) + ' m/s on the summit, tank down to ' + bar(st.minP) + ' bar';
        b = v <= 1.5 ? { tier: 'gold', medal: 'Summit, feather soft' } : v <= 3 ? { tier: 'silver', medal: 'Summit' } : { tier: 'bronze', medal: 'Summit, hard' }; b.short = v.toFixed(1);
      }
      b.name = NAMES[i]; badges.push(b);
      rows.push([(i + 1) + ' · ' + NAMES[i], txt, st.air.toFixed(1) + ' kg']);
    }
    const Pn = P.tankP(sim.tank.m, sim.tank.T);
    const full = app.run === 'full';
    let nextLabel = '';
    if (app.auto) nextLabel = 'Now you try';
    else if (full && settings.assist) nextLabel = 'Try it without flight assist';
    else if (!full) nextLabel = app.stage < LAST ? 'Practice stage ' + (app.stage + 2) : 'Run the full demo';
    UI.showResults({
      eyebrow: app.auto ? 'Autopilot run' : full ? 'Full demo complete' : 'Practice complete',
      title: full ? 'All six stages landed' : NAMES[app.stage] + ' complete',
      badges, rows, nextLabel,
      gas: 'You used ' + total.toFixed(0) + ' kg of air' + (full ? ' across two fills' : ' (' + Math.round(total / app.startTank.m * 100) + '% of the load)') + '. The tank is at ' + bar(Pn) + ' bar and ' + degC(sim.tank.T) + ' °C now: gas cools as it leaves and warms as it is pushed back in, so pressure moves faster than mass.' +
        (app.dropoutT != null ? ' The regulator ran out of headroom near the end, so thrust faded.' : '') +
        ' Refilling with the onboard compressor would take about ' + Math.max(1, Math.round(total / Math.max(0.01, compRate()) / 60)) + ' minutes.',
    });
  }
  function nextChallenge() {
    if (app.auto) { startRun(app.run, app.run === 'full' ? 0 : app.stage, false); return; }
    if (app.run === 'full') { onSetting('assist', false); UI.syncSettings(); startRun('full', 0, false); return; }
    if (app.stage < LAST) startRun('practice', app.stage + 1, false); else startRun('full', 0, false);
  }
  function compRate() { const Pt = Math.max(2 * P.P_AMB, P.tankP(sim.tank.m, sim.tank.T)); return P.TANK.compW * P.TANK.compEff / (P.R * sim.env.Tamb * Math.log(Pt / P.P_AMB)); }

  // ---------- autopilot (same script as tests/sim-check.js) ----------
  function autopilot() {
    const i = P.autopilot(sim, app.auto);
    const held = app.autoHeld; held.clear();
    if (i.throttle) held.add('KeyW'); if (i.brake) held.add('KeyS'); if (i.boost) held.add('ShiftLeft'); if (i.lift) held.add('Space'); if (i.roll > 0) held.add('KeyD');
    return i;
  }

  // ---------- input ----------
  const HELD = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);
  function bindKeys() {
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.code !== 'Escape') return;
      if (HELD.has(e.code)) { if (app.screen === 'play') e.preventDefault(); keys.add(e.code); }
      if (e.repeat) return;
      action(e.code);
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); if (app.screen === 'play' && !app.failShown && !app.auto) setPause(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && app.screen === 'play' && !app.failShown) setPause(true); });
  }
  function action(code) {
    if (app.screen === 'home' || app.screen === 'loading') return;
    if (code === 'KeyG') toggleLab();
    else if (code === 'KeyC') cycleCam();
    else if (code === 'KeyM') { onSetting('sound', !settings.sound); UI.syncSettings(); }
    else if (code === 'KeyX') { app.slow = !app.slow; UI.toast(app.slow ? 'Slow motion · ¼ speed' : 'Real time', '', 900); }
    else if (code === 'KeyH') { onSetting('assist', !settings.assist); UI.syncSettings(); UI.toast(settings.assist ? 'Flight assist on' : 'Manual flight', settings.assist ? 'Keeps the nose level, finishes rolls, softens landings' : 'You fire every jet yourself', 1500); }
    else if (code === 'KeyF') { sim.fanMode = sim.fanMode === 'auto' ? 'off' : 'auto'; UI.toast(sim.fanMode === 'auto' ? 'Fan suction on' : 'Fan suction off', sim.fanMode === 'auto' ? 'About 2.5 g of grip' : 'Tires alone: 1.26 g, and no hanging upside down', 1600); }
    else if (code === 'KeyR') { if (app.screen === 'play' || app.screen === 'done') retryStage(false); }
    else if (code === 'Escape' || code === 'KeyP') {
      if (!$('sheet').hidden) { $('sheet').hidden = true; return; }
      if (!$('lab').hidden && code === 'Escape') { toggleLab(); return; }
      if (app.screen === 'play' && !app.failShown) setPause(!app.paused);
    }
  }
  function getInput() {
    if (app.screen === 'done') return sim.mode === 'ground' ? { brake: 1 } : {};
    if (app.screen !== 'play' || app.countdown > 0 || app.paused || app.failShown) return {};
    if (app.auto) return autopilot();
    const k = (c) => keys.has(c);
    const W = k('KeyW') || k('ArrowUp'), S = k('KeyS') || k('ArrowDown'), A = k('KeyA') || k('ArrowLeft'), D = k('KeyD') || k('ArrowRight');
    const inp = { boost: k('ShiftLeft') || k('ShiftRight'), lift: k('Space') };
    if (sim.mode === 'air') {
      if (!W && !S) app.pitchArmed = true;
      inp.pitch = app.pitchArmed ? (W ? 1 : 0) - (S ? 1 : 0) : 0;
      inp.roll = (D ? 1 : 0) - (A ? 1 : 0);
    } else { app.pitchArmed = false; inp.throttle = W ? 1 : 0; inp.brake = S ? 1 : 0; }
    return inp;
  }
  function bindTouch() {
    document.querySelectorAll('#touch .t-btn').forEach((b) => {
      const code = b.dataset.k;
      const down = (e) => { e.preventDefault(); audio.start(); keys.add(code); b.classList.add('act'); vibrate(6); };
      const up = (e) => { e.preventDefault(); keys.delete(code); b.classList.remove('act'); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
  function bindGameButtons() {
    $('bPause').addEventListener('click', () => { if (app.screen === 'play' && !app.failShown) setPause(!app.paused); });
    $('bLab').addEventListener('click', toggleLab); $('bLabClose').addEventListener('click', toggleLab);
    $('bCam').addEventListener('click', cycleCam);
    $('bMute').addEventListener('click', () => { onSetting('sound', !settings.sound); UI.syncSettings(); });
    $('bResume').addEventListener('click', () => setPause(false));
    $('bRetry').addEventListener('click', () => retryStage(false));
    $('bRetry2').addEventListener('click', () => retryStage(false));
    $('bRetryFull').addEventListener('click', () => retryStage(true));
    $('bWatch').addEventListener('click', () => startRun('practice', app.stage, true));
    $('bPauseGuide').addEventListener('click', () => UI.showSheetGuide(app.stage));
    $('bSheetClose').addEventListener('click', () => { $('sheet').hidden = true; });
    $('bSheetBack').addEventListener('click', () => { $('sheet').hidden = true; setPause(false); });
    $('bAgain').addEventListener('click', () => startRun(app.run, app.run === 'full' ? 0 : app.stage, false));
    $('bNext').addEventListener('click', nextChallenge);
    ['bMenu1', 'bMenu2', 'bMenu3'].forEach((id) => $(id).addEventListener('click', toHome));
    $('bRotateClose').addEventListener('click', () => { app.rotateDismissed = true; $('rotate').hidden = true; });
    addEventListener('resize', rotateHint);
  }
  function toHome() {
    UI.hideOverlays(); $('lab').hidden = true; $('touch').hidden = true; $('rotate').hidden = true; $('banner').hidden = true; UI.prompt(null); UI.lowAir(0, null);
    app.screen = 'home'; app.paused = false; app.auto = null;
    sim = newSim(); P.placeGround(sim, C.startX, 1, 0);
    world.state.showroom = true;
    UI.screen('home'); UI.best(best, settings.units);
    frameShowroom();
  }
  function frameShowroom() {
    const portrait = innerWidth < 760;
    world.state.frame = portrait ? { x: 0.5, y: 0.2 } : innerHeight < 520 ? { x: 0.74, y: 0.42 } : { x: 0.68, y: 0.46 };
  }
  addEventListener('resize', () => { if (world && app.screen === 'home') frameShowroom(); });
  function setPause(p) {
    app.paused = p;
    if (p) UI.showPause(sim.tank.m); else { $('pause').hidden = true; $('sheet').hidden = true; }
  }
  function toggleLab() { $('lab').hidden = !$('lab').hidden; $('bLab').classList.toggle('on', !$('lab').hidden); }
  function cycleCam() {
    app.cam = (app.cam + 1) % app.cams.length; world.state.camMode = app.cams[app.cam];
    UI.toast(['Side camera', 'Chase camera', 'Grandstand camera'][app.cam], '', 900);
  }
  function muteIcon() { const u = $('muteIcon'); if (u) u.setAttribute('href', settings.sound ? '#i-sound' : '#i-mute'); }
  function rotateHint() { $('rotate').hidden = !(touch && app.screen === 'play' && innerHeight > innerWidth && !app.rotateDismissed); }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* unsupported */ } }

  // ---------- install + offline ----------
  let deferred = null;
  function setupInstall() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    UI.setInstall(standalone ? 'installed' : ios ? 'ios' : 'unavailable');
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; UI.setInstall('ready'); });
    addEventListener('appinstalled', () => UI.setInstall('installed'));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* not available here */ });
  }
  function doInstall() { if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(() => { deferred = null; }); }
  function goFullscreen() {
    const el = document.documentElement;
    if (!el.requestFullscreen) { UI.say('Full screen is not available in this browser.'); return; }
    el.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => UI.say('Full screen was blocked by the browser.'));
  }

  // ---------- frame ----------
  let last = performance.now(), acc = 0;
  const H = 1 / 240;
  function frame(now) {
    requestAnimationFrame(frame);
    if (app.manual) return;
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(rdt, now);
  }
  function tick(rdt, now) {
    const RH = settings.RH / 100;
    if (app.screen === 'home' || app.screen === 'loading') { world.render(sim, rdt, RH, false); return; }
    if (app.paused) { world.render(sim, 0, RH, false); return; }
    adaptQuality(rdt);
    const scale = app.prompt ? 0.12 : app.slow ? 0.25 : 1;
    const sdt = rdt * scale;
    if (app.countdown > 0) {
      app.countdown -= rdt;
      const n = Math.ceil(app.countdown - 0.2);
      if (n !== app.lastCount) { app.lastCount = n; UI.toast(n > 0 ? String(n) : 'GO', n > 0 ? 'Get ready to launch' : '', n > 0 ? 900 : 700); if (n <= 0) audio.thud(0.4); }
    } else app.goT += rdt;
    const inp = getInput();
    guided(inp);
    acc += sdt;
    let steps = 0;
    while (acc >= H && steps < 60) { P.step(sim, inp, H); acc -= H; steps++; processEvents(); stageLogic(H); }
    if (acc > H) acc = 0;
    history(sdt);
    audio.update(sim);
    world.render(sim, sdt, RH, true);
    watchPlayer(rdt);
    if (app.screen === 'done' && app.doneAt && now - app.doneAt > 1200 && $('results').hidden) showResults();
    if (now - app.lastHud > 50) {
      app.lastHud = now;
      HUD.update(sim, { units: settings.units });
      HUD.keys(app.auto ? app.autoHeld : keys);
      if (touch) touchLabels();
      if (app.screen === 'play' && sim.mode !== 'crashed') UI.coach(app.stage, coachStep(), { auto: !!app.auto });
      if (!$('lab').hidden) HUD.lab(sim, { startTank: app.startTank, hist: app.hist, reg: settings.reg });
    }
  }
  // Nudges: a hint when the player sits still, a warning when air runs low
  function watchPlayer(dt) {
    if (app.screen !== 'play' || app.auto || app.countdown > 0 || app.prompt || app.failShown || sim.mode === 'crashed') { app.idleT = 0; return; }
    const still = sim.mode === 'ground' && Math.abs(sim.vx) < 0.3 && !sim.refilling;
    app.idleT = still ? app.idleT + dt : 0;
    if (app.idleT > 8) {
      app.idleT = 0;
      UI.hint($('coachDo').textContent); vibrate(10);
    }
    const kg = sim.tank.m, lvl = kg < 40 ? 2 : kg < 100 ? 1 : 0;
    if (lvl !== app.lowAir) {
      app.lowAir = lvl;
      UI.lowAir(kg, lvl === 2 ? 'crit' : lvl === 1 ? 'warn' : null);
      if (lvl) { UI.say(lvl === 2 ? 'Air almost empty' : 'Air low'); vibrate([20, 30, 20]); }
    }
  }
  function touchLabels() {
    const air = sim.mode === 'air';
    if (touchLabels.air === air) return; touchLabels.air = air;
    $('tGo').textContent = air ? 'NOSE ▲' : 'GO'; $('tBrake').textContent = air ? 'NOSE ▼' : 'BRAKE';
  }
  function adaptQuality(dt) {
    app.frameAvg += (dt * 1000 - app.frameAvg) * 0.02;
    if (settings.quality === 'auto' && app.q === 'high' && !app.downgraded && app.frameAvg > 26 && sim.t > 4) {
      app.downgraded = true; app.q = 'low'; world.setQuality('low');
    }
  }
  function history(dt) {
    const h = app.hist; h.t += dt; if (h.t < 0.2) return; h.t = 0;
    h.P.push(sim.Pt / 1e5); h.T.push(sim.tank.T - 273.15);
    if (h.P.length > 450) { h.P.shift(); h.T.shift(); }
  }

  // ---------- helpers ----------
  function log(text) {
    app.logs.unshift({ t: sim ? sim.t : 0, text }); app.logs.length = Math.min(app.logs.length, 8);
    $('log').innerHTML = app.logs.map((l) => '<li><span>' + fmtT(l.t) + '</span>' + l.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</li>').join('');
  }
  const fmtT = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  const bar = (p) => (p / 1e5).toFixed(0);
  const degC = (T) => (T - 273.15).toFixed(0);
  const spdTxt = (v) => (settings.units === 'kmh' ? Math.round(v * 3.6) + ' km/h' : Math.round(v * MPH) + ' mph');

  // Hooks for tests and the demo recorder (tools/record-demo.js)
  window.RSDebug = {
    get sim() { return sim; }, get app() { return app; }, get world() { return world; }, settings,
    startRun, retryStage, toHome, showResults,
    setManual(on) { app.manual = on; },
    tick(dt) { tick(dt, performance.now()); },
    fastForward(sec) {
      let n = Math.round(sec / H);
      while (n-- > 0) {
        if (app.countdown > 0) { app.countdown -= H; app.lastCount = null; continue; }
        app.goT += H;
        const inp = getInput(); P.step(sim, inp, H); processEvents(); stageLogic(H); history(H);
        if (app.screen === 'done') break;
      }
    },
    ffUntil(src, maxSec) {
      const f = new Function('s', 'a', 'app', 'return (' + src + ')');
      let t = 0;
      while (t < (maxSec || 60) && !f(sim, app.auto, app)) { this.fastForward(0.05); t += 0.05; if (app.screen === 'done' || sim.mode === 'crashed') break; }
      world.state.cut = true;
      return t;
    },
    setCam(m) { app.cam = ['side', 'chase', 'stands'].indexOf(m); world.state.camMode = m; },
  };
  try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ settings })); } catch (e) { /* not in a viewer */ }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
