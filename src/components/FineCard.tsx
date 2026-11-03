import { AlertOctagon, ExternalLink, Info, ShieldAlert } from 'lucide-react';
import { fineFor } from '../data/fines';
import type { Violation } from '../data/types';
import { useApp } from '../store';

const money = (n: number) => n.toLocaleString('fr-MA').replace(/\u202f/g, ' ');

export function OfficialLink({ label }: { label?: string }) {
  const { fines } = useApp();
  const src = fines.sources.code;
  if (!src) return null;
  return (
    <a href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 underline decoration-dotted underline-offset-4 dark:text-brand-100">
      <ExternalLink className="size-3.5" />{label ?? 'النص الرسمي (الأمانة العامة للحكومة)'}
    </a>
  );
}

export function FineCard({ v }: { v: Violation }) {
  const { fines } = useApp();
  const cat = fineFor(fines, v);
  if (!cat) return <p className="text-[15px] text-[var(--muted)]">لا توجد معطيات عن الغرامة لهذا التصنيف.</p>;

  if (cat.type !== 'transactional' || !cat.amounts) {
    const Icon = cat.type === 'penal' ? ShieldAlert : cat.type === 'administrative' ? Info : AlertOctagon;
    return (
      <div>
        <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)] p-3.5">
          <Icon className="mt-1 size-5 shrink-0 text-accent" />
          <div className="text-[15px] leading-7">
            <p className="font-bold">{cat.type === 'penal' ? 'جنحة — لا تطبق أسعار الغرامات التصالحية' : cat.type === 'administrative' ? 'مخالفة إدارية — لا تطبق أسعار الدرجات' : 'لا يوجد مبلغ معتمد'}</p>
            <p className="text-[var(--muted)]">{cat.note}</p>
            <p className="mt-1.5 text-[14px]"><b>المرجع:</b> {cat.ref}</p>
            <div className="mt-1.5"><OfficialLink /></div>
          </div>
        </div>
        {cat.extraNote && <p className="mt-2 rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[15px] leading-7 dark:bg-amber-950/30">{cat.extraNote}</p>}
      </div>
    );
  }

  const a = cat.amounts;
  const tiles = [
    { k: 'h24', label: 'خلال 24 ساعة', value: a.h24, tone: 'from-brand-600 to-brand-700 text-white' },
    { k: 'd15', label: 'خلال 15 يوما', value: a.d15, tone: 'from-gold to-amber-600 text-white' },
    { k: 'base', label: 'الغرامة الأصلية', value: a.base, tone: 'from-accent to-red-700 text-white' },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.k} className={`relative overflow-hidden rounded-xl bg-gradient-to-b p-2.5 text-center shadow-sm ${t.tone}`}>
            <p className="text-[13px] font-semibold opacity-90">{t.label}</p>
            <p className="ltr-nums mt-1 text-[24px] font-bold leading-none">{money(t.value)}</p>
            <p className="mt-1 text-[13px] opacity-90">درهم</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
        <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-semibold">{cat.label} · {cat.ref}</span>
        <OfficialLink label="فتح النص الرسمي" />
      </div>
      {cat.extraNote && <p className="mt-3 rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[15px] leading-7 dark:bg-amber-950/30">{cat.extraNote}</p>}

    </div>
  );
}
