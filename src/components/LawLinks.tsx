import { BookOpen, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { articleUrl } from '../data/law';
import { androidBridge } from '../lib/pwa';
import { useApp } from '../store';

/** One button per article of the road code, opening the official text at that article. */
export function LawLinks({ articles, title = 'فتح النص الرسمي عند المادة' }: { articles: string[]; title?: string }) {
  const { law } = useApp();
  const [hint, setHint] = useState<{ article: string; page: number | null } | null>(null);
  if (!articles.length) return null;

  const open = async (article: string) => {
    const { url, page } = articleUrl(law, article);
    setHint({ article, page });
    if (!page) {
      // viewer may ignore the search fragment (e.g. mobile): copy the search term as a fallback
      const term = `المادة ${article}`;
      try { if (androidBridge) androidBridge.copy(term); else await navigator.clipboard?.writeText(term); } catch { /* ignore */ }
    }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--muted)]"><BookOpen className="size-4" />{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {articles.map((a) => {
          const page = law.pages[a];
          return (
            <button key={a} onClick={() => open(a)} className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-[var(--surface)] px-3 py-1.5 text-[14px] font-semibold text-brand-700 shadow-sm active:scale-95 dark:text-brand-100">
              <ExternalLink className="size-4" />المادة <span className="ltr-nums">{a}</span>
              {page ? <span className="text-[12px] font-medium text-[var(--muted)]">· ص <span className="ltr-nums">{page}</span></span> : null}
            </button>
          );
        })}
      </div>
      {hint && (
        <p className="mt-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[13.5px] leading-7">
          {hint.page
            ? <>فُتح النص الرسمي في الصفحة <b className="ltr-nums">{hint.page}</b> حيث توجد المادة <b className="ltr-nums">{hint.article}</b>.</>
            : <>فُتح النص الرسمي مع البحث عن «المادة <b className="ltr-nums">{hint.article}</b>». إذا لم ينتقل العارض تلقائيا، فقد نُسخت عبارة «المادة {hint.article}»: الصقها في خانة البحث داخل عارض PDF.</>}
        </p>
      )}
    </div>
  );
}
