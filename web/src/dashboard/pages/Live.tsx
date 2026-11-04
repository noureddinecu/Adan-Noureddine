import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { post } from '../../shared/api';
import { remainingMs, useLive } from '../../shared/live';
import { useI18n } from '../../shared/i18n';
import { playSound, unlockAudio } from '../../shared/sound';
import { Avatar, Empty, Section, Segmented, Stepper, cx, toast } from '../../shared/ui';
import type { CommentEntry, ProviderStatus, Settings } from '../../shared/types';
import { useApp } from '../ctx';

const LETTERS = ['أ / A', 'ب / B', 'ج / C', 'د / D'];
const MEDALS = ['🥇', '🥈', '🥉', '🏅'];

export default function LivePage() {
  const { live } = useApp();
  const d = useLive(live);
  usePhoneSounds();
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] items-start [&>*]:min-w-0">
      <div className="grid gap-4 [&>*]:min-w-0">
        <StageCard />
        <ControlPad />
        <RoundSetup />
      </div>
      <div className="grid gap-4 [&>*]:min-w-0">
        <ProviderCard status={d.provider} />
        <CommentsCard comments={d.comments} />
        <LeaderboardCard />
        <ScreensCard />
      </div>
    </div>
  );
}

/** Optional: play the same sound effects on the host phone (useful when the phone itself is screen-shared). */
function usePhoneSounds() {
  const { live } = useApp();
  useEffect(() => {
    let on = false;
    try { on = localStorage.getItem('lqg.phoneSound') === '1'; } catch { /* ignore */ }
    if (!on) return;
    let last = '';
    const unsubState = live.subscribe(() => {
      const s = live.get().state;
      const key = s ? `${s.phase}|${s.index}` : '';
      if (s && key !== last) { last = key; if (s.phase === 'question') playSound('question', s.effects); if (s.phase === 'finished') playSound('win', s.effects); }
    });
    const unsubFx = live.onFx((e) => {
      const fx = live.get().state?.effects;
      if (e.type === 'first' || e.type === 'correct' || e.type === 'wrong') playSound(e.type, fx);
    });
    return () => { unsubState(); unsubFx(); };
  }, [live]);
}

function useCountdown() {
  const { live } = useApp();
  const d = useLive(live);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(id); }, []);
  return remainingMs(d.state, d.clockOffset);
}

