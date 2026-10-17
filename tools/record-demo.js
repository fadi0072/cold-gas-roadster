// Records the LinkedIn demo: drives the game headless frame by frame, screenshots each frame, encodes with ffmpeg.
// Usage: NODE_PATH=<dir with playwright-core> node tools/record-demo.js [outDir]
// Needs Google Chrome and ffmpeg (brew install ffmpeg). ~1700 frames at 1920x1080; allow 5–10 minutes.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FPS = 30;
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'media');
const FRAMES = path.join(OUT, 'frames');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#record';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Each shot: how to get there (ff = fast-forward predicate on sim s / autopilot a / app), camera, seconds, playback speed, caption.
const SHOTS = [
  { id: 'intro', seconds: 4.5, card: { kicker: 'A physics game of Tesla\'s Oct 15, 2026 Roadster demo', title: 'Cold Gas Roadster', sub: 'Six stages · one working model of the compressed-air thrusters' } },
  { id: 'launch', start: ['full', 0], countdown: 0.9, cam: 'chase', seconds: 6.0, cap: ['Stage 1 · Launch', '1 MW motors plus two rear cold-gas jets: 0–60 mph in 0.82 s. Tesla showed 0.81 s live.'] },
  { id: 'loop', ff: "s.mode === 'ramp' && s.alpha > 0.35", cam: 'side', seconds: 9.0, speed: 0.85, cap: ['Stage 2 · Invert', 'Fan suction holds the car on upside down. Side jets roll it upright; lift jets cushion the landing.'] },
  { id: 'kickflip', ff: "a.phase === 'run3' && s.x < 112", cam: 'stands', seconds: 7.0, speed: 0.8, cap: ['Stage 3 · Kickflip', '10 nozzles fed from 250 kg of air. Jets leave at −200 °C and freeze the moisture into ice fog.'] },
  { id: 'refill', ff: 's.refilling && s.tank.m > 80', cam: 'side', seconds: 7.0, speed: 1.4, cap: ['Stage 4 · Refill on the mesa', 'The tank arrives at 65 bar and −76 °C. Filling at 12 kg/s heats the gas past 100 °C as pressure climbs.'] },
  { id: 'canyon', ff: "a.phase === 'runCanyon' && s.x < -238", cam: 'chase', seconds: 8.0, speed: 0.9, cap: ['Stage 5 · Canyon jump', 'A 42 m gap. One second of lift burns about 40 kg of air: watch the pressure needle fall.'] },
  { id: 'summit', ff: "a.phase === 'runTower' && s.x < -398", cam: 'side', seconds: 9.0, cap: ['Stage 6 · Summit', 'Rise 10 m and land with what is left. Below 80 bar the regulator drops out and thrust fades.'] },
  { id: 'results', ff: "app.screen === 'done'", results: true, seconds: 5.0, cap: ['Every run is scored', 'Air used, landing speed, 0–60 time: the physics is the game.'] },
  { id: 'outro', seconds: 4.5, card: { kicker: 'Play it in a browser or install it on your phone', title: 'Cold Gas Roadster', sub: 'Physics, source and references in the post' } },
];

