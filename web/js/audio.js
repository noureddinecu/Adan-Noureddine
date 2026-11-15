/* عربة الذهب — synthesized sound effects (WebAudio, no files, works offline) */
(function (G) {
  'use strict';
  let ctx = null, master = null, enabled = true, rumble = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  let noiseBuf = null;
  function noise(dur, vol, when, filterFreq, q) {
    if (!enabled || !ensure()) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = filterFreq || 1200; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  const S = {
    unlock() { ensure(); },
    setEnabled(v) { enabled = !!v; if (!enabled) S.stopRumble(); },
    isEnabled() { return enabled; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && enabled) ctx.resume(); },

    click() { tone(660, 0.07, 'triangle', 0.25); },
    back() { tone(440, 0.08, 'triangle', 0.22, 0, 330); },
    lid() { noise(0.12, 0.35, 0, 500, 0.8); tone(140, 0.15, 'square', 0.12); },
    open() { noise(0.1, 0.25, 0, 1800, 1); tone(520, 0.1, 'triangle', 0.15, 0, 780); },
    clack() { noise(0.05, 0.12, 0, 2600, 3); noise(0.05, 0.1, 0.07, 2300, 3); },
    switchSnd() { noise(0.08, 0.25, 0, 3500, 4); tone(900, 0.06, 'square', 0.06); },
    tunnel() { noise(0.6, 0.18, 0, 300, 0.6); },
    tick(final) { tone(final ? 1046 : 784, 0.09, 'square', 0.12); },
    select() { tone(523, 0.08, 'triangle', 0.25); },
    hint() { [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'sine', 0.18, i * 0.06)); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.22, i * 0.09)); tone(1568, 0.5, 'sine', 0.1, 0.36); },
    lose() { [440, 349, 262].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.09, i * 0.14)); },
    star(i) { tone(880 + i * 220, 0.18, 'sine', 0.22); tone(1760 + i * 220, 0.12, 'sine', 0.06, 0.04); },
    fanfare() {
      [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, i * 0.11));
      noise(0.8, 0.08, 0.6, 5000, 0.5);
    },
    achievement() { [659, 880, 1318].forEach((f, i) => tone(f, 0.2, 'sine', 0.2, i * 0.08)); },

    startRumble() {
      if (!enabled || !ensure() || rumble) return;
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 48;
      f.type = 'lowpass'; f.frequency.value = 180;
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.4);
      o.connect(f); f.connect(g); g.connect(master); o.start();
      rumble = { o, g };
    },
    setRumble(speed) { if (rumble) rumble.o.frequency.value = 38 + speed * 0.05; },
    stopRumble() {
      if (!rumble || !ctx) return;
      const r = rumble; rumble = null;
      r.g.gain.cancelScheduledValues(ctx.currentTime);
      r.g.gain.setValueAtTime(r.g.gain.value, ctx.currentTime);
      r.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      r.o.stop(ctx.currentTime + 0.35);
    }
  };
  G.Sfx = S;
})(window);
