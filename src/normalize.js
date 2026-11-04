// تطبيع النصوص ومطابقة الإجابات (عربي / فرنسي / إنجليزي)
// Text normalization and answer matching for Arabic, French and English comments.

// Arabic diacritics (tashkeel), Quranic marks and tatweel.
const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const LATIN_MARKS = /[̀-ͯ]/g;

function toAsciiDigits(s) {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Basic normalization: lowercase, strip accents/diacritics, unify Arabic letter
 * variants (أ إ آ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي), convert digits, drop
 * punctuation and emojis, collapse whitespace.
 */
export function normalize(input) {
  if (input == null) return '';
  let s = String(input).normalize('NFKD'); // splits hamza / accents into combining marks
  s = s.replace(LATIN_MARKS, '').replace(AR_MARKS, '');
  s = toAsciiDigits(s).toLowerCase();
  s = s.replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ء/g, '');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const LATIN_ARTICLES = new Set(['the', 'le', 'la', 'les', 'l', 'el', 'al', 'de', 'du', 'des', 'of', 'a', 'an', 'un', 'une']);

/** Words without articles: "المغرب" → "مغرب", "le Maroc" → "maroc". */
export function looseTokens(input) {
  return normalize(input)
    .split(' ')
    .filter((w) => w && !LATIN_ARTICLES.has(w))
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w));
}

/** Compact key used for comparison: no articles, no spaces. */
export function compactKey(input) {
  return looseTokens(input).join('');
}

export function levenshtein(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed typo distance for an answer key: none for short or numeric answers. */
export function tolerance(key) {
  if (/\d/.test(key)) return 0;
  if (key.length <= 3) return 0;
  if (key.length <= 6) return 1;
  return 2;
}

/**
 * Does a free-text comment match one of the accepted answers?
 * Accepts small typos and short extra words ("الجواب الرباط 🔥"),
 * but not long comments that merely contain the answer.
 */
export function matchesAnswer(comment, accepted) {
  const cKey = compactKey(comment);
  if (!cKey) return false;
  const cTokens = looseTokens(comment);
  for (const ans of accepted) {
    const aKey = compactKey(ans);
    if (!aKey) continue;
    if (cKey === aKey) return true;
    const tol = tolerance(aKey);
    if (tol > 0 && levenshtein(cKey, aKey, tol) <= tol) return true;
    // Answer contained as a whole-word sequence inside a short comment.
    const aTokens = looseTokens(ans);
    if (aKey.length >= 3 && cTokens.length > aTokens.length && cTokens.length <= aTokens.length + 2) {
      const hay = ` ${cTokens.join(' ')} `;
      if (hay.includes(` ${aTokens.join(' ')} `)) return true;
    }
  }
  return false;
}

const LETTER_INDEX = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3, ا: 0, ب: 1, ج: 2, د: 3 };

/**
 * Parse a multiple-choice comment. Accepts a letter (A-D / أ ب ج د), a digit (1-4)
 * or the text of a choice in any language. Returns the choice index or -1.
 * `choices` is an array of {ar, fr, en} objects (in display order).
 */
export function parseChoice(comment, choices) {
  const n = normalize(comment);
  if (!n) return -1;
  if (n in LETTER_INDEX && LETTER_INDEX[n] < choices.length) return LETTER_INDEX[n];
  const hits = [];
  choices.forEach((ch, i) => {
    const variants = Object.values(ch || {}).filter(Boolean);
    const exact = variants.some((v) => compactKey(v) === compactKey(comment));
    if (exact || matchesAnswer(comment, variants)) hits.push({ i, exact });
  });
  if (hits.length === 1) return hits[0].i;
  const exactHits = hits.filter((h) => h.exact);
  return exactHits.length === 1 ? exactHits[0].i : -1;
}
