# Cold Gas Roadster

A browser game, installable on phones, that recreates Tesla's Roadster reveal at SpaceX's McGregor, Texas test site (Oct 15, 2026). Six stages:
1. **Launch:** 0–60 mph with motors and two rear air jets.
2. **Invert:** an inverted half-loop, roll upright, hover landing.
3. **Kickflip:** over a Model 3, Model Y, Cybertruck, Cybercab and Semi.
4. **Climb & refill:** up a 15% grade to a mesa 18 m up; refill the tank from a ground cart and watch the gas heat up.
5. **Canyon jump:** a 42 m gap down to a ledge 8 m lower. Needs speed plus a second of lift.
6. **Summit hover:** rise 10 m onto a tower pad with whatever air is left. The regulator drops out near 80 bar.

The car runs on a working model of its compressed-air (cold-gas) thruster system. The full run uses about 360 kg of air across two fills, so the tank's pressure and temperature are the real game.

One codebase serves both the website and the mobile app (an installable PWA), so design and behaviour match everywhere.

## Run it on your computer

```bash
cd Roadster
python3 -m http.server 8080      # or: npx http-server -p 8080
```
Open http://localhost:8080.

Opening `index.html` directly also works, but install and offline mode need a web server.

## Put it on your phone (mobile app)

1. Host the folder on any HTTPS static host, such as GitHub Pages, Netlify or Cloudflare Pages. No build step is needed.
2. Open the address on your phone.
   - **Android (Chrome):** go to Settings → **Install**, or use the browser menu → **Install app**.
   - **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen**.
3. Launch it from the home screen. It opens full screen in landscape and works offline after the first visit.

## First visit and help

- A three-screen welcome opens on the first visit (or at `index.html#welcome`). It ends with the Guided-mode switch and a "Start the guided demo" button.
- The coach card at the top of the screen always shows the current step, what to press and what happens next. It uses the same step list as the How to play tab (`GUIDE` in `js/ui.js`).
- Guided mode drops into slow motion at each key moment (brake, lift, roll) until the right button is pressed.
- If the car sits still for 8 s the coach card pulses with a hint. Under 100 kg of air a warning appears; under 40 kg it turns red.
- After a crash the game says what happened, why, and gives numbered fixes, plus a "Show me how" autopilot replay of that stage.

## Demo video

`media/cold-gas-roadster-demo.mp4` is a 1080p landscape, 30 fps, about 60 s cut of the autopilot run with captions, made for LinkedIn. To re-render it after changes:

```bash
brew install ffmpeg                    # once
npm i -g playwright-core               # or set NODE_PATH to a folder that has it
node tools/record-demo.js              # ~5–10 minutes; drives the game frame by frame in headless Chrome
```

## Files

| Path | What it is |
|---|---|
| `index.html` | App shell: loading, home (Play · How to play · Settings · Science), HUD, touch controls, dialogs |
| `css/app.css` | Design system and responsive layouts (desktop, tablet, phone portrait/landscape) |
| `js/physics.js` | Gas and vehicle model: tank, regulator, 10 choked nozzles, fan suction, ramp, flight |
| `js/car.js` | The Roadster model: faceted body built from 11 cross-sections, wheels, wing, lights, nozzles |
| `js/world.js` | Three.js scene: test pad, loop ramp, five-car row, sky, ice-fog particles, cameras |
| `js/ui.js` | Menus, settings, tooltips, coach card, guided prompts, results. **The guide steps live here** and drive both the How to play page and the in-game coach. |
| `js/hud.js` | Speed dial, air-tank ring, thruster map, attitude dial, Gas Lab charts |
| `js/game.js` | Stages, checkpoints, Guided mode, autopilot, input, install and offline setup |
| `sw.js`, `manifest.webmanifest`, `icons/` | Mobile app install and offline support |
| `tests/sim-check.js` | `node tests/sim-check.js` flies the demo headless and prints 0–60, landings and air use |
| `tools/build-artifact.js` | Builds `dist/artifact.html` for publishing as a Claude artifact |
| `tools/record-demo.js` | Renders the LinkedIn demo video frame by frame |
| `media/` | The rendered demo video |

## Controls

| Keyboard | Touch | Action |
|---|---|---|
| W / S | GO / BRAKE | Throttle / brake. In the air: nose up / down |
| Shift | BOOST | Rear thrusters (2 nozzles) |
| Space | LIFT | Lift thrusters (4 nozzles) |
| A / D | ◀ / ▶ | Roll thrusters in the air (4 nozzles) |
| Esc / R | ⏸ | Pause · restart stage |
| G / C / X | top bar | Gas Lab · camera · slow motion |
| H / F / M | Settings | Flight assist · fan suction · sound |

Useful links: `index.html#autopilot` (watch a perfect run), `#welcome`, `#guide`, `#settings`, `#science`, `#touch` (force the touch layout on a desktop), `#record` (no auto-welcome; used by the recorder).

## The gas model

- **Tank:** 250 kg of air in 600 L (Tesla). That is about 426 bar, using a real-gas correction Z = 1 + bρ.
- **Blowdown cooling:** an energy balance, m·cv·dT/dt = −ṁRT + Q_liner. The tank reaches about −95 °C after a full run.
- **Regulator:** steps down to 80 bar with Joule–Thomson cooling. It drops out when the tank falls below the set point.
- **Nozzles:** choked. Mass flow ṁ = Cd·A*·p₀·√(γ/RT₀)·0.579, thrust F = ṁvₑ + (pₑ − pₐ)Aₑ. The model flags over- and under-expansion and flow separation.
- **Fan suction:** adds about 1 g of downforce, so grip goes from 1.26 g to about 2.5 g. That is enough to hang upside down.
- **Terrain:** a piecewise-linear elevation profile (`TERRAIN` in `js/physics.js`). On grades gravity acts along the road; cliffs down send the car airborne; cliffs up and tower walls are collisions.
- **Refill:** a ground cart pushes 12 kg/s back in. Inflow carries enthalpy cp·T, so the gas warms as the tank fills (over 100 °C at the peak), then cools against the wall.
- **Calibration:** 0–60 mph comes out at 0.817 s with suction and boost. Tesla's live run was 0.81 s.

**From Tesla:** 2 vessels, 250 kg of air in 600 L, 10 nozzles, 1 MW, 0.81 s, suction up to 2 g, tires 1.26 g.

**Estimated:** fill pressure, regulator, nozzle sizes, dry mass (1,100 kg), ramp radius (6 m) and course layout.

Sources: Not a Tesla App event recap, Teslarati, InsideEVs. Fan-made, not affiliated with Tesla or SpaceX.
