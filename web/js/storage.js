/* عربة الذهب — local save data, scoring, rewards & achievements */
(function (G) {
  'use strict';
  const KEY = 'goldrail.save.v1';

  function fresh() {
    return {
      v: 1,
      levels: {},              // n -> { stars, score }
      unlocked: 1,
      bonus: 0,                // points from chapter rewards & achievements
      hints: 3,                // "gold tracker" power-ups
      chaptersRewarded: {},    // chapterIndex -> true
      achievements: {},        // id -> timestamp
      stats: { wins: 0, losses: 0, streak: 0, bestStreak: 0, perfect: 0, fails: {} },
      settings: { sound: true, vibrate: true, relaxed: false }
    };
  }

  let data = fresh();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        data = Object.assign(fresh(), d);
        data.stats = Object.assign(fresh().stats, d.stats || {});
        data.settings = Object.assign(fresh().settings, d.settings || {});
      }
    } catch (e) { data = fresh(); }
    return data;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage full / blocked */ } }
  function reset() { const s = data.settings; data = fresh(); data.settings = s; save(); }

  const totalStars = () => Object.values(data.levels).reduce((a, l) => a + (l.stars || 0), 0);
  const levelPoints = () => Object.values(data.levels).reduce((a, l) => a + (l.score || 0), 0);
  const totalPoints = () => levelPoints() + data.bonus;

  /* ---------------- achievements ---------------- */
  const ACH = [
    { id: 'first_win',  title: 'أول ذهبة',        desc: 'افز بأول مرحلة',                          reward: 100 },
    { id: 'three_star', title: 'عين الصقر',       desc: 'احصل على 3 نجوم في مرحلة',               reward: 100 },
    { id: 'perfect10',  title: 'دقة متناهية',     desc: '3 نجوم في 10 مراحل',                     reward: 400 },
    { id: 'perfect50',  title: 'أسطورة التتبع',   desc: '3 نجوم في 50 مرحلة',                     reward: 1500 },
    { id: 'streak5',    title: 'سلسلة ذهبية',     desc: 'افز 5 مرات متتالية بدون خسارة',          reward: 300 },
    { id: 'streak15',   title: 'لا يُهزم',         desc: 'افز 15 مرة متتالية بدون خسارة',          reward: 1000 },
    { id: 'quick',      title: 'البرق',           desc: 'أجب خلال أقل من ثانية',                  reward: 200 },
    { id: 'tunnel3',    title: 'خبير الأنفاق',     desc: 'افز بمرحلة فيها 3 أنفاق أو أكثر',        reward: 300 },
    { id: 'decoy',      title: 'لا تخدعني',       desc: 'افز بمرحلة فيها مفاتيح خادعة',           reward: 250 },
    { id: 'double',     title: 'ضعف الكنز',       desc: 'اعثر على الذهبتين معاً',                 reward: 500 },
    { id: 'no_hint',    title: 'بدون مساعدة',     desc: 'أنهِ فصلاً كاملاً بدون استخدام الكاشف',  reward: 400 },
    { id: 'comeback',   title: 'العودة القوية',   desc: 'افز بمرحلة بعد 3 محاولات فاشلة',         reward: 150 },
    { id: 'chapter1',   title: 'المحطة الأولى',   desc: 'أكمل المراحل 1–10',                      reward: 200 },
    { id: 'chapter5',   title: 'منتصف الطريق',    desc: 'أكمل 50 مرحلة',                          reward: 800 },
    { id: 'chapter10',  title: 'سيد السكك',       desc: 'أكمل جميع المراحل المئة',                reward: 3000 },
    { id: 'points5k',   title: 'جامع الذهب',      desc: 'اجمع 5,000 نقطة',                        reward: 250 },
    { id: 'points25k',  title: 'ثري المناجم',     desc: 'اجمع 25,000 نقطة',                       reward: 1000 },
    { id: 'stars150',   title: 'سماء النجوم',     desc: 'اجمع 150 نجمة',                          reward: 800 },
    { id: 'stars300',   title: 'الكمال',          desc: 'اجمع 300 نجمة (كل النجوم)',              reward: 3000 }
  ];

  function unlockAch(id, out) {
    if (data.achievements[id]) return;
    const a = ACH.find(x => x.id === id);
    if (!a) return;
    data.achievements[id] = Date.now();
    data.bonus += a.reward;
    out.push(a);
  }

  /* ---------------- scoring ---------------- */
  function computeStars(r) {
    // r: { firstTry, timeFrac(0..1 used), usedHint }
    let s = 1;
    if (r.firstTry) s = 2;
    if (r.firstTry && r.timeFrac <= 0.5) s = 3;
    if (r.usedHint) s = Math.min(s, 2);
    return s;
  }
  function computeScore(n, stars, timeFrac, golds) {
    const base = 50 + n * 10;
    const timeBonus = Math.round(base * 0.5 * (1 - timeFrac));
    return base * stars + timeBonus + (golds > 1 ? base : 0);
  }

  /**
   * Register a finished attempt. Returns summary used by the result screen.
   */
  function recordResult(level, r) {
    const n = level.n;
    const out = { achievements: [], chapterReward: null, newBest: false, stars: 0, score: 0, unlockedNext: false };
    const s = data.stats;
    if (!r.win) {
      s.losses++; s.streak = 0;
      s.fails[n] = (s.fails[n] || 0) + 1;
      save();
      return out;
    }
    s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
    const stars = computeStars(r);
    const score = computeScore(n, stars, r.timeFrac, level.golds.length);
    out.stars = stars; out.score = score;
    const prev = data.levels[n] || { stars: 0, score: 0 };
    if (stars > prev.stars || score > prev.score) out.newBest = true;
    data.levels[n] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score), hintFree: (prev.hintFree || !r.usedHint) };
    if (stars === 3 && prev.stars < 3) s.perfect++;
    if (n + 1 > data.unlocked && n < G.Levels.LEVEL_COUNT) { data.unlocked = n + 1; out.unlockedNext = true; }

    // chapter reward every 10 levels
    if (n % 10 === 0) {
      const c = n / 10 - 1;
      if (!data.chaptersRewarded[c]) {
        data.chaptersRewarded[c] = true;
        let cStars = 0, hintFree = true;
        for (let i = c * 10 + 1; i <= c * 10 + 10; i++) {
          cStars += (data.levels[i] || {}).stars || 0;
          if (!(data.levels[i] || {}).hintFree) hintFree = false;
        }
        const reward = 250 * (c + 1) + cStars * 20;
        data.bonus += reward;
        data.hints += 2;
        out.chapterReward = { chapter: c, reward, stars: cStars, hints: 2, hintFree };
        if (hintFree) unlockAch('no_hint', out.achievements);
      }
    }

    // achievements
    const A = out.achievements;
    unlockAch('first_win', A);
    if (stars === 3) unlockAch('three_star', A);
    if (s.perfect >= 10) unlockAch('perfect10', A);
    if (s.perfect >= 50) unlockAch('perfect50', A);
    if (s.streak >= 5) unlockAch('streak5', A);
    if (s.streak >= 15) unlockAch('streak15', A);
    if (r.answerSeconds < 1) unlockAch('quick', A);
    if (level.tunnels.length >= 3) unlockAch('tunnel3', A);
    if (level.hasDecoys) unlockAch('decoy', A);
    if (level.golds.length > 1) unlockAch('double', A);
    if ((s.fails[n] || 0) >= 3) unlockAch('comeback', A);
    const done = Object.keys(data.levels).length;
    if (data.levels[10]) unlockAch('chapter1', A);
    if (done >= 50) unlockAch('chapter5', A);
    if (done >= 100) unlockAch('chapter10', A);
    if (totalPoints() >= 5000) unlockAch('points5k', A);
    if (totalPoints() >= 25000) unlockAch('points25k', A);
    if (totalStars() >= 150) unlockAch('stars150', A);
    if (totalStars() >= 300) unlockAch('stars300', A);
    // a 3-star finish on a chapter finale grants a bonus hint
    if (stars === 3 && n % 10 === 0) data.hints++;
    save();
    return out;
  }

  G.Store = {
    load, save, reset, get data() { return data; },
    totalStars, totalPoints, recordResult, computeStars, ACH,
    useHint() { if (data.hints > 0) { data.hints--; save(); return true; } return false; }
  };
})(window);
