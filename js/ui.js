/* Cold Gas Roadster — menus, guide, settings, coach, prompts, overlays.
 * The GUIDE steps below are the single source for both the How to play tab and the in-game coach card. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id) => '<svg class="ic"><use href="#i-' + id + '"/></svg>';

  // ---------- controls vocabulary ----------
  const ACTIONS = {
    throttle: { kb: ['W'], touch: 'GO', name: 'Throttle' },
    brake: { kb: ['S'], touch: 'BRAKE', name: 'Brake' },
    boost: { kb: ['Shift'], touch: 'BOOST', name: 'Boost' },
    lift: { kb: ['Space'], touch: 'LIFT', name: 'Lift' },
    roll: { kb: ['A', 'D'], touch: '◀ or ▶ ROLL', name: 'Roll', or: true },
  };

  // ---------- the guide (also drives the coach) ----------
  const INTRO = [
    { title: 'Pick a mode', do: 'On the Play tab, choose <b>Start the full demo</b>, or pick one stage to practice.', next: 'A 3-2-1 countdown starts.' },
    { title: 'Follow the coach card', do: 'The card at the top of the screen always shows your current step and what to press.', next: 'It moves to the next step by itself.' },
    { title: 'New? Turn on Guided mode', do: 'Guided mode slows the game at each key moment and waits for you to press the right button.', next: 'Switch it on the Play tab or in Settings.' },
    { title: 'Crashing is fine', do: 'If you crash, the game explains what went wrong and how to fix it.', next: 'You only restart that stage, not the whole run.' },
  ];
  const GUIDE = [
    {
      name: 'Launch', goal: 'Reach 60 mph as fast as you can, then save your air for later.', diagram: 'launch',
      steps: [
        { title: 'Wait for GO', do: 'Watch the 3-2-1 countdown in the middle of the screen.', next: 'When GO appears, the car is yours.' },
        { title: 'Launch', do: 'Hold {throttle} and {boost} together.', next: 'You reach 60 mph in under a second. Your time pops up.' },
        { title: 'Save air', do: 'Let go of {boost}. Keep holding {throttle}.', next: 'Stage 2 starts by itself at the end of the launch zone.' },
      ],
    },
    {
      name: 'Invert', goal: 'Drive through an upside-down loop, roll the right way up in mid-air, and land softly.', diagram: 'invert',
      steps: [
        { title: 'Brake for the ramp', do: 'Hold {brake} until your speed is under {limit}.', next: 'Red-and-white curbs mark the braking zone.' },
        { title: 'Drive into the loop', do: 'Tap {throttle} to keep moving. Slow is fine.', next: 'Fans under the car hold it on the track, even upside down.' },
        { title: 'Roll upright', do: 'When you leave the top upside down, hold {roll}.', next: 'Once you are close to upright, assist finishes the roll.' },
        { title: 'Land softly', do: 'Let go of everything. Assist fires the lift jets to cushion you.', doManual: 'Tap {lift} to slow your fall. Land slower than 1.5 m/s.', next: 'Stage 3 starts after a clean landing.' },
      ],
    },
    {
      name: 'Kickflip', goal: 'Jump over five parked Teslas, spin a full circle in the air, and stop.', diagram: 'kickflip',
      steps: [
        { title: 'Drive toward the cars', do: 'Hold {throttle} and head for the row of parked cars.', next: 'A blue KICKFLIP sign shows where to lift off.' },
        { title: 'Lift off', do: 'At the sign, hold {lift} for about one second.', next: 'You rise higher than the Semi, the tallest car at 3.9 m.' },
        { title: 'Spin', do: 'In the air, hold {roll} to spin a full circle.', next: 'Assist stops the spin once you are upright again.' },
        { title: 'Stop', do: 'After you land, hold {brake} until the car stops.', next: 'Stage 4 starts: the hill climb.' },
      ],
    },
    {
      name: 'Climb & refill', goal: 'Drive up the hill to the mesa, 18 m above the pad, and refill the tank from the ground cart.', diagram: 'climb',
      steps: [
        { title: 'Drive up the hill', do: 'Hold {throttle}. The motor does the climbing, not the jets.', next: 'The HILL CLIMB sign marks the start of the grade.' },
        { title: 'Stop in the yellow box', do: 'Hold {brake} inside the yellow REFILL box on the mesa.', next: 'A hose connects by itself once you are stopped.' },
        { title: 'Watch the tank fill', do: 'Do nothing. Watch the pressure climb and the gas warm up on the right.', next: 'Stage 5 starts when the tank is full.' },
      ],
    },
    {
      name: 'Canyon jump', goal: 'Jump a 42 m canyon from the mesa edge down to a ledge 8 m lower.', diagram: 'canyon',
      steps: [
        { title: 'Speed up toward the edge', do: 'Hold {throttle}. Aim for about 50 mph at the red line.', next: 'The CANYON sign and a red line mark the edge.' },
        { title: 'Lift at the red line', do: 'As you cross the red line, hold {lift} for one second.', next: 'Speed alone is not enough. The jets add the height you need.' },
        { title: 'Glide down', do: 'Let go of everything. Assist cushions the landing on LZ-3.', doManual: 'Tap {lift} just before touchdown to slow the fall.', next: 'Watch the pressure gauge drop while the jets run.' },
        { title: 'Stop', do: 'Hold {brake} until the car stops.', next: 'Stage 6 starts: the summit.' },
      ],
    },
    {
      name: 'Summit hover', goal: 'Rise 10 m straight up onto the tower pad and land in the middle, with whatever air is left.', diagram: 'summit',
      steps: [
        { title: 'Roll slowly toward the tower', do: 'Tap {throttle} until you are doing about 10 mph.', next: 'The SUMMIT sign marks the lift-off point.' },
        { title: 'Lift off at the sign', do: 'At the sign, hold {lift} for about a second and a half.', next: 'You need to rise above the pad before you reach the wall. Each second burns about 40 kg of air.' },
        { title: 'Drift over and settle', do: 'Let go and drift over the pad. Assist lands you.', doManual: 'Feather {lift} to come down slowly.', next: 'If the tank falls under 80 bar the jets fade. Watch the gauge.' },
        { title: 'Stop on the pad', do: 'Hold {brake} until the car stops.', next: 'Your results appear.' },
      ],
    },
  ];

  const FAIL = [
    { m: 'Drove into the tower', why: 'The car was still on the ground when it reached the tower.', fix: ['Hold {lift} at the SUMMIT sign, before the tower.'] },
    { m: 'Drove into the cliff', why: 'The car drove into a rock wall.', fix: ['Stay on the road and follow the coach card.'] },
    { m: 'side of the tower', why: 'The car reached the tower before it had climbed above the pad.', fix: ['Lift off at the SUMMIT sign, not after it.', 'Roll in slowly, about 10 mph.', 'Hold {lift} a little longer, about a second and a half.'] },
    { m: 'canyon wall', why: 'The car was too low when it reached the far side of the canyon.', fix: ['Reach about 50 mph before the red line.', 'Hold {lift} for a full second as you cross the red line.'] },
    { m: 'Fell into the canyon', why: 'The car did not have enough speed and lift to cross the gap.', fix: ['Reach about 50 mph before the red line.', 'Hold {lift} for a full second as you cross the red line.'] },
    { m: 'off the edge', why: 'The car touched down with part of it hanging over the drop.', fix: ['Lift off at the sign so you drift to the middle of the pad.', 'Roll in slower, about 10 mph.'] },
    { m: 'on the edge', why: 'The car touched down with part of it hanging over the drop.', fix: ['Lift off at the sign so you drift to the middle of the pad.', 'Roll in slower, about 10 mph.'] },
    { m: 'Hit the cliff', why: 'The car flew into a rock face.', fix: ['Reach about 50 mph before the red line.', 'Hold {lift} for a full second as you cross the red line.'] },
    { m: 'Suspension', why: 'At the bottom of the loop the car is pressed down hard. Above about 6.5 g the suspension breaks.', fix: ['Start braking at the red-and-white curbs.', 'Enter the loop under {limit}.'] },
    { m: 'Hit the ground', why: 'The car came down faster than the suspension can absorb (more than 5.5 m/s).', fix: ['Hold {roll} as soon as you leave the ramp, so you are upright sooner.', 'Then hold {lift} to slow the fall.', 'Turn on Flight assist: it cushions landings for you.'] },
    { m: 'roof', why: 'The car was not the right way up when it touched down.', fix: ['Hold {roll} earlier and keep holding it.', 'Watch the dial at the bottom: the car shape must be upright.'] },
    { m: 'side', why: 'The car was tilted on its side when it touched down.', fix: ['Keep holding {roll} until the car is level.', 'With Flight assist on, let go once you are close and it finishes the roll.'] },
    { m: 'Clipped', why: 'The car was not high enough to clear the row of parked cars.', fix: ['Lift off at the blue KICKFLIP sign, not later.', 'Hold {lift} for a full second.', 'Keep a steady speed of about 35 mph.'] },
    { m: 'Drove into', why: 'The car was still on the ground when it reached the parked cars.', fix: ['Hold {lift} at the blue KICKFLIP sign.'] },
    { m: 'barrier', why: 'The car was still moving fast at the end of the pad.', fix: ['Hold {brake} as soon as you land.'] },
    { m: 'ramp', why: 'The car lost speed in the loop and fell back onto the ramp.', fix: ['Tap {throttle} in the loop so you leave the top still moving.'] },
    { m: 'Left', why: 'The car flew off the test pad.', fix: ['Use less boost and brake earlier.'] },
  ];

  let opts = null, settings = null, inputMode = 'kb', toastTimer = null, tipEl = null;

  function chips(action, mode) {
    const a = ACTIONS[action]; if (!a) return esc(action);
    if ((mode || inputMode) === 'touch') return '<span class="tchip">' + esc(a.touch) + '</span>';
    return a.kb.map((k) => '<kbd>' + esc(k) + '</kbd>').join(a.or ? ' or ' : ' + ');
  }
  function fill(text, mode) {
    return text.replace(/\{(\w+)\}/g, (_, k) => (k === 'limit' ? speedLimit() : chips(k, mode)));
  }
  function speedLimit() { return settings && settings.units === 'kmh' ? '56 km/h' : '35 mph'; }
  function stepText(step, assist, mode) { return fill(!assist && step.doManual ? step.doManual : step.do, mode); }

  // ---------- init ----------
  function init(o) {
    opts = o; settings = o.settings;
    inputMode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb';
    bindTabs(); bindSettings(); bindPlay(); bindTooltips(); renderGuide();
    document.querySelectorAll('[data-input]').forEach((b) => b.addEventListener('click', () => { inputMode = b.dataset.input; renderGuide(); }));
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.goto)));
  }

  function bindTabs() {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectTab(t.id.slice(2)));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        n.focus(); selectTab(n.id.slice(2));
      });
    });
  }
  function selectTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.id === 't-' + name;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    document.querySelector('.tab-body').scrollTop = 0;
  }

  function bindPlay() {
    $('bRun').addEventListener('click', () => opts.onAction('run'));
    $('bAuto').addEventListener('click', () => opts.onAction('auto'));
    document.querySelectorAll('[data-practice]').forEach((b) => b.addEventListener('click', () => opts.onAction('practice', +b.dataset.practice)));
    document.querySelectorAll('#swatches button').forEach((b) => b.addEventListener('click', () => { opts.onSetting('paint', b.dataset.paint); syncSettings(); }));
  }

  function bindSettings() {
    const sw = (id, key) => $(id).addEventListener('change', (e) => { opts.onSetting(key, e.target.checked); syncSettings(); });
    sw('optGuided', 'guided'); sw('optGuided2', 'guided'); sw('pGuided', 'guided');
    sw('optAssist', 'assist'); sw('pAssist', 'assist'); sw('optSound', 'sound'); sw('optShake', 'shake');
    const seg = (id, key) => $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { opts.onSetting(key, b.dataset.v); syncSettings(); }));
    seg('optUnits', 'units'); seg('optQuality', 'quality');
    const range = (id, key) => $(id).addEventListener('input', (e) => { opts.onSetting(key, +e.target.value); syncSettings(); });
    range('optTemp', 'tempC'); range('optRH', 'RH'); range('optReg', 'reg'); range('optFill', 'fill');
    $('bReset').addEventListener('click', () => { opts.onAction('reset'); syncSettings(); toastHome('Settings reset'); });
    $('bInstall').addEventListener('click', () => opts.onAction('install'));
    $('bFull').addEventListener('click', () => opts.onAction('fullscreen'));
  }

  function syncSettings() {
    const s = settings;
    ['optGuided', 'optGuided2', 'pGuided'].forEach((id) => { $(id).checked = s.guided; });
    ['optAssist', 'pAssist'].forEach((id) => { $(id).checked = s.assist; });
    $('optSound').checked = s.sound; $('optShake').checked = s.shake;
    const segSet = (id, v) => $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b.dataset.v === v));
    segSet('optUnits', s.units); segSet('optQuality', s.quality);
    $('optTemp').value = s.tempC; $('oTemp').textContent = s.tempC + ' °C';
    $('optRH').value = s.RH; $('oRH').textContent = s.RH + '%';
    $('optReg').value = s.reg; $('oReg').textContent = s.reg + ' bar';
    $('optFill').value = s.fill; $('oFill').textContent = s.fill + ' kg';
    $('oFillNote').textContent = '≈ ' + Math.round(RSPhys.tankP(s.fill, 273.15 + s.tempC) / 1e5) + ' bar in the tank at ' + s.tempC + ' °C';
    document.querySelectorAll('#swatches button').forEach((b) => b.setAttribute('aria-checked', b.dataset.paint === s.paint));
    document.querySelectorAll('[data-input]').forEach((b) => b.setAttribute('aria-checked', b.dataset.input === inputMode));
  }

  // ---------- guide rendering ----------
  function diagram(kind) {
    const mk = (x, y, n) => '<g class="gd-mark"><circle cx="' + x + '" cy="' + y + '" r="9"/><text x="' + x + '" y="' + y + '">' + n + '</text></g>';
    if (kind === 'launch') return '<svg viewBox="0 0 400 110" class="guide-diagram" role="img" aria-label="Side view: the car launches from the start line and reaches 60 mph within about 11 metres.">' +
      '<path d="M10 86h380" class="gd-road"/><rect x="30" y="66" width="34" height="14" rx="4" class="gd-obj"/><path d="M70 74h120" class="gd-path"/><path d="M200 74h170" class="gd-path" style="stroke-dasharray:2 6"/>' +
      '<text x="40" y="104" class="gd-lbl">Start</text><text x="160" y="104" class="gd-lbl">60 mph · ~11 m</text><text x="320" y="104" class="gd-lbl">Stage 2 →</text>' + mk(47, 50, 1) + mk(110, 50, 2) + mk(230, 50, 3) + '</svg>';
    if (kind === 'invert') return '<svg viewBox="0 0 400 140" class="guide-diagram" role="img" aria-label="Side view: brake zone, then the half loop, exit upside down at the top, roll, then land on pad LZ-1.">' +
      '<path d="M10 120h380" class="gd-road"/><rect x="230" y="116" width="80" height="6" class="gd-zone"/><rect x="250" y="117" width="54" height="4" class="gd-pad"/>' +
      '<path d="M310 120a50 50 0 0 0 0-100" style="fill:none;stroke:var(--ink-2);stroke-width:4"/><path d="M90 104h200M300 112c40-6 50-60 18-88-14-6-30-6-40 4-20 20-22 60-24 92" class="gd-path"/>' +
      '<text x="230" y="136" class="gd-lbl">brake zone</text><text x="335" y="136" class="gd-lbl">loop</text><text x="214" y="70" class="gd-lbl">roll</text>' + mk(240, 98, 1) + mk(340, 60, 2) + mk(300, 14, 3) + mk(262, 100, 4) + '</svg>';
    if (kind === 'climb') return '<svg viewBox="0 0 400 140" class="guide-diagram" role="img" aria-label="Side view: the road climbs from the pad up to a mesa 18 metres high, with a yellow refill box and the ground cart on top.">' +
      '<path d="M390 120h-120l-120-70h-130" class="gd-road"/><rect x="60" y="46" width="48" height="4" class="gd-pad"/><rect x="40" y="30" width="20" height="16" rx="2" class="gd-obj"/><path d="M60 42h10" class="gd-path"/>' +
      '<text x="300" y="136" class="gd-lbl">pad 0 m</text><text x="118" y="68" class="gd-lbl">mesa 18 m</text><text x="60" y="64" class="gd-lbl">REFILL box</text><text x="28" y="26" class="gd-lbl">cart</text>' + mk(330, 104, 1) + mk(84, 32, 2) + mk(150, 32, 3) + '</svg>';
    if (kind === 'canyon') return '<svg viewBox="0 0 400 140" class="guide-diagram" role="img" aria-label="Side view: the mesa ends at a cliff, a 42 metre gap, then a ledge 8 metres lower with landing pad LZ-3.">' +
      '<path d="M390 40h-150v94M190 72v62h-180" class="gd-road"/><rect x="238" y="36" width="4" height="6" style="fill:#ff5a4e"/><rect x="40" y="70" width="60" height="4" class="gd-pad"/>' +
      '<path d="M330 32h-90c-30-10-60 0-90 28-20 20-40 24-80 26" class="gd-path"/>' +
      '<text x="300" y="56" class="gd-lbl">mesa 18 m</text><text x="200" y="128" class="gd-lbl">42 m gap</text><text x="110" y="92" class="gd-lbl">ledge 10 m</text><text x="46" y="88" class="gd-lbl">LZ-3</text>' + mk(320, 20, 1) + mk(242, 16, 2) + mk(150, 44, 3) + mk(70, 56, 4) + '</svg>';
    if (kind === 'summit') return '<svg viewBox="0 0 400 140" class="guide-diagram" role="img" aria-label="Side view: drive slowly to the SUMMIT sign, rise 10 metres, drift over the tower and land in the middle of its pad.">' +
      '<path d="M390 110h-170M220 110v-60h-120v60h-90" class="gd-road"/><rect x="110" y="48" width="100" height="3" class="gd-pad"/><rect x="250" y="88" width="8" height="22" class="gd-obj"/>' +
      '<path d="M330 100h-70c-10-30-20-50-40-60-30-14-56 0-60 8" class="gd-path"/>' +
      '<text x="300" y="126" class="gd-lbl">ledge 10 m</text><text x="244" y="84" class="gd-lbl">sign</text><text x="128" y="42" class="gd-lbl">SUMMIT pad +10 m</text>' + mk(320, 86, 1) + mk(256, 70, 2) + mk(200, 30, 3) + mk(150, 36, 4) + '</svg>';
    return '<svg viewBox="0 0 400 140" class="guide-diagram" role="img" aria-label="Side view: drive toward five parked cars, lift off at the sign, spin a full circle above them, land on pad LZ-2 and stop.">' +
      '<path d="M10 120h380" class="gd-road"/><rect x="40" y="117" width="80" height="4" class="gd-pad"/>' +
      '<rect x="150" y="104" width="14" height="16" class="gd-obj"/><rect x="168" y="102" width="14" height="18" class="gd-obj"/><rect x="186" y="100" width="14" height="20" class="gd-obj"/><rect x="204" y="104" width="14" height="16" class="gd-obj"/><rect x="222" y="78" width="20" height="42" class="gd-obj"/>' +
      '<path d="M370 112h-60c-30-10-40-90-100-90-50 0-70 60-110 92" class="gd-path"/><circle cx="196" cy="36" r="16" style="fill:none;stroke:var(--ice);stroke-width:1.5;stroke-dasharray:24 6"/>' +
      '<text x="298" y="136" class="gd-lbl">sign</text><text x="226" y="74" class="gd-lbl" text-anchor="end">Semi 3.9 m</text><text x="58" y="136" class="gd-lbl">LZ-2</text>' + mk(350, 98, 1) + mk(300, 98, 2) + mk(196, 36, 3) + mk(70, 100, 4) + '</svg>';
  }
  function stepsHtml(steps, mode, assist) {
    return '<ol class="steps">' + steps.map((s) => '<li><span class="st-title">' + esc(s.title) + '</span><span class="st-do">' + stepText(s, assist, mode) + '</span><span class="st-next">' + icon('arrow') + '<span>' + esc(s.next) + '</span></span></li>').join('') + '</ol>';
  }
  function stageSection(i, mode) {
    const g = GUIDE[i];
    return '<section class="guide-sec"><h3><span class="num">' + (i + 1) + '</span>Stage ' + (i + 1) + ': ' + g.name + '</h3><p class="goal">' + esc(g.goal) + '</p>' + diagram(g.diagram) + stepsHtml(g.steps, mode, settings.assist) + '</section>';
  }
  function renderGuide() {
    const mode = inputMode, touch = mode === 'touch';
    const screen = touch
      ? [['Coach card', 'Top middle. Your current step and what to press.'], ['Speed', 'Top left. How fast you are going.'], ['Air tank', 'Top right. Your thruster fuel. The jets stop when it is empty.'], ['Controls', 'Bottom corners. Pedals and roll on the left, BOOST and LIFT on the right.']]
      : [['Coach card', 'Top middle. Your current step and what to press.'], ['Speed', 'Bottom left. Speed, grip and motor power.'], ['Air tank', 'Bottom right. Your thruster fuel. The jets stop when it is empty.'], ['Thruster map', 'Under the air tank. Lights up the nozzles that are firing.'], ['Attitude dial', 'Bottom middle, in the air. Shows which way up the car is.']];
    const keys = touch
      ? [['<span class="tchip">GO</span> <span class="tchip">BRAKE</span>', 'Accelerate and brake. In the air they tilt the nose.'], ['<span class="tchip">◀</span> <span class="tchip">▶</span>', 'Roll the car in the air.'], ['<span class="tchip">BOOST</span>', 'Rear jets for a faster launch.'], ['<span class="tchip">LIFT</span>', 'Jets under the car. Hold to rise or slow a fall.'], [icon('pause'), 'Pause, restart, or open these steps.']]
      : [['<kbd>W</kbd> <kbd>S</kbd>', 'Throttle and brake. In the air: nose up and down.'], ['<kbd>Shift</kbd>', 'Boost: rear jets for a faster launch.'], ['<kbd>Space</kbd>', 'Lift: jets under the car. Hold to rise or slow a fall.'], ['<kbd>A</kbd> <kbd>D</kbd>', 'Roll the car in the air.'], ['<kbd>Esc</kbd> <kbd>R</kbd>', 'Pause · restart the stage.'], ['<kbd>G</kbd> <kbd>C</kbd> <kbd>X</kbd>', 'Gas Lab · camera · slow motion.'], ['<kbd>H</kbd> <kbd>F</kbd> <kbd>M</kbd>', 'Flight assist · fan suction · sound.']];
    $('guideBody').innerHTML =
      '<section class="guide-sec"><h3>' + icon('info') + 'Before you start</h3>' + stepsHtml(INTRO, mode, true) + '</section>' +
      GUIDE.map((_, i) => stageSection(i, mode)).join('') +
      '<section class="guide-sec"><h3>' + icon('eye') + 'Reading the screen</h3><div class="screen-map">' + screen.map((r) => '<div><b>' + r[0] + '</b><span>' + r[1] + '</span></div>').join('') + '</div></section>' +
      '<section class="guide-sec"><h3>' + icon(touch ? 'touch' : 'keyboard') + 'All controls</h3><table class="keys-table"><tbody>' + keys.map((k) => '<tr><td>' + k[0] + '</td><td>' + k[1] + '</td></tr>').join('') + '</tbody></table></section>' +
      '<button class="btn btn-primary btn-xl" type="button" id="bGuideRun">' + icon('play') + '<span class="btn-text"><b>Got it, start the demo</b><small>Guided mode ' + (settings.guided ? 'is on' : 'is off') + '</small></span></button>';
    $('bGuideRun').addEventListener('click', () => opts.onAction('run'));
    syncSettings();
  }

  // ---------- tooltips ----------
  function bindTooltips() {
    tipEl = $('tip');
    const show = (el) => {
      const t = el.getAttribute('data-tip'); if (!t || matchMedia('(pointer: coarse)').matches) return;
      tipEl.textContent = t; tipEl.hidden = false;
      const r = el.getBoundingClientRect(), w = tipEl.offsetWidth;
      const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const below = r.bottom + 8 + 30 < innerHeight;
      tipEl.style.left = left + 'px'; tipEl.style.top = (below ? r.bottom + 8 : r.top - 36) + 'px';
    };
    const hide = () => { tipEl.hidden = true; };
    document.addEventListener('pointerover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el); });
    document.addEventListener('pointerout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hide(); });
    document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el); });
    document.addEventListener('focusout', hide);
  }

  // ---------- screens ----------
  function screen(name) {
    $('loading').hidden = name !== 'loading';
    $('home').hidden = name !== 'home';
    $('hud').hidden = name !== 'game';
    document.body.classList.toggle('at-home', name === 'home');
    if (name === 'home') syncSettings();
  }
  function loading(pct, text) {
    $('loadBar').style.width = pct + '%'; $('loadProg').setAttribute('aria-valuenow', pct);
    if (text) $('loadText').textContent = text;
  }
  function loadError() { $('loadError').hidden = false; $('loadText').hidden = true; }

  // ---------- coach, prompt, toast ----------
  let coachKey = '';
  function coach(stageIdx, stepIdx, o) {
    o = o || {};
    const g = GUIDE[stageIdx], st = g.steps[Math.min(stepIdx, g.steps.length - 1)];
    const key = stageIdx + ':' + stepIdx + ':' + (o.override || '') + inputMode + settings.assist;
    $('coachAuto').hidden = !o.auto;
    if (key === coachKey) return;
    coachKey = key;
    $('coachStep').textContent = 'Step ' + (stepIdx + 1) + ' of ' + g.steps.length;
    $('coachStage').textContent = 'Stage ' + (stageIdx + 1) + ' · ' + g.name;
    $('coachTitle').textContent = o.title || st.title;
    $('coachDo').innerHTML = o.override ? o.override : stepText(st, settings.assist);
    $('coachNext').innerHTML = icon('arrow') + '<span>' + esc(o.next || st.next) + '</span>';
    const c = $('coach'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
    say((o.title || st.title) + '. ' + $('coachDo').textContent);
    document.querySelectorAll('.t-btn.hint').forEach((b) => b.classList.remove('hint'));
  }
  function resetCoach() { coachKey = ''; }
  function prompt(p) {
    const el = $('prompt');
    if (!p) { el.hidden = true; document.querySelectorAll('.t-btn.hint').forEach((b) => b.classList.remove('hint')); return; }
    $('promptKeys').innerHTML = p.keys.map((k) => chips(k)).join('<span style="align-self:center;color:var(--muted)">+</span>');
    $('promptTitle').textContent = p.title;
    $('promptText').textContent = p.text;
    el.hidden = false;
    const map = { throttle: 'tGo', brake: 'tBrake', boost: 'tBoost', lift: 'tLift', roll: 'tRollR' };
    p.keys.forEach((k) => { const b = $(map[k]); if (b) b.classList.add('hint'); });
    say(p.title + '. ' + p.text);
  }
  function toast(big, small, ms) {
    const t = $('toast');
    $('toastBig').textContent = big; $('toastSmall').textContent = small || '';
    t.classList.remove('hide');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hide'), ms || 1600);
  }
  function toastHome(text) { say(text); }
  function say(text) { const s = $('sr'); s.textContent = ''; setTimeout(() => { s.textContent = text; }, 30); }

  // ---------- overlays ----------
  function hideOverlays() { ['pause', 'fail', 'results', 'sheet'].forEach((id) => { $(id).hidden = true; }); }
  function showPause(kg) { syncSettings(); $('pauseKg').textContent = kg.toFixed(0); $('pause').hidden = false; $('bResume').focus({ preventScroll: true }); }
  function showSheetGuide(stageIdx) {
    $('sheetTitle').textContent = 'Stage ' + (stageIdx + 1) + ': ' + GUIDE[stageIdx].name;
    $('sheetBody').innerHTML = '<p class="muted-p">' + esc(GUIDE[stageIdx].goal) + '</p>' + diagram(GUIDE[stageIdx].diagram) + stepsHtml(GUIDE[stageIdx].steps, inputMode, settings.assist);
    $('sheet').hidden = false; $('bSheetBack').focus({ preventScroll: true });
  }
  function showFail(stageIdx, reason, tankKg) {
    const f = FAIL.find((x) => reason.indexOf(x.m) >= 0) || { why: 'Something went wrong in this stage.', fix: ['Try the stage again.', 'Or tap Show me how to watch the autopilot do it.'] };
    $('failStage').textContent = 'Stage ' + (stageIdx + 1) + ' · ' + GUIDE[stageIdx].name;
    $('failReason').textContent = reason;
    $('failWhy').textContent = f.why;
    const fixes = f.fix.slice();
    if (tankKg < 60) fixes.push('You were down to ' + Math.round(tankKg) + ' kg of air. Use "Try with a full tank" to practice.');
    $('failFix').innerHTML = fixes.map((x) => '<li><span>' + fill(x) + '</span></li>').join('');
    $('fail').hidden = false; $('bRetry').focus({ preventScroll: true });
    say('Crashed. ' + reason + '. ' + f.why);
  }
  function medalSvg(tier, label) {
    return '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23" class="med-fill"/><circle cx="26" cy="26" r="23" class="med-ring med-' + tier + '"/><circle cx="26" cy="26" r="17" class="med-ring med-' + tier + '" style="stroke-width:1;opacity:.5"/><text x="26" y="27" class="med-txt">' + esc(label) + '</text></svg>';
  }
  function showResults(r) {
    $('resEyebrow').textContent = r.eyebrow; $('resTitle').textContent = r.title;
    $('resBadges').innerHTML = r.badges.map((b) => '<div class="badge' + (b.tier === 'none' ? ' none' : '') + '">' + medalSvg(b.tier, b.short) + '<b>' + esc(b.name) + '</b><span>' + esc(b.medal) + '</span></div>').join('');
    $('resGas').textContent = r.gas;
    $('resBody').innerHTML = r.rows.map((x) => '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td><td class="v">' + esc(x[2]) + '</td></tr>').join('');
    $('bNextTxt').textContent = r.nextLabel; $('bNext').hidden = !r.nextLabel;
    $('results').hidden = false; $('bAgain').focus({ preventScroll: true });
    say(r.title);
  }
  function best(b, units) {
    const box = $('bestBox');
    if (!b || (!b.t060 && !b.land && !b.flips)) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<div><span>Best 0–60</span><b>' + (b.t060 ? b.t060.toFixed(2) + ' s' : '—') + '</b></div><div><span>Softest landing</span><b>' + (b.land ? b.land.toFixed(1) + ' m/s' : '—') + '</b></div><div><span>Kickflips</span><b>' + (b.flips || 0) + '</b></div>';
  }
  function setInstall(state) {
    const btn = $('bInstall'), note = $('installNote');
    if (state === 'installed') { btn.hidden = true; note.textContent = 'Installed. Open it from your home screen.'; }
    else if (state === 'ios') { btn.hidden = true; note.innerHTML = 'On iPhone or iPad: tap the Share button ' + icon('install') + ' then <b>Add to Home Screen</b>.'; }
    else if (state === 'ready') { btn.hidden = false; note.textContent = 'Adds Cold Gas Roadster to your home screen. It opens full screen and works offline.'; }
    else { btn.hidden = true; note.textContent = 'Open this game from its web address in Chrome, Edge or Safari, then use the browser menu: Install app / Add to Home Screen.'; }
  }

  // ---------- first-visit welcome ----------
  let wIdx = 0, wCb = null;
  function wShow(i) {
    wIdx = Math.max(0, Math.min(2, i));
    document.querySelectorAll('#welcome .w-slide').forEach((el) => { el.hidden = +el.dataset.i !== wIdx; });
    document.querySelectorAll('#welcome .w-dots i').forEach((el, k) => el.classList.toggle('on', k <= wIdx));
    $('wBack').hidden = wIdx === 0;
    $('wNext').parentNode.hidden = wIdx === 2;
    document.querySelector('#welcome .w-final').hidden = wIdx !== 2;
    if (wIdx === 2) {
      $('wGuided').checked = settings.guided;
      $('wControls').innerHTML = inputMode === 'touch'
        ? 'You will use on-screen buttons: ' + chips('throttle') + ' ' + chips('brake') + ' on the left, ' + chips('boost') + ' ' + chips('lift') + ' on the right.'
        : 'Keys: ' + chips('throttle') + ' throttle, ' + chips('brake') + ' brake, ' + chips('boost') + ' boost, ' + chips('lift') + ' lift, ' + chips('roll') + ' roll.';
    }
    ($('wNext').parentNode.hidden ? $('wStart') : $('wNext')).focus({ preventScroll: true });
  }
  function showWelcome(cb) {
    wCb = cb; $('welcome').hidden = false; wShow(0);
    if (!showWelcome.bound) {
      showWelcome.bound = true;
      $('wNext').addEventListener('click', () => wShow(wIdx + 1));
      $('wBack').addEventListener('click', () => wShow(wIdx - 1));
      $('wGuided').addEventListener('change', (e) => { opts.onSetting('guided', e.target.checked); syncSettings(); });
      $('wStart').addEventListener('click', () => { $('welcome').hidden = true; wCb('run'); });
      $('wWatch').addEventListener('click', () => { $('welcome').hidden = true; wCb('auto'); });
      $('wSkip').addEventListener('click', () => { $('welcome').hidden = true; wCb('skip'); });
    }
  }
  function banner(stageIdx) {
    const b = $('banner'), g = GUIDE[stageIdx];
    $('bNum').textContent = 'Stage ' + (stageIdx + 1) + ' of ' + GUIDE.length; $('bName').textContent = g.name; $('bGoal').textContent = g.goal;
    b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, 2600);
  }
  function hint(text) {
    const c = $('coach'); c.classList.remove('hint'); void c.offsetWidth; c.classList.add('hint');
    toast('Stuck?', text, 2600);
    setTimeout(() => c.classList.remove('hint'), 2600);
  }
  function lowAir(kg, level) {
    const el = $('lowair');
    if (!level) { el.hidden = true; return; }
    el.hidden = false; el.classList.toggle('crit', level === 'crit');
    $('lowairTxt').textContent = level === 'crit' ? 'Almost empty: ' + Math.round(kg) + ' kg. Jets are fading.' : 'Air low: ' + Math.round(kg) + ' kg left. Below 80 bar the jets weaken.';
  }

  window.RSUI = {
    showWelcome, banner, hint, lowAir,
    init, screen, loading, loadError, syncSettings, selectTab, coach, resetCoach, prompt, toast, say,
    hideOverlays, showPause, showSheetGuide, showFail, showResults, best, setInstall, chips,
    get inputMode() { return inputMode; }, GUIDE,
  };
})();