function StageCard() {
  const { live, meta } = useApp();
  const { t, tr } = useI18n();
  const d = useLive(live);
  const s = d.state;
  const [show, setShow] = useState(false);
  const remain = useCountdown();
  if (!s) return null;
  const q = s.question;
  const cat = q && meta.categories.find((c) => c.id === q.category);
  const total = (s.phase === 'reveal' ? s.reveal : s.phase === 'countdown' ? 5 : s.duration) * 1000;
  const frac = total ? Math.min(1, remain / total) : 0;
  const seats = s.phase === 'reveal' ? s.result?.winners || [] : q?.seats || [];
  return (
    <section className="card relative overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cx('badge text-sm', s.phase === 'question' ? 'bg-ok/20 text-ok' : 'bg-white/10')}>{s.paused ? `⏸ ${t('paused')}` : t('ph_' + s.phase)}</span>
        {s.total > 0 && <span className="badge bg-white/10 text-sm">{t('questionN')} {Math.max(0, s.index + 1)} {t('of')} {s.total}</span>}
        {cat && <span className="badge bg-brand-violet/25 text-sm">{cat.icon} {tr(cat.name)}</span>}
        {(s.phase === 'question' || s.phase === 'countdown' || s.phase === 'reveal') && (
          <span className={cx('ms-auto font-display font-extrabold text-2xl tabular-nums', s.phase === 'question' && remain < 5500 && 'text-bad animate-pulse')}>{Math.ceil(remain / 1000)}</span>
        )}
      </div>
      {(s.phase === 'question' || s.phase === 'reveal' || s.phase === 'countdown') && (
        <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full grad-bg transition-[width] duration-300" style={{ width: `${frac * 100}%` }} /></div>
      )}
      {q ? (
        <div className="mt-3 grid gap-3">
          <div className="flex gap-3 items-start">
            {q.image && (q.type === 'map'
              ? <div className="map-shape w-16 h-16 shrink-0" style={{ ['--map' as any]: `url("${q.image}")` }} />
              : <img src={q.image} alt="" className="w-16 h-16 object-contain rounded-xl bg-white/5 shrink-0" />)}
            <p className="font-display font-bold text-lg leading-snug">{tr(q.text)}</p>
          </div>
          {q.answerMode === 'choice' && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {q.choices.map((c, i) => (
                <div key={i} className={cx('rounded-xl px-3 py-2 border', (s.phase === 'reveal' && s.result?.correctIndex === i) || (show && d.host?.correctIndex === i) ? 'border-ok bg-ok/15' : 'border-white/10 bg-white/5')}>
                  <b className="text-brand-cyan">{LETTERS[i]}</b> · {tr(c)}
                </div>
              ))}
            </div>
          )}
          {s.phase === 'question' && (
            <button className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2 text-start" onClick={() => setShow((x) => !x)}>
              <span className="text-xs muted">🔑 {t('hostAnswer')} — {show ? t('hideAnswer') : t('showAnswer')}</span>
              {show && d.host && <div className="font-bold text-ok mt-1">{d.host.correctIndex != null ? `${LETTERS[d.host.correctIndex]} — ` : ''}{d.host.accepted.slice(0, 3).join(' / ')}</div>}
            </button>
          )}
          {s.phase === 'reveal' && s.result && <div className="rounded-2xl bg-ok/10 border border-ok/40 px-3 py-2 font-bold text-ok">✅ {tr(s.result.answer)}</div>}
          <div>
            <div className="flex items-center justify-between text-xs muted mb-1.5"><span>{t('seats')}</span><span>{q.attempts} {t('attempts')}</span></div>
            <div className="grid gap-1.5">
              {Array.from({ length: s.config.winners }, (_, i) => {
                const w = seats.find((x) => x.rank === i + 1);
                return (
                  <div key={i} className={cx('flex items-center gap-2 rounded-xl px-2.5 py-1.5 border', w ? `seat-${Math.min(i + 1, 4)} animate-pop` : 'border-dashed border-white/15')}>
                    <span>{MEDALS[i] || `#${i + 1}`}</span>
                    {w ? (<><Avatar src={w.avatar} name={w.nickname} size={24} /><b className="truncate flex-1">{w.nickname}</b><span className="text-xs muted">{(w.ms / 1000).toFixed(1)}s</span><b className="text-gold">+{w.points}</b></>)
                      : <span className="text-xs muted">{t('waiting')}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : s.phase === 'finished' && s.final ? (
        <div className="mt-4 text-center">
          <div className="text-4xl">🏆</div>
          {s.final.champion ? (<div className="mt-2 flex flex-col items-center gap-1"><Avatar src={s.final.champion.avatar} name={s.final.champion.nickname} size={64} className="ring-4 ring-gold" /><div className="font-display font-extrabold text-xl">{s.final.champion.nickname}</div><div className="text-gold font-bold">{s.final.champion.points} {t('pts')}</div></div>) : <Empty>{t('empty')}</Empty>}
        </div>
      ) : (
        <Empty>{t('noQuestion')}</Empty>
      )}
    </section>
  );
}

function ControlPad() {
  const { live } = useApp();
  const { t } = useI18n();
  const s = useLive(live).state;
  const [busy, setBusy] = useState('');
  const act = async (a: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(a);
    await unlockAudio();
    try { await post(`/api/game/${a}`); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const phase = s?.phase || 'idle';
  const running = phase === 'countdown' || phase === 'question' || phase === 'reveal';
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {!running ? (
        <button className="btn-primary btn-xl col-span-2 sm:col-span-3" disabled={!!busy} onClick={() => act('start')}>▶ {phase === 'finished' ? t('newGame') : t('start')}</button>
      ) : (
        <>
          <button className="btn-primary btn-xl col-span-2 sm:col-span-1" disabled={!!busy} onClick={() => act('next')}>⏭ {phase === 'question' ? t('reveal') : t('next')}</button>
          {s?.paused
            ? <button className="btn-ok btn-xl" disabled={!!busy} onClick={() => act('resume')}>▶ {t('resume')}</button>
            : <button className="btn-soft btn-xl" disabled={!!busy} onClick={() => act('pause')}>⏸ {t('pause')}</button>}
          <button className="btn-soft btn-xl" disabled={!!busy} onClick={() => act('restart', t('confirmRestart'))}>↺ {t('restart')}</button>
          <button className="btn-danger btn-xl col-span-2 sm:col-span-3" disabled={!!busy} onClick={() => act('stop', t('confirmStop'))}>⏹ {t('stop')}</button>
        </>
      )}
      {phase === 'finished' && <button className="btn-soft col-span-2 sm:col-span-3" onClick={() => act('stop')}>✕ {t('ph_idle')}</button>}
    </section>
  );
}

function ProviderCard({ status }: { status: ProviderStatus | null }) {
  const { settings, saveSettings } = useApp();
  const { t, lang } = useI18n();
  const [type, setType] = useState<Settings['provider']['type']>(status && status.type !== 'none' ? status.type : settings.provider.type);
  const [username, setUsername] = useState(settings.provider.username || status?.username || '');
  const [busy, setBusy] = useState(false);
  const active = status && status.type !== 'none' && status.state !== 'idle';
  const connect = async () => {
    setBusy(true);
    try { await post('/api/provider/connect', { type, username }); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const disconnect = () => post('/api/provider/disconnect').catch((e) => toast(e.message, 'err'));
  const retryIn = status?.retryAt ? Math.max(0, Math.ceil((status.retryAt - Date.now()) / 1000)) : 0;
  const webhookUrl = `${location.origin}/api/ingest/comment`;
  return (
    <Section title={t('connection')} icon="📡">
      <Segmented value={type} onChange={(v) => setType(v)} options={(['tiktok', 'demo', 'manual', 'webhook'] as const).map((v) => ({ value: v, label: t('provider_' + v) }))} />
      <div className="mt-3 grid gap-2">
        {type === 'tiktok' && (
          <>
            <div className="flex gap-2">
              <span className="input !w-auto !px-3 text-white/50" dir="ltr">@</span>
              <input className="input" dir="ltr" placeholder={t('usernamePh')} value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, '').trim())} autoCapitalize="none" autoCorrect="off" />
            </div>
            <p className="text-xs muted">🔒 {t('noPassword')}</p>
            <p className="text-xs muted">ℹ️ {t('tiktokNote')}</p>
          </>
        )}
        {type === 'demo' && <p className="text-xs muted">🤖 {t('demoNote')}</p>}
        {type === 'manual' && <p className="text-xs muted">✍️ {t('manualNote')}</p>}
        {type === 'webhook' && (
          <div className="text-xs muted grid gap-1">
            <p>🔗 {t('webhookNote')}</p>
            <code className="block bg-black/30 rounded-xl p-2 break-all" dir="ltr">POST {webhookUrl}<br />X-Ingest-Key: {settings.provider.ingestKey}<br />{'{"username":"…","nickname":"…","comment":"…"}'}</code>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy || (type === 'tiktok' && !username)} onClick={connect}>{t('connect')}</button>
          {active && <button className="btn-soft" onClick={disconnect}>{t('disconnect')}</button>}
        </div>
        {type === 'tiktok' && (
          <label className="flex items-center gap-2 text-xs muted"><input type="checkbox" checked={settings.provider.autoReconnect} onChange={(e) => saveSettings({ provider: { autoReconnect: e.target.checked } })} /> auto-reconnect</label>
        )}
        {status && (
          <div className={cx('rounded-2xl px-3 py-2 text-sm border', status.state === 'connected' ? 'border-ok/40 bg-ok/10' : status.state === 'error' ? 'border-bad/40 bg-bad/10' : 'border-white/10 bg-white/5')}>
            <div className="flex items-center gap-2 font-bold">
              <span className={cx('w-2.5 h-2.5 rounded-full', status.state === 'connected' ? 'bg-ok animate-pulse' : status.state === 'error' ? 'bg-bad' : status.state === 'idle' ? 'bg-white/30' : 'bg-gold animate-pulse')} />
              {status.type !== 'none' && t('provider_' + status.type)} — {t('st_' + status.state)}{status.username ? ` @${status.username}` : ''}
            </div>
            {status.message && <div className="mt-1 text-xs">{lang === 'ar' ? status.message.ar : status.message.en}</div>}
            {status.state === 'reconnecting' && retryIn > 0 && <div className="text-xs muted">{t('retryIn')} {retryIn}s</div>}
            <div className="text-xs muted mt-1">{status.received} {t('received')}{status.viewers ? ` · ${status.viewers} ${t('viewers')}` : ''}</div>
          </div>
        )}
      </div>
    </Section>
  );
}

function RoundSetup() {
  const { meta, settings, saveSettings } = useApp();
  const { t, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const r = settings.round;
  const random = r.categories.length === 0;
  const save = (patch: Partial<Settings['round']>) => saveSettings({ round: patch });
  useEffect(() => { post('/api/game/preview', { round: r }).then(setStats).catch(() => {}); }, [JSON.stringify(r), JSON.stringify(settings.quota)]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const catOn = (id: string) => random || r.categories.includes(id);
  return (
    <section className="card">
      <button className="w-full flex items-center justify-between gap-2" onClick={() => setOpen((x) => !x)}>
        <span className="h-title">🎛️ {t('roundSetup')}</span>
        <span className="text-xs muted text-end">
          {random ? t('randomMode') : r.categories.map((c) => meta.categories.find((x) => x.id === c)?.icon).join(' ')} · {r.count} · {settings.timing.duration}s {open ? '▲' : '▼'}
        </span>
      </button>
      {stats && (
        <p className="text-xs muted mt-2">
          {t('available')}: <b className="text-white">{stats.pool}</b> · {t('willPlay')} <b className="text-white">{stats.returned}</b>/{stats.requested} —
          {' '}{t('arabRegion')} {stats.byRegion.arab || 0} · {t('worldRegion')} {stats.byRegion.world || 0} · {t('foreignRegion')} {stats.byRegion.foreign || 0}
          {stats.returned < stats.requested && <span className="text-bad"> · {t('notEnough')}</span>}
        </p>
      )}
      {open && (
        <div className="mt-3 grid gap-4 animate-rise">
          <button className={cx('chip justify-center py-2.5', random && 'chip-on')} onClick={() => save({ categories: [] })}>🎲 {t('randomMode')}</button>
          <div>
            <div className="text-sm font-bold mb-2">{t('categories')}</div>
            <div className="grid gap-2">
              {meta.categories.map((c) => {
                const on = catOn(c.id);
                return (
                  <div key={c.id} className={cx('rounded-2xl border p-2', on ? 'border-brand-violet/60 bg-brand-violet/10' : 'border-white/10 opacity-60')}>
                    <div className="flex items-center gap-2">
                      <button className="flex-1 text-start font-bold flex items-center gap-2" onClick={() => {
                        const base = random ? meta.categories.map((x) => x.id) : r.categories;
                        const next = toggle(base, c.id);
                        save({ categories: next.length === meta.categories.length ? [] : next.length ? next : [c.id] });
                      }}>
                        <span className={cx('w-5 h-5 rounded-md grid place-items-center text-xs', on ? 'grad-bg' : 'bg-white/10')}>{on ? '✓' : ''}</span>{c.icon} {tr(c.name)}
                      </button>
                      <button className="btn-ghost btn-sm text-xs" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>{t('subcats')} {expanded === c.id ? '▲' : '▼'}</button>
                    </div>
                    {expanded === c.id && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.subcategories.map((sc) => {
                          const key = `${c.id}/${sc.id}`;
                          const sOn = !r.excludeSubcategories.includes(key);
                          return <button key={key} className={cx('chip !text-xs', sOn && 'chip-on')} onClick={() => save({ excludeSubcategories: toggle(r.excludeSubcategories, key) })}>{tr(sc.name)}</button>;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold mb-2">{t('difficulty')}</div>
            <div className="flex flex-wrap gap-2">
              <button className={cx('chip', r.difficulties.length === 0 && 'chip-on')} onClick={() => save({ difficulties: [] })}>{t('all')}</button>
              {['easy', 'medium', 'hard'].map((x) => <button key={x} className={cx('chip', r.difficulties.includes(x) && 'chip-on')} onClick={() => save({ difficulties: toggle(r.difficulties, x) })}>{t(x)}</button>)}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold mb-2">{t('types')}</div>
            <div className="flex flex-wrap gap-2">
              <button className={cx('chip', r.types.length === 0 && 'chip-on')} onClick={() => save({ types: [] })}>{t('all')}</button>
              {meta.types.map((x) => <button key={x} className={cx('chip', r.types.includes(x) && 'chip-on')} onClick={() => save({ types: toggle(r.types, x) })}>{typeLabel(x, t)}</button>)}
            </div>
          </div>
          <Stepper label={t('count')} value={r.count} min={1} max={100} onChange={(v) => save({ count: v })} />
          <Stepper label={t('duration')} value={settings.timing.duration} min={5} max={180} step={5} onChange={(v) => saveSettings({ timing: { duration: v } })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.progressive} onChange={(e) => save({ progressive: e.target.checked })} /> {t('easy')} → {t('hard')}</label>
        </div>
      )}
    </section>
  );
}

export function typeLabel(type: string, t: (k: string) => string) {
  const map: Record<string, [string, string]> = {
    mcq: ['🔠', 'mcq'], open: ['💬', 'open'], complete: ['✍️', 'complete'], country: ['🌍', 'country'], capital: ['🏛️', 'capital'], flag: ['🚩', 'flag'], map: ['🗺️', 'map'],
    image_person: ['👤', 'image_person'], image_player: ['⚽', 'image_player'], logo: ['🛡️', 'logo'], landmark: ['🗿', 'landmark'],
  };
  const m = map[type];
  return m ? `${m[0]} ${t('ty_' + m[1])}` : type;
}

function CommentsCard({ comments }: { comments: CommentEntry[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong'>('all');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const list = useMemo(() => comments.filter((c) => filter === 'all' || (filter === 'correct' ? c.outcome === 'correct' : c.outcome === 'wrong' || c.outcome === 'one-attempt')).slice(0, 60), [comments, filter]);
  const send = async (markCorrect = false) => {
    if (!name.trim()) return;
    try {
      const r = await post('/api/game/manual', { nickname: name, text, markCorrect });
      toast(t('o_' + r.status) || r.status, r.status === 'correct' ? 'ok' : 'err');
      setText('');
    } catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <Section title={t('comments')} icon="💬">
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: t('f_all') }, { value: 'correct', label: `✅ ${t('f_correct')}` }, { value: 'wrong', label: `❌ ${t('f_wrong')}` }]} />
      <ul className="mt-3 max-h-72 overflow-y-auto grid gap-1 no-scrollbar">
        {list.length === 0 && <Empty>{t('noComments')}</Empty>}
        {list.map((c) => (
          <li key={c.id} className={cx('flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm', c.outcome === 'correct' ? 'bg-ok/10' : c.outcome === 'wrong' ? 'bg-bad/10' : 'bg-white/[.03]')}>
            <Avatar src={c.avatar} name={c.nickname} size={22} />
            <b className="truncate max-w-[35%]">{c.nickname}</b>
            <span className="truncate flex-1 text-white/80">{c.text}</span>
            <span className={cx('badge shrink-0', c.outcome === 'correct' ? 'bg-ok/25 text-ok' : c.outcome === 'wrong' ? 'bg-bad/25 text-bad' : 'bg-white/10 text-white/50')}>
              {c.outcome === 'correct' ? `${MEDALS[(c.rank || 1) - 1] || '✓'} +${c.points}` : t('o_' + c.outcome)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-white/10 pt-3 grid gap-2">
        <div className="text-sm font-bold">✍️ {t('manualEntry')}</div>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <input className="input" placeholder={t('name')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder={t('answer')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        </div>
        <div className="flex gap-2">
          <button className="btn-soft flex-1" onClick={() => send(false)} disabled={!name || !text}>{t('send')}</button>
          <button className="btn-ok flex-1" onClick={() => send(true)} disabled={!name}>✓ {t('markCorrect')}</button>
        </div>
      </div>
    </Section>
  );
}

function LeaderboardCard() {
  const { live } = useApp();
  const { t } = useI18n();
  const s = useLive(live).state;
  const [which, setWhich] = useState<'game' | 'all'>('game');
  const list = (which === 'game' ? s?.leaderboard : s?.allTime) || [];
  return (
    <Section title={t('leaderboard')} icon="🏆">
      <Segmented value={which} onChange={setWhich} options={[{ value: 'game', label: t('thisGame') }, { value: 'all', label: t('allTime') }]} />
      <ol className="mt-3 grid gap-1">
        {list.length === 0 && <Empty>{t('empty')}</Empty>}
        {list.map((b) => (
          <li key={b.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 bg-white/[.04]">
            <span className={cx('w-6 text-center font-display font-extrabold', b.rank === 1 ? 'text-gold' : b.rank === 2 ? 'text-silver' : b.rank === 3 ? 'text-bronze' : 'text-white/50')}>{b.rank}</span>
            <Avatar src={b.avatar} name={b.nickname} size={26} />
            <span className="flex-1 truncate font-semibold">{b.nickname}{b.demo && <span className="badge bg-white/10 ms-1">{t('demo')}</span>}</span>
            <span className="text-xs muted">{b.wins} 🥇 · {b.correct} ✓</span>
            <b className="text-gold tabular-nums">{b.points}</b>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function QR({ text, size = 132 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#0B0720', light: '#ffffff' } }).then(setSrc).catch(() => {}); }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt="QR" className="rounded-xl" /> : null;
}

export function CopyLink({ url }: { url: string }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2 items-center">
      <code className="flex-1 min-w-0 truncate text-xs bg-black/30 rounded-xl px-2 py-2" dir="ltr">{url}</code>
      <button className="btn-soft btn-sm" onClick={() => navigator.clipboard?.writeText(url).then(() => toast(t('copied')))}>{t('copy')}</button>
      <a className="btn-soft btn-sm" href={url} target="_blank" rel="noopener">{t('open')}</a>
    </div>
  );
}

function ScreensCard() {
  const { t } = useI18n();
  const [qr, setQr] = useState<string | null>(null);
  const base = location.origin;
  const links = [
    { label: t('screenLink'), url: `${base}/overlay?bg=animated` },
    { label: t('overlayLink'), url: `${base}/overlay` },
  ];
  return (
    <Section title={t('screens')} icon="📺">
      <div className="grid gap-3">
        {links.map((l) => (
          <div key={l.url} className="grid gap-1">
            <div className="flex items-center justify-between text-sm font-semibold"><span>{l.label}</span><button className="btn-ghost btn-sm text-xs" onClick={() => setQr(qr === l.url ? null : l.url)}>QR</button></div>
            <CopyLink url={l.url} />
            {qr === l.url && <div className="flex justify-center py-2"><QR text={l.url} size={160} /></div>}
          </div>
        ))}
      </div>
    </Section>
  );
}
