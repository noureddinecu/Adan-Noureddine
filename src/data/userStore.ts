import { safe } from './db';

const HISTORY_MAX = 60;
const SEARCHES_MAX = 25;

export interface UserData {
  favorites: { id: string; at: number }[];
  history: { id: string; at: number }[];
  searches: { q: string; at: number }[];
  views: Record<string, number>;
}

export async function loadUserData(): Promise<UserData> {
  const [favorites, history, searches, views] = await Promise.all([
    safe((d) => d.getAll('favorites'), []),
    safe((d) => d.getAll('history'), []),
    safe((d) => d.getAll('searches'), []),
    safe((d) => d.getAll('views'), []),
  ]);
  return {
    favorites: favorites.sort((a, b) => b.at - a.at),
    history: history.sort((a, b) => b.at - a.at),
    searches: searches.sort((a, b) => b.at - a.at),
    views: Object.fromEntries(views.map((v) => [v.id, v.count])),
  };
}

export const userStore = {
  addFavorite: (id: string) => safe((d) => d.put('favorites', { id, at: Date.now() }), undefined),
  removeFavorite: (id: string) => safe((d) => d.delete('favorites', id), undefined),
  clearFavorites: () => safe((d) => d.clear('favorites'), undefined),
  async recordView(id: string) {
    await safe(async (d) => {
      const tx = d.transaction(['history', 'views'], 'readwrite');
      await tx.objectStore('history').put({ id, at: Date.now() });
      const v = await tx.objectStore('views').get(id);
      await tx.objectStore('views').put({ id, count: (v?.count ?? 0) + 1 });
      const all = await tx.objectStore('history').getAll();
      if (all.length > HISTORY_MAX) {
        for (const old of all.sort((a, b) => b.at - a.at).slice(HISTORY_MAX)) await tx.objectStore('history').delete(old.id);
      }
      await tx.done;
    }, undefined);
  },
  clearHistory: () => safe(async (d) => { await d.clear('history'); await d.clear('views'); }, undefined),
  async addSearch(q: string) {
    await safe(async (d) => {
      await d.put('searches', { q, at: Date.now() });
      const all = await d.getAll('searches');
      if (all.length > SEARCHES_MAX) for (const old of all.sort((a, b) => b.at - a.at).slice(SEARCHES_MAX)) await d.delete('searches', old.q);
    }, undefined);
  },
  removeSearch: (q: string) => safe((d) => d.delete('searches', q), undefined),
  clearSearches: () => safe((d) => d.clear('searches'), undefined),
};
