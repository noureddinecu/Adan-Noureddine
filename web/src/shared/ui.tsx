import { useEffect, useRef, useState, type ReactNode } from 'react';

export function cx(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(' '); }

export function Logo({ size = 36, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/logo.svg" width={size} height={size} alt="" className="drop-shadow-[0_4px_14px_rgba(236,72,153,.5)]" />
      {withText && (
        <span className="font-display font-extrabold leading-none tracking-tight" dir="ltr">
          <span className="text-white">LIVE </span><span className="grad-text">QUIZ</span><span className="text-white/80"> GAME</span>
        </span>
      )}
    </span>
  );
}

export function Avatar({ src, name, size = 36, className = '' }: { src?: string; name: string; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  const ok = src && /^https:\/\//.test(src) && !err;
  const letter = [...(name || '?').replace(/^🤖\s*/, '')][0]?.toUpperCase() || '?';
  return ok ? (
    <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setErr(true)} className={cx('rounded-full object-cover bg-white/10 shrink-0', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cx('rounded-full grad-bg grid place-items-center font-display font-extrabold shrink-0', className)} style={{ width: size, height: size, fontSize: size * 0.45 }}>{name?.startsWith('🤖') ? '🤖' : letter}</span>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
      <span className="min-w-0"><span className="block font-semibold">{label}</span>{hint && <span className="block text-xs muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'grad-bg' : 'bg-white/15')}>
        <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'start-6' : 'start-1')} />
      </button>
    </label>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label?: ReactNode }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <span className="font-semibold text-sm">{label}</span>}
      <div className="flex items-center gap-1 rounded-2xl bg-white/[.07] border border-white/10 p-1">
        <button type="button" className="btn-ghost btn-sm w-9 h-9 !p-0 text-xl" onClick={() => set(value - step)} aria-label="-">−</button>
        <input className="w-12 bg-transparent text-center font-bold outline-none" inputMode="numeric" value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || min)} />
        <button type="button" className="btn-ghost btn-sm w-9 h-9 !p-0 text-xl" onClick={() => set(value + step)} aria-label="+">+</button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-2xl bg-white/[.06] border border-white/10 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('rounded-xl px-2 py-2 text-sm font-bold transition truncate', value === o.value ? 'grad-bg shadow-glow' : 'text-white/60 hover:text-white')}>{o.label}</button>
      ))}
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on large screens. */
export function Sheet({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-[rise_.2s_ease-out]" onClick={onClose}>
      <div className={cx('w-full max-h-[94dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-ink-2 border border-white/10 shadow-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-white/10">
          <div className="h-title truncate">{title}</div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4 grow">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-white/10 safe-bottom flex flex-wrap gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

let toastFn: ((m: string, kind?: 'ok' | 'err') => void) | null = null;
export const toast = (m: string, kind: 'ok' | 'err' = 'ok') => toastFn?.(m, kind);
export function Toaster() {
  const [items, setItems] = useState<{ id: number; m: string; kind: string }[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    toastFn = (m, kind = 'ok') => {
      const id = ++seq.current;
      setItems((x) => [...x, { id, m, kind }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
    };
    return () => { toastFn = null; };
  }, []);
  return (
    <div className="fixed z-[60] top-3 inset-x-3 flex flex-col items-center gap-2 pointer-events-none">
      {items.map((i) => (
        <div key={i.id} className={cx('animate-rise rounded-2xl px-4 py-2.5 font-bold shadow-xl max-w-md text-center', i.kind === 'err' ? 'bg-bad text-ink' : 'bg-white text-ink')}>{i.m}</div>
      ))}
    </div>
  );
}

export function Section({ title, icon, children, right, className = '' }: { title: ReactNode; icon?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={cx('card', className)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="h-title flex items-center gap-2">{icon && <span>{icon}</span>}{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-center muted py-6 text-sm">{children}</div>;
}

export function fmtTime(ts: number | null | undefined, lang: string) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(lang === 'ar' ? 'ar-MA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
