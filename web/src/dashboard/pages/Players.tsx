import { useEffect, useState } from 'react';
import { api, del, post } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Avatar, Empty, Sheet, cx, fmtTime, toast } from '../../shared/ui';
import type { Player } from '../../shared/types';

export default function PlayersPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('points');
  const [data, setData] = useState<{ total: number; players: Player[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api(`/api/players?q=${encodeURIComponent(q)}&sort=${sort}`).then(setData).catch((e) => toast(e.message, 'err'));
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [q, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const bulk = async (what: 'reset' | 'demo') => {
    if (what === 'reset' && !confirm(t('confirmReset'))) return;
    try { await post(what === 'reset' ? '/api/players/reset' : '/api/players/remove-demo'); toast(t('saved')); load(); } catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <input className="input" placeholder={`🔍 ${t('search')}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="points" className="bg-ink">{t('sortPoints')}</option><option value="wins" className="bg-ink">{t('sortWins')}</option><option value="recent" className="bg-ink">{t('sortRecent')}</option>
        </select>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="btn-danger btn-sm" onClick={() => bulk('reset')}>↺ {t('resetScores')}</button>
        <button className="btn-soft btn-sm" onClick={() => bulk('demo')}>🤖 {t('removeDemo')}</button>
        <span className="ms-auto text-xs muted self-center">{data?.total ?? 0} {t('players')}</span>
      </div>
      <div className="grid gap-2">
        {data?.players.length === 0 && <Empty>{t('noPlayers')}</Empty>}
        {data?.players.map((p) => (
          <button key={p.id} onClick={() => setOpen(p.id)} className="glass !rounded-2xl px-3 py-2.5 flex items-center gap-3 text-start active:scale-[.99] transition">
            <span className={cx('w-7 text-center font-display font-extrabold', p.rank === 1 ? 'text-gold' : p.rank === 2 ? 'text-silver' : p.rank === 3 ? 'text-bronze' : 'text-white/50')}>{p.rank ?? '–'}</span>
            <Avatar src={p.avatar} name={p.nickname} size={38} />
            <span className="flex-1 min-w-0">
              <span className="block font-bold truncate">{p.nickname} {p.is_demo ? <span className="badge bg-white/10">{t('demo')}</span> : null}{p.banned ? <span className="badge bg-bad/20 text-bad">{t('banned')}</span> : null}</span>
              <span className="block text-xs muted truncate" dir="ltr">{p.platform}{p.unique_id ? ` · @${p.unique_id}` : ''}</span>
            </span>
            <span className="text-end">
              <span className="block font-display font-extrabold text-gold">{p.points}</span>
              <span className="block text-[11px] muted">{p.wins}🥇 · {p.correct}✓</span>
            </span>
          </button>
        ))}
      </div>
      {open && <PlayerSheet id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function PlayerSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useI18n();
  const [d, setD] = useState<any>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const load = () => api(`/api/players/${encodeURIComponent(id)}`).then(setD).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const p: Player = d.player;
  const enc = encodeURIComponent(id);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); toast(t('saved')); load(); onChanged(); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <Sheet open onClose={onClose} title={p.nickname} footer={(
      <>
        <button className="btn-danger me-auto" onClick={async () => { if (confirm(t('confirmDelete'))) { await del(`/api/players/${enc}`); onChanged(); onClose(); } }}>🗑 {t('delete')}</button>
        <button className="btn-soft" onClick={() => act(() => post(`/api/players/${enc}/ban`, { banned: !p.banned }))}>{p.banned ? t('unban') : `🚫 ${t('ban')}`}</button>
      </>
    )}>
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Avatar src={p.avatar} name={p.nickname} size={64} />
          <div className="min-w-0">
            <div className="font-display font-extrabold text-xl truncate">{p.nickname}</div>
            <div className="text-xs muted" dir="ltr">{p.platform}{p.unique_id ? ` · @${p.unique_id}` : ''}</div>
            <div className="text-xs muted">{fmtTime(p.last_seen, lang)}</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[[t('pts'), p.points, 'text-gold'], [t('wins'), p.wins, ''], [t('correct'), p.correct, 'text-ok'], [t('attemptsN'), p.attempts, '']].map(([l, v, c]) => (
            <div key={String(l)} className="rounded-2xl bg-white/5 py-2"><div className={cx('font-display font-extrabold text-xl', String(c))}>{v}</div><div className="text-[11px] muted">{l}</div></div>
          ))}
        </div>
        <div className="grid gap-2">
          <div className="font-bold text-sm">{t('adjust')}</div>
          <div className="grid grid-cols-[6rem_1fr_auto] gap-2">
            <input className="input" inputMode="numeric" placeholder="+50 / -20" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} />
            <input className="input" placeholder={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-primary" disabled={!Number(delta)} onClick={() => act(async () => { await post(`/api/players/${enc}/adjust`, { delta: Number(delta), reason }); setDelta(''); setReason(''); })}>{t('apply')}</button>
          </div>
          {d.adjustments.length > 0 && <ul className="text-xs muted grid gap-0.5">{d.adjustments.map((a: any) => <li key={a.id}>{a.delta > 0 ? '+' : ''}{a.delta} · {a.reason || '—'} · {fmtTime(a.at, lang)}</li>)}</ul>}
        </div>
        <div className="grid gap-1.5">
          <div className="font-bold text-sm">{t('answersLog')}</div>
          {d.answers.length === 0 && <Empty>{t('empty')}</Empty>}
          {d.answers.map((a: any) => (
            <div key={a.id} className={cx('flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm', a.correct ? 'bg-ok/10' : 'bg-white/[.04]')}>
              <span>{a.correct ? (['🥇', '🥈', '🥉', '🏅'][a.rank - 1] || '✓') : '✗'}</span>
              <span className="flex-1 truncate">{a.text}</span>
              <span className="text-[11px] muted" dir="ltr">{a.question_id}</span>
              {a.correct ? <b className="text-gold">+{a.points}</b> : null}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
