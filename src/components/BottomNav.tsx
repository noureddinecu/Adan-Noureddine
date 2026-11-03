import { History, House, Info, Star } from 'lucide-react';
import { navigate } from '../lib/router';

const items = [
  { to: '/', label: 'الرئيسية', icon: House, match: (p: string) => p === '/' || p.startsWith('/section') },
  { to: '/favorites', label: 'المفضلة', icon: Star, match: (p: string) => p.startsWith('/favorites') },
  { to: '/history', label: 'السجل', icon: History, match: (p: string) => p.startsWith('/history') },
  { to: '/about', label: 'حول الدليل', icon: Info, match: (p: string) => p.startsWith('/about') },
];

export function BottomNav({ path }: { path: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="التنقل الرئيسي">
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {items.map(({ to, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <button key={to} onClick={() => navigate(to)} className={`flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-medium transition ${active ? 'text-brand-600 dark:text-brand-100' : 'text-[var(--muted)]'}`} aria-current={active ? 'page' : undefined}>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? 'bg-brand-100 dark:bg-brand-800' : ''}`}>
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
