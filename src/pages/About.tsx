import { CheckCircle2, Download, Monitor, Moon, Search, Smartphone, Star, Sun, WifiOff } from 'lucide-react';
import { Card, Logo, PageHeader, SectionTitle } from '../components/ui';
import { isApk, useInstall } from '../lib/pwa';
import type { ThemePref } from '../lib/theme';
import { useApp } from '../store';

const FEATURES = [
  { icon: Search, text: 'بحث فوري بالاسم أو الرمز أو رقم المادة' },
  { icon: WifiOff, text: 'يعمل بالكامل دون اتصال بالإنترنت' },
  { icon: Star, text: 'المفضلة وسجل المعاينة والبحث' },
];

export function About({ theme }: { theme: { pref: ThemePref; setPref: (p: ThemePref) => void } }) {
  const app = useApp();
  const install = useInstall();
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

  return (
    <div className="safe-bottom">
      <PageHeader back={false} title="حول التطبيق" />
      <main className="mx-auto max-w-3xl px-4 pt-4">
        <Card className="zellige-corner flex flex-col items-center px-5 py-7 text-center">
          <Logo tile className="size-24" />
          <h2 className="mt-4 text-[23px] font-bold leading-snug">دليل المراقبة الطرقية</h2>
          <p className="mt-1 text-[16px] font-medium text-brand-700 dark:text-brand-100">الخاص بأعوان الشرطة محرري المحاضر</p>
          <p className="mt-3 max-w-md text-[16.5px] leading-8 text-[var(--muted)]">
            مرجع ميداني سريع للمخالفات والجنح ومساطرها وفق {app.data.source.subtitle.replace(' — ', '، ')}.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-[14px]">
            <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 font-semibold">{app.data.source.edition}</span>
            {version && <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 font-semibold">الإصدار <span className="ltr-nums">{version}</span></span>}
          </div>
        </Card>

        <div className="mt-3 grid gap-2">
          {FEATURES.map(({ icon: Icon, text }) => (
            <Card key={text} className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-100"><Icon className="size-5" /></span>
              <span className="text-[16.5px] font-medium">{text}</span>
            </Card>
          ))}
        </div>

        <SectionTitle>المظهر</SectionTitle>
        <Card className="grid grid-cols-3 gap-1 p-1">
          {([['light', 'نهاري', Sun], ['dark', 'ليلي', Moon], ['system', 'تلقائي', Monitor]] as const).map(([k, l, Icon]) => (
            <button key={k} onClick={() => theme.setPref(k)} className={`flex items-center justify-center gap-1.5 rounded-xl py-3 text-[16px] font-semibold ${theme.pref === k ? 'bg-brand-600 text-white' : 'text-[var(--muted)]'}`}><Icon className="size-5" />{l}</button>
          ))}
        </Card>

        {!isApk && (
          <>
            <SectionTitle icon={<Smartphone className="size-5 text-brand-600 dark:text-brand-100" />}>التثبيت على الهاتف</SectionTitle>
            <Card className="p-4 text-[16px] leading-8">
              {install.installed ? (
                <p className="flex items-center gap-2 font-semibold text-brand-600 dark:text-brand-100"><CheckCircle2 className="size-5" />التطبيق مثبت على هذا الجهاز.</p>
              ) : install.canInstall ? (
                <button onClick={install.install} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-bold text-white"><Download className="size-5" />تثبيت التطبيق</button>
              ) : (
                <p>من قائمة المتصفح (⋮) اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>
              )}
            </Card>
          </>
        )}

        <SectionTitle>المطوّر</SectionTitle>
        <Card className="zellige-corner flex flex-col items-center px-5 py-6 text-center">
          <figure className="w-full max-w-[260px] rounded-2xl bg-gradient-to-b from-gold via-[#e4c25a] to-[#a87d12] p-[3px] shadow-lg">
            <div className="rounded-[14px] bg-[var(--surface)] p-1.5">
              <img src="./developer.jpg" alt="المطوّر: نورالدين عربي" width={560} height={700} loading="lazy" className="aspect-[4/5] w-full rounded-xl object-cover" />
            </div>
          </figure>
          <p className="mt-4 text-[17px] font-bold">المطوّر: نورالدين عربي</p>
          <span className="mt-3 h-px w-24 bg-gradient-to-l from-transparent via-gold to-transparent" />
        </Card>
        <div className="h-4" />
      </main>
    </div>
  );
}