const OVERLAY_CSS = `
#demoCap{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);width:min(1100px,80vw);padding:18px 26px;border-radius:16px;background:rgba(9,12,18,.82);border:1px solid rgba(143,216,255,.35);backdrop-filter:blur(12px);color:#f2f4f7;font-family:Archivo,"Helvetica Neue",Arial,sans-serif;z-index:50;opacity:0;transition:opacity .35s,transform .35s;pointer-events:none}
#demoCap.on{opacity:1}
#demoCap b{display:block;font:600 13px/1 Archivo,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8fd8ff;margin-bottom:8px}
#demoCap span{font-size:22px;line-height:1.35}
#demoCard{position:fixed;inset:0;display:grid;place-items:center;text-align:center;z-index:60;pointer-events:none;background:radial-gradient(60% 70% at 50% 60%,rgba(7,9,14,.25),rgba(7,9,14,.88));opacity:0;transition:opacity .5s}
#demoCard.on{opacity:1}
#demoCard .k{font:600 15px/1.4 Archivo,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#8fd8ff}
#demoCard .t{font:700 92px/1 Syncopate,Archivo,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#f2f4f7;margin:18px 0;text-shadow:0 6px 40px rgba(0,0,0,.6)}
#demoCard .s{font:400 24px/1.4 Archivo,sans-serif;color:#c1c8d3}
#demoCard .ic{margin-top:34px;display:flex;gap:28px;justify-content:center;font:600 14px/1 Archivo,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8790a0;white-space:nowrap}
#demoCard>div{width:max-content;max-width:90vw}
.home-panel,#tip,#rotate{display:none!important}
`;

async function main() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.RSDebug && window.RSDebug.app.screen === 'home', null, { timeout: 60000 });
  await page.waitForTimeout(1500); // fonts
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="demoCap"><b></b><span></span></div><div id="demoCard"><div><div class="k"></div><div class="t"></div><div class="s"></div><div class="ic"><span>Web</span><span>·</span><span>Mobile</span><span>·</span><span>Real gas physics</span></div></div></div>');
    const D = window.RSDebug; D.setManual(true); D.settings.sound = false; D.settings.shake = true;
    D.world.state.frame = { x: 0.5, y: 0.45 };
  });
  const cdp = await page.context().newCDPSession(page);
  let n = 0;
  const grab = async () => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    fs.writeFileSync(path.join(FRAMES, 'f' + String(n++).padStart(5, '0') + '.jpg'), Buffer.from(data, 'base64'));
  };
  const setCap = (cap) => page.evaluate((c) => { const el = document.getElementById('demoCap'); if (!c) { el.classList.remove('on'); return; } el.querySelector('b').textContent = c[0]; el.querySelector('span').textContent = c[1]; el.classList.add('on'); }, cap);
  const setCard = (card) => page.evaluate((c) => { const el = document.getElementById('demoCard'); if (!c) { el.classList.remove('on'); return; } el.querySelector('.k').textContent = c.kicker; el.querySelector('.t').textContent = c.title; el.querySelector('.s').textContent = c.sub; el.classList.add('on'); }, card);

  for (const sh of SHOTS) {
    const t0 = Date.now();
    if (sh.start) await page.evaluate(([m, st, cd]) => { const D = window.RSDebug; D.startRun(m, st, true); D.app.countdown = cd; }, [sh.start[0], sh.start[1], sh.countdown || 0]);
    if (sh.ff) await page.evaluate((f) => window.RSDebug.ffUntil(f, 200), sh.ff);
    if (sh.cam) await page.evaluate((c) => window.RSDebug.setCam(c), sh.cam);
    if (sh.results) await page.evaluate(() => { window.RSDebug.showResults(); });
    if (sh.id === 'outro') await page.evaluate(() => { window.RSDebug.toHome(); window.RSDebug.world.state.frame = { x: 0.5, y: 0.45 }; });
    await setCard(sh.card || null);
    await setCap(sh.cap || null);
    const frames = Math.round(sh.seconds * FPS), dt = (sh.speed || 1) / FPS;
    for (let i = 0; i < frames; i++) {
      // fade captions near the end of a shot
      if (sh.cap && i === frames - 10) await setCap(null);
      await page.evaluate((d) => window.RSDebug.tick(d), dt);
      await grab();
    }
    console.log(sh.id + ': ' + frames + ' frames in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  }
  await browser.close();

  const mp4 = path.join(OUT, 'cold-gas-roadster-demo.mp4');
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart',
    '-vf', 'format=yuv420p', mp4], { stdio: 'inherit' });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log('wrote ' + mp4 + ' (' + (n / FPS).toFixed(1) + ' s)');
}
main().catch((e) => { console.error(e); process.exit(1); });
