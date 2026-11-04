import { useEffect, useState } from 'react';
import { api, del } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Avatar, Empty, Sheet, fmtTime, toast } from '../../shared/ui';
import type { GameRow } from '../../shared/types';

export default function HistoryPage() {
  const { t, lang } = useI18n();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api('/api/history').then((r) => setGames(r.games)).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  if (!games) return <Empty>…</Empty>;
  if (!games.length) return <Empty>{t('noGames')}</Empty>;
  return (
    <div className="grid gap-2">
      {games.map((g) => (
        <button key={g.id} onClick={() => setOpen(g.id)} className="glass !rounded-2xl p-3 flex items-center gap-3 text-start active:scale-[.99] transition">
          <span className="text-2xl">{g.status === 'running' ? '🔴' : '🏆'}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold">{fmtTime(g.started_at, lang)}</span>
            <span className="block text-xs muted">{g.questions_played} {t('questionsPlayed')} · {g.players_count} {t('playersN')}{g.ended_at ? ` · ${Math.round((g.ended_at - g.started_at) / 60000)} min` : ` · ${t('running')}`}</span>
          </span>
          {g.champion_name && (
            <span className="flex items-center gap-2">
              <Avatar src={g.champion_avatar || ''} name={g.champion_name} size={32} />
              <span className="text-end"><span className="block text-sm font-bold max-w-[7rem] truncate">{g.champion_name}</span><span className="block text-xs text-gold">{g.champion_points}</span></span>
            </span>
          )}
        </button>
      ))}
      {open && <GameSheet id={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function GameSheet({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const { t, tr, lang } = useI18n();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api(`/api/history/${encodeURIComponent(id)}`).then(setD).catch((e) => toast(e.message, 'err')); }, [id]);
  if (!d) return null;
  const g = d.game;
  return (
    <Sheet open onClose={onClose} title={`🏆 ${fmtTime(g.started_at, lang)}`} footer={<button className="btn-danger" onClick={async () => { if (confirm(t('confirmDelete'))) { await del(`/api/history/${encodeURIComponent(id)}`); onDeleted(); } }}>🗑 {t('delete')}</button>}>
      <div className="grid gap-4">
        <ol className="grid gap-1">
          {g.top.length === 0 && <Empty>{t('empty')}</Empty>}
          {g.top.map((b: any) => (
            <li key={b.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 bg-white/[.04]">
              <span className="w-6 text-center font-display font-extrabold">{['🥇', '🥈', '🥉'][b.rank - 1] || b.rank}</span>
              <Avatar src={b.avatar} name={b.nickname} size={26} />
              <span className="flex-1 truncate font-semibold">{b.nickname}</span>
              <span className="text-xs muted">{b.wins}🥇 · {b.correct}✓</span>
              <b className="text-gold">{b.points}</b>
            </li>
          ))}
        </ol>
        <div className="grid gap-1">
          <div className="font-bold text-sm">{t('questions')} ({g.questions_played}/{d.questions.length})</div>
          {d.questions.map((q: any, i: number) => <div key={q.id} className="text-sm muted truncate">{i + 1}. {tr(q.text)}</div>)}
        </div>
      </div>
    </Sheet>
  );
}
