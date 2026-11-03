import { ChevronLeft, Star } from 'lucide-react';
import type { Violation } from '../data/types';
import { fineFor } from '../data/fines';
import { navigate } from '../lib/router';
import { highlight } from '../search/engine';
import { useApp } from '../store';
import { CodeBadge, Hl, SECTION_STYLE, SectionIcon } from './ui';

function matchedLine(lines: string[], terms?: Set<string>) {
  if (!terms?.size) return null;
  return lines.find((l) => highlight(l, terms).some((s) => s.hit)) ?? null;
}

export function ViolationCard({ v, terms, query, index = 0, showSection = true }: { v: Violation; terms?: Set<string>; query?: string; index?: number; showSection?: boolean }) {
  const { sections, isFavorite, fines } = useApp();
  const fine = fineFor(fines, v);
  const sec = sections.get(v.section)!;
  const descHit = terms && highlight(v.description, terms).some((s) => s.hit);
  const refLine = !descHit ? matchedLine(v.legalRefs, terms) : null;
  const procLine = !descHit && !refLine ? matchedLine(v.procedure, terms) : null;
  const href = `/v/${v.id}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  return (
    <button
      onClick={() => navigate(href)}
      className="anim-in group relative flex w-full items-stretch overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-right shadow-[0_1px_2px_rgba(0,0,0,.05)] transition hover:shadow-md active:scale-[.99]"
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
    >
      <span className={`w-1.5 shrink-0 ${SECTION_STYLE[v.section].bg}`} />
      <span className="min-w-0 flex-1 p-3.5">
        <span className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <CodeBadge code={v.code} section={v.section} small />
          {v.relatedCodes.map((c) => (
            <span key={c} className="ltr-nums rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">+ {c}</span>
          ))}
          {isFavorite(v.id) && <Star className="size-4 fill-gold text-gold" aria-label="في المفضلة" />}
        </span>
        <span className="line-clamp-3 block text-[15px] font-semibold leading-7 text-[var(--text)]">
          <Hl text={v.description} terms={terms} />
        </span>
        {(refLine || procLine) && (
          <span className="mt-1.5 line-clamp-2 block rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] leading-6 text-[var(--muted)]">
            <b className="text-[var(--text)]">{refLine ? 'المرجع: ' : 'المسطرة: '}</b>
            <Hl text={(refLine ?? procLine)!} terms={terms} />
          </span>
        )}
        <span className="mt-2 flex items-center gap-2 text-[12px] text-[var(--muted)]">
          {showSection && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${SECTION_STYLE[v.section].soft}`}>
              <SectionIcon section={v.section} className="size-3.5" /> {sec.short}
            </span>
          )}
          <span>ص {v.pdfPage}</span>
          {fine?.type === 'transactional' && fine.amounts && <span className="ltr-nums mr-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-bold text-[var(--text)]">{fine.amounts.base} درهم</span>}
        </span>
      </span>
      <ChevronLeft className="m-auto ml-2 size-5 shrink-0 text-[var(--muted)] opacity-60 transition group-hover:-translate-x-0.5" />
    </button>
  );
}
