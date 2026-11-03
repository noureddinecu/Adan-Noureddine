import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'theme';

function read(): ThemePref {
  try { return (localStorage.getItem(KEY) as ThemePref) || 'system'; } catch { return 'system'; }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#062a1f' : '#0b3d2e');
  return dark;
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const [dark, setDark] = useState(() => applyTheme(read()));
  useEffect(() => {
    setDark(applyTheme(pref));
    try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => pref === 'system' && setDark(applyTheme('system'));
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);
  return { pref, dark, toggle: () => setPref(dark ? 'light' : 'dark'), setPref };
}
