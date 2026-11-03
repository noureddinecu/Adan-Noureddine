import { useEffect, type RefObject } from 'react';
import { navigate } from './router';

/** Order of the bottom-bar pages (RTL: «الرئيسية» is the right-most tab). */
export const TAB_ORDER = ['/', '/favorites', '/history', '/about'];

const EDGE = 24; // keep the system back-gesture zones free
const LOCK = 12; // px before deciding horizontal vs vertical
const TRIGGER = 72; // px of drag needed to change page
const FLICK = 0.45; // px/ms: a quick flick is enough too

const ignore = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, [contenteditable], .overflow-x-auto, [data-no-swipe]');

/**
 * Swipe between the tab pages. A finger moving right→left opens the next tab
 * (الرئيسية → المفضلة → السجل → حول التطبيق), left→right goes back to the previous one.
 * Vertical scrolling, taps and the search field are untouched.
 */
export function useSwipeTabs(path: string, pageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const index = TAB_ORDER.indexOf(path);
    if (index < 0) return;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, mode: 'none' | 'h' | 'v' = 'none', active = false, swiped = false;

    const setPos = (px: number, animate: boolean) => {
      const el = pageRef.current;
      if (!el) return;
      el.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s ease' : 'none';
      el.style.transform = px ? `translate3d(${px}px,0,0)` : '';
      el.style.opacity = px ? String(Math.max(0.55, 1 - Math.abs(px) / 600)) : '';
    };

    const onStart = (e: TouchEvent) => {
      swiped = false;
      if (e.touches.length !== 1 || ignore(e.target)) { active = false; return; }
      const t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) { active = false; return; }
      x0 = t.clientX; y0 = t.clientY; t0 = performance.now(); dx = 0; mode = 'none'; active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (mode === 'none') {
        if (Math.abs(ddx) < LOCK && Math.abs(ddy) < LOCK) return;
        mode = Math.abs(ddx) > Math.abs(ddy) * 1.4 ? 'h' : 'v';
      }
      if (mode !== 'h') return;
      dx = ddx;
      const target = index + (dx < 0 ? 1 : -1);
      const blocked = target < 0 || target >= TAB_ORDER.length;
      setPos(dx * (blocked ? 0.12 : 0.45), false); // rubber-band at the first / last tab
    };
    const onEnd = () => {
      if (!active || mode !== 'h') { active = false; return; }
      active = false;
      swiped = true;
      const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
      const target = index + (dx < 0 ? 1 : -1);
      if ((Math.abs(dx) > TRIGGER || v > FLICK) && target >= 0 && target < TAB_ORDER.length) {
        // finger to the left → new page slides in from the right, and vice-versa
        navigate(TAB_ORDER[target], { tab: true, dir: dx < 0 ? 'back' : 'forward' });
        requestAnimationFrame(() => setPos(0, false));
      } else {
        setPos(0, true);
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
      setPos(0, false);
    };
  }, [path, pageRef]);
}
