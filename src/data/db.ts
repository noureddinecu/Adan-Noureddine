import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Dataset } from './types';

interface Schema extends DBSchema {
  dataset: { key: string; value: Dataset };
  favorites: { key: string; value: { id: string; at: number } };
  history: { key: string; value: { id: string; at: number } };
  searches: { key: string; value: { q: string; at: number } };
  views: { key: string; value: { id: string; count: number } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<Schema>('dalil-muraqaba', 1, {
      upgrade(d) {
        d.createObjectStore('dataset');
        d.createObjectStore('favorites', { keyPath: 'id' });
        d.createObjectStore('history', { keyPath: 'id' });
        d.createObjectStore('searches', { keyPath: 'q' });
        d.createObjectStore('views', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}

/** Wraps an IndexedDB call so a blocked/unavailable store never breaks the app. */
export async function safe<T>(fn: (d: IDBPDatabase<Schema>) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn(await db());
  } catch (e) {
    console.warn('IndexedDB unavailable', e);
    return fallback;
  }
}
