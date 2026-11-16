/* =========================================================================
 * عربة الذهب — TikTok LIVE mode (phone only)
 * -------------------------------------------------------------------------
 *  - Comment sources: relay (own cloud server), euler (direct, experimental),
 *    sim (fake viewers for rehearsal), manual (host types answers).
 *  - Viewers answer by commenting the cart number (1..N, Arabic digits or
 *    Darija words). First valid answer per viewer per round counts.
 *  - Winners: fastest correct answers → podium (gold/silver/bronze) + 10 more.
 *  - Everything is autosaved to localStorage; rounds keep running when the
 *    host switches to TikTok (see Game.tick + Android foreground service).
 * ========================================================================= */
(function (G) {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = window.APP_KEY || 'goldrail.live.v1';          // each app (quiz / yes-no) keeps its own settings
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const Native = () => window.AndroidBridge || null;

  /* ---------------- texts: Moroccan Darija (ma) + Modern Arabic (ar) ---------------- */
  const TXT = {
    ma: {
      intro_t: 'الذهب فواحد من العربات 👀', intro_s: 'تبعوه مزيان حتى للخر!',
      follow: 'تبعو الذهب!', question: 'فين كاين الذهب دابا؟',
      prompt_q: 'كتب رقم العربة فالكومنتير 👇', prompt_run: 'ركّزو… السؤال جاي من بعد 👀',
      answers: '{n} جواب', answered: 'جاوب ✓', reveal: 'الذهب كان فالعربة {n}',
      winners_t: 'الرابحين ديال الجولة 🏆', winners_s: '{c} من {a} جاوبو صح', nobody: 'حتى واحد ما جابها هاد المرة 😅',
      board_t: 'الترتيب العام 📊', board_s: '{p} مشارك · {r} جولات', next_in: 'الجولة الجاية بعد {s}…',
      waiting: 'الجولة غادي تبدا دابا…', waiting_s: 'ملي يبان السؤال كتبو رقم العربة فالكومنتير',
      paused: 'استراحة صغيرة… نرجعو دابا ⏸', round: 'الجولة {r} · المرحلة {l}', pts: 'نقطة', sec: 'ث', you_first: 'الأول'
    },
    ar: {
      intro_t: 'الذهب في إحدى العربات 👀', intro_s: 'تابعوه جيداً حتى النهاية!',
      follow: 'تابعوا الذهب!', question: 'أين الذهب الآن؟',
      prompt_q: 'اكتب رقم العربة في التعليقات 👇', prompt_run: 'ركّزوا… السؤال قادم بعد قليل 👀',
      answers: '{n} إجابة', answered: 'أجاب ✓', reveal: 'الذهب كان في العربة {n}',
      winners_t: 'الفائزون في الجولة 🏆', winners_s: '{c} من {a} أجابوا بشكل صحيح', nobody: 'لم يُجب أحد بشكل صحيح هذه المرة 😅',
      board_t: 'الترتيب العام 📊', board_s: '{p} مشارك · {r} جولات', next_in: 'الجولة التالية بعد {s}…',
      waiting: 'الجولة ستبدأ قريباً…', waiting_s: 'عندما يظهر السؤال اكتبوا رقم العربة في التعليقات',
      paused: 'استراحة قصيرة… نعود حالاً ⏸', round: 'الجولة {r} · المرحلة {l}', pts: 'نقطة', sec: 'ث', you_first: 'الأول'
    }
  };
  function t(k, vars) {
    let s = (TXT[cfg.lang] || TXT.ma)[k] || k;
    if (vars) for (const v of Object.keys(vars)) s = s.replace('{' + v + '}', vars[v]);
    return s;
  }

  /* ---------------- answer parsing ---------------- */
  const WORDS = {
    'واحد': 1, 'وحدة': 1, 'الاولى': 1, 'الأولى': 1, 'one': 1,
    'جوج': 2, 'زوج': 2, 'اثنين': 2, 'إثنين': 2, 'اتنين': 2, 'two': 2,
    'تلاتة': 3, 'ثلاثة': 3, 'تلاثة': 3, 'ثلاثه': 3, 'three': 3,
    'ربعة': 4, 'أربعة': 4, 'اربعة': 4, 'اربعه': 4, 'four': 4,
    'خمسة': 5, 'خمسه': 5, 'five': 5,
    'ستة': 6, 'سته': 6, 'six': 6
  };
  function parseAnswer(text, lanes) {
    if (!text) return null;
    let s = String(text).toLowerCase()
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0))
      .replace(/[1-9]️?⃣/g, m => m[0]);          // keycap emoji 3️⃣
    const m = s.match(/(^|[^0-9])([0-9]{1,2})(?![0-9])/);
    let n = m ? parseInt(m[2], 10) : null;
    if (n == null) {
      for (const w of s.split(/[\s،,.!?؟]+/)) if (WORDS[w] != null) { n = WORDS[w]; break; }
    }
    return n != null && n >= 1 && n <= lanes ? n : null;
  }

  /* ---------------- config / persistence ---------------- */
  const DEFAULT_CFG = {
    source: 'sim', user: '', relayUrl: '', token: '', eulerKey: '',
    qTime: 35, winnersTime: 12, autopilot: true, volKeys: true, lang: 'ar', saver: true,
    simViewers: 40, startLevel: 1, photoMax: 10, giftThanks: true, giftDelay: 7, giftShow: 4, applause: true, topicTime: 6, revealTime: 7, supportTime: 13,
    game: 'quiz', qCount: 30, fuzzy: true, quizOff: '', freeSpace: 40, topSpace: 13, showGuides: false, music: true, musicVol: 0.5, musicSong: 'arena', cfgVer: 3, musicRotate: 15, grace: 8, supportEvery: 7, shareEvery: 2
  };
  Object.assign(DEFAULT_CFG, window.APP_DEFAULTS || {});        // per-app defaults (e.g. «صح أم خطأ»)
  let cfg = Object.assign({}, DEFAULT_CFG);
  let session = null;      // persisted
  let round = null;        // current round (persisted while open)
  let active = false;
  let conn = null;
  let connState = { state: 'off', msg: '' };
  let viewers = 0;
  let api = null;          // provided by app.js
  let sched = null;        // {at, fn, label}
  let boardShown = null;   // 'round' | 'session' | null
  let lastSave = 0, saveTimer = null;
  const recent = [];       // last comments received (host diagnostics)
  let lastCommentAt = 0;

  function newSession() {
    return { id: Date.now(), startedAt: Date.now(), comments: 0, participants: {}, rounds: [], roundsPlayed: 0,
      level: G.Levels ? Math.max(1, Math.min(cfg.startLevel | 0, G.Levels.LEVEL_COUNT)) : 1, peakViewers: 0 };
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d) {
        cfg = Object.assign({}, DEFAULT_CFG, d.cfg || {});
        cfg.game = 'quiz';                                             // the train game is no longer part of the app
        if (cfg.cfgVer !== 2 && cfg.cfgVer !== 3) cfg.musicVol = 0.5;   // quieter music so the countdown is heard
        if (cfg.cfgVer !== 3) { cfg.lang = 'ar'; cfg.cfgVer = 3; }        // v3.11: standard Arabic is the official language
        return d;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveNow() {
    lastSave = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify({ cfg, session, active, savedAt: Date.now(),
        round: round && !round.done ? { no: round.no, level: round.level } : null }));
    } catch (e) { /* storage full → trim participants */ trimParticipants(2000); }
  }
  function save() {
    if (Date.now() - lastSave > 1000) saveNow();
    else if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 1000);
  }
  function trimParticipants(max) {
    if (!session) return;
    const ids = Object.keys(session.participants);
    if (ids.length <= max) return;
    ids.sort((a, b) => (session.participants[a].pts || 0) - (session.participants[b].pts || 0));
    for (let i = 0; i < ids.length - max; i++) if (!session.participants[ids[i]].pts) delete session.participants[ids[i]];
  }

  /* =================================================================
   * CONNECTORS
   * ================================================================= */
  function setConn(state, msg) {
    connState = { state, msg: msg || '' };
    renderPanelStatus();
  }

  function onChat(c) {
    if (!session || !c) return;
    const uid = String(c.u || c.n || '').slice(0, 64);
    if (!uid) return;
    session.comments++;
    let p = session.participants[uid];
    if (!p) { p = session.participants[uid] = { n: c.n || uid, a: c.a || '', pts: 0, wins: 0, correct: 0, answers: 0 }; }
    if (c.n) p.n = String(c.n).slice(0, 40);
    if (c.a) p.a = c.a;
    // why was (or wasn't) this comment counted? → shown to the host in the panel
    let why;
    const num = isQuiz() ? null : parseAnswer(c.c, round ? round.lanes : 6);
    if (isQuiz()) why = G.Quiz.onChat(c, p, uid);
    else if (num == null) why = 'ماشي رقم';
    else if (!round || round.done) why = 'ما كايناش جولة';
    else if (!round.open) why = 'قبل السؤال';
    else if (round.answers[uid]) why = 'جاوب من قبل';
    else {
      round.answers[uid] = { num, ms: Date.now() - round.qStart };
      round.count++;
      p.answers++;
      feedChip(p);
      renderCounter();
      why = 'تحسب ✓ (' + num + ')';
    }
    recent.unshift({ n: p.n, c: String(c.c || '').slice(0, 40), t: Date.now(), why, ok: why.startsWith('تحسب') || why.startsWith('صحيح') });
    if (recent.length > 8) recent.pop();
    lastCommentAt = Date.now();
    if (session.comments % 50 === 0) trimParticipants(20000);
    save();
  }
  function onGiftMsg(g) {
    if (!session || !g) return;
    const uid = String(g.u || g.n || '').slice(0, 64); if (!uid) return;
    let p = session.participants[uid];
    if (!p) p = session.participants[uid] = { n: g.n || uid, a: g.a || '', pts: 0, wins: 0, correct: 0, answers: 0 };
    if (g.n) p.n = String(g.n).slice(0, 40);
    if (g.a) p.a = g.a;
    const why = isQuiz() ? G.Quiz.onGift(g, p) : 'كادو';
    recent.unshift({ n: p.n, c: '🎁 ' + (g.gname || '') + (g.count > 1 ? ' ×' + g.count : ''), t: Date.now(), why, ok: true });
    if (recent.length > 8) recent.pop();
    save();
  }
  function onViewers(n) {
    viewers = n | 0;
    if (session) session.peakViewers = Math.max(session.peakViewers || 0, viewers);
  }

  function relayUrls() {
    let b = (cfg.relayUrl || '').trim().replace(/\/+$/, '').replace(/\/ws$/, '');
    if (/^https?:\/\//i.test(b)) b = b.replace(/^http/i, 'ws');
    if (!/^wss?:\/\//i.test(b)) b = 'wss://' + b;
    return {
      ws: b + '/ws?user=' + encodeURIComponent(cfg.user) + '&token=' + encodeURIComponent(cfg.token || ''),
      health: b.replace(/^ws/i, 'http') + '/health'
    };
  }

  /** Generic reconnecting WebSocket used by relay + euler sources. */
  function socketConnector(kind) {
    let ws = null, stopped = false, retry = 0, ping = null, keepAwake = null, rt = null;
    const EULER_CODES = {
      4404: 'الحساب ليس في بث مباشر الآن — سنعيد المحاولة', 4005: 'انتهى البث', 4401: 'المفتاح (API key) غير صحيح',
      4403: 'لا تملك صلاحية هذه الخدمة (قد تحتاج اشتراكاً)', 4429: 'اتصالات كثيرة في الوقت نفسه', 4400: 'معلومات ناقصة'
    };
    function url() {
      if (kind === 'relay') return relayUrls().ws;
      const q = new URLSearchParams({ uniqueId: cfg.user.replace(/^@/, ''), 'features.bundleEvents': 'true' });
      if (cfg.eulerKey) q.set('apiKey', cfg.eulerKey);
      return 'wss://ws.eulerstream.com?' + q.toString();
    }
    function open() {
      if (stopped) return;
      setConn('connecting', kind === 'relay' ? 'جارٍ الاتصال بالخادم…' : 'جارٍ الاتصال بـ Euler…');
      try { ws = new WebSocket(url()); } catch (e) { setConn('error', 'رابط غير صحيح'); return later(); }
      ws.onopen = () => {
        retry = 0;
        setConn(kind === 'relay' ? 'server' : 'connected', kind === 'relay' ? 'متصل بالخادم، في انتظار TikTok…' : 'متصل');
      };
      ws.onmessage = ev => {
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (kind === 'relay') handleRelay(d); else handleEuler(d);
      };
      ws.onclose = ev => {
        clearInterval(ping);
        if (stopped) return;
        let m = kind === 'euler' ? (EULER_CODES[ev.code] || ('انقطع الاتصال (' + ev.code + ')')) : (ev.code === 4401 ? 'الرمز السري (token) غير صحيح' : 'انقطع الاتصال بالخادم');
        setConn(ev.code === 4404 ? 'offline' : 'error', m);
        later(ev.code === 4404 ? 20000 : 0);
      };
      ws.onerror = () => { /* onclose follows */ };
      ping = setInterval(() => { try { if (ws.readyState === 1 && kind === 'relay') ws.send('{"t":"ping"}'); } catch (e) { /* */ } }, 20000);
    }
    function later(ms) {
      clearTimeout(rt);
      retry = Math.min(retry + 1, 6);
      rt = setTimeout(open, ms || Math.min(15000, 1000 * Math.pow(2, retry)));
    }
    function handleRelay(d) {
      if (d.t === 'chat') onChat(d);
      else if (d.t === 'gift') onGiftMsg(d);
      else if (d.t === 'viewers') onViewers(d.n);
      else if (d.t === 'status') {
        const map = { connecting: 'جارٍ الاتصال بـ TikTok…', reconnecting: 'جارٍ إعادة الاتصال بـ TikTok…', connected: 'متصل بـ TikTok LIVE ✓', offline: 'الحساب ليس في بث مباشر الآن — كنتسناو', error: 'مشكل: ' + (d.msg || '') };
        setConn(d.state === 'connected' ? 'connected' : d.state, map[d.state] || d.msg);
      }
    }
    function handleEuler(d) {
      const out = [];
      walkEuler(d, out, 0);
      out.forEach(onChat);
      if (connState.state !== 'connected' && out.length) setConn('connected', 'متصل بـ TikTok LIVE ✓');
    }
    return {
      start() {
        stopped = false; open();
        if (kind === 'relay') {
          // free hosting plans sleep without HTTP traffic → ping /health every 4 minutes
          keepAwake = setInterval(() => { fetch(relayUrls().health).catch(() => {}); }, 240000);
          fetch(relayUrls().health).catch(() => {});
        }
      },
      stop() { stopped = true; clearTimeout(rt); clearInterval(ping); clearInterval(keepAwake); try { ws && ws.close(); } catch (e) { /* */ } setConn('off'); }
    };
  }

  // Tolerant parser for Euler Stream JSON frames (format not verified against the live service).
  const first = a => (Array.isArray(a) && a.length ? a[0] : null);
  function normChat(d) {
    const u = d.user || d.author || d.sender || {};
    const pic = u.profilePicture || u.avatarThumb || u.avatar || {};
    const uid = u.uniqueId || u.unique_id || u.displayId || u.userId || u.id || d.uniqueId || d.userId;
    // v3 schema uses `content`, older ones `comment` → take the first non-empty one
    const text = [d.content, d.comment, d.text].find(x => typeof x === 'string' && x.length);
    if (!uid || text == null) return null;
    return {
      u: String(uid), n: String(u.nickname || u.nickName || d.nickname || uid),
      a: first(pic.url) || first(pic.urls) || first(pic.urlList) || first(pic.url_list) || (typeof pic === 'string' ? pic : '') || u.profilePictureUrl || d.profilePictureUrl || '',
      c: String(text)
    };
  }
  function walkEuler(o, out, depth) {
    if (!o || depth > 6) return;
    if (Array.isArray(o)) { o.forEach(x => walkEuler(x, out, depth + 1)); return; }
    if (typeof o !== 'object') return;
    const type = String(o.type || o.event || o.method || '');
    const data = (o.data && typeof o.data === 'object') ? o.data : o;
    if (/chat/i.test(type) || ((data.comment != null || data.content != null) && (data.user || data.uniqueId))) {
      const c = normChat(data); if (c) out.push(c); return;
    }
    if (/roomuser/i.test(type)) { const v = data.viewerCount != null ? data.viewerCount : data.total; if (v != null) onViewers(+v); return; }
    for (const k of ['messages', 'events', 'data', 'payload']) if (o[k] && typeof o[k] === 'object' && o[k] !== o) walkEuler(o[k], out, depth + 1);
  }

  /** Rehearsal: fake viewers answer during the question window. */
  function simConnector() {
    const NAMES = ['Yassine', 'Salma', 'Hamza', 'Khadija', 'Amine', 'Imane', 'Othmane', 'FatimaZahra', 'Ayoub', 'Meryem', 'Youssef', 'Hiba',
      'Mehdi', 'Sara', 'Anas', 'Nada', 'Zakaria', 'Ikram', 'Reda', 'Chaimae', 'Ilyas', 'Houda', 'Soufiane', 'Wiam', 'Bilal', 'Asmae',
      'Achraf', 'Kawtar', 'Nabil', 'Ghita', 'ياسين', 'سلمى', 'حمزة', 'خديجة', 'مريم', 'يوسف', 'هبة', 'عثمان', 'إكرام', 'رضا'];
    const CHAT = ['سلام 👋', '🔥🔥🔥', 'يلاه!', 'صعيبة هادي 😂', 'تبعتها مزيان', 'ما شاء الله', 'زيد جولة', '❤️'];
    let iv = null, people = [];
    let seenRound = -1;
    function mk(i) { const n = NAMES[i % NAMES.length] + (i >= NAMES.length ? '_' + i : ''); return { u: 'sim_' + i, n, a: '' }; }
    return {
      start() {
        people = Array.from({ length: Math.max(3, cfg.simViewers | 0) }, (_, i) => Object.assign(mk(i), { skill: Math.random() }));
        setConn('connected', 'وضع التجربة: ' + people.length + ' مشاهداً وهمياً');
        iv = setInterval(() => {
          onViewers(people.length + Math.round(Math.random() * 5));
          if (isQuiz()) {
            const tg = G.Quiz.simTarget();
            if (tg && seenRound !== tg.id) {
              seenRound = tg.id;
              people.forEach(p => {
                if (Math.random() < 0.25) return;
                const right = Math.random() < 0.3 + p.skill * 0.55;
                const delay = 1200 + Math.random() * cfg.qTime * 750;
                if (!right || Math.random() < 0.3) setTimeout(() => { const t2 = G.Quiz.simTarget(); if (t2 && t2.id === tg.id) onChat({ u: p.u, n: p.n, a: p.a, c: t2.wrong }); }, delay * 0.6);
                if (right) setTimeout(() => { const t2 = G.Quiz.simTarget(); if (t2 && t2.id === tg.id) onChat({ u: p.u, n: p.n, a: p.a, c: t2.right }); }, delay);
              });
            }
            if (Math.random() < 0.06) { const p = people[(Math.random() * people.length) | 0]; onChat({ u: p.u, n: p.n, a: p.a, c: CHAT[(Math.random() * CHAT.length) | 0] }); }
            if (Math.random() < 0.012) { const p = people[(Math.random() * people.length) | 0]; const big = Math.random() < 0.15; onGiftMsg({ u: p.u, n: p.n, a: p.a, gname: big ? 'Perfume' : 'Rose', coins: big ? 20 : 1, count: big ? 1 : 1 + ((Math.random() * 5) | 0), gimg: '' }); }
            return;
          }
          if (Math.random() < 0.08) { const p = people[(Math.random() * people.length) | 0]; onChat({ u: p.u, n: p.n, a: p.a, c: CHAT[(Math.random() * CHAT.length) | 0] }); }
          if (round && round.open && seenRound !== round.no) {
            seenRound = round.no;
            people.forEach(p => {
              if (Math.random() < 0.15) return;                      // some don't answer
              const delay = 600 + Math.random() * cfg.qTime * 800;
              setTimeout(() => {
                if (!round || !round.open) return;
                const right = Math.random() < 0.35 + p.skill * 0.5;
                const num = right ? round.gold : 1 + ((round.gold + Math.floor(Math.random() * (round.lanes - 1))) % round.lanes);
                const fmt = [String(num), 'العربة ' + num, String.fromCharCode(0x660 + num), num + ' 🔥'][(Math.random() * 4) | 0];
                onChat({ u: p.u, n: p.n, a: p.a, c: fmt });
              }, delay);
            });
          }
        }, 300);
      },
      stop() { clearInterval(iv); setConn('off'); }
    };
  }

  function makeConnector() {
    if (cfg.source === 'relay') return socketConnector('relay');
    if (cfg.source === 'euler') return socketConnector('euler');
    if (cfg.source === 'sim') return simConnector();
    return { start() { setConn('manual', 'الوضع اليدوي: أضف الإجابات من اللوحة'); }, stop() { setConn('off'); } };
  }

  /* =================================================================
   * ROUNDS
   * ================================================================= */
  function liveLevel(n) {
    const lv = G.Levels.buildLevel(n);
    if (lv.golds.length > 1) {          // live answers are one number → keep a single gold cart
      lv.golds = [lv.golds[0]];
      let g = lv.golds[0];
      lv.events.forEach(e => { if (e.active) g = e.perm[g]; });
      lv.finalGolds = [g];
      lv.tags = lv.tags.filter(x => x !== 'ذهبتان');
    }
    return lv;
  }

  function schedule(ms, fn, label) { sched = { at: Date.now() + ms, fn, label }; renderWait(); }
  function clearSched() { sched = null; renderWait(); }
  setInterval(() => {                       // robust against background timer throttling
    if (sched && Date.now() >= sched.at) { const f = sched.fn; sched = null; f(); }
    renderWait();
  }, 500);

  function startRound(levelN) {
    if (!active) return;
    clearSched();
    hideBoard();
    const n = levelN || session.level;
    const lv = liveLevel(n);
    session.roundsPlayed++;
    round = { no: session.roundsPlayed, level: n, lanes: lv.lanes, gold: lv.lanes - lv.finalGolds[0],
      qStart: 0, open: false, done: false, answers: {}, count: 0 };
    api.game.startLevel(lv, { live: true, answerTime: cfg.qTime, preview: Math.max(3.2, lv.preview + 1) });
    api.game.fpsCap = cfg.saver ? 30 : 0;
    setHud('intro');
    $('lvRound').textContent = t('round', { r: round.no, l: n });
    $('lvFeed').innerHTML = '';
    renderCounter();
    save();
  }

  function onPhase(p) {
    if (!round) return;
    if (p === 'running') setHud('running');
    if (p === 'question') { round.open = true; round.qStart = Date.now(); setHud('question'); }
    if (p === 'reveal') { round.open = false; setHud('reveal'); }
    save();
  }
  function onProgress(f) { const b = $('lvBar'); if (b) b.style.width = (f * 100).toFixed(1) + '%'; }

  function onResult() {
    if (!round || round.done) return;
    round.done = true; round.open = false;
    const ids = Object.keys(round.answers);
    const correct = ids.filter(id => round.answers[id].num === round.gold)
      .sort((a, b) => round.answers[a].ms - round.answers[b].ms);
    const qms = cfg.qTime * 1000;
    correct.forEach((id, i) => {
      const p = session.participants[id]; if (!p) return;
      const pts = 50 + Math.round(50 * Math.max(0, 1 - round.answers[id].ms / qms)) + ([50, 30, 20][i] || 0);
      p.pts += pts; p.correct++; if (i === 0) p.wins++;
      round.answers[id].pts = pts;
    });
    round.winners = correct;
    round.total = ids.length;
    session.rounds.push({ no: round.no, level: round.level, gold: round.gold, total: ids.length, correct: correct.length, top: correct.slice(0, 3), at: Date.now() });
    if (session.rounds.length > 60) session.rounds.shift();
    session.level = round.level % G.Levels.LEVEL_COUNT + 1;
    saveNow();
    setTimeout(() => { showBoard('round'); if (cfg.autopilot) schedule(cfg.winnersTime * 1000, () => startRound(), 'next'); }, 600);
  }

  /* =================================================================
   * BROADCAST UI (what viewers see)
   * ================================================================= */
  function setHud(mode) {
    const q = $('lvQ'), sub = $('lvQs'), prompt = $('lvPrompt'), chips = $('lvChips');
    $('lvTop').classList.toggle('reveal', mode === 'reveal');
    $('lvBarWrap').style.display = mode === 'running' ? '' : 'none';
    if (mode === 'wait') { q.textContent = t('waiting'); sub.textContent = t('waiting_s'); }
    if (mode === 'intro') { q.textContent = t('intro_t'); sub.textContent = t('intro_s'); }
    if (mode === 'running') { q.textContent = t('follow'); sub.textContent = ''; }
    if (mode === 'question') { q.textContent = t('question'); sub.textContent = ''; }
    if (mode === 'reveal') { q.textContent = t('reveal', { n: round.gold }); sub.textContent = ''; }
    const ask = mode === 'question';
    prompt.textContent = ask ? t('prompt_q') : t('prompt_run');
    $('lvBottom').classList.toggle('ask', ask);
    $('lvBottom').style.visibility = (mode === 'reveal' || mode === 'wait') ? 'hidden' : 'visible';
    chips.innerHTML = ask && round ? Array.from({ length: round.lanes }, (_, i) => `<span>${i + 1}</span>`).join('') : '';
    renderCounter();
  }
  function renderCounter() {
    const el = $('lvCount'); if (!el) return;
    const n = round ? round.count : 0;
    el.textContent = t('answers', { n });
    el.style.visibility = round && (round.open || round.done) ? 'visible' : 'hidden';
  }
  function avatarHtml(p, cls) {
    const initial = esc((p.n || '?').trim().charAt(0).toUpperCase());
    let h = 0; for (const ch of String(p.n || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const col = ['#A193F6', '#7DD0F2', '#5CC593', '#F29B4B', '#EF5F6B', '#FFD23A'][Math.abs(h) % 6];
    const img = p.a && /^https:\/\//.test(p.a) ? `<img src="${esc(p.a)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : '';
    return `<span class="av ${cls || ''}" style="background:${col}"><b>${initial}</b>${img}</span>`;
  }
  let feedQueue = [];
  function feedChip(p) {
    const feed = $('lvFeed'); if (!feed) return;
    const el = document.createElement('div');
    el.className = 'lv-chip';
    el.innerHTML = avatarHtml(p, 'sm') + `<span class="nm">${esc(p.n)}</span><em>${t('answered')}</em>`;
    feed.prepend(el);
    feedQueue.push(el);
    while (feed.children.length > 4) feed.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function showBoard(kind) {
    boardShown = kind;
    const b = $('lvBoard');
    let rows, title, sub, head = '';
    if (kind === 'round' && round && round.done) {
      title = t('winners_t');
      sub = t('winners_s', { c: round.winners.length, a: round.total });
      head = `<div class="lb-gold">${esc(t('reveal', { n: round.gold }))}</div>`;
      rows = round.winners.map(id => ({ p: session.participants[id], v: (round.answers[id].ms / 1000).toFixed(1) + t('sec'), pts: round.answers[id].pts }));
    } else {
      kind = boardShown = 'session';
      const ids = Object.keys(session.participants).filter(id => session.participants[id].pts > 0)
        .sort((a, b) => session.participants[b].pts - session.participants[a].pts);
      title = t('board_t');
      sub = t('board_s', { p: Object.keys(session.participants).length, r: session.rounds.length });
      rows = ids.map(id => ({ p: session.participants[id], v: session.participants[id].pts + ' ' + t('pts') }));
    }
    rows = rows.filter(r => r.p).slice(0, 13);
    const medal = ['gold', 'silver', 'bronze'];
    const podiumOrder = [1, 0, 2];
    let html = `<div class="lb-card"><h2>${esc(title)}</h2><p class="lb-sub">${esc(sub)}</p>${head}`;
    if (!rows.length) html += `<div class="lb-none">${esc(t('nobody'))}</div>`;
    else {
      html += '<div class="podium">';
      podiumOrder.forEach(i => {
        const r = rows[i];
        if (!r) { html += '<div class="pod empty"></div>'; return; }
        html += `<div class="pod ${medal[i]}"><div class="medal">${i + 1}</div>${avatarHtml(r.p, 'lg ' + medal[i])}<div class="pn">${esc(r.p.n)}</div><div class="pv">${esc(r.v)}</div><div class="step"></div></div>`;
      });
      html += '</div>';
      if (rows.length > 3) {
        html += '<ol class="lb-list" start="4">';
        rows.slice(3).forEach((r, i) => { html += `<li><span class="rk">${i + 4}</span>${avatarHtml(r.p, 'sm')}<span class="nm">${esc(r.p.n)}</span><span class="vv">${esc(r.v)}</span></li>`; });
        html += '</ol>';
      }
    }
    html += `<div class="lb-next" id="lvNext"></div></div>`;
    b.innerHTML = html;
    b.classList.add('show');
    renderWait();
    api.Sfx.fanfare();
  }
  function hideBoard() { boardShown = null; const b = $('lvBoard'); if (b) b.classList.remove('show'); }

  function renderWait() {
    const el = $('lvNext');
    if (!el) return;
    if (sched && sched.label === 'next') el.textContent = t('next_in', { s: Math.max(0, Math.ceil((sched.at - Date.now()) / 1000)) });
    else el.textContent = '';
  }

  function setPausedCard(v) { $('lvPaused').classList.toggle('show', !!v); $('lvPaused').textContent = t('paused'); }

  /* =================================================================
   * HOST ACTIONS (panel + volume keys)
   * ================================================================= */
  const Q = () => G.Quiz.ctl;
  const actions = {
    newRound() { if (isQuiz()) return active && Q().newTopic(); return actions._newRound(); },
    _newRound() { if (!active) return; setPausedCard(false); api.game.pause(false); startRound(); },
    togglePause() {
      if (isQuiz()) return active && Q().togglePause();
      if (!active || !round || round.done) return;
      const v = !api.game.paused;
      api.game.pause(v); setPausedCard(v);
      if (v) api.Sfx.stopRumble(); else if (api.game.phase === 'running') api.Sfx.startRumble();
      if (v) clearSched();
    },
    reveal() { if (isQuiz()) return active && Q().reveal(); if (!active || !round || round.done) return; api.game.pause(false); setPausedCard(false); api.game.revealNow(); },
    showWinners() { if (!active) return; if (isQuiz()) return Q().showBoard(); showBoard(round && round.done ? 'round' : 'session'); },
    showSession() { if (!active) return; if (isQuiz()) return Q().showBoard(); showBoard('session'); },
    hideWinners() { if (isQuiz()) return active && Q().hideBoard(); clearSched(); hideBoard(); },
    nextLevel() {
      if (!active) return;
      if (isQuiz()) return Q().next();
      if (round && !round.done) session.level = round.level % G.Levels.LEVEL_COUNT + 1;
      round = null; startRound();
    },
    replay() { if (!active) return; if (isQuiz()) return Q().restart(); const n = round ? round.level : session.level; round = null; startRound(n); },
    toggleSound() { api.toggleSound(); }
  };

  // Android volume keys → invisible remote control during the broadcast
  G.onLiveKey = function (k) {
    if (!active || !cfg.volKeys) return false;
    if (isQuiz()) {
      // + : next / reveal      − : break (pause) on/off, from any screen
      if (k === 'up') Q().next(); else Q().togglePause();
      return true;
    }
    if (k === 'up') {
      if (!round || round.done) actions.newRound();
      else if (round.open || api.game.phase === 'running') actions.reveal();
    } else if (k === 'down') {
      if (round && !round.done) actions.togglePause();
      else if (boardShown) actions.hideWinners(); else actions.showSession();
    }
    return true;
  };

  /* =================================================================
   * SESSION LIFECYCLE
   * ================================================================= */
  function validate() {
    if ((cfg.source === 'relay' || cfg.source === 'euler') && !cfg.user.replace(/^@/, '').trim()) return 'اكتب اسم حسابك على TikTok (@username)';
    if (cfg.source === 'relay' && !cfg.relayUrl.trim()) return 'أدخل رابط خادمك (مثلاً adan-noureddine.onrender.com)';
    return '';
  }

  function startSession(resume) {
    readForm();
    const err = validate();
    if (err) { api.alert('أكمل الإعدادات أولاً', err); return; }
    if (!resume || !session) session = newSession();
    active = true;
    conn && conn.stop();
    conn = makeConnector(); conn.start();
    const N = Native(); if (N && N.setLiveMode) try { N.setLiveMode(true); N.setVolumeKeys(!!cfg.volKeys); } catch (e) { /* */ }
    // volume keys now drive the game, so make sure the phone's media volume is audible first
    if (N && N.ensureMediaVolume) try { N.ensureMediaVolume(); } catch (e) { /* */ }
    api.Sfx.unlock();
    api.game.fpsCap = cfg.saver ? 30 : 0;
    goBroadcast();
    api.game.hidden = isQuiz();
    if (isQuiz()) { G.Quiz.start(); saveNow(); return; }
    setHud('wait');
    $('lvRound').textContent = '';
    if (resume && resume.round) { round = null; schedule(4000, () => startRound(resume.round.level), 'start'); }
    else if (cfg.autopilot) schedule(6000, () => startRound(), 'start');
    saveNow();
  }

  function endSession() {
    active = false; clearSched();
    conn && conn.stop(); conn = null;
    round = null; hideBoard(); setPausedCard(false);
    G.Quiz.stop(); api.game.hidden = false;
    const N = Native(); if (N && N.setLiveMode) try { N.setLiveMode(false); } catch (e) { /* */ }
    api.game.fpsCap = 0;
    saveNow();
    api.goMenu();
  }

  function goBroadcast() { api.show(isQuiz() ? 'quizHud' : 'liveHud'); }

  /* =================================================================
   * CONTROL PANEL (host only)
   * ================================================================= */
  const FIELDS = ['shareEvery', 'musicSong', 'supportEvery', 'musicRotate', 'grace', 'music', 'musicVol', 'freeSpace', 'topSpace', 'showGuides', 'game', 'source', 'user', 'relayUrl', 'token', 'eulerKey', 'qTime', 'qCount', 'fuzzy', 'winnersTime', 'autopilot', 'volKeys', 'lang', 'saver', 'simViewers', 'lobbyTime', 'reviveMax', 'reviveMin', 'finalAt', 'voice', 'voiceRate', 'minPlayers', 'gapTime', 'giftHype', 'rulesRead', 'readQ', 'qSet', 'photoMax', 'giftThanks', 'giftDelay', 'giftShow', 'applause', 'topicTime', 'revealTime', 'supportTime'];
  const isQuiz = () => cfg.game === 'quiz';
  function fillForm() {
    renderCats();
    FIELDS.forEach(f => {
      const el = $('cp_' + f); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!cfg[f]; else el.value = cfg[f];
    });
    const sn = $('cpSetNow'); if (sn && G.TfSets && G.TfSets.count()) sn.textContent = '(الحالية: ' + G.TfSets.current + '، بقي فيها ' + G.TfSets.left() + ' سؤالاً)';
    syncSourceRows();
  }
  function readForm() {
    FIELDS.forEach(f => {
      const el = $('cp_' + f); if (!el) return;
      if (el.type === 'checkbox') cfg[f] = el.checked;
      else if (el.type === 'number' || el.tagName === 'SELECT' && /^\d+$/.test(el.value)) cfg[f] = Math.max(+el.min || 0, Math.min(+el.max || 9999, el.value !== '' && isFinite(+el.value) ? +el.value : DEFAULT_CFG[f]));
      else cfg[f] = el.value.trim();
    });
    cfg.qTime = Math.max(8, Math.min(60, cfg.qTime | 0));
    cfg.winnersTime = Math.max(5, Math.min(60, cfg.winnersTime | 0));
    cfg.qCount = Math.max(5, Math.min(100, cfg.qCount | 0 || 30));
    if (G.Quiz && G.Quiz.applyLayout) G.Quiz.applyLayout();
    cfg.musicVol = Math.max(0, Math.min(1, isFinite(parseFloat(cfg.musicVol)) ? parseFloat(cfg.musicVol) : 0.8));
    if (active && G.Quiz && G.Quiz.music) G.Quiz.music();
    if (api && api.game) api.game.fpsCap = active && cfg.saver ? 30 : 0;
    const N = Native(); if (N && N.setVolumeKeys) try { N.setVolumeKeys(!!cfg.volKeys); } catch (e) { /* */ }
    save();
  }
  function syncSourceRows() {
    const s = $('cp_source').value;
    document.querySelectorAll('[data-src]').forEach(el => { el.style.display = el.dataset.src.split(' ').includes(s) ? '' : 'none'; });
    const g = $('cp_game').value;
    document.querySelectorAll('[data-game]').forEach(el => { el.style.display = el.dataset.game === g ? '' : 'none'; });
    const quiz = g === 'quiz';
    const L = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
    L('cpNew', quiz ? '▶️ سؤال جديد' : '▶️ بدا جولة جديدة');
    L('cpPause', quiz ? '⏸️ إيقاف / متابعة' : '⏸️ وقّف / كمّل الجولة');
    L('cpReveal', quiz ? '👁️ إظهار الإجابة' : '👁️ بيّن فين الذهب');
    L('cpNext', quiz ? '⏭️ التالي' : '⏭️ المرحلة الجاية');
    L('cpReplay', quiz ? '🔁 تحدٍّ جديد من 1' : '🔁 عاود الجولة');
    if (G.Quiz && G.Quiz.LABELS) Object.keys(G.Quiz.LABELS).forEach(id => L(id, G.Quiz.LABELS[id]));
    const man = $('cpManNum');
    if (man) { man.placeholder = quiz ? 'الإجابة' : 'رقم'; man.maxLength = quiz ? 40 : 2; man.classList.toggle('wide', quiz); }
  }
  function renderCats() {
    const box = $('cpCats'); if (!box || !G.Quiz) return;
    const off = new Set((cfg.quizOff || '').split(',').filter(Boolean));
    box.innerHTML = G.Quiz.CATS.map(c => `<label><input type="checkbox" data-cat="${c.id}" ${off.has(c.id) ? '' : 'checked'}>${c.icon} ${esc(c.ar)}</label>`).join('');
    box.querySelectorAll('input').forEach(i => i.addEventListener('change', () => {
      const offNow = [...box.querySelectorAll('input')].filter(x => !x.checked).map(x => x.dataset.cat);
      if (offNow.length === G.Quiz.CATS.length) { i.checked = true; return; }   // keep at least one
      cfg.quizOff = offNow.join(','); save();
    }));
  }

  function renderPanelStatus() {
    const el = $('cpStatus'); if (!el) return;
    const st = connState.state;
    const label = { off: 'غير متصل', connecting: 'جارٍ الاتصال…', server: 'متصل بالخادم', connected: 'متصل ✓', offline: 'ليس LIVE', reconnecting: 'إعادة الاتصال…', error: 'خطأ', manual: 'يدوي' }[st] || st;
    el.textContent = label;
    el.className = 'cp-pill ' + ({ connected: 'ok', manual: 'ok', server: 'mid', connecting: 'mid', reconnecting: 'mid', offline: 'bad', error: 'bad' }[st] || '');
    const m = $('cpStatusMsg'); if (m) m.textContent = connState.msg || '';
  }

  let statTimer = null;
  function renderStats() {
    if (!session) { $('cpStats').innerHTML = '<p class="muted">لم تبدأ أي جلسة بعد.</p>'; return; }
    const parts = Object.keys(session.participants).length;
    const mins = Math.round((Date.now() - session.startedAt) / 60000);
    const last = session.rounds[session.rounds.length - 1];
    let mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : '—';
    const N = Native();
    if (N && N.memoryInfo) try { const mi = JSON.parse(N.memoryInfo()); mem = mi.pssMB + ' MB'; } catch (e) { /* */ }
    const cells = isQuiz() ? [
      ['الصوت 🔊', G.Music ? (G.Music.state === 'running' ? (G.Music.playing ? 'يعمل ✓' : 'متوقف') : 'مقفل (المس الشاشة)') : '—'],
      ['المشاركون', parts], ['التعليقات', session.comments], ...G.Quiz.stats(), ['الهدايا 🌹', (session.gifts || 0) + ' (' + (session.coins || 0) + ' عملة)'],
      ['المشاهدون الآن', viewers || '—'], ['أعلى عدد مشاهدين', session.peakViewers || '—'], ['مدة الجلسة', mins + ' د'], ['ذاكرة اللعبة', mem]
    ] : [
      ['المشاركون', parts], ['التعليقات', session.comments], ['الجولات', session.rounds.length],
      ['أجوبة هاد الجولة', round ? round.count : 0], ['جاوبو صح (آخر جولة)', last ? last.correct + '/' + last.total : '—'],
      ['المشاهدون الآن', viewers || '—'], ['أعلى عدد مشاهدين', session.peakViewers || '—'], ['مدة الجلسة', mins + ' د'],
      ['المرحلة الجاية', session.level], ['ذاكرة اللعبة', mem]
    ];
    $('cpStats').innerHTML = cells.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('');
    const top = Object.keys(session.participants).filter(id => session.participants[id].pts > 0)
      .sort((a, b) => session.participants[b].pts - session.participants[a].pts).slice(0, 5);
    const ago = lastCommentAt ? Math.round((Date.now() - lastCommentAt) / 1000) + ' ث' : 'لم يصل أي تعليق بعد';
    $('cpRecent').innerHTML = `<li class="muted">آخر تعليق وصل منذ: ${ago}</li>` + recent.map(r =>
      `<li class="${r.ok ? 'ok' : ''}"><b>${esc(r.n)}:</b> «${esc(r.c)}» <em>${esc(r.why)}</em></li>`).join('');
    $('cpTop').innerHTML = top.length ? top.map((id, i) => { const p = session.participants[id]; return `<li>${i + 1}. ${avatarHtml(p, 'sm')} ${esc(p.n)} <b>${p.pts}</b></li>`; }).join('') : '<li class="muted">لا يوجد فائز بعد</li>';
  }

  let panelIdle = null;
  function openPanel(forceGame) {
    if (typeof forceGame === 'string' && !active) { cfg.game = forceGame; save(); }
    fillForm(); renderPanelStatus(); renderStats();
    $('cpLive').style.display = active ? '' : 'none';
    $('cpSetup').style.display = active ? 'none' : '';
    $('cpResume').style.display = !active && saved && saved.active && saved.session ? '' : 'none';
    if (saved && saved.session) $('cpResume').textContent = '▶ متابعة الجلسة السابقة (' + Object.keys(saved.session.participants).length + ' مشارك)';
    api.show('control');
    clearInterval(statTimer); statTimer = setInterval(() => { if (api.screen() === 'control') renderStats(); }, 1000);
    bumpIdle();
  }
  function bumpIdle() {
    clearTimeout(panelIdle);
    // during a broadcast, never leave the host panel on screen by accident
    if (active) panelIdle = setTimeout(() => { if (api.screen() === 'control') closePanel(); }, 20000);
  }
  function closePanel() { readForm(); clearInterval(statTimer); if (active) goBroadcast(); else api.goMenu(); }

  let saved = null;
  function wire() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', e => { api.Sfx.unlock(); api.Sfx.click(); bumpIdle(); fn(e); }); };
    on('cpClose', closePanel);
    on('cpStart', () => startSession(false));
    on('cpResume', () => { session = saved.session; startSession(saved); });
    on('cpBack', () => { readForm(); goBroadcast(); });
    on('cpEnd', () => api.confirm('إنهاء الجلسة؟', 'سيتوقف استقبال التعليقات والأسئلة. يبقى الترتيب محفوظاً.', endSession));
    on('cpNew', () => { readForm(); actions.newRound(); goBroadcast(); });
    on('cpPause', () => { actions.togglePause(); goBroadcast(); });
    on('cpReveal', () => { actions.reveal(); goBroadcast(); });
    on('cpWin', () => { actions.showWinners(); goBroadcast(); });
    on('cpHide', () => { actions.hideWinners(); goBroadcast(); });
    on('cpNext', () => { readForm(); actions.nextLevel(); goBroadcast(); });
    on('cpReplay', () => { readForm(); actions.replay(); goBroadcast(); });
    on('cpBoard', () => { actions.showSession(); goBroadcast(); });
    on('cpTestSound', () => testSound());
    on('cpSupport', () => { if (active && isQuiz()) G.Quiz.ctl.support(); goBroadcast(); });
    on('cpSound', () => { actions.toggleSound(); $('cpSound').classList.toggle('off', !api.soundOn()); });
    on('cpGuide', () => api.openModal('liveGuide'));
    on('cpTikTok', openTikTok);
    on('cpTikTok2', openTikTok);
    on('cpGuide2', () => api.openModal('liveGuide'));
    on('guideTikTok', openTikTok);
    on('cpBattery', () => { const N = Native(); if (N && N.openBatterySettings) N.openBatterySettings(); else api.alert('إعدادات البطارية', 'هذا الزر يعمل فقط في تطبيق أندرويد.'); });
    on('cpManualAdd', () => {
      const name = $('cpManName').value.trim(), num = $('cpManNum').value.trim();
      if (!name || !num) return;
      onChat({ u: 'manual_' + name.toLowerCase(), n: name, a: '', c: num });
      $('cpManName').value = ''; $('cpManNum').value = '';
      renderStats();
    });
    on('cpReset', () => api.confirm('مسح الترتيب العام؟', 'ستُمسح نقاط جميع المشاركين.', () => { if (session) { session.participants = {}; session.rounds = []; saveNow(); renderStats(); } }));
    $('cp_source').addEventListener('change', () => { syncSourceRows(); readForm(); });
    $('cp_game').addEventListener('change', () => { syncSourceRows(); readForm(); });
    document.querySelectorAll('#control input, #control select').forEach(el => el.addEventListener('change', () => { readForm(); bumpIdle(); }));
    $('control').addEventListener('pointerdown', bumpIdle);

    // hidden long-press zone on the broadcast screen (top corner) → open panel
    ['lvHot', 'qzHot'].forEach(hid => {
      const hot = $(hid); if (!hot) return;
      let lp = null;
      hot.addEventListener('pointerdown', () => { lp = setTimeout(() => { api.Sfx.click(); openPanel(); }, 700); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => hot.addEventListener(ev, () => clearTimeout(lp)));
    });
  }

  /** plays the selected music for a few seconds so the host can check the phone's sound */
  function testSound() {
    api.Sfx.unlock();
    const N = Native(); if (N && N.ensureMediaVolume) try { N.ensureMediaVolume(); } catch (e) { /* */ }
    const M = G.Music; if (!M) return;
    M.setSong(cfg.musicSong === 'auto' ? 'arena' : (cfg.musicSong || 'arena'));
    M.setVolume(cfg.musicVol); M.setEnabled(true);
    const was = M.playing;
    M.start('play');
    if (!was && !active) setTimeout(() => { if (!active) M.start('calm'); }, 5000);
    setTimeout(renderStats, 600);
  }
  G.testSound = testSound;
  /** main music on the home screen (Arena by default) — needs one touch first on Android */
  G.homeMusic = function (on) {
    const M = G.Music; if (!M) return;
    if (!on || active || cfg.music === false) { if (!active) M.stop(); return; }
    M.setSong(cfg.musicSong === 'auto' ? 'arena' : (cfg.musicSong || 'arena'));
    M.setVolume(cfg.musicVol); M.start('calm');
  };

  function openTikTok() {
    const N = Native();
    let ok = false;
    if (N && N.openTikTok) try { ok = N.openTikTok(); } catch (e) { /* */ }
    if (!ok) api.alert('TikTok', 'لم نجد تطبيق TikTok على هذا الهاتف. تأكد من تثبيته أو افتحه يدوياً.');
  }

  /* ---------------- public API ---------------- */
  G.Live = {
    init(a) {
      api = a;
      saved = load();
      G.Quiz.init({ cfg: () => cfg, session: () => session, save, Sfx: a.Sfx });
      if (saved && saved.savedAt && Date.now() - saved.savedAt > 12 * 3600e3) saved = null;
      wire();
    },
    get active() { return active; },
    openPanel, closePanel,
    /** Home button: start a quiz session right away with fake viewers (to see the game) */
    quickDemo() {
      if (active) return goBroadcast();
      cfg.game = 'quiz'; cfg.source = 'sim';
      fillForm(); startSession(false);
    },
    onPhase, onProgress, onResult,
    onBack() {
      if (!active) return false;
      if (api.screen() === 'control') { closePanel(); return true; }
      openPanel(); return true;
    },
    onAppPause() { saveNow(); },
    parseAnswer, walkEuler, normChat, actions,
    _feed: c => onChat(c), _gift: g => onGiftMsg(g),       // test hooks (same path as TikTok comments / gifts)
    _debug: () => ({ cfg, session, round, connState, sched })
  };
})(window);
