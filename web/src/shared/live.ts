// Live connection to the server (Server-Sent Events). EventSource reconnects automatically;
// we also track the connection state and the clock offset to the server.
import { useSyncExternalStore } from 'react';
import type { CommentEntry, GameState, HostView, ProviderStatus } from './types';

export interface LiveData {
  online: boolean; state: GameState | null; provider: ProviderStatus | null; host: HostView | null; comments: CommentEntry[]; clockOffset: number;
}
type Fx = { type: string; rank?: number };

export function createLive(admin: boolean) {
  let data: LiveData = { online: false, state: null, provider: null, host: null, comments: [], clockOffset: 0 };
  const subs = new Set<() => void>();
  const fxSubs = new Set<(fx: Fx) => void>();
  const set = (patch: Partial<LiveData>) => { data = { ...data, ...patch }; subs.forEach((f) => f()); };
  let es: EventSource | null = null;

  function connect() {
    es?.close();
    es = new EventSource(admin ? '/events?admin=1' : '/events');
    es.onopen = () => set({ online: true });
    es.onerror = () => set({ online: false });
    es.addEventListener('state', (e) => {
      const s = JSON.parse((e as MessageEvent).data) as GameState;
      set({ state: s, clockOffset: s.serverNow - Date.now(), online: true });
    });
    es.addEventListener('provider', (e) => set({ provider: JSON.parse((e as MessageEvent).data) }));
    es.addEventListener('host', (e) => set({ host: JSON.parse((e as MessageEvent).data) }));
    es.addEventListener('comment', (e) => set({ comments: [JSON.parse((e as MessageEvent).data), ...data.comments].slice(0, 150) }));
    es.addEventListener('fx', (e) => { const fx = JSON.parse((e as MessageEvent).data); fxSubs.forEach((f) => f(fx)); });
  }
  connect();
  // Phones suspend background tabs: reconnect immediately when the page becomes visible again.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!es || es.readyState === 2)) connect(); });

  return {
    get: () => data,
    set,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    onFx: (f: (fx: Fx) => void) => { fxSubs.add(f); return () => { fxSubs.delete(f); }; },
    reconnect: connect,
    close: () => es?.close(),
  };
}
export type Live = ReturnType<typeof createLive>;

export function useLive(live: Live): LiveData {
  return useSyncExternalStore(live.subscribe, live.get);
}

/** Remaining ms of the current phase, using the server clock. */
export function remainingMs(s: GameState | null, offset: number): number {
  if (!s) return 0;
  if (s.paused) return s.pausedRemaining ?? 0;
  if (!s.phaseEndsAt) return 0;
  return Math.max(0, s.phaseEndsAt - (Date.now() + offset));
}
