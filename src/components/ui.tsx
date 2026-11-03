import { ArrowRight, BookOpenText, Star, CircleAlert, FileText, Footprints, Gavel, Hand, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { SectionKey } from '../data/types';
import { goBack } from '../lib/router';
import { highlight } from '../search/engine';

export const SECTION_STYLE: Record<SectionKey, { bg: string; fg: string; soft: string; icon: LucideIcon; label: string }> = {
  deg1: { bg: 'bg-deg1', fg: 'text-white', soft: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300', icon: OctagonAlert, label: '1' },
  deg2: { bg: 'bg-deg2', fg: 'text-white', soft: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200', icon: TriangleAlert, label: '2' },
  deg3: { bg: 'bg-deg3', fg: 'text-white', soft: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300', icon: CircleAlert, label: '3' },
  admin: { bg: 'bg-admin', fg: 'text-white', soft: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300', icon: FileText, label: 'AD' },
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
  return (
    <img
      src="./icons/app-icon.png"
      alt=""
      draggable={false}
      className={`${className} shrink-0 rounded-full bg-white object-contain ${tile ? 'shadow-[0_8px_22px_-10px_rgba(0,0,0,.45)] ring-1 ring-black/5' : ''}`}
    />
  );
}

/** Top corners: green zellige wedges edged with a white + red ribbon (reference design). */
function Corner({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`brand-corner ${side}`} viewBox="0 0 160 80" preserveAspectRatio="none" aria-hidden>
      <path d="M0 0H140C104 20 58 46 0 72Z" fill="#0b6a41" />
      <path d="M140 0C104 20 58 46 0 72" fill="none" stroke="#fff" strokeWidth="3.2" vectorEffect="non-scaling-stroke" />
      <path d="M156 0C118 24 66 52 0 82" fill="none" stroke="#c8202c" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
export function HeaderCorners() {
  return (
    <div className="brand-corners" aria-hidden>
      <Corner side="left" />
      <span className="brand-corner-z left" />
      <Corner side="right" />
      <span className="brand-corner-z right" />
    </div>
  );
}

/** Bottom edge: green wave, white gap, red ribbon. */
export function HeaderWave() {
  return (
    <svg className="brand-wave" viewBox="0 0 400 34" preserveAspectRatio="none" aria-hidden>
      <path d="M0 10C90 -2 170 4 230 14C300 26 350 26 400 12V20C350 34 300 34 230 22C170 12 90 6 0 18Z" fill="#0d7a4a" />
      <path d="M0 22C90 10 170 16 230 26C300 38 350 38 400 24" fill="none" stroke="#c8202c" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Divider({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden>
      <span className={`h-[2.5px] ${wide ? 'w-24' : 'w-14'} rounded-full bg-gradient-to-l from-brand-600 to-brand-600/10`} />
      <Star className="size-4 text-accent" strokeWidth={2.4} />
      <span className={`h-[2.5px] ${wide ? 'w-24' : 'w-14'} rounded-full bg-gradient-to-r from-brand-600 to-brand-600/10`} />
    </div>
  );
}

/** Single header used by every page (home = large variant with the logo). */
export function BrandHeader({ title, subtitle, back = false, right, large = false, sticky = true }: { title: ReactNode; subtitle?: ReactNode; back?: boolean; right?: ReactNode; large?: boolean; sticky?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !sticky) return;
    const set = () => document.documentElement.style.setProperty('--hdr', `${el.offsetHeight - 6}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sticky]);
  return (
    <header ref={ref} className={`brand-header ${sticky ? 'sticky top-0 z-30' : 'relative'} ${large ? 'is-large' : ''}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <HeaderCorners />
      <div className={`relative z-10 mx-auto max-w-3xl text-center ${large ? 'px-4 pb-3 pt-5' : 'px-16 pb-1 pt-3'}`}>
        {back && (
          <button onClick={() => goBack()} className="brand-btn absolute end-3 top-3 z-10" aria-label="رجوع">
            <ArrowRight className="size-5" />
          </button>
        )}
        {right && <div className="absolute start-3 top-3 z-10">{right}</div>}
        {large && <Logo tile className="mx-auto mb-2 size-[clamp(84px,24vw,112px)] ring-4 ring-white" />}
        <h1 className={`brand-title font-bold leading-tight ${large ? 'text-[clamp(26px,7.4vw,34px)]' : 'truncate text-[clamp(20px,5.6vw,24px)]'}`}>{title}</h1>
        <div className={large ? 'my-2' : 'my-1'}><Divider wide={large} /></div>
        {subtitle && (
          <p className={`flex items-center justify-center gap-2 font-medium text-[var(--muted)] ${large ? 'text-[clamp(14px,4vw,16.5px)]' : 'text-[14px]'}`}>
            {large && <span className="h-[2px] w-5 shrink-0 rounded-full bg-accent/80" aria-hidden />}
            <span className={large ? '' : 'truncate'}>{subtitle}</span>
            {large && <span className="h-[2px] w-5 shrink-0 rounded-full bg-accent/80" aria-hidden />}
          </p>
        )}
      </div>
      <HeaderWave />
    </header>
  );
}

export function PageHeader({ title, subtitle, back = true, right }: { title: ReactNode; subtitle?: ReactNode; back?: boolean; right?: ReactNode }) {
  return <BrandHeader title={title} subtitle={subtitle} back={back} right={right} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,.04)] ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-3 px-1">
      <h2 className="flex shrink-0 items-center gap-2 text-[17px] font-bold text-[var(--text)]"><span className="size-2 rotate-45 bg-accent" aria-hidden />{icon}{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-l from-brand-600/35 to-transparent" aria-hidden />
      {action}
    </div>
  );
}

export function OrnamentTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 mt-6 flex items-center justify-center gap-2" role="heading" aria-level={2}>
      <span className="flex flex-1 items-center justify-end gap-1.5" aria-hidden>
        <span className="h-[2px] w-full max-w-24 rounded-full bg-gradient-to-l from-brand-600 to-brand-600/0" />
        <span className="size-2 rotate-45 bg-accent" />
      </span>
      <span className="rounded-full border-2 border-brand-600/70 bg-[var(--surface)] px-5 py-1.5 text-[18px] font-bold text-[var(--text)] shadow-sm">{children}</span>
      <span className="flex flex-1 items-center gap-1.5" aria-hidden>
        <span className="size-2 rotate-45 bg-accent" />
        <span className="h-[2px] w-full max-w-24 rounded-full bg-gradient-to-r from-brand-600 to-brand-600/0" />
      </span>
    </div>
  );
}

export function Empty({ icon, title, text }: { icon?: ReactNode; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center px-6 pb-14 pt-24 text-center text-[var(--muted)]">
      <div className="mb-3 grid size-16 place-items-center rounded-full bg-[var(--surface-2)] text-brand-600 dark:text-brand-100">{icon ?? <BookOpenText className="size-8" />}</div>
      <p className="text-[16px] font-semibold text-[var(--text)]">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm leading-6">{text}</p>}
    </div>
  );
}
