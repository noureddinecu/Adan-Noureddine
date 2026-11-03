import { Clock, Download, Flame, History, Moon, SearchX, Star, Sun, X, Zap } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { Card, Empty, Logo, OrnamentTitle, SECTION_STYLE, SectionIcon, SectionTitle } from '../components/ui';
import { ViolationCard } from '../components/ViolationCard';
import type { SectionKey } from '../data/types';
import { morph, navigate, type Route } from '../lib/router';
import { useInstall, useOnline } from '../lib/pwa';
import { useScrollHide } from '../lib/useScrollHide';
import { search } from '../search/engine';
import { useApp } from '../store';

const countWord = (n: number) => (n >= 3 && n <= 10 ? 'مخالفات' : 'مخالفة');

const SHORTCUTS = ['السرعة', 'الوقوف', 'حزام السلامة', 'الهاتف', 'الكحول', 'الطريق السيار', 'رخصة السياقة', 'شهادة التسجيل', 'التأمين', 'المراقبة التقنية', 'الحمولة', 'خوذة', 'المادة 184', 'ceinture'];

export function Home({ route, theme }: { route: Route; theme: { dark: boolean; toggle: () => void } }) {
  const app = useApp();
  const [q, setQ] = useState(route.query.get('q') ?? '');
  const [filter, setFilter] = useState<SectionKey | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const dq = useDeferredValue(q);
  const online = useOnline();
  const scrolledDown = useScrollHide(140);
  const [focused, setFocused] = useState(false);
  const hideSearch = scrolledDown && !focused;
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
  const ORDER: SectionKey[] = ['deg1', 'deg2', 'deg3', 'admin', 'delit', 'art94', 'stop'];
  const CARD_TITLE: Partial<Record<SectionKey, string>> = { art94: 'مخالفات الراجلين', stop: 'مسطرة التوقيف' };
  const tiles = [
    ...ORDER.map((k) => app.sections.get(k)!).filter(Boolean).map((s) => ({
      key: s.key, to: `/section/${s.key}`, title: CARD_TITLE[s.key] ?? s.short, count: s.count,
      color: `var(--color-${s.key})`, tile: `${SECTION_STYLE[s.key].bg} ${SECTION_STYLE[s.key].fg}`,
      icon: <SectionIcon section={s.key} className="size-6" />,
    })),
    { key: 'fav', to: '/favorites', title: 'المفضلة', count: app.user.favorites.length, color: 'var(--color-gold)', tile: 'bg-gold text-white', icon: <Star className="size-6 fill-current" /> },
  ];

  return (
    <div className="safe-bottom">
      <header className="home-hero relative text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="relative z-10 mx-auto flex max-w-3xl items-center gap-3 px-4 pb-6 pt-8">
          <Logo tile className="size-[72px] ring-4 ring-white/90" />
          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-[clamp(21px,6.2vw,27px)] font-bold leading-tight drop-shadow-sm">دليل المراقبة الطرقية</h1>
            <div className="my-1.5 flex items-center justify-center gap-2" aria-hidden>
              <span className="h-px w-[18%] bg-gradient-to-l from-white/0 to-white/80" />
              <span className="h-[3px] w-[10%] rounded-full bg-accent" />
              <Star className="size-4 text-white" strokeWidth={2.2} />
              <span className="h-[3px] w-[10%] rounded-full bg-accent" />
              <span className="h-px w-[18%] bg-gradient-to-r from-white/0 to-white/80" />
            </div>
            <p className="text-[clamp(13.5px,3.9vw,15.5px)] font-medium leading-6 text-white/90">الخاص بأعوان الشرطة محرري المحاضر</p>
          </div>
          <button onClick={theme.toggle} className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-md" aria-label={theme.dark ? 'الوضع النهاري' : 'الوضع الليلي'}>
            {theme.dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </div>
        <svg className="hero-curve" viewBox="0 0 400 44" preserveAspectRatio="none" aria-hidden>
          <path d="M0 0H400V14C300 38 110 36 0 8Z" fill="var(--hdr-bottom)" />
          <path d="M0 8C110 36 300 38 400 14" fill="none" stroke="#fff" strokeWidth="3.2" vectorEffect="non-scaling-stroke" />
          <path d="M0 13C110 41 300 43 400 19" fill="none" stroke="#d81e2b" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
          <path d="M0 18C110 45 300 47 400 24" fill="none" stroke="#0d7a4a" strokeWidth="1.4" opacity=".55" vectorEffect="non-scaling-stroke" />
        </svg>
      </header>
      {!online && <p className="mx-4 mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1 text-xs shadow-sm"><span className="size-2 rounded-full bg-gold" /> دون اتصال — جميع البيانات متاحة محليا</p>}

      <div className={`sticky top-0 z-30 mt-1 px-3 pb-2 pt-[max(env(safe-area-inset-top),0px)] transition-[transform,opacity] duration-200 ease-out will-change-transform ${hideSearch ? 'pointer-events-none -translate-y-[130%] opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="mx-auto max-w-3xl">
          <SearchBar ref={inputRef} large value={q} onChange={setQ} onSubmit={() => app.addSearch(q)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-3">
        {searching ? (
          <section aria-live="polite">
            <div className="mb-2 mt-1 flex items-center justify-between pe-1 ps-7 text-[14px] text-[var(--muted)]">
              <span><b className="text-[var(--text)]">{hits.length}</b> نتيجة</span>
              <span className="ltr-nums">{ms < 1 ? '<1' : ms.toFixed(0)} ms</span>
            </div>
            {counts.size > 1 && (
              <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3">
                {(['all', ...app.data.sections.map((s) => s.key).filter((k) => counts.has(k))] as const).map((k) => {
                  const active = filter === k;
                  return (
                    <button key={k} onClick={() => setFilter(k)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[14px] font-medium transition ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'}`}>
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
                <div className="flex-1 text-sm"><b>ثبّت التطبيق على هاتفك</b><p className="text-[13.5px] text-[var(--muted)]">للوصول السريع والعمل الكامل دون إنترنت</p></div>
                <button onClick={install.install} className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-bold text-white">تثبيت</button>
              </Card>
            )}

            {app.user.searches.length > 0 && (
              <>
                <SectionTitle icon={<Clock className="size-4.5 text-brand-600 dark:text-brand-100" />} action={<button onClick={app.clearSearches} className="text-[13.5px] text-[var(--muted)]">مسح</button>}>عمليات البحث الأخيرة</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {app.user.searches.slice(0, 8).map((s) => (
                    <span key={s.q} className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[14.5px]">
                      <button onClick={() => { setQ(s.q); inputRef.current?.focus(); }} className="py-1.5 pr-3 pl-1">{s.q}</button>
                      <button onClick={() => app.removeSearch(s.q)} className="grid size-7 place-items-center text-[var(--muted)]" aria-label={`حذف ${s.q}`}><X className="size-3.5" /></button>
                    </span>
                  ))}
                </div>
              </>
            )}

            <OrnamentTitle>أقسام المخالفات</OrnamentTitle>
            <div className="grid auto-rows-fr grid-cols-2 gap-3.5 sm:grid-cols-4">
              {tiles.map((t, i) => (
                <button
                  key={t.key}
                  onClick={(e) => { morph(e.currentTarget.querySelector('[data-morph=title]'), 'vt-sec-title'); navigate(t.to); }}
                  className="sec-card anim-in group"
                  style={{ animationDelay: `${i * 45}ms`, '--sec': t.color } as React.CSSProperties}
                >
                  <span className="sec-card-zellige" aria-hidden />
                  <span className={`relative grid size-[52px] place-items-center rounded-2xl shadow-md transition group-hover:scale-105 ${t.tile}`} style={{ viewTransitionName: `vt-ico-${t.key}` }}>{t.icon}</span>
                  <span data-morph="title" className="relative mt-3 line-clamp-2 text-[17.5px] font-bold leading-7 text-[var(--text)]">{t.title}</span>
                  <span className="relative mt-auto inline-flex items-baseline gap-1.5 rounded-full bg-[var(--surface-2)] px-4 py-1">
                    <span className="ltr-nums text-[21px] font-bold leading-7 text-[var(--text)]">{t.count}</span>
                    <span className="text-[13.5px] font-medium text-[var(--muted)]">{countWord(t.count)}</span>
                  </span>
                </button>
              ))}
            </div>

            <SectionTitle icon={<Zap className="size-4.5 text-gold" />}>اختصارات البحث السريع</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((s) => (
                <button key={s} onClick={() => setQ(s)} className="rounded-full bg-brand-50 px-3 py-1.5 text-[14.5px] font-medium text-brand-700 transition hover:bg-brand-100 dark:bg-brand-900 dark:text-brand-100" dir="auto">{s}</button>
              ))}
            </div>

            {recent.length > 0 && (
              <>
                <SectionTitle icon={<History className="size-4.5 text-brand-600 dark:text-brand-100" />} action={<button onClick={() => navigate('/history')} className="text-[13.5px] font-medium text-brand-600 dark:text-brand-100">عرض الكل</button>}>آخر ما تمت معاينته</SectionTitle>
                <div className="flex flex-col gap-2.5">{recent.map((v, i) => <ViolationCard key={v!.id} v={v!} index={i} />)}</div>
              </>
            )}
            {favs.length > 0 && (
              <>
                <SectionTitle icon={<Star className="size-4.5 fill-gold text-gold" />} action={<button onClick={() => navigate('/favorites')} className="text-[13.5px] font-medium text-brand-600 dark:text-brand-100">عرض الكل</button>}>المفضلة</SectionTitle>
                <div className="flex flex-col gap-2.5">{favs.map((v, i) => <ViolationCard key={v!.id} v={v!} index={i} />)}</div>
              </>
            )}
            {top.length > 0 && (
              <>
                <SectionTitle icon={<Flame className="size-4.5 text-accent" />}>الأكثر استعمالا</SectionTitle>
                <div className="flex flex-col gap-2.5">{top.map((v, i) => <ViolationCard key={v!.id} v={v!} index={i} />)}</div>
              </>
            )}
            <p className="mt-8 px-4 text-center text-[13px] leading-5 text-[var(--muted)]">
              المصدر: {app.data.source.title} — {app.data.source.edition}.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
