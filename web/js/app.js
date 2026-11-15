/* =========================================================================
 * عربة الذهب — app / UI controller
 * ========================================================================= */
(function (G) {
  'use strict';
  const $ = id => document.getElementById(id);
  const Lv = G.Levels, Store = G.Store, Sfx = G.Sfx;
  const VERSION = '2.0.0';
  const INK = '#2E2A30';

  /* ---------------- inline SVG icons ---------------- */
  const S = (body, vb) => `<svg viewBox="${vb || '0 0 24 24'}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICONS = {
    star: S('<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="#FFD23A"/>'),
    starOff: S('<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="#E6E2DC" stroke="#B9B2B5"/>'),
    coin: S('<circle cx="12" cy="12" r="9" fill="#FFD23A"/><circle cx="12" cy="12" r="5.2" stroke-width="1.8"/>'),
    play: S('<path d="M7 4.5v15l12.5-7.5z" fill="#fff"/>'),
    grid: S('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="#A193F6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="#fff"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="#fff"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" fill="#FFD23A"/>'),
    trophy: S('<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#FFD23A"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3M8 20h8M9.5 17h5v3h-5z"/>'),
    gear: S('<circle cx="12" cy="12" r="3.2" fill="#fff"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/><circle cx="12" cy="12" r="6.3"/>'),
    help: S('<circle cx="12" cy="12" r="9.2" fill="#7DD0F2"/><path d="M9.3 9.4a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.8v.6"/><circle cx="12" cy="17.2" r=".6" fill="' + INK + '"/>'),
    soundOn: S('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="#FFD23A"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    soundOff: S('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="#E6E2DC"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
    back: S('<path d="M15 5l-7 7 7 7"/>'),
    pause: S('<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="#A193F6"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="#A193F6"/>'),
    retry: S('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.5H15"/>'),
    home: S('<path d="M4 11.5L12 4l8 7.5V20h-5.5v-5h-5v5H4z" fill="#7DD0F2"/>'),
    eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="#fff"/><circle cx="12" cy="12" r="3.2" fill="#FFD23A"/>'),
    lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="#D6D0C6" stroke="#A9A2A6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#A9A2A6"/>'),
    gift: S('<rect x="3.5" y="9" width="17" height="11.5" rx="1.6" fill="#EF5F6B"/><rect x="2.5" y="6.5" width="19" height="4" rx="1.2" fill="#FFD23A"/><path d="M12 6.5v14M12 6.5C10 2.5 6.5 3.5 8 6.5M12 6.5c2-4 5.5-3 4 0"/>'),
    trash: S('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" fill="#FDE1E3"/>'),
    gold: S('<path d="M3.5 20.5l1.6-5h5.8l1.6 5zM12.5 20.5l1.6-5h5.8l1.6 5zM8 14.5l1.6-5h5.8l1.6 5z" fill="#FFD23A" stroke-width="1.8"/><path d="M19.5 3.5v4M17.5 5.5h4" stroke-width="1.6"/>')
  };
  const ico = n => `<span class="ico">${ICONS[n]}</span>`;
  function fillIcons(root) {
    (root || document).querySelectorAll('.ico[data-i]').forEach(el => { el.innerHTML = ICONS[el.dataset.i] || ''; });
  }

  const LOGO = `<svg viewBox="0 0 120 120">
    <g stroke="${INK}" stroke-width="4" stroke-linejoin="round">
      <rect x="22" y="40" width="10" height="24" rx="4" fill="${INK}"/><rect x="88" y="40" width="10" height="24" rx="4" fill="${INK}"/>
      <rect x="22" y="76" width="10" height="24" rx="4" fill="${INK}"/><rect x="88" y="76" width="10" height="24" rx="4" fill="${INK}"/>
      <rect x="28" y="22" width="64" height="88" rx="14" fill="#7DD0F2"/>
      <rect x="36" y="30" width="48" height="72" rx="8" fill="#DAD8D4"/>
      <path d="M38 88l3-11h16l3 11zM60 88l3-11h16l3 11zM49 75l3-11h16l3 11z" fill="#FFD23A" stroke-width="3"/>
      <path d="M44 81h8M66 81h8M55 68h8" stroke="#FFF0A6" stroke-width="2.5"/>
    </g>
    <path d="M80 36q0 9 9 9q-9 0-9 9q0-9-9-9q9 0 9-9z" fill="${INK}"/>
  </svg>`;
  const TROPHY = `<svg viewBox="0 0 120 120"><g stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M36 18h48v26a24 24 0 0 1-48 0z" fill="#FFD23A"/><path d="M36 26H20a16 16 0 0 0 18 20M84 26h16a16 16 0 0 1-18 20" fill="none"/>
    <path d="M60 68v14" /><rect x="42" y="82" width="36" height="12" rx="3" fill="#A193F6"/><rect x="34" y="94" width="52" height="12" rx="3" fill="#7DD0F2"/>
    <path d="M60 30l4 8 9 1.3-6.5 6.3 1.5 8.9-8-4.2-8 4.2 1.5-8.9-6.5-6.3 9-1.3z" fill="#fff" stroke-width="3"/></g></svg>`;

  /* ---------------- native bridge ---------------- */
  const Native = window.AndroidBridge || null;
  G.haptic = pattern => {
    if (!Store.data.settings.vibrate) return;
    try {
      if (Native && Native.vibrate) Native.vibrate(Array.isArray(pattern) ? pattern[0] : pattern);
      else if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* ignore */ }
  };

  /* ---------------- state ---------------- */
  let game = null;
  let screen = 'splash';
  let modal = null;
  let cur = null;          // current level object
  let attempts = 0;
  let pendingChapter = null;
  let lastOutcome = null;

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    screen = id;
  }
  function openModal(id) { closeModal(); modal = id; $(id).classList.add('active'); }
  function closeModal() { if (modal) $(modal).classList.remove('active'); modal = null; }

  const fmt = n => n.toLocaleString('en-US');

  /* ---------------- menu ---------------- */
  function nextPlayable() {
    const d = Store.data;
    for (let n = 1; n <= d.unlocked; n++) if (!d.levels[n]) return n;
    return Math.min(d.unlocked, Lv.LEVEL_COUNT);
  }

  function refreshMenu() {
    const d = Store.data;
    $('mStars').textContent = Store.totalStars();
    $('mStars').nextElementSibling.textContent = '/' + Lv.LEVEL_COUNT * 3;
    $('mPoints').textContent = fmt(Store.totalPoints());
    const n = nextPlayable();
    $('mPlayLvl').textContent = 'المرحلة ' + n;
    const done = Object.keys(d.levels).length;
    const pct = Math.round(done / Lv.LEVEL_COUNT * 100);
    $('mPct').textContent = done + '/' + Lv.LEVEL_COUNT;
    $('mBar').style.width = pct + '%';
    const c = Lv.chapterOf(n), t = Lv.tierOf(n);
    $('mTier').textContent = 'الفصل ' + (c + 1) + ' · ' + Lv.chapterName(c) + ' · ' + t.name;
    refreshSoundBtns();
  }

  function refreshSoundBtns() {
    const on = Store.data.settings.sound;
    ['mSound', 'pSound'].forEach(id => { const b = $(id); b.innerHTML = ico(on ? 'soundOn' : 'soundOff'); b.classList.toggle('off', !on); });
    $('sSound').checked = on;
  }
  function toggleSound() {
    const s = Store.data.settings; s.sound = !s.sound; Store.save();
    Sfx.setEnabled(s.sound); if (s.sound) Sfx.click();
    refreshSoundBtns();
  }

  function goMenu() {
    closeModal();
    Sfx.stopRumble();
    if (game.mode !== 'demo') game.startDemo();
    refreshMenu();
    show('menu');
  }

  /* ---------------- level select ---------------- */
  function buildLevelList() {
    const d = Store.data, list = $('levelList');
    $('lStars').textContent = Store.totalStars();
    const chapters = Math.ceil(Lv.LEVEL_COUNT / 10);
    let html = '';
    for (let c = 0; c < chapters; c++) {
      const from = c * 10 + 1, to = Math.min(Lv.LEVEL_COUNT, from + 9);
      const tier = Lv.tierOf(from), tierEnd = Lv.tierOf(to);
      let cs = 0;
      for (let n = from; n <= to; n++) cs += (d.levels[n] || {}).stars || 0;
      const tierTxt = tier.id === tierEnd.id ? tier.name : tier.name + ' ← ' + tierEnd.name;
      html += `<div class="chapter-block"><div class="card chapter-head">
        <div class="num" style="background:${tier.color}">${c + 1}</div>
        <div class="nm">${Lv.chapterName(c)}<small>المراحل ${from}–${to} · ${tierTxt}</small></div>
        <div class="cs">${ico('star')}<b>${cs}/${(to - from + 1) * 3}</b></div>
        <span class="gift ${d.chaptersRewarded[c] ? 'got' : ''}">${ICONS.gift}</span>
      </div><div class="grid10">`;
      for (let n = from; n <= to; n++) {
        const st = d.levels[n];
        const locked = n > d.unlocked;
        const isCur = !locked && !st && n === nextPlayable();
        let inner;
        if (locked) inner = ico('lock');
        else {
          const k = st ? st.stars : 0;
          inner = `<span>${n}</span><span class="mini">${[0, 1, 2].map(i => ico(i < k ? 'star' : 'starOff')).join('')}</span>`;
        }
        html += `<button class="lvl ${locked ? 'locked' : ''} ${isCur ? 'current' : ''} ${st ? 'done' : ''}" data-n="${n}" style="${!locked && !st && !isCur ? '' : ''}">${inner}</button>`;
      }
      html += '</div></div>';
    }
    list.innerHTML = html;
    const curBtn = list.querySelector('.lvl.current') || list.querySelector(`.lvl[data-n="${Math.min(d.unlocked, Lv.LEVEL_COUNT)}"]`);
    if (curBtn) setTimeout(() => curBtn.scrollIntoView({ block: 'center' }), 30);
  }

  /* ---------------- achievements ---------------- */
  function buildAchList() {
    const d = Store.data;
    const got = Store.ACH.filter(a => d.achievements[a.id]).length;
    $('aCount').textContent = got + '/' + Store.ACH.length;
    $('achList').innerHTML = Store.ACH.map(a => {
      const ok = !!d.achievements[a.id];
      return `<div class="card ach ${ok ? '' : 'locked'}"><div class="badge">${ico(ok ? 'trophy' : 'lock')}</div>
        <div class="t">${a.title}<small>${a.desc}</small></div><div class="rw">+${fmt(a.reward)}</div></div>`;
    }).join('');
  }

  function toast(a) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="badge">${ico('trophy')}</div><div><b>إنجاز جديد: ${a.title}</b><small>${a.desc} · +${fmt(a.reward)} نقطة</small></div>`;
    $('toasts').appendChild(el);
    Sfx.achievement();
    setTimeout(() => el.remove(), 2400);
  }
  function toastQueue(list) { list.forEach((a, i) => setTimeout(() => toast(a), 900 + i * 2450)); }

  /* ---------------- gameplay ---------------- */
  const TIPS = {
    tunnel: 'الأنفاق تخفي العربات — راقب اتجاه السكة عند الدخول والخروج.',
    multi: 'تبديل مزدوج: أكثر من تقاطع في نفس اللحظة!',
    decoy: 'الإشارة الحمراء ✕ تعني أن المفتاح مقفل والعربة تكمل مستقيم.',
    jump: 'قفزات: العربة تعبر فوق سكة كاملة لتصل لمسار أبعد.',
    rotate: 'دوران: كل العربات تنتقل مساراً واحداً في نفس الوقت.',
    double: 'ذهبتان! اختر العربتين قبل انتهاء الوقت.'
  };
  function firstTipFor(lv) {
    const seen = Store.data.tipsSeen || (Store.data.tipsSeen = {});
    const has = {
      double: lv.golds.length > 1,
      rotate: lv.events.some(e => e.kind === 'rotate'),
      jump: lv.events.some(e => e.kind === 'jump'),
      decoy: lv.hasDecoys,
      multi: lv.events.some(e => e.kind === 'multi'),
      tunnel: lv.tunnels.length > 0
    };
    for (const k of Object.keys(has)) if (has[k] && !seen[k]) { seen[k] = 1; Store.save(); return TIPS[k]; }
    return '';
  }

  function play(n, keepAttempts) {
    n = Math.max(1, Math.min(n, Lv.LEVEL_COUNT));
    if (n > Store.data.unlocked) return;
    closeModal();
    if (!keepAttempts || !cur || cur.n !== n) attempts = 0;
    cur = Lv.buildLevel(n);
    const t = cur.tier;
    $('hLevel').textContent = 'المرحلة ' + n;
    $('hTier').textContent = t.name;
    $('hTier').style.background = t.color;
    const two = cur.golds.length > 1;
    $('iTitle').innerHTML = two ? '<span class="hl">الذهب</span> في عربتين!' : '<span class="hl">الذهب</span> في وحدة من العربات';
    $('iSub').textContent = two ? 'تابعهم لين النهاية' : 'تابعه لين النهاية';
    $('iTags').innerHTML = cur.tags.map(x => `<span>${x}</span>`).join('');
    $('iTip').textContent = firstTipFor(cur);
    $('hIntro').classList.remove('hide');
    setCard('تابع الذهب', '');
    $('hBar').style.width = '0%';
    refreshHint();
    show('hud');
    game.startLevel(cur, { relaxed: Store.data.settings.relaxed });
  }

  function setCard(text, cls) {
    $('hText').textContent = text;
    $('hCard').className = 'track-card card ' + (cls || '');
  }
  function refreshHint() {
    const h = Store.data.hints;
    $('hHints').textContent = h;
    $('hHint').classList.toggle('disabled', h <= 0 || !game || game.phase !== 'running' || game.usedHint);
  }

  const hooks = {
    onPhase(p, lv) {
      if (G.Live && G.Live.active) return G.Live.onPhase(p, lv);
      if (!lv) return;
      if (p === 'closing') $('hIntro').classList.add('hide');
      if (p === 'running') refreshHint();
      if (p === 'question') {
        setCard(lv.golds.length > 1 ? 'وين الذهبتين الحين؟' : 'وين الذهب الحين؟', 'question');
        refreshHint();
      }
      if (p === 'reveal') {
        const fin = game.finalLanes();
        const nums = lv.golds.map(g => lv.lanes - fin[g]).sort((a, b) => a - b);
        const txt = nums.length > 1 ? 'الذهب في العربتين ' + nums.join(' و ') : 'الذهب في العربة ' + nums[0];
        setCard(txt, game.result.win ? 'ok question' : 'bad question');
      }
    },
    onProgress(f) { if (G.Live && G.Live.active) return G.Live.onProgress(f); $('hBar').style.width = (f * 100).toFixed(1) + '%'; },
    onResult(r) { if (G.Live && G.Live.active) return G.Live.onResult(r); showResult(r); }
  };

  function showResult(r) {
    attempts++;
    const lv = cur;
    const out = Store.recordResult(lv, Object.assign({}, r, { firstTry: attempts === 1 }));
    lastOutcome = out;
    pendingChapter = out.chapterReward;
    const fin = game.finalLanes();
    const nums = lv.golds.map(g => lv.lanes - fin[g]).sort((a, b) => a - b);

    $('rTitle').textContent = r.win ? (out.stars === 3 ? 'ممتاز!' : out.stars === 2 ? 'أحسنت!' : 'نجحت!') : (r.timeout ? 'انتهى الوقت!' : 'للأسف!');
    $('rSub').textContent = nums.length > 1 ? 'الذهب كان في' : 'الذهب كان في';
    $('rCart').textContent = nums.length > 1 ? 'العربتين ' + nums.join(' و ') : 'العربة ' + nums[0];
    const st = $('rStars');
    st.style.display = r.win ? 'flex' : 'none';
    st.querySelectorAll('i').forEach((el, i) => {
      el.className = ''; el.innerHTML = ICONS[i < out.stars ? 'star' : 'starOff'];
      if (r.win) setTimeout(() => { el.className = i < out.stars ? 'on' : 'off'; if (i < out.stars) Sfx.star(i); }, 350 + i * 260);
    });
    $('rPoints').textContent = r.win ? `+${fmt(out.score)} نقطة` + (out.newBest && attempts > 1 ? ' · رقم جديد!' : '') : 'حاول مرة ثانية — راقب التقاطعات جيداً';
    $('rPoints').style.color = r.win ? '' : 'var(--muted)';
    const isLast = lv.n >= Lv.LEVEL_COUNT;
    $('rNext').style.display = r.win && !isLast ? '' : 'none';
    $('rRetry').classList.toggle('primary', !r.win);
    openModal('result');
    drawLadder($('ladder'), lv, r.win);
    toastQueue(out.achievements);
  }

  /* ---------------- ladder (path explanation) ---------------- */
  function drawLadder(cv, lv, win) {
    const ctx = cv.getContext('2d');
    const Wd = cv.width, Hd = cv.height;
    const L = lv.lanes, m = 50, top = 42, bottom = Hd - 26;
    const xOf = i => m + i * (Wd - 2 * m) / (L - 1);
    const evs = lv.events;
    const rowH = (bottom - top - 20) / evs.length;
    const yOf = k => bottom - 10 - (k + 0.5) * rowH;

    // build the gold paths (start bottom, end top)
    const paths = lv.golds.map(g => {
      let lane = g;
      const pts = [[xOf(lane), bottom]];
      evs.forEach((e, k) => {
        const to = e.active ? e.perm[lane] : lane;
        if (to !== lane) { pts.push([xOf(lane), yOf(k)]); pts.push([xOf(to), yOf(k)]); lane = to; }
      });
      pts.push([xOf(lane), top + 4]);
      return pts;
    });
    let len = 0;
    const totalLen = pts => pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
    const T0 = performance.now();
    const DUR = 1500;

    function frame(now) {
      const f = Math.min(1, (now - T0) / DUR);
      ctx.clearRect(0, 0, Wd, Hd);
      ctx.font = '900 22px Cairo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < L; i++) {
        ctx.fillStyle = INK; ctx.fillText(String(L - i), xOf(i), 16);
        ctx.strokeStyle = '#DAD6CF'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(xOf(i), top); ctx.lineTo(xOf(i), bottom); ctx.stroke();
      }
      // bars
      evs.forEach((e, k) => {
        const iv = [];
        e.perm.forEach((to, from) => { if (to !== from) iv.push([Math.min(to, from), Math.max(to, from)]); });
        iv.sort((a, b) => a[0] - b[0]);
        const merged = [];
        iv.forEach(v => { const l = merged[merged.length - 1]; if (l && v[0] < l[1]) l[1] = Math.max(l[1], v[1]); else merged.push(v.slice()); });
        merged.forEach(([a, b]) => {
          const y = yOf(k);
          ctx.lineCap = 'round';
          ctx.strokeStyle = INK; ctx.lineWidth = Math.min(16, rowH * 0.7) + 3; ctx.setLineDash(e.active ? [] : [6, 8]);
          ctx.globalAlpha = e.active ? 1 : 0.35;
          ctx.beginPath(); ctx.moveTo(xOf(a) - 12, y); ctx.lineTo(xOf(b) + 12, y); ctx.stroke();
          ctx.strokeStyle = '#F8D9C3'; ctx.lineWidth = Math.min(16, rowH * 0.7); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
        });
      });
      // gold paths
      paths.forEach(pts => {
        const tl = totalLen(pts), lim = tl * f;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const trace = (w, col) => {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
          let acc = 0; ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            if (acc + seg >= lim) { const r = (lim - acc) / seg; ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r); break; }
            ctx.lineTo(pts[i][0], pts[i][1]); acc += seg;
          }
          ctx.stroke();
        };
        trace(11, INK); trace(6, '#FFD23A');
        ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 9, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        if (f >= 1) {
          const e = pts[pts.length - 1];
          ctx.save(); ctx.translate(e[0], e[1] + 4);
          [[-9, 6], [9, 6], [0, -6]].forEach(([bx, by]) => {
            ctx.beginPath(); ctx.moveTo(bx - 9, by + 5); ctx.lineTo(bx + 9, by + 5); ctx.lineTo(bx + 6, by - 5); ctx.lineTo(bx - 6, by - 5); ctx.closePath();
            ctx.fillStyle = '#FFD23A'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
          });
          ctx.restore();
        }
      });
      if (f < 1 && modal === 'result') requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- chapter screen ---------------- */
  function showChapter(cr) {
    $('cTrophy').innerHTML = TROPHY;
    $('cTitle').textContent = 'أكملت الفصل ' + (cr.chapter + 1) + '!';
    $('cName').textContent = Lv.chapterName(cr.chapter) + (cr.hintFree ? ' · بدون كاشف!' : '');
    $('cStars').textContent = cr.stars + '/30';
    $('cPoints').textContent = '+' + fmt(cr.reward);
    $('cHints').textContent = '+' + cr.hints;
    const nextN = (cr.chapter + 1) * 10 + 1;
    $('cNext').textContent = nextN <= Lv.LEVEL_COUNT
      ? 'الفصل التالي: ' + Lv.chapterName(cr.chapter + 1) + ' · المستوى: ' + Lv.tierOf(nextN).name
      : 'أنهيت جميع المراحل! أنت سيد السكك الحديدية 🏆';
    $('cGo').textContent = nextN <= Lv.LEVEL_COUNT ? 'تابع' : 'القائمة';
    openModal('chapter');
    Sfx.fanfare(); G.haptic(80);
  }

  /* ---------------- confirm ---------------- */
  let confirmCb = null;
  function confirmBox(title, text, cb) { $('cfTitle').textContent = title; $('cfText').textContent = text; confirmCb = cb; $('cfNo').style.display = ''; $('cfYes').textContent = 'نعم'; $('cfYes').className = 'btn danger'; openModal('confirm'); }
  function alertBox(title, text) { confirmBox(title, text, null); $('cfNo').style.display = 'none'; $('cfYes').textContent = 'مزيان'; $('cfYes').className = 'btn primary'; }

  /* ---------------- pause / lifecycle ---------------- */
  function pauseGame() {
    if (screen !== 'hud' || modal) return;
    if (game.phase === 'reveal') return;
    game.pause(true); Sfx.stopRumble();
    openModal('pause');
  }
  function resumeGame() {
    closeModal(); game.pause(false);
    if (game.phase === 'running') Sfx.startRumble();
  }

  // Android back button → returns true if handled
  G.onAndroidBack = function () {
    Sfx.back();
    if (modal === 'pause') { resumeGame(); return true; }
    if (modal === 'help' || modal === 'confirm' || modal === 'liveGuide') { closeModal(); return true; }
    if (G.Live && G.Live.active) return G.Live.onBack();
    if (screen === 'control') { goMenu(); return true; }
    if (modal === 'result' || modal === 'chapter') { closeModal(); goLevels(); return true; }
    if (screen === 'hud') { pauseGame(); return true; }
    if (screen === 'levels' || screen === 'settings' || screen === 'achievements') { goMenu(); return true; }
    return false; // on main menu → exit app
  };
  // During a LIVE session the game must keep running while the host is in TikTok.
  G.onAppPause = function () { if (G.Live && G.Live.active) { G.Live.onAppPause(); return; } pauseGame(); Sfx.stopRumble(); Sfx.suspend(); };
  G.onAppResume = function () { Sfx.resume(); };
  G.isLiveActive = function () { return !!(G.Live && G.Live.active); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.onAppPause(); else G.onAppResume(); });

  function goLevels() { closeModal(); Sfx.stopRumble(); if (game.mode !== 'demo') game.startDemo(); buildLevelList(); show('levels'); }

  /* ---------------- wiring ---------------- */
  function bind(id, fn, snd) { $(id).addEventListener('click', e => { Sfx.unlock(); if (snd !== false) Sfx.click(); fn(e); }); }

  function wire() {
    bind('mPlay', () => {
      if (!Store.data.helpSeen) { Store.data.helpSeen = 1; Store.save(); openModal('help'); $('helpOk').dataset.then = 'play'; return; }
      play(nextPlayable());
    });
    bind('mLevels', goLevels);
    bind('mLive', () => G.Live.openPanel());
    bind('guideOk', closeModal);
    bind('mAch', () => { buildAchList(); show('achievements'); });
    bind('mSettings', () => show('settings'));
    bind('mHelp', () => { $('helpOk').dataset.then = ''; openModal('help'); });
    bind('sHelp', () => { $('helpOk').dataset.then = ''; openModal('help'); });
    bind('helpOk', () => { const t = $('helpOk').dataset.then; closeModal(); if (t === 'play') play(nextPlayable()); });
    bind('mSound', toggleSound, false);
    bind('pSound', toggleSound, false);
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Sfx.back(); goMenu(); }));
    $('levelList').addEventListener('click', e => {
      const b = e.target.closest('.lvl'); if (!b) return;
      Sfx.unlock();
      const n = +b.dataset.n;
      if (n > Store.data.unlocked) { Sfx.back(); G.haptic(30); b.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 200 }); return; }
      Sfx.click(); play(n);
    });

    $('sSound').addEventListener('change', e => { if (e.target.checked !== Store.data.settings.sound) toggleSound(); });
    $('sVibrate').addEventListener('change', e => { Store.data.settings.vibrate = e.target.checked; Store.save(); G.haptic(30); });
    $('sRelaxed').addEventListener('change', e => { Store.data.settings.relaxed = e.target.checked; Store.save(); });
    bind('sReset', () => confirmBox('إعادة ضبط التقدم؟', 'سيتم حذف جميع المراحل والنجوم والنقاط والإنجازات. لا يمكن التراجع.', () => { Store.reset(); refreshMenu(); goMenu(); }));
    bind('cfYes', () => { const cb = confirmCb; closeModal(); cb && cb(); });
    bind('cfNo', closeModal);

    bind('hPause', pauseGame);
    bind('hHint', () => {
      if (game.phase !== 'running' || game.usedHint) return;
      if (Store.data.hints <= 0) { Sfx.back(); return; }
      if (game.useHint()) { Store.useHint(); refreshHint(); }
    }, false);
    bind('pResume', resumeGame);
    bind('pRestart', () => { closeModal(); attempts++; Store.data.stats.streak = 0; Store.save(); play(cur.n, true); });
    bind('pLevels', goLevels);
    bind('pHome', goMenu);

    bind('rNext', () => {
      if (pendingChapter) { const c = pendingChapter; pendingChapter = null; showChapter(c); return; }
      play(cur.n + 1);
    });
    bind('rRetry', () => {
      if (pendingChapter) { const c = pendingChapter; pendingChapter = null; showChapter(c); $('cGo').dataset.retry = '1'; return; }
      play(cur.n, true);
    });
    bind('rLevels', goLevels);
    bind('cGo', () => {
      const retry = $('cGo').dataset.retry; $('cGo').dataset.retry = '';
      if (retry) return play(cur.n, true);
      if (cur.n >= Lv.LEVEL_COUNT) return goMenu();
      play(cur.n + 1);
    });

    // first touch unlocks audio on Android WebView
    window.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    Store.load();
    const st = Store.data.settings;
    Sfx.setEnabled(st.sound);
    $('sVibrate').checked = st.vibrate;
    $('sRelaxed').checked = st.relaxed;
    $('ver').textContent = VERSION;
    fillIcons();
    $('splashLogo').innerHTML = LOGO;
    $('menuLogo').innerHTML = LOGO;
    game = new G.Game($('game'), hooks);
    G.Live.init({
      game, Sfx,
      show, screen: () => screen, goMenu, openModal,
      alert: alertBox, confirm: confirmBox,
      toggleSound, soundOn: () => Store.data.settings.sound
    });
    G.game = game; // debug handle
    wire();
    const fontsReady = (document.fonts && document.fonts.load)
      ? Promise.all([document.fonts.load('900 20px Cairo', 'الذهب 1'), document.fonts.load('700 20px Cairo', 'الذهب 1')]).catch(() => 0)
      : Promise.resolve();
    const minSplash = new Promise(r => setTimeout(r, 1600));
    Promise.all([fontsReady, minSplash]).then(() => { refreshMenu(); show('menu'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
