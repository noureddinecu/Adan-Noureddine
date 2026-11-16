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
    tick(final) { tone(final ? 1046 : 784, 0.12, 'triangle', 0.4); tone(final ? 2093 : 1568, 0.06, 'sine', 0.12); },
    select() { tone(523, 0.08, 'triangle', 0.25); },
    hint() { [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'sine', 0.18, i * 0.06)); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.22, i * 0.09)); tone(1568, 0.5, 'sine', 0.1, 0.36); },
    lose() { [440, 349, 262].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.09, i * 0.14)); },
    star(i) { tone(880 + i * 220, 0.18, 'sine', 0.22); tone(1760 + i * 220, 0.12, 'sine', 0.06, 0.04); },
    fanfare() {
      [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, i * 0.11));
      noise(0.8, 0.08, 0.6, 5000, 0.5);
    },
    // soft, short applause for gifts (does not break the players' focus)
    applause() {
      if (!enabled || !ensure()) return;
      for (let i = 0; i < 22; i++) noise(0.05 + Math.random() * 0.05, 0.05 + Math.random() * 0.04, i * 0.05 + Math.random() * 0.04, 1300 + Math.random() * 1500, 1.4);
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
  /* Four songs that rotate during a long LIVE (every 15/20 min) + a chill song for breaks.
     Each song: bpm, chords (MIDI triads per bar), bass roots, a lead scale and a drum style. */
  const SONGS = [
    { name: 'arena', bpm: 124, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [45, 41, 48, 43], lead: 'square', drums: 'four' },
    { name: 'oriental', bpm: 108, chords: [[62, 66, 69], [55, 58, 62], [60, 63, 67], [62, 66, 69]], bass: [38, 43, 36, 38], lead: 'oud', drums: 'maqsum',
      scale: [62, 63, 66, 67, 69, 70, 72, 74] },                                                     // D Hijaz
    { name: 'synth', bpm: 116, chords: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]], bass: [40, 36, 43, 38], lead: 'saw', drums: 'four' },
    { name: 'funk', bpm: 128, chords: [[60, 63, 67], [65, 68, 72], [56, 60, 63], [55, 59, 62]], bass: [36, 41, 44, 43], lead: 'square', drums: 'funk' }
  ];
  const CHILL = { name: 'chill', bpm: 78, chords: [[65, 69, 72, 76], [64, 67, 71, 74], [62, 65, 69, 72], [60, 64, 67, 71]], bass: [41, 40, 38, 36], lead: 'keys', drums: 'lofi' };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  let ducked = false;
  let mGain = null, mOn = false, mMode = 'calm', mVol = 0.5, mEnabled = true, step = 0, nextT = 0, timer = null, rollStart = 0;
  let songIdx = 0, songSince = Date.now(), rotateMs = 15 * 60000, autoRotate = false;
  const song = () => (mMode === 'chill' ? CHILL : SONGS[songIdx % SONGS.length]);
  const STEPDUR = () => 60 / song().bpm / 4;

  function mOut() {
    if (!ensure()) return null;
    if (!mGain) {
      // music → compressor → makeup gain → speaker (keeps it loud & clear on phone speakers)
      mGain = ctx.createGain(); mGain.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      const makeup = ctx.createGain(); makeup.gain.value = 1.9;
      mGain.connect(comp); comp.connect(makeup); makeup.connect(ctx.destination);
    }
    return mGain;
  }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function kick(t, v, f0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0 || 150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.003, v, 0.28); o.connect(g); g.connect(mGain); o.start(t); o.stop(t + 0.35);
  }
  function tom(t, v, f) {                           // darbuka "doum"
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    env(g, t, 0.002, v, 0.3); o.connect(g); g.connect(mGain); o.start(t); o.stop(t + 0.35);
  }
  function noiseHit(t, v, type, f, d, q) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const dd = noiseBuf.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1; }
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.8;
    env(g, t, 0.002, v, d); src.connect(fl); fl.connect(g); g.connect(mGain); src.start(t, Math.random() * 0.5); src.stop(t + d + 0.05);
  }
  function synth(t, freq, v, d, type, cutoff, vib) {
    const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = 2;
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 6; lg.gain.value = freq * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + d + 0.05); }
    env(g, t, 0.008, v, d); o.connect(fl); fl.connect(g); g.connect(mGain); o.start(t); o.stop(t + d + 0.05);
  }
  function pad(t, chord, v, d, cutoff) {
    chord.forEach(m => [-6, 6].forEach(det => {
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; fl.type = 'lowpass'; fl.frequency.value = cutoff || 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + d);
      o.connect(fl); fl.connect(g); g.connect(mGain); o.start(t); o.stop(t + d + 0.05);
    }));
  }
  function playStep(t) {
    const S = song(), STEP = STEPDUR();
    const s16 = step % 16, bar = Math.floor(step / 16) % 4, chord = S.chords[bar], root = S.bass[bar];
    const hot = mMode === 'hot', full = mMode === 'play' || hot;
    if (mMode === 'roll') {                          // drum-roll that builds up
      const k = Math.min(1, (ctx.currentTime - rollStart) / 5);
      noiseHit(t, 0.12 + 0.4 * k, 'bandpass', 1900, 0.09, 1.2);
      if (s16 % 4 === 0) kick(t, 0.35 + 0.4 * k);
      if (s16 === 0) pad(t, chord, 0.02, STEP * 16);
      return;
    }
    if (S.drums === 'lofi') {                        // relaxed break music
      if (s16 === 0 || s16 === 10) kick(t, 0.45, 110);
      if (s16 === 8) noiseHit(t, 0.12, 'bandpass', 2400, 0.08, 2);
      if (s16 % 4 === 2) noiseHit(t, 0.05, 'highpass', 8000, 0.04);
      if (s16 % 2 === 1) noiseHit(t, 0.012, 'highpass', 5000, 0.02);          // vinyl crackle
      if (s16 === 0 || s16 === 8) chord.forEach((m, i) => synth(t + i * 0.012, hz(m), 0.045, STEP * 7, 'triangle', 1400));
      if (s16 === 0 || s16 === 6 || s16 === 10) synth(t, hz(root), 0.16, STEP * 4, 'sine', 400);
      return;
    }
    // ---- drums ----
    if (S.drums === 'maqsum') {                      // doum-tek pattern (darbuka)
      if (s16 === 0 || s16 === 8) tom(t, full ? 0.75 : 0.5, 85);
      if (s16 === 2 || s16 === 6 || s16 === 12) noiseHit(t, full ? 0.32 : 0.2, 'bandpass', 3200, 0.06, 1.5);
      if (hot && s16 % 2 === 1) noiseHit(t, 0.07, 'highpass', 9000, 0.05);  // riq jingles
      if (full && (s16 === 14)) noiseHit(t, 0.2, 'bandpass', 3200, 0.05, 1.5);
    } else if (S.drums === 'funk') {
      if (s16 === 0 || s16 === 7 || s16 === 10) kick(t, full ? 0.85 : 0.6);
      if (s16 === 4 || s16 === 12) noiseHit(t, full ? 0.4 : 0.25, 'bandpass', 1600, 0.14, 0.9);
      if (full ? true : s16 % 2 === 0) noiseHit(t, s16 % 4 === 2 ? 0.14 : 0.07, 'highpass', 8000, 0.04);
    } else {
      if (full ? s16 % 4 === 0 : s16 % 8 === 0) kick(t, hot ? 0.95 : 0.8);
      if (s16 === 4 || s16 === 12) noiseHit(t, full ? 0.38 : 0.22, 'bandpass', 1800, 0.16, 0.9);
      if (s16 % 4 === 2) noiseHit(t, 0.16, 'highpass', 7500, 0.05);
      if (hot && s16 % 2 === 1) noiseHit(t, 0.08, 'highpass', 9000, 0.03);
    }
    // ---- bass ----
    if (S.drums === 'funk') { if ([0, 3, 6, 8, 10, 14].includes(s16)) synth(t, hz(root + (s16 === 10 ? 12 : 0)), full ? 0.24 : 0.16, STEP * 1.4, 'square', 600); }
    else if (s16 % 2 === 0) synth(t, hz(root + (s16 % 8 === 6 ? 12 : 0)), full ? 0.22 : 0.14, STEP * 1.7, 'sawtooth', full ? 520 : 320);
    // ---- lead ----
    if (full) {
      if (S.lead === 'oud') {                        // maqam run
        if (s16 % 2 === 0) { const sc = S.scale, i = (s16 / 2 + bar * 3) % sc.length; synth(t, hz(sc[i] + (hot ? 12 : 0)), hot ? 0.09 : 0.07, STEP * 1.6, 'triangle', 2600, true); }
      } else {
        const n = chord[s16 % 3] + 12 + (hot ? 12 : 0) + (s16 % 6 === 5 ? 12 : 0);
        synth(t, hz(n), hot ? 0.07 : 0.05, STEP * 0.9, S.lead === 'saw' ? 'sawtooth' : 'square', hot ? 3200 : 2200);
      }
    }
    if (s16 === 0) pad(t, chord, full ? 0.022 : 0.032, STEP * 16);
    if (hot && s16 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + STEP * 16); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + STEP * 15); g.gain.linearRampToValueAtTime(0.0001, t + STEP * 16); o.connect(g); g.connect(mGain); o.start(t); o.stop(t + STEP * 16 + 0.05); }
  }
  function scheduler() {
    if (!mOn || !ctx) return;
    // when the app is in the background timers slow down → schedule further ahead
    const ahead = document.hidden ? 1.6 : 0.2;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + ahead) {
      // change song every N minutes, on a bar line (not during the break music)
      if (autoRotate && step % 16 === 0 && mMode !== 'chill' && Date.now() - songSince > rotateMs) { songIdx++; songSince = Date.now(); step = 0; }
      playStep(nextT); nextT += STEPDUR(); step++;
    }
  }
  function applyVol(fade) {
    if (!mGain || !ctx) return;
    const v = mOn && mEnabled && enabled ? 0.85 * mVol * (ducked ? 0.4 : 1) : 0.0001;
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
    mode(m) { if (m === mMode) return; const wasChill = mMode === 'chill' || m === 'chill'; mMode = m; if (wasChill) step = 0; if (m === 'roll' && ctx) rollStart = ctx.currentTime; },
    rotateEvery(min) { rotateMs = Math.max(1, +min || 15) * 60000; },
    /** 'arena' (main), 'oriental', 'synth', 'funk' or 'auto' (rotate every N minutes) */
    setSong(name) {
      autoRotate = name === 'auto';
      if (autoRotate) return;
      const i = SONGS.findIndex(x => x.name === name);
      const target = i < 0 ? 0 : i;
      if (target !== songIdx % SONGS.length) { songIdx = target; songSince = Date.now(); step = 0; }
    },
    get state() { return ctx ? ctx.state : 'none'; },
    /** lower the music while the countdown ticks so players hear the timer */
    duck(on) { if (ducked === !!on) return; ducked = !!on; applyVol(0.25); },
    nextSong() { songIdx++; songSince = Date.now(); step = 0; },
    get song() { return song().name; },
    setEnabled(v) { mEnabled = !!v; applyVol(0.4); },
    setVolume(v) { mVol = Math.max(0, Math.min(1, +v || 0)); applyVol(0.3); },
    refresh() { applyVol(0.3); },                 // call after the global sound switch changes
    get playing() { return mOn; },
    _out() { return mGain; },                     // used by tests to record a preview
    get currentMode() { return mMode; }
  };
})(window);
