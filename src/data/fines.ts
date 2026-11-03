import { safe } from './db';
import type { SectionKey, Violation } from './types';

export type FineType = 'transactional' | 'administrative' | 'penal' | 'pending';
export interface Tier { key: string; label: string; hours?: number; days?: number; amount: 'h24' | 'd15' | 'base' }
export interface FineCategory { type: FineType; label: string; amounts?: { h24: number; d15: number; base: number }; ref: string; note?: string }
export interface FinesTable {
  schema: number;
  version: string;
  currency: string;
  status: 'verified' | 'unverified';
  statusNote?: string;
  sources: Record<string, { title: string; url: string }>;
  tiers: Tier[];
  deadlineRule: string;
  expiry: { title: string; text: string; ref: string };
  bases: { key: string; label: string; hint: string }[];
  categories: Partial<Record<SectionKey, FineCategory>>;
  overrides: Record<string, Partial<FineCategory> & { note?: string }>;
}

const URL_ = `${import.meta.env.BASE_URL}data/fines.json`;

export function validateFines(x: unknown): FinesTable {
  const t = x as FinesTable;
  if (!t || typeof t !== 'object' || t.schema !== 1) throw new Error('صيغة الملف غير صحيحة (schema يجب أن يساوي 1)');
  if (!Array.isArray(t.tiers) || !t.tiers.length) throw new Error('الحقل tiers مفقود');
  if (!t.categories || typeof t.categories !== 'object') throw new Error('الحقل categories مفقود');
  for (const [k, c] of Object.entries(t.categories)) {
    if (!c || !c.type || !c.label) throw new Error(`التصنيف ${k} غير مكتمل`);
    if (c.type === 'transactional') {
      const a = c.amounts;
      if (!a || ![a.h24, a.d15, a.base].every((n) => typeof n === 'number' && n >= 0)) throw new Error(`مبالغ التصنيف ${k} غير صحيحة`);
    }
  }
  t.overrides ??= {};
  t.sources ??= {};
  t.bases ??= [];
  return t;
}

/** Bundled table, unless the user imported an updated one (stored in IndexedDB). */
export async function loadFines(): Promise<{ table: FinesTable; custom: boolean }> {
  const custom = await safe((d) => d.get('dataset', 'fines-custom'), undefined);
  if (custom) {
    try { return { table: validateFines(custom), custom: true }; } catch { /* fall back */ }
  }
  const stored = await safe((d) => d.get('dataset', 'fines-bundled'), undefined);
  try {
    const res = await fetch(URL_, { cache: 'no-cache' });
    const t = validateFines(await res.json());
    await safe((d) => d.put('dataset', t as never, 'fines-bundled'), undefined);
    return { table: t, custom: false };
  } catch (e) {
    if (stored) return { table: validateFines(stored), custom: false };
    throw e;
  }
}

export const saveCustomFines = (t: FinesTable) => safe((d) => d.put('dataset', t as never, 'fines-custom'), undefined);
export const clearCustomFines = () => safe((d) => d.delete('dataset', 'fines-custom'), undefined);

export interface ResolvedFine extends FineCategory { extraNote?: string }

export function fineFor(t: FinesTable, v: Violation): ResolvedFine | null {
  const base = t.categories[v.section];
  if (!base) return null;
  const o = t.overrides[v.code] ?? t.overrides[v.id];
  if (!o) return base;
  const { note, ...rest } = o;
  return { ...base, ...rest, amounts: rest.amounts ?? base.amounts, extraNote: note };
}

// ---------- deadline calculator ----------
export interface TierWindow { tier: Tier; amount: number | null; end: Date }
export interface CalcResult { start: Date; windows: TierWindow[]; current: TierWindow | null; expired: boolean; remainingMs: number }

function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export function calculate(t: FinesTable, cat: FineCategory, start: Date, at: Date): CalcResult {
  const windows = t.tiers.map((tier) => {
    let end: Date;
    if (tier.hours) end = new Date(start.getTime() + tier.hours * 3600_000);
    else { const d = new Date(start); d.setDate(d.getDate() + (tier.days ?? 0)); end = endOfDay(d); }
    return { tier, amount: cat.amounts ? cat.amounts[tier.amount] : null, end };
  });
  const current = at < start ? windows[0] : windows.find((w) => at <= w.end) ?? null;
  const last = windows[windows.length - 1];
  return { start, windows, current, expired: at > last.end, remainingMs: current ? current.end.getTime() - at.getTime() : 0 };
}
