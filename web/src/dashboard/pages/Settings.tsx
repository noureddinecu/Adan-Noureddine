import { useEffect, useRef, useState } from 'react';
import { fileToDataUrl, post } from '../../shared/api';
import { setUiLang, useI18n } from '../../shared/i18n';
import { playSound, unlockAudio } from '../../shared/sound';
import { Section, Segmented, Stepper, Toggle, toast } from '../../shared/ui';
import type { Settings, SoundEvent } from '../../shared/types';
import { useApp } from '../ctx';
import { CopyLink, QR } from './Live';

const EVENTS: SoundEvent[] = ['question', 'tick', 'correct', 'wrong', 'first', 'win'];

function useDebounced<T>(value: T, save: (v: T) => void, ms = 450) {
  const [v, setV] = useState(value);
  const first = useRef(true);
  useEffect(() => { setV(value); }, [JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => save(v), ms);
    return () => clearTimeout(id);
  }, [JSON.stringify(v)]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV] as const;
}

export default function SettingsPage() {
  const { settings: s, saveSettings, network, logout, signKey } = useApp();
  const { t, lang } = useI18n();
  const save = saveSettings;
  const [points, setPoints] = useDebounced(s.scoring.points, (p) => save({ scoring: { points: p } }));
  const [quota, setQuota] = useDebounced(s.quota, (q) => save({ quota: q }));
  const [volume, setVolume] = useDebounced(s.effects.volume, (v) => save({ effects: { volume: v } }));
  const quotaTotal = quota.arab + quota.world + quota.foreign;
  const [phoneSound, setPhoneSound] = useState(() => { try { return localStorage.getItem('lqg.phoneSound') === '1'; } catch { return false; } });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [installEvt, setInstallEvt] = useState<any>(null);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    addEventListener('beforeinstallprompt', f);
    return () => removeEventListener('beforeinstallprompt', f);
  }, []);
  const dashUrls = [location.origin, ...network.filter((u) => !u.includes(location.host))];

  const uploadSound = async (ev: SoundEvent, file?: File) => {
    if (!file) return;
    try {
      const { url } = await post('/api/upload', { dataUrl: await fileToDataUrl(file) });
      await save({ effects: { sounds: { ...s.effects.sounds, [ev]: url } } });
      toast(t('saved'));
    } catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <Section title={t('scoring')} icon="🥇">
        <Stepper label={t('winnersCount')} value={s.scoring.winners} min={1} max={10} onChange={(v) => save({ scoring: { winners: v, points: Array.from({ length: v }, (_, i) => points[i] ?? Math.max(10, (points[points.length - 1] ?? 30) - 10)) } })} />
        <div className="grid grid-cols-2 gap-2 mt-3">
          {points.map((p, i) => (
            <label key={i} className="label">{['🥇', '🥈', '🥉', '🏅'][i] || '🎖'} {t('place')} {i + 1}
              <input className="input text-center font-bold" inputMode="numeric" value={p} onChange={(e) => setPoints(points.map((x, j) => (j === i ? Number(e.target.value.replace(/\D/g, '')) || 0 : x)))} />
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('quota')} icon="⚖️">
        <p className="text-xs muted mb-3">{t('quotaNote')}</p>
        {(['arab', 'world', 'foreign'] as const).map((k) => (
          <label key={k} className="grid gap-1 mb-2">
            <span className="flex justify-between text-sm font-semibold"><span>{t(k + 'Region')}</span><b>{quotaTotal ? Math.round((quota[k] / quotaTotal) * 100) : 0}%</b></span>
            <input type="range" min={0} max={100} value={quota[k]} onChange={(e) => setQuota({ ...quota, [k]: Number(e.target.value) })} />
          </label>
        ))}
        <div className="flex justify-between text-xs muted"><span>{t('total')}: {quotaTotal}</span><button className="btn-ghost btn-sm" onClick={() => setQuota({ arab: 65, world: 25, foreign: 10 })}>65/25/10</button></div>
      </Section>

      <Section title={t('timing')} icon="⏱️">
        <div className="grid gap-3">
          <Stepper label={t('duration')} value={s.timing.duration} min={5} max={180} step={5} onChange={(v) => save({ timing: { duration: v } })} />
          <Stepper label={t('revealTime')} value={s.timing.reveal} min={2} max={60} onChange={(v) => save({ timing: { reveal: v } })} />
          <Stepper label={t('startDelay')} value={s.timing.startDelay} min={0} max={60} onChange={(v) => save({ timing: { startDelay: v } })} />
          <Toggle label={t('autoAdvance')} checked={s.timing.autoAdvance} onChange={(v) => save({ timing: { autoAdvance: v } })} />
        </div>
      </Section>

      <Section title={t('display')} icon="📺">
        <div className="grid gap-1">
          <div className="text-sm font-semibold mb-1">{t('overlayLang')}</div>
          <Segmented value={s.display.lang} onChange={(v) => save({ display: { lang: v } })} options={[{ value: 'ar', label: 'العربية' }, { value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
          <Toggle label={t('hints')} checked={s.display.hints} onChange={(v) => save({ display: { hints: v } })} />
          <Toggle label={t('showFeed')} checked={s.display.showFeed} onChange={(v) => save({ display: { showFeed: v } })} />
          <Toggle label={t('showLeaderboard')} checked={s.display.showLeaderboard} onChange={(v) => save({ display: { showLeaderboard: v } })} />
          <Toggle label={t('shuffle')} checked={s.display.shuffleChoices} onChange={(v) => save({ display: { shuffleChoices: v } })} />
        </div>
      </Section>

      <Section title={t('effects')} icon="🔊">
        <Toggle label={t('sound')} checked={s.effects.sound} onChange={(v) => save({ effects: { sound: v } })} />
        <label className="grid gap-1 my-2"><span className="flex justify-between text-sm font-semibold"><span>{t('volume')}</span><b>{Math.round(volume * 100)}%</b></span>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
        <Toggle label={t('confettiLbl')} checked={s.effects.confetti} onChange={(v) => save({ effects: { confetti: v } })} />
        <Toggle label={t('lowFx')} checked={s.effects.lowFx} onChange={(v) => save({ effects: { lowFx: v } })} />
        <Toggle label={t('phoneSound')} checked={phoneSound} onChange={(v) => { setPhoneSound(v); try { localStorage.setItem('lqg.phoneSound', v ? '1' : '0'); } catch { /* ignore */ } unlockAudio(); }} />
        <div className="grid gap-2 mt-3">
          {EVENTS.map((ev) => (
            <div key={ev} className="flex items-center gap-2 rounded-2xl bg-white/[.04] px-3 py-2">
              <span className="flex-1 text-sm font-semibold">{t('ev_' + ev)}{s.effects.sounds[ev] && <span className="badge bg-brand-violet/30 ms-1">{t('custom')}</span>}</span>
              <button className="btn-soft btn-sm" onClick={async () => { await unlockAudio(); playSound(ev, { ...s.effects, sound: true, volume: volume || 0.8 }); }}>▶ {t('test')}</button>
              <label className="btn-soft btn-sm cursor-pointer">⬆<input type="file" hidden accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/x-m4a" onChange={(e) => uploadSound(ev, e.target.files?.[0])} /></label>
              {s.effects.sounds[ev] && <button className="btn-ghost btn-sm" onClick={() => save({ effects: { sounds: { ...s.effects.sounds, [ev]: '' } } })}>{t('reset')}</button>}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('devices')} icon="📱">
        <p className="text-xs muted mb-3">{t('devicesNote')}</p>
        <div className="grid gap-4">
          {dashUrls.slice(0, 3).map((u) => (
            <div key={u} className="grid gap-2">
              <CopyLink url={u} />
              <div className="flex gap-4 justify-center flex-wrap">
                <div className="text-center text-xs"><QR text={u} size={120} /><div className="mt-1 muted">{t('settings')}</div></div>
                <div className="text-center text-xs"><QR text={`${u}/overlay?bg=animated`} size={120} /><div className="mt-1 muted">{t('screenLink')}</div></div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-white/[.04] p-3 grid gap-2">
          <div className="font-bold text-sm">📲 {t('install')}</div>
          {installEvt ? <button className="btn-primary" onClick={() => installEvt.prompt()}>{t('install')}</button> : <p className="text-xs muted">{t('installHint')}</p>}
        </div>
      </Section>

      <Section title={t('security')} icon="🔐">
        <div className="grid gap-2">
          <div className="text-sm font-semibold">{t('uiLang')}</div>
          <Segmented value={lang} onChange={(v) => setUiLang(v)} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
          <div className="text-sm font-semibold mt-3">{t('changePassword')}</div>
          <input className="input" type="password" autoComplete="current-password" placeholder={t('currentPassword')} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="input" type="password" autoComplete="new-password" placeholder={t('newPassword')} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="btn-soft" disabled={!pw.current || pw.next.length < 6} onClick={async () => { try { await post('/api/auth/password', pw); toast(t('saved')); logout(); } catch (e: any) { toast(e.message, 'err'); } }}>{t('changePassword')}</button>
          <div className="text-sm font-semibold mt-3">{t('webhookKey')}</div>
          <code className="text-xs bg-black/30 rounded-xl px-2 py-2 break-all" dir="ltr">{s.provider.ingestKey}</code>
          <button className="btn-soft btn-sm" onClick={async () => { try { await post('/api/settings/ingest-key'); location.reload(); } catch (e: any) { toast(e.message, 'err'); } }}>{t('regenerate')}</button>
          <div className="text-xs muted mt-2">TikTok sign API key: {signKey ? '✅' : '—'} (TIKTOK_SIGN_API_KEY)</div>
          <button className="btn-danger mt-3" onClick={logout}>{t('logout')}</button>
        </div>
      </Section>

      <Section title={t('credits')} icon="©️">
        <p className="text-xs muted leading-relaxed" dir="ltr">
          Flags: flag-icons (MIT) — github.com/lipis/flag-icons · Country maps: mapsicon by Régis Freyd — github.com/djaiss/mapsicon ·
          Fonts: Cairo, Baloo Bhaijaan 2 (SIL OFL) · TikTok connection: tiktok-live-connector (unofficial, MIT). LIVE QUIZ GAME is not affiliated with TikTok.
        </p>
      </Section>
    </div>
  );
}

export type { Settings };
