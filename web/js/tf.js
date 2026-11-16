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
    const cs = W().countries.filter(c => c.cap && c.cap.ar && (level <= 2 ? c.tier === 1 : level === 3 ? c.tier <= 2 : true)
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
      const x = rnd(WD), fr = level >= 3 && Math.random() < 0.5;
      const w = [].concat(fr ? x[3] : x[2])[0];
      // easy: any other word; hard: a word from the same group (colours, animals, family…) right next to it in the list
      const i = WD.indexOf(x), nearW = WD.slice(Math.max(0, i - 3), i + 4).filter(y => y[0] !== x[0]);
      const o = truth ? x : rnd(level >= 3 && nearW.length ? nearW : WD.filter(y => y[0] !== x[0]));
      return { id: 'tr:' + w + ':' + o[0], truth, text: 'ترجمة «' + w + '» ' + (fr ? 'من الفرنسية ' : '') + 'هي «' + o[0] + '»', fix: truth ? '' : 'ترجمة «' + w + '» هي «' + x[0] + '»' };
    }
    if (r < 0.88 && PL.length) {                            // plurals
      const x = rnd(PL), ans = truth ? x[1] : x[2];
      return { id: 'pl:' + x[0] + ':' + ans, truth, text: 'جمع «' + x[0] + '» هو «' + ans + '»', fix: truth ? '' : 'جمع «' + x[0] + '» هو «' + x[1] + '»' };
    }
    // quick maths: harder numbers and closer wrong results as the level climbs
    let a, b, op, res;
    if (level === 1) { a = 2 + ((Math.random() * 20) | 0); b = 2 + ((Math.random() * 20) | 0); op = '+'; res = a + b; }
    else if (level === 2) { a = 20 + ((Math.random() * 60) | 0); b = 5 + ((Math.random() * 40) | 0); op = Math.random() < 0.5 ? '+' : '−'; if (op === '−' && b > a) [a, b] = [b, a]; res = op === '+' ? a + b : a - b; }
    else if (level === 3) { a = 3 + ((Math.random() * 9) | 0); b = 3 + ((Math.random() * 9) | 0); op = '×'; res = a * b; }
    else { a = 11 + ((Math.random() * 14) | 0); b = 3 + ((Math.random() * 9) | 0); op = '×'; res = a * b; }
    const near = level >= 4 ? [-1, 1, -2, 2, 10, -10] : level === 3 ? [-2, 2, 3, -3, 10] : [-10, 10, -5, 5, 3];
    const shown = truth ? res : res + rnd(near);
    return { id: 'm:' + a + op + b + '=' + shown, truth, text: a + ' ' + op + ' ' + b + ' = ' + shown, fix: truth ? '' : a + ' ' + op + ' ' + b + ' = ' + res };
  }
  function nextStatement(level) {
    const used = st.used;
    for (let k = 0; k < 40; k++) {
      let q = null;
      if (Math.random() < (level >= 4 ? 0.6 : 0.45)) {
        // levels 1–3 use the general bank (its levels 1, 2, 3), levels 4–5 mostly the traps (TF_HARD)
        const src = level >= 4 && Math.random() < 0.7 ? (window.TF_HARD || []).filter(x => x[0] <= level)
          : (window.TF_BANK || []).filter(x => x[0] === Math.min(3, level === 1 ? 1 : level === 2 ? 2 : 3));
        const pool = src.filter(x => !used.has('b:' + x[2]));
        if (pool.length) { const x = rnd(pool); q = { id: 'b:' + x[2], truth: x[1], text: x[2], fix: x[3] || '' }; }
      }
      if (!q) {
        // generated statements come from the fixed pool (recorded by the announcers); live generation only if it runs out
        const pool = (window.TF_POOL || []).filter(x => x[0] === level && !used.has('p:' + x[2]));
        if (pool.length) { const x = rnd(pool); q = { id: 'p:' + x[2], truth: x[1], text: x[2], fix: x[3] || '', flag: x[4] || undefined }; }
        else q = generated(level);
      }
      if (q && !used.has(q.id)) { used.add(q.id); if (used.size > 3000) used.clear(); return q; }
    }
    const x = rnd(window.TF_BANK); return { id: 'b:' + x[2], truth: x[1], text: x[2], fix: x[3] || '' };
  }

  /* ---------------- announcer (voice) ----------------
   * 4 recorded announcers (voice/<id>/<key>.ogg, listed in voice/manifest.js) — chosen in the panel.
   * A sentence that is not recorded (or «صوت الهاتف») is read by the phone's text-to-speech.
   * Sentences are queued so they never cut each other (interrupt = drop the queue). */
  const L = () => window.TF_LINES || {};
  const strip = t => String(t || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const pack = () => { const v = cfg().voice || 'mohamed'; const m = window.TF_VOICE_PACK || {}; return m[v] ? { id: v, keys: m[v] } : null; };
  const Voice = {
    busyUntil: 0, queue: [], cur: null, last: 0,
    native() { try { return window.AndroidBridge && window.AndroidBridge.speak ? window.AndroidBridge : null; } catch (e) { return null; } },
    get speaking() { return !!this.cur || this.queue.length > 0 || Date.now() < this.busyUntil; },
    /** item = { key, text } */
    say(item, interrupt) {
      if (!item || cfg().voice === 'off') return;
      if (interrupt) this.queue.length = 0;             // never cut the sentence being said, just drop the waiting ones
      item.exp = Date.now() + (item.ttl || 9000);       // a sentence that waited too long is not said any more
      this.queue.push(item);
      if (this.queue.length > 9) this.queue.splice(0, this.queue.length - 9);
      if (!this.cur) this.next();
    },
    next() {
      let item = this.queue.shift();
      while (item && item.exp && Date.now() > item.exp) item = this.queue.shift();
      if (!item) { this.cur = null; this.duck(false); return; }
      this.last = Date.now();
      const p = pack();
      if (p && cfg().voice !== 'tts' && p.keys.indexOf(item.key) >= 0) {
        const a = new Audio('voice/' + p.id + '/' + item.key + '.ogg');
        a.volume = 1; this.cur = a; this.duck(true);
        const done = () => { if (this.cur === a) { this.cur = null; this.lastEnd = Date.now(); setTimeout(() => this.next(), item.fast ? 40 : 1000); } };   // a calm pause between sentences (not inside the countdown)
        a.onended = done; a.onerror = () => { if (this.cur === a) { this.cur = null; this.tts(item); } };
        a.play().catch(() => { if (this.cur === a) { this.cur = null; this.tts(item); } });
        return;
      }
      if (cfg().voice !== 'tts') { this.cur = null; this.next(); return; }   // not recorded yet: say nothing (no robot voice)
      this.tts(item);
    },
    tts(item) {
      const text = strip(item.text);
      const rate = num(cfg().voiceRate, 1);
      const ms = 900 + text.length * 75 / rate;
      this.cur = { tts: true }; this.duck(true);
      const tok = this.cur;
      setTimeout(() => { if (this.cur === tok) { this.cur = null; this.next(); } }, ms);
      const N = this.native();
      if (N) { try { N.speak(text, rate, false); } catch (e) { /* */ } return; }
      if (!window.speechSynthesis) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        const vs = speechSynthesis.getVoices();
        u.voice = vs.find(v => /ar[-_]MA/i.test(v.lang)) || vs.find(v => /^ar/i.test(v.lang)) || null;
        u.lang = u.voice ? u.voice.lang : 'ar-SA'; u.rate = rate;
        speechSynthesis.speak(u);
      } catch (e) { /* */ }
    },
    duck(on) { if (G.Music) G.Music.duck(on || (phase === 'question' && left() <= 5)); },
    stop() {
      this.queue.length = 0;
      if (this.cur && this.cur.pause) try { this.cur.pause(); } catch (e) { /* */ }
      this.cur = null;
      const N = this.native(); if (N && N.stopSpeaking) try { N.stopSpeaking(); } catch (e) { /* */ }
      if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* */ }
    },
    // compatibility with the home screen «test the voice» button
    speak(text, interrupt) { this.say({ key: 'a_lobby_0', text: (L().lobby || [text])[0] }, interrupt); }
  };
  /** say a random sentence of a group */
  // TikTok suspends gifts for «mechanically, automatically or non-interactively soliciting Gifts»:
  // the automated announcer never asks for (or talks about) gifts. Only the host, live, may do it.
  const NO_GIFT_TALK = /a_(reviveHint|final|finalRemind|finalGift|maxRevive|support|thanks)_|a_rules_[56]$|a_revived_2$/;
  const lastIdx = {};
  function say(group, interrupt) {
    const arr = L()[group]; if (!arr || !arr.length) return;
    const ok = arr.map((_, k) => k).filter(k => !NO_GIFT_TALK.test('a_' + group + '_' + k));
    if (!ok.length) return;
    // prefer recorded sentences; never the same one twice in a row
    const p = pack(), rec = p && cfg().voice !== 'tts' ? ok.filter(k => p.keys.indexOf('a_' + group + '_' + k) >= 0) : ok;
    let pool = (rec.length ? rec : ok).filter(k => k !== lastIdx[group]);
    if (!pool.length) pool = ok;
    const i = pool[(Math.random() * pool.length) | 0]; lastIdx[group] = i;
    Voice.say({ key: 'a_' + group + '_' + i, text: arr[i] }, interrupt);
  }
  /** the conditions and rules of the game, one sentence after the other */
  function sayRules() { (L().rules || []).forEach((t, i) => { if (!NO_GIFT_TALK.test('a_rules_' + i)) Voice.say({ key: 'a_rules_' + i, text: t, ttl: 60000 }); }); }
  function sayCount(n) {
    const C = window.TF_COUNTS || {};
    if (n > 30) { if (C.many) Voice.say({ key: 'n_many', text: C.many }); return; }
    if (C[n]) Voice.say({ key: 'n_' + n, text: C[n] });
  }
  // the question is NOT read aloud: the announcer invites the players to read it and think
  // if the question was recorded, the announcer reads it; otherwise he invites the players to read it
  // the questions are not read aloud: the announcer invites the players to read the question and think
  function sayQuestion(q) {
    const p = pack(), key = window.TF_QKEY ? window.TF_QKEY(q.text) : '';
    if (cfg().readQ !== false && p && key && cfg().voice !== 'tts' && p.keys.indexOf(key) >= 0) Voice.say({ key, text: q.text }, true);   // recorded (with diacritics)
    else say('askRead', true);
  }

  /* ---------------- state ---------------- */
  let phase = 'idle', phaseEnds = 0, paused = false, pausedLeft = 0, tickTimer = null;
  let st = null;          // { round, qNo, used:Set, players:{uid:{n,a,alive,revives,ans,el}}, q, finalSaid, reviveHinted, lastHurry }
  const left = () => Math.max(0, Math.ceil((phaseEnds - Date.now()) / 1000));
  function freshRound() {
    const used = st ? st.used : new Set();
    st = { round: (st ? st.round : 0) + 1, qNo: 0, used, players: {}, q: null, finalSaid: false, reviveHinted: false, hurry: false, lobbyWarn: false };
  }
  const alive = () => Object.keys(st.players).filter(u => st.players[u].alive);
  // difficulty climbs with every question: 1-3 easy, 4-7, 8-12, 13-18, then the hardest (traps);
  // in the final stage it is at least level 4
  const level = () => {
    const q = st.qNo, n = alive().length;
    let L = q <= 3 ? 1 : q <= 7 ? 2 : q <= 12 ? 3 : q <= 18 ? 4 : 5;
    if (n <= num(cfg().finalAt, 10)) L = Math.max(L, 4);
    return L;
  };
  function setPhase(p, ms) { phase = p; phaseEnds = ms ? Date.now() + ms : 0; music(); render(); }

  /** players of the round from the champion down: who stayed longest, then who answered right most often */
  function ranking() {
    return Object.keys(st.players).filter(u => st.players[u].alive || st.players[u].outQ)
      .sort((a, b) => {
        const A = st.players[a], B = st.players[b];
        const qa = A.alive ? 1e9 : A.outQ, qb = B.alive ? 1e9 : B.outQ;
        return (qb - qa) || ((B.rights || 0) - (A.rights || 0));
      });
  }

  /* ---------------- rounds ---------------- */
  function lobby() {
    clearStage(); freshRound();
    setPhase('lobby', num(cfg().lobbyTime, 60) * 1000);
    say('lobby', true);
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
    setPhase('ready', 8000);
    say('go', true);
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
    sayQuestion(st.q); st.hyped = false;
  }
  function close() {
    // grace: answers that were written before the end but arrive late through the stream delay
    const g = Math.max(0, Math.min(20, num(cfg().grace, 10)));
    if (g > 0 && !st.q.collecting) { st.q.collecting = true; setPhase('collect', g * 1000); if (g >= 6) say('collect'); return; }
    fall();
  }
  function fall() {
    const right = st.q.truth ? 'yes' : 'no';
    const before = alive();
    const out = before.filter(u => st.players[u].ans !== right);
    const silent = before.filter(u => !st.players[u].ans).length;
    out.forEach(u => { st.players[u].alive = false; st.players[u].outQ = st.qNo; });
    before.forEach(u => { if (st.players[u].ans === right) st.players[u].rights = (st.players[u].rights || 0) + 1; });
    st.lastOut = out.length; st.lastSilent = silent;
    const s = S(); before.forEach(u => { const p = s && s.participants[u]; if (p && st.players[u].ans === right) { p.correct = (p.correct || 0) + 1; } });
    setPhase('fall', 8000);
    dropFloors(right, out);
    api.Sfx.lose();
    say(st.q.truth ? 'ansYes' : 'ansNo', true);
    setTimeout(() => {
      if (!out.length) say('none');
      else if (out.length === before.length) { /* everybody: said at the end */ }
      else say(out.length >= before.length / 2 ? 'fallMany' : 'fallFew');
      if (silent && out.length < before.length && Math.random() < 0.4) setTimeout(() => say('noAnswer'), 2600);
    }, 900);
  }
  function afterFall() {
    const n = alive().length;
    if (n === 0) { setPhase('nowinner', 7000); say('nowinner', true); api.Sfx.lose(); return; }
    if (n === 1) {
      const u = alive()[0], pl = st.players[u];
      const s = S(); const p = s && s.participants[u]; if (p) { p.wins = (p.wins || 0) + 1; p.pts = (p.pts || 0) + 100; }
      st.winner = u; st.ranking = ranking(); setPhase('winner', 9000);
      say('winner', true); api.Sfx.fanfare(); setTimeout(() => api.Sfx.applause(), 400);
      return;
    }
    const finalAt = num(cfg().finalAt, 10);
    if (n <= finalAt && !st.finalAnnounced) { st.finalAnnounced = true; st.finalReminds = 0; st.lastRemindQ = st.qNo; setPhase('final', 7000); say('final'); return; }
    if (n === 3 && !st.said3) { st.said3 = true; say('three'); }
    else if (n === 2 && !st.said2) { st.said2 = true; say('two'); }
    else if (st.lastOut && !st.reviveHinted && num(cfg().reviveMax, 2) > 0 && n > finalAt) { st.reviveHinted = true; say('reviveHint'); }
    else if (n <= finalAt && st.finalReminds < 2 && st.qNo - st.lastRemindQ >= 2) { st.finalReminds++; st.lastRemindQ = st.qNo; say('finalRemind'); }
    else if (Math.random() < 0.6) sayCount(n);           // «بقاو دابا عندنا 15 داللعّابة!»
    say('next');                                           // «هادو اللي بقاو معانا… يلاه ندوزو للسؤال الجاي!»
    // every N questions (5 by default) a short support break: «ما تنساوناش بالدعم ديالكم وما تنساوش المتابعة…»
    const every = num(cfg().giftHype, 5);
    if (every > 0 && st.qNo % every === 0 && n > 1) { st.supportNext = true; }
    setPhase('gap', 1000 * Math.max(4, num(cfg().gapTime, 10)));
  }

  function tick() {
    if (phase === 'idle' || paused) return;
    const now = Date.now();
    if (phase === 'lobby') {
      if (!st.lobbyWarn && phaseEnds - now <= 13000) { st.lobbyWarn = true; say('lobbyEnd', true); }
      else if (phaseEnds - now <= 5200 && Object.keys(st.players).length >= Math.max(1, num(cfg().minPlayers, 2))) {
        // «خمسة… ربعة… تلاتة… جوج… واحد!» — one number a second
        const c = Math.ceil((phaseEnds - now) / 1000);
        if (c >= 1 && c <= 5 && st.countSaid !== c) { st.countSaid = c; Voice.say({ key: 'a_countdown_' + (5 - c), text: L().countdown[5 - c], ttl: 1200, fast: true }); api.Sfx.tick(c <= 3); }
      }
      else if (phaseEnds - now > 14000 && !Voice.speaking && now - (Voice.lastEnd || 0) > 4500 && now - Voice.last > 8000) {
        st.lobbyTalks = (st.lobbyTalks || 0) + 1;
        const rr = cfg().rulesRead || 'once', el = num(cfg().lobbyTime, 120) * 1000 - (phaseEnds - now);
        const rulesDue = rr !== 'off' && ((!st.rulesSaid && st.lobbyTalks >= 2) || (rr === 'twice' && st.rulesSaid === 1 && now - st.rulesAt > 90000 && phaseEnds - now > 55000) || (rr === 'always' && st.rulesSaid && now - st.rulesAt > 100000));
        if (rulesDue) { st.rulesSaid = (st.rulesSaid || 0) + 1; st.rulesAt = now; sayRules(); }  // all the rules, in order
        else if (st.lobbyTalks % 6 === 5) say('hype');                        // «شاركو اللايف مع صحابكم» (never gifts)
        else say('lobby');
      }
      renderLobby();
    }
    if (phase === 'question') {
      const l = left();
      if (l <= 5 && !st.hurry) { st.hurry = true; say('hurry'); }
      if (!st.hyped && l > 7 && l < num(cfg().qTime, 15) - 6 && !Voice.speaking) { st.hyped = true; if (Math.random() < 0.6) say('hype'); }
      if (l <= 5 && l > 0 && st.lastTick !== l) { st.lastTick = l; api.Sfx.tick(l <= 3); }
      if (G.Music) G.Music.duck(l <= 5 || Voice.speaking);
      renderTimer();
    }
    if (!phaseEnds || now < phaseEnds) return;
    if (phase === 'lobby') return startQuestions();
    if (phase === 'ready') return ask();
    if (phase === 'question') return close();
    if (phase === 'collect') return fall();
    if (phase === 'fall') return afterFall();
    if (phase === 'gap' && st.supportNext) { st.supportNext = false; setPhase('supportBreak', 8000); say('hype'); return; }   // «شاركو اللايف» — never gifts
    if (phase === 'final' || phase === 'gap' || phase === 'supportBreak') return ask();
    if (phase === 'winner') { setPhase('podium', 14000); say('podium'); return; }
    if (phase === 'podium' || phase === 'nowinner') return lobby();
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
    if (alive().length <= num(cfg().finalAt, 10)) { if (!st.finalGiftSaid) { st.finalGiftSaid = true; say('finalGift'); } giftThanks(p, g, true); return 'لا عودة في المرحلة النهائية'; }
    if (max <= 0) { giftThanks(p, g); return 'العودة متوقفة'; }
    if (pl.revives >= max) { if (!pl.maxSaid) { pl.maxSaid = true; say('maxRevive'); } giftThanks(p, g, true); return 'استعمل كل العودات'; }
    if (coins < min) { giftThanks(p, g); return 'هدية أقل من الحد'; }
    pl.revives++; pl.reviveNext = true;
    toast(p, g, 'revive', pl.revives, max);
    say('revived');
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
      if (phase === 'collect') { big.className = 'tf-big on wait'; big.innerHTML = '<div class="tf-fix">⏳ نجمع الإجابات…</div>'; }
      if (phase === 'fall') {
        big.className = 'tf-big on ' + (q.truth ? 'yes' : 'no');
        const fell = st.lastOut;
        big.innerHTML = `<div class="tf-ans">الإجابة: ${q.truth ? 'نعم ✓' : 'لا ✗'}</div>${q.fix ? `<div class="tf-fix">${esc(q.fix)}</div>` : ''}
          <div class="tf-out">${fell ? 'سقط ' + players(fell) : 'لم يسقط أحد! 👏'}</div>`;
      }
      renderTimer();
    } else if (phase === 'final') {
      card.innerHTML = `<div class="tf-lobby final"><b>🔥 المرحلة النهائية</b><small>بقي ${alive().length} · لا عودة بعد الآن</small></div>`;
    } else if (phase === 'supportBreak') {
      card.innerHTML = `<div class="tf-lobby final"><b>⭐ تابعونا وشاركوا اللايف مع أصدقائكم</b><small>ألعاب حصرية للذكاء وتنمية الذكاء · السؤال التالي بعد قليل</small></div>`;
      big.className = 'tf-big on sup'; big.innerHTML = `<div class="tf-sup"><i>🔁</i><b>شاركوا اللايف مع أصدقائكم</b><small>وتابعوا الصفحة لمزيد من الألعاب الحصرية</small></div>`;
    } else if (phase === 'gap') {
      card.innerHTML = `<div class="tf-lobby"><b>بقي ${players(alive().length)}</b><small>السؤال التالي…</small></div>`;
    } else if (phase === 'winner') {
      const pl = st.players[st.winner];
      card.innerHTML = `<div class="tf-lobby final"><b>👑 بطل الجولة</b></div>`;
      big.className = 'tf-big on win';
      big.innerHTML = `<div class="tf-win"><div class="tf-crown">👑</div><div class="tf-wphoto">${personHead(pl, st.winner)}</div><div class="tf-wname">${esc(pl.n)}</div><div class="tf-confetti">${'<i></i>'.repeat(18)}</div></div>`;
    } else if (phase === 'podium') {
      const r = st.ranking || [], P = u => st.players[u];
      const medal = ['👑', '🥈', '🥉', '4'];
      card.innerHTML = `<div class="tf-lobby final"><b>🏆 أبطال الجولة</b></div>`;
      big.className = 'tf-big on pod';
      big.innerHTML = `<div class="tf-pod">${r.slice(0, 4).map((u, i) => `<div class="pd p${i + 1}"><i>${medal[i]}</i>${personHead(P(u), u)}<span>${esc(P(u).n)}</span><em>${i === 0 ? 'البطل' : i === 1 ? 'الوصيف' : 'المركز ' + (i + 1)}</em></div>`).join('')}</div>`
        + (r.length > 4 ? `<ol class="tf-top" start="5">${r.slice(4, 10).map(u => `<li>${personHead(P(u), u)}<span>${esc(P(u).n)}</span><em>✓ ${P(u).rights || 0}</em></li>`).join('')}</ol>` : '');
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
    if (!$('tfLobN')) $('tfCard').innerHTML = `<div class="tf-lobby"><b>اكتب «لعب» في التعليقات للمشاركة 🎮</b><small>المسجّلون: <span class="tf-cnt" id="tfLobN"></span> · تبدأ الأسئلة بعد <span class="tf-cnt" id="tfLobT"></span> ث</small><div class="tf-rule" id="tfRule"></div></div>`;
    $('tfLobN').textContent = n; $('tfLobT').textContent = left();
    // the rules, one at a time (and the champions of the session) while waiting
    const items = RULES.slice(), top = sessionTop();
    if (top) items.push(top);
    const k = Math.floor(Date.now() / 6000) % items.length;
    if ($('tfRule').dataset.k !== String(k)) { $('tfRule').dataset.k = k; $('tfRule').innerHTML = items[k]; }
    renderCounts();
  }
  const RULES = ['📜 اكتب «لعب» للدخول — المشاركة مجانية', '✅ أجب بـ «نعم» أو «لا» (yes / no)', '🔒 الإجابة الأولى هي التي تُحتسب، ولو كتبتها مرة أخرى',
    '⏳ من لا يجيب يسقط',  '🔥 عندما يبقى 10: لا عودة، حتى بالهدية', '👑 آخر من يبقى هو البطل'];
  function sessionTop() {
    const s = S(); if (!s) return '';
    const t = Object.keys(s.participants).filter(u => s.participants[u].wins).sort((a, b) => s.participants[b].wins - s.participants[a].wins).slice(0, 3);
    return t.length ? '🏅 أبطال البث: ' + t.map(u => esc(s.participants[u].n) + ' (' + s.participants[u].wins + ')').join(' · ') : '';
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
        + `<span class="tb left">باقٍ ${al.length}</span>${fin ? '<span class="tb fin">🔥 المرحلة النهائية</span>' : ''}`;
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
    // thanks on screen only: no voice, so the announcer is never interrupted
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
      if (phase === 'ready' || phase === 'gap' || phase === 'final' || phase === 'supportBreak') return ask();
      if (phase === 'winner') { setPhase('podium', 14000); return; }
      if (phase === 'podium' || phase === 'nowinner') return lobby();
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
    init(a) {
      api = a;
      // one-time new defaults for apps installed before (quieter music, 10 s extra time, 2 min to join, 20 s to answer)
      const c = cfg();
      if (c.tfVer !== 3) { c.tfVer = 3; c.musicVol = 0.3; c.grace = 10; c.lobbyTime = 120; c.qTime = Math.max(20, num(c.qTime, 20)); c.gapTime = 10; c.giftHype = 5; if (api.save) api.save(); }
    },
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
