import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, post, put } from '../shared/api';
import { createLive, useLive, type Live } from '../shared/live';
import { setUiLang, useI18n } from '../shared/i18n';
import { Logo, Toaster, cx, toast } from '../shared/ui';
import type { Meta, Settings } from '../shared/types';
import { AppCtx, type Ctx } from './ctx';
import LivePage from './pages/Live';
import QuestionsPage from './pages/Questions';
import PlayersPage from './pages/Players';
import HistoryPage from './pages/History';
import SettingsPage from './pages/Settings';

type Tab = 'live' | 'questions' | 'players' | 'history' | 'settings';
const TABS: { id: Tab; icon: string }[] = [
  { id: 'live', icon: '🎮' }, { id: 'questions', icon: '❓' }, { id: 'players', icon: '👥' }, { id: 'history', icon: '🏆' }, { id: 'settings', icon: '⚙️' },
];

export default function App() {
  const [auth, setAuth] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const check = useCallback(() => api('/api/auth/status').then(setAuth).catch(() => setTimeout(check, 2000)), []);
  useEffect(() => { check(); }, [check]);
  useEffect(() => {
    const f = () => setAuth((a) => (a ? { ...a, authenticated: false } : a));
    addEventListener('lqg:unauthorized', f);
    return () => removeEventListener('lqg:unauthorized', f);
  }, []);
  return (
    <>
      <div className="bg-orbs"><i /></div>
      <Toaster />
      {!auth ? <Splash /> : !auth.authenticated ? <Login configured={auth.configured} onDone={check} /> : <Shell onLogout={check} />}
    </>
  );
}

function Splash() {
  return <div className="min-h-[100dvh] grid place-items-center"><div className="animate-pop"><Logo size={72} /></div></div>;
}

function Login({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (configured) await post('/api/auth/login', { password });
      else await post('/api/auth/setup', { code, password });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm flex flex-col gap-4 animate-rise">
        <div className="flex justify-between items-center"><Logo size={44} /><LangSwitch /></div>
        <div>
          <h1 className="h-title text-2xl">{configured ? t('loginTitle') : t('setupTitle')}</h1>
          <p className="muted text-sm mt-1">{configured ? t('loginHint') : t('setupHint')}</p>
        </div>
        {!configured && <label className="label">{t('setupCode')}<input className="input text-center tracking-[.4em] font-bold" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required /></label>}
        <label className="label">{configured ? t('password') : t('newPassword')}
          <input className="input" type="password" autoComplete={configured ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={configured ? 1 : 6} />
        </label>
        {err && <div className="text-bad text-sm font-bold">{err}</div>}
        <button className="btn-primary btn-xl" disabled={busy}>{configured ? t('login') : t('create')}</button>
        <p className="text-xs muted text-center" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t('noPassword')}</p>
      </form>
    </div>
  );
}

export function LangSwitch() {
  const { lang } = useI18n();
  return <button type="button" className="btn-soft btn-sm" onClick={() => setUiLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'عربي'}</button>;
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { t } = useI18n();
  const [tab, setTabState] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'live');
  const setTab = (x: Tab) => { setTabState(x); history.replaceState(null, '', `#${x}`); window.scrollTo({ top: 0 }); };
  const [boot, setBoot] = useState<{ meta: Meta; settings: Settings; network: string[]; tiktokSignKey: boolean } | null>(null);
  const live: Live = useMemo(() => createLive(true), []);
  const d = useLive(live);

  useEffect(() => {
    api('/api/admin/bootstrap').then((b) => {
      live.set({ state: b.state, provider: b.provider, host: b.host, comments: [...b.comments].reverse() });
      setBoot({ meta: b.meta, settings: b.settings, network: b.network, tiktokSignKey: b.tiktokSignKey });
    }).catch((e) => toast(e.message, 'err'));
    return () => live.close();
  }, [live]);

  const saveSettings = useCallback<Ctx['saveSettings']>(async (patch) => {
    try {
      const s = await put<Settings>('/api/settings', patch);
      setBoot((b) => (b ? { ...b, settings: s } : b));
    } catch (e: any) { toast(e.message, 'err'); }
  }, []);

  if (!boot) return <Splash />;
  const ctx: Ctx = {
    live, meta: boot.meta, settings: boot.settings, saveSettings, network: boot.network, signKey: boot.tiktokSignKey,
    logout: async () => { await post('/api/auth/logout').catch(() => {}); onLogout(); },
  };
  const phase = d.state?.phase || 'idle';
  const pv = d.provider;
  return (
    <AppCtx.Provider value={ctx}>
      <div className="lg:flex min-h-[100dvh] max-w-[100vw] overflow-x-clip">
        <aside className="hidden lg:flex flex-col gap-2 w-60 shrink-0 p-4 sticky top-0 h-[100dvh]">
          <div className="mb-4"><Logo size={40} /></div>
          {TABS.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} className={cx('btn justify-start text-start', tab === x.id ? 'grad-bg shadow-glow' : 'btn-ghost')}>
              <span>{x.icon}</span>{t(x.id)}
            </button>
          ))}
          <div className="mt-auto"><LangSwitch /></div>
        </aside>
        <div className="flex-1 min-w-0 pb-28 lg:pb-8">
          <header className="sticky top-0 z-30 backdrop-blur-xl bg-ink/70 border-b border-white/10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex items-center gap-2 px-4 py-2.5 max-w-5xl mx-auto">
              <span className="lg:hidden"><Logo size={30} withText={false} /></span>
              <span className="font-display font-extrabold text-lg truncate min-w-0">{t(tab)}</span>
              <span className="ms-auto flex items-center gap-1.5">
                <span className={cx('badge hidden sm:inline-flex', phase === 'question' ? 'bg-ok/20 text-ok' : phase === 'idle' ? 'bg-white/10 text-white/60' : 'bg-brand-violet/30')}>
                  {d.state?.paused ? '⏸ ' + t('paused') : t('ph_' + phase)}
                </span>
                <span className={cx('badge', pv?.state === 'connected' ? 'bg-ok/20 text-ok' : pv?.state === 'error' ? 'bg-bad/20 text-bad' : pv?.state === 'reconnecting' || pv?.state === 'connecting' ? 'bg-gold/20 text-gold' : 'bg-white/10 text-white/50')}>
                  ● {pv && pv.type !== 'none' ? t('provider_' + pv.type) : t('st_idle')}
                </span>
                <span className="lg:hidden"><LangSwitch /></span>
              </span>
            </div>
            {!d.online && <div className="bg-bad/90 text-ink text-center text-xs font-bold py-1">{t('offline')}</div>}
          </header>
          <main className="px-3 sm:px-4 py-4 max-w-5xl mx-auto overflow-x-clip">
            {tab === 'live' && <LivePage />}
            {tab === 'questions' && <QuestionsPage />}
            {tab === 'players' && <PlayersPage />}
            {tab === 'history' && <HistoryPage />}
            {tab === 'settings' && <SettingsPage />}
          </main>
        </div>
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-ink-2/90 backdrop-blur-xl border-t border-white/10 safe-bottom">
          <div className="grid grid-cols-5 max-w-lg mx-auto">
            {TABS.map((x) => (
              <button key={x.id} onClick={() => setTab(x.id)} className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition', tab === x.id ? 'text-white' : 'text-white/45')}>
                <span className={cx('text-xl transition', tab === x.id && 'scale-125 drop-shadow-[0_0_10px_rgba(236,72,153,.8)]')}>{x.icon}</span>{t(x.id)}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </AppCtx.Provider>
  );
}
