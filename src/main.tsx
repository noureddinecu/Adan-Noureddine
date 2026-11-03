import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { Logo } from './components/ui';
import { useTheme } from './lib/theme';
import { AppProvider } from './store';
import './index.css';

registerSW({ immediate: true });

function Splash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-gradient-to-b from-brand-700 to-brand-900 text-white">
      <div className="flex flex-col items-center gap-4">
        <Logo className="size-24 animate-pulse" />
        <p className="text-xl font-bold">دليل المراقبة الطرقية</p>
        <p className="text-sm text-white/75">جاري تحميل قاعدة البيانات…</p>
      </div>
    </div>
  );
}

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
  return (
    <AppProvider splash={<Splash />} error={(m) => <ErrorScreen msg={m} />}>
      <App theme={theme} />
    </AppProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
