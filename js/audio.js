/* Cold Gas Roadster — WebAudio: motor whine, gas hiss scaled by mass flow, fan hum, wind, impact thuds. */
(function () {
  'use strict';
  function createAudio() {
    let ctx = null, n = null, muted = false;
    function start() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
      const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; return b; };
      const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const chain = (...a) => { for (let i = 0; i < a.length - 1; i++) a[i].connect(a[i + 1]); return a[a.length - 1]; };

      const hissG = gain(0), roarG = gain(0), fanG = gain(0), windG = gain(0), motorG = gain(0);
      const hissBP = filt('bandpass', 3200, 0.5);
      chain(noise(), hissBP, filt('highpass', 900), hissG, master);
      chain(noise(), filt('lowpass', 320), roarG, master);
      const fanBP = filt('bandpass', 480, 1.6);
      chain(noise(), fanBP, fanG, master);
      const windLP = filt('lowpass', 500);
      chain(noise(), windLP, windG, master);
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      const mLP = filt('lowpass', 2200, 1.2);
      o1.connect(mLP); o2.connect(gain(0.35)).connect(mLP); chain(mLP, motorG, master);
      o1.start(); o2.start();
      n = { master, hissG, roarG, fanG, windG, motorG, hissBP, fanBP, windLP, o1, o2, buf };
    }
    function set(param, v, tc) { param.setTargetAtTime(v, ctx.currentTime, tc || 0.04); }
    function update(s) {
      if (!ctx || !n) return;
      const md = s.mdot;
      set(n.hissG.gain, Math.min(0.5, Math.sqrt(md) * 0.075), 0.02);
      set(n.roarG.gain, Math.min(0.6, md * 0.012), 0.03);
      set(n.hissBP.frequency, 2200 + Math.min(2500, (s.reg.p0 / 1e5) * 25));
      set(n.fanG.gain, s.fan * 0.05);
      set(n.fanBP.frequency, 300 + s.fan * 260);
      const v = s.mode === 'ramp' ? Math.abs(s.v) : Math.hypot(s.vx, s.vy);
      set(n.windG.gain, Math.min(0.25, v * v * 0.00012));
      set(n.windLP.frequency, 300 + v * 18);
      const load = Math.min(1, Math.max(0, s.drive.P / 1e6));
      const f = 70 + Math.abs(s.mode === 'air' ? 0 : v) * 11;
      set(n.o1.frequency, f); set(n.o2.frequency, f * 2.01);
      set(n.motorG.gain, s.mode === 'crashed' ? 0 : 0.012 + load * 0.075);
    }
    function thud(k) {
      if (!ctx || !n) return;
      const src = ctx.createBufferSource(); src.buffer = n.buf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160 + k * 120;
      const g = ctx.createGain(); const t = ctx.currentTime;
      g.gain.setValueAtTime(Math.min(1, 0.25 + k * 0.25), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + k * 0.15);
      src.connect(lp).connect(g).connect(n.master); src.start(t); src.stop(t + 0.8);
    }
    function setMuted(m) { muted = m; if (ctx && n) set(n.master.gain, m ? 0 : 0.55, 0.05); }
    return { start, update, thud, setMuted, get muted() { return muted; } };
  }
  window.RSAudio = { createAudio };
})();
