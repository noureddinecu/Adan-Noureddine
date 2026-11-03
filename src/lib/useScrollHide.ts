import { useEffect, useRef, useState } from 'react';

/** true while the user scrolls down (past `offset`), false as soon as they scroll up. */
export function useScrollHide(offset = 120, delta = 6) {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    last.current = window.scrollY;
    let ticking = false;
    const on = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const d = y - last.current;
        if (y < offset) setHidden(false);
        else if (d > delta) setHidden(true);
        else if (d < -delta) setHidden(false);
        if (Math.abs(d) > delta) last.current = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [offset, delta]);
  return hidden;
}
