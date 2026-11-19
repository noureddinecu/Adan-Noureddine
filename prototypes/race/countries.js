/* =========================================================================
 * رالي العرب — the 22 Arab League countries: names, aliases, colours, flags
 * Flags are drawn with Canvas (simplified) so they look the same on every phone.
 * ========================================================================= */
(function (G) {
  'use strict';

  // aliases are matched after normalisation (see norm()): no diacritics, أإآ→ا, ة→ه, ى→ي, lower-case
  const C = [
    { code: 'MA', ar: 'المغرب', car: '#C1272D', w: 8, al: ['المغرب', 'مغرب', 'لمغريب', 'المغريب', 'مغريب', 'المملكه المغربيه', 'maroc', 'morocco', 'marocco', 'maghrib', 'lmaghrib', 'maroco'] },
    { code: 'DZ', ar: 'الجزائر', car: '#006233', w: 7, al: ['الجزائر', 'جزائر', 'دزاير', 'الدزاير', 'لدزاير', 'دزائر', 'algerie', 'algeria', 'dz', 'djazair', 'dzayer'] },
    { code: 'TN', ar: 'تونس', car: '#E70013', w: 4, al: ['تونس', 'تونيس', 'tunisie', 'tunisia', 'tounes', 'tunis'] },
    { code: 'LY', ar: 'ليبيا', car: '#239E46', w: 3, al: ['ليبيا', 'libya', 'libye', 'libia'] },
    { code: 'EG', ar: 'مصر', car: '#B8860B', w: 6, al: ['مصر', 'egypt', 'egypte', 'masr', 'misr'] },
    { code: 'SD', ar: 'السودان', car: '#007229', w: 2, al: ['السودان', 'سودان', 'sudan', 'soudan'] },
    { code: 'MR', ar: 'موريتانيا', car: '#00A95C', w: 2, al: ['موريتانيا', 'موريطانيا', 'موريتانية', 'mauritanie', 'mauritania'] },
    { code: 'SA', ar: 'السعودية', car: '#165D31', w: 4, al: ['السعوديه', 'سعوديه', 'المملكه العربيه السعوديه', 'saudi', 'ksa', 'saudia', 'arabie saoudite'] },
    { code: 'AE', ar: 'الإمارات', car: '#00732F', w: 2, al: ['الامارات', 'امارات', 'uae', 'emirates', 'دبي', 'dubai'] },
    { code: 'QA', ar: 'قطر', car: '#8A1538', w: 2, al: ['قطر', 'qatar'] },
    { code: 'KW', ar: 'الكويت', car: '#007A3D', w: 2, al: ['الكويت', 'كويت', 'kuwait', 'koweit'] },
    { code: 'BH', ar: 'البحرين', car: '#CE1126', w: 1, al: ['البحرين', 'بحرين', 'bahrain', 'bahrein'] },
    { code: 'OM', ar: 'عُمان', car: '#DB161B', w: 1, al: ['عمان', 'سلطنه عمان', 'oman'] },
    { code: 'YE', ar: 'اليمن', car: '#A50F1E', w: 2, al: ['اليمن', 'يمن', 'yemen', 'yemenite'] },
    { code: 'IQ', ar: 'العراق', car: '#2E2A30', w: 3, al: ['العراق', 'عراق', 'iraq', 'irak'] },
    { code: 'SY', ar: 'سوريا', car: '#007A3D', w: 2, al: ['سوريا', 'سوريه', 'syria', 'syrie'] },
    { code: 'JO', ar: 'الأردن', car: '#1F1F1F', w: 2, al: ['الاردن', 'اردن', 'jordan', 'jordanie'] },
    { code: 'LB', ar: 'لبنان', car: '#ED1C24', w: 2, al: ['لبنان', 'lebanon', 'liban'] },
    { code: 'PS', ar: 'فلسطين', car: '#009736', w: 3, al: ['فلسطين', 'palestine', 'falestine', 'filistin', 'palestina'] },
    { code: 'SO', ar: 'الصومال', car: '#4189DD', w: 1, al: ['الصومال', 'صومال', 'somalia', 'somalie'] },
    { code: 'DJ', ar: 'جيبوتي', car: '#6AB2E7', w: 1, al: ['جيبوتي', 'djibouti'] },
    { code: 'KM', ar: 'جزر القمر', car: '#3A75C4', w: 1, al: ['جزر القمر', 'comores', 'comoros'] }
  ];
  const BY = {};
  C.forEach(c => { BY[c.code] = c; });

  /* ---------------- text matching ---------------- */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')        // harakat + tatweel
      .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  // pre-normalised alias table, longest first so "جزر القمر" beats shorter words
  const ALIASES = [];
  C.forEach(c => c.al.forEach(a => ALIASES.push({ code: c.code, a: norm(a) })));
  ALIASES.sort((x, y) => y.a.length - x.a.length);

  function flagEmojiCode(text) {
    const m = String(text || '').match(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u);
    if (!m) return null;
    const code = String.fromCharCode(m[1].codePointAt(0) - 0x1F1E6 + 65, m[2].codePointAt(0) - 0x1F1E6 + 65);
    return BY[code] ? code : null;
  }

  /** Returns the country code mentioned in a comment, or null. Accepts و/ل/ب/يا prefixes ("والمغرب", "يا مصر"). */
  function detect(text) {
    const e = flagEmojiCode(text);
    if (e) return e;
    const n = ' ' + norm(text) + ' ';
    if (n.length < 3) return null;
    const tokens = n.trim().split(' ');
    const stripped = ' ' + tokens.map(t => t.replace(/^(و|ل|ب|ف)(?=ال)/, '').replace(/^(وال|لل)/, 'ال')).join(' ') + ' ';
    for (const { code, a } of ALIASES) {
      if (n.includes(' ' + a + ' ') || stripped.includes(' ' + a + ' ')) return code;
    }
    return null;
  }

  /* ---------------- flags (simplified, canvas) ---------------- */
  function star(ctx, cx, cy, r, points, inner) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 ? r * (inner || 0.42) : r;
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function crescent(ctx, cx, cy, r, color, offx, ir, dir) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.rect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
    if (dir === 'up') ctx.arc(cx, cy - offx, ir, 0, Math.PI * 2); else ctx.arc(cx + offx, cy, ir, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill('evenodd');
    ctx.restore();
  }
  function hs(ctx, x, y, w, h, cols, weights) {
    const tot = (weights || cols.map(() => 1)).reduce((a, b) => a + b, 0);
    let yy = y;
    cols.forEach((c, i) => { const hh = h * ((weights ? weights[i] : 1) / tot); ctx.fillStyle = c; ctx.fillRect(x, yy, w, hh + 0.5); yy += hh; });
  }
  function tri(ctx, x, y, w, h, depth, color) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * depth, y + h / 2); ctx.lineTo(x, y + h); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  function serrated(ctx, x, y, w, h, frac, n, color) {
    const bx = x + w * frac, tip = w * 0.09;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, y);
    for (let i = 0; i < n; i++) {
      const y0 = y + (h * i) / n;
      ctx.lineTo(bx + tip, y0 + h / n / 2); ctx.lineTo(bx, y0 + h / n);
    }
    ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function squiggle(ctx, x, y, w, color, lw) {
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 1; i <= 8; i++) ctx.quadraticCurveTo(x + (w * (i - 0.5)) / 8, y + (i % 2 ? -lw * 1.6 : lw * 1.6), x + (w * i) / 8, y);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }

  const FLAGS = {
    MA(c, x, y, w, h) { c.fillStyle = '#C1272D'; c.fillRect(x, y, w, h); star(c, x + w / 2, y + h * 0.53, h * 0.3, 5, 0.38); c.strokeStyle = '#006233'; c.lineWidth = Math.max(1.2, h * 0.07); c.lineJoin = 'miter'; c.stroke(); },
    DZ(c, x, y, w, h) { c.fillStyle = '#006233'; c.fillRect(x, y, w / 2, h); c.fillStyle = '#fff'; c.fillRect(x + w / 2, y, w / 2, h); crescent(c, x + w / 2, y + h / 2, h * 0.33, '#D21034', h * 0.09, h * 0.27); star(c, x + w * 0.57, y + h / 2, h * 0.13, 5); c.fillStyle = '#D21034'; c.fill(); },
    TN(c, x, y, w, h) { c.fillStyle = '#E70013'; c.fillRect(x, y, w, h); c.beginPath(); c.arc(x + w / 2, y + h / 2, h * 0.3, 0, 7); c.fillStyle = '#fff'; c.fill(); crescent(c, x + w / 2, y + h / 2, h * 0.24, '#E70013', h * 0.06, h * 0.19); star(c, x + w * 0.53, y + h / 2, h * 0.1, 5); c.fillStyle = '#E70013'; c.fill(); },
    LY(c, x, y, w, h) { hs(c, x, y, w, h, ['#E70013', '#000', '#239E46'], [1, 2, 1]); crescent(c, x + w * 0.48, y + h / 2, h * 0.17, '#fff', h * 0.05, h * 0.14); star(c, x + w * 0.56, y + h / 2, h * 0.07, 5); c.fillStyle = '#fff'; c.fill(); },
    EG(c, x, y, w, h) { hs(c, x, y, w, h, ['#CE1126', '#fff', '#000']); c.fillStyle = '#C09300'; c.beginPath(); c.moveTo(x + w / 2, y + h * 0.36); c.lineTo(x + w / 2 + h * 0.12, y + h * 0.62); c.lineTo(x + w / 2 - h * 0.12, y + h * 0.62); c.closePath(); c.fill(); },
    SD(c, x, y, w, h) { hs(c, x, y, w, h, ['#D21034', '#fff', '#000']); tri(c, x, y, w, h, 0.36, '#007229'); },
    MR(c, x, y, w, h) { hs(c, x, y, w, h, ['#D01C1F', '#00A95C', '#D01C1F'], [1, 4, 1]); crescent(c, x + w / 2, y + h * 0.55, h * 0.22, '#FFD700', h * 0.08, h * 0.2, 'up'); star(c, x + w / 2, y + h * 0.36, h * 0.09, 5); c.fillStyle = '#FFD700'; c.fill(); },
    SA(c, x, y, w, h) { c.fillStyle = '#165D31'; c.fillRect(x, y, w, h); squiggle(c, x + w * 0.22, y + h * 0.42, w * 0.56, '#fff', Math.max(1, h * 0.07)); c.fillStyle = '#fff'; c.fillRect(x + w * 0.25, y + h * 0.66, w * 0.5, Math.max(1, h * 0.06)); },
    AE(c, x, y, w, h) { hs(c, x, y, w, h, ['#00732F', '#fff', '#000']); c.fillStyle = '#FF0000'; c.fillRect(x, y, w * 0.26, h); },
    QA(c, x, y, w, h) { c.fillStyle = '#8A1538'; c.fillRect(x, y, w, h); serrated(c, x, y, w, h, 0.28, 9, '#fff'); },
    KW(c, x, y, w, h) { hs(c, x, y, w, h, ['#007A3D', '#fff', '#CE1126']); c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.25, y + h / 3); c.lineTo(x + w * 0.25, y + (2 * h) / 3); c.lineTo(x, y + h); c.closePath(); c.fillStyle = '#000'; c.fill(); },
    BH(c, x, y, w, h) { c.fillStyle = '#CE1126'; c.fillRect(x, y, w, h); serrated(c, x, y, w, h, 0.26, 5, '#fff'); },
    OM(c, x, y, w, h) { hs(c, x, y, w, h, ['#fff', '#DB161B', '#008000']); c.fillStyle = '#DB161B'; c.fillRect(x, y, w * 0.28, h); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + w * 0.14, y + h * 0.2, h * 0.09, 0, 7); c.fill(); },
    YE(c, x, y, w, h) { hs(c, x, y, w, h, ['#CE1126', '#fff', '#000']); },
    IQ(c, x, y, w, h) { hs(c, x, y, w, h, ['#CE1126', '#fff', '#000']); squiggle(c, x + w * 0.3, y + h / 2, w * 0.4, '#007A3D', Math.max(1, h * 0.06)); },
    SY(c, x, y, w, h) { hs(c, x, y, w, h, ['#007A3D', '#fff', '#000']); c.fillStyle = '#CE1126'; [0.3, 0.5, 0.7].forEach(f => { star(c, x + w * f, y + h / 2, h * 0.12, 5); c.fill(); }); },
    JO(c, x, y, w, h) { hs(c, x, y, w, h, ['#000', '#fff', '#007A3D']); tri(c, x, y, w, h, 0.5, '#CE1126'); star(c, x + w * 0.17, y + h / 2, h * 0.09, 7, 0.5); c.fillStyle = '#fff'; c.fill(); },
    LB(c, x, y, w, h) { hs(c, x, y, w, h, ['#ED1C24', '#fff', '#ED1C24'], [1, 2, 1]); c.fillStyle = '#00A651'; c.beginPath(); c.moveTo(x + w / 2, y + h * 0.28); c.lineTo(x + w / 2 + h * 0.2, y + h * 0.68); c.lineTo(x + w / 2 - h * 0.2, y + h * 0.68); c.closePath(); c.fill(); },
    PS(c, x, y, w, h) { hs(c, x, y, w, h, ['#000', '#fff', '#009736']); tri(c, x, y, w, h, 0.36, '#EE2A35'); },
    SO(c, x, y, w, h) { c.fillStyle = '#4189DD'; c.fillRect(x, y, w, h); star(c, x + w / 2, y + h * 0.53, h * 0.3, 5, 0.38); c.fillStyle = '#fff'; c.fill(); },
    DJ(c, x, y, w, h) { hs(c, x, y, w, h, ['#6AB2E7', '#12AD2B']); tri(c, x, y, w, h, 0.42, '#fff'); star(c, x + w * 0.13, y + h / 2, h * 0.12, 5); c.fillStyle = '#D7141A'; c.fill(); },
    KM(c, x, y, w, h) { hs(c, x, y, w, h, ['#FFC61E', '#fff', '#CE1126', '#3A75C4']); tri(c, x, y, w, h, 0.42, '#3D8E33'); crescent(c, x + w * 0.13, y + h / 2, h * 0.2, '#fff', h * 0.07, h * 0.17); }
  };

  /** Draws a flag with a dark outline and rounded corners. */
  function drawFlag(ctx, code, x, y, w, h, outline) {
    const f = FLAGS[code];
    ctx.save();
    const r = Math.min(w, h) * 0.12;
    const edge = () => {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
    edge();
    ctx.save(); ctx.clip();
    if (f) f(ctx, x, y, w, h); else { ctx.fillStyle = '#ccc'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    if (outline !== false) { edge(); ctx.lineWidth = Math.max(1.5, h * 0.08); ctx.strokeStyle = '#2E2A30'; ctx.stroke(); }
    ctx.restore();
  }

  const urlCache = {};
  /** PNG data-URL of a flag (for <img> in the DOM). */
  function flagURL(code) {
    if (urlCache[code]) return urlCache[code];
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 64;
    drawFlag(cv.getContext('2d'), code, 3, 3, 90, 58);
    return (urlCache[code] = cv.toDataURL());
  }

  G.Countries = { LIST: C, BY, detect, norm, drawFlag, flagURL };
})(window);
