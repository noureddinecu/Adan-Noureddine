import { useEffect, useState } from 'react';

export type NavDir = 'forward' | 'back' | 'tab' | 'none';
export interface Route { path: string; parts: string[]; query: URLSearchParams; dir: NavDir; key: number }

let pendingDir: NavDir | null = null;
let navKey = 0;
const scrollMemory = new Map<string, number>();

function parse(dir: NavDir): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs), dir, key: navKey };
}

const remember = () => scrollMemory.set(window.location.hash || '#/', window.scrollY);
export const savedScroll = (hash = window.location.hash || '#/') => scrollMemory.get(hash);

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse('none'));
  useEffect(() => {
    const on = () => {
      // a hashchange we did not trigger ourselves is the hardware / browser back button
      const dir = pendingDir ?? 'back';
      pendingDir = null;
      if (dir !== 'none') navKey++;
      setRoute(parse(dir));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

let depth = 0; // in-app navigations, so «back» never leaves the app
window.addEventListener('hashchange', () => { depth++; });

export function navigate(to: string, opts: { replace?: boolean; tab?: boolean } = {}) {
  const url = `#${to}`;
  if (opts.replace) {
    const samePage = (window.location.hash.replace(/^#/, '') || '/').split('?')[0] === to.split('?')[0];
    pendingDir = samePage ? 'none' : 'forward';
    history.replaceState(history.state, '', url);
    depth--;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    remember();
    pendingDir = opts.tab ? 'tab' : 'forward';
    window.location.hash = to;
  }
}

export function goBack(fallback = '/') {
  remember();
  if (depth > 0) { depth -= 2; pendingDir = 'back'; history.back(); } else { pendingDir = 'back'; window.location.hash = fallback; }
}
