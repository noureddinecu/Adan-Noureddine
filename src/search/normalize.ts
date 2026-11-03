// Arabic / French text normalization used by both the index and the queries.

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // harakat, shadda, tatweel…
const AR_DIGITS = /[٠-٩۰-۹]/g;

export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // French accents (é → e)
    .normalize('NFC')
    .replace(TASHKEEL, '')
    .replace(AR_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10))
    .replace(/[آأإٱٲٳ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي') // ئ → ي
    .replace(/ک/g, 'ك') // ک → ك
    .replace(/[یے]/g, 'ي') // ی ے → ي
    .replace(/گ/g, 'ك') // گ (Moroccan) → ك
    .toLowerCase();
}

/** Splits normalized text into word tokens (letters/digits). */
export function tokenize(normalized: string): string[] {
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

const PREFIXES = ['وبال', 'وال', 'بال', 'كال', 'فال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف'];
const SUFFIXES = ['ات', 'ان', 'ين', 'ون', 'ها', 'هم', 'ه', 'ي'];

/** Light Arabic stemming: variants without common clitic prefixes / plural suffixes. */
export function variants(tok: string): string[] {
  const out = new Set([tok]);
  if (/^[؀-ۿ]+$/.test(tok)) {
    for (const p of PREFIXES) {
      if (tok.startsWith(p) && tok.length - p.length >= 3) out.add(tok.slice(p.length));
    }
    for (const v of [...out]) {
      for (const s of SUFFIXES) if (v.endsWith(s) && v.length - s.length >= 3) out.add(v.slice(0, -s.length));
    }
  }
  return [...out];
}

export const STOP_WORDS = new Set(
  ['من', 'في', 'على', 'او', 'و', 'عن', 'الى', 'مع', 'ب', 'ل', 'ما', 'ذلك', 'التي', 'الذي', 'هذا', 'هذه', 'كل', 'ان', 'لا', 'غير', 'دون',
   'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en', 'sur', 'par', 'pour', 'sans', 'd', 'l'].map(normalize),
);

export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
