/* =========================================================================
 * رالي العرب — TikTok LIVE country race
 * -------------------------------------------------------------------------
 *  - Viewers JOIN a country by commenting its name or flag (free).
 *  - Every like / follow / share / gift from a member pushes that country's car.
 *    Gifts push in proportion to their coin value; bigger gifts = nitro / rocket.
 *  - First car over the finish line (or the leader when time runs out) wins.
 *  - Last 20% of the track = TURBO ZONE: every push counts ×2.
 *  - Positive mechanics only (no attacking other countries) and the game never
 *    shows comment text on screen — only names, flags and actions.
 * ========================================================================= */
(function (G) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = () => G.Countries;
  const INK = '#2E2A30';
  const W = 720;
  const LANES = 8;
  const DEFAULT_LINEUP = ['MA', 'DZ', 'EG', 'TN', 'SA', 'IQ', 'LY', 'PS'];

  const TXT = {
    ma: {
      title: 'رالي العرب 🏁', lobby: 'السباق كيبدا بعد {s}', join: 'كتب سمية بلادك فالكومنتير باش تدخل للفريق 👇',
      help: '❤️ لايك = دفعة · ⭐ فولو = دفعة كبيرة · 🎁 كادو = نيترو 🔥', racing: 'دفعو بلادكم! ❤️🎁', turbo: '🔥 منطقة التوربو: كلشي ×2',
      joined: 'دخل لفريق', liked: 'لايكات', followed: 'تابع', shared: 'شارك', gave: 'دعم بـ', pending: 'كتب سمية بلادك باش يتحسب الكادو ديالك!',
      won: '{c} ربحات السباق! 🏆', supporters: 'أكبر المدعمين', paused: 'استراحة صغيرة ⏸', waiting: '{c} غادي تدخل فالسباق الجاي',
      standings: 'ترتيب الدول 📊', wins: 'انتصار', pts: 'نقطة', next: 'السباق الجاي بعد {s}…', nobody: 'حتى واحد ما دعم هاد المرة 😅', mvp: 'بطل'
    },
    ar: {
      title: 'رالي العرب 🏁', lobby: 'السباق يبدأ بعد {s}', join: 'اكتب اسم بلدك في التعليقات لتنضم إلى فريقه 👇',
      help: '❤️ إعجاب = دفعة · ⭐ متابعة = دفعة كبيرة · 🎁 هدية = نيترو 🔥', racing: 'ادفعوا بلدكم! ❤️🎁', turbo: '🔥 منطقة التوربو: كل شيء ×2',
      joined: 'انضم إلى فريق', liked: 'إعجابات', followed: 'تابع', shared: 'شارك', gave: 'دعم بـ', pending: 'اكتب اسم بلدك ليُحتسب دعمك!',
      won: '{c} فازت بالسباق! 🏆', supporters: 'أكبر الداعمين', paused: 'استراحة قصيرة ⏸', waiting: '{c} ستدخل السباق القادم',
      standings: 'ترتيب الدول 📊', wins: 'فوز', pts: 'نقطة', next: 'السباق التالي بعد {s}…', nobody: 'لم يدعم أحد هذه المرة 😅', mvp: 'بطل'
    }
  };

  let api = null;          // from live.js
  let cv = null, ctx = null, k = 1, H = 1280;
  let race = null;         // current race
  let active = false;
  let clock = performance.now(), lastDraw = 0;
  const fx = [];           // visual effects
  const imgCache = new Map();

  const cfg = () => api.cfg();
  const lang = () => (TXT[cfg().lang] ? cfg().lang : 'ma');
  function t(key, vars) { let s = TXT[lang()][key] || key; if (vars) for (const v of Object.keys(vars)) s = s.replace('{' + v + '}', vars[v]); return s; }
  const S = () => api.session();
  function rstate() {
    const s = S();
    if (!s.race) s.race = { countries: {}, races: 0 };
    return s.race;
  }
  function cstat(code) { const r = rstate(); return r.countries[code] || (r.countries[code] = { wins: 0, pts: 0, fans: 0 }); }

  /* ---------------- geometry ---------------- */
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
    k = cv.width / W; H = cv.height / k;
  }
  const track = () => ({ x0: 36, x1: W - 36, top: Math.round(H * 0.2), bottom: Math.round(H * 0.76) });
  function laneX(i) { const tr = track(); const lw = (tr.x1 - tr.x0) / LANES; return tr.x0 + lw * (i + 0.5); }

  /* ---------------- race lifecycle ---------------- */
  function fansOf(code) { const p = S().participants; let n = 0; for (const id in p) if (p[id].team === code) n++; return n; }
  function pickLineup() {
    const all = K().LIST.map(c => c.code);
    const score = c => fansOf(c) * 1e6 + (cstat(c).pts || 0);
    const withFans = all.filter(c => fansOf(c) > 0 || cstat(c).pts > 0).sort((a, b) => score(b) - score(a));
    const lineup = withFans.slice(0, LANES);
    for (const c of DEFAULT_LINEUP) if (lineup.length < LANES && !lineup.includes(c)) lineup.push(c);
    return lineup;
  }

  function newRace() {
    const c = cfg();
    rstate().races++;
    race = {
      no: rstate().races, phase: 'lobby', lineup: pickLineup(), pts: {}, disp: {}, speed: {}, supp: {},
      lobbyEnds: Date.now() + c.lobbyTime * 1000, endsAt: 0, startedAt: 0, paused: false, pausedAt: 0,
      winner: null, goal: c.raceGoal, queue: [], scroll: {}
    };
    race.lineup.forEach(code => { race.pts[code] = 0; race.disp[code] = 0; race.speed[code] = 0; race.scroll[code] = 0; });
    fx.length = 0;
    hideBoard();
    renderHud();
    api.save();
    return race;
  }
  function startRacing() {
    if (!race) return;
    race.phase = 'race'; race.startedAt = Date.now(); race.endsAt = Date.now() + cfg().raceTime * 1000;
    // gifts that arrived between races (or before joining) count now
    const s = S();
    for (const id in s.participants) { const p = s.participants[id]; if (p.pending && p.team) { const v = p.pending; p.pending = 0; push(p.team, v, p, id, 'gift'); } }
    api.Sfx.fanfare(); renderHud(); api.save();
  }
  function finish(winner) {
    if (!race || race.phase === 'done') return;
    race.phase = 'done';
    const lead = race.lineup.slice().sort((a, b) => race.pts[b] - race.pts[a]);
    race.winner = winner || (race.pts[lead[0]] > 0 ? lead[0] : null);
    race.order = lead;
    if (race.winner) { cstat(race.winner).wins++; burst(laneX(race.lineup.indexOf(race.winner)), yOf(race.disp[race.winner]), 60); }
    api.Sfx.win();
    renderHud(); api.save();
    setTimeout(() => { showResult(); api.onRaceEnd && api.onRaceEnd(race); }, 1800);
  }

  /* ---------------- points ---------------- */
  function turbo() {
    if (!race || race.phase !== 'race') return false;
    const lead = Math.max(0, ...race.lineup.map(c => race.pts[c]));
    return lead >= race.goal * 0.8 || (race.endsAt - Date.now()) < 30000;
  }
  function push(code, pts, p, uid, kind) {
    if (!race || race.phase === 'done' || race.paused) return null;   // no running race → caller keeps it as pending
    if (!race.lineup.includes(code)) {
      // country without a lane: take a free/empty lane, else it waits for the next race
      const idle = race.lineup.find(c => race.pts[c] === 0 && fansOf(c) === 0);
      if (idle) {
        const i = race.lineup.indexOf(idle); race.lineup[i] = code;
        race.pts[code] = 0; race.disp[code] = 0; race.speed[code] = 0; race.scroll[code] = 0;
        delete race.pts[idle]; delete race.disp[idle];
      } else {
        if (!race.queue.includes(code)) { race.queue.push(code); ticker({ flag: code, text: t('waiting', { c: K().BY[code].ar }) }); }
        cstat(code).pts += pts;
        return 0;
      }
    }
    const mult = turbo() ? 2 : 1;
    const add = pts * mult;
    race.pts[code] += add;
    cstat(code).pts += add;
    if (uid) { race.supp[uid] = (race.supp[uid] || 0) + add; if (p) p.pts = (p.pts || 0) + add; }
    if (race.pts[code] >= race.goal) finish(code);
    return add;
  }

  function participant(c) {
    const s = S();
    const uid = String(c.u || c.n || '').slice(0, 64);
    if (!uid) return null;
    let p = s.participants[uid];
    if (!p) p = s.participants[uid] = { n: c.n || uid, a: c.a || '', pts: 0, wins: 0, correct: 0, answers: 0 };
    if (c.n) p.n = String(c.n).slice(0, 40);
    if (c.a) p.a = c.a;
    return { uid, p };
  }

  // ---- event handlers (called by live.js) ----
  const lastCheer = new Map();
  function onChat(c) {
    const who = participant(c); if (!who) return 'ماشي مشارك';
    const { uid, p } = who;
    const code = K().detect(c.c);
    const wantsSwitch = /(^|\s)(بدل|بدلت|change|switch)(\s|$)/i.test(K().norm(c.c));
    if (code && (!p.team || wantsSwitch) && p.team !== code) {
      p.team = code;
      cstat(code).fans = fansOf(code);
      ticker({ who: p, flag: code, text: t('joined') + ' ' + K().BY[code].ar });
      push(code, cfg().joinPts, p, uid, 'join');
      // gifts sent before joining count now
      if (p.pending && race && race.phase !== 'done') { const pend = p.pending; p.pending = 0; push(code, pend, p, uid, 'gift'); }
      api.save();
      return 'دخل ' + K().BY[code].ar;
    }
    if (p.team && race && race.phase === 'race') {
      const last = lastCheer.get(uid) || 0;
      if (Date.now() - last > 5000) { lastCheer.set(uid, Date.now()); push(p.team, cfg().cheerPts, p, uid, 'cheer'); return 'تشجيع +' + cfg().cheerPts; }
      return 'تشجيع (تسنا 5ث)';
    }
    return p.team ? 'ما كاينش سباق دابا' : 'ما ذكرش البلاد';
  }

  function onGift(g) {
    const who = participant(g); if (!who) return '';
    const { uid, p } = who;
    const coins = Math.max(1, Number(g.coins) || 1) * Math.max(1, Number(g.count) || 1);
    const pts = coins * cfg().coinPts;
    p.coins = (p.coins || 0) + coins;
    S().coins = (S().coins || 0) + coins;
    S().gifts = (S().gifts || 0) + Math.max(1, Number(g.count) || 1);
    if (!p.team) {
      p.pending = (p.pending || 0) + pts;
      ticker({ who: p, gimg: g.gimg, text: (g.gname || '🎁') + ' ×' + (g.count || 1) + ' — ' + t('pending'), warn: true });
      return 'كادو بلا فريق (محفوظ)';
    }
    const added = push(p.team, pts, p, uid, 'gift');
    if (added === null) { p.pending = (p.pending || 0) + pts; ticker({ who: p, flag: p.team, gimg: g.gimg, text: t('gave') + ' ' + (g.gname || '🎁') + ' ×' + (g.count || 1) }); return 'كادو محفوظ للسباق الجاي'; }
    const lane = race ? race.lineup.indexOf(p.team) : -1;
    if (lane >= 0) {
      const tier = coins >= 1000 ? 4 : coins >= 100 ? 3 : coins >= 10 ? 2 : 1;
      fx.push({ type: 'nitro', lane, t: 0, life: tier >= 3 ? 3 : tier === 2 ? 2 : 1, tier });
      floatText(lane, '+' + Math.round(added || pts));
      if (tier >= 3) bigBanner(p, g, coins);
      if (tier >= 2) api.Sfx.hint(); else api.Sfx.select();
      if (tier >= 3) { shake = tier === 4 ? 1 : 0.5; burst(laneX(lane), yOf(race.disp[p.team]), tier === 4 ? 70 : 30); }
    }
    ticker({ who: p, flag: p.team, gimg: g.gimg, text: t('gave') + ' ' + (g.gname || '🎁') + ' ×' + (g.count || 1) });
    return 'كادو ' + coins + ' كوينز ← ' + K().BY[p.team].ar;
  }

  let likeBuf = new Map();
  function onLike(l) {
    const who = participant(l); if (!who) return '';
    const { uid, p } = who;
    const n = Math.max(1, Number(l.count) || 1);
    p.likes = (p.likes || 0) + n;
    S().likes = (S().likes || 0) + n;
    if (!p.team) return 'لايك بلا فريق';
    const added = push(p.team, n * cfg().likePts, p, uid, 'like');
    const lane = race ? race.lineup.indexOf(p.team) : -1;
    if (lane >= 0 && added) { floatText(lane, '+' + added, '#EF5F6B'); hearts(lane, Math.min(4, n)); }
    // group likes in the ticker (one line per user every few seconds)
    const b = likeBuf.get(uid) || { n: 0, at: 0 };
    b.n += n;
    if (Date.now() - b.at > 4000) { ticker({ who: p, flag: p.team, text: '❤️ ×' + b.n + ' ' + t('liked') }); b.n = 0; b.at = Date.now(); }
    likeBuf.set(uid, b);
    return 'لايك ×' + n;
  }

  function onSocial(kind, s) {
    const who = participant(s); if (!who) return '';
    const { uid, p } = who;
    if (kind === 'follow') S().follows = (S().follows || 0) + 1; else S().shares = (S().shares || 0) + 1;
    if (!p.team) return kind + ' بلا فريق';
    const pts = kind === 'follow' ? cfg().followPts : cfg().sharePts;
    push(p.team, pts, p, uid, kind);
    const lane = race ? race.lineup.indexOf(p.team) : -1;
    if (lane >= 0) { fx.push({ type: 'nitro', lane, t: 0, life: 1.2, tier: 2 }); floatText(lane, '+' + pts, '#3FBF7F'); }
    ticker({ who: p, flag: p.team, text: kind === 'follow' ? '⭐ ' + t('followed') : '🔁 ' + t('shared') });
    return kind;
  }

  /* ---------------- DOM HUD (viewers) ---------------- */
  function flagImg(code, cls) { return `<img class="rc-flag ${cls || ''}" src="${K().flagURL(code)}" alt="">`; }
  function renderHud() {
    if (!race) return;
    const top = $('rcTitle'), sub = $('rcSub'), tm = $('rcTimer');
    top.textContent = t('title') + ' · #' + race.no;
    if (race.phase === 'lobby') { sub.textContent = t('join'); }
    else if (race.phase === 'race') sub.textContent = turbo() ? t('turbo') : t('racing');
    else sub.textContent = race.winner ? t('won', { c: K().BY[race.winner].ar }) : '';
    $('rcTop').classList.toggle('turbo', race.phase === 'race' && turbo());
    tm.textContent = timerText();
    $('rcHelp').textContent = race.phase === 'lobby' ? t('help') : t('help');
    $('rcPaused').textContent = t('paused');
    $('rcPaused').classList.toggle('show', !!race.paused);
  }
  function timerText() {
    if (!race) return '';
    if (race.phase === 'lobby') return t('lobby', { s: Math.max(0, Math.ceil((race.lobbyEnds - Date.now()) / 1000)) });
    if (race.phase === 'race') { const s = Math.max(0, Math.ceil((race.endsAt - (race.paused ? race.pausedAt : Date.now())) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    return '🏁';
  }
  function ticker(e) {
    const box = $('rcTicker'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'rc-tk' + (e.warn ? ' warn' : '');
    el.innerHTML = (e.who ? avatar(e.who) + `<b>${esc(e.who.n)}</b>` : '') + (e.flag ? flagImg(e.flag) : '') +
      (e.gimg && /^https:\/\//.test(e.gimg) ? `<img class="rc-gift" src="${esc(e.gimg)}" referrerpolicy="no-referrer" onerror="this.remove()">` : '') +
      `<span>${esc(e.text)}</span>`;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 4500);
    setTimeout(() => el.remove(), 5000);
  }
  function avatar(p, cls) {
    const initial = esc((p.n || '?').trim().charAt(0).toUpperCase());
    let h = 0; for (const ch of String(p.n || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const col = ['#A193F6', '#7DD0F2', '#5CC593', '#F29B4B', '#EF5F6B', '#FFD23A'][Math.abs(h) % 6];
    const img = p.a && /^https:\/\//.test(p.a) ? `<img src="${esc(p.a)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : '';
    return `<span class="av ${cls || 'sm'}" style="background:${col}"><b>${initial}</b>${img}</span>`;
  }
  let bannerTimer = null;
  function bigBanner(p, g, coins) {
    const b = $('rcBanner'); if (!b) return;
    b.innerHTML = `${avatar(p, 'lg gold')}<div><b>${esc(p.n)}</b><span>${flagImg(p.team)} ${esc(K().BY[p.team].ar)}</span>` +
      `<em>${coins >= 1000 ? '🌟' : '🚀'} ${esc(g.gname || '')} ×${g.count || 1} · ${coins} 🪙</em></div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 3500);
  }

  /* ---------------- boards ---------------- */
  function boardHtml(title, sub, headHtml, rows) {
    const medal = ['gold', 'silver', 'bronze'];
    let html = `<div class="lb-card"><h2>${title}</h2><p class="lb-sub">${esc(sub)}</p>${headHtml || ''}`;
    if (!rows.length) html += `<div class="lb-none">${esc(t('nobody'))}</div>`;
    else {
      html += '<div class="podium">';
      [1, 0, 2].forEach(i => {
        const r = rows[i];
        if (!r) { html += '<div class="pod empty"></div>'; return; }
        html += `<div class="pod ${medal[i]}"><div class="medal">${i + 1}</div>${avatar(r.p, 'lg ' + medal[i])}<div class="pn">${r.flag ? flagImg(r.flag, 'xs') : ''}${esc(r.p.n)}</div><div class="pv">${esc(r.v)}</div><div class="step"></div></div>`;
      });
      html += '</div>';
      if (rows.length > 3) {
        html += '<ol class="lb-list">';
        rows.slice(3, 13).forEach((r, i) => { html += `<li><span class="rk">${i + 4}</span>${avatar(r.p)}<span class="nm">${r.flag ? flagImg(r.flag, 'xs') : ''}${esc(r.p.n)}</span><span class="vv">${esc(r.v)}</span></li>`; });
        html += '</ol>';
      }
    }
    return html + '<div class="lb-next" id="lvNext"></div></div>';
  }
  function showResult() {
    if (!race) return;
    const s = S();
    const rows = Object.keys(race.supp).sort((a, b) => race.supp[b] - race.supp[a])
      .map(id => ({ p: s.participants[id], flag: s.participants[id] && s.participants[id].team, v: Math.round(race.supp[id]) + ' ' + t('pts') }))
      .filter(r => r.p);
    const w = race.winner;
    const head = w ? `<div class="rc-win">${flagImg(w, 'big')}<b>${esc(t('won', { c: K().BY[w].ar }))}</b></div>` : '';
    const order = (race.order || race.lineup).slice(0, 5).map((c, i) => `<span>${i + 1}. ${flagImg(c, 'xs')} ${Math.round(race.pts[c] || 0)}</span>`).join('');
    $('lvBoard').innerHTML = boardHtml(esc(t('supporters')) + ' 🏆', '', head + `<div class="rc-order">${order}</div>`, rows);
    $('lvBoard').classList.add('show');
    api.Sfx.fanfare();
    api.setBoard('round');
  }
  function showStandings() {
    const r = rstate(), s = S();
    const codes = Object.keys(r.countries).filter(c => r.countries[c].pts > 0 || r.countries[c].wins > 0)
      .sort((a, b) => (r.countries[b].wins - r.countries[a].wins) || (r.countries[b].pts - r.countries[a].pts));
    const table = codes.slice(0, 10).map((c, i) => `<li><span class="rk">${i + 1}</span>${flagImg(c, 'xs')}<span class="nm">${esc(K().BY[c].ar)}</span><span class="vv">🏆${r.countries[c].wins} · ${Math.round(r.countries[c].pts)}</span></li>`).join('');
    const sup = Object.keys(s.participants).filter(id => s.participants[id].pts > 0)
      .sort((a, b) => s.participants[b].pts - s.participants[a].pts)
      .map(id => ({ p: s.participants[id], flag: s.participants[id].team, v: Math.round(s.participants[id].pts) + ' ' + t('pts') }));
    $('lvBoard').innerHTML = boardHtml(esc(t('standings')), r.races + ' · ' + Object.keys(s.participants).length,
      `<ol class="lb-list rc-table">${table || ''}</ol>`, sup);
    $('lvBoard').classList.add('show');
    api.setBoard('session');
  }
  function hideBoard() { const b = $('lvBoard'); if (b) b.classList.remove('show'); api && api.setBoard(null); }

  /* ---------------- effects ---------------- */
  let shake = 0;
  function floatText(lane, text, color) { fx.push({ type: 'float', lane, text, color: color || '#E2A200', t: 0, life: 1.1, dx: (Math.random() - 0.5) * 20 }); }
  function hearts(lane, n) { for (let i = 0; i < n; i++) fx.push({ type: 'heart', lane, t: 0, life: 1 + Math.random() * 0.6, dx: (Math.random() - 0.5) * 40, delay: i * 0.08 }); }
  function burst(x, y, n) {
    const cols = ['#FFD23A', '#EF5F6B', '#5CC593', '#7DD0F2', '#A193F6'];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 150 + Math.random() * 380; fx.push({ type: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, c: cols[i % 5], t: 0, life: 1.4 + Math.random(), r: 4 + Math.random() * 5, rot: Math.random() * 6 }); }
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    if (!race) return;
    if (race.phase === 'lobby' && Date.now() >= race.lobbyEnds) startRacing();
    if (race.phase === 'race' && !race.paused && Date.now() >= race.endsAt) finish(null);
    for (const code of race.lineup) {
      const target = race.pts[code] || 0;
      const before = race.disp[code] || 0;
      race.disp[code] = before + (target - before) * Math.min(1, dt * 2.5);
      const v = (race.disp[code] - before) / Math.max(dt, 1e-3);
      race.speed[code] = race.speed[code] * 0.9 + v * 0.1;
      race.scroll[code] = (race.scroll[code] + (40 + race.speed[code] * 2) * dt) % 60;
    }
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].life + (fx[i].delay || 0)) fx.splice(i, 1); }
    shake = Math.max(0, shake - dt);
  }
  function tick() {
    const now = performance.now();
    let el = Math.min(5, (now - clock) / 1000); clock = now;
    while (el > 0) { const d = Math.min(0.05, el); update(d); el -= d; }
  }
  function frame(ts) {
    if (!active) return;
    tick();
    const cap = cfg().saver ? 30 : 0;
    if (!cap || ts - lastDraw >= 1000 / cap - 2) { lastDraw = ts; draw(); }
    if (race) { const tm = $('rcTimer'); const txt = timerText(); if (tm && tm.textContent !== txt) { tm.textContent = txt; renderHud(); } }
    requestAnimationFrame(frame);
  }
  setInterval(() => { if (active && performance.now() - clock > 300) tick(); }, 250);

  /* ---------------- drawing ---------------- */
  function yOf(pts) { const tr = track(); return tr.bottom - Math.min(1, pts / (race ? race.goal : 1)) * (tr.bottom - tr.top); }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
    ctx.fillStyle = '#F5F1E7'; ctx.fillRect(-20, -20, W + 40, H + 40);
    if (!race) return;
    const tr = track(), lw = (tr.x1 - tr.x0) / LANES;
    // road
    ctx.fillStyle = '#E3DCCF';
    roundRect(tr.x0 - 6, tr.top - 40, tr.x1 - tr.x0 + 12, tr.bottom - tr.top + 110, 18); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    // turbo zone
    const tz = yOf(race.goal * 0.8);
    ctx.fillStyle = 'rgba(255,170,60,0.18)'; ctx.fillRect(tr.x0, tr.top, tr.x1 - tr.x0, tz - tr.top);
    ctx.save(); ctx.font = '900 15px Cairo, sans-serif'; ctx.fillStyle = 'rgba(226,120,20,0.85)'; ctx.textAlign = 'center';
    ctx.fillText('TURBO ×2', W / 2, tz - 8); ctx.restore();
    // lanes: alternate shade + scrolling dashes
    race.lineup.forEach((code, i) => {
      const x = tr.x0 + lw * i;
      if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x, tr.top, lw, tr.bottom - tr.top + 60); }
      if (i > 0) {
        ctx.strokeStyle = 'rgba(46,42,48,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([18, 22]);
        ctx.lineDashOffset = -race.scroll[code];
        ctx.beginPath(); ctx.moveTo(x, tr.top); ctx.lineTo(x, tr.bottom + 60); ctx.stroke(); ctx.setLineDash([]);
      }
    });
    // finish line (checkered)
    const sq = 12;
    for (let x = tr.x0, i = 0; x < tr.x1; x += sq, i++) for (let r = 0; r < 2; r++) {
      ctx.fillStyle = (i + r) % 2 ? INK : '#fff'; ctx.fillRect(x, tr.top - sq * 2 + r * sq, Math.min(sq, tr.x1 - x), sq);
    }
    // start line
    ctx.fillStyle = '#fff'; ctx.fillRect(tr.x0, tr.bottom + 46, tr.x1 - tr.x0, 6);
    // lane labels (flag + name) under the start
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    race.lineup.forEach((code, i) => {
      const x = laneX(i);
      K().drawFlag(ctx, code, x - 22, tr.bottom + 62, 44, 30);
      ctx.font = '900 14px Cairo, sans-serif'; ctx.fillStyle = INK;
      ctx.fillText(K().BY[code].ar, x, tr.bottom + 96);
    });
    // effects behind cars
    fx.forEach(f => { if (f.type === 'nitro') drawNitro(f); });
    // cars
    const order = race.lineup.slice().sort((a, b) => race.pts[b] - race.pts[a]);
    race.lineup.forEach((code, i) => drawCar(code, laneX(i), yOf(race.disp[code]) + 40, order.indexOf(code), lw));
    fx.forEach(f => { if (f.type !== 'nitro') drawFx(f); });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function getImg(url) {
    if (!url || !/^https:\/\//.test(url)) return null;
    let im = imgCache.get(url);
    if (!im) { im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = url; imgCache.set(url, im); if (imgCache.size > 300) imgCache.delete(imgCache.keys().next().value); }
    return im.complete && im.naturalWidth ? im : null;
  }
  function mvpOf(code) {
    let best = null, bv = 0; const s = S();
    for (const id in race.supp) { const p = s.participants[id]; if (p && p.team === code && race.supp[id] > bv) { bv = race.supp[id]; best = p; } }
    return best;
  }

  function drawCar(code, x, y, rank, lw) {
    const c = K().BY[code];
    const w = Math.min(50, lw * 0.62), h = w * 1.55;
    ctx.save(); ctx.translate(x, y);
    const wob = race.phase === 'race' ? Math.sin(performance.now() / 90 + x) * Math.min(1.5, race.speed[code] / 40) : 0;
    ctx.translate(wob, 0);
    // shadow
    ctx.fillStyle = 'rgba(46,42,48,0.18)'; roundRect(-w / 2 + 3, -h / 2 + 6, w, h, 12); ctx.fill();
    // wheels
    ctx.fillStyle = INK;
    [[-1, -0.3], [1, -0.3], [-1, 0.3], [1, 0.3]].forEach(([sx, sy]) => { roundRect(sx * (w / 2) - 5, sy * h - 9, 10, 18, 4); ctx.fill(); });
    // body
    roundRect(-w / 2, -h / 2, w, h, 13); ctx.fillStyle = c.car; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // windscreen + rear window
    ctx.fillStyle = '#BFE6F7';
    roundRect(-w * 0.34, -h * 0.36, w * 0.68, h * 0.17, 5); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    roundRect(-w * 0.3, h * 0.26, w * 0.6, h * 0.11, 4); ctx.fill(); ctx.stroke();
    // flag on the roof
    K().drawFlag(ctx, code, -w * 0.36, -h * 0.13, w * 0.72, w * 0.48);
    // headlights
    ctx.fillStyle = '#FFF3A6'; [-1, 1].forEach(sx => { ctx.beginPath(); ctx.arc(sx * w * 0.3, -h / 2 + 4, 3.5, 0, 7); ctx.fill(); });
    ctx.restore();
    // rank medal + points
    const pts = Math.round(race.pts[code] || 0);
    ctx.save();
    ctx.font = '900 13px Cairo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = pts >= 1000 ? (pts / 1000).toFixed(1) + 'k' : String(pts);
    const tw = ctx.measureText(label).width + 12;
    roundRect(x - tw / 2, y + h / 2 + 4, tw, 18, 9); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK; ctx.fillText(label, x, y + h / 2 + 13.5);
    if (pts > 0 && rank < 3) {
      ctx.beginPath(); ctx.arc(x + w / 2 + 2, y - h / 2 + 2, 10, 0, 7);
      ctx.fillStyle = ['#FFD23A', '#D9DEE6', '#E3A26B'][rank]; ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(String(rank + 1), x + w / 2 + 2, y - h / 2 + 3);
    }
    // MVP avatar with crown above the car
    const mvp = race.phase !== 'lobby' ? mvpOf(code) : null;
    if (mvp) {
      const ay = y - h / 2 - 26, r = 15;
      ctx.beginPath(); ctx.arc(x, ay, r, 0, 7); ctx.fillStyle = '#A193F6'; ctx.fill();
      const im = getImg(mvp.a);
      if (im) { ctx.save(); ctx.beginPath(); ctx.arc(x, ay, r, 0, 7); ctx.clip(); ctx.drawImage(im, x - r, ay - r, r * 2, r * 2); ctx.restore(); }
      else { ctx.fillStyle = '#fff'; ctx.font = '900 14px Cairo, sans-serif'; ctx.fillText((mvp.n || '?').charAt(0).toUpperCase(), x, ay + 1); }
      ctx.beginPath(); ctx.arc(x, ay, r, 0, 7); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      // crown
      ctx.beginPath(); ctx.moveTo(x - 10, ay - r + 1); ctx.lineTo(x - 11, ay - r - 9); ctx.lineTo(x - 5, ay - r - 4); ctx.lineTo(x, ay - r - 11); ctx.lineTo(x + 5, ay - r - 4); ctx.lineTo(x + 11, ay - r - 9); ctx.lineTo(x + 10, ay - r + 1); ctx.closePath();
      ctx.fillStyle = '#FFD23A'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  function drawNitro(f) {
    const code = race.lineup[f.lane]; if (!code) return;
    const x = laneX(f.lane), lw = (track().x1 - track().x0) / LANES;
    const w = Math.min(50, lw * 0.62), h = w * 1.55;
    const y = yOf(race.disp[code]) + 40 + h / 2;
    const a = 1 - f.t / f.life;
    const len = (f.tier >= 3 ? 70 : 42) * (0.8 + Math.random() * 0.4) * a;
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    [[-w * 0.22, 1], [w * 0.22, 1]].forEach(([dx]) => {
      ctx.beginPath(); ctx.moveTo(x + dx - 7, y); ctx.lineTo(x + dx, y + len); ctx.lineTo(x + dx + 7, y); ctx.closePath();
      ctx.fillStyle = f.tier >= 3 ? '#7DD0F2' : '#F29B4B'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + dx - 4, y); ctx.lineTo(x + dx, y + len * 0.6); ctx.lineTo(x + dx + 4, y); ctx.closePath();
      ctx.fillStyle = '#FFE27A'; ctx.fill();
    });
    ctx.restore();
  }

  function drawFx(f) {
    const tt = f.t - (f.delay || 0); if (tt < 0) return;
    const a = Math.max(0, 1 - tt / f.life);
    ctx.save(); ctx.globalAlpha = a;
    if (f.type === 'float' || f.type === 'heart') {
      const code = race.lineup[f.lane]; if (!code) { ctx.restore(); return; }
      const x = laneX(f.lane) + f.dx, y = yOf(race.disp[code]) - 10 - tt * 70;
      if (f.type === 'float') {
        ctx.font = '900 20px Cairo, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
        ctx.strokeText(f.text, x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
      } else {
        ctx.translate(x, y + 40); ctx.scale(0.9, 0.9);
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-12, -4, -6, -14, 0, -6); ctx.bezierCurveTo(6, -14, 12, -4, 0, 6);
        ctx.fillStyle = '#FE2C55'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
      }
    } else if (f.type === 'conf') {
      const x = f.x + f.vx * tt, y = f.y + f.vy * tt + 420 * tt * tt;
      ctx.translate(x, y); ctx.rotate(f.rot + tt * 8); ctx.fillStyle = f.c; ctx.fillRect(-f.r, -f.r / 2, f.r * 2, f.r);
    }
    ctx.restore();
  }

  /* ---------------- rehearsal (simulation) ---------------- */
  let simIv = null;
  function simStart(n) {
    const names = ['Yassine', 'Salma', 'Hamza', 'Khadija', 'Amine', 'Imane', 'Othmane', 'Ayoub', 'Meryem', 'Youssef', 'Hiba', 'Mehdi', 'Sara', 'Anas', 'Nada',
      'Zakaria', 'Ikram', 'Reda', 'Chaimae', 'Ilyas', 'Houda', 'Karim', 'Amina', 'Walid', 'Rania', 'Omar', 'Layla', 'Tarek', 'Nour', 'Fares'];
    const pool = []; K().LIST.forEach(c => { for (let i = 0; i < c.w; i++) pool.push(c); });
    const people = Array.from({ length: Math.max(5, n | 0) }, (_, i) => {
      const c = pool[(Math.random() * pool.length) | 0];
      return { u: 'sim_' + i, n: names[i % names.length] + (i >= names.length ? '_' + i : ''), a: '', country: c, joined: false, gifter: Math.random() < 0.15 };
    });
    const GIFTS = [['Rose', 1], ['TikTok', 1], ['GG', 1], ['Ice Cream', 1], ['Heart Me', 5], ['Finger Heart', 5], ['Doughnut', 30], ['Hat & Mustache', 99], ['Perfume', 20], ['Galaxy', 1000], ['Lion', 29999]];
    simStop();
    simIv = setInterval(() => {
      api.viewers(people.length + ((Math.random() * 6) | 0));
      for (const p of people) {
        if (!p.joined && Math.random() < 0.04) { p.joined = true; api.feed({ t: 'chat', u: p.u, n: p.n, a: '', c: ['', 'يا ', 'والله '][(Math.random() * 3) | 0] + p.country.al[(Math.random() * Math.min(3, p.country.al.length)) | 0] + ' 🔥' }); }
        if (p.joined && race && race.phase === 'race' && Math.random() < 0.05) api.feed({ t: 'like', u: p.u, n: p.n, a: '', count: 1 + ((Math.random() * 15) | 0) });
        if (p.joined && p.gifter && race && race.phase === 'race' && Math.random() < 0.006) {
          const r = Math.random(); const g = r < 0.6 ? GIFTS[(Math.random() * 4) | 0] : r < 0.85 ? GIFTS[4 + ((Math.random() * 3) | 0)] : r < 0.98 ? GIFTS[7 + ((Math.random() * 2) | 0)] : GIFTS[9];
          api.feed({ t: 'gift', u: p.u, n: p.n, a: '', gname: g[0], coins: g[1], count: g[1] < 5 ? 1 + ((Math.random() * 10) | 0) : 1, gimg: '' });
        }
        if (p.joined && Math.random() < 0.0015) api.feed({ t: 'follow', u: p.u, n: p.n, a: '' });
      }
    }, 300);
  }
  function simStop() { clearInterval(simIv); simIv = null; }

  /* ---------------- public API ---------------- */
  G.Race = {
    init(a) {
      api = a;
      cv = $('raceCanvas'); ctx = cv.getContext('2d');
      resize(); window.addEventListener('resize', () => { if (active) resize(); });
    },
    setActive(v) {
      active = !!v;
      cv.classList.toggle('on', active);
      if (active) { resize(); clock = performance.now(); requestAnimationFrame(frame); }
    },
    get race() { return race; },
    newRace, startRacing, finishNow() { if (race && race.phase === 'lobby') startRacing(); finish(null); },
    pause(v) {
      if (!race || race.phase !== 'race') return false;
      if (v && !race.paused) { race.paused = true; race.pausedAt = Date.now(); }
      else if (!v && race.paused) { race.endsAt += Date.now() - race.pausedAt; race.paused = false; }
      renderHud(); return race.paused;
    },
    get paused() { return !!(race && race.paused); },
    onChat, onGift, onLike, onSocial,
    showResult, showStandings, hideBoard,
    simStart, simStop,
    stats() {
      const s = S();
      return [['اللايكات', s.likes || 0], ['الكادوات', s.gifts || 0], ['الكوينز', s.coins || 0], ['فولو / شير', (s.follows || 0) + ' / ' + (s.shares || 0)],
        ['السباقات', rstate().races], ['اللي فالمقدمة', race && race.lineup.length ? K().BY[race.lineup.slice().sort((a, b) => race.pts[b] - race.pts[a])[0]].ar : '—']];
    },
    _debug: () => ({ race, fx: fx.length })
  };
})(window);
