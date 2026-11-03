import { History, House, Info, Star } from 'lucide-react';
import { navigate } from '../lib/router';
import { slideToTab, TAB_ORDER } from '../lib/useSwipeTabs';

const items = [
  { to: '/', label: 'الرئيسية', icon: House, match: (p: string) => p === '/' || p.startsWith('/section') },
  { to: '/favorites', label: 'المفضلة', icon: Star, match: (p: string) => p.startsWith('/favorites') },
  { to: '/history', label: 'السجل', icon: History, match: (p: string) => p.startsWith('/history') },
  { to: '/about', label: 'حول التطبيق', icon: Info, match: (p: string) => p.startsWith('/about') },
];

export function BottomNav({ path }: { path: string }) {
  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="التنقل الرئيسي">
      <svg className="nav-curve" viewBox="0 0 400 30" preserveAspectRatio="none" aria-hidden>
        <path d="M0 30V20C110 -2 300 -4 400 18V30Z" fill="var(--hdr-bottom)" />
        <path d="M0 20C110 -2 300 -4 400 18" fill="none" stroke="#d81e2b" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
        <path d="M0 24C110 2 300 0 400 22" fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="nav-panel mx-auto grid max-w-3xl grid-cols-4">
        {items.map(({ to, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <button key={to} onClick={() => { if (!active) { if (TAB_ORDER.includes(path)) slideToTab(to, path); else navigate(to, { tab: true }); } }} className={`flex flex-col items-center gap-0.5 py-2 text-[13.5px] font-semibold transition ${active ? 'text-brand-700 dark:text-brand-100' : 'text-[var(--muted)]'}`} aria-current={active ? 'page' : undefined}>
              <span className={`grid h-8 w-14 place-items-center rounded-full transition-all duration-300 ${active ? 'bg-brand-100 shadow-[inset_0_0_0_1.5px_rgba(10,92,57,.25)] dark:bg-brand-800' : ''}`} style={active ? { viewTransitionName: 'vt-nav-pill' } : undefined}>
                <Icon className={`size-5 ${active && to === '/favorites' ? 'fill-current' : ''}`} />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
