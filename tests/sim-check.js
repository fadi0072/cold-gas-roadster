// Headless sanity check of js/physics.js: node tests/sim-check.js
// Exits non-zero if the scripted autopilot can't complete all six stages.
const path = require('path');
require(path.join(__dirname, '..', 'js', 'physics.js'));
const P = globalThis.RSPhys;
const DT = 1 / 240;
const log = (...a) => console.log(...a);

log('Nozzle design: eps=%s Me=%s CF=%s · fill %s bar', P.EPS.toFixed(2), P.ME_D.toFixed(2), P.CF_D.toFixed(3), (P.tankP(250, 297.15) / 1e5).toFixed(0));

// --- 0-60 variants
function zeroSixty(opts) {
  const s = P.createSim({});
  if (opts.noFan) s.fanMode = 'off';
  s.fan = opts.noFan ? 0 : 1;
  let t = 0, t0 = null;
  while (t < 5) {
    P.step(s, { throttle: 1, boost: !!opts.boost }, DT); t += DT;
    if (t0 === null && Math.abs(s.vx) > 0.05) t0 = t - DT;
    if (s.vx >= 26.8224) return { t: t - t0, used: 250 - s.tank.m, x: s.x - P.COURSE.startX };
  }
  return { t: NaN };
}
for (const o of [{ boost: true }, { boost: false }, { boost: true, noFan: true }, { boost: false, noFan: true }]) {
  const r = zeroSixty(o);
  log('0-60 %j -> %s s, air used %s kg, dist %s m', o, r.t.toFixed(3), (r.used || 0).toFixed(1), (r.x || 0).toFixed(1));
}

// --- full scripted run (assist on), all six stages
const s = P.createSim({}); s.fan = 1;
const a = { phase: 'launch', mark: 0 };
let t = 0; const ev = [];
let maxY = 0, overRowMin = Infinity, canyonMinClr = Infinity, tankAtRefill = null, tankMinBeforeRefill = Infinity, refillPeakT = 0, refilled = false;
while (t < 150 && s.mode !== 'crashed') {
  const inp = P.autopilot(s, a);
  P.step(s, inp, DT); t += DT;
  for (const e of s.events) ev.push(e);
  s.events.length = 0;
  if (s.mode === 'air') maxY = Math.max(maxY, s.y);
  if (s.x > P.ROW_X1 && s.x < P.ROW_X2 && s.mode === 'air') overRowMin = Math.min(overRowMin, s.minY);
  if (s.mode === 'air' && s.x < P.COURSE.canyonFar + 6 && s.x > P.COURSE.canyonFar - 2) canyonMinClr = Math.min(canyonMinClr, s.minClr);
  if (a.phase === 'refillStop' && tankAtRefill === null) tankAtRefill = { m: s.tank.m, P: s.Pt / 1e5, T: s.tank.T - 273.15 };
  if (!refilled) tankMinBeforeRefill = Math.min(tankMinBeforeRefill, s.tank.m);
  if (s.refilling) { refilled = true; refillPeakT = Math.max(refillPeakT, s.tank.T - 273.15); }
  if (a.phase === 'stop5' && Math.abs(s.vx) < 0.1 && s.mode === 'ground') break;
}
ev.forEach((e) => log('  t=%s %s %j', e.t.toFixed(2), e.type, Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'type' && k !== 't').map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v]))));
log('end: mode=%s x=%s y=%s phase=%s t=%s s maxG=%s', s.mode, s.x.toFixed(1), s.y.toFixed(1), a.phase, t.toFixed(0), s.maxG.toFixed(2));
log('before refill: tank down to %s kg; at the pad %j; refill warmed gas to %s C', tankMinBeforeRefill.toFixed(1), tankAtRefill, refillPeakT.toFixed(0));
log('tank now: m=%s kg P=%s bar T=%s C wall=%s C reg=%s used=%s kg impulse=%s kN·s',
  s.tank.m.toFixed(1), (P.tankP(s.tank.m, s.tank.T) / 1e5).toFixed(0), (s.tank.T - 273.15).toFixed(0), (s.tank.Tw - 273.15).toFixed(0), s.reg.mode, s.used.toFixed(1), (s.impulse / 1000).toFixed(0));
log('lowest corner over row: %s m (Semi %s m) · canyon far-wall clearance %s m · apex %s m', overRowMin.toFixed(2), P.VEHICLES[4].h, canyonMinClr.toFixed(2), maxY.toFixed(1));
const onTower = s.x <= P.COURSE.tower[1] && s.x >= P.COURSE.tower[0] && Math.abs(s.y - P.COURSE.towerTop - P.CAR.cmH) < 0.1;
if (s.mode === 'crashed' || !onTower) { log('FAIL: did not finish on the summit pad' + (s.crash ? ' (' + s.crash.reason + ')' : '')); process.exit(1); }
log('PASS: all six stages, parked on the summit pad');
