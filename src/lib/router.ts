import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type NavDir = 'forward' | 'back' | 'tab' | 'none';
export interface Route { path: string; parts: string[]; query: URLSearchParams; dir: NavDir; key: number }

let navKey = 0;
let setter: ((r: Route) => void) | null = null;
let depth = 0; // in-app navigations, so «back» never leaves the app
let expectingPop = false;
const scrollMemory = new Map<string, number>();

function parse(dir: NavDir): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs), dir, key: navKey };
}

const remember = () => scrollMemory.set(window.location.hash || '#/', window.scrollY);
export const savedScroll = (hash = window.location.hash || '#/') => scrollMemory.get(hash);

type VT = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void>; skipTransition: () => void };
type VTDoc = Document & { startViewTransition?: (cb: () => void) => VT };
let running: VT | null = null;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const supportsViewTransitions = () => typeof (document as VTDoc).startViewTransition === 'function' && !reducedMotion();
if (supportsViewTransitions()) document.documentElement.classList.add('vt');

/** Temporarily names an element so it morphs into the matching element of the next page. */
export function morph(el: Element | null, name: string) {
  if (!el || !supportsViewTransitions()) return;
  (el as HTMLElement).style.viewTransitionName = name;
  (el as HTMLElement).dataset.vtTemp = '1';
}

function commit(dir: NavDir) {
  if (dir !== 'none') navKey++;
  const next = parse(dir);
  const apply = () => flushSync(() => setter?.(next));
  const doc = document as VTDoc;
  if (dir !== 'none' && supportsViewTransitions()) {
    document.documentElement.dataset.navDir = dir;
    running?.skipTransition(); // a quick second tap finishes the previous animation instantly
    const t = doc.startViewTransition!(apply);
    running = t;
    t.ready.catch(() => {});
    t.updateCallbackDone.catch(() => {});
    t.finished.catch(() => {}).finally(() => {
      if (running === t) running = null;
      document.querySelectorAll<HTMLElement>('[data-vt-temp]').forEach((e) => { e.style.viewTransitionName = ''; delete e.dataset.vtTemp; });
    });
  } else {
    apply();
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse('none'));
  useEffect(() => {
    setter = setRoute;
    const onPop = () => {
      if (!expectingPop && depth > 0) depth--;
      expectingPop = false;
      commit('back');
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); setter = null; };
  }, []);
  return route;
}

export function navigate(to: string, opts: { replace?: boolean; tab?: boolean; back?: boolean } = {}) {
  const url = `#${to}`;
  if (opts.replace) {
    const samePage = (window.location.hash.replace(/^#/, '') || '/').split('?')[0] === to.split('?')[0];
    history.replaceState(history.state, '', url);
    commit(opts.back ? 'back' : samePage ? 'none' : 'forward');
  } else {
    remember();
    history.pushState(history.state, '', url);
    depth++;
    commit(opts.tab ? 'tab' : 'forward');
  }
}

export function goBack(fallback = '/') {
  remember();
  if (depth > 0) { depth--; expectingPop = true; history.back(); } else navigate(fallback, { replace: true, back: true });
}
