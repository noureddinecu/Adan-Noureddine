import { AlertTriangle, CheckCircle2, Download, FileCheck2, Monitor, Moon, ShieldCheck, Smartphone, Sun, WifiOff } from 'lucide-react';
import { Card, Logo, PageHeader, SECTION_STYLE, SectionIcon, SectionTitle } from '../components/ui';
import { navigate } from '../lib/router';
import { useInstall } from '../lib/pwa';
import type { ThemePref } from '../lib/theme';
import { useApp } from '../store';

export function About({ theme }: { theme: { pref: ThemePref; setPref: (p: ThemePref) => void } }) {
  const app = useApp();
  const install = useInstall();
  const vs = app.data.violations;
  const pages = new Set(vs.map((v) => v.pdfPage));
  const noted = vs.filter((v) => v.extractionNotes.length);
  const dupCodes = [...new Set(vs.filter((v) => v.duplicateCode).map((v) => v.code))];
  const sharedGroups = new Set(vs.map((v) => v.sharedCell).filter(Boolean)).size;

  return (
    <div className="safe-bottom">
      <PageHeader back={false} title="حول الدليل" subtitle="تقرير الاستخراج والإعدادات" />
      <main className="mx-auto max-w-3xl px-3 pt-3">
        <Card className="flex items-center gap-3 p-4">
          <Logo className="size-14 shrink-0" />
          <div className="min-w-0">
            <p className="text-[16px] font-bold leading-7">{app.data.source.title}</p>
            <p className="text-[13px] text-[var(--muted)]">{app.data.source.subtitle} · {app.data.source.edition}</p>
          </div>
        </Card>

        <SectionTitle icon={<FileCheck2 className="size-4.5 text-brand-600 dark:text-brand-100" />}>تقرير استخراج البيانات</SectionTitle>
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[var(--surface-2)] p-3"><p className="text-2xl font-bold text-brand-600 dark:text-brand-100">{app.data.source.pdfPages}</p><p className="text-[12px] text-[var(--muted)]">صفحة معالجة</p></div>
            <div className="rounded-xl bg-[var(--surface-2)] p-3"><p className="text-2xl font-bold text-brand-600 dark:text-brand-100">{vs.length}</p><p className="text-[12px] text-[var(--muted)]">مخالفة مستخرجة</p></div>
            <div className="rounded-xl bg-[var(--surface-2)] p-3"><p className="text-2xl font-bold text-brand-600 dark:text-brand-100">100%</p><p className="text-[12px] text-[var(--muted)]">نسبة الاكتمال</p></div>
          </div>
          <table className="mt-4 w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-[var(--muted)]"><th className="pb-2 text-right font-semibold">التصنيف (كما في الدليل)</th><th className="pb-2 font-semibold">الصفحات</th><th className="pb-2 font-semibold">العدد</th></tr></thead>
            <tbody>
              {app.data.sections.map((s) => (
                <tr key={s.key} className="border-t border-[var(--line)]">
                  <td className="py-2"><button onClick={() => navigate(`/section/${s.key}`)} className="flex items-center gap-2 text-right"><span className={`grid size-6 shrink-0 place-items-center rounded-md ${SECTION_STYLE[s.key].bg} ${SECTION_STYLE[s.key].fg}`}><SectionIcon section={s.key} className="size-3.5" /></span>{s.title}</button></td>
                  <td className="ltr-nums py-2 text-center text-[var(--muted)]">{s.firstPdfPage}–{s.lastPdfPage}</td>
                  <td className="py-2 text-center font-bold">{s.count}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--line)] font-bold"><td className="py-2">المجموع</td><td /><td className="py-2 text-center">{vs.length}</td></tr>
            </tbody>
          </table>
          <ul className="mt-4 space-y-2 text-[13.5px] leading-6">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-brand-500" />الملف عبارة عن صور ممسوحة ضوئيا (طبقة النص المدمجة غير صالحة)، فتمت قراءة الصفحات بصريا ونسخها حرفيا ثم مطابقة جميع الرموز ({vs.length}) مع عمود «الرمز» في الأصل.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-brand-500" />الصفحات المحتوية على جداول: {Math.min(...pages)}–{Math.max(...pages)} ({pages.size} صفحة). الصفحة 1 غلاف دون مخالفات.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-brand-500" />يتضمن الدليل سبعة جداول: الأقسام الخمسة الرئيسية، إضافة إلى جدولي «المخالفات لقواعد السير المقررة تطبيقا للمادة 94» و«المخالفات التي تستوجب مسطرة التوقيف»، وقد حوفظ عليهما كتصنيفين مستقلين.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-brand-500" />{sharedGroups} خلية «مسطرة» مدمجة في الأصل بين عدة مخالفات: نُسخت المسطرة لكل مخالفة مع الإشارة إلى الخلية المشتركة.</li>
            <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-500" />لا يتضمن الدليل مبالغ الغرامات ولا النصوص الكاملة للمواد؛ لذلك لا يعرضها التطبيق.</li>
            <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-500" />الترقيم المطبوع يبدأ بالصفحة 4 (صفحة PDF رقم 2)؛ الصفحتان المطبوعتان 2 و3 غير موجودتين في الملف المرفق.</li>
            {dupCodes.length > 0 && <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-500" />رموز مكررة في الأصل لمخالفات مختلفة (احتفظ بها منفصلة): <span className="ltr-nums">{dupCodes.join('، ')}</span>.</li>}
          </ul>
          {noted.length > 0 && (
            <>
              <p className="mt-4 mb-2 text-[13.5px] font-bold">معلومات تحتاج إلى تحقق إضافي ({noted.length})</p>
              <div className="space-y-1.5">
                {noted.map((v) => (
                  <button key={v.id} onClick={() => navigate(`/v/${v.id}`)} className="block w-full rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-right text-[12.5px] leading-6 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <b className="ltr-nums">{v.code}</b> (ص {v.pdfPage}): {v.extractionNotes[0]}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        <SectionTitle icon={<Smartphone className="size-4.5 text-brand-600 dark:text-brand-100" />}>التثبيت والعمل دون إنترنت</SectionTitle>
        <Card className="p-4 text-[14px] leading-7">
          {install.installed ? (
            <p className="flex items-center gap-2 font-semibold text-brand-600 dark:text-brand-100"><CheckCircle2 className="size-5" />التطبيق مثبت على هذا الجهاز.</p>
          ) : install.canInstall ? (
            <button onClick={install.install} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-bold text-white"><Download className="size-5" />تثبيت التطبيق الآن</button>
          ) : (
            <ol className="list-decimal space-y-1 pr-5">
              <li>افتح التطبيق في متصفح Chrome على هاتف أندرويد.</li>
              <li>اضغط على قائمة المتصفح (⋮) ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li>
              <li>ستظهر أيقونة «المراقبة الطرقية» على الشاشة الرئيسية.</li>
            </ol>
          )}
          <p className="mt-3 flex gap-2 text-[13px] text-[var(--muted)]"><WifiOff className="mt-1 size-4 shrink-0" />بعد أول فتح، تُخزَّن ملفات التطبيق وقاعدة بيانات المخالفات محليا (Service Worker + IndexedDB)، ويعمل البحث والتصفح بالكامل دون اتصال.</p>
        </Card>

        <SectionTitle>المظهر</SectionTitle>
        <Card className="grid grid-cols-3 gap-1 p-1">
          {([['light', 'نهاري', Sun], ['dark', 'ليلي', Moon], ['system', 'تلقائي', Monitor]] as const).map(([k, l, Icon]) => (
            <button key={k} onClick={() => theme.setPref(k)} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold ${theme.pref === k ? 'bg-brand-600 text-white' : 'text-[var(--muted)]'}`}><Icon className="size-4.5" />{l}</button>
          ))}
        </Card>

        <SectionTitle icon={<ShieldCheck className="size-4.5 text-brand-600 dark:text-brand-100" />}>تنبيه</SectionTitle>
        <Card className="p-4 text-[13.5px] leading-7 text-[var(--muted)]">
          هذا التطبيق أداة مساعدة للبحث في محتوى الدليل المرفق فقط، ولا يضيف أي معلومة قانونية. في حالة الشك، يُرجع إلى النص الأصلي للدليل وإلى النصوص التشريعية والتنظيمية الجاري بها العمل. نسخة البيانات: <span className="ltr-nums">{app.data.version}</span>.
        </Card>
      </main>
    </div>
  );
}
