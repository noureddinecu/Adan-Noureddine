import { ArrowRight, BookOpenText, CircleAlert, FileText, Footprints, Gavel, Hand, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SectionKey } from '../data/types';
import { goBack } from '../lib/router';
import { highlight } from '../search/engine';

export const SECTION_STYLE: Record<SectionKey, { bg: string; fg: string; soft: string; icon: LucideIcon; label: string }> = {
  deg1: { bg: 'bg-deg1', fg: 'text-white', soft: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300', icon: OctagonAlert, label: '1' },
  deg2: { bg: 'bg-deg2', fg: 'text-neutral-900', soft: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200', icon: TriangleAlert, label: '2' },
  deg3: { bg: 'bg-deg3', fg: 'text-emerald-950', soft: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300', icon: CircleAlert, label: '3' },
  admin: { bg: 'bg-admin', fg: 'text-cyan-950', soft: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300', icon: FileText, label: 'AD' },
  delit: { bg: 'bg-delit', fg: 'text-white', soft: 'bg-orange-50 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300', icon: Gavel, label: 'DL' },
  art94: { bg: 'bg-art94', fg: 'text-white', soft: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200', icon: Footprints, label: 'C4' },
  stop: { bg: 'bg-stop', fg: 'text-white', soft: 'bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-300', icon: Hand, label: '⏸' },
};

export function SectionIcon({ section, className = 'size-5' }: { section: SectionKey; className?: string }) {
  const Icon = SECTION_STYLE[section].icon;
  return <Icon className={className} aria-hidden strokeWidth={2.2} />;
}

export function CodeBadge({ code, section, small }: { code: string; section: SectionKey; small?: boolean }) {
  const s = SECTION_STYLE[section];
  return (
    <span className={`${s.bg} ${s.fg} ltr-nums inline-flex items-center rounded-lg font-bold tracking-wide shadow-sm ${small ? 'px-2 py-0.5 text-[13px]' : 'px-2.5 py-1 text-[14px]'}`}>
      {code}
    </span>
  );
}

export function Hl({ text, terms }: { text: string; terms?: Set<string> }) {
  return <>{highlight(text, terms).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}</>;
}

export function Logo({ className = 'size-11', tile = false }: { className?: string; tile?: boolean }) {
  const img = <img src="./icons/logo.svg" alt="" className={tile ? 'size-full' : className} draggable={false} />;
  if (!tile) return img;
  return <span className={`${className} inline-grid shrink-0 place-items-center rounded-2xl bg-[#fffdf8] p-1 shadow-md ring-1 ring-gold/40`}>{img}</span>;
}

export function PageHeader({ title, subtitle, back = true, right, tone }: { title: ReactNode; subtitle?: ReactNode; back?: boolean; right?: ReactNode; tone?: string }) {
  return (
    <header className={`sticky top-0 z-30 zellige-header ${tone ?? 'bg-gradient-to-l from-brand-800 to-brand-600'} text-white shadow-md`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3">
        {back && (
          <button onClick={() => goBack()} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/15 active:bg-white/25" aria-label="رجوع">
            <ArrowRight className="size-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-[13.5px] opacity-85">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="zellige-band" />
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,.04)] ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center justify-between px-1">
      <h2 className="flex items-center gap-2 text-[16px] font-bold text-[var(--text)]">{icon}{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ icon, title, text }: { icon?: ReactNode; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center text-[var(--muted)]">
      <div className="mb-3 grid size-16 place-items-center rounded-full bg-[var(--surface-2)] text-brand-600 dark:text-brand-100">{icon ?? <BookOpenText className="size-8" />}</div>
      <p className="text-[16px] font-semibold text-[var(--text)]">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm leading-6">{text}</p>}
    </div>
  );
}
