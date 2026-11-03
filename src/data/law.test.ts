import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { articleUrl, codeArticles } from './law';
import type { Dataset } from './types';

const ds = JSON.parse(readFileSync(new URL('../../public/data/violations.json', import.meta.url), 'utf8')) as Dataset;
const byCode = (c: string) => ds.violations.find((v) => v.code === c)!;

describe('road-code articles per violation', () => {
  it('extracts code articles only (not decree articles or sub-paragraphs)', () => {
    expect(codeArticles(byCode('184041C1'))).toEqual(['184']);
    expect(codeArticles(byCode('185211C2'))).toEqual(['103', '104', '185']);
    expect(codeArticles(byCode('175011DL'))).toEqual(['175', '216']);
    expect(codeArticles(byCode('184311C1'))).toEqual(['47', '184']);
  });
  it('every violation citing the code gets at least one article', () => {
    const missing = ds.violations.filter((v) => v.legalRefs.some((l) => l.includes('مدونة السير')) && !codeArticles(v).length);
    expect(missing.map((v) => v.code)).toEqual([]);
  });
  it('builds deep links', () => {
    const idx = { schema: 1, title: '', pdf: 'https://x/52_05.pdf', pages: { '219': 88 } };
    expect(articleUrl(idx, '219')).toEqual({ url: 'https://x/52_05.pdf#page=88', page: 88 });
    expect(articleUrl(idx, '184').url).toContain('#search=');
  });
});
