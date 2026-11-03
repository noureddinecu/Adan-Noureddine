import type { Violation } from './types';

export interface LawIndex { schema: number; title: string; pdf: string; pages: Record<string, number> }

const FALLBACK: LawIndex = { schema: 1, title: 'مدونة السير على الطرق', pdf: 'https://www.sgg.gov.ma/Portals/1/textesconsolides/52_05.pdf', pages: {} };

export async function loadLawIndex(): Promise<LawIndex> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/law-index.json`, { cache: 'no-cache' });
    const j = (await r.json()) as LawIndex;
    return j && j.pdf ? { ...FALLBACK, ...j, pages: j.pages ?? {} } : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Article numbers of the road code (مدونة السير) cited by a violation, in citation order. */
export function codeArticles(v: Violation): string[] {
  const out: string[] = [];
  for (const line of v.legalRefs) {
    if (!line.includes('مدونة السير')) continue;
    const t = line.replace(/\d+[-.]\d+[-.]\d+/g, ' ').replace(/\bالفقرة\s*\d+/g, ' ').replace(/فق\s*\d+/g, ' ');
    for (const m of t.matchAll(/(\d{1,3})(?:\s*[-‐]\s*1)?/g)) {
      const n = String(+m[1]);
      // sub-paragraph numbers like (04) are inside parentheses: skip them
      const before = t.slice(0, m.index).trimEnd();
      if (before.endsWith('(')) continue;
      if (+n > 0 && +n <= 320 && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** Deep link: exact page when known; otherwise PDF viewers' text search fragment. */
export function articleUrl(idx: LawIndex, article: string): { url: string; page: number | null } {
  const page = idx.pages[article] ?? null;
  const frag = page ? `#page=${page}` : `#search=${encodeURIComponent(`"المادة ${article}"`)}`;
  return { url: idx.pdf + frag, page };
}
