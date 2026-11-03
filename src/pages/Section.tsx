import { useDeferredValue, useMemo, useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { Empty, PageHeader, SECTION_STYLE, SectionIcon } from '../components/ui';
import { ViolationCard } from '../components/ViolationCard';
import type { SectionKey } from '../data/types';
import { useScrollHide } from '../lib/useScrollHide';
import { search } from '../search/engine';
import { useApp } from '../store';

export function SectionPage({ sectionKey }: { sectionKey: string }) {
  const app = useApp();
  const sec = app.sections.get(sectionKey);
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [focused, setFocused] = useState(false);
  const hideSearch = useScrollHide(160) && !focused;
  const all = useMemo(() => app.data.violations.filter((v) => v.section === sectionKey), [app.data, sectionKey]);
  const results = useMemo(
    () => (dq.trim() ? search(app.index, dq, 500).filter((h) => h.violation.section === sectionKey) : all.map((v) => ({ violation: v, terms: undefined }))),
    [dq, app.index, all, sectionKey],
  );
  if (!sec) return (<><PageHeader title="قسم غير موجود" /><Empty title="هذا القسم غير موجود" /></>);
  const st = SECTION_STYLE[sec.key as SectionKey];
  return (
    <div className="safe-bottom">
      <PageHeader title={sec.short} subtitle={`${sec.count} ${sec.count >= 3 && sec.count <= 10 ? 'مخالفات' : 'مخالفة'}`} />
      <div className="mx-auto max-w-3xl px-3 pt-3">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 shadow-sm">
          <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${st.bg} ${st.fg}`} style={{ viewTransitionName: `vt-ico-${sec.key}` }}><SectionIcon section={sec.key} className="size-7" /></span>
          <p className="text-[16px] font-bold leading-7" style={{ viewTransitionName: 'vt-sec-title' }}>{sec.title}</p>
        </div>
      </div>
      <div className={`sticky top-[var(--hdr,64px)] z-20 px-3 py-2 transition-[transform,opacity] duration-200 ease-out will-change-transform ${hideSearch ? 'pointer-events-none -translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="mx-auto max-w-3xl"><SearchBar value={q} onChange={setQ} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={`ابحث داخل ${sec.short}…`} /></div>
      </div>
      <main className="mx-auto flex max-w-3xl flex-col gap-2.5 px-3 pt-1">
        {results.length ? results.map((h, i) => <ViolationCard key={h.violation.id} v={h.violation} terms={h.terms} query={dq.trim() || undefined} index={i} showSection={false} />)
          : <Empty title="لا توجد نتائج في هذا القسم" />}
      </main>
    </div>
  );
}
