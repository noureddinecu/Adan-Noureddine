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
    setEnabled(v) { enabled = !!v; if (!enabled) S.stopRumble(); if (G.Music) G.Music.refresh(); },
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

  /* =====================================================================
   * Music — procedural, royalty-free "game show" groove (WebAudio only)
   * A-minor progression Am–F–C–G at 124 BPM. Modes:
   *   calm  : soft beat + pad (topic results / leaderboard)
   *   roll  : snare drum-roll crescendo (topic roulette)
   *   play  : full groove (question)
   *   hot   : + 16th hats, arpeggio up, riser (last 10 seconds)
   * ===================================================================== */
  const BPM = 124, STEP = 60 / BPM / 4;
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // MIDI: Am, F, C, G
  const BASS = [45, 41, 48, 43];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  let mGain = null, mOn = false, mMode = 'calm', mVol = 0.5, mEnabled = true, step = 0, nextT = 0, timer = null, rollStart = 0;

  function mOut() {
    if (!ensure()) return null;
    if (!mGain) { mGain = ctx.createGain(); mGain.gain.value = 0; mGain.connect(ctx.destination); }
    return mGain;
  }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function kick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.003, v, 0.28); o.connect(g); g.connect(mGain); o.start(t); o.stop(t + 0.35);
  }
  function noiseHit(t, v, type, f, d, q) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const dd = noiseBuf.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1; }
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.8;
    env(g, t, 0.002, v, d); src.connect(fl); fl.connect(g); g.connect(mGain); src.start(t, Math.random() * 0.5); src.stop(t + d + 0.05);
  }
  function synth(t, freq, v, d, type, cutoff) {
    const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = 2;
    env(g, t, 0.008, v, d); o.connect(fl); fl.connect(g); g.connect(mGain); o.start(t); o.stop(t + d + 0.05);
  }
  function pad(t, chord, v, d) {
    chord.forEach(m => [-6, 6].forEach(det => {
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; fl.type = 'lowpass'; fl.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + d);
      o.connect(fl); fl.connect(g); g.connect(mGain); o.start(t); o.stop(t + d + 0.05);
    }));
  }
  function playStep(t) {
    const s16 = step % 16, bar = Math.floor(step / 16) % 4, chord = CHORDS[bar], root = BASS[bar];
    const hot = mMode === 'hot', full = mMode === 'play' || hot;
    if (mMode === 'roll') {                          // drum-roll that builds up
      const k = Math.min(1, (ctx.currentTime - rollStart) / 5);
      noiseHit(t, 0.12 + 0.4 * k, 'bandpass', 1900, 0.09, 1.2);
      if (s16 % 4 === 0) kick(t, 0.35 + 0.4 * k);
      if (s16 === 0) pad(t, chord, 0.02, STEP * 16);
      return;
    }
    // drums
    if (full ? s16 % 4 === 0 : s16 % 8 === 0) kick(t, hot ? 0.95 : 0.8);
    if (s16 === 4 || s16 === 12) noiseHit(t, full ? 0.38 : 0.22, 'bandpass', 1800, 0.16, 0.9);
    if (s16 % 4 === 2) noiseHit(t, 0.16, 'highpass', 7500, 0.05);
    if (hot && s16 % 2 === 1) noiseHit(t, 0.08, 'highpass', 9000, 0.03);
    // bass (8ths, octave pops)
    if (s16 % 2 === 0) synth(t, hz(root + (s16 % 8 === 6 ? 12 : 0)), full ? 0.22 : 0.14, STEP * 1.7, 'sawtooth', full ? 520 : 320);
    // arpeggio
    if (full) { const n = chord[(s16 >> 0) % 3] + 12 + (hot ? 12 : 0) + (s16 % 6 === 5 ? 12 : 0); synth(t, hz(n), hot ? 0.07 : 0.05, STEP * 0.9, 'square', hot ? 3200 : 2200); }
    // pad
    if (s16 === 0) pad(t, chord, full ? 0.022 : 0.032, STEP * 16);
    // riser in the hot mode
    if (hot && s16 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + STEP * 16); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + STEP * 15); g.gain.linearRampToValueAtTime(0.0001, t + STEP * 16); o.connect(g); g.connect(mGain); o.start(t); o.stop(t + STEP * 16 + 0.05); }
  }
  function scheduler() {
    if (!mOn || !ctx) return;
    // when the app is in the background timers slow down → schedule further ahead
    const ahead = document.hidden ? 1.6 : 0.2;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + ahead) { playStep(nextT); nextT += STEP; step++; }
  }
  function applyVol(fade) {
    if (!mGain || !ctx) return;
    const v = mOn && mEnabled && enabled ? 0.85 * mVol : 0.0001;
    mGain.gain.cancelScheduledValues(ctx.currentTime);
    mGain.gain.setValueAtTime(Math.max(0.0001, mGain.gain.value), ctx.currentTime);
    mGain.gain.linearRampToValueAtTime(v, ctx.currentTime + (fade || 0.6));
  }
  G.Music = {
    start(mode) {
      if (!mOut()) return;
      if (mode) G.Music.mode(mode);
      if (mOn) return;
      mOn = true; step = 0; nextT = ctx.currentTime + 0.1;
      clearInterval(timer); timer = setInterval(scheduler, 25);
      applyVol(1.2);
    },
    stop() { if (!mOn) return; mOn = false; applyVol(0.5); setTimeout(() => { if (!mOn) clearInterval(timer); }, 600); },
    mode(m) { if (m === mMode) return; mMode = m; if (m === 'roll' && ctx) rollStart = ctx.currentTime; },
    setEnabled(v) { mEnabled = !!v; applyVol(0.4); },
    setVolume(v) { mVol = Math.max(0, Math.min(1, +v || 0)); applyVol(0.3); },
    refresh() { applyVol(0.3); },                 // call after the global sound switch changes
    get playing() { return mOn; },
    _out() { return mGain; },                     // used by tests to record a preview
    get currentMode() { return mMode; }
  };
})(window);
