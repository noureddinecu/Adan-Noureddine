import { useEffect, type RefObject } from 'react';
import { navigate } from './router';

/** Order of the bottom-bar pages. Swiping left→right moves forward through this list. */
export const TAB_ORDER = ['/', '/favorites', '/history', '/about'];

const LOCK = 10; // px before deciding horizontal vs vertical
const TRIGGER = 0.22; // fraction of the screen width
const FLICK = 0.4; // px/ms
const OUT_MS = 170;

let pageEl: HTMLElement | null = null;
let busy = false;

const ignore = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, [contenteditable], .overflow-x-auto, [data-no-swipe]');

function setPos(px: number, ms = 0) {
  if (!pageEl) return;
  pageEl.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4,0,.2,1), opacity ${ms}ms ease` : 'none';
  pageEl.style.transform = px ? `translate3d(${px}px,0,0)` : '';
  pageEl.style.opacity = px ? String(Math.max(0.35, 1 - Math.abs(px) / (window.innerWidth * 1.4))) : '';
}

/**
 * Pager-style move to another tab page: the current page slides out to one side,
 * the new one slides in from the other — same motion for swipes and bottom-bar taps.
 * next = finger left→right: current page leaves to the right, new page enters from the left.
 */
export function slideToTab(to: string, from?: string) {
  const cur = TAB_ORDER.indexOf(from ?? (window.location.hash.replace(/^#/, '').split('?')[0] || '/'));
  const target = TAB_ORDER.indexOf(to);
  if (target < 0 || target === cur || busy) return;
  const dir = cur < 0 || target > cur ? 'next' : 'prev';
  busy = true;
  setPos((dir === 'next' ? 1 : -1) * window.innerWidth * 0.5, OUT_MS);
  window.setTimeout(() => {
    setPos(0);
    navigate(to, { tab: true, dir });
    busy = false;
  }, OUT_MS);
}

export function useSwipeTabs(path: string, pageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    pageEl = pageRef.current;
    const index = TAB_ORDER.indexOf(path);
    if (index < 0) return;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, mode: 'none' | 'h' | 'v' = 'none', active = false, swiped = false;

    const onStart = (e: TouchEvent) => {
      swiped = false;
      if (busy || e.touches.length !== 1 || ignore(e.target)) { active = false; return; }
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = performance.now(); dx = 0; mode = 'none'; active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (mode === 'none') {
        if (Math.abs(ddx) < LOCK && Math.abs(ddy) < LOCK) return;
        mode = Math.abs(ddx) > Math.abs(ddy) * 1.3 ? 'h' : 'v';
      }
      if (mode !== 'h') return;
      dx = ddx;
      const target = index + (dx > 0 ? 1 : -1);
      const blocked = target < 0 || target >= TAB_ORDER.length;
      // follows the finger 1:1, rubber-band at the first / last page
      setPos(blocked ? dx * 0.15 : dx);
    };
    const onEnd = () => {
      if (!active || mode !== 'h') { active = false; return; }
      active = false;
      swiped = true;
      const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
      const target = index + (dx > 0 ? 1 : -1);
      const ok = target >= 0 && target < TAB_ORDER.length;
      if (ok && (Math.abs(dx) > window.innerWidth * TRIGGER || v > FLICK)) {
        const dir = dx > 0 ? 'next' : 'prev';
        busy = true;
        const remaining = Math.max(90, OUT_MS * (1 - Math.abs(dx) / window.innerWidth));
        setPos(Math.sign(dx) * window.innerWidth * 0.6, remaining);
        window.setTimeout(() => { setPos(0); navigate(TAB_ORDER[target], { tab: true, dir }); busy = false; }, remaining);
      } else {
        setPos(0, 260);
      }
    };
    // a horizontal swipe must not also "click" the card under the finger
    const onClick = (e: MouseEvent) => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      document.removeEventListener('click', onClick, true);
    };
  }, [path, pageRef]);
}
