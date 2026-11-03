import { Clock, History, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Card, Empty, PageHeader, SectionTitle } from '../components/ui';
import { ViolationCard } from '../components/ViolationCard';
import { navigate } from '../lib/router';
import { useApp } from '../store';

function when(at: number) {
  const d = (Date.now() - at) / 1000;
  if (d < 60) return 'الآن';
  if (d < 3600) return `منذ ${Math.floor(d / 60)} د`;
  if (d < 86400) return `منذ ${Math.floor(d / 3600)} س`;
  return new Date(at).toLocaleDateString('ar-MA', { day: 'numeric', month: 'short' });
}

export function HistoryPage() {
  const app = useApp();
  const [tab, setTab] = useState<'views' | 'searches'>('views');
  const views = app.user.history.filter((h) => app.byId.has(h.id));
  return (
    <div className="safe-bottom">
      <PageHeader back={false} title="السجل" subtitle="المخالفات المعاينة وعمليات البحث السابقة" />
      <main className="mx-auto max-w-3xl px-3 pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-2)] p-1">
          {([['views', 'المعاينة', History], ['searches', 'عمليات البحث', Search]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold transition ${tab === k ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--muted)]'}`}><Icon className="size-4" />{label}</button>
          ))}
        </div>
        {tab === 'views' ? (
          views.length ? (
            <>
              <SectionTitle action={<button onClick={() => confirm('مسح سجل المعاينة؟') && app.clearHistory()} className="text-[12.5px] text-[var(--muted)]">مسح السجل</button>}>{views.length} مخالفة</SectionTitle>
              <div className="flex flex-col gap-2.5">
                {views.map((h, i) => (
                  <div key={h.id}>
                    <p className="mb-1 px-1 text-[11.5px] text-[var(--muted)]">{when(h.at)} · {app.user.views[h.id] ?? 1} معاينة</p>
                    <ViolationCard v={app.byId.get(h.id)!} index={i} />
                  </div>
                ))}
              </div>
            </>
          ) : <Empty icon={<History className="size-8" />} title="لا يوجد سجل بعد" text="ستظهر هنا المخالفات التي تطلع على تفاصيلها." />
        ) : app.user.searches.length ? (
          <>
            <SectionTitle action={<button onClick={app.clearSearches} className="text-[12.5px] text-[var(--muted)]">مسح الكل</button>}>{app.user.searches.length} عملية بحث</SectionTitle>
            <Card>
              {app.user.searches.map((s) => (
                <div key={s.q} className="flex items-center border-b border-[var(--line)] last:border-0">
                  <button onClick={() => navigate(`/?q=${encodeURIComponent(s.q)}`)} className="flex flex-1 items-center gap-3 px-4 py-3 text-right">
                    <Clock className="size-4 text-[var(--muted)]" /><span className="flex-1 text-[15px]" dir="auto">{s.q}</span><span className="text-[11.5px] text-[var(--muted)]">{when(s.at)}</span>
                  </button>
                  <button onClick={() => app.removeSearch(s.q)} className="grid size-11 place-items-center text-[var(--muted)]" aria-label="حذف"><X className="size-4" /></button>
                </div>
              ))}
            </Card>
          </>
        ) : <Empty icon={<Search className="size-8" />} title="لا توجد عمليات بحث محفوظة" />}
      </main>
    </div>
  );
}
