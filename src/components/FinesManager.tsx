import { Banknote, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { validateFines } from '../data/fines';
import { useApp } from '../store';
import { OfficialLink } from './FineCard';
import { Card, SectionTitle } from './ui';

export function FinesManager() {
  const app = useApp();
  const f = app.fines;
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const t = validateFines(JSON.parse(await file.text()));
      await app.setCustomFines(t);
      setMsg({ ok: true, text: `تم تحديث جدول الغرامات (نسخة ${t.version}).` });
    } catch (e) {
      setMsg({ ok: false, text: `تعذر استيراد الملف: ${(e as Error).message}` });
    }
    if (input.current) input.current.value = '';
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `fines-${f.version}.json`; a.click();
  };

  const rows = Object.values(f.categories).filter((c) => c?.type === 'transactional');
  return (
    <>
      <SectionTitle icon={<Banknote className="size-4.5 text-brand-600 dark:text-brand-100" />}>جدول الغرامات التصالحية والجزافية</SectionTitle>
      <Card className="p-4">
        <table className="w-full text-center text-[13.5px]">
          <thead><tr className="text-[12px] text-[var(--muted)]"><th className="pb-2 text-right">الدرجة</th><th className="pb-2">24 ساعة</th><th className="pb-2">15 يوما</th><th className="pb-2">الأصلية</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c!.label} className="border-t border-[var(--line)]">
                <td className="py-2 text-right font-semibold">{c!.label.replace('مخالفة من ', '')}</td>
                <td className="ltr-nums py-2">{c!.amounts!.h24}</td><td className="ltr-nums py-2">{c!.amounts!.d15}</td><td className="ltr-nums py-2 font-bold">{c!.amounts!.base}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-[var(--muted)]">المبالغ بالدرهم المغربي · المرجع: المادة 219 من مدونة السير · <OfficialLink label="النص الرسمي" /></p>
        <p className="mt-2 text-[12.5px]">النسخة: <b className="ltr-nums">{f.version}</b> · المصدر: {app.finesCustom ? 'جدول مستورد من طرف المستخدم' : 'الجدول المضمن في التطبيق'} · الحالة: {f.status === 'verified' ? 'مطابق للنص الرسمي' : 'في انتظار المطابقة مع النص الرسمي'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => input.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-[13.5px] font-bold text-white"><Upload className="size-4" />تحديث من ملف JSON</button>
          <button onClick={exportJson} className="rounded-xl border border-[var(--line)] py-2.5 text-[13.5px] font-semibold">تصدير الجدول الحالي</button>
        </div>
        {app.finesCustom && (
          <button onClick={async () => { await app.setCustomFines(null); setMsg({ ok: true, text: 'تمت العودة إلى الجدول المضمن.' }); }} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] text-[var(--muted)]"><RotateCcw className="size-4" />العودة إلى الجدول المضمن</button>
        )}
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        {msg && <p className={`mt-2 rounded-lg px-3 py-2 text-[13px] ${msg.ok ? 'bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-100' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}>{msg.text}</p>}
        <p className="mt-3 text-[11.5px] leading-5 text-[var(--muted)]">لتحديث المبالغ مستقبلا: صدّر الجدول الحالي، عدّل القيم في الملف (الحقل categories، والاستثناءات في overrides، واجعل status = "verified" بعد المطابقة)، ثم استورده. يُحفظ الجدول محليا ويُطبق فورا دون إعادة بناء التطبيق.</p>
      </Card>
    </>
  );
}
