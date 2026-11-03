import { useDeferredValue, useMemo, useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { Empty, PageHeader, SECTION_STYLE, SectionIcon } from '../components/ui';
import { ViolationCard } from '../components/ViolationCard';
import type { SectionKey } from '../data/types';
import { search } from '../search/engine';
import { useApp } from '../store';

export function SectionPage({ sectionKey }: { sectionKey: string }) {
  const app = useApp();
  const sec = app.sections.get(sectionKey);
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const all = useMemo(() => app.data.violations.filter((v) => v.section === sectionKey), [app.data, sectionKey]);
  const results = useMemo(
    () => (dq.trim() ? search(app.index, dq, 500).filter((h) => h.violation.section === sectionKey) : all.map((v) => ({ violation: v, terms: undefined }))),
    [dq, app.index, all, sectionKey],
  );
  if (!sec) return (<><PageHeader title="قسم غير موجود" /><Empty title="هذا القسم غير موجود" /></>);
  const st = SECTION_STYLE[sec.key as SectionKey];
  return (
    <div className="safe-bottom">
      <PageHeader title={sec.short} subtitle={`${sec.count} مخالفة · صفحات ${sec.firstPdfPage}–${sec.lastPdfPage} من الدليل`} />
      <div className={`${st.bg} ${st.fg}`}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-black/10"><SectionIcon section={sec.key} className="size-7" /></span>
          <p className="text-[15px] font-bold leading-7">{sec.title}</p>
        </div>
      </div>
      <div className="sticky top-[67px] z-20 bg-[var(--bg)]/90 px-3 py-2 backdrop-blur">
        <div className="mx-auto max-w-3xl"><SearchBar value={q} onChange={setQ} placeholder={`ابحث داخل ${sec.short}…`} /></div>
      </div>
      <main className="mx-auto flex max-w-3xl flex-col gap-2.5 px-3 pt-1">
        {results.length ? results.map((h, i) => <ViolationCard key={h.violation.id} v={h.violation} terms={h.terms} query={dq.trim() || undefined} index={i} showSection={false} />)
          : <Empty title="لا توجد نتائج في هذا القسم" />}
      </main>
    </div>
  );
}
