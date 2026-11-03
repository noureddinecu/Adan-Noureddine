import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { Logo } from './components/ui';
import { useTheme } from './lib/theme';
import { AppProvider } from './store';
import './index.css';

// In the Android APK all files are served locally from the app package: no service worker needed.
if (!import.meta.env.VITE_APK) registerSW({ immediate: true });

function Splash({ leaving = false }: { leaving?: boolean }) {
  return (
    <div className={`splash-zellige fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-gradient-to-b from-brand-600 via-brand-800 to-brand-900 text-white transition-opacity duration-300 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`} role="status" aria-label="دليل المراقبة الطرقية">
      <div className="anim-in relative flex flex-col items-center gap-4 rounded-3xl bg-brand-900/70 px-10 py-9 text-center shadow-2xl ring-1 ring-gold/50 backdrop-blur-sm">
        <Logo tile className="size-28" />
        <div>
          <p className="text-[25px] font-bold leading-tight">دليل المراقبة الطرقية</p>
          <p className="mt-1.5 text-[14.5px] text-white/80">الخاص بأعوان الشرطة محرري المحاضر</p>
        </div>
        <span className="h-px w-28 bg-gradient-to-l from-transparent via-gold to-transparent" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/15"><div className="h-full w-1/2 animate-pulse rounded-full bg-gold" /></div>
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
