import { safe } from './db';
import type { Dataset } from './types';

const DATA_URL = `${import.meta.env.BASE_URL}data/violations.json`;

/**
 * Loads the violations database.
 * 1. Fetch the bundled JSON (served from the service-worker cache when offline).
 * 2. Persist it into IndexedDB so the data survives even if the HTTP cache is purged.
 * 3. If the network/cache fetch fails, fall back to the copy stored in IndexedDB.
 */
export async function loadDataset(): Promise<Dataset> {
  const stored = await safe((d) => d.get('dataset', 'current'), undefined);
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fresh = (await res.json()) as Dataset;
    if (!stored || stored.version !== fresh.version) {
      await safe((d) => d.put('dataset', fresh, 'current'), undefined);
    }
    return fresh;
  } catch (err) {
    if (stored) return stored;
    throw err;
  }
}
