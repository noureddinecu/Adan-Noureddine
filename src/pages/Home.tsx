import { Clock, Download, Flame, History, Moon, SearchX, Star, Sun, X, Zap } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { Card, Empty, Logo, SECTION_STYLE, SectionIcon, SectionTitle } from '../components/ui';
import { ViolationCard } from '../components/ViolationCard';
import type { SectionKey } from '../data/types';
import { navigate, type Route } from '../lib/router';
import { useInstall, useOnline } from '../lib/pwa';
import { search } from '../search/engine';
import { useApp } from '../store';

const SHORTCUTS = ['السرعة', 'الوقوف', 'حزام السلامة', 'الهاتف', 'الكحول', 'الطريق السيار', 'رخصة السياقة', 'شهادة التسجيل', 'التأمين', 'المراقبة التقنية', 'الحمولة', 'خوذة', 'المادة 184', 'ceinture'];

export function Home({ route, theme }: { route: Route; theme: { dark: boolean; toggle: () => void } }) {
  const app = useApp();
  const [q, setQ] = useState(route.query.get('q') ?? '');
  const [filter, setFilter] = useState<SectionKey | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const dq = useDeferredValue(q);
  const online = useOnline();
  const install = useInstall();

  // keep the URL in sync (replace, so typing does not flood the history)
  const written = useRef(route.query.get('q') ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      const v = dq.trim();
      if (v === written.current) return;
      written.current = v;
      navigate(v ? `/?q=${encodeURIComponent(v)}` : '/', { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [dq]);
  const urlQ = route.query.get('q') ?? '';
  useEffect(() => {
    // external change only (e.g. back button / shortcut link)
    if (urlQ !== written.current) { written.current = urlQ; setQ(urlQ); }
  }, [urlQ]);
  useEffect(() => setFilter('all'), [dq]);

  const { hits, ms } = useMemo(() => {
    const t = performance.now();
    const hits = dq.trim() ? search(app.index, dq) : [];
    return { hits, ms: performance.now() - t };
  }, [dq, app.index]);
  const counts = useMemo(() => {
    const m = new Map<SectionKey, number>();
    for (const h of hits) m.set(h.violation.section, (m.get(h.violation.section) ?? 0) + 1);
    return m;
  }, [hits]);
  const shown = filter === 'all' ? hits : hits.filter((h) => h.violation.section === filter);
  const searching = q.trim().length > 0;

  const recent = app.user.history.map((h) => app.byId.get(h.id)).filter(Boolean).slice(0, 5);
  const favs = app.user.favorites.map((h) => app.byId.get(h.id)).filter(Boolean).slice(0, 5);
  const top = Object.entries(app.user.views).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([id]) => app.byId.get(id)).filter(Boolean).slice(0, 5);
  const main = app.data.sections.filter((s) => s.main);
  const extra = app.data.sections.filter((s) => !s.main);

  return (
    <div className="safe-bottom">
      <header className="zellige-header relative overflow-hidden bg-gradient-to-bl from-brand-600 via-brand-800 to-brand-900 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-4">
          <div className="flex items-center gap-3">
            <Logo className="size-12 shrink-0 drop-shadow" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[21px] font-bold leading-tight">دليل المراقبة الطرقية</h1>
              <p className="truncate text-[12.5px] text-white/80">الخاص بأعوان الشرطة محرري المحاضر · مدونة السير 52-05</p>
            </div>
            <button onClick={theme.toggle} className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={theme.dark ? 'الوضع النهاري' : 'الوضع الليلي'}>
              {theme.dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
          </div>
          {!online && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs"><span className="size-2 rounded-full bg-gold" /> دون اتصال — جميع البيانات متاحة محليا</p>}
        </div>
        <div className="zellige-band" />
      </header>

      <div className="sticky top-0 z-30 -mt-8 px-3 pb-2 pt-[max(env(safe-area-inset-top),0px)]">
        <div className="mx-auto max-w-3xl">
          <SearchBar ref={inputRef} large value={q} onChange={setQ} onSubmit={() => app.addSearch(q)} />
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-3">
        {searching ? (
          <section aria-live="polite">
            <div className="mb-2 mt-1 flex items-center justify-between px-1 text-[13px] text-[var(--muted)]">
              <span><b className="text-[var(--text)]">{hits.length}</b> نتيجة</span>
              <span className="ltr-nums">{ms < 1 ? '<1' : ms.toFixed(0)} ms</span>
            </div>
            {counts.size > 1 && (
              <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3">
                {(['all', ...app.data.sections.map((s) => s.key).filter((k) => counts.has(k))] as const).map((k) => {
                  const active = filter === k;
                  return (
                    <button key={k} onClick={() => setFilter(k)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'}`}>
                      {k !== 'all' && <span className={`size-2.5 rounded-full ${SECTION_STYLE[k].bg}`} />}
                      {k === 'all' ? 'الكل' : app.sections.get(k)!.short}
                      <span className="opacity-70">{k === 'all' ? hits.length : counts.get(k)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {shown.length ? (
              <div className="flex flex-col gap-2.5">
                {shown.slice(0, 120).map((h, i) => <ViolationCard key={h.violation.id} v={h.violation} terms={h.terms} query={q.trim()} index={i} />)}
              </div>
            ) : (
              <Empty icon={<SearchX className="size-8" />} title="لا توجد نتائج مطابقة" text="جرّب كلمة أقصر، أو رمز المخالفة، أو رقم المادة مثل «المادة 185»." />
            )}
          </section>
        ) : (
          <>
            {install.canInstall && !install.installed && (
              <Card className="mt-3 flex items-center gap-3 p-3">
                <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-800 dark:text-brand-100"><Download className="size-5" /></div>
                <div className="flex-1 text-sm"><b>ثبّت التطبيق على هاتفك</b><p className="text-[12.5px] text-[var(--muted)]">للوصول السريع والعمل الكامل دون إنترنت</p></div>
                <button onClick={install.install} className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-bold text-white">تثبيت</button>
              </Card>
            )}

            {app.user.searches.length > 0 && (
              <>
                <SectionTitle icon={<Clock className="size-4.5 text-brand-600 dark:text-brand-100" />} action={<button onClick={app.clearSearches} className="text-[12.5px] text-[var(--muted)]">مسح</button>}>عمليات البحث الأخيرة</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {app.user.searches.slice(0, 8).map((s) => (
                    <span key={s.q} className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[13.5px]">
                      <button onClick={() => { setQ(s.q); inputRef.current?.focus(); }} className="py-1.5 pr-3 pl-1">{s.q}</button>
                      <button onClick={() => app.removeSearch(s.q)} className="grid size-7 place-items-center text-[var(--muted)]" aria-label={`حذف ${s.q}`}><X className="size-3.5" /></button>
                    </span>
                  ))}
                </div>
              </>
            )}

            <SectionTitle>أقسام المخالفات</SectionTitle>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {main.map((s, i) => (
                <button key={s.key} onClick={() => navigate(`/section/${s.key}`)} className={`zellige-corner anim-in group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 text-right shadow-sm transition hover:shadow-md active:scale-[.98] ${i === main.length - 1 && main.length % 2 ? 'col-span-2 sm:col-span-1' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
                  <span className={`absolute -left-6 -top-6 size-20 rounded-full opacity-15 ${SECTION_STYLE[s.key].bg}`} />
                  <span className={`mb-3 grid size-11 place-items-center rounded-xl shadow-sm ${SECTION_STYLE[s.key].bg} ${SECTION_STYLE[s.key].fg}`}><SectionIcon section={s.key} className="size-6" /></span>
                  <span className="block text-[15px] font-bold leading-6">{s.short}</span>
                  <span className="text-[12.5px] text-[var(--muted)]"><b className="text-[var(--text)]">{s.count}</b> مخالفة</span>
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex flex-col gap-2">
              {extra.map((s) => (
                <button key={s.key} onClick={() => navigate(`/section/${s.key}`)} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-right shadow-sm active:scale-[.99]">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${SECTION_STYLE[s.key].bg} ${SECTION_STYLE[s.key].fg}`}><SectionIcon section={s.key} className="size-5" /></span>
                  <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-6">{s.title}</span>
                  <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[12.5px] font-bold">{s.count}</span>
                </button>
              ))}
            </div>

            <SectionTitle icon={<Zap className="size-4.5 text-gold" />}>اختصارات البحث السريع</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((s) => (
                <button key={s} onClick={() => setQ(s)} className="rounded-full bg-brand-50 px-3 py-1.5 text-[13.5px] font-medium text-brand-700 transition hover:bg-brand-100 dark:bg-brand-900 dark:text-brand-100" dir="auto">{s}</button>
              ))}
            </div>

            {recent.length > 0 && (
              <>
                <SectionTitle icon={<History className="size-4.5 text-brand-600 dark:text-brand-100" />} action={<button onClick={() => navigate('/history')} className="text-[12.5px] font-medium text-brand-600 dark:text-brand-100">عرض الكل</button>}>آخر ما تمت معاينته</SectionTitle>
                <div className="flex flex-col gap-2.5">{recent.map((v, i) => <ViolationCard key={v!.id} v={v!} index={i} />)}</div>
              </>
            )}
            {favs.length > 0 && (
              <>
                <SectionTitle icon={<Star className="size-4.5 fill-gold text-gold" />} action={<button onClick={() => navigate('/favorites')} className="text-[12.5px] font-medium text-brand-600 dark:text-brand-100">عرض الكل</button>}>المفضلة</SectionTitle>
                <div className="flex flex-col gap-2.5">{favs.map((v, i) => <ViolationCard key={v!.id} v={v!} index={i} />)}</div>
              </>
            )}
            {top.length > 0 && (
              <>
                <SectionTitle icon={<Flame className="size-4.5 text-accent" />}>الأكثر استعمالا</SectionTitle>
                <div className="flex flex-col gap-2.5">{top.map((v, i) => <ViolationCard key={v!.id} v={v!} index={i} />)}</div>
              </>
            )}
            <p className="mt-8 px-4 text-center text-[11.5px] leading-5 text-[var(--muted)]">
              المصدر: {app.data.source.title} — {app.data.source.edition}. جميع المعطيات مستخرجة حصريا من الدليل.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
