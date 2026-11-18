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
  /* ---------------- question groups ----------------
   * TF_SETS (tf-sets.js): 10 groups, each with its own easy / medium / hard questions (no question is in two groups).
   * The host picks the group the broadcast starts with (panel: «مجموعة الأسئلة»); when a group is used up the game
   * moves on to the next one by itself. Progress is kept on the phone, so leaving and reopening the app does not
   * replay the same questions. */
  const SETS_KEY = 'sahkhata.sets.v2';   // v2: groups rebuilt with even «yes» / «no»
  const SETS = () => window.TF_SETS || [];
  let prog = null;
  function loadProg() {
    if (prog) return prog;
    try { prog = JSON.parse(localStorage.getItem(SETS_KEY) || 'null'); } catch (e) { prog = null; }
    if (!prog || typeof prog.set !== 'number') prog = { set: 0, used: {} };
    if (!prog.used) prog.used = {};
    return prog;
  }
  function saveProg() { try { localStorage.setItem(SETS_KEY, JSON.stringify(prog)); } catch (e) { /* */ } }
  const usedOf = i => (loadProg().used[i] = loadProg().used[i] || []);
  const leftIn = (i, s) => { const g = SETS()[i]; if (!g) return 0; const u = new Set(usedOf(i)); return (g[s] || []).filter(x => !u.has(x[2])).length; };
  const leftAll = i => leftIn(i, 0) + leftIn(i, 1) + leftIn(i, 2);
  function gotoSet(i) { const n = SETS().length || 1; prog.set = ((i % n) + n) % n; prog.used[prog.set] = []; saveProg(); }
  /** called when a broadcast starts: a group picked in the panel is applied once (from its first question),
   *  then the panel goes back to «continue» so reopening the app never replays it */
  function applyPick() {
    loadProg();
    const pick = cfg().qSet == null ? 'auto' : String(cfg().qSet);
    if (pick !== 'auto' && SETS().length) { gotoSet((+pick || 1) - 1); cfg().qSet = 'auto'; if (api.save) api.save(); }
  }
  /** at the start of every round: a group with too few questions left gives way to the next one */
  function checkSet() { loadProg(); if (SETS().length && (leftIn(prog.set, 0) < 4 || leftAll(prog.set) < 12)) gotoSet(prog.set + 1); }
  // stage of the question: 0 easy, 1 medium, 2 hard (the hard part also borrows medium when it runs out)
  function nextStatement(level) {
    const sets = SETS();
    if (!sets.length) { const q = generated(Math.min(3, level)); return q; }
    loadProg();
    const want = level <= 1 ? 0 : level === 2 ? 1 : 2;
    const order = want === 0 ? [0, 1, 2] : want === 1 ? [1, 2, 0] : [2, 1, 0];
    for (let pass = 0; pass < 2; pass++) {
      const g = sets[prog.set], used = usedOf(prog.set), u = new Set(used);
      for (const s of order) {
        let pool = (g[s] || []).filter(x => !u.has(x[2]));
        if (s === 2) { const top = pool.filter(x => x[0] >= 4); if (level >= 4 && top.length) pool = top; else if (level < 4 && pool.length > top.length) pool = pool.filter(x => x[0] < 4); }
        if (pool.length) {
          // never the same answer 3 times in a row; otherwise keep «yes» and «no» about even in the round
          const h = st.truths || (st.truths = []), last2 = h.slice(-2);
          const yes = h.filter(Boolean).length, no = h.length - yes;
          let want = null;
          if (last2.length === 2 && last2[0] === last2[1]) want = !last2[0];
          else if (Math.abs(yes - no) >= 2) want = yes < no;
          const side = want === null ? pool : pool.filter(x => x[1] === want);
          const x = rnd(side.length ? side : pool); used.push(x[2]); saveProg(); h.push(x[1]);
          return { id: 's:' + x[2], truth: x[1], text: x[2], fix: x[3] || '', set: prog.set + 1 };
        }
      }
      gotoSet(prog.set + 1);
    }
    return generated(Math.min(3, level));
  }
  G.TfSets = { get current() { return loadProg().set + 1; }, left: () => leftAll(loadProg().set), count: () => SETS().length, reset() { prog = { set: 0, used: {} }; saveProg(); } };

  /* ---------------- no announcer ----------------
   * TikTok closed a LIVE over the automated voice: the game has no voice at all any more.
   * The screen shows only what the players must do (lobby card + rules) and the questions. */
  const Voice = { speaking: false, say() { }, stop() { }, speak() { } };

  /* ---------------- state ---------------- */
  let phase = 'idle', phaseEnds = 0, paused = false, pausedLeft = 0, tickTimer = null;
  let st = null;          // { round, qNo, used:Set, players:{uid:{n,a,alive,revives,ans,el}}, q, finalSaid, reviveHinted, lastHurry }
  const left = () => Math.max(0, Math.ceil((phaseEnds - Date.now()) / 1000));
  function freshRound() {
    const used = st ? st.used : new Set();
    st = { round: (st ? st.round : 0) + 1, qNo: 0, used, players: {}, q: null, finalSaid: false, reviveHinted: false, hurry: false, lobbyWarn: false };
  }
  const alive = () => Object.keys(st.players).filter(u => st.players[u].alive);
  // difficulty climbs every 4 questions: 1-4 easy, 5-8 medium, 9-12 hard, 13+ the hardest of the group;
  // in the final stage it is at least «hard»
  const level = () => {
    const q = st.qNo, n = alive().length;
    let L = q <= 4 ? 1 : q <= 8 ? 2 : q <= 12 ? 3 : 4;
    if (n <= num(cfg().finalAt, 10) && q > 4) L = Math.max(L, 3);   // a small game still starts easy
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
    clearStage(); freshRound(); checkSet(); zs.no = zs.yes = zs.mid = 1;
    setPhase('lobby', num(cfg().lobbyTime, 60) * 1000);
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
      setPhase('lobby', 30000); return;
    }
    setPhase('ready', 3000);
  }
  function ask() {
    // bring back the players revived by a gift; everybody stands in the middle (most are already walking back there)
    Object.keys(st.players).forEach(u => { const pl = st.players[u]; if (pl.reviveNext) { pl.reviveNext = false; pl.alive = true; placeMiddle(u, true); } });
    st.qNo++; st.hurry = false;
    alive().forEach(u => { st.players[u].ans = null; if (!els[u] || els[u].dataset.zone !== 'mid') placeMiddle(u); });
    const n = alive().length;
    if (n <= num(cfg().finalAt, 10) && !st.finalSaid && st.qNo > 1) { st.finalSaid = true; }
    st.q = nextStatement(level());
    st.q.start = Date.now();
    setPhase('question', num(cfg().qTime, 15) * 1000);
  }
  function close() {
    // grace: answers that were written before the end but arrive late through the stream delay
    const g = Math.max(0, Math.min(20, num(cfg().grace, 10)));
    if (g > 0 && !st.q.collecting) { st.q.collecting = true; setPhase('collect', g * 1000); return; }
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
    st.fallAt = Date.now(); setPhase('fall', 8000); setTimeout(render, 1650);
    dropFloors(right, out);
    api.Sfx.trapdoor();
    if (out.length) setTimeout(() => api.Sfx.fallScream(out.length), 300);   // «waaa…» down into the pit
    // as soon as the doors are closed again, the players who stayed walk calmly back to the middle
    const stay = before.filter(u => !out.includes(u)), round = st.round;
    setTimeout(() => {
      if (!st || st.round !== round) return;
      const back = stay.filter(u => st.players[u] && st.players[u].alive);
      back.forEach(u => { if (els[u]) els[u].dataset.zone = 'away'; });   // the middle is empty again
      back.forEach(u => { if (els[u]) { els[u].classList.remove('noname'); els[u]._goal = 'mid'; } });
      sizeFor('mid', back.length);
      back.forEach(u => { if (els[u]) { const [x, y] = spot('mid', u); walkTo(els[u], x, y, 'mid'); } });
    }, 2800);
  }
  function afterFall() {
    const n = alive().length;
    if (n === 0) { setPhase('nowinner', 7000); api.Sfx.lose(); return; }
    if (n === 1) {
      const u = alive()[0];
      const s = S(); const p = s && s.participants[u]; if (p) { p.wins = (p.wins || 0) + 1; p.pts = (p.pts || 0) + 100; }
      st.winner = u; st.ranking = ranking(); setPhase('winner', 6000);
      api.Sfx.fanfare(); setTimeout(() => api.Sfx.applause(), 400); setTimeout(() => api.Sfx.applause(), 2600);
      return;
    }
    // between two questions: «12 players left out of 40 · next question, read it well»
    setPhase('gap', 1000 * Math.max(4, num(cfg().gapTime, 7)));
  }
  /** the podium comes one by one: champion, runner-up, 3rd, 4th, then the rest of the top 10 — applause for each */
  const POD_STEP = [0, 1500, 3000, 4500], TOP_FROM = 6000, TOP_STEP = 800;
  function podium() {
    const k = Math.min(10, (st.ranking || []).length);
    setPhase('podium', TOP_FROM + Math.max(0, k - 4) * TOP_STEP + 5000);
    const round = st.round, at = [...POD_STEP.slice(0, Math.min(4, k)), ...Array.from({ length: Math.max(0, k - 4) }, (_, i) => TOP_FROM + i * TOP_STEP)];
    at.forEach((ms, i) => setTimeout(() => { if (st && st.round === round && phase === 'podium' && (i < 4 || i % 2 === 0)) api.Sfx.applause(); }, ms + 150));
  }

  function tick() {
    if (phase === 'idle' || paused) return;
    const now = Date.now();
    if (phase === 'lobby') {
      const c = Math.ceil((phaseEnds - now) / 1000);
      if (c >= 1 && c <= 5 && st.countSaid !== c && Object.keys(st.players).length >= Math.max(1, num(cfg().minPlayers, 2))) { st.countSaid = c; api.Sfx.tick(c <= 3); }
      renderLobby();
    }
    if (phase === 'question') {
      const l = left();
      if (l <= 5 && l > 0 && st.lastTick !== l) { st.lastTick = l; api.Sfx.tick(l <= 3); }
      if (G.Music) G.Music.duck(l <= 5);
      renderTimer();
    }
    if (!phaseEnds || now < phaseEnds) return;
    if (phase === 'lobby') return startQuestions();
    if (phase === 'ready') return ask();
    if (phase === 'question') return close();
    if (phase === 'collect') return fall();
    if (phase === 'fall') return afterFall();
    if (phase === 'final' || phase === 'gap' || phase === 'supportBreak') return ask();
    if (phase === 'winner') return podium();
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
    if (alive().length <= num(cfg().finalAt, 10)) { giftThanks(p, g, true); return 'لا عودة في المرحلة النهائية'; }
    if (max <= 0) { giftThanks(p, g); return 'العودة متوقفة'; }
    if (pl.revives >= max) { giftThanks(p, g, true); return 'استعمل كل العودات'; }
    if (coins < min) { giftThanks(p, g); return 'هدية أقل من الحد'; }
    pl.revives++; pl.reviveNext = true;
    toast(p, g, 'revive', pl.revives, max);
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
      <rect class="lg l1" x="9" y="30" width="9" height="15" rx="4" fill="#2B2F45"/><rect class="lg l2" x="22" y="30" width="9" height="15" rx="4" fill="#2B2F45"/>
      <rect x="3" y="6" width="7" height="20" rx="3.5" fill="${col}"/><rect x="30" y="6" width="7" height="20" rx="3.5" fill="${col}"/>
      <rect x="8" y="2" width="24" height="31" rx="9" fill="url(#g${hash(uid)})"/><ellipse cx="16" cy="9" rx="5" ry="3" fill="#fff" opacity=".35"/></svg></div>`;
  }
  const els = {};          // uid -> element
  function clearStage() { Object.keys(els).forEach(u => { els[u].remove(); delete els[u]; }); }
  // floor coordinates: x ∈ [0,1] across the 3 floors (0 = left edge of «لا», 1 = right edge of «نعم»), y ∈ [0,1] back→front
  const BOARD_H = 1059;
  const ZONES = { no: [0.107, 0.305], mid: [0.399, 0.617], yes: [0.699, 0.9] };   // inside the 3 panels of the picture (board %)   // the middle floor is the widest: everybody starts there
  /* ---- places: scattered over the WHOLE panel, without any overlap ----
   * Each player goes to the free place that is the farthest from the others (corners, top, bottom, middle),
   * so a floor looks naturally scattered, never in rows. Nobody else moves when somebody arrives. When a floor
   * is full, everybody gets a little smaller where he stands; in a real crowd the extra ones show no name. */
  const zs = { no: 1, mid: 1, yes: 1 };          // size of the players (the same on the three floors)
  const TOP = 0.09, Y1 = 0.855;                   // top / bottom of the panels in the picture (board height fraction)
  let lastF = null;
  function geo() {
    const f = $('tfFloor');
    if (f && f.clientWidth > 50) lastF = [f.clientWidth, f.clientHeight, parseFloat(getComputedStyle(f).fontSize) || 16];
    if (lastF) return lastF;
    const w = window.innerWidth * 1.08; return [w, w * BOARD_H / 1672, parseFloat(getComputedStyle(document.body).fontSize) || 16];
  }
  /** [half width, name+head depth, whole height] of a player at size sc, in board fractions */
  function foot(el, sc) {
    const [fw, fh, fs] = geo(), em = fs * 1.55 * sc, full = 4.75 * em / fh;
    if (el && el.classList.contains('noname')) return [2.1 * em / 2 / fw, 2.3 * em / fh, full];
    const tag = el && el.querySelector('.tp-tag');
    const cur = el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    let tagEm = tag && tag.offsetWidth && cur ? tag.offsetWidth / cur : 0;
    if (!tagEm) { const n = (el && el._n) || 'Abcdefgh'; tagEm = Math.min(2.7, 0.6 * (0.6 * n.length + 1.2)); }
    return [(Math.max(2.2, tagEm) + 0.25) * em / 2 / fw, 3.2 * em / fh, full];
  }
  function others(zone, uid) {
    return Object.keys(els).filter(u => u !== uid && els[u].dataset.zone === zone && els[u]._p && !els[u].classList.contains('fall'))
      .map(u => { const [w, d] = foot(els[u], zs[zone]); return { p: els[u]._p, w, d, named: !els[u].classList.contains('noname') }; });
  }
  /** the free place farthest from everybody (best of many random tries over the whole panel) */
  function scatter(zone, uid) {
    const [a, b] = ZONES[zone], [hw, dy, full] = foot(els[uid], zs[zone]);
    const y0 = Math.min(Y1 - 0.02, TOP + full), os = others(zone, uid);
    let best = null, bestS = -1;
    for (let k = 0; k < 90; k++) {
      const c = [a + hw + Math.random() * Math.max(0, b - a - 2 * hw), y0 + Math.random() * (Y1 - y0)];
      let ok = true, sc = 3;
      for (const o of os) {
        const dx = Math.abs(c[0] - o.p[0]) / (hw + o.w), dd = Math.abs(c[1] - o.p[1]) / Math.max(dy, o.d);
        if (dx < 1 && dd < 1) { ok = false; break; }
        sc = Math.min(sc, Math.hypot(dx, dd));
      }
      // a little preference for the empty edges of the panel when there are few players
      if (ok && sc + Math.random() * 0.15 > bestS) { bestS = sc; best = c; }
    }
    return best;
  }
  function setZoneSize(zone, v) {
    zs.no = zs.mid = zs.yes = v;
    Object.keys(els).forEach(u => els[u].style.setProperty('--s', v.toFixed(3)));
  }
  const MIN_S = 0.6;
  function spot(zone, uid) {
    const el = els[uid]; if (el) el.classList.remove('noname');
    for (let t = 0; t < 16; t++) {
      const c = scatter(zone, uid); if (c) return c;
      if (zs[zone] <= MIN_S) break;
      setZoneSize(zone, Math.max(MIN_S, zs[zone] * 0.95));        // everybody a little smaller, where he stands
    }
    // a real crowd: no name for this one, his head where it touches no name
    if (el) el.classList.add('noname');
    const [a, b] = ZONES[zone], [h, d0, full] = foot(el, zs[zone]), y0 = Math.min(Y1 - 0.02, TOP + full), os = others(zone, uid);
    let best = null, bestS = -1e9;
    for (let k = 0; k < 90; k++) {
      const c = [a + h + Math.random() * Math.max(0, b - a - 2 * h), y0 + Math.random() * (Y1 - y0)];
      let hits = 0, md = 9;
      for (const o of os) {
        const dx = Math.abs(c[0] - o.p[0]), dd = Math.abs(c[1] - o.p[1]);
        if (o.named && dx < h + o.w && dd < Math.max(d0, o.d)) hits++;
        md = Math.min(md, Math.hypot(dx * 2, dd));
      }
      const sc = -hits * 10 + md; if (sc > bestS) { bestS = sc; best = c; }
    }
    return best;
  }
  /** the biggest size at which n players should fit on a floor (used when a group walks into an empty floor) */
  function sizeFor(zone, n) {
    const [a, b] = ZONES[zone]; let v = 1;
    for (; v > MIN_S; v *= 0.95) { const [hw, dy, full] = foot(null, v); if (Math.max(1, Math.floor((b - a) / (2 * hw))) * (Math.floor((Y1 - TOP - full) / dy) + 1) * 0.7 >= n) break; }
    setZoneSize(zone, Math.max(MIN_S, v));
  }
  function ensureEl(uid) {
    let el = els[uid];
    if (!el) {
      const pl = st.players[uid];
      el = document.createElement('div'); el.className = 'tp'; el.innerHTML = personHtml(pl, uid); el._n = pl.n || '';
      el.style.setProperty('--d', (-Math.random() * 3).toFixed(2) + 's');
      el.style.setProperty('--s', zs.mid.toFixed(3));
      $('tfFloor').appendChild(el); els[uid] = el;
      el.classList.add('drop-in'); setTimeout(() => el.classList.remove('drop-in'), 800);
    }
    return el;
  }
  // positions are percentages of the board (left/top): right even when the board is hidden (control panel open)
  function paint(el) {
    const p = el._p;
    el.style.left = (p[0] * 100).toFixed(2) + '%'; el.style.top = (p[1] * 100).toFixed(2) + '%';
    el.style.zIndex = String(10 + Math.round(p[1] * 100));
  }
  /** walk (or appear) to x,y — every player with his own small delay and pace, like real people */
  function walkTo(el, x, y, zone, instant) {
    const from = el._p;
    el._p = [x, y]; el.dataset.zone = zone; el._goal = zone; el.style.setProperty('--s', zs[zone].toFixed(3));
    clearTimeout(el._t); clearTimeout(el._t0);
    if (instant || !from) { el.style.transitionDuration = '0s'; el.style.transitionDelay = '0s'; el.classList.remove('walk'); paint(el); el.getBoundingClientRect(); el.style.transitionDuration = ''; el.style.transitionDelay = ''; return; }
    const pace = 0.3 + Math.random() * 0.14, delay = Math.round(Math.random() * 450);
    const dist = Math.hypot(x - from[0], (y - from[1]) * 0.5), ms = Math.round(Math.max(700, Math.min(2800, dist / pace * 1000)));
    el.style.transitionDuration = ms + 'ms, ' + ms + 'ms, 1.15s, .9s, .6s';
    el.style.transitionDelay = delay + 'ms, ' + delay + 'ms, 0s, .35s, 0s';
    el.style.setProperty('--lean', (x > from[0] ? 1 : -1) * 4 + 'deg');
    paint(el);
    el._t0 = setTimeout(() => el.classList.add('walk'), delay);
    el._t = setTimeout(() => el.classList.remove('walk'), delay + ms);
  }
  /** a new player comes in from one side of the middle panel (top, bottom, left or right) and walks to his place */
  function entry() {
    const [a, b] = ZONES.mid, r = Math.random();
    return r < 0.3 ? [a + Math.random() * (b - a), TOP + 0.05] : r < 0.6 ? [a + Math.random() * (b - a), Y1] : [r < 0.8 ? a : b, TOP + 0.2 + Math.random() * (Y1 - TOP - 0.2)];
  }
  function placeMiddle(uid, fresh) {
    const el = ensureEl(uid); el.classList.remove('fall'); el._goal = 'mid';
    const [x, y] = spot('mid', uid);
    if (fresh && !el._p) { const e = entry(); el._p = null; walkTo(el, e[0], e[1], 'mid', true); }
    walkTo(el, x, y, 'mid', fresh && !el._p);
  }
  function moveTo(uid, a) {
    const el = ensureEl(uid);
    const z = a === 'yes' ? 'yes' : 'no'; el._goal = z;
    const [x, y] = spot(z, uid);
    walkTo(el, x, y, z);
  }
  function dropFloors(right, out) {
    const wrong = right === 'yes' ? 'no' : 'yes';
    ['mid', wrong].forEach(z => $('tf_' + z).classList.add('open'));
    out.forEach(u => {
      const el = els[u]; if (!el) return;
      clearTimeout(el._t); el.classList.remove('walk');
      setTimeout(() => { el.style.transitionDuration = ''; el.style.setProperty('--rz', (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 25) + 'deg'); el.classList.add('fall'); }, 220 + Math.random() * 260);
      setTimeout(() => { el.remove(); delete els[u]; }, 2000);
    });
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
      if (phase === 'fall' && st && st.q && Date.now() - (st.fallAt || 0) < 1600) shot = st.q.truth ? 'fall-no' : 'fall-yes';   // a short look at the falling floor, then the whole game again
      if (phase === 'winner') shot = 'win';
      if (phase === 'lobby') shot = 'lobby';
      cam.dataset.shot = shot;
    }
    hud.classList.toggle('paused', paused);
    const card = $('tfCard'), big = $('tfBig');
    if (!(phase === 'podium' && $('tfPod'))) { big.className = 'tf-big'; big.innerHTML = ''; }
    if (phase === 'lobby') renderLobby();
    else if (phase === 'ready') card.innerHTML = `<div class="tf-lobby"><b>استعدّوا… 🔥</b></div>`;
    else if (st && st.q && (phase === 'question' || phase === 'collect' || phase === 'fall')) {
      // while playing: only the question (and its time) — no other text
      const q = st.q;
      if (!$('tfQt') || $('tfQt').dataset.id !== q.id + st.qNo) {
        card.innerHTML = `<div class="tf-q"><span class="tf-no">${st.qNo}</span><div class="tf-qt" id="tfQt">${q.flag ? `<img class="tf-flag" src="flags/${q.flag}.svg" alt="">` : ''}<b>${esc(q.text)}</b></div>
          <span class="tf-timer" id="tfTimer"><i></i><em id="tfSec">${left()}</em></span></div>`;
        $('tfQt').dataset.id = q.id + st.qNo;
      }
      card.firstChild.classList.toggle('done', phase === 'fall');
      renderTimer();
    } else if (phase === 'gap') {
      const all = Object.keys(st.players).length;
      card.innerHTML = `<div class="tf-lobby tf-gap"><b>بقي ${players(alive().length)} من أصل ${all}</b><small>هيا ننتقل إلى السؤال الموالي… اقرؤوا السؤال جيداً 👀</small></div>`;
    } else if (phase === 'winner') {
      const pl = st.players[st.winner];
      card.innerHTML = `<div class="tf-lobby final"><b>👑 بطل الجولة</b></div>`;
      big.className = 'tf-big on win';
      big.innerHTML = `<div class="tf-win"><div class="tf-crown">👑</div><div class="tf-wphoto">${personHead(pl, st.winner)}</div><div class="tf-wname">${esc(pl.n)}</div><div class="tf-confetti">${'<i></i>'.repeat(18)}</div></div>`;
    } else if (phase === 'podium') {
      // built once; every place appears in its turn (CSS delays), same timing as the applause in podium()
      if (!$('tfPod')) {
        const r = st.ranking || [], P = u => st.players[u];
        const medal = ['👑', '🥈', '🥉', '4'];
        card.innerHTML = `<div class="tf-lobby final"><b>🏆 أبطال الجولة</b></div>`;
        big.className = 'tf-big on pod';
        big.innerHTML = `<div class="tf-pod" id="tfPod">${r.slice(0, 4).map((u, i) => `<div class="pd p${i + 1}" style="--dl:${POD_STEP[i]}ms"><i>${medal[i]}</i>${personHead(P(u), u)}<span>${esc(P(u).n)}</span><em>${i === 0 ? 'البطل' : i === 1 ? 'الوصيف' : 'المركز ' + (i + 1)}</em><div class="pd-clap">👏</div></div>`).join('')}</div>`
          + (r.length > 4 ? `<ol class="tf-top" start="5">${r.slice(4, 10).map((u, i) => `<li style="--dl:${TOP_FROM + i * TOP_STEP}ms">${personHead(P(u), u)}<span>${esc(P(u).n)}</span><em>✓ ${P(u).rights || 0}</em></li>`).join('')}</ol>` : '');
      } else { big.className = 'tf-big on pod keep'; return void renderCounts(); }
    } else if (phase === 'nowinner') {
      card.innerHTML = `<div class="tf-lobby"><b>سقط الجميع! 😅</b><small>لا يوجد فائز هذه المرة · جولة جديدة بعد قليل</small></div>`;
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
    // the «write العب» card is fixed (built once); only the numbers change and the rules turn below it
    if (!$('tfLobN')) $('tfCard').innerHTML = `<div class="tf-lobby tf-join"><i class="tf-pad">🎮</i><b>اكتب «<em>العب</em>» في التعليقات للمشاركة معنا</b></div>
      <div class="tf-sub"><span>⏱️ تبدأ الأسئلة بعد <span class="tf-cnt" id="tfLobT"></span> ث</span><i></i><span>المسجّلون: <span class="tf-cnt big" id="tfLobN"></span></span><i></i><span>👥 المشاركة مجانية</span></div>
      <div class="tf-rules" id="tfRules"></div>`;
    $('tfLobN').textContent = n; $('tfLobT').textContent = left();
    const k = Math.floor(Date.now() / RULE_MS) % RULES.length, box = $('tfRules');
    if (box.dataset.k !== String(k)) {
      box.dataset.k = k;
      const old = box.querySelector('.tf-rc:not(.out)'); if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 700); }
      const c = document.createElement('div'); c.className = 'tf-rc';
      c.innerHTML = `<span class="tf-rn">${k + 1}</span><span class="tf-rt">${RULES[k]}</span><span class="tf-rd">${RULES.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</span>`;
      box.appendChild(c);
    }
    renderCounts();
  }
  const RULE_MS = 5000;
  const RULES = ['اكتب «العب» في التعليقات لتدخل اللعبة', 'أجب على كل سؤال بـ «نعم» أو «لا»', 'الإجابة الأولى هي التي تُحتسب، لا يمكن تغييرها',
    'من لا يجيب يبقى في الوسط ويسقط', 'آخر من يبقى واقفاً هو البطل 👑'];
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
  /** the pill at the bottom of the board: players registered (lobby) / still playing */
  function renderCounts() {
    const pl = $('bdPill'); if (!pl) return;
    let h = '';
    if (st && phase !== 'idle') {
      const all = Object.keys(st.players).length, al = alive().length;
      if (phase === 'winner' || phase === 'podium') h = '';
      else h = phase === 'lobby' || phase === 'nowinner' ? `<b>${all}</b> ${all === 1 ? 'لاعب' : all === 2 ? 'لاعبان' : all >= 3 && all <= 10 ? 'لاعبين' : 'لاعباً'}` : `باقٍ <b>${al}</b>`;
    }
    if (pl._h !== h) { pl._h = h; pl.innerHTML = h; }
  }

  /* ---------------- gift cards ---------------- */
  function giftIcon(g) {
    return g && g.gimg && /^https:\/\//.test(g.gimg) ? `<img src="${esc(g.gimg)}" referrerpolicy="no-referrer" alt="" onerror="this.replaceWith('🎁')">` : (/rose/i.test((g && g.gname) || '') ? '🌹' : '🎁');
  }
  const giftQ = []; let giftBusy = false;
  function showCard(html, cls, ms) {
    giftQ.push({ html, cls, ms }); nextCard();
  }
  // while a question is played, nothing but the question is written on the screen: the cards wait
  const PLAYING = ['ready', 'question', 'collect', 'fall'];
  function nextCard() {
    if (giftBusy || !giftQ.length) return;
    if (PLAYING.includes(phase)) { clearTimeout(nextCard.t); nextCard.t = setTimeout(nextCard, 800); if (giftQ.length > 6) giftQ.splice(0, giftQ.length - 6); return; }
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
      if (phase === 'winner') return podium();
      if (phase === 'podium' || phase === 'nowinner') return lobby();
    },
    newTopic() { paused = false; lobby(); },
    reveal() { if (phase === 'question') close(); else if (phase === 'collect') fall(); },
    togglePause() {
      if (phase === 'idle') return;
      if (!paused) { paused = true; pausedLeft = Math.max(0, phaseEnds - Date.now()); }
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
      if (c.tfVer !== 3 && c.tfVer !== 4) { c.musicVol = 0.3; c.grace = 10; c.lobbyTime = 120; c.qTime = Math.max(20, num(c.qTime, 20)); }
      if (c.tfVer !== 4) { c.tfVer = 4; c.voice = 'off'; c.giftHype = 0; c.gapTime = 7; if (api.save) api.save(); }   // 2.7: no announcer, no support break
    },
    applyLayout, music,
    start() {
      paused = false; st = null; applyPick();
      clearInterval(tickTimer); tickTimer = setInterval(tick, 200);
      lobby();
    },
    stop() { clearInterval(tickTimer); phase = 'idle'; paused = false; clearStage(); render(); if (G.Music) G.Music.stop(); },
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
      return [['الجولة', st.round], ['السؤال', st.qNo], ['مجموعة الأسئلة', G.TfSets.current + ' / ' + G.TfSets.count() + ' (بقي ' + G.TfSets.left() + ')'], ['اللاعبون (باقٍ / الكل)', alive().length + ' / ' + all]];
    },
    yesNo, isJoin,
    get phase() { return phase; },
    get paused() { return paused; },
    _sample: level => generated(level), _pick: level => nextStatement(level),
    _debug: () => ({ st, phase, phaseEnds, Voice })
  };
})(window);
