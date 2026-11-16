/* =========================================================================
 * تحدي الثقافة — TikTok LIVE general-knowledge quiz
 * -------------------------------------------------------------------------
 *  topic (roulette) → question (viewers type the answer in comments)
 *  → reveal (answer + fastest players) → leaderboard (photo, name, ✓ correct, points)
 *  Points and correct answers accumulate for the whole session.
 * ========================================================================= */
(function (G) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = a => a[(Math.random() * a.length) | 0];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const CATS = [
    { id: 'geo', ar: 'الجغرافيا', en: 'Geography', icon: '🗺️' },
    { id: 'capitals', ar: 'العواصم', en: 'Capitals', icon: '🏛️' },
    { id: 'flags', ar: 'الأعلام', en: 'Flags', icon: '🚩' },
    { id: 'maths', ar: 'الرياضيات', en: 'Maths', icon: '🧮' },
    { id: 'sport', ar: 'الرياضة', en: 'Sport', icon: '⚽' },
    { id: 'islam', ar: 'إسلاميات', en: 'Islamic', icon: '🕌' },
    { id: 'history', ar: 'التاريخ', en: 'History', icon: '📜' },
    { id: 'science', ar: 'العلوم', en: 'Science', icon: '🔬' },
    { id: 'landmarks', ar: 'المعالم', en: 'Landmarks', icon: '🗼' },
    { id: 'films', ar: 'أفلام ومسلسلات', en: 'Films & Series', icon: '🎬' },
    { id: 'languages', ar: 'اللغات', en: 'Languages', icon: '🗣️' },
    { id: 'morocco', ar: 'المغرب', en: 'Morocco', icon: '🇲🇦' }
  ];
  const CAT = {}; CATS.forEach(c => { CAT[c.id] = c; });

  const TXT = {
    ma: { next: 'الموضوع الجاي…', nextEn: 'Next topic…', type: 'كتب الجواب فالكومنتير ✍️', hint: 'تلميح', answer: 'الجواب الصحيح', fastest: 'الأسرع ⚡',
      board: 'الترتيب العام 🏆', nobody: 'حتى واحد ما جابها هاد المرة 😅', paused: 'استراحة صغيرة… نرجعو دابا ⏸', final: 'بطل التحدي 👑', soon: 'السؤال الجاي بعد {s}…', ready: 'وجدو راسكم! التحدي غادي يبدا…', correct: 'جاوبو صح' },
    ar: { next: 'الموضوع القادم…', nextEn: 'Next topic…', type: 'اكتب الجواب في التعليقات ✍️', hint: 'تلميح', answer: 'الإجابة الصحيحة', fastest: 'الأسرع ⚡',
      board: 'الترتيب العام 🏆', nobody: 'لم يُجب أحد بشكل صحيح هذه المرة 😅', paused: 'استراحة قصيرة… نعود حالاً ⏸', final: 'بطل التحدي 👑', soon: 'السؤال التالي بعد {s}…', ready: 'استعدوا! التحدي سيبدأ…', correct: 'أجابوا بشكل صحيح' }
  };

  let api = null;
  let st = null;              // per-session quiz state (persisted in session.quiz)
  let q = null;               // current question
  let phase = 'idle';         // idle | ready | topic | question | reveal | board | final
  let phaseEnds = 0, pausedLeft = 0, paused = false;
  let roulette = null;
  let mapAnim = null;

  const cfg = () => api.cfg();
  const T = (k, v) => { let s = (TXT[cfg().lang] || TXT.ma)[k] || k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
  const W = () => G.QUIZ_WORLD;

  /* =================================================================
   * ANSWER MATCHING
   * ================================================================= */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0))
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  const stripAl = w => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w.length > 4 && /^(وال|بال|لل)/.test(w) ? w.slice(3) : w);
  const key = s => norm(s).split(' ').filter(Boolean).map(stripAl).join(' ');
  function lev(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  /** true if the comment contains one of the accepted answers (whole words, small typo allowed) */
  function isCorrect(comment, answers, fuzzy) {
    const c = key(comment);
    if (!c) return false;
    const cTokens = c.split(' ');
    const nums = (norm(comment).match(/\d+/g) || []);
    for (const ans of answers) {
      const a = key(ans);
      if (!a) continue;
      if (/^\d+$/.test(a)) { if (nums.includes(a)) return true; continue; }
      if (c === a) return true;
      // anti-spam: a comment listing many guesses ("باريس روما لندن مدريد…") does not count
      if (cTokens.length > a.split(' ').length + 3) continue;
      if ((' ' + c + ' ').includes(' ' + a + ' ')) return true;
      if (c.replace(/ /g, '') === a.replace(/ /g, '')) return true;
      if (!fuzzy || a.replace(/ /g, '').length < 4) continue;
      const n = a.split(' ').length, tol = a.length >= 8 ? 2 : 1;
      for (let i = 0; i + n <= cTokens.length; i++) {
        const win = cTokens.slice(i, i + n).join(' ');
        if (lev(win, a) <= tol) return true;
      }
    }
    return false;
  }

  /* =================================================================
   * QUESTION GENERATION
   * ================================================================= */
  function tierFor(no) { return no <= 10 ? 1 : no <= 20 ? 2 : 3; }
  function pickCountry(filter, maxTier, prefix) {
    const used = new Set(st.used);
    let pool = W().countries.filter(c => filter(c) && c.tier <= maxTier && !used.has(prefix + c.c));
    if (!pool.length) pool = W().countries.filter(c => filter(c) && !used.has(prefix + c.c));
    if (!pool.length) { st.used = st.used.filter(u => !u.startsWith(prefix)); pool = W().countries.filter(filter); }
    return rnd(pool);
  }
  const countryAnswers = c => [...c.ar, ...c.en];
  const cname = c => c.ar[0];

  function makeQuestion(catId, no) {
    const maxTier = tierFor(no);
    const base = { cat: catId, no };
    switch (catId) {
      case 'flags': {
        const c = pickCountry(() => true, maxTier, 'flag:');
        return { ...base, id: 'flag:' + c.c, titleAr: 'لمن هذا العلم؟', titleEn: 'Whose flag is this?', visual: { kind: 'flag', code: c.c }, answers: countryAnswers(c), show: { ar: cname(c), en: c.en[0] } };
      }
      case 'capitals': {
        const reverse = Math.random() < 0.35;
        if (reverse) {
          const c = pickCountry(x => key(x.cap.ar) !== key(x.ar[0]) && !x.ar.some(n => key(n) === key(x.cap.ar)), maxTier, 'caprev:');
          return { ...base, id: 'caprev:' + c.c, titleAr: 'عاصمة أي دولة؟', titleEn: 'Capital of which country?', visual: { kind: 'text', text: c.cap.ar, sub: c.cap.en }, answers: countryAnswers(c), show: { ar: cname(c), en: c.en[0] } };
        }
        // skip countries whose capital has the same name as the country (Tunisia, Algeria, Kuwait…)
        const c = pickCountry(x => !x.ar.some(n => key(n) === key(x.cap.ar)) && !x.cap.al.some(a => x.ar.some(n => key(n) === key(a))), maxTier, 'cap:');
        return { ...base, id: 'cap:' + c.c, titleAr: 'ما هي عاصمة هذه الدولة؟', titleEn: 'What is the capital?', visual: { kind: 'flagtext', code: c.c, text: cname(c) }, answers: c.cap.al, show: { ar: c.cap.ar, en: c.cap.en } };
      }
      case 'geo': {
        const locate = Math.random() < 0.5;
        const c = pickCountry(x => x.area >= (locate ? 0.8 : 3), maxTier, locate ? 'loc:' : 'shape:');
        return locate
          ? { ...base, id: 'loc:' + c.c, titleAr: 'ما هي الدولة المضيئة على الخريطة؟', titleEn: 'Guess the highlighted country', visual: { kind: 'locate', code: c.c }, answers: countryAnswers(c), show: { ar: cname(c), en: c.en[0] } }
          : { ...base, id: 'shape:' + c.c, titleAr: 'خمّن الدولة من شكلها', titleEn: 'Guess the country by its shape', visual: { kind: 'shape', code: c.c }, answers: countryAnswers(c), show: { ar: cname(c), en: c.en[0] } };
      }
      case 'maths': {
        let a, b, op, r;
        if (maxTier === 1) { a = 10 + ((Math.random() * 80) | 0); b = 5 + ((Math.random() * 40) | 0); op = Math.random() < 0.5 ? '+' : '−'; if (op === '−' && b > a) [a, b] = [b, a]; r = op === '+' ? a + b : a - b; }
        else if (maxTier === 2) { a = 3 + ((Math.random() * 10) | 0); b = 3 + ((Math.random() * 10) | 0); op = '×'; r = a * b; }
        else { a = 12 + ((Math.random() * 30) | 0); b = 3 + ((Math.random() * 7) | 0); op = '×'; r = a * b; }
        return { ...base, id: 'math:' + a + op + b, titleAr: 'احسب بسرعة', titleEn: 'Quick maths', visual: { kind: 'math', text: `${a} ${op} ${b} = ?` }, answers: [String(r)], show: { ar: String(r), en: '' } };
      }
      case 'languages': {
        const used = new Set(st.used);
        const words = G.QUIZ_WORDS.filter(w => !used.has('word:' + w[2]));
        const w = rnd(words.length ? words : G.QUIZ_WORDS);
        const mode = rnd(['en2ar', 'fr2ar', 'ar2en', 'ar2fr']);
        const id = 'word:' + w[2];
        if (mode === 'en2ar') return { ...base, id, titleAr: 'ما معنى هذه الكلمة بالعربية؟', titleEn: 'Translate to Arabic', visual: { kind: 'text', text: w[2], sub: 'English 🇬🇧' }, answers: [w[0], ...w[1]], show: { ar: w[0], en: w[2] } };
        if (mode === 'fr2ar') return { ...base, id, titleAr: 'ما معنى هذه الكلمة بالعربية؟', titleEn: 'Traduire en arabe', visual: { kind: 'text', text: w[3], sub: 'Français 🇫🇷' }, answers: [w[0], ...w[1]], show: { ar: w[0], en: w[3] } };
        if (mode === 'ar2en') return { ...base, id, titleAr: 'كيف نقولها بالإنجليزية؟', titleEn: 'Say it in English', visual: { kind: 'text', text: w[0], sub: '→ English 🇬🇧' }, answers: [w[2]], show: { ar: w[2], en: w[0] } };
        return { ...base, id, titleAr: 'كيف نقولها بالفرنسية؟', titleEn: 'En français ?', visual: { kind: 'text', text: w[0], sub: '→ Français 🇫🇷' }, answers: [w[3]], show: { ar: w[3], en: w[0] } };
      }
      default: {
        const bank = G.QUIZ_BANK[catId] || [];
        const used = new Set(st.used);
        let pool = bank.map((x, i) => ({ x, i })).filter(o => !used.has('bank:' + catId + ':' + o.i));
        if (!pool.length) { st.used = st.used.filter(u => !u.startsWith('bank:' + catId + ':')); pool = bank.map((x, i) => ({ x, i })); }
        let easy = pool.filter(o => o.x[3] <= maxTier);
        const o = rnd(easy.length ? easy : pool);
        const [text, ans, more] = o.x;
        const latin = more.find(a => /^[a-z]/i.test(a)) || '';
        return { ...base, id: 'bank:' + catId + ':' + o.i, titleAr: CAT[catId].ar, titleEn: CAT[catId].en, visual: { kind: 'question', text }, answers: [ans, ...more], show: { ar: ans, en: latin } };
      }
    }
  }

  function enabledCats() {
    const off = new Set((cfg().quizOff || '').split(',').filter(Boolean));
    const list = CATS.filter(c => !off.has(c.id));
    return list.length ? list : CATS;
  }
  function chooseCat() {
    const cats = enabledCats();
    // avoid repeating the previous category
    const pool = cats.length > 1 ? cats.filter(c => c.id !== st.lastCat) : cats;
    return rnd(pool).id;
  }

  /* =================================================================
   * FLOW
   * ================================================================= */
  function S() { return api.session(); }
  function ensureState() {
    const s = S();
    if (!s.quiz) s.quiz = { no: 0, game: 1, used: [], lastCat: null, asked: 0 };
    st = s.quiz;
  }
  function setPhase(p, ms) { phase = p; phaseEnds = ms ? Date.now() + ms : 0; render(); }

  function start() {
    ensureState();
    q = null; paused = false;
    setPhase('ready', 4000);
  }
  function stop() { phase = 'idle'; q = null; paused = false; clearAnim(); }

  function nextTopic(forceCat) {
    ensureState();
    if (st.no >= cfg().qCount) { st.no = 0; st.game++; }
    st.no++;
    const cat = forceCat || chooseCat();
    st.lastCat = cat;
    roulette = { target: CATS.findIndex(c => c.id === cat), start: Date.now(), dur: 5200, cat };
    setPhase('topic', 6500);
    api.save();
  }

  function askQuestion() {
    q = makeQuestion(roulette ? roulette.cat : chooseCat(), st.no);
    q.correct = []; q.got = {}; q.start = Date.now(); q.hintAt = q.start + cfg().qTime * 500;
    st.used.push(q.id); if (st.used.length > 1500) st.used.splice(0, 300);
    st.asked++;
    setPhase('question', cfg().qTime * 1000);
    api.Sfx.lid();
    api.save();
  }

  function reveal() {
    if (!q || phase !== 'question') return;
    q.done = true;
    setPhase('reveal', 6500);
    api.Sfx.win();
    api.save();
  }

  function afterReveal() {
    setPhase('board', cfg().winnersTime * 1000);
    if (st.no >= cfg().qCount) setTimeout(() => { if (phase === 'board') setPhase('final', 12000); }, Math.min(6000, cfg().winnersTime * 1000));
  }

  function tick() {
    if (phase === 'idle' || paused) return;
    const now = Date.now();
    if (phase === 'question' && q) {
      const left = Math.max(0, Math.ceil((phaseEnds - now) / 1000));
      if (left !== q.lastLeft) { q.lastLeft = left; if (left <= 5 && left > 0) api.Sfx.tick(left === 1); renderTimer(); }
      if (!q.hint && now >= q.hintAt) { q.hint = true; renderHint(); }
    }
    if (phase === 'topic') renderRoulette();
    if (!phaseEnds || now < phaseEnds) return;
    if (phase === 'ready') return nextTopic();
    if (phase === 'topic') return askQuestion();
    if (phase === 'question') return reveal();
    if (phase === 'reveal') return afterReveal();
    if (phase === 'board' || phase === 'final') {
      if (cfg().autopilot) return nextTopic();
      phaseEnds = 0;
    }
  }
  setInterval(tick, 200);

  /* ---------------- answers from comments ---------------- */
  function onChat(c, p, uid) {
    if (!q || phase !== 'question' || paused) return phase === 'question' ? 'متوقف' : 'ما كاينش سؤال دابا';
    if (q.got[uid]) return 'جاوب صح من قبل';
    p.answers = (p.answers || 0) + 1;
    if (!isCorrect(c.c, q.answers, cfg().fuzzy !== false)) return 'جواب غالط';
    const t = (Date.now() - q.start) / 1000;
    const pts = 10 + Math.round(10 * Math.max(0, 1 - t / cfg().qTime));
    q.got[uid] = { pts, t };
    q.correct.push(uid);
    p.pts = (p.pts || 0) + pts; p.correct = (p.correct || 0) + 1; p.last = pts; p.lastQ = st.asked;
    renderCorrect(true);
    api.Sfx.select();
    return 'صحيح ✓ +' + pts;
  }

  /* =================================================================
   * RENDERING (viewers)
   * ================================================================= */
  function avatar(p, cls) {
    const initial = esc((p.n || '?').trim().charAt(0).toUpperCase());
    let h = 0; for (const ch of String(p.n || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const col = ['#3B82F6', '#14B8A6', '#8B5CF6', '#F59E0B', '#EF4444', '#22C55E'][Math.abs(h) % 6];
    const img = p.a && /^https:\/\//.test(p.a) ? `<img src="${esc(p.a)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : '';
    return `<span class="qa ${cls || ''}" style="background:${col}"><b>${initial}</b>${img}</span>`;
  }
  function show(id) { ['qzReady', 'qzTopic', 'qzQuestion', 'qzBoard', 'qzFinal'].forEach(x => $(x).classList.toggle('on', x === id)); }

  // keep the bottom of the screen free so TikTok's comment overlay does not cover the game
  function applyLayout() {
    const hud = $('quizHud'); if (!hud) return;
    const free = Math.max(0, Math.min(55, Number(cfg().freeSpace == null ? 40 : cfg().freeSpace)));
    const top = Math.max(0, Math.min(25, Number(cfg().topSpace == null ? 13 : cfg().topSpace)));
    hud.style.setProperty('--free', free + 'vh');
    hud.style.setProperty('--top', top + 'vh');
    hud.classList.toggle('compact', free >= 30 || top >= 10);
    hud.classList.toggle('tight', free + top >= 50);
    const g = $('qzGuides'); if (g) g.classList.toggle('on', !!cfg().showGuides);
  }
  function render() {
    const hud = $('quizHud'); if (!hud) return;
    applyLayout();
    $('qzCounter').innerHTML = `<b>${st ? st.no : 0}</b><small>/${cfg().qCount}</small>`;
    $('qzPaused').classList.toggle('show', paused);
    $('qzPaused').textContent = T('paused');
    $('qzPrompt').textContent = T('type');
    $('qzPrompt').classList.toggle('on', phase === 'question');
    if (phase === 'ready') { show('qzReady'); $('qzReadyText').textContent = T('ready'); setTitle(T('next'), T('nextEn')); renderWall(); }
    if (phase === 'topic') { show('qzTopic'); setTitle(T('next'), T('nextEn')); renderTopics(); renderWall(); }
    if (phase === 'question' || phase === 'reveal') { show('qzQuestion'); renderQuestion(); }
    if (phase === 'board') { show('qzBoard'); setTitle(T('board'), 'Leaderboard'); renderBoard(); }
    if (phase === 'final') { show('qzFinal'); setTitle(T('final'), 'Champion'); renderFinal(); }
  }
  function setTitle(ar, en, pts) {
    $('qzTitle').innerHTML = `<b>${esc(ar)}</b><small>${esc(en || '')}</small>`;
    $('qzPts').style.visibility = pts ? 'visible' : 'hidden';
    if (pts) $('qzPts').textContent = '+' + pts;
  }

  function renderTopics() {
    $('qzTopics').innerHTML = CATS.map((c, i) => `<div class="qt" data-i="${i}"><i>${c.icon}</i><b>${esc(c.ar)}</b><small>${esc(c.en)}</small></div>`).join('');
    renderRoulette();
  }
  function renderRoulette() {
    if (!roulette) return;
    const tiles = document.querySelectorAll('#qzTopics .qt');
    const el = Date.now() - roulette.start;
    const enabled = enabledCats().map(c => CATS.indexOf(c));
    let idx;
    if (el >= roulette.dur) idx = roulette.target;
    else {
      // decelerating spin: position grows like an ease-out curve
      const f = el / roulette.dur, steps = 26 + enabled.indexOf(roulette.target);
      const k = Math.floor(steps * (1 - Math.pow(1 - f, 2.4)));
      idx = enabled[k % enabled.length];
    }
    tiles.forEach((t, i) => { t.classList.toggle('hot', i === idx && el < roulette.dur); t.classList.toggle('pick', i === idx && el >= roulette.dur); t.classList.toggle('off', !enabled.includes(i)); });
    if (idx !== roulette.lastIdx) { roulette.lastIdx = idx; if (el < roulette.dur) api.Sfx.clack(); else api.Sfx.hint(); }
  }
  function renderWall() {
    const s = S();
    const ids = Object.keys(s.participants).sort((a, b) => (s.participants[b].pts || 0) - (s.participants[a].pts || 0)).slice(0, 40);
    const html = ids.map(id => avatar(s.participants[id], 'sm')).join('') + (ids.length ? `<em>✓ ${Object.keys(s.participants).length}</em>` : '');
    ['qzWall', 'qzWallReady'].forEach(x => { const el = $(x); if (el) el.innerHTML = html; });
  }

  function renderQuestion() {
    const cat = CAT[q.cat];
    setTitle(q.titleAr, q.titleEn, 20);
    $('qzCat').innerHTML = `${cat.icon} ${esc(cat.ar)}`;
    const v = q.visual, box = $('qzVisual');
    if (phase === 'question' && box.dataset.q !== q.id) {
      box.dataset.q = q.id;
      clearAnim();
      if (v.kind === 'flag') box.innerHTML = `<img class="qz-flag" src="flags/${v.code.toLowerCase()}.svg" alt="">`;
      else if (v.kind === 'flagtext') box.innerHTML = `<img class="qz-flag sm" src="flags/${v.code.toLowerCase()}.svg" alt=""><div class="qz-big">${esc(v.text)}</div>`;
      else if (v.kind === 'shape' || v.kind === 'locate') { box.innerHTML = '<canvas id="qzMap"></canvas>'; drawMap(v); }
      else if (v.kind === 'math') box.innerHTML = `<div class="qz-math">${esc(v.text)}</div>`;
      else if (v.kind === 'text') box.innerHTML = `<div class="qz-big">${esc(v.text)}</div><div class="qz-sub">${esc(v.sub || '')}</div>`;
      else box.innerHTML = `<div class="qz-qtext">${esc(v.text)}</div>`;
      $('qzHint').textContent = '';
    }
    $('qzQuestion').classList.toggle('revealed', phase === 'reveal');
    $('qzTimerWrap').style.visibility = phase === 'question' ? 'visible' : 'hidden';
    renderTimer(); renderCorrect(false);
    const ans = $('qzAnswer');
    if (phase === 'reveal') {
      ans.innerHTML = `<small>${esc(T('answer'))}</small><b>${esc(q.show.ar)}</b>${q.show.en && q.show.en !== q.show.ar ? `<i>${esc(q.show.en)}</i>` : ''}`;
      ans.classList.add('on');
      const s = S();
      const fast = q.correct.slice(0, 6);
      $('qzFast').innerHTML = fast.length
        ? `<div class="qz-fast-t">${esc(T('fastest'))}</div><div class="qz-fast-row">` + fast.map(id => { const p = s.participants[id]; return `<div class="qf">${avatar(p, 'md')}<span>${esc(p.n)}</span><em>+${q.got[id].pts}</em></div>`; }).join('') + '</div>'
        : `<div class="qz-none">${esc(T('nobody'))}</div>`;
      $('qzFast').classList.add('on');
      if (v.kind === 'shape' || v.kind === 'locate') drawMap(v, true);
    } else { ans.classList.remove('on'); $('qzFast').classList.remove('on'); }
  }
  function renderTimer() {
    if (!q || phase !== 'question') return;
    const total = cfg().qTime * 1000;
    const left = Math.max(0, paused ? pausedLeft : phaseEnds - Date.now());
    $('qzSec').textContent = Math.ceil(left / 1000);
    const bar = $('qzBar');
    bar.style.transition = 'none'; bar.style.width = (left / total * 100) + '%';
    bar.classList.toggle('low', left < 6000);
    if (!paused) { void bar.offsetWidth; bar.style.transition = `width ${left}ms linear`; bar.style.width = '0%'; }
  }
  function renderCorrect(pop) {
    if (!q) return;
    const s = S();
    const ids = q.correct.slice(0, 24);
    $('qzCorrect').innerHTML = ids.map((id, i) => avatar(s.participants[id], 'sm' + (pop && i === ids.length - 1 && q.correct.length <= 24 ? ' pop' : ''))).join('') +
      `<em>✓ ${q.correct.length}</em>`;
    $('qzCorrect').classList.toggle('empty', !q.correct.length);
  }
  function renderHint() {
    if (!q || !q.hint || phase !== 'question') return;
    const a = String(q.show.ar);
    if (/^\d+$/.test(a) || q.visual.kind === 'math') { $('qzHint').textContent = ''; return; }
    const pattern = a.split(' ').map(w => w.charAt(0) + ' _'.repeat(Math.max(0, [...w].length - 1))).join('   ');
    $('qzHint').innerHTML = `<small>${esc(T('hint'))}</small> <b dir="auto">${esc(pattern)}</b>`;
  }

  function renderBoard() {
    const s = S();
    const ids = Object.keys(s.participants).filter(id => s.participants[id].pts > 0)
      .sort((a, b) => (s.participants[b].pts - s.participants[a].pts) || (s.participants[b].correct - s.participants[a].correct)).slice(0, 10);
    const top = q ? q.correct.slice(0, 6) : [];
    $('qzBoardTop').innerHTML = top.map(id => { const p = s.participants[id]; return `<div class="qf">${avatar(p, 'md')}<span>${esc(p.n)}</span><em>+${q.got[id].pts}</em></div>`; }).join('');
    $('qzBoardAns').innerHTML = q ? `<b>${esc(q.show.ar)}</b>${q.show.en && q.show.en !== q.show.ar ? `<i>${esc(q.show.en)}</i>` : ''}<span class="qz-cnt">✓ ${q.correct.length}</span>` : '';
    $('qzList').innerHTML = ids.length ? ids.map((id, i) => {
      const p = s.participants[id];
      const gain = p.lastQ === st.asked && p.last ? `<em>+${p.last}</em>` : '<em></em>';
      return `<li class="${i < 3 ? 'm' + (i + 1) : ''}"><span class="rk">${i + 1}</span>${avatar(p, 'sm')}<span class="nm">${esc(p.n)}</span><span class="ok">✓ ${p.correct || 0}</span>${gain}<b>${p.pts}</b></li>`;
    }).join('') : `<li class="none">${esc(T('nobody'))}</li>`;
    renderSoon();
  }
  function renderSoon() {
    const el = $('qzSoon'); if (!el) return;
    el.textContent = cfg().autopilot && phaseEnds && (phase === 'board') ? T('soon', { s: Math.max(0, Math.ceil((phaseEnds - Date.now()) / 1000)) }) : '';
  }
  setInterval(() => { if (phase === 'board') renderSoon(); }, 500);

  function renderFinal() {
    const s = S();
    const ids = Object.keys(s.participants).filter(id => s.participants[id].pts > 0).sort((a, b) => s.participants[b].pts - s.participants[a].pts).slice(0, 3);
    const medal = ['gold', 'silver', 'bronze'];
    $('qzFinalBody').innerHTML = ids.length ? '<div class="qz-podium">' + [1, 0, 2].map(i => {
      const id = ids[i]; if (!id) return '<div class="qp empty"></div>';
      const p = s.participants[id];
      return `<div class="qp ${medal[i]}">${i === 0 ? '<div class="crown">👑</div>' : ''}${avatar(p, 'xl')}<span>${esc(p.n)}</span><em>✓ ${p.correct} · ${p.pts}</em><div class="step">${i + 1}</div></div>`;
    }).join('') + '</div>' : `<div class="qz-none">${esc(T('nobody'))}</div>`;
    api.Sfx.fanfare();
  }

  /* ---------------- maps (Natural Earth) ---------------- */
  function clearAnim() { if (mapAnim) cancelAnimationFrame(mapAnim); mapAnim = null; }
  function ringsOf(code) {
    let rs = W().shapes[code] || [];
    const lons = rs.flat().map(p => p[0]);
    if (Math.max(...lons) - Math.min(...lons) > 180) rs = rs.map(r => r.map(([x, y]) => [x < 0 ? x + 360 : x, y]));   // across the date line
    return rs;
  }
  function bboxOf(rs) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    rs.forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    return { x0, y0, x1, y1 };
  }
  function drawMap(v, revealed) {
    const cv = $('qzMap'); if (!cv) return;
    const box = cv.parentElement;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = box.clientWidth, h = box.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    const target = ringsOf(v.code);
    const bb = bboxOf(target);
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const k = Math.cos(cy * Math.PI / 180) || 1;
    // final view: the country (shape) or the country inside its region (locate)
    const span = v.kind === 'shape' ? Math.max((bb.x1 - bb.x0) * k, bb.y1 - bb.y0) * 1.25
      : Math.max(28, Math.max((bb.x1 - bb.x0) * k, bb.y1 - bb.y0) * 3.2);
    const from = v.kind === 'locate' && !revealed ? Math.min(160, span * 3) : span;
    const t0 = performance.now(), dur = v.kind === 'locate' && !revealed ? 1800 : 0;
    const frame = now => {
      const f = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - f, 3);
      const sp = from + (span - from) * e;
      const scale = Math.min(w, h * 1.4) / sp * dpr;
      const P = (x, y) => [(x - cx) * k * scale + cv.width / 2, (cy - y) * scale + cv.height / 2];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0B2447'; ctx.fillRect(0, 0, cv.width, cv.height);
      const path = rs => { ctx.beginPath(); rs.forEach(r => { r.forEach(([x, y], i) => { const [px, py] = P(x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); }); };
      if (v.kind === 'locate') {
        path(W().bg); ctx.fillStyle = '#F4E3B0'; ctx.fill('evenodd');
        ctx.lineWidth = 0.8 * dpr; ctx.strokeStyle = 'rgba(11,36,71,.55)'; ctx.stroke();
        path(target); ctx.fillStyle = revealed ? '#22C55E' : '#FFB703'; ctx.fill('evenodd');
        ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
      } else {
        path(target); ctx.fillStyle = revealed ? '#22C55E' : '#F4E3B0'; ctx.fill('evenodd');
        ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      if (f < 1) mapAnim = requestAnimationFrame(frame); else mapAnim = null;
    };
    clearAnim(); mapAnim = requestAnimationFrame(frame);
  }

  /* =================================================================
   * HOST CONTROLS
   * ================================================================= */
  const ctl = {
    next() { paused = false; if (phase === 'question') reveal(); else if (phase === 'topic') askQuestion(); else nextTopic(); },
    newTopic(cat) { paused = false; nextTopic(cat && CAT[cat] ? cat : undefined); },
    reveal() { if (phase === 'question') { paused = false; reveal(); } else if (phase === 'topic') { askQuestion(); } },
    togglePause() {
      if (phase === 'idle' || phase === 'ready') return;
      if (!paused) { paused = true; pausedLeft = Math.max(0, phaseEnds - Date.now()); }
      else { paused = false; if (phaseEnds) phaseEnds = Date.now() + pausedLeft; }
      render(); if (phase === 'question') renderTimer();
    },
    showBoard() { if (phase !== 'question') { setPhase('board', cfg().autopilot ? cfg().winnersTime * 1000 : 0); } },
    hideBoard() { if (phase === 'board' || phase === 'final') { phaseEnds = 0; nextTopic(); } },
    restart() { ensureState(); st.no = 0; st.game++; paused = false; nextTopic(); },
    replayQuestion() {
      if (!q) return;
      const again = Object.assign({}, q, { correct: [], got: {}, start: Date.now(), hint: false, done: false });
      again.hintAt = again.start + cfg().qTime * 500;
      q = again; $('qzVisual').dataset.q = ''; setPhase('question', cfg().qTime * 1000);
    }
  };

  /* simulation support: what a fake viewer could answer right now */
  function simTarget() {
    if (!q || phase !== 'question' || paused) return null;
    return { id: q.id, right: rnd(q.answers), wrong: q.visual.kind === 'math' ? String((+q.answers[0] || 10) + 1 + ((Math.random() * 5) | 0)) : rnd(['ما عرفتش', 'باريس', 'مصر', 'لندن', '7', 'روما', 'البرازيل']) };
  }

  G.Quiz = {
    CATS,
    init(a) { api = a; },
    applyLayout,
    start, stop, onChat, ctl, simTarget,
    isCorrect, key,
    get phase() { return phase; },
    get paused() { return paused; },
    stats() {
      const s = S(); ensureState();
      return [['السؤال', st.no + '/' + cfg().qCount], ['جاوبو صح (هاد السؤال)', q ? q.correct.length : 0], ['الأسئلة المطروحة', st.asked]];
    },
    _debug: () => ({ phase, q, st })
  };
})(window);
