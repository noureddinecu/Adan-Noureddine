import { useEffect, useMemo, useRef, useState } from 'react';
import { createLive, remainingMs, useLive } from '../shared/live';
import { OVERLAY } from '../shared/i18n';
import { playSound, audioLocked, unlockAudio } from '../shared/sound';
import { confetti } from '../shared/confetti';
import { Avatar, cx, Logo } from '../shared/ui';
import type { Board, GameState, Meta, PublicQuestion, Seat } from '../shared/types';

const params = new URLSearchParams(location.search);
const BG = params.get('bg') || (location.pathname === '/screen' ? 'animated' : 'transparent');
const FORCED_LANG = params.get('lang') as 'ar' | 'fr' | 'en' | null;
const MUTED = params.get('sound') === '0';
const HIDE_BOARD = params.get('board') === '0';
const LETTERS: Record<string, string[]> = { ar: ['أ', 'ب', 'ج', 'د'], fr: ['A', 'B', 'C', 'D'], en: ['A', 'B', 'C', 'D'] };
const SEAT_CLASS = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];
const MEDALS = ['🥇', '🥈', '🥉', '🏅'];

const live = createLive(false);

function useTick(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(id); }, [ms]);
}

/** Scale the whole UI to the 9:16 frame width so it looks identical in OBS, LIVE Studio and on a phone. */
function useFrameScale() {
  useEffect(() => {
    const fit = () => {
      const w = Math.min(innerWidth, (innerHeight * 9) / 16);
      document.documentElement.style.fontSize = `${Math.max(11, Math.min(44, w / 25))}px`;
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);
}

export default function Overlay() {
  useFrameScale();
  const d = useLive(live);
  const s = d.state;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [locked, setLocked] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lang = FORCED_LANG || s?.config.lang || 'ar';
  const L = OVERLAY[lang] || OVERLAY.ar;
  const fx = s?.effects;
  const soundFx = useMemo(() => (fx && !MUTED ? fx : undefined), [fx]);

  useEffect(() => { fetch('/api/meta').then((r) => r.json()).then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // phase sounds + celebration
  const phaseKey = s ? `${s.phase}|${s.gameId}|${s.index}` : '';
  const prevKey = useRef('');
  useEffect(() => {
    if (!s || phaseKey === prevKey.current) return;
    prevKey.current = phaseKey;
    if (s.phase === 'question' && !s.paused) playSound('question', soundFx);
    if (s.phase === 'finished') {
      playSound('win', soundFx);
      if (fx?.confetti && !fx.lowFx) { confetti(canvas.current, 200); setTimeout(() => confetti(canvas.current, 140), 900); }
    }
    setTimeout(() => setLocked(audioLocked()), 300);
  }, [phaseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => live.onFx((e) => {
    const cur = live.get().state;
    if (e.type === 'first') { playSound('first', soundFx); if (cur?.effects.confetti && !cur.effects.lowFx) confetti(canvas.current, 120); }
    else if (e.type === 'correct') playSound('correct', soundFx);
    else if (e.type === 'wrong') playSound('wrong', soundFx);
  }), [soundFx]);

  // countdown ticks in the last 5 seconds
  useTick(250);
  const remain = remainingMs(s, d.clockOffset);
  const secs = Math.ceil(remain / 1000);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (s?.phase === 'question' && !s.paused && secs <= 5 && secs > 0 && secs !== lastTick.current) { lastTick.current = secs; playSound('tick', soundFx); }
    if (s?.phase !== 'question') lastTick.current = -1;
  });

  const lowFx = !!fx?.lowFx;
  return (
    <div className={cx('h-[100dvh] w-full flex justify-center', lowFx && 'low-fx')}>
      {BG === 'animated' && <div className="bg-orbs"><i /></div>}
      {BG === 'solid' && <div className="fixed inset-0 -z-10 bg-ink" />}
      <div className="relative h-full flex flex-col gap-[0.6rem] px-[0.8rem] py-[0.9rem] overflow-hidden" style={{ width: 'min(100vw, calc(100dvh * 9 / 16))' }}>
        {!s ? <Splash L={L} board={[]} /> : <Stage s={s} meta={meta} lang={lang} L={L} remain={remain} secs={secs} />}
        {!d.online && <div className="absolute top-1 inset-x-0 text-center text-[0.5rem] text-white/50">● reconnecting…</div>}
      </div>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 w-full h-full" />
      {locked && !MUTED && fx?.sound && (
        <button className="fixed bottom-3 start-3 btn-soft btn-sm text-xs" onClick={async () => { await unlockAudio(); setLocked(false); }}>{L.tapSound}</button>
      )}
    </div>
  );
}

function Stage({ s, meta, lang, L, remain, secs }: { s: GameState; meta: Meta | null; lang: string; L: Record<string, string>; remain: number; secs: number }) {
  const q = s.question;
  const cat = q && meta?.categories.find((c) => c.id === q.category);
  const showBoard = s.config.showLeaderboard && !HIDE_BOARD;

  if (s.phase === 'idle') return <Splash L={L} board={showBoard ? s.allTime : []} />;
  if (s.phase === 'finished') return <Finale s={s} L={L} />;
  if (s.phase === 'countdown') {
    return (
      <div className="flex-1 grid place-items-center text-center">
        <div>
          <Logo size={64} />
          <div className="mt-6 font-display text-[2rem] font-extrabold grad-text">{L.ready}</div>
          <div key={secs} className="font-display font-extrabold text-[6rem] leading-none animate-pop">{s.paused ? '⏸' : secs || '🚀'}</div>
          <div className="mt-2 text-[0.85rem] text-white/70">{L.firstN.replace('{n}', String(s.config.winners))}</div>
        </div>
      </div>
    );
  }
  if (!q) return null;
  const reveal = s.phase === 'reveal';
  const seats = reveal ? s.result?.winners || [] : q.seats;
  return (
    <>
      <header className="flex items-center gap-[0.4rem]">
        <span className="glass !rounded-full px-[0.6rem] py-[0.25rem] text-[0.7rem] font-bold truncate">{cat ? `${cat.icon} ${cat.name[lang as 'ar'] || cat.name.ar}` : ''}</span>
        <span className={cx('rounded-full px-[0.55rem] py-[0.25rem] text-[0.65rem] font-bold', q.difficulty === 'easy' ? 'bg-ok/25' : q.difficulty === 'medium' ? 'bg-gold/25' : 'bg-bad/30')}>{L[q.difficulty]}</span>
        <span className="ms-auto glass !rounded-full px-[0.6rem] py-[0.25rem] text-[0.7rem] font-bold whitespace-nowrap">{L.question} {s.index + 1}/{s.total}</span>
        <TimerRing remain={remain} total={reveal ? s.reveal * 1000 : s.duration * 1000} secs={secs} active={!reveal && !s.paused} />
      </header>

      <QuestionCard q={q} lang={lang} reveal={reveal} s={s} L={L} />

      <div className="grid gap-[0.35rem]">
        {Array.from({ length: s.config.winners }, (_, i) => <SeatRow key={i} index={i} seat={seats.find((w) => w.rank === i + 1)} L={L} />)}
      </div>

      {reveal ? (
        <RevealBar s={s} lang={lang} L={L} />
      ) : (
        s.config.showFeed && <Feed q={q} L={L} />
      )}

      {reveal && showBoard && s.leaderboard.length > 0 && <MiniBoard board={s.leaderboard.slice(0, 5)} L={L} />}

      {s.paused && (
        <div className="absolute inset-0 grid place-items-center bg-ink/60 backdrop-blur-sm">
          <div className="font-display text-[1.8rem] font-extrabold animate-pop">{L.paused}</div>
        </div>
      )}
    </>
  );
}

function TimerRing({ remain, total, secs, active }: { remain: number; total: number; secs: number; active: boolean }) {
  const frac = total ? Math.max(0, Math.min(1, remain / total)) : 0;
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const urgent = active && secs <= 5;
  return (
    <span className={cx('relative grid place-items-center w-[2.4rem] h-[2.4rem] shrink-0', urgent && 'animate-pulse')}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="rgba(11,7,32,.6)" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={urgent ? '#FB7185' : 'url(#tg)'} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset .25s linear' }} />
        <defs><linearGradient id="tg"><stop offset="0" stopColor="#22D3EE" /><stop offset="1" stopColor="#EC4899" /></linearGradient></defs>
      </svg>
      <span className="relative font-display font-extrabold text-[0.85rem]">{active ? secs : '•'}</span>
    </span>
  );
}

function QuestionCard({ q, lang, reveal, s, L }: { q: PublicQuestion; lang: string; reveal: boolean; s: GameState; L: Record<string, string> }) {
  const text = q.text[lang as 'ar'] || q.text.ar || q.text.en;
  const isMap = q.type === 'map';
  const isFlag = q.type === 'flag';
  return (
    <div key={q.id} className="glass p-[0.7rem] flex flex-col gap-[0.55rem] animate-rise shadow-glow">
      <p className="font-display font-extrabold text-center leading-snug text-[1.12rem]">{text}</p>
      {q.image && (
        isMap ? <div className="map-shape mx-auto w-full h-[22vh] max-h-[11rem]" style={{ ['--map' as any]: `url("${q.image}")` }} />
          : <img src={q.image} alt="" className={cx('mx-auto max-h-[22vh] max-w-full object-contain', isFlag ? 'rounded-lg shadow-[0_8px_30px_rgba(0,0,0,.5)] h-[16vh]' : 'rounded-2xl')} />
      )}
      {q.answerMode === 'choice' ? (
        <div className="grid grid-cols-2 gap-[0.4rem]">
          {q.choices.map((c, i) => {
            const correct = reveal && s.result?.correctIndex === i;
            return (
              <div key={i} className={cx('flex items-center gap-[0.45rem] rounded-2xl px-[0.5rem] py-[0.45rem] border transition-all duration-500',
                correct ? 'bg-ok/30 border-ok scale-[1.03] shadow-[0_0_24px_rgba(52,211,153,.5)]' : reveal ? 'opacity-35 border-white/10 bg-white/5' : 'bg-white/[.08] border-white/10')}>
                <span className={cx('grid place-items-center shrink-0 w-[1.6rem] h-[1.6rem] rounded-full font-display font-extrabold text-[0.85rem]', correct ? 'bg-ok text-ink' : 'grad-bg')}>{(LETTERS[lang] || LETTERS.ar)[i]}</span>
                <span className="font-bold text-[0.85rem] leading-tight">{c[lang as 'ar'] || c.ar || c.en}</span>
              </div>
            );
          })}
        </div>
      ) : (
        q.hint && <HiddenLetters words={reveal ? null : q.hint.words} answer={reveal ? (s.result?.answer[lang as 'ar'] || s.result?.answer.ar || '') : ''} />
      )}
      {!reveal && <div className="text-center text-[0.72rem] font-bold text-brand-cyan">{q.answerMode === 'choice' ? L.typeLetter : L.typeAnswer}</div>}
    </div>
  );
}

function HiddenLetters({ words, answer }: { words: string[][] | null; answer: string }) {
  const list = words || answer.split(/\s+/).map((w) => [...w]);
  return (
    <div className="flex flex-wrap justify-center gap-x-[0.7rem] gap-y-[0.3rem]" dir="auto">
      {list.map((w, i) => (
        <span key={i} className="flex gap-[0.18rem]">
          {w.map((ch, j) => (
            <span key={j} className={cx('grid place-items-center w-[1.35rem] h-[1.6rem] rounded-md font-display font-extrabold text-[0.9rem] border',
              ch === '_' ? 'bg-white/5 border-white/25' : words ? 'bg-brand-violet/40 border-brand-violet animate-pop' : 'bg-ok/30 border-ok animate-pop')}>{ch === '_' ? '' : ch}</span>
          ))}
        </span>
      ))}
    </div>
  );
}

function SeatRow({ index, seat, L }: { index: number; seat?: Seat; L: Record<string, string> }) {
  const cls = SEAT_CLASS[index] || 'seat-x';
  if (!seat) {
    return (
      <div className="flex items-center gap-[0.5rem] rounded-2xl border border-dashed border-white/15 bg-white/[.03] px-[0.55rem] py-[0.3rem] h-[2.2rem]">
        <span className="text-[0.9rem] opacity-60">{MEDALS[index] || `#${index + 1}`}</span>
        <span className="text-[0.7rem] text-white/35">…</span>
      </div>
    );
  }
  return (
    <div key={seat.nickname} className={cx('relative overflow-hidden flex items-center gap-[0.5rem] rounded-2xl border px-[0.55rem] py-[0.3rem] h-[2.2rem] animate-pop', cls)}>
      {index === 0 && <span className="absolute inset-0 shine pointer-events-none" />}
      <span className={cx('text-[1rem]', index === 0 && 'animate-wiggle')}>{MEDALS[index] || `#${index + 1}`}</span>
      <Avatar src={seat.avatar} name={seat.nickname} size={26} className={index === 0 ? 'ring-2 ring-gold animate-pulseRing' : 'ring-1 ring-white/30'} />
      <span className="font-bold text-[0.8rem] truncate flex-1">{seat.nickname}</span>
      <span className="text-[0.6rem] text-white/60 tabular-nums">{(seat.ms / 1000).toFixed(1)}s</span>
      <span className="font-display font-extrabold text-[0.85rem] text-gold tabular-nums">+{seat.points}</span>
      <span className="sr-only">{L.pts}</span>
    </div>
  );
}

function Feed({ q, L }: { q: PublicQuestion; L: Record<string, string> }) {
  const items = q.feed.slice(-4).reverse();
  return (
    <div className="flex flex-col gap-[0.25rem] min-h-0">
      {items.map((f) => (
        <div key={f.id} className={cx('flex items-center gap-[0.4rem] rounded-full ps-[0.2rem] pe-[0.6rem] py-[0.15rem] text-[0.66rem] w-fit max-w-full animate-rise', f.correct ? 'bg-ok/20' : 'bg-black/35')}>
          <Avatar src={f.avatar} name={f.nickname} size={18} />
          <b className="truncate max-w-[45%]">{f.nickname}</b>
          <span className={cx('truncate', f.correct ? 'text-ok font-bold' : 'text-white/75')}>{f.correct ? L.answered : f.text}</span>
        </div>
      ))}
    </div>
  );
}

function RevealBar({ s, lang, L }: { s: GameState; lang: string; L: Record<string, string> }) {
  const r = s.result;
  if (!r) return null;
  return (
    <div className="glass px-[0.7rem] py-[0.5rem] text-center animate-pop">
      <div className="text-[0.65rem] text-white/60">{L.answer}</div>
      <div className="font-display font-extrabold text-[1.15rem] text-ok">{r.answer[lang as 'ar'] || r.answer.ar}</div>
      {!r.winners.length && <div className="text-[0.75rem] text-white/70">{L.noWinner}</div>}
    </div>
  );
}

function MiniBoard({ board, L }: { board: Board[]; L: Record<string, string> }) {
  return (
    <div className="glass p-[0.5rem] animate-rise">
      <div className="text-[0.7rem] font-bold mb-[0.25rem]">🏆 {L.top}</div>
      {board.map((b) => (
        <div key={b.id} className="flex items-center gap-[0.4rem] py-[0.12rem] text-[0.68rem]">
          <span className="w-[1rem] text-center font-bold text-white/60">{b.rank}</span>
          <Avatar src={b.avatar} name={b.nickname} size={18} />
          <span className="flex-1 truncate font-semibold">{b.nickname}</span>
          <span className="font-display font-extrabold text-gold tabular-nums">{b.points}</span>
        </div>
      ))}
    </div>
  );
}

function Splash({ L, board }: { L: Record<string, string>; board: Board[] }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[0.8rem] text-center">
      <img src="/logo.svg" alt="" className="w-[5.5rem] h-[5.5rem] animate-pop drop-shadow-[0_10px_40px_rgba(236,72,153,.6)]" />
      <div className="font-display font-extrabold text-[1.9rem] leading-none" dir="ltr"><span>LIVE </span><span className="grad-text">QUIZ</span><span> GAME</span></div>
      <div className="font-display text-[1.2rem] font-bold">{L.waiting}</div>
      <div className="text-[0.85rem] text-white/70">{L.waitingSub}</div>
      {board.length > 0 && <div className="w-full mt-[0.5rem]"><MiniBoard board={board.slice(0, 5)} L={{ ...L, top: L.allTime }} /></div>}
    </div>
  );
}

function Finale({ s, L }: { s: GameState; L: Record<string, string> }) {
  const top = s.final?.top || [];
  const [a, b, c] = top;
  const step = (e: Board | undefined, h: string, medal: string, ring: string) => e && (
    <div className="flex flex-col items-center gap-[0.25rem] flex-1 min-w-0 animate-rise">
      <Avatar src={e.avatar} name={e.nickname} size={44} className={ring} />
      <div className="text-[0.7rem] font-bold truncate max-w-full">{e.nickname}</div>
      <div className="text-[0.65rem] text-gold font-bold">{e.points} {L.pts}</div>
      <div className={cx('w-full rounded-t-2xl grid place-items-center text-[1.4rem]', h)}>{medal}</div>
    </div>
  );
  return (
    <div className="flex-1 flex flex-col gap-[0.7rem] justify-center">
      <div className="text-center font-display font-extrabold text-[1.8rem] grad-text animate-pop">{L.finished}</div>
      {a && (
        <div className="glass p-[0.8rem] flex flex-col items-center text-center gap-[0.3rem] shadow-glow animate-pop">
          <div className="text-[2rem] animate-wiggle">👑</div>
          <Avatar src={a.avatar} name={a.nickname} size={78} className="ring-4 ring-gold animate-pulseRing" />
          <div className="text-[0.75rem] text-white/70">{L.champion}</div>
          <div className="font-display font-extrabold text-[1.4rem]">{a.nickname}</div>
          <div className="font-display font-extrabold text-gold text-[1.1rem]">{a.points} {L.pts}</div>
        </div>
      )}
      <div className="flex items-end gap-[0.5rem] px-[0.5rem]">
        {step(b, 'h-[3.5rem] bg-gradient-to-b from-silver/70 to-silver/20', '🥈', 'ring-2 ring-silver')}
        {step(a, 'h-[5rem] bg-gradient-to-b from-gold/80 to-gold/20', '🥇', 'ring-2 ring-gold')}
        {step(c, 'h-[2.6rem] bg-gradient-to-b from-bronze/70 to-bronze/20', '🥉', 'ring-2 ring-bronze')}
      </div>
      {top.length > 3 && <MiniBoard board={top.slice(3, 10)} L={L} />}
      <div className="text-center text-[0.85rem] text-white/80">{L.thanks}</div>
    </div>
  );
}
