import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculate, fineFor, validateFines } from './fines';
import type { Dataset } from './types';

const fines = validateFines(JSON.parse(readFileSync(new URL('../../public/data/fines.json', import.meta.url), 'utf8')));
const ds = JSON.parse(readFileSync(new URL('../../public/data/violations.json', import.meta.url), 'utf8')) as Dataset;
const byCode = (c: string) => ds.violations.find((v) => v.code === c)!;

describe('fines table', () => {
  it('maps degrees to the article 219 amounts', () => {
    expect(fineFor(fines, byCode('184041C1'))!.amounts).toEqual({ h24: 400, d15: 500, base: 700 });
    expect(fineFor(fines, byCode('185041C2'))!.amounts).toEqual({ h24: 300, d15: 350, base: 500 });
    expect(fineFor(fines, byCode('186071C3'))!.amounts).toEqual({ h24: 150, d15: 200, base: 300 });
  });
  it('never applies degree prices to délits / administrative / pending', () => {
    for (const v of ds.violations.filter((x) => ['delit', 'admin', 'art94', 'stop'].includes(x.section))) {
      expect(fineFor(fines, v)!.type).not.toBe('transactional');
      expect(fineFor(fines, v)!.amounts).toBeUndefined();
    }
  });
  it('keeps exceptions', () => {
    expect(fineFor(fines, byCode('184221C1'))!.extraNote).toContain('أكثر من راكب');
  });
  it('rejects malformed tables', () => {
    expect(() => validateFines({ schema: 2 })).toThrow();
  });
});

describe('deadline calculator', () => {
  const cat = fines.categories.deg1!;
  const start = new Date(2026, 0, 10, 9, 0);
  it('24h tier', () => {
    const r = calculate(fines, cat, start, new Date(2026, 0, 11, 8, 59));
    expect(r.current!.amount).toBe(400);
    expect(r.windows[0].end).toEqual(new Date(2026, 0, 11, 9, 0));
  });
  it('15-day tier', () => {
    const r = calculate(fines, cat, start, new Date(2026, 0, 20));
    expect(r.current!.amount).toBe(500);
    expect(r.windows[1].end.getDate()).toBe(25);
  });
  it('original fine until day 30, then expiry (no automatic increase)', () => {
    expect(calculate(fines, cat, start, new Date(2026, 1, 5)).current!.amount).toBe(700);
    const r = calculate(fines, cat, start, new Date(2026, 1, 10));
    expect(r.expired).toBe(true);
    expect(r.current).toBeNull();
  });
});
