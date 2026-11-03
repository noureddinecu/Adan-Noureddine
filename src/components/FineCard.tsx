import { AlertOctagon, CalendarClock, ExternalLink, Info, ShieldAlert, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { calculate, fineFor } from '../data/fines';
import type { Violation } from '../data/types';
import { useApp } from '../store';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = (d: Date) => d.toLocaleDateString('ar-MA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d: Date) => d.toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
const money = (n: number) => n.toLocaleString('fr-MA').replace(/ /g, ' ');

function remaining(ms: number) {
  const h = Math.floor(ms / 3600_000);
  if (h < 48) return `${h} ساعة و${Math.floor((ms % 3600_000) / 60_000)} دقيقة`;
  return `${Math.floor(h / 24)} يوما`;
}

export function OfficialLink({ label }: { label?: string }) {
  const { fines } = useApp();
  const src = fines.sources.code;
  if (!src) return null;
  return (
    <a href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 underline decoration-dotted underline-offset-4 dark:text-brand-100">
      <ExternalLink className="size-3.5" />{label ?? 'النص الرسمي (الأمانة العامة للحكومة)'}
    </a>
  );
}

export function FineCard({ v }: { v: Violation }) {
  const { fines } = useApp();
  const cat = fineFor(fines, v);
  const [basis, setBasis] = useState(fines.bases[0]?.key ?? 'commission');
  const [start, setStart] = useState(() => toLocalInput(new Date()));
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const res = useMemo(() => {
    if (!cat || cat.type !== 'transactional' || !start) return null;
    const s = new Date(start), a = at ? new Date(at) : new Date();
    if (isNaN(s.getTime()) || isNaN(a.getTime())) return null;
    return calculate(fines, cat, s, a);
  }, [cat, fines, start, at]);

  if (!cat) return <p className="text-[14px] text-[var(--muted)]">لا توجد معطيات عن الغرامة لهذا التصنيف.</p>;

  const unverified = fines.status !== 'verified';
  const badge = unverified && (
    <details className="mb-3 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
      <summary className="cursor-pointer font-semibold">⚠ جدول غير مطابق بعد مع النص الرسمي (نسخة <span className="ltr-nums">{fines.version}</span>)</summary>
      <p className="mt-1">{fines.statusNote}</p>
    </details>
  );

  if (cat.type !== 'transactional' || !cat.amounts) {
    const Icon = cat.type === 'penal' ? ShieldAlert : cat.type === 'administrative' ? Info : AlertOctagon;
    return (
      <div>
        <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)] p-3.5">
          <Icon className="mt-1 size-5 shrink-0 text-accent" />
          <div className="text-[14px] leading-7">
            <p className="font-bold">{cat.type === 'penal' ? 'جنحة — لا تطبق أسعار الغرامات التصالحية' : cat.type === 'administrative' ? 'مخالفة إدارية — لا تطبق أسعار الدرجات' : 'لا يوجد مبلغ معتمد'}</p>
            <p className="text-[var(--muted)]">{cat.note}</p>
            <p className="mt-1.5 text-[13px]"><b>المرجع:</b> {cat.ref}</p>
            <div className="mt-1.5"><OfficialLink /></div>
          </div>
        </div>
        {cat.extraNote && <p className="mt-2 rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[14px] leading-7 dark:bg-amber-950/30">{cat.extraNote}</p>}
      </div>
    );
  }

  const a = cat.amounts;
  const tiles = [
    { k: 'h24', label: 'خلال 24 ساعة', value: a.h24, tone: 'from-brand-600 to-brand-700 text-white' },
    { k: 'd15', label: 'خلال 15 يوما', value: a.d15, tone: 'from-gold to-amber-600 text-white' },
    { k: 'base', label: 'الغرامة الأصلية', value: a.base, tone: 'from-accent to-red-700 text-white' },
  ];
  const curKey = res?.current?.tier.amount;

  return (
    <div>
      {badge}
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.k} className={`relative overflow-hidden rounded-xl bg-gradient-to-b p-2.5 text-center shadow-sm ${t.tone} ${curKey === t.k ? 'ring-4 ring-gold/60' : ''}`}>
            <p className="text-[11.5px] font-semibold opacity-90">{t.label}</p>
            <p className="ltr-nums mt-1 text-[24px] font-bold leading-none">{money(t.value)}</p>
            <p className="mt-1 text-[11.5px] opacity-90">درهم</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-semibold">{cat.label} · {cat.ref}</span>
        <OfficialLink label="فتح النص الرسمي" />
      </div>
      {cat.extraNote && <p className="mt-3 rounded-lg border-r-4 border-gold bg-amber-50 px-3 py-2 text-[14px] leading-7 dark:bg-amber-950/30">{cat.extraNote}</p>}

      {/* calculator */}
      <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
        <p className="mb-3 flex items-center gap-2 text-[14.5px] font-bold"><CalendarClock className="size-5 text-brand-600 dark:text-brand-100" />حاسبة المبلغ والآجال</p>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface)] p-1">
          {fines.bases.map((b) => (
            <button key={b.key} onClick={() => setBasis(b.key)} className={`rounded-lg px-2 py-2 text-[12.5px] font-semibold leading-5 transition ${basis === b.key ? 'bg-brand-600 text-white' : 'text-[var(--muted)]'}`}>{b.label}</button>
          ))}
        </div>
        <p className="mb-3 text-[12px] text-[var(--muted)]">{fines.bases.find((b) => b.key === basis)?.hint}</p>
        <label className="mb-2 block text-[13px] font-semibold">{basis === 'notification' ? 'تاريخ وساعة تبليغ الإشعار' : 'تاريخ وساعة ارتكاب المخالفة'}
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[15px]" />
        </label>
        <label className="block text-[13px] font-semibold">تاريخ الأداء (افتراضيا: الآن)
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[15px]" />
        </label>

        {res && (
          <div className="mt-4">
            {res.expired ? (
              <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[14px] leading-7 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                <p className="flex items-center gap-2 font-bold"><AlertOctagon className="size-5" />{fines.expiry.title}</p>
                <p>{fines.expiry.text}</p>
                <p className="mt-1 text-[12.5px] font-semibold">المرجع: {fines.expiry.ref} · <OfficialLink label="النص الرسمي" /></p>
              </div>
            ) : res.current && (
              <div className="rounded-xl bg-brand-700 p-3.5 text-white">
                <p className="text-[12.5px] opacity-85">المبلغ الواجب أداؤه في هذا التاريخ</p>
                <p className="ltr-nums text-[30px] font-bold leading-tight">{money(res.current.amount ?? 0)} <span className="text-[16px]">درهم</span></p>
                <p className="text-[13px] opacity-90">{res.current.tier.label}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[12.5px]"><Timer className="size-4" />الوقت المتبقي: {remaining(res.remainingMs)}</p>
              </div>
            )}
            <ol className="relative mt-4 space-y-3 border-r-2 border-[var(--line)] pr-4">
              <li className="relative">
                <span className="absolute -right-[23px] top-1.5 size-3 rounded-full bg-brand-500 ring-4 ring-[var(--surface-2)]" />
                <p className="text-[12px] text-[var(--muted)]">بداية الأجل</p>
                <p className="text-[14px] font-semibold">{fmtDate(res.start)} — {fmtTime(res.start)}</p>
              </li>
              {res.windows.map((w) => {
                const active = res.current === w && !res.expired;
                const passed = new Date(at) > w.end;
                return (
                  <li key={w.tier.key} className="relative">
                    <span className={`absolute -right-[23px] top-1.5 size-3 rounded-full ring-4 ring-[var(--surface-2)] ${active ? 'bg-gold' : passed ? 'bg-neutral-400' : 'bg-brand-200 dark:bg-brand-700'}`} />
                    <p className={`text-[12px] ${active ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-[var(--muted)]'}`}>{w.tier.label}{active ? ' — المرحلة الحالية' : passed ? ' — انقضى' : ''}</p>
                    <p className="text-[14px]">آخر أجل: <b>{fmtDate(w.end)}</b>{w.tier.hours ? ` — ${fmtTime(w.end)}` : ''}</p>
                    <p className="ltr-nums text-right text-[13px] font-bold">{w.amount != null ? `${money(w.amount)} درهم` : '—'}</p>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[11.5px] leading-5 text-[var(--muted)]">{fines.deadlineRule}</p>
          </div>
        )}
      </div>
    </div>
  );
}
