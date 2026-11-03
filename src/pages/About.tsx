import { CalendarDays, CheckCircle2, Layers, Download, Monitor, Moon, Search, Smartphone, Star, Sun, WifiOff } from 'lucide-react';
import { Card, Logo, PageHeader, SectionTitle } from '../components/ui';
import { isApk, useInstall } from '../lib/pwa';
import type { ThemePref } from '../lib/theme';
import { useApp } from '../store';

const FEATURES = [
  { icon: Search, title: 'بحث فوري', text: 'بالاسم أو الرمز أو رقم المادة', tone: 'from-brand-500 to-brand-700' },
  { icon: WifiOff, title: 'دون إنترنت', text: 'يعمل بالكامل دون اتصال', tone: 'from-[#d23a3f] to-accent' },
  { icon: Star, title: 'المفضلة والسجل', text: 'المعاينة وعمليات البحث', tone: 'from-[#e4c25a] to-[#a87d12]' },
];

export function About({ theme }: { theme: { pref: ThemePref; setPref: (p: ThemePref) => void } }) {
  const app = useApp();
  const install = useInstall();
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

  return (
    <div className="safe-bottom">
      <PageHeader back={false} title="حول التطبيق" />
      <main className="mx-auto max-w-3xl px-4 pt-4">
        <section className="mb-5 flex flex-col items-center pt-2 text-center">
          {/* two concentric rings: gold outside, green inside */}
          <div className="rounded-full p-[3px] shadow-[0_14px_32px_-16px_rgba(0,0,0,.45)]" style={{ background: 'linear-gradient(160deg,#e4c25a,#c9a227 45%,#a87d12)' }}>
            <div className="rounded-full bg-[var(--bg)] p-[5px]">
              <div className="rounded-full p-[2.5px]" style={{ background: 'linear-gradient(160deg,#0d7a4a,#0a5c39)' }}>
                <div className="rounded-full bg-[var(--surface)] p-[3px]">
                  <img src="./developer.jpg" alt="نورالدين عربي" width={400} height={500} decoding="async" className="size-[clamp(132px,40vw,168px)] rounded-full object-cover object-[50%_32%]" />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-[17px] font-bold text-[var(--text)]">تصميم وتطوير: <span className="text-brand-700 dark:text-brand-100">نورالدين عربي</span></p>
          <p className="legal mt-1 flex items-center gap-1.5 text-[16px] font-medium text-[var(--muted)]"><span className="text-[1.2em] leading-none text-gold" aria-hidden>﴿</span>وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ<span className="text-[1.2em] leading-none text-gold" aria-hidden>﴾</span></p>
        </section>

        <Card className="zellige-corner flex flex-col items-center px-5 py-7 text-center">
          <Logo tile className="size-32" />
          <h2 className="mt-4 text-[23px] font-bold leading-snug">دليل المراقبة الطرقية</h2>
          <p className="mt-1 text-[16px] font-medium text-brand-700 dark:text-brand-100">الخاص بأعوان الشرطة محرري المحاضر</p>
          <p className="mt-3 max-w-md text-[16.5px] leading-8 text-[var(--muted)]">
            مرجع ميداني سريع للمخالفات والجنح ومساطرها وفق {app.data.source.subtitle.replace(' — ', '، ')}.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-[14px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 font-semibold"><CalendarDays className="size-4 text-brand-600 dark:text-brand-100" />{app.data.source.edition}</span>
            {version && <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 font-semibold"><Layers className="size-4 text-brand-600 dark:text-brand-100" />الإصدار <span className="ltr-nums">{version}</span></span>}
          </div>
        </Card>

        <Card className="mt-3 grid grid-cols-3 overflow-hidden">
          {FEATURES.map(({ icon: Icon, title, text, tone }) => (
            <div key={title} className="flex flex-col items-center border-l border-[var(--line)] px-2 py-5 text-center last:border-l-0">
              <span className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-b ${tone} text-white shadow-md ring-4 ring-[var(--surface-2)]`}><Icon className="size-6" /></span>
              <span className="mt-3 text-[15px] font-bold leading-6">{title}</span>
              <span className="mt-0.5 text-[12.5px] leading-5 text-[var(--muted)]">{text}</span>
            </div>
          ))}
        </Card>

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

        <div className="h-4" />
      </main>
    </div>
  );
}
