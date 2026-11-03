import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { HeroCurve } from './components/ui';
import { useTheme } from './lib/theme';
import { AppProvider } from './store';
import './index.css';

// In the Android APK all files are served locally from the app package: no service worker needed.
if (!import.meta.env.VITE_APK) registerSW({ immediate: true });

function Splash({ leaving = false }: { leaving?: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden bg-[#f7f3ea] transition-opacity duration-300 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="status"
      aria-label="دليل المراقبة الطرقية"
    >
      <div className="absolute inset-0 bg-[url('/patterns/zellige-line-green.svg')] bg-[length:72px] opacity-[.08]" />
      <div className="absolute inset-x-0 top-0"><div className="h-[18vh] bg-gradient-to-b from-[#0a5c39] to-[#0d7a4a]" /><HeroCurve /></div>
      <div className="absolute inset-x-0 bottom-0 rotate-180"><div className="h-[9vh] bg-gradient-to-b from-[#0a5c39] to-[#0d7a4a]" /><HeroCurve /></div>
      <div className="relative flex h-full flex-col items-center justify-center px-8 text-center">
        <img src="./icons/app-icon.png" alt="" className="anim-in w-[min(62vw,250px)] rounded-full bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)]" />
        <h1 className="mt-6 text-[clamp(26px,7.5vw,34px)] font-bold leading-tight text-[#0a5c39]">دليل المراقبة الطرقية</h1>
        <div className="my-3 flex items-center gap-2" aria-hidden><span className="h-px w-12 bg-[#0a5c39]/40" /><span className="size-2 rotate-45 bg-[#c8202c]" /><span className="h-px w-12 bg-[#0a5c39]/40" /></div>
        <p className="text-[clamp(14px,4.2vw,17px)] font-semibold text-[#3d4a43]">الخاص بأعوان الشرطة محرري المحاضر</p>
      </div>
    </div>
  );
}

const SPLASH_MS = 1300;
const FADE_MS = 300;

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="mb-2 text-lg font-bold">تعذر تحميل قاعدة البيانات</p>
        <p className="mb-4 text-sm text-[var(--muted)]">يلزم الاتصال بالإنترنت عند أول تشغيل فقط. ({msg})</p>
        <button onClick={() => location.reload()} className="rounded-xl bg-brand-600 px-5 py-2.5 font-bold text-white">إعادة المحاولة</button>
      </div>
    </div>
  );
}

function Root() {
  const theme = useTheme();
  const [phase, setPhase] = useState<'show' | 'leaving' | 'gone'>('show');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('leaving'), SPLASH_MS);
    const t2 = setTimeout(() => setPhase('gone'), SPLASH_MS + FADE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <>
      <AppProvider splash={<Splash />} error={(m) => <ErrorScreen msg={m} />}>
        <App theme={theme} />
      </AppProvider>
      {phase !== 'gone' && <Splash leaving={phase === 'leaving'} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
