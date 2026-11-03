import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { STAR_PATH } from './components/star-path';
import { useTheme } from './lib/theme';
import { AppProvider } from './store';
import './index.css';

// In the Android APK all files are served locally from the app package: no service worker needed.
if (!import.meta.env.VITE_APK) registerSW({ immediate: true });

function Splash({ leaving = false }: { leaving?: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden bg-[#fbe9dc] transition-opacity duration-300 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="status"
      aria-label="دليل المراقبة الطرقية"
    >
      {/* warm zellige over the whole screen */}
      <div className="absolute inset-0 bg-[url('/patterns/zellige-warm.svg')] bg-[length:92px] opacity-55" />
      {/* soft red drape on the right side */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_70%_at_100%_18%,rgba(206,20,32,.92),rgba(222,52,60,.55)_45%,rgba(240,120,110,0)_80%)]" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[rgba(176,10,22,.35)] to-transparent" />
      {/* large translucent green star, upper right */}
      <svg viewBox="-110 -110 220 220" className="absolute right-[3%] top-[5%] w-[58%] max-w-[340px] opacity-75 drop-shadow-[0_4px_10px_rgba(0,60,20,.25)]" aria-hidden>
        <path d={STAR_PATH} fill="none" stroke="#1d8a3e" strokeWidth="15" strokeLinejoin="miter" strokeMiterlimit="10" />
      </svg>
      {/* light veil behind the title for readability */}
      <div className="absolute inset-x-0 top-[44%] h-[34%] bg-[radial-gradient(ellipse_60%_55%_at_50%_45%,rgba(255,244,236,.85),rgba(255,244,236,0))]" />
      <div className="relative flex h-full flex-col items-center justify-center px-6 pt-[22vh] text-center">
        <h1 className="text-[clamp(30px,9vw,44px)] font-bold leading-tight text-[#a3111c] drop-shadow-[0_2px_2px_rgba(255,255,255,.6)]">دليل المراقبة الطرقية</h1>
        <p className="mt-5 rounded-full bg-gradient-to-b from-[#d61f2c] to-[#a3111c] px-7 py-2.5 text-[clamp(15px,4.6vw,21px)] font-semibold leading-7 text-white shadow-[0_6px_14px_-4px_rgba(130,10,20,.55)] ring-2 ring-white/80">
          الخاص بأعوان الشرطة محرري المحاضر
        </p>
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
