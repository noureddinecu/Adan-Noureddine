import { AlertOctagon, Info, ShieldAlert } from 'lucide-react';
import { LawLinks } from './LawLinks';
import { fineFor } from '../data/fines';
import type { Violation } from '../data/types';
import { useApp } from '../store';

const money = (n: number) => n.toLocaleString('fr-MA').replace(/\u202f/g, ' ');

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
      <p className="mt-2 text-[13.5px]"><span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-semibold">{cat.label} · {cat.ref}</span></p>
      <div className="mt-3"><LawLinks articles={(cat.ref.match(/\d{1,3}/g) ?? []).filter((n, i, arr) => arr.indexOf(n) === i)} title="فتح النص الرسمي عند مادة الغرامة" /></div>
      {cat.extraNote && <p className="mt-3 rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[15px] leading-7 dark:bg-amber-950/30">{cat.extraNote}</p>}

    </div>
  );
}
