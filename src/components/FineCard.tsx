import { AlertOctagon, Info, ShieldAlert } from 'lucide-react';
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
          </div>
        </div>
        {cat.extraNote && <p className="mt-2 rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[15px] leading-7 dark:bg-amber-950/30">{cat.extraNote}</p>}
      </div>
    );
  }

  const a = cat.amounts;
  const tone: Record<string, string> = { h24: 'bg-brand-600', d15: 'bg-gold', base: 'bg-accent' };
  const when: Record<string, string> = {
    h24: 'عند الأداء الفوري أو داخل 24 ساعة',
    d15: 'عند الأداء بعد 24 ساعة وداخل 15 يوما',
    base: 'عند الأداء بعد 15 يوما وداخل أجل الأداء القانوني',
  };

  return (
    <div>
      <div className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3.5 py-3">
        <span className="text-[15px] font-semibold">المبلغ الأصلي للغرامة</span>
        <span className="ltr-nums text-[22px] font-bold">{money(a.base)} <span className="text-[14px] font-semibold">درهم</span></span>
      </div>
      <p className="mb-2 mt-4 text-[14px] font-semibold text-[var(--muted)]">المبلغ المستحق حسب تاريخ الأداء</p>
      <ol className="overflow-hidden rounded-xl border border-[var(--line)]">
        {fines.tiers.map((t) => (
          <li key={t.key} className="flex items-center gap-3 border-b border-[var(--line)] px-3.5 py-3 last:border-0">
            <span className={`h-10 w-1.5 shrink-0 rounded-full ${tone[t.amount] ?? 'bg-brand-600'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-semibold leading-7">{t.label.split(' — ')[0]}</span>
              <span className="block text-[13px] leading-6 text-[var(--muted)]">{when[t.amount]}</span>
            </span>
            <span className="ltr-nums shrink-0 text-[20px] font-bold">{money(a[t.amount])} <span className="text-[13px] font-semibold">درهم</span></span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[13.5px] text-[var(--muted)]">{cat.label}</p>
      {cat.extraNote && <p className="mt-3 rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[15px] leading-7 dark:bg-amber-950/30">{cat.extraNote}</p>}
    </div>
  );
}
