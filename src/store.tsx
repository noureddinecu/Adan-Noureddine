import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearCustomFines, loadFines, saveCustomFines, type FinesTable } from './data/fines';
import { loadLawIndex, type LawIndex } from './data/law';
import { loadDataset } from './data/repository';
import type { Dataset, Section, Violation } from './data/types';
import { loadUserData, userStore, type UserData } from './data/userStore';
import { buildIndex, type SearchIndex } from './search/engine';

interface Ctx {
  data: Dataset;
  index: SearchIndex;
  byId: Map<string, Violation>;
  sections: Map<string, Section>;
  user: UserData;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  recordView: (id: string) => void;
  addSearch: (q: string) => void;
  removeSearch: (q: string) => void;
  clearSearches: () => void;
  clearHistory: () => void;
  clearFavorites: () => void;
  fines: FinesTable;
  law: LawIndex;
  finesCustom: boolean;
  setCustomFines: (t: FinesTable | null) => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
};

type State = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: Dataset };
type FinesState = { table: FinesTable; custom: boolean };

export function AppProvider({ children, splash, error }: { children: ReactNode; splash: ReactNode; error: (msg: string) => ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [law, setLaw] = useState<LawIndex | null>(null);
  const [fines, setFines] = useState<FinesState | null>(null);
  const [user, setUser] = useState<UserData>({ favorites: [], history: [], searches: [], views: {} });

  useEffect(() => {
    Promise.all([loadDataset(), loadUserData(), loadFines(), loadLawIndex()])
      .then(([data, u, f, l]) => { setUser(u); setFines(f); setLaw(l); setState({ status: 'ready', data }); })
      .catch((e) => setState({ status: 'error', error: String(e?.message ?? e) }));
  }, []);

  const refresh = useCallback(() => loadUserData().then(setUser), []);
  const data = state.status === 'ready' ? state.data : null;
  const index = useMemo(() => (data ? buildIndex(data) : null), [data]);
  const byId = useMemo(() => new Map((data?.violations ?? []).map((v) => [v.id, v])), [data]);
  const sections = useMemo(() => new Map((data?.sections ?? []).map((s) => [s.key, s])), [data]);
  const favSet = useMemo(() => new Set(user.favorites.map((f) => f.id)), [user.favorites]);

  const value = useMemo<Ctx | null>(() => {
    if (!data || !index || !fines || !law) return null;
    return {
      data, index, byId, sections, user,
      isFavorite: (id) => favSet.has(id),
      toggleFavorite: (id) => {
        const on = favSet.has(id);
        setUser((u) => ({ ...u, favorites: on ? u.favorites.filter((f) => f.id !== id) : [{ id, at: Date.now() }, ...u.favorites] }));
        (on ? userStore.removeFavorite(id) : userStore.addFavorite(id)).then(refresh);
      },
      recordView: (id) => { userStore.recordView(id).then(refresh); },
      addSearch: (q) => { const t = q.trim(); if (t.length >= 2) userStore.addSearch(t).then(refresh); },
      removeSearch: (q) => { userStore.removeSearch(q).then(refresh); },
      clearSearches: () => { userStore.clearSearches().then(refresh); },
      clearHistory: () => { userStore.clearHistory().then(refresh); },
      clearFavorites: () => { userStore.clearFavorites().then(refresh); },
      fines: fines.table,
      law,
      finesCustom: fines.custom,
      setCustomFines: async (t) => {
        if (t) { await saveCustomFines(t); } else { await clearCustomFines(); }
        setFines(await loadFines());
      },
    };
  }, [data, index, byId, sections, user, favSet, refresh, fines, law]);

  if (state.status === 'error') return <>{error(state.error)}</>;
  if (!value) return <>{splash}</>;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
