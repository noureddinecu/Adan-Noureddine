/* =========================================================================
 * عربة الذهب — Level system
 * -------------------------------------------------------------------------
 * Every level is built deterministically from a seed + a parameter set.
 * - levelParams(n)   : difficulty parameters for level n (tier based)
 * - buildLevel(n)    : full level (lanes, gold carts, swap events, tunnels)
 *
 * HOW TO ADD LEVELS
 *  1. Raise LEVEL_COUNT (e.g. 120). Levels above 100 continue the "خبير"
 *     curve automatically.
 *  2. Or hand-craft a level in CUSTOM_LEVELS below (overrides generator):
 *       CUSTOM_LEVELS[101] = {
 *         lanes: 5, golds: [2], speed: [380, 520], answerTime: 6,
 *         events: [ {type:'swap', a:1}, {type:'multi', pairs:[0,3]},
 *                   {type:'jump', a:0}, {type:'swap', a:3, tunnel:true},
 *                   {type:'swap', a:2, decoy:true}, {type:'rotate', dir:1} ]
 *       };
 * ========================================================================= */
(function (G) {
  'use strict';

  const LEVEL_COUNT = 100;

  const TIERS = [
    { from: 1,  to: 10,  id: 'easy',   name: 'سهل',      color: '#5CC48F' },
    { from: 11, to: 25,  id: 'medium', name: 'متوسط',    color: '#4FB3E8' },
    { from: 26, to: 50,  id: 'hard',   name: 'صعب',      color: '#9C8CF2' },
    { from: 51, to: 75,  id: 'pro',    name: 'احترافي',  color: '#F29B4B' },
    { from: 76, to: 9999, id: 'expert', name: 'خبير',    color: '#EF5F6B' }
  ];

  const CHAPTER_NAMES = [
    'أول الطريق', 'محطة الصحراء', 'تقاطعات الوادي', 'أنفاق الجبل', 'سكة النخيل',
    'المفاتيح الخادعة', 'قطار الليل', 'منجم الذهب', 'العاصفة الرملية', 'كنز الأساطير'
  ];

  /** Hand-crafted overrides — see header. */
  const CUSTOM_LEVELS = {
    1: { lanes: 3, golds: [1], speed: [230, 250], answerTime: 9, preview: 2.6,
         events: [{ type: 'swap', a: 1 }, { type: 'swap', a: 0 }, { type: 'swap', a: 1 }, { type: 'swap', a: 0 }] },
    2: { lanes: 3, golds: [0], speed: [240, 260], answerTime: 9, preview: 2.4,
         events: [{ type: 'swap', a: 0 }, { type: 'swap', a: 1 }, { type: 'swap', a: 0 }, { type: 'swap', a: 1 }] }
  };

  /* ---------------- seeded RNG (mulberry32) ---------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function tierOf(n) { return TIERS.find(t => n >= t.from && n <= t.to) || TIERS[TIERS.length - 1]; }
  function chapterOf(n) { return Math.floor((n - 1) / 10); }
  function chapterName(c) { return CHAPTER_NAMES[c] || ('الفصل ' + (c + 1)); }

  /* ---------------- difficulty parameters ---------------- */
  function levelParams(n) {
    const t = clamp((n - 1) / 99, 0, 1.3);          // 0 .. 1 (and beyond for >100)
    const tier = tierOf(n);
    let lanes;
    if (n <= 3) lanes = 3;
    else if (n <= 12) lanes = 4;
    else if (n <= 55) lanes = 5;
    else if (n <= 80) lanes = (n % 3 === 0) ? 6 : 5;
    else lanes = 6;

    const p = {
      n, tier: tier.id, lanes,
      events: Math.round(3 + n * 0.19),
      speed: [Math.round(lerp(240, 560, t)), Math.round(lerp(270, 760, t))],
      gap: [lerp(300, 40, Math.min(t, 1)), lerp(420, 120, Math.min(t, 1))],
      eventLen: lerp(330, 250, Math.min(t, 1)),
      answerTime: +lerp(9, 4.5, Math.min(t, 1)).toFixed(1),
      preview: +lerp(2.6, 1.4, Math.min(t, 1)).toFixed(1),
      // feature probabilities
      multi: n >= 11 ? lerp(0.15, 0.45, t) : 0,
      jump: n >= 30 ? lerp(0.1, 0.3, t) : 0,
      rotate: n >= 51 ? lerp(0.08, 0.2, t) : 0,
      decoy: n >= 26 ? lerp(0.12, 0.3, t) : 0,
      tunnels: n >= 8 ? Math.min(8, Math.floor(1 + (n - 8) / 11)) : 0,
      emptyTunnels: n >= 18 ? 1 + Math.floor(n / 40) : 0,
      varSpeed: n >= 40,
      golds: (n >= 60 && n % 5 === 0) ? 2 : 1,
      focus: lerp(0.75, 0.5, Math.min(t, 1))   // chance an event touches a gold cart
    };
    // Chapter finales (10, 20, ...) are a bit spicier
    if (n % 10 === 0) { p.events += 2; p.speed[1] += 30; }
    return p;
  }

  /* ---------------- permutations ---------------- */
  function idPerm(L) { return Array.from({ length: L }, (_, i) => i); }
  function swapPerm(L, a, b) { const p = idPerm(L); p[a] = b; p[b] = a; return p; }
  function rotatePerm(L, dir) { return idPerm(L).map(i => (i + dir + L) % L); }

  function makeEvent(L, spec) {
    let perm;
    switch (spec.type) {
      case 'swap': perm = swapPerm(L, spec.a, spec.a + 1); break;
      case 'jump': perm = swapPerm(L, spec.a, spec.a + 2); break;
      case 'multi': perm = idPerm(L); spec.pairs.forEach(a => { perm[a] = a + 1; perm[a + 1] = a; }); break;
      case 'rotate': perm = rotatePerm(L, spec.dir || 1); break;
      case 'perm': perm = spec.perm.slice(); break;
      default: perm = idPerm(L);
    }
    return { kind: spec.type, perm, active: !spec.decoy, tunnel: !!spec.tunnel };
  }

  /* ---------------- generator ---------------- */
  function generateSpecs(p, R, goldStart) {
    const L = p.lanes;
    const specs = [];
    let golds = goldStart.slice();
    const pick = arr => arr[Math.floor(R() * arr.length)];
    for (let i = 0; i < p.events; i++) {
      const roll = R();
      let spec;
      const focusGold = R() < p.focus;
      const g = pick(golds);
      const adjFor = lane => {                     // a swap index that touches `lane`
        const opts = [];
        if (lane > 0) opts.push(lane - 1);
        if (lane < L - 1) opts.push(lane);
        return pick(opts);
      };
      if (roll < p.rotate) {
        spec = { type: 'rotate', dir: R() < 0.5 ? 1 : -1 };
      } else if (roll < p.rotate + p.jump && L >= 3) {
        let a = focusGold ? clamp(g - (R() < 0.5 ? 0 : 2), 0, L - 3) : Math.floor(R() * (L - 2));
        spec = { type: 'jump', a };
      } else if (roll < p.rotate + p.jump + p.multi && L >= 4) {
        // disjoint adjacent pairs
        const pairs = [];
        let a = focusGold ? adjFor(g) : Math.floor(R() * (L - 1));
        pairs.push(a);
        for (let k = 0; k < L - 1; k++) {
          if (pairs.every(q => Math.abs(q - k) >= 2) && R() < 0.6) pairs.push(k);
        }
        pairs.sort((x, y) => x - y);
        spec = pairs.length > 1 ? { type: 'multi', pairs } : { type: 'swap', a: pairs[0] };
      } else {
        spec = { type: 'swap', a: focusGold ? adjFor(g) : Math.floor(R() * (L - 1)) };
      }
      // never two identical consecutive events (looks repetitive / cancels out)
      const prev = specs[specs.length - 1];
      if (prev && JSON.stringify(prev) === JSON.stringify(spec)) { i--; continue; }
      if (i > 0 && R() < p.decoy) spec.decoy = true;
      specs.push(spec);
      const ev = makeEvent(L, spec);
      if (ev.active) golds = golds.map(x => ev.perm[x]);
    }
    return specs;
  }

  /**
   * Build the playable level.
   * World axis: distance `d` grows "forward" (up the screen). Carts sit at d = travel.
   */
  const SIG = {};
  function sigOf(k) { if (!(k in SIG)) buildLevel(k); return SIG[k]; }

  function buildLevel(n) {
    const base = levelParams(n);
    const custom = CUSTOM_LEVELS[n];
    const p = Object.assign({}, base, custom || {});
    const L = p.lanes;
    // Re-seed until this level's track layout differs from the 10 previous levels
    let R, golds, specs, attempt = 0;
    for (;;) {
      R = rng(n * 7919 + 1301 + attempt * 104729);
      golds = p.golds;
      if (typeof golds === 'number') {
        const set = new Set();
        while (set.size < golds) set.add(Math.floor(R() * L));
        golds = [...set].sort();
      }
      specs = (custom && custom.events) ? custom.events : generateSpecs(p, R, golds);
      const sig = L + ':' + golds.join(',') + ':' + JSON.stringify(specs);
      let clash = false;
      if (!custom && attempt < 20) for (let k = Math.max(1, n - 10); k < n; k++) if (sigOf(k) === sig) clash = true;
      if (!clash) { SIG[n] = sig; break; }
      attempt++;
    }


    // ---- layout events in world space ----
    const START = 760;                       // first event starts above the screen
    let d = START;
    const events = [];
    specs.forEach((s, i) => {
      const ev = makeEvent(L, s);
      // longer track pieces for jumps / rotations so the curves stay smooth
      const spanMax = Math.max(...ev.perm.map((to, from) => Math.abs(to - from)));
      ev.len = p.eventLen * (spanMax >= 2 ? 1.35 : 1) * (spanMax >= 3 ? 1.2 : 1);
      ev.d = d;
      ev.index = i;
      events.push(ev);
      d += ev.len + lerp(p.gap[0], p.gap[1], R());
    });

    // ---- tunnels ----
    const tunnels = [];
    if (!custom || !custom.events) {
      // pick events to hide (never the very first one)
      const cand = events.filter(e => e.index > 0 && !e.tunnel);
      for (let k = 0; k < p.tunnels && cand.length; k++) {
        const e = cand.splice(Math.floor(R() * cand.length), 1)[0];
        e.tunnel = true;
      }
    }
    events.forEach(e => {
      if (!e.tunnel) return;
      const moved = e.perm.map((to, from) => (to !== from ? from : -1)).filter(x => x >= 0);
      let l0 = Math.min(...moved), l1 = Math.max(...moved);
      if (!isFinite(l0)) { l0 = 0; l1 = 1; }
      // cover the middle of the crossing; the entry & exit stay visible (fair play)
      const cover = 0.52;
      tunnels.push({ d0: e.d + e.len * (0.5 - cover / 2), d1: e.d + e.len * (0.5 + cover / 2), l0, l1, event: e.index });
    });
    // empty tunnels over straight track (pure suspense, carts keep their lanes)
    for (let k = 0; k < (custom ? 0 : p.emptyTunnels); k++) {
      for (let tries = 0; tries < 12; tries++) {
        const i = 1 + Math.floor(R() * Math.max(1, events.length - 1));
        const a = events[i - 1], b = events[i];
        if (!b) break;
        const gap = b.d - (a.d + a.len);
        if (gap < 170) continue;
        const l0 = Math.floor(R() * (L - 1));
        const l1 = Math.min(L - 1, l0 + 1 + Math.floor(R() * 2));
        const mid = a.d + a.len + gap / 2;
        tunnels.push({ d0: mid - 70, d1: mid + 70, l0, l1, event: -1 });
        break;
      }
    }
    tunnels.sort((x, y) => x.d0 - y.d0);
    tunnels.forEach((t, i) => { t.label = 'نفق ' + (i + 1); });

    // ---- final answer ----
    let finalGolds = golds.slice();
    events.forEach(e => { if (e.active) finalGolds = finalGolds.map(x => e.perm[x]); });

    const last = events[events.length - 1];
    const endD = last.d + last.len + 460;

    // tags (shown on the intro card)
    const tags = [];
    if (events.some(e => e.kind === 'multi')) tags.push('تبديل مزدوج');
    if (tunnels.length) tags.push('أنفاق');
    if (events.some(e => !e.active)) tags.push('مفاتيح خادعة');
    if (events.some(e => e.kind === 'jump')) tags.push('قفزات');
    if (events.some(e => e.kind === 'rotate')) tags.push('دوران');
    if (golds.length > 1) tags.push('ذهبتان');
    if (p.varSpeed) tags.push('سرعة متغيرة');

    return {
      n, lanes: L, tier: tierOf(n), chapter: chapterOf(n),
      golds, finalGolds, events, tunnels, endD,
      speed: p.speed, varSpeed: !!p.varSpeed,
      answerTime: p.answerTime, preview: p.preview,
      hasDecoys: events.some(e => !e.active), tags
    };
  }

  G.Levels = {
    LEVEL_COUNT, TIERS, tierOf, chapterOf, chapterName, levelParams, buildLevel, rng, CUSTOM_LEVELS
  };
})(window);
