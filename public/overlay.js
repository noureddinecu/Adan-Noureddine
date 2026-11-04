// شاشة البث المباشر — Live overlay for TikTok LIVE Studio / OBS (Browser Source)
// URL options: ?lang=ar|fr|en  &bg=transparent  &board=0  &sound=0
(() => {
  const params = new URLSearchParams(location.search);
  const forcedLang = params.get('lang');
  if (params.get('bg') === 'transparent') document.body.classList.add('transparent');
  if (params.get('board') === '0') document.body.classList.add('no-board');
  const soundOn = params.get('sound') !== '0';

  const I18N = {
    ar: {
      dir: 'rtl', waiting: 'المسابقة ستبدأ قريباً', waitingSub: 'تابعوا البث وجهّزوا أصابعكم للتعليق! ⚡', ready: 'استعدوا!',
      question: 'سؤال', of: 'من', typeLetter: 'اكتب <b>أ</b> أو <b>ب</b> أو <b>ج</b> أو <b>د</b> في التعليقات', typeAnswer: 'اكتب <b>الجواب</b> في التعليقات 💬',
      firstWins: 'أول إجابة صحيحة تفوز!', winner: 'الفائز', correctAnswer: 'الإجابة الصحيحة', noWinner: 'لم يُجب أحد بشكل صحيح 😅',
      top10: '🏆 أفضل 10', champion: 'بطل الجولة', pts: 'نقطة', source: 'المصدر', answers: 'محاولة', finished: 'انتهت الجولة!',
      thanks: 'شكراً لكل المشاركين ❤️', easy: 'سهل', medium: 'متوسط', hard: 'صعب', letters: ['أ', 'ب', 'ج', 'د'], correctToast: 'إجابة صحيحة',
    },
    fr: {
      dir: 'ltr', waiting: 'Le quiz commence bientôt', waitingSub: 'Préparez vos doigts pour commenter ! ⚡', ready: 'Prêts ?',
      question: 'Question', of: 'sur', typeLetter: 'Écris <b>A</b>, <b>B</b>, <b>C</b> ou <b>D</b> dans les commentaires', typeAnswer: 'Écris <b>la réponse</b> dans les commentaires 💬',
      firstWins: 'La première bonne réponse gagne !', winner: 'Gagnant', correctAnswer: 'Bonne réponse', noWinner: 'Personne n’a trouvé 😅',
      top10: '🏆 Top 10', champion: 'Champion de la manche', pts: 'pts', source: 'Source', answers: 'réponses', finished: 'Manche terminée !',
      thanks: 'Merci à tous les participants ❤️', easy: 'Facile', medium: 'Moyen', hard: 'Difficile', letters: ['A', 'B', 'C', 'D'], correctToast: 'Bonne réponse',
    },
    en: {
      dir: 'ltr', waiting: 'Quiz starting soon', waitingSub: 'Get ready to comment! ⚡', ready: 'Get ready!',
      question: 'Question', of: 'of', typeLetter: 'Type <b>A</b>, <b>B</b>, <b>C</b> or <b>D</b> in the comments', typeAnswer: 'Type <b>the answer</b> in the comments 💬',
      firstWins: 'First correct answer wins!', winner: 'Winner', correctAnswer: 'Correct answer', noWinner: 'Nobody got it 😅',
      top10: '🏆 Top 10', champion: 'Round champion', pts: 'pts', source: 'Source', answers: 'answers', finished: 'Round over!',
      thanks: 'Thanks to everyone who played ❤️', easy: 'Easy', medium: 'Medium', hard: 'Hard', letters: ['A', 'B', 'C', 'D'], correctToast: 'Correct',
    },
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^(https?:\/\/|\/)/i.test(String(u || '')) ? String(u) : '');
  const tr = (t, lang) => (t ? t[lang] || t.ar || t.fr || t.en || '' : '');

  let meta = { categories: [] };
  let state = null;
  let clockOffset = 0;
  let lastKey = '';
  let lastTick = -1;

  const L = () => I18N[forcedLang || state?.lang || 'ar'] || I18N.ar;
  const lang = () => (I18N[forcedLang] ? forcedLang : state?.lang || 'ar');

  function avatarHtml(user, cls = 'avatar') {
    const url = safeUrl(user?.avatar);
    if (url) return `<img class="${cls}" src="${esc(url)}" alt="" referrerpolicy="no-referrer">`;
    return `<div class="${cls}">${esc((user?.nickname || '?').trim().charAt(0).toUpperCase())}</div>`;
  }

  // ---------- Sound (Web Audio, no assets needed) ----------
  let ctx = null;
  function audio() {
    if (!soundOn) return null;
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); $('soundBtn').hidden = false; }
    return ctx;
  }
  function tone(freq, start, dur, type = 'sine', vol = 0.18) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, a.currentTime + start);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + start + dur);
    o.connect(g).connect(a.destination);
    o.start(a.currentTime + start);
    o.stop(a.currentTime + start + dur + 0.05);
  }
  const sfx = {
    tick: () => tone(880, 0, 0.08, 'square', 0.06),
    question: () => { tone(523, 0, 0.12); tone(784, 0.12, 0.2); },
    correct: () => { tone(660, 0, 0.12, 'triangle'); tone(880, 0.1, 0.12, 'triangle'); tone(1320, 0.2, 0.3, 'triangle'); },
    timeout: () => { tone(330, 0, 0.25, 'sawtooth', 0.08); tone(247, 0.25, 0.4, 'sawtooth', 0.08); },
    fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.16, i === 5 ? 0.7 : 0.18, 'triangle', 0.2)),
  };
  $('soundBtn').onclick = () => { audio(); ctx?.resume(); $('soundBtn').hidden = true; };

  // ---------- Confetti ----------
  const cv = $('confetti');
  const cx = cv.getContext('2d');
  let parts = [];
  let raf = 0;
  function confetti(n = 160) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#fe2c55', '#25f4ee', '#ffd54a', '#2ee59d', '#ffffff', '#b388ff'];
    for (let i = 0; i < n; i++) {
      parts.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, c: colors[i % colors.length] });
    }
    if (!raf) raf = requestAnimationFrame(drawConfetti);
  }
  function drawConfetti() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter((p) => p.y < cv.height + 30);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += p.va;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); cx.restore();
    }
    raf = parts.length ? requestAnimationFrame(drawConfetti) : 0;
  }

  // ---------- Rendering ----------
  function header() {
    const q = state.question;
    const l = L();
    const cat = q ? meta.categories.find((c) => c.id === q.category) : null;
    $('cat').textContent = cat ? `${cat.icon} ${tr(cat.name, lang())}` : '';
    $('diff').textContent = q ? l[q.difficulty] : '';
    $('diff').className = `pill ${q ? q.difficulty : ''}`;
    $('count').textContent = state.total && state.index >= 0 && q ? `${l.question} ${state.index + 1} ${l.of} ${state.total}` : '';
  }

  function board() {
    const l = L();
    $('boardTitle').textContent = l.top10;
    $('boardList').innerHTML = (state.leaderboard || []).map((e) => `
      <li><span class="rk">${e.rank}</span>${avatarHtml(e, safeUrl(e.avatar) ? '' : 'ph')}<span class="nm">${esc(e.nickname)}</span><span class="pt">${e.points}</span></li>`).join('');
  }

  function questionHtml(reveal) {
    const q = state.question;
    const l = L();
    const lg = lang();
    let html = `<div class="card"><p class="q-text">${esc(tr(q.text, lg))}</p></div>`;
    const img = safeUrl(q.image);
    if (img) html += `<img class="q-image ${q.type === 'flag' ? 'flag' : ''}" src="${esc(img)}" alt="">`;
    if (q.answerMode === 'choice') {
      html += '<div class="choices">' + q.choices.map((c, i) => {
        let cls = 'choice';
        if (reveal) cls += i === state.result.correctIndex ? ' correct' : ' dim';
        return `<div class="${cls}"><span class="letter">${l.letters[i]}</span><span>${esc(tr(c, lg))}</span></div>`;
      }).join('') + '</div>';
    }
    if (!reveal) {
      const hint = q.answerMode === 'choice' ? l.typeLetter : l.typeAnswer;
      html += `<div class="hint">${hint}${state.mode === 'first' ? ` — ${l.firstWins}` : ''}</div>`;
    } else {
      const r = state.result;
      if (q.answerMode !== 'choice') html += `<div class="answer-box card"><div class="label">${l.correctAnswer}</div><div class="value">${esc(tr(r.answer, lg))}</div></div>`;
      if (r.winner) {
        html += `<div class="winner card"><span class="crown">👑</span>${avatarHtml(r.winner)}<div><div class="name">${esc(r.winner.nickname)}</div><div class="pts">+${r.winner.points} ${l.pts} · ${(r.winner.ms / 1000).toFixed(1)}s</div></div></div>`;
      } else html += `<div class="no-winner">${l.noWinner}</div>`;
      if (r.source?.title) html += `<div class="source">${l.source}: ${esc(r.source.title)}</div>`;
    }
    return html;
  }

  function finalHtml() {
    const l = L();
    const f = state.final || { top: [] };
    const [a, b, c] = f.top;
    const step = (e, cls, n) => (e ? `<div class="step ${cls}">${avatarHtml(e)}<div class="nm">${esc(e.nickname)}</div><div class="pp">${e.points} ${l.pts}</div><div class="block">${n}</div></div>` : '');
    let html = `<h1 class="big-title">${l.finished}</h1>`;
    if (a) html += `<div class="sub">${l.champion}: <b>${esc(a.nickname)}</b> 🏆</div>`;
    html += `<div class="podium">${step(b, 'p2', 2)}${step(a, 'p1', 1)}${step(c, 'p3', 3)}</div><div class="sub">${l.thanks}</div>`;
    return html;
  }

  function render() {
    if (!state) return;
    const l = L();
    document.documentElement.lang = lang();
    document.documentElement.dir = l.dir;
    $('app').className = `phase-${state.phase}`;
    header();
    board();
    const key = `${state.phase}|${state.roundId}|${state.index}|${state.question?.id || ''}`;
    const changedPhase = key !== lastKey;
    if (state.phase === 'idle') {
      $('stage').innerHTML = `<h1 class="big-title">${l.waiting}</h1><div class="sub">${l.waitingSub}</div>`;
    } else if (state.phase === 'countdown') {
      if (changedPhase) $('stage').innerHTML = `<h1 class="big-title">${l.ready}</h1><div class="countdown-num" id="cd"></div>`;
    } else if (state.phase === 'question') {
      if (changedPhase) { $('stage').innerHTML = questionHtml(false); sfx.question(); }
    } else if (state.phase === 'reveal') {
      if (changedPhase) {
        $('stage').innerHTML = questionHtml(true);
        if (state.result.winner) { sfx.correct(); confetti(90); } else sfx.timeout();
      }
    } else if (state.phase === 'finished') {
      if (changedPhase) { $('stage').innerHTML = finalHtml(); sfx.fanfare(); confetti(260); setTimeout(() => confetti(160), 1200); }
    }
    lastKey = key;
  }

  function loop() {
    if (state) {
      const t = $('timer');
      const remaining = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - (Date.now() + clockOffset)) : 0;
      if (state.phase === 'question' && state.phaseEndsAt) {
        t.classList.remove('hidden');
        const frac = remaining / (state.duration * 1000);
        $('timerBar').style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
        const secs = Math.ceil(remaining / 1000);
        $('timerText').textContent = secs;
        t.classList.toggle('urgent', secs <= 5);
        if (secs <= 5 && secs > 0 && secs !== lastTick) { lastTick = secs; sfx.tick(); }
      } else {
        t.classList.add('hidden');
        lastTick = -1;
      }
      const cd = document.getElementById('cd');
      if (cd && state.phase === 'countdown') cd.textContent = Math.ceil(remaining / 1000) || '';
    }
    requestAnimationFrame(loop);
  }

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('feed').appendChild(el);
    setTimeout(() => el.remove(), 3500);
    while ($('feed').children.length > 4) $('feed').firstChild.remove();
  }

  // ---------- Live connection ----------
  fetch('/api/meta').then((r) => r.json()).then((m) => { meta = m; render(); }).catch(() => {});
  const es = new EventSource('/events');
  es.addEventListener('state', (e) => {
    state = JSON.parse(e.data);
    clockOffset = state.serverNow - Date.now();
    render();
  });
  es.addEventListener('correct', (e) => {
    const w = JSON.parse(e.data);
    if (state?.mode === 'all') { toast(`✅ ${w.nickname} +${w.points}`); sfx.correct(); }
  });
  requestAnimationFrame(loop);
})();
