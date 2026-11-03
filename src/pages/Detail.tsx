import { Banknote, ClipboardList, Copy, Scale, Share2, Star } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FineCard } from '../components/FineCard';
import { LawLinks } from '../components/LawLinks';
import { codeArticles } from '../data/law';
import { fineFor } from '../data/fines';
import { Card, CodeBadge, Empty, Hl, PageHeader, SECTION_STYLE, SectionIcon } from '../components/ui';
import { androidBridge } from '../lib/pwa';
import { navigate } from '../lib/router';
import { search } from '../search/engine';
import { useApp } from '../store';

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="zellige-corner anim-in overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">{icon}</span>
        <h2 className="text-[16.5px] font-bold">{title}</h2>
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-dashed border-[var(--line)] py-2.5 last:border-0">
      <dt className="mb-1 text-[13.5px] font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="text-[16px] leading-8">{children}</dd>
    </div>
  );
}

function isHeading(line: string) {
  return /^في حالة (سائق|مركبة)/.test(line) && !/^\d/.test(line) && line.length < 80;
}

export function Detail({ id, q }: { id: string; q: string }) {
  const app = useApp();
  const v = app.byId.get(id);
  const [copied, setCopied] = useState(false);
  const [pop, setPop] = useState(false);

  useEffect(() => { if (v) { app.recordView(v.id); } /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { if (q) app.addSearch(q); /* eslint-disable-next-line */ }, [q]);

  const terms = useMemo(() => (q && v ? search(app.index, q, 500).find((h) => h.violation.id === v.id)?.terms : undefined), [q, v, app.index]);

  if (!v) return (<><PageHeader title="غير موجودة" /><Empty title="هذه المخالفة غير موجودة" /></>);
  const sec = app.sections.get(v.section)!;
  const st = SECTION_STYLE[v.section];
  const fav = app.isFavorite(v.id);
  const fine = fineFor(app.fines, v);
  const seen = new Set<string>();
  const legalLines = v.legalRefs.filter((r) => { const k = r.replace(/^[-\s]+/, '').replace(/\s+/g, ' ').trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  const codeArts = codeArticles(v);
  const fineArts = fine?.type === 'transactional' ? (fine.ref.match(/\d{1,3}/g) ?? []) : [];
  const extraFine = fineArts.filter((a) => !codeArts.includes(a));
  if (extraFine.length) legalLines.push(`- ${fine!.ref} (الغرامات التصالحية والجزافية)`);
  const lawArticles = [...new Set([...codeArts, ...extraFine])];

  const plain = [
    `الرمز: ${v.codeRaw}`, `التصنيف: ${sec.title}`, `توصيف المخالفة: ${v.description}`,
    `المرجع القانوني:\n${v.legalRefs.join('\n')}`, `المسطرة:\n${v.procedure.join('\n')}`,
  ].join('\n\n');

  const copy = async () => {
    try {
      if (androidBridge) androidBridge.copy(plain); else await navigator.clipboard.writeText(plain);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };
  const share = async () => {
    if (androidBridge) androidBridge.share(`${v.code} — ${sec.short}`, plain);
    else if (navigator.share) { try { await navigator.share({ title: `${v.code} — ${sec.short}`, text: plain }); } catch { /* cancelled */ } }
    else copy();
  };

  return (
    <div className="safe-bottom">
      <PageHeader title={v.code} subtitle={sec.title} right={
        <button onClick={() => { app.toggleFavorite(v.id); setPop(true); setTimeout(() => setPop(false), 400); }} className="brand-btn" aria-label={fav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'} aria-pressed={fav}>
          <Star className={`size-5 ${fav ? 'fill-gold text-gold' : ''} ${pop ? 'anim-pop' : ''}`} />
        </button>
      } />

      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-3 pt-3">
        {/* Hero */}
        <Card className="anim-in overflow-hidden">
          <div className={`flex items-center gap-2 border-t-4 px-4 py-2.5 ${st.soft}`} style={{ borderTopColor: `var(--color-${v.section})` }}>
            <SectionIcon section={v.section} className="size-5" />
            <span className="text-[14.5px] font-bold">{sec.title}</span>
          </div>
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex" style={{ viewTransitionName: 'vt-code' }}><CodeBadge code={v.code} section={v.section} /></span>
              {v.relatedCodes.map((c) => (
                <button key={c} onClick={() => navigate(`/?q=${c}`)} className="ltr-nums rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-[14px] font-bold">+ {c}</button>
              ))}
              {v.codeNote && <span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[14px] font-semibold">+ {v.codeNote}</span>}
            </div>
            <p className="legal whitespace-pre-line text-[19px] font-bold" style={{ viewTransitionName: 'vt-desc' }}><Hl text={v.description} terms={terms} /></p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => app.toggleFavorite(v.id)} className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-[13.5px] font-semibold transition ${fav ? 'border-gold bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'border-[var(--line)]'}`}>
                <Star className={`size-5 ${fav ? 'fill-gold text-gold' : ''}`} />{fav ? 'في المفضلة' : 'أضف للمفضلة'}
              </button>
              <button onClick={copy} className="flex flex-col items-center gap-1 rounded-xl border border-[var(--line)] py-2 text-[13.5px] font-semibold"><Copy className="size-5" />{copied ? 'تم النسخ ✓' : 'نسخ'}</button>
              <button onClick={share} className="flex flex-col items-center gap-1 rounded-xl border border-[var(--line)] py-2 text-[13.5px] font-semibold"><Share2 className="size-5" />مشاركة</button>
            </div>
          </div>
        </Card>

        <Block icon={<ClipboardList className="size-4.5" />} title="الإجراءات">
          <dl>
            <Row label="المسطرة الواجب اتباعها">
              <ol className="legal space-y-2.5">
                {v.procedure.map((p, i) =>
                  isHeading(p) ? (
                    <li key={i} className="mt-3 rounded-lg bg-brand-50 px-3 py-1.5 text-[15px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-100">{p}</li>
                  ) : p.startsWith('ملاحظة') || p.startsWith('(ملاحظة') ? (
                    <li key={i} className="rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[16px] dark:bg-amber-950/30"><Hl text={p} terms={terms} /></li>
                  ) : (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-3.5 size-2 shrink-0 rounded-full bg-brand-500" />
                      <span><Hl text={p} terms={terms} /></span>
                    </li>
                  ),
                )}
              </ol>
            </Row>
          </dl>
        </Block>

        <Block icon={<Banknote className="size-4.5" />} title="العقوبات">
          <FineCard v={v} />
        </Block>

        <Block icon={<Scale className="size-4.5" />} title="النصوص المنظمة">
          <ul className="space-y-1.5">
            {legalLines.map((r, i) => <li key={i} className="legal rounded-lg bg-[var(--surface-2)] px-3 py-2"><Hl text={r} terms={terms} /></li>)}
          </ul>
          {lawArticles.length > 0 && (
            <div className="mt-4 border-t border-dashed border-[var(--line)] pt-3">
              <LawLinks articles={lawArticles} />
            </div>
          )}
        </Block>


      </main>
    </div>
  );
}
