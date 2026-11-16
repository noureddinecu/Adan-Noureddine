/* =========================================================================
 * عربة الذهب — game engine & renderer (Canvas 2D)
 * World axis: distance d grows forward (up the screen). Carts sit at d = travel.
 * ========================================================================= */
(function (G) {
  'use strict';

  const W = 720;
  const C = {
    bg: '#F5F1E7', band: '#E8E1D4', ink: '#2E2A30',
    tie: '#F8D9C3', tieX: '#DDD3F8', tieOff: '#E6E2DC',
    rail: '#E2DCD1', railHi: '#FBF8F2', railX: '#D9D3EA',
    cartRim: '#7DD0F2', cartIn: '#DAD8D4', lid: '#A193F6', lidLine: '#7564DB',
    gold: '#FFD23A', goldDark: '#E2A200', goldLite: '#FFF0A6',
    tunnel: '#F7C7A6', tunnelLine: '#EBAF8B', tunnelDoor: '#4A3F42',
    palm: '#5CC593', palmDark: '#2F8C63', palmCore: '#F0786C', rock: '#D3CDC0', grass: '#5CC79A',
    good: '#3FBF7F', bad: '#EF5F6B'
  };

  const ease = u => u * u * (3 - 2 * u);
  const easeD = u => 6 * u * (1 - u);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class Game {
    constructor(canvas, hooks) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.hooks = hooks || {};
      this.H = 1280;
      this.mode = 'demo';
      this.paused = false;
      this.relaxed = false;
      this.clock = performance.now();
      this.lastDraw = 0;
      this.fpsCap = 0;            // 0 = uncapped, 30 = battery saver
      this.resize();
      this.startDemo();
      window.addEventListener('resize', () => this.resize());
      canvas.addEventListener('pointerdown', e => this.onPointer(e));
      requestAnimationFrame(t => this.frame(t));
      // When Android hides the WebView (host switched to TikTok) requestAnimationFrame stops.
      // This interval keeps the round clock running so no round is frozen or lost.
      setInterval(() => { if (performance.now() - this.clock > 300) this.tick(); }, 250);
    }

    tick() {
      const now = performance.now();
      let el = Math.min(180, (now - this.clock) / 1000);   // catch up at most 3 minutes
      this.clock = now;
      if (this.paused) return;
      while (el > 0) { const d = Math.min(0.05, el); this.update(d); el -= d; }
    }

    /* ---------------- layout ---------------- */
    resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.cv.width = Math.round(vw * dpr);
      this.cv.height = Math.round(vh * dpr);
      this.cv.style.width = vw + 'px';
      this.cv.style.height = vh + 'px';
      this.k = this.cv.width / W;
      this.H = this.cv.height / this.k;
      this.cartY = Math.round(this.H * (this.live ? 0.6 : 0.64));
      this.cssScale = vw / W;
    }

    setGeometry(L) {
      this.L = L;
      this.sp = this.live ? Math.min(138, 690 / L) : Math.min(118, 640 / L);
      const s = this.s = this.sp / 110;
      this.gauge = 34 * s; this.tieLen = 62 * s; this.tieH = 9 * s; this.tieGap = 22 * s;
      this.bandW = 80 * s; this.cw = 70 * s; this.ch = 88 * s;
    }
    laneX(i) { return W / 2 + (i - (this.L - 1) / 2) * this.sp; }
    yOf(d) { return this.cartY - (d - this.travel); }

    /* ---------------- modes ---------------- */
    startDemo() {
      this.mode = 'demo';
      this.level = null;
      this.live = false; this.resize();
      this.setGeometry(5);
      this.events = []; this.tunnels = [];
      this.base = [0, 1, 2, 3, 4]; this.firstEv = 0;
      this.travel = 0; this.speed = 170;
      this.lid = [1, 1, 1, 1, 1];
      this.golds = []; this.phase = 'demo';
      this.demoNext = 700;
      this.demoR = G.Levels.rng(Date.now() & 0xffff);
      this.decoSeed = 99;
      this.fx = [];
    }

    startLevel(level, opts) {
      opts = opts || {};
      this.mode = 'level';
      this.level = level;
      this.live = !!opts.live;
      this.answerTime = opts.answerTime || level.answerTime;
      this.preview = opts.preview || level.preview;
      this.resize();
      this.setGeometry(level.lanes);
      this.events = level.events.slice();
      this.tunnels = level.tunnels;
      this.base = Array.from({ length: level.lanes }, (_, i) => i);
      this.firstEv = 0;
      this.travel = 0; this.speed = 0;
      this.golds = level.golds;
      this.lid = this.base.map(() => 0);
      this.phase = 'intro'; this.phaseT = 0;
      this.paused = false;
      this.relaxed = !!opts.relaxed;
      this.picks = []; this.result = null;
      this.hintT = 0; this.usedHint = false;
      this.decoSeed = level.n * 31;
      this.fx = [];
      this.lastClack = 0; this.evSounded = -1; this.tunSounded = -1;
      this.qTime = 0;
      this.hooks.onPhase && this.hooks.onPhase('intro', level);
    }

    pause(v) { if (this.mode === 'level') this.paused = v; }

    useHint() {
      if (this.phase !== 'running' || this.hintT > 0) return false;
      this.hintT = 1.6; this.usedHint = true;
      G.Sfx.hint();
      return true;
    }

    /* ---------------- cart positions ---------------- */
    posOf(c, t) {
      let lane = this.base[c];
      const ev = this.events;
      for (let i = this.firstEv; i < ev.length; i++) {
        const e = ev[i];
        if (t <= e.d) break;
        const to = e.active ? e.perm[lane] : lane;
        if (t < e.d + e.len && to !== lane) {
          const u = (t - e.d) / e.len;
          const xa = this.laneX(lane), xb = this.laneX(to);
          return { x: xa + (xb - xa) * ease(u), ang: Math.atan((xb - xa) * easeD(u) / e.len), lane: to, moving: true };
        }
        lane = to;
      }
      return { x: this.laneX(lane), ang: 0, lane, moving: false };
    }

    finalLanes() { return this.base.map((_, c) => this.posOf(c, 1e12).lane); }

    /* ---------------- update ---------------- */
    frame(ts) {
      if (this.hidden) { this.clock = performance.now(); requestAnimationFrame(t => this.frame(t)); return; }   // quiz on screen: save battery
      this.tick();
      if (!this.fpsCap || ts - this.lastDraw >= 1000 / this.fpsCap - 2) { this.lastDraw = ts; this.draw(); }
      requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
      this.fx = this.fx.filter(f => (f.t += dt) < f.life);
      if (this.mode === 'demo') return this.updateDemo(dt);
      const lv = this.level;
      this.phaseT += dt;
      if (this.hintT > 0) this.hintT -= dt;

      switch (this.phase) {
        case 'intro':
          if (this.phaseT >= this.preview) this.setPhase('closing');
          break;
        case 'closing':
          this.lid = this.lid.map(() => clamp(this.phaseT / 0.55, 0, 1));
          if (this.phaseT >= 0.75) { this.setPhase('running'); G.Sfx.startRumble(); }
          break;
        case 'running': {
          const prog = this.travel / lv.endD;
          let v = lv.speed[0] + (lv.speed[1] - lv.speed[0]) * prog;
          if (lv.varSpeed) v *= 1 + 0.22 * Math.sin(this.travel / 520);
          if (this.relaxed) v *= 0.82;
          v *= clamp(this.phaseT / 0.9, 0.15, 1);               // smooth start
          const rem = lv.endD - this.travel;
          if (rem < 380) v *= Math.max(0.07, Math.pow(rem / 380, 0.65)); // smooth braking
          this.speed = v;
          this.travel = Math.min(lv.endD, this.travel + v * dt);
          G.Sfx.setRumble(v);
          // sounds
          if (this.travel - this.lastClack > 260) { this.lastClack = this.travel; G.Sfx.clack(); }
          for (let i = this.evSounded + 1; i < this.events.length; i++) {
            if (this.events[i].d <= this.travel) { this.evSounded = i; if (this.events[i].active) G.Sfx.switchSnd(); } else break;
          }
          for (let i = this.tunSounded + 1; i < this.tunnels.length; i++) {
            if (this.tunnels[i].d0 - 40 <= this.travel) { this.tunSounded = i; G.Sfx.tunnel(); } else break;
          }
          this.hooks.onProgress && this.hooks.onProgress(this.travel / lv.endD);
          if (lv.endD - this.travel < 1.5) { this.travel = lv.endD; G.Sfx.stopRumble(); this.setPhase('question'); }
          break;
        }
        case 'question': {
          this.qTime += dt;
          const left = this.answerTime - this.qTime;
          const sec = Math.ceil(left);
          if (sec !== this.lastTick && sec <= (this.live ? 5 : 3) && sec > 0) { this.lastTick = sec; G.Sfx.tick(sec === 1); }
          if (left <= 0) this.finish(this.live ? null : false, true);
          break;
        }
        case 'reveal':
          this.lid = this.lid.map(l => Math.max(0, l - dt * 2.4));
          if (this.phaseT >= 1.9 && !this.reported) {
            this.reported = true;
            this.hooks.onResult && this.hooks.onResult(this.result);
          }
          break;
      }
      this.prune();
    }

    setPhase(p) {
      this.phase = p; this.phaseT = 0;
      if (p === 'question') { this.qTime = 0; this.lastTick = 99; this.picks = []; }
      if (p === 'closing') G.Sfx.lid();
      this.hooks.onPhase && this.hooks.onPhase(p, this.level);
    }

    finish(win, timeout) {
      const lv = this.level;
      this.result = {
        win, timeout: !!timeout,
        live: this.live,
        timeFrac: clamp(this.qTime / this.answerTime, 0, 1),
        answerSeconds: this.qTime,
        usedHint: this.usedHint,
        picks: this.picks.slice()
      };
      this.reported = false;
      this.setPhase('reveal');
      G.Sfx.open();
      const fin = this.finalLanes();
      if (win || this.live) {
        G.Sfx.win(); if (!this.live && G.haptic) G.haptic(40);
        lv.golds.forEach(g => this.burst(this.laneX(fin[g]), this.cartY, C.gold, 26));
      } else {
        G.Sfx.lose(); G.haptic && G.haptic([60, 60, 60]);
      }
    }

    /** Live mode: the host ends the answer window right now. */
    revealNow() {
      if (this.mode !== 'level') return false;
      if (this.phase === 'question') { this.finish(this.live ? null : false, true); return true; }
      if (this.phase === 'running' || this.phase === 'intro' || this.phase === 'closing') {
        // skip straight to the end of the track, then reveal
        this.travel = this.level.endD; G.Sfx.stopRumble();
        this.lid = this.lid.map(() => 1);
        this.setPhase('question'); this.finish(this.live ? null : false, true);
        return true;
      }
      return false;
    }

    prune() {
      const ev = this.events;
      const limit = this.travel - (this.H - this.cartY) - 120;
      while (this.firstEv < ev.length && ev[this.firstEv].d + ev[this.firstEv].len < limit) {
        const e = ev[this.firstEv];
        if (e.active) this.base = this.base.map(l => e.perm[l]);
        this.firstEv++;
      }
    }

    updateDemo(dt) {
      this.travel += this.speed * dt;
      const R = this.demoR;
      while (this.demoNext < this.travel + this.H + 400) {
        const L = 5, multi = R() < 0.3;
        const perm = Array.from({ length: L }, (_, i) => i);
        const a = Math.floor(R() * (L - 1));
        perm[a] = a + 1; perm[a + 1] = a;
        if (multi) { const b = (a + 2 + Math.floor(R() * 2)) % (L - 1); if (Math.abs(b - a) >= 2) { perm[b] = b + 1; perm[b + 1] = b; } }
        this.events.push({ d: this.demoNext, len: 320, perm, active: true, kind: 'swap' });
        this.demoNext += 320 + 120 + R() * 260;
      }
      this.prune();
      if (this.firstEv > 50) { this.events = this.events.slice(this.firstEv); this.firstEv = 0; }
    }

    /* ---------------- input ---------------- */
    onPointer(e) {
      if (this.mode !== 'level' || this.live || this.paused || this.phase !== 'question') return;
      const x = e.clientX / this.cssScale, y = e.clientY / this.cssScale;
      if (Math.abs(y - this.cartY) > this.ch * 0.9) return;
      const fin = this.finalLanes();
      let best = -1, bd = 1e9;
      fin.forEach((lane, c) => {
        const dx = Math.abs(this.laneX(lane) - x);
        if (dx < this.sp * 0.5 && dx < bd) { bd = dx; best = c; }
      });
      if (best < 0 || this.picks.includes(best)) return;
      this.pick(best);
    }

    pick(c) {
      const lv = this.level;
      this.picks.push(c);
      G.Sfx.select(); G.haptic && G.haptic(15);
      const fin = this.finalLanes();
      this.fx.push({ type: 'pop', c, t: 0, life: 0.35 });
      if (!lv.golds.includes(c)) { this.finish(false); return; }
      this.burst(this.laneX(fin[c]), this.cartY, C.gold, 10);
      if (lv.golds.every(g => this.picks.includes(g))) this.finish(true);
    }

    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
        this.fx.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, color, t: 0, life: 0.7 + Math.random() * 0.5, r: 4 + Math.random() * 6 });
      }
    }

    /* =================================================================
     * RENDERING
     * ================================================================= */
    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, this.H);
      this.drawDecor(ctx);
      this.drawTracks(ctx);
      this.drawSignals(ctx);
      this.drawCarts(ctx);
      this.drawTunnels(ctx);
      this.drawOverlay(ctx);
      this.drawFx(ctx);
    }

    /* ---------- decorations (palms, rocks, grass) ---------- */
    drawDecor(ctx) {
      const CH = 230;
      const dTop = this.travel + this.cartY + 80, dBot = this.travel - (this.H - this.cartY) - 80;
      const leftEdge = this.laneX(0) - this.bandW / 2 - 8;
      const rightEdge = this.laneX(this.L - 1) + this.bandW / 2 + 8;
      for (let k = Math.floor(dBot / CH); k <= Math.ceil(dTop / CH); k++) {
        const R = G.Levels.rng((k * 9973) ^ this.decoSeed);
        const items = 1 + Math.floor(R() * 3);
        for (let i = 0; i < items; i++) {
          const right = R() < 0.5;
          const m0 = right ? rightEdge : 0, m1 = right ? W : leftEdge;
          if (m1 - m0 < 26) continue;
          const x = m0 + 14 + R() * (m1 - m0 - 28);
          const y = this.yOf(k * CH + R() * CH);
          const t = R();
          if (t < 0.28 && m1 - m0 > 60) this.palm(ctx, x, y, 26 + R() * 12, R() * 6);
          else if (t < 0.65) this.rock(ctx, x, y, 12 + R() * 12, R());
          else this.grass(ctx, x, y);
        }
        // pebbles between tracks
        if (R() < 0.5) {
          const lane = Math.floor(R() * (this.L - 1));
          const x = (this.laneX(lane) + this.laneX(lane + 1)) / 2 + (R() - 0.5) * 10;
          this.grass(ctx, x, this.yOf(k * CH + R() * CH));
        }
      }
    }

    palm(ctx, x, y, r, rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(r * 0.35, -r * 0.45, 0, -r);
        ctx.quadraticCurveTo(-r * 0.35, -r * 0.45, 0, 0);
        ctx.fillStyle = C.palm; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * 0.15); ctx.lineTo(0, -r * 0.8);
        ctx.strokeStyle = C.palmDark; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = C.palmCore; ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    rock(ctx, x, y, r, v) {
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.78 + 0.22 * Math.sin(i * 2.3 + v * 9));
        const px = Math.cos(a) * rr * 1.15, py = Math.sin(a) * rr * 0.85;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#B9B2A5'; ctx.save(); ctx.translate(0, 3); ctx.fill(); ctx.restore();
      ctx.fillStyle = C.rock; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.35, -r * 0.35); ctx.lineTo(r * 0.05, -r * 0.45);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    }

    grass(ctx, x, y) {
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = C.grass; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 0); ctx.lineTo(-8, -9);
      ctx.moveTo(0, 0); ctx.lineTo(0, -11);
      ctx.moveTo(5, 0); ctx.lineTo(8, -8);
      ctx.stroke();
      ctx.restore();
    }

    /* ---------- tracks ---------- */
    curvePoints(e, from, to) {
      const N = 28, pts = [];
      const xa = this.laneX(from), xb = this.laneX(to);
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const d = e.d + u * e.len;
        const slope = (xb - xa) * easeD(u) / e.len;   // dx per world unit
        const nl = Math.hypot(1, slope);
        pts.push({ x: xa + (xb - xa) * ease(u), y: this.yOf(d), nx: 1 / nl, ny: slope / nl });
      }
      return pts;
    }

    visible(e) {
      const yTop = this.yOf(e.d + e.len), yBot = this.yOf(e.d);
      return yBot > -40 && yTop < this.H + 40;
    }

    drawTracks(ctx) {
      const L = this.L, H = this.H;
      ctx.lineCap = 'butt';
      // ---- gravel bands ----
      ctx.fillStyle = C.band;
      for (let i = 0; i < L; i++) ctx.fillRect(this.laneX(i) - this.bandW / 2, 0, this.bandW, H);

      const curves = [];
      for (let i = this.firstEv; i < this.events.length; i++) {
        const e = this.events[i];
        if (!this.visible(e)) { if (this.yOf(e.d + e.len) > H + 40) continue; else break; }
        e.perm.forEach((to, from) => { if (to !== from) curves.push({ e, pts: this.curvePoints(e, from, to), off: !e.active }); });
      }
      // curve bands
      ctx.strokeStyle = C.band; ctx.lineWidth = this.bandW; ctx.lineJoin = 'round';
      curves.forEach(cv => { this.polyline(ctx, cv.pts, 0); ctx.stroke(); });

      // ---- straight ties ----
      const g = this.tieGap, half = this.tieLen / 2;
      const dMin = this.travel - (H - this.cartY) - g, dMax = this.travel + this.cartY + g;
      ctx.beginPath();
      for (let k = Math.ceil(dMin / g); k * g <= dMax; k++) {
        const y = this.yOf(k * g);
        for (let i = 0; i < L; i++) { const x = this.laneX(i); ctx.moveTo(x - half, y); ctx.lineTo(x + half, y); }
      }
      this.doubleStroke(ctx, this.tieH, C.tie, true);

      // ---- straight rails ----
      ctx.beginPath();
      for (let i = 0; i < L; i++) {
        const x = this.laneX(i);
        ctx.moveTo(x - this.gauge / 2, -10); ctx.lineTo(x - this.gauge / 2, H + 10);
        ctx.moveTo(x + this.gauge / 2, -10); ctx.lineTo(x + this.gauge / 2, H + 10);
      }
      this.railStroke(ctx, C.rail);

      // ---- crossing pieces ----
      const drawSet = (set, tieCol, railCol) => {
        if (!set.length) return;
        ctx.beginPath();
        set.forEach(cv => {
          let acc = 0, next = g / 2;
          for (let i = 1; i < cv.pts.length; i++) {
            const p0 = cv.pts[i - 1], p1 = cv.pts[i];
            const seg = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            while (acc + seg >= next) {
              const f = (next - acc) / seg;
              const x = p0.x + (p1.x - p0.x) * f, y = p0.y + (p1.y - p0.y) * f;
              const nx = p0.nx, ny = p0.ny;
              ctx.moveTo(x - nx * half, y - ny * half); ctx.lineTo(x + nx * half, y + ny * half);
              next += g;
            }
            acc += seg;
          }
        });
        this.doubleStroke(ctx, this.tieH, tieCol, true);
        ctx.beginPath();
        set.forEach(cv => { this.polyline(ctx, cv.pts, -this.gauge / 2); this.polyline(ctx, cv.pts, this.gauge / 2); });
        this.railStroke(ctx, railCol);
      };
      ctx.save(); ctx.globalAlpha = 0.6;
      drawSet(curves.filter(c => c.off), C.tieOff, C.rail);
      ctx.restore();
      drawSet(curves.filter(c => !c.off), C.tieX, C.railX);
    }

    polyline(ctx, pts, off) {
      pts.forEach((p, i) => {
        const x = p.x + p.nx * off, y = p.y + p.ny * off;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
    }
    doubleStroke(ctx, w, fill, round) {
      ctx.lineCap = round ? 'round' : 'butt';
      ctx.strokeStyle = C.ink; ctx.lineWidth = w + 4.5 * this.s; ctx.stroke();
      ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke();
      ctx.lineCap = 'butt';
    }
    railStroke(ctx, col) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = C.ink; ctx.lineWidth = 7 * this.s; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3.2 * this.s; ctx.stroke();
    }

    /* switch signals (only in levels with decoy switches) */
    drawSignals(ctx) {
      if (!this.level || !this.level.hasDecoys) return;
      for (let i = this.firstEv; i < this.events.length; i++) {
        const e = this.events[i];
        if (!this.visible(e)) continue;
        const y = this.yOf(e.d) + 14 * this.s;
        e.perm.forEach((to, from) => {
          if (to === from) return;
          const x = this.laneX(from);
          ctx.beginPath(); ctx.arc(x, y, 13 * this.s, 0, Math.PI * 2);
          ctx.fillStyle = e.active ? C.good : C.bad; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
          ctx.beginPath(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * this.s; ctx.lineCap = 'round';
          const r = 5 * this.s;
          if (e.active) { // arrow towards target lane
            const dir = Math.sign(to - from);
            ctx.moveTo(x - r * dir, y + r); ctx.lineTo(x + r * dir, y - r); ctx.lineTo(x + r * dir * 0.1, y - r);
          } else { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
          ctx.stroke(); ctx.lineCap = 'butt';
        });
      }
    }

    /* ---------- carts ---------- */
    drawCarts(ctx) {
      const n = this.base.length;
      const q = this.phase === 'question' || this.phase === 'reveal';
      for (let c = 0; c < n; c++) {
        const p = this.posOf(c, this.travel);
        let y = this.cartY, scale = 1;
        const pop = this.fx.find(f => f.type === 'pop' && f.c === c);
        if (pop) scale = 1 + 0.12 * Math.sin((pop.t / pop.life) * Math.PI);
        const isGold = this.golds.includes(c);
        let glow = null;
        if (this.mode === 'level' && this.hintT > 0 && isGold) glow = C.gold;
        if (this.phase === 'reveal') {
          if (isGold) { glow = C.gold; y -= Math.abs(Math.sin(this.phaseT * 7)) * 10 * Math.max(0, 1 - this.phaseT / 1.6); }
          else if (this.picks.includes(c)) glow = C.bad;
        } else if (this.phase === 'question' && this.picks.includes(c)) glow = C.good;
        this.cart(ctx, p.x, y, p.ang, this.lid[c], isGold, glow, scale);
        if (this.phase === 'reveal' && !isGold && this.picks.includes(c)) this.cross(ctx, p.x, y);
      }
    }

    cart(ctx, x, y, ang, lid, gold, glow, scale) {
      const w = this.cw, h = this.ch, s = this.s;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(scale, scale);
      if (glow) {
        ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 30;
        ctx.beginPath(); rrect(ctx, -w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 16 * s);
        ctx.fillStyle = glow; ctx.fill(); ctx.restore();
      }
      ctx.lineJoin = 'round';
      // wheels
      ctx.fillStyle = C.ink;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
        ctx.beginPath(); rrect(ctx, sx * (w / 2 + 1) - 5 * s, sy * h * 0.3 - 11 * s, 10 * s, 22 * s, 4 * s); ctx.fill();
      });
      // bumpers
      ctx.beginPath(); rrect(ctx, -w * 0.22, -h / 2 - 5 * s, w * 0.44, 10 * s, 3 * s);
      rrect(ctx, -w * 0.22, h / 2 - 5 * s, w * 0.44, 10 * s, 3 * s); ctx.fill();
      // body
      ctx.beginPath(); rrect(ctx, -w / 2, -h / 2, w, h, 13 * s);
      ctx.fillStyle = C.cartRim; ctx.fill(); ctx.lineWidth = 3.4 * s; ctx.strokeStyle = C.ink; ctx.stroke();
      const ix = -w / 2 + 7 * s, iy = -h / 2 + 7 * s, iw = w - 14 * s, ih = h - 14 * s;
      ctx.beginPath(); rrect(ctx, ix, iy, iw, ih, 7 * s);
      ctx.fillStyle = C.cartIn; ctx.fill();
      ctx.save(); ctx.clip();
      if (gold && lid < 1) this.goldBars(ctx, 0, 4 * s, s);
      if (lid > 0) {
        const lh = ih * lid;
        ctx.fillStyle = C.lid; ctx.fillRect(ix, iy, iw, lh);
        ctx.strokeStyle = C.lidLine; ctx.lineWidth = 2.6 * s; ctx.beginPath();
        for (let k = 1; k <= 2; k++) { ctx.moveTo(ix + iw * k / 3, iy); ctx.lineTo(ix + iw * k / 3, iy + lh); }
        ctx.stroke();
        ctx.fillStyle = C.ink; ctx.fillRect(ix, iy + lh - 2.5 * s, iw, 2.5 * s);
        if (lid > 0.85) {
          ctx.beginPath(); rrect(ctx, -11 * s, -4.5 * s, 22 * s, 9 * s, 4.5 * s);
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.2 * s; ctx.strokeStyle = C.ink; ctx.stroke();
        }
      }
      ctx.restore();
      ctx.beginPath(); rrect(ctx, ix, iy, iw, ih, 7 * s);
      ctx.lineWidth = 2.6 * s; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.restore();
    }

    goldBars(ctx, x, y, s) {
      const bar = (bx, by) => {
        ctx.beginPath();
        ctx.moveTo(bx - 11 * s, by + 6 * s); ctx.lineTo(bx + 11 * s, by + 6 * s);
        ctx.lineTo(bx + 8 * s, by - 6 * s); ctx.lineTo(bx - 8 * s, by - 6 * s); ctx.closePath();
        ctx.fillStyle = C.gold; ctx.fill();
        ctx.lineWidth = 2.2 * s; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 5 * s, by - 2 * s); ctx.lineTo(bx + 5 * s, by - 2 * s);
        ctx.strokeStyle = C.goldLite; ctx.lineWidth = 2 * s; ctx.stroke();
      };
      bar(x - 11 * s, y + 9 * s); bar(x + 11 * s, y + 9 * s); bar(x, y - 4 * s);
      // sparkle
      this.sparkle(ctx, x + 16 * s, y - 18 * s, 6 * s);
    }

    sparkle(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fillStyle = C.ink; ctx.fill();
    }

    cross(ctx, x, y) {
      const r = 18 * this.s;
      ctx.save(); ctx.translate(x, y);
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.ink; ctx.lineWidth = 12 * this.s;
      ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); ctx.stroke();
      ctx.strokeStyle = C.bad; ctx.lineWidth = 7 * this.s; ctx.stroke();
      ctx.restore();
    }

    /* ---------- tunnels ---------- */
    drawTunnels(ctx) {
      const s = this.s;
      this.tunnels.forEach((t, idx) => {
        const yTop = this.yOf(t.d1), yBot = this.yOf(t.d0);
        if (yBot < -60 || yTop > this.H + 60) return;
        const x0 = this.laneX(t.l0) - this.sp * 0.52, x1 = this.laneX(t.l1) + this.sp * 0.52;
        const R = G.Levels.rng(idx * 131 + 7);
        // irregular outline
        const pts = [];
        const jag = (n, ax, ay, bx, by) => { for (let i = 0; i < n; i++) { const f = i / n; pts.push([ax + (bx - ax) * f + (R() - 0.5) * 6, ay + (by - ay) * f + (R() - 0.5) * 6]); } };
        jag(6, x0, yTop, x1, yTop); jag(4, x1, yTop, x1, yBot); jag(6, x1, yBot, x0, yBot); jag(4, x0, yBot, x0, yTop);
        const path = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
        // shadow
        ctx.save(); ctx.translate(0, 6); path(); ctx.fillStyle = 'rgba(46,42,48,0.18)'; ctx.fill(); ctx.restore();
        path(); ctx.fillStyle = C.tunnel; ctx.fill();
        // sand waves
        ctx.save(); ctx.clip();
        ctx.strokeStyle = C.tunnelLine; ctx.lineWidth = 2.4; ctx.beginPath();
        for (let yy = yTop + 22; yy < yBot - 10; yy += 26) {
          ctx.moveTo(x0, yy);
          for (let xx = x0; xx <= x1; xx += 24) {
            ctx.quadraticCurveTo(xx + 6, yy - 5, xx + 12, yy);
            ctx.quadraticCurveTo(xx + 18, yy + 5, xx + 24, yy);
          }
        }
        ctx.stroke(); ctx.restore();
        path(); ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.stroke();
        // portals
        ctx.fillStyle = C.tunnelDoor;
        for (let l = t.l0; l <= t.l1; l++) {
          const x = this.laneX(l);
          ctx.fillRect(x - this.tieLen * 0.42, yTop - 2, this.tieLen * 0.84, 12 * s);
          ctx.fillRect(x - this.tieLen * 0.42, yBot - 10 * s, this.tieLen * 0.84, 12 * s);
        }
        // decorations on the roof
        if (x1 - x0 > 150) this.palm(ctx, x1 - 30, yBot - 30 - (yBot - yTop) * 0.2, 16, idx);
        this.rock(ctx, x0 + 28, yTop + 34, 9, idx * 0.3);
        // label
        this.pill(ctx, (x0 + x1) / 2, (yTop + yBot) / 2, t.label, 26);
      });
    }

    pill(ctx, x, y, text, size) {
      ctx.font = `900 ${size}px Cairo, sans-serif`;
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(text).width + 28, h = size + 18;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.04);
      ctx.beginPath(); rrect(ctx, -w / 2, -h / 2 + 4, w, h, 10); ctx.fillStyle = C.ink; ctx.fill();
      ctx.beginPath(); rrect(ctx, -w / 2, -h / 2, w, h, 10); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.fillStyle = C.ink; ctx.fillText(text, 0, 2);
      ctx.restore();
    }

    /* ---------- question overlay: lane badges + countdown ---------- */
    drawOverlay(ctx) {
      if (this.mode !== 'level') return;
      // hint pin above gold carts (visible even in tunnels)
      if (this.hintT > 0) {
        const a = Math.min(1, this.hintT * 2);
        this.golds.forEach(g => {
          const p = this.posOf(g, this.travel);
          ctx.save(); ctx.globalAlpha = a;
          const y = this.cartY - this.ch / 2 - 40 - Math.sin(this.hintT * 10) * 6;
          ctx.beginPath(); ctx.moveTo(p.x, y + 26); ctx.lineTo(p.x - 14, y + 4); ctx.lineTo(p.x + 14, y + 4); ctx.closePath();
          ctx.fillStyle = C.gold; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.restore();
        });
      }
      if (this.phase !== 'question' && this.phase !== 'reveal') return;
      const L = this.L;
      ctx.font = `900 ${Math.round(26 * this.s)}px Cairo, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < L; i++) {
        const x = this.laneX(i), y = this.cartY - this.ch / 2 - 30 * this.s;
        ctx.beginPath(); ctx.arc(x, y, 19 * this.s, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.fillStyle = C.ink; ctx.fillText(String(L - i), x, y + 2);
      }
      if (this.phase === 'question') {
        const lv = this.level;
        const left = Math.max(0, this.answerTime - this.qTime);
        const cx = W / 2, cy = this.cartY - this.ch / 2 - 190, r = 52;
        const pulse = left <= 3 ? 1 + 0.06 * Math.sin(this.qTime * 18) : 1;
        ctx.save(); ctx.translate(cx, cy); ctx.scale(pulse, pulse);
        ctx.beginPath(); ctx.arc(0, 5, r, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r - 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / this.answerTime));
        ctx.strokeStyle = left <= 2 ? C.bad : C.lid; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
        ctx.font = '900 54px Cairo, sans-serif'; ctx.fillStyle = C.ink;
        ctx.fillText(String(Math.ceil(left)), 0, 4);
        ctx.restore();
      }
    }

    drawFx(ctx) {
      this.fx.forEach(f => {
        if (f.type !== 'spark') return;
        const t = f.t;
        const x = f.x + f.vx * t, y = f.y + f.vy * t + 380 * t * t;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t / f.life);
        this.sparkle(ctx, x, y, f.r * 1.4);
        ctx.beginPath(); ctx.arc(x, y, f.r * 0.6, 0, Math.PI * 2); ctx.fillStyle = f.color; ctx.fill();
        ctx.restore();
      });
    }
  }

  G.Game = Game;
  G.GameColors = C;
})(window);
