/* =========================================================================
 * «صح أم خطأ» — yes / no elimination game for TikTok LIVE
 *
 * Exposes the same interface as the quiz (G.Quiz) so the shared control panel,
 * comment connectors, autosave and volume keys (live.js) drive it unchanged.
 *
 * Round:
 *   lobby  : viewers write «العب» to join (lobbyTime s). Late comers wait for the next round.
 *   ready  : 3 s
 *   question: a statement (no «هل»), answer نعم / لا in any language. FIRST answer is final.
 *   fall   : the middle floor (no answer) and the wrong floor drop; those players become spectators.
 *            Spectators' comments are ignored. A spectator who sends a gift comes back at the next
 *            question (max reviveMax times per round), except in the final stage (≤ finalAt players).
 *   end    : one player left → winner (big photo + applause). Everybody fell → no winner. → lobby again.
 * ========================================================================= */
(function (G) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = a => a[(Math.random() * a.length) | 0];
  let api = null;
  const cfg = () => (api ? api.cfg() : {});
  const S = () => (api ? api.session() : null);
  const num = (v, d) => { const n = Number(v); return v === '' || v == null || !isFinite(n) ? d : n; };

  /* ---------------- words (all languages) ---------------- */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ْـ]/g, '')                  // harakat + tatweel
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')       // é → e, ã → a, ı stays
      .replace(/ı/g, 'i');
  }
  const dedup = w => w.replace(/(.)\1+/g, '$1');              // yesss → yes, لااا → لا
  const YES = ['نعم', 'نعام', 'ايه', 'ايوه', 'ايوا', 'اه', 'واه', 'صح', 'صحيح', 'اكيد', 'اجل', 'بلي', 'مزيان', 'يس',
    'yes', 'yeah', 'yep', 'yup', 'ya', 'yea', 'true', 'right', 'correct', 'ok', 'okay', 'oui', 'ouai', 'ouais', 'vrai', 'wi',
    'si', 'verdad', 'cierto', 'evet', 'dogru', 'ja', 'sim', 'da', 'ih', 'iyeh', 'naam', 'na3am', 'sah', 's7i7', 'sa7', 'aah', 'ah', 'eyh', 'iyeh'];
  const NO = ['لا', 'لالا', 'كلا', 'ابدا', 'غلط', 'غالط', 'خطا', 'خاطي', 'خاطيء', 'ماشي', 'نو', 'لاء',
    'no', 'nope', 'nah', 'nop', 'false', 'wrong', 'non', 'faux', 'falso', 'hayir', 'yanlis', 'nein', 'nao', 'net', 'uhu', 'la', 'ghalat', 'khata'];
  const JOIN = ['العب', 'لعب', 'نلعب', 'العبو', 'نلعبو', 'بغيت نلعب', 'play', 'jouer', 'joue', 'juego', 'jugar', 'oyna', 'spielen', 'jogar', 'gioca', 'join'];
  const YES_K = new Set(YES.map(w => dedup(norm(w)))), NO_K = new Set(NO.map(w => dedup(norm(w)))), JOIN_K = new Set(JOIN.map(w => dedup(norm(w))));
  const YES_EMO = /✅|✔|👍|⭕|☑/, NO_EMO = /❌|✖|👎|⛔|🚫/;
  /** 'yes' | 'no' | null (nothing clear, or both) */
  function yesNo(text) {
    const raw = String(text || '');
    let y = YES_EMO.test(raw), n = NO_EMO.test(raw);
    const words = norm(raw).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
    for (const w0 of words) {
      const w = dedup(w0);
      if (w === '1') y = true; else if (w === '2') n = true;
      else if (YES_K.has(w)) y = true; else if (NO_K.has(w)) n = true;
    }
    if (y && n) return null;
    return y ? 'yes' : n ? 'no' : null;
  }
  function isJoin(text) {
    const t = norm(text).replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();
    if (/🎮/.test(text)) return true;
    const ws = t.split(/\s+/).map(dedup);
    return ws.some(w => JOIN_K.has(w)) || JOIN_K.has(dedup(t));
  }

  /* ---------------- statements ---------------- */
  const W = () => window.QUIZ_WORLD || { countries: [] };
  function generated(level) {
    // capitals / flags (world data), opposites, translations, plurals, quick maths — true or false at random
    const truth = Math.random() < 0.5;
    const r = Math.random();
    const cs = W().countries.filter(c => c.cap && c.cap.ar && (level === 1 ? c.tier === 1 : level === 2 ? c.tier <= 2 : true)
      && !c.ar.some(n => norm(n) === norm(c.cap.ar)));
    if (r < 0.26 && cs.length > 4) {                        // «عاصمة روسيا هي كانبيرا»
      const c = rnd(cs), o = truth ? c : rnd(cs.filter(x => x.c !== c.c && norm(x.cap.ar) !== norm(c.cap.ar)));
      return { id: 'cap:' + c.c + (truth ? '' : ':' + o.c), truth, text: 'عاصمة ' + c.ar[0] + ' هي ' + o.cap.ar,
        fix: truth ? '' : 'عاصمة ' + c.ar[0] + ' هي ' + c.cap.ar };
    }
    if (r < 0.44 && cs.length > 4) {                        // flag picture
      const c = rnd(cs), o = truth ? c : rnd(cs.filter(x => x.c !== c.c));
      return { id: 'flag:' + c.c + (truth ? '' : ':' + o.c), truth, text: 'هذا علم ' + o.ar[0], flag: c.c.toLowerCase(), fix: truth ? '' : 'هذا علم ' + c.ar[0] };
    }
    const OP = window.TF_OPPOSITES || [], WD = window.QUIZ_WORDS || [], PL = window.TF_PLURALS || [];
    if (r < 0.62 && OP.length) {                            // «ضد سريع هو مسرع»
      const x = rnd(OP), ans = truth ? x[1] : rnd(x[2]);
      return { id: 'op:' + x[0] + ':' + ans, truth, text: 'ضدّ «' + x[0] + '» هو «' + ans + '»', fix: truth ? '' : 'ضدّ «' + x[0] + '» هو «' + x[1] + '»' };
    }
    if (r < 0.8 && WD.length > 4) {                         // «ترجمة cat هي كلب»
      const x = rnd(WD), fr = level >= 2 && Math.random() < 0.45;
      const w = [].concat(fr ? x[3] : x[2])[0];
      const o = truth ? x : rnd(WD.filter(y => y[0] !== x[0]));
      return { id: 'tr:' + w + ':' + o[0], truth, text: 'ترجمة «' + w + '» ' + (fr ? 'من الفرنسية ' : '') + 'هي «' + o[0] + '»', fix: truth ? '' : 'ترجمة «' + w + '» هي «' + x[0] + '»' };
    }
    if (r < 0.88 && PL.length) {                            // plurals
      const x = rnd(PL), ans = truth ? x[1] : x[2];
      return { id: 'pl:' + x[0] + ':' + ans, truth, text: 'جمع «' + x[0] + '» هو «' + ans + '»', fix: truth ? '' : 'جمع «' + x[0] + '» هو «' + x[1] + '»' };
    }
    // quick maths
    let a, b, op, res;
    if (level === 1) { a = 2 + ((Math.random() * 30) | 0); b = 2 + ((Math.random() * 30) | 0); op = '+'; res = a + b; }
    else { a = 3 + ((Math.random() * 9) | 0); b = 3 + ((Math.random() * 9) | 0); op = '×'; res = a * b; }
    const shown = truth ? res : res + rnd([-2, -1, 1, 2, 10, -10]);
    return { id: 'm:' + a + op + b + '=' + shown, truth, text: a + ' ' + op + ' ' + b + ' = ' + shown, fix: truth ? '' : a + ' ' + op + ' ' + b + ' = ' + res };
  }
  function nextStatement(level) {
    const used = st.used;
    for (let k = 0; k < 40; k++) {
      let q = null;
      if (Math.random() < 0.45) {
        const pool = (window.TF_BANK || []).filter(x => x[0] === level && !used.has('b:' + x[2]));
        if (pool.length) { const x = rnd(pool); q = { id: 'b:' + x[2], truth: x[1], text: x[2], fix: x[3] || '' }; }
      }
      if (!q) q = generated(level);
      if (q && !used.has(q.id)) { used.add(q.id); if (used.size > 3000) used.clear(); return q; }
    }
    const x = rnd(window.TF_BANK); return { id: 'b:' + x[2], truth: x[1], text: x[2], fix: x[3] || '' };
  }

  /* ---------------- announcer (voice) ---------------- */
  const LINES = {
    lobby: ['يلا يلا! اكتبوا «العب» في التعليقات باش تدخلو معانا!', 'مرحبا بكم في صح أم خطأ! اكتب «العب» باش تشارك!', 'العب، العب، العب! اكتبوها في التعليقات وادخلو معانا!'],
    lobbyEnd: ['باقي غير عشر ثواني! اللي ما كتبش «العب» دابا غادي يبقى يتفرج!', 'آخر فرصة! اكتبوا «العب» دابا!'],
    lobbyMore: ['مازال خاصنا لاعبين! اكتبوا «العب» باش نبداو!'],
    start: ['يلا نبداو! ركزو معايا مزيان!', 'بسم الله، نبداو الجولة! جاوبوا بنعم ولا لا!', 'الجولة بدات! أول جواب هو اللي كيتحسب!'],
    hurry: ['زرب زرب زرب!', 'يلا يلا، باقي خمس ثواني!', 'أسرع! الوقت غادي يسالي!'],
    fallMany: ['أوووه! طاحو بالجملة! ما تقلقوش، إن شاء الله الجولة الجاية!', 'ههه طاح بزاف ديال الناس! صعيبة هادي!', 'يا سلام! نص اللاعبين طاحو!'],
    fallFew: ['طاحو شي واحدين، مساكن!', 'خسارة! ما تقلقوش، إن شاء الله المرة الجاية!', 'أوه! كاين اللي طاح!'],
    none: ['ما شاء الله عليكم! حتى واحد ما طاح!', 'عباقرة! كلكم جاوبتو صح!', 'برافو! حتى واحد ما طاح!'],
    noAnswer: ['واللي ما جاوبش حتى هو طاح! الجواب واجب يا أصدقاء!'],
    reviveHint: ['طحتي؟ ماشي مشكل! صيفط هدية وترجع للعبة!', 'اللي طاح وبغا يرجع، يصيفط هدية ويرجع معانا!'],
    revived: ['مرحبا بيك من جديد {n}! رجعتي للعبة!', 'رجع {n} للساحة! مرحبا بيك!'],
    final: ['بقاو غير {n}! بدات المرحلة النهائية! ما كاين رجوع دابا، حتى بالهدية!'],
    finalGift: ['شكراً على الهدية {n}! ولكن فالمرحلة النهائية ما كاين رجوع. نتسناوك فالجولة الجاية!'],
    maxRevive: ['شكراً على الهدية {n}! ولكن رجعتي ديجا مرتين فهاد الجولة.'],
    three: ['بقاو غير ثلاثة! شكون فيكم البطل؟', 'ثلاثة بقاو! التوتر طالع!'],
    two: ['بقاو غير جوج! واحد فيكم غادي يربح!'],
    winner: ['مبروووك {n}! نتا هو البطل ديال هاد الجولة!', 'برافو {n}! البطل ديالنا! مبروك!'],
    nowinner: ['أوووه! طاحو كاملين! ما كاين حتى فايز هاد المرة. نعاودو من جديد!', 'ههه حتى واحد ما بقا! نعاودو الجولة من الأول!'],
    thanks: ['شكراً {n} على الهدية!', 'الله يخليك {n}، شكراً على الدعم!']
  };
  const line = (k, v) => { let t = rnd(LINES[k] || ['']); if (v) for (const x in v) t = t.split('{' + x + '}').join(v[x]); return t; };
  const Voice = {
    busyUntil: 0,
    native() { try { return window.AndroidBridge && window.AndroidBridge.speak ? window.AndroidBridge : null; } catch (e) { return null; } },
    speak(text, interrupt) {
      if (!text || cfg().voice === 'off') return;
      const rate = num(cfg().voiceRate, 1);
      const ms = 900 + String(text).length * 75 / rate;
      this.busyUntil = Date.now() + ms;
      if (G.Music) { G.Music.duck(true); clearTimeout(this._t); this._t = setTimeout(() => { if (Date.now() >= this.busyUntil && G.Music) G.Music.duck(phase === 'question' && left() <= 5); }, ms); }
      const N = this.native();
      if (N) { try { N.speak(String(text), rate, !!interrupt); } catch (e) { /* */ } return; }
      if (!window.speechSynthesis) return;
      try {
        if (interrupt) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
        const vs = speechSynthesis.getVoices();
        u.voice = vs.find(v => /ar[-_]MA/i.test(v.lang)) || vs.find(v => /^ar/i.test(v.lang)) || null;
        u.lang = u.voice ? u.voice.lang : 'ar-SA'; u.rate = rate;
        speechSynthesis.speak(u);
      } catch (e) { /* */ }
    },
    stop() { const N = this.native(); if (N && N.stopSpeaking) try { N.stopSpeaking(); } catch (e) { /* */ } if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* */ } }
  };
  const say = (k, v, interrupt) => Voice.speak(line(k, v), interrupt);

  /* ---------------- state ---------------- */
  let phase = 'idle', phaseEnds = 0, paused = false, pausedLeft = 0, tickTimer = null;
  let st = null;          // { round, qNo, used:Set, players:{uid:{n,a,alive,revives,ans,el}}, q, finalSaid, reviveHinted, lastHurry }
  const left = () => Math.max(0, Math.ceil((phaseEnds - Date.now()) / 1000));
  function freshRound() {
    const used = st ? st.used : new Set();
    st = { round: (st ? st.round : 0) + 1, qNo: 0, used, players: {}, q: null, finalSaid: false, reviveHinted: false, hurry: false, lobbyWarn: false };
  }
  const alive = () => Object.keys(st.players).filter(u => st.players[u].alive);
  const level = () => { const n = alive().length; const q = st.qNo; return n <= 10 || q >= 12 ? 3 : q >= 5 ? 2 : 1; };
  function setPhase(p, ms) { phase = p; phaseEnds = ms ? Date.now() + ms : 0; music(); render(); }

  /* ---------------- rounds ---------------- */
  function lobby() {
    clearStage(); freshRound();
    setPhase('lobby', num(cfg().lobbyTime, 60) * 1000);
    say('lobby', null, true);
  }
  function join(uid, p, quiet) {
    if (st.players[uid]) return false;
    st.players[uid] = { n: p.n, a: p.a, alive: true, revives: 0, ans: null };
    placeMiddle(uid, true);
    if (!quiet) api.Sfx.select();
    return true;
  }
  function startQuestions() {
    if (alive().length < Math.max(1, num(cfg().minPlayers, 2))) {
      say('lobbyMore'); setPhase('lobby', 30000); return;
    }
    setPhase('ready', 3500);
    say('start', null, true);
  }
  function ask() {
    // bring back the players revived by a gift, everybody stands in the middle
    Object.keys(st.players).forEach(u => { const pl = st.players[u]; if (pl.reviveNext) { pl.reviveNext = false; pl.alive = true; placeMiddle(u, true); } });
    st.qNo++; st.hurry = false;
    alive().forEach(u => { st.players[u].ans = null; placeMiddle(u); });
    const n = alive().length;
    if (n <= num(cfg().finalAt, 10) && !st.finalSaid && st.qNo > 1) { st.finalSaid = true; }
    st.q = nextStatement(level());
    st.q.start = Date.now();
    setPhase('question', num(cfg().qTime, 15) * 1000);
    Voice.speak(st.q.text + '… نعم ولا لا؟', true);
  }
  function close() {
    // grace: answers that were written before the end but arrive late through the stream delay
    const g = Math.max(0, Math.min(10, num(cfg().grace, 3)));
    if (g > 0 && !st.q.collecting) { st.q.collecting = true; setPhase('collect', g * 1000); return; }
    fall();
  }
  function fall() {
    const right = st.q.truth ? 'yes' : 'no';
    const before = alive();
    const out = before.filter(u => st.players[u].ans !== right);
    const silent = before.filter(u => !st.players[u].ans).length;
    out.forEach(u => { st.players[u].alive = false; st.players[u].outQ = st.qNo; });
    st.lastOut = out.length; st.lastSilent = silent;
    const s = S(); before.forEach(u => { const p = s && s.participants[u]; if (p && st.players[u].ans === right) { p.correct = (p.correct || 0) + 1; } });
    setPhase('fall', 4200);
    dropFloors(right, out);
    api.Sfx.lose();
    setTimeout(() => {
      if (!out.length) say('none');
      else if (out.length === before.length) { /* everybody: said at the end */ }
      else say(out.length >= before.length / 2 ? 'fallMany' : 'fallFew');
      if (silent && out.length < before.length && Math.random() < 0.4) setTimeout(() => say('noAnswer'), 2600);
    }, 900);
  }
  function afterFall() {
    const n = alive().length;
    if (n === 0) { setPhase('nowinner', 7000); say('nowinner', null, true); api.Sfx.lose(); return; }
    if (n === 1) {
      const u = alive()[0], pl = st.players[u];
      const s = S(); const p = s && s.participants[u]; if (p) { p.wins = (p.wins || 0) + 1; p.pts = (p.pts || 0) + 100; }
      st.winner = u; setPhase('winner', 10000);
      say('winner', { n: pl.n }, true); api.Sfx.fanfare(); setTimeout(() => api.Sfx.applause(), 400);
      return;
    }
    const finalAt = num(cfg().finalAt, 10);
    if (n <= finalAt && !st.finalAnnounced) { st.finalAnnounced = true; setPhase('final', 4500); say('final', { n }, true); return; }
    if (n === 3 && !st.said3) { st.said3 = true; say('three'); }
    else if (n === 2 && !st.said2) { st.said2 = true; say('two'); }
    else if (st.lastOut && !st.reviveHinted && num(cfg().reviveMax, 2) > 0 && n > finalAt) { st.reviveHinted = true; setTimeout(() => say('reviveHint'), 300); }
    setPhase('gap', 2500);
  }

  function tick() {
    if (phase === 'idle' || paused) return;
    const now = Date.now();
    if (phase === 'lobby') {
      if (!st.lobbyWarn && phaseEnds - now <= 10000) { st.lobbyWarn = true; say('lobbyEnd'); }
      renderLobby();
    }
    if (phase === 'question') {
      const l = left();
      if (l <= 5 && !st.hurry) { st.hurry = true; say('hurry'); }
      if (l <= 5 && l > 0 && st.lastTick !== l) { st.lastTick = l; api.Sfx.tick(l <= 3); }
      if (G.Music) G.Music.duck(l <= 5 || Date.now() < Voice.busyUntil);
      renderTimer();
    }
    if (!phaseEnds || now < phaseEnds) return;
    if (phase === 'lobby') return startQuestions();
    if (phase === 'ready') return ask();
    if (phase === 'question') return close();
    if (phase === 'collect') return fall();
    if (phase === 'fall') return afterFall();
    if (phase === 'final' || phase === 'gap') return ask();
    if (phase === 'winner' || phase === 'nowinner') return lobby();
  }

  /* ---------------- comments & gifts ---------------- */
  function onChat(c, p, uid) {
    if (phase === 'idle') return 'اللعبة متوقفة';
    const text = String(c.c || '');
    const pl = st.players[uid];
    if (phase === 'lobby') {
      if (pl) return 'مسجّل ✓';
      if (isJoin(text)) { join(uid, p); renderLobby(); return 'انضم ✓'; }
      return 'ليس «العب»';
    }
    if (!pl) return isJoin(text) ? 'الجولة بدأت — ينتظر الجولة القادمة' : 'ليس لاعباً';
    if (!pl.alive) return 'متفرج (سقط)';
    if (phase !== 'question' && phase !== 'collect') return 'خارج وقت السؤال';
    if (pl.ans) return 'أجاب من قبل (' + (pl.ans === 'yes' ? 'نعم' : 'لا') + ')';
    const a = yesNo(text);
    if (!a) return 'ليس نعم / لا';
    if (phase === 'collect' && (c.ts && c.ts > st.q.start + num(cfg().qTime, 15) * 1000)) return 'متأخر';
    pl.ans = a;
    moveTo(uid, a);
    renderCounts();
    return a === 'yes' ? 'نعم ✓' : 'لا ✓';
  }
  function onGift(g, p) {
    const coins = Math.max(1, Number(g.coins) || 1) * Math.max(1, Number(g.count) || 1);
    p.coins = (p.coins || 0) + coins; p.gifts = (p.gifts || 0) + Math.max(1, Number(g.count) || 1);
    const s = S(); if (s) { s.coins = (s.coins || 0) + coins; s.gifts = (s.gifts || 0) + Math.max(1, Number(g.count) || 1); }
    const uid = g.u || p.n;
    if (!st || phase === 'idle') return 'هدية';
    let pl = st.players[uid];
    let why = 'هدية 🎁';
    if (!pl) {
      // not registered: a gift registers the viewer (in the lobby now, otherwise for the next question)
      st.players[uid] = pl = { n: p.n, a: p.a, alive: phase === 'lobby', revives: 0, ans: null };
      if (phase === 'lobby') { placeMiddle(uid, true); why = 'انضم بهدية ✓'; }
      else if (alive().length > num(cfg().finalAt, 10)) { pl.reviveNext = true; why = 'سيدخل في السؤال القادم 🌹'; toast(p, g, 'join'); }
      else { why = 'المرحلة النهائية — الجولة القادمة'; }
      giftThanks(p, g);
      return why;
    }
    if (pl.alive || pl.reviveNext) { giftThanks(p, g); return 'هدية (لاعب في اللعبة)'; }
    // a spectator: comes back at the next question, if allowed
    const max = num(cfg().reviveMax, 2), min = num(cfg().reviveMin, 1);
    if (alive().length <= num(cfg().finalAt, 10)) { say('finalGift', { n: p.n }); giftThanks(p, g, true); return 'لا عودة في المرحلة النهائية'; }
    if (max <= 0) { giftThanks(p, g); return 'العودة متوقفة'; }
    if (pl.revives >= max) { say('maxRevive', { n: p.n }); giftThanks(p, g, true); return 'استعمل كل العودات'; }
    if (coins < min) { giftThanks(p, g); return 'هدية أقل من الحد'; }
    pl.revives++; pl.reviveNext = true;
    toast(p, g, 'revive', pl.revives, max);
    say('revived', { n: p.n });
    api.Sfx.win();
    if (phase === 'gap' || phase === 'final' || phase === 'ready') { /* will be placed at ask() */ }
    return 'سيعود في السؤال القادم 🌹 (' + pl.revives + '/' + max + ')';
  }

  /* =================================================================
   * DRAWING — a bright 3D room (CSS 3D), three floors, little 3D people
   * ================================================================= */
  const COLORS = ['#3B82F6', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6', '#22C55E', '#EF4444', '#06B6D4', '#F97316', '#A855F7'];
  function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
  function personHtml(pl, uid) {
    const col = COLORS[hash(uid) % COLORS.length];
    const initial = esc((pl.n || '?').trim().charAt(0).toUpperCase());
    const img = pl.a && /^https:\/\//.test(pl.a) ? `<img src="${esc(pl.a)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : '';
    return `<div class="tp-in"><div class="tp-tag">${esc(pl.n)}</div><div class="tp-head" style="--c:${col}"><b>${initial}</b>${img}</div>
      <svg class="tp-body" viewBox="0 0 40 46"><defs><linearGradient id="g${hash(uid)}" x1="0" x2="1"><stop offset="0" stop-color="${col}"/><stop offset=".55" stop-color="${col}" stop-opacity=".85"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
      <rect x="9" y="30" width="9" height="15" rx="4" fill="#2B2F45"/><rect x="22" y="30" width="9" height="15" rx="4" fill="#2B2F45"/>
      <rect x="3" y="6" width="7" height="20" rx="3.5" fill="${col}"/><rect x="30" y="6" width="7" height="20" rx="3.5" fill="${col}"/>
      <rect x="8" y="2" width="24" height="31" rx="9" fill="url(#g${hash(uid)})"/><ellipse cx="16" cy="9" rx="5" ry="3" fill="#fff" opacity=".35"/></svg></div>`;
  }
  const els = {};          // uid -> element
  function clearStage() { Object.keys(els).forEach(u => { els[u].remove(); delete els[u]; }); }
  // floor coordinates: x ∈ [0,1] across the 3 floors (0 = left edge of «لا», 1 = right edge of «نعم»), y ∈ [0,1] back→front
  const ZONES = { no: [0.02, 0.31], mid: [0.355, 0.645], yes: [0.69, 0.98] };
  function spot(zone) {
    const [a, b] = ZONES[zone];
    return [a + 0.03 + Math.random() * (b - a - 0.06), 0.3 + Math.random() * 0.62];
  }
  function ensureEl(uid) {
    let el = els[uid];
    if (!el) {
      const pl = st.players[uid];
      el = document.createElement('div'); el.className = 'tp'; el.innerHTML = personHtml(pl, uid);
      el.style.setProperty('--d', (-Math.random() * 1.2).toFixed(2) + 's');
      $('tfFloor').appendChild(el); els[uid] = el;
      el.classList.add('drop-in'); setTimeout(() => el.classList.remove('drop-in'), 700);
    }
    return el;
  }
  function setPos(el, x, y) { el.style.left = (x * 100).toFixed(2) + '%'; el.style.top = (y * 100).toFixed(2) + '%'; el.style.zIndex = String(10 + Math.round(y * 100)); }
  function placeMiddle(uid, fresh) {
    const el = ensureEl(uid); el.classList.remove('fall', 'walk');
    const [x, y] = spot('mid');
    if (!fresh) el.classList.add('walk');
    setPos(el, x, y);
    if (!fresh) setTimeout(() => el.classList.remove('walk'), 900);
  }
  function moveTo(uid, a) {
    const el = ensureEl(uid);
    const [x, y] = spot(a === 'yes' ? 'yes' : 'no');
    el.classList.add('walk'); setPos(el, x, y);
    setTimeout(() => el.classList.remove('walk'), 950);
  }
  function dropFloors(right, out) {
    const wrong = right === 'yes' ? 'no' : 'yes';
    ['mid', wrong].forEach(z => $('tf_' + z).classList.add('open'));
    out.forEach((u, i) => { const el = els[u]; if (!el) return; setTimeout(() => el.classList.add('fall'), 250 + Math.random() * 250); setTimeout(() => { el.remove(); delete els[u]; }, 1900); });
    setTimeout(() => ['mid', wrong].forEach(z => $('tf_' + z).classList.remove('open')), 2600);
  }

  /* ---------------- render ---------------- */
  function applyLayout() {
    const hud = $('quizHud'); if (!hud) return;
    const free = Math.max(0, Math.min(55, num(cfg().freeSpace, 40)));
    const top = Math.max(0, Math.min(25, num(cfg().topSpace, 13)));
    hud.style.setProperty('--free', free + 'vh');
    hud.style.setProperty('--top', top + 'vh');
    hud.classList.toggle('tight', free + top >= 50);
    const g = $('qzGuides'); if (g) g.classList.toggle('on', !!cfg().showGuides);
  }
  function render() {
    const hud = $('quizHud'); if (!hud) return;
    applyLayout();
    hud.dataset.phase = phase;
    // camera: a slow left/right sway all the time (CSS), plus a "shot" per moment of the game
    const cam = $('tfCam');
    if (cam) {
      let shot = 'wide';
      if (phase === 'question' || phase === 'collect') shot = 'q';
      if (phase === 'fall' && st && st.q) shot = st.q.truth ? 'fall-no' : 'fall-yes';   // the wrong floor drops: look at it
      if (phase === 'winner') shot = 'win';
      if (phase === 'lobby') shot = 'lobby';
      cam.dataset.shot = shot;
    }
    hud.classList.toggle('paused', paused);
    const card = $('tfCard'), big = $('tfBig');
    big.className = 'tf-big'; big.innerHTML = '';
    if (phase === 'lobby') renderLobby();
    else if (phase === 'ready') card.innerHTML = `<div class="tf-lobby"><b>استعدّوا! 🔥</b><small>أجيبوا بـ «نعم» أو «لا» · أول إجابة هي النهائية</small></div>`;
    else if (st && st.q && (phase === 'question' || phase === 'collect' || phase === 'fall')) {
      const q = st.q;
      card.innerHTML = `<div class="tf-q"><span class="tf-no">${st.qNo}</span><div class="tf-qt">${q.flag ? `<img class="tf-flag" src="flags/${q.flag}.svg" alt="">` : ''}<b>${esc(q.text)}</b></div>
        <span class="tf-timer" id="tfTimer"><i></i><em id="tfSec">${left()}</em></span></div>`;
      if (phase === 'fall') {
        big.className = 'tf-big on ' + (q.truth ? 'yes' : 'no');
        const fell = st.lastOut;
        big.innerHTML = `<div class="tf-ans">الإجابة: ${q.truth ? 'نعم ✓' : 'لا ✗'}</div>${q.fix ? `<div class="tf-fix">${esc(q.fix)}</div>` : ''}
          <div class="tf-out">${fell ? 'سقط ' + players(fell) : 'لم يسقط أحد! 👏'}</div>`;
      }
      renderTimer();
    } else if (phase === 'final') {
      card.innerHTML = `<div class="tf-lobby final"><b>🔥 المرحلة النهائية</b><small>بقي ${alive().length} · لا عودة بعد الآن، حتى بالهدية</small></div>`;
    } else if (phase === 'gap') {
      card.innerHTML = `<div class="tf-lobby"><b>بقي ${players(alive().length)}</b><small>السؤال التالي…</small></div>`;
    } else if (phase === 'winner') {
      const pl = st.players[st.winner];
      card.innerHTML = `<div class="tf-lobby final"><b>👑 بطل الجولة</b></div>`;
      big.className = 'tf-big on win';
      big.innerHTML = `<div class="tf-win"><div class="tf-crown">👑</div><div class="tf-wphoto">${personHead(pl, st.winner)}</div><div class="tf-wname">${esc(pl.n)}</div><div class="tf-confetti">${'<i></i>'.repeat(18)}</div></div>`;
    } else if (phase === 'nowinner') {
      card.innerHTML = `<div class="tf-lobby"><b>سقط الجميع! 😅</b><small>لا يوجد فائز هذه المرة · نعيد الجولة</small></div>`;
      big.className = 'tf-big on none'; big.innerHTML = `<div class="tf-ans">لا يوجد فائز</div><div class="tf-fix">جولة جديدة بعد قليل…</div>`;
    } else if (phase === 'idle') card.innerHTML = '';
    renderCounts();
    $('tfPaused').classList.toggle('on', paused);
  }
  /** Arabic number agreement: لاعب واحد / لاعبان / 3 لاعبين / 11 لاعباً */
  function players(n) { return n === 1 ? 'لاعب واحد' : n === 2 ? 'لاعبان' : n >= 3 && n <= 10 ? n + ' لاعبين' : n + ' لاعباً'; }
  function personHead(pl, uid) {
    const col = COLORS[hash(uid) % COLORS.length];
    const img = pl.a && /^https:\/\//.test(pl.a) ? `<img src="${esc(pl.a)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : '';
    return `<span class="tf-ph" style="--c:${col}"><b>${esc((pl.n || '?').trim().charAt(0).toUpperCase())}</b>${img}</span>`;
  }
  function renderLobby() {
    if (phase !== 'lobby') return;
    const n = Object.keys(st.players).length;
    // build the card once, then only update the numbers (rebuilding would restart its animation)
    if (!$('tfLobN')) $('tfCard').innerHTML = `<div class="tf-lobby"><b>اكتب «العب» في التعليقات للمشاركة 🎮</b><small>المسجّلون: <span class="tf-cnt" id="tfLobN"></span> · تبدأ الأسئلة بعد <span class="tf-cnt" id="tfLobT"></span> ث</small></div>`;
    $('tfLobN').textContent = n; $('tfLobT').textContent = left();
    renderCounts();
  }
  function renderTimer() {
    const t = $('tfTimer'); if (!t || !st || !st.q) return;
    const total = num(cfg().qTime, 15);
    const l = phase === 'question' ? left() : 0;
    $('tfSec').textContent = l;
    t.style.setProperty('--p', (l / total).toFixed(3));
    t.classList.toggle('low', l <= 5);
  }
  function renderCounts() {
    const b = $('tfBar'); if (!b) return;
    if (!st || phase === 'idle') { b.innerHTML = ''; return; }
    const al = alive();
    const yes = al.filter(u => st.players[u].ans === 'yes').length, no = al.filter(u => st.players[u].ans === 'no').length;
    const fin = al.length <= num(cfg().finalAt, 10) && st.qNo > 0;
    b.innerHTML = phase === 'lobby'
      ? `<span class="tb mid">🎮 ${players(Object.keys(st.players).length)}</span>`
      : `<span class="tb no">لا ✗ ${no}</span><span class="tb mid">؟ ${al.length - yes - no}</span><span class="tb yes">نعم ✓ ${yes}</span>`
        + `<span class="tb left">باقٍ ${al.length}</span>${fin ? '<span class="tb fin">🔥 لا عودة</span>' : ''}`;
  }

  /* ---------------- gift cards ---------------- */
  function giftIcon(g) {
    return g && g.gimg && /^https:\/\//.test(g.gimg) ? `<img src="${esc(g.gimg)}" referrerpolicy="no-referrer" alt="" onerror="this.replaceWith('🎁')">` : (/rose/i.test((g && g.gname) || '') ? '🌹' : '🎁');
  }
  const giftQ = []; let giftBusy = false;
  function showCard(html, cls, ms) {
    giftQ.push({ html, cls, ms }); nextCard();
  }
  function nextCard() {
    if (giftBusy || !giftQ.length) return;
    const { html, cls, ms } = giftQ.shift(); giftBusy = true;
    const el = document.createElement('div'); el.className = 'tf-toast ' + (cls || ''); el.innerHTML = html;
    $('tfToasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), ms - 400);
    setTimeout(() => { el.remove(); giftBusy = false; nextCard(); }, ms);
  }
  function giftThanks(p, g, quiet) {
    if (cfg().giftThanks === false) return;
    const uid = g.u || p.n;
    showCard(`${personHead(p, uid)}<div><b>${esc(p.n)}</b><small>شكراً ❤️ ${giftIcon(g)}${g.gname ? ' ' + esc(g.gname) : ''}${g.count > 1 ? ' ×' + g.count : ''}</small></div>`, 'thx', 1000 * num(cfg().giftShow, 4));
    if (cfg().applause !== false) api.Sfx.applause();
    if (!quiet && Math.random() < 0.5) say('thanks', { n: p.n });
  }
  function toast(p, g, kind, k, max) {
    const uid = g.u || p.n;
    const txt = kind === 'revive' ? `عاد إلى اللعبة ${giftIcon(g)} <em>(${k}/${max})</em>` : `ينضم في السؤال القادم ${giftIcon(g)}`;
    showCard(`${personHead(p, uid)}<div><b>${esc(p.n)}</b><small>${txt}</small></div>`, 'rev', 4200);
  }

  /* ---------------- music ---------------- */
  function music() {
    const M = G.Music; if (!M) return;
    if (phase === 'idle' || cfg().music === false) { M.stop(); return; }
    M.setVolume(num(cfg().musicVol, 0.5));
    M.rotateEvery(cfg().musicRotate || 15);
    M.setSong(cfg().musicSong || 'arena');
    M.setEnabled(true);
    const m = paused ? 'chill' : phase === 'lobby' || phase === 'nowinner' ? 'calm' : phase === 'question' ? (left() <= 5 ? 'hot' : 'play') : phase === 'winner' ? 'calm' : 'roll';
    M.start(m); M.mode(m);
  }

  /* ---------------- host controls (same names as the quiz) ---------------- */
  const ctl = {
    next() {                                    // volume + : move on
      paused = false;
      if (phase === 'lobby') return startQuestions();
      if (phase === 'question') return close();
      if (phase === 'collect') return fall();
      if (phase === 'ready' || phase === 'gap' || phase === 'final') return ask();
      if (phase === 'winner' || phase === 'nowinner') return lobby();
    },
    newTopic() { paused = false; lobby(); },
    reveal() { if (phase === 'question') close(); else if (phase === 'collect') fall(); },
    togglePause() {
      if (phase === 'idle') return;
      if (!paused) { paused = true; pausedLeft = Math.max(0, phaseEnds - Date.now()); Voice.stop(); }
      else { paused = false; if (phaseEnds) phaseEnds = Date.now() + pausedLeft; }
      render(); music();
    },
    showBoard() { }, hideBoard() { }, support() { }, share() { }, replayQuestion() { },
    restart() { paused = false; lobby(); }
  };

  G.Quiz = {
    CATS: [],
    LABELS: { cpNew: '▶️ جولة جديدة («العب»)', cpPause: '⏸️ إيقاف / متابعة', cpReveal: '👁️ إنهاء الوقت الآن', cpNext: '⏭️ التالي', cpReplay: '🔁 جولة جديدة' },
    init(a) { api = a; },
    applyLayout, music,
    start() {
      paused = false; st = null;
      clearInterval(tickTimer); tickTimer = setInterval(tick, 200);
      lobby();
    },
    stop() { clearInterval(tickTimer); phase = 'idle'; paused = false; Voice.stop(); clearStage(); render(); if (G.Music) G.Music.stop(); },
    onChat, onGift, ctl,
    simTarget() {
      if (!st) return null;
      if (phase === 'lobby') return { id: 'L' + st.round, right: rnd(['العب', 'العب 🔥', 'play', 'نلعب']), wrong: 'العب' };
      if (phase === 'question' && st.q) { const y = rnd(['نعم', 'yes', 'ايه', 'صح', 'oui', '✅']), n = rnd(['لا', 'no', 'non', 'غلط', '❌']); return { id: 'Q' + st.round + '.' + st.qNo, right: st.q.truth ? y : n, wrong: st.q.truth ? n : y }; }
      return null;
    },
    stats() {
      if (!st) return [['الجولة', '—']];
      const all = Object.keys(st.players).length;
      return [['الجولة', st.round], ['السؤال', st.qNo], ['اللاعبون (باقٍ / الكل)', alive().length + ' / ' + all]];
    },
    yesNo, isJoin,
    get phase() { return phase; },
    get paused() { return paused; },
    _sample: level => generated(level),
    _debug: () => ({ st, phase, phaseEnds, Voice })
  };
})(window);
