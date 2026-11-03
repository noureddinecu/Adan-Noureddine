import { Search, X } from 'lucide-react';
import { forwardRef } from 'react';

interface Props { value: string; onChange: (v: string) => void; onSubmit?: () => void; onFocus?: () => void; autoFocus?: boolean; placeholder?: string; large?: boolean }

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar({ value, onChange, onSubmit, onFocus, autoFocus, placeholder, large }, ref) {
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(); (document.activeElement as HTMLElement | null)?.blur(); }}
      className={`flex items-center gap-2 rounded-2xl border-2 border-transparent bg-[var(--surface)] shadow-lg ring-1 ring-black/5 transition focus-within:border-brand-500 dark:ring-white/10 ${large ? 'h-14 px-4' : 'h-12 px-3'}`}
    >
      <Search className={`${large ? 'size-6' : 'size-5'} shrink-0 text-brand-600 dark:text-brand-100`} aria-hidden />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        value={value}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'ابحث باسم المخالفة، الرمز، المادة…'}
        aria-label="البحث في المخالفات"
        className={`min-w-0 flex-1 bg-transparent text-right outline-none placeholder:text-[var(--muted)] [&::-webkit-search-cancel-button]:hidden ${large ? 'text-[17px]' : 'text-[16px]'}`}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]" aria-label="مسح البحث">
          <X className="size-4.5" />
        </button>
      )}
    </form>
  );
});
