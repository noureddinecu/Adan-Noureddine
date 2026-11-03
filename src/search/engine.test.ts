import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIndex, highlight, search } from './engine';
import { normalize } from './normalize';
import type { Dataset } from '../data/types';

const ds = JSON.parse(readFileSync(new URL('../../public/data/violations.json', import.meta.url), 'utf8')) as Dataset;
const idx = buildIndex(ds);
const codes = (q: string, n = 10) => search(idx, q).slice(0, n).map((h) => h.violation.code);

describe('normalize', () => {
  it('unifies alef forms, taa marbuta, tashkeel, digits', () => {
    expect(normalize('إِنْارَة')).toBe(normalize('انارة'));
    expect(normalize('أ إ آ ا')).toBe('ا ا ا ا');
    expect(normalize('١٨٤')).toBe('184');
    expect(normalize('Éthylomètre')).toBe('ethylometre');
  });
});

describe('search', () => {
  it('finds a violation by its exact code first', () => {
    expect(codes('184041C1')[0]).toBe('184041C1');
    expect(codes('184041c1')[0]).toBe('184041C1');
  });
  it('finds by partial code', () => {
    expect(codes('18404')).toContain('184041C1');
    expect(codes('18404')).toContain('184042C1');
  });
  it('finds by secondary (AD) code', () => {
    expect(codes('096061AD', 50)).toContain('184221C1');
  });
  it('word «الوقوف» returns stopping/parking violations', () => {
    const r = search(idx, 'الوقوف');
    expect(r.length).toBeGreaterThan(5);
    expect(r.map((h) => h.violation.code)).toEqual(expect.arrayContaining(['184041C1', '185101C2', '185381C2', '186021C3']));
  });
  it('«ممنوع الوقوف والتوقف» returns parking/stopping violations', () => {
    const r = search(idx, 'ممنوع الوقوف والتوقف').map((h) => h.violation.code);
    expect(r.length).toBeGreaterThan(0);
    expect(r).toEqual(expect.arrayContaining(['185381C2', '186021C3']));
  });
  it('«المادة 184» filters on the legal reference', () => {
    const r = search(idx, 'المادة 184');
    expect(r.length).toBeGreaterThan(30);
    for (const h of r) expect(h.violation.articles).toContain('184');
  });
  it('«المادة 185(36)» targets the seat-belt rows', () => {
    expect(codes('المادة 185(36)').sort()).toEqual(['185361C2', '185362C2']);
  });
  it('ignores hamza differences and tashkeel', () => {
    expect(codes('اجهزة الانارة')).toEqual(expect.arrayContaining(['184121C1']));
    expect(codes('أجْهِزَة الإنارة')).toEqual(expect.arrayContaining(['184121C1']));
  });
  it('tolerates small typos', () => {
    expect(codes('حزام السلامه')).toEqual(expect.arrayContaining(['185361C2']));
    expect(codes('الهاتق')).toContain('185041C2'); // ف → ق
    expect(codes('السرغة', 30)).toContain('184011C1');
  });
  it('supports partial words', () => {
    expect(codes('خوذ')).toContain('186071C3');
  });
  it('supports French terms', () => {
    expect(codes('ceinture')).toEqual(expect.arrayContaining(['185361C2']));
    expect(codes('téléphone')).toContain('185041C2');
    expect(codes('alcootest'.replace('alcootest', 'éthylotest'))).toContain('183011DL');
    expect(codes('assurance', 20)).toEqual(expect.arrayContaining(['001001DL']));
  });
  it('searches procedures', () => {
    expect(search(idx, 'جذاذة التوقيف').length).toBeGreaterThan(0);
  });
  it('highlights matched words', () => {
    const h = search(idx, 'الوقوف')[0];
    const segs = highlight(h.violation.description, h.terms);
    expect(segs.some((s) => s.hit)).toBe(true);
  });
  it('is fast', () => {
    const t = performance.now();
    for (const q of ['الوقوف', 'حزام', 'المادة 184', 'السرعة القصوى', '1840', 'ceinture']) search(idx, q);
    expect(performance.now() - t).toBeLessThan(400);
  });
});
