// محرك اللعبة: أول أربعة فائزين، الإيقاف المؤقت، إعادة الجولة، الحروف المخفية، حفظ الحالة
// Game engine: first-N correct answers (default 4: 100/70/50/30), pause/resume, restart,
// progressive hidden-letter hints, persisted state (survives a server restart, resumes paused).
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { selectQuestions } from '../questions/selector.js';
import { answerMode, acceptedAnswers, displayAnswer, LANGS } from '../questions/schema.js';
import { matchesAnswer, parseChoice, looseTokens } from '../questions/normalize.js';

const FEED_SIZE = 8;
const TEXT_RETRY_MS = 600; // a user can retry a typed answer at most every 0.6 s
const HINT_STEPS = [0.4, 0.7]; // reveal letters at 40% and 70% of the question time

/** Mask an answer for the "hidden letters" display. level 0: all hidden, 1: first letters, 2: more letters. */
export function maskAnswer(answer, level = 0) {
  return String(answer || '').trim().split(/\s+/).filter(Boolean).map((word) => [...word].map((ch, i) => {
    if (!/[\p{L}\p{N}]/u.test(ch)) return ch;
    if (level >= 1 && i === 0) return ch;
    if (level >= 2 && word.length > 3 && i % 3 === 2) return ch;
    return '_';
  }));
}

export class GameEngine extends EventEmitter {
  constructor({ store, players, history, settings, kv, now = () => Date.now(), timers = { setTimeout, clearTimeout }, rng = Math.random }) {
    super();
    Object.assign(this, { store, players, history, settings, kv, now, timers, rng });
    this.timerIds = [];
    this.recentIds = [];
    this.pendingEmit = null;
    this.providerName = '';
    this.resetState();
    this.restore();
  }

  resetState() {
    this.clearTimers();
    this.phase = 'idle'; // idle | countdown | question | reveal | finished
    this.paused = false;
    this.pausedRemaining = null;
    this.phaseEndsAt = null;
    this.game = null; // { id, questions, index, snapshot }
    this.current = null;
    this.lastResult = null;
    this.finalResult = null;
  }

  // ---------- timers ----------
  clearTimers() {
    for (const t of this.timerIds) this.timers.clearTimeout(t);
    this.timerIds = [];
  }
  after(ms, fn) {
    const id = this.timers.setTimeout(() => { this.timerIds = this.timerIds.filter((x) => x !== id); fn(); }, Math.max(0, ms));
    this.timerIds.push(id);
  }
  get cfg() { return this.game?.snapshot || this.settings.get(); }

  /** Arm the timers for the current phase with `remaining` ms left. */
  arm(remaining) {
    this.clearTimers();
    this.phaseEndsAt = this.now() + remaining;
    const t = this.cfg.timing;
    if (this.phase === 'countdown') this.after(remaining, () => this.nextQuestion());
    else if (this.phase === 'reveal') { if (t.autoAdvance) this.after(remaining, () => this.nextQuestion()); else this.phaseEndsAt = null; }
    else if (this.phase === 'question') {
      this.after(remaining, () => this.closeQuestion('timeout'));
      const total = t.duration * 1000;
      for (const step of HINT_STEPS) {
        const at = total * step - (total - remaining);
        if (at > 0) this.after(at, () => this.changed());
      }
    }
  }

  // ---------- round lifecycle ----------
  preview(overrides = {}) {
    const s = this.settings.get();
    return selectQuestions(this.store.all(), this.selectionOptions({ ...s, round: { ...s.round, ...overrides } }), this.rng).stats;
  }

  selectionOptions(s) {
    return { ...s.round, quota: s.quota, recentIds: this.recentIds, maxAgeDays: this.store.maxAgeDays };
  }

  start() {
    if (this.game && this.phase !== 'finished') this.finishRound('stopped');
    const snapshot = structuredClone(this.settings.get());
    const { questions, stats } = selectQuestions(this.store.all(), this.selectionOptions(snapshot), this.rng);
    if (!questions.length) return { ok: false, error: 'لا توجد أسئلة منشورة تطابق الإعدادات / no published questions match these settings', stats };
    this.resetState();
    this.game = { id: `g_${this.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`, questions, index: -1, snapshot };
    this.history.create({ id: this.game.id, settings: snapshot, questionIds: questions.map((q) => q.id), provider: this.providerName });
    this.beginCountdown();
    return { ok: true, stats, gameId: this.game.id };
  }

  beginCountdown() {
    const delay = this.cfg.timing.startDelay * 1000;
    this.phase = 'countdown';
    if (delay > 0) this.arm(delay);
    else return this.nextQuestion();
    this.changed(true);
  }

  restartRound() {
    if (!this.game) return { ok: false, error: 'لا توجد جولة / no round' };
    this.players.revertGame(this.game.id);
    const { id, questions, snapshot } = this.game;
    this.resetState();
    this.game = { id, questions, index: -1, snapshot };
    this.beginCountdown();
    return { ok: true };
  }

  nextQuestion() {
    this.clearTimers();
    if (!this.game) return;
    this.paused = false;
    this.pausedRemaining = null;
    this.game.index++;
    if (this.game.index >= this.game.questions.length) return this.finishRound('finished');
    const q = this.game.questions[this.game.index];
    const order = q.choices.map((_, i) => i);
    if (this.cfg.display.shuffleChoices && answerMode(q) === 'choice') {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    this.current = this.buildCurrent(q, order);
    this.phase = 'question';
    this.recentIds = [...this.recentIds.filter((x) => x !== q.id), q.id].slice(-300);
    this.arm(this.cfg.timing.duration * 1000);
    this.emit('question', { index: this.game.index });
    this.changed(true);
  }

  buildCurrent(q, order, extra = {}) {
    const accepted = acceptedAnswers(q);
    return {
      q,
      order,
      choices: order.map((i) => q.choices[i]),
      correctIndex: answerMode(q) === 'choice' ? order.indexOf(q.correct) : null,
      accepted,
      maxAnswerTokens: Math.max(1, ...accepted.map((a) => looseTokens(a).length)),
      startedAt: this.now(),
      pausedTotal: 0,
      pausedAt: null,
      winners: [],
      attempted: new Set(),
      lastTry: new Map(),
      attempts: 0,
      feed: [],
      feedSeq: 0,
      ...extra,
    };
  }

  /** Time the current question has actually been open (pauses excluded). */
  activeElapsed() {
    const c = this.current;
    if (!c) return 0;
    const end = c.pausedAt ?? this.now();
    return Math.max(0, end - c.startedAt - c.pausedTotal);
  }

  closeQuestion(reason = 'timeout') {
    if (this.phase !== 'question') return;
    this.clearTimers();
    const c = this.current;
    if (c.pausedAt != null) { c.pausedTotal += this.now() - c.pausedAt; c.pausedAt = null; }
    this.paused = false;
    this.pausedRemaining = null;
    this.lastResult = {
      reason,
      winners: c.winners.map(publicWinner),
      answer: displayAnswer(c.q),
      correctIndex: c.correctIndex,
      source: c.q.source,
      notes: '',
    };
    this.phase = 'reveal';
    this.history.progress(this.game.id, this.game.index + 1);
    this.arm(this.cfg.timing.reveal * 1000);
    this.emit('reveal', this.lastResult);
    this.changed(true);
  }

  finishRound(status = 'finished') {
    this.clearTimers();
    if (!this.game) return;
    const played = Math.min(this.game.questions.length, this.game.index + (this.phase === 'reveal' || this.phase === 'finished' ? 1 : this.phase === 'question' ? 1 : 0));
    const top = this.players.gameTop(this.game.id, 10);
    this.history.finish(this.game.id, { top, questionsPlayed: played, status });
    this.phase = 'finished';
    this.paused = false;
    this.pausedRemaining = null;
    this.phaseEndsAt = null;
    this.current = null;
    this.finalResult = { champion: top[0] || null, top, questions: played, total: this.game.questions.length, status };
    this.emit('finished', this.finalResult);
    this.changed(true);
  }

  /** Dashboard "Next": close the open question, or move on from countdown / reveal. */
  next() {
    if (this.paused) this.resume();
    if (this.phase === 'question') this.closeQuestion('skipped');
    else if (this.phase === 'reveal' || this.phase === 'countdown') this.nextQuestion();
    return { ok: true };
  }

  stop() {
    if (this.phase === 'idle') return { ok: true };
    if (this.phase === 'finished') { this.resetState(); this.changed(true); return { ok: true }; }
    this.finishRound('finished');
    return { ok: true };
  }

  pause() {
    if (this.paused || !['countdown', 'question', 'reveal'].includes(this.phase)) return { ok: false };
    this.pausedRemaining = this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.now()) : null;
    this.clearTimers();
    this.phaseEndsAt = null;
    this.paused = true;
    if (this.current && this.phase === 'question') this.current.pausedAt = this.now();
    this.changed(true);
    return { ok: true };
  }

  resume() {
    if (!this.paused) return { ok: false };
    this.paused = false;
    if (this.current?.pausedAt != null) { this.current.pausedTotal += this.now() - this.current.pausedAt; this.current.pausedAt = null; }
    const remaining = this.pausedRemaining ?? (this.phase === 'reveal' ? this.cfg.timing.reveal * 1000 : 0);
    this.pausedRemaining = null;
    if (this.phase === 'reveal' && !this.cfg.timing.autoAdvance) { this.phaseEndsAt = null; this.changed(true); return { ok: true }; }
    this.arm(remaining);
    this.changed(true);
    return { ok: true };
  }

  // ---------- answers ----------
  /**
   * Process one normalized comment {platform, userId, uniqueId, nickname, avatar, text, receivedAt}.
   * Comments are processed strictly in arrival order (single-threaded), so rank = arrival order.
   */
  handleComment(c) {
    if (this.phase !== 'question' || !this.current) return { status: 'closed' };
    if (this.paused) return { status: 'paused' };
    if (!c?.userId || !c.text) return { status: 'invalid' };
    c = { ...c, platform: c.platform || 'manual', receivedAt: c.receivedAt ?? this.now() };
    const cur = this.current;
    const cfg = this.cfg;
    const playerId = `${c.platform}:${c.userId}`;
    if (cur.winners.some((w) => w.playerId === playerId)) return { status: 'already-won' };
    if (cur.winners.length >= cfg.scoring.winners) return { status: 'seats-full' };

    let correct;
    if (answerMode(cur.q) === 'choice') {
      const idx = parseChoice(c.text, cur.choices);
      if (idx === -1) return { status: 'ignored' }; // ordinary chat, not an answer
      if (cur.attempted.has(playerId)) return { status: 'one-attempt' };
      cur.attempted.add(playerId);
      correct = idx === cur.correctIndex;
    } else {
      const tokens = looseTokens(c.text);
      if (!tokens.length || c.text.length > 80 || tokens.length > cur.maxAnswerTokens + 3) return { status: 'ignored' };
      const last = cur.lastTry.get(playerId) || 0;
      if (c.receivedAt - last < TEXT_RETRY_MS) return { status: 'throttled' };
      cur.lastTry.set(playerId, c.receivedAt);
      correct = matchesAnswer(c.text, cur.accepted);
    }
    if (this.players.isBanned(playerId)) return { status: 'banned' };

    const player = this.players.touch(c);
    const ms = Math.max(0, Math.round(c.receivedAt - cur.startedAt - cur.pausedTotal));
    cur.attempts++;
    const base = { gameId: this.game.id, questionId: cur.q.id, playerId, text: c.text, ms };
    if (!correct) {
      this.players.recordAttempt(base);
      this.pushFeed({ nickname: player.nickname, avatar: player.avatar, text: c.text.slice(0, 40), correct: false });
      this.emit('answer', { correct: false, nickname: player.nickname });
      this.changed(false);
      return { status: 'wrong' };
    }
    const rank = cur.winners.length + 1;
    const points = cfg.scoring.points[rank - 1] ?? 0;
    this.players.recordCorrect({ ...base, rank, points });
    const win = { playerId, nickname: player.nickname, avatar: player.avatar, demo: !!player.is_demo, rank, points, ms };
    cur.winners.push(win);
    this.pushFeed({ nickname: player.nickname, avatar: player.avatar, text: '', correct: true, rank });
    this.emit('correct', publicWinner(win));
    if (cur.winners.length >= cfg.scoring.winners) this.closeQuestion('full');
    else this.changed(true);
    return { status: 'correct', rank, points };
  }

  pushFeed(e) {
    const cur = this.current;
    cur.feed.push({ id: ++cur.feedSeq, ...e });
    if (cur.feed.length > FEED_SIZE) cur.feed.shift();
  }

  /** Host decides a viewer answered correctly (manual mode, e.g. read from the TikTok app). */
  manualCorrect({ nickname, platform = 'manual' }) {
    if (this.phase !== 'question' || !this.current) return { status: 'closed' };
    const name = String(nickname || '').trim().slice(0, 40);
    if (!name) return { status: 'invalid' };
    const answer = answerMode(this.current.q) === 'choice' ? 'ABCD'[this.current.correctIndex] : this.current.accepted[0];
    return this.handleComment({ platform, userId: name.toLowerCase(), uniqueId: name, nickname: name, avatar: '', text: answer, receivedAt: this.now() });
  }

  /** Server-side only: lets the demo provider simulate viewers. Never sent to clients. */
  demoPeek() {
    if (this.phase !== 'question' || !this.current || this.paused) return null;
    const c = this.current;
    return {
      key: `${this.game.id}:${this.game.index}`,
      mode: answerMode(c.q),
      correctIndex: c.correctIndex,
      choices: c.choices.length,
      answers: LANGS.flatMap((l) => c.q.answers[l] || []),
      duration: this.cfg.timing.duration * 1000,
      remaining: this.phaseEndsAt ? this.phaseEndsAt - this.now() : 0,
    };
  }

  hostView() {
    const c = this.current;
    if (!c || this.phase !== 'question') return null;
    return { questionId: c.q.id, correctIndex: c.correctIndex, accepted: c.accepted.slice(0, 6), notes: c.q.notes };
  }

  // ---------- state ----------
  /** Broadcast state. Immediate for important changes; coalesced (≤ 4/s) for feed-only updates. */
  changed(immediate = true) {
    if (immediate) {
      if (this.pendingEmit) { this.timers.clearTimeout(this.pendingEmit); this.pendingEmit = null; }
      this.flush();
    } else if (!this.pendingEmit) {
      this.pendingEmit = this.timers.setTimeout(() => { this.pendingEmit = null; this.flush(); }, 250);
    }
  }

  flush() {
    this.persist();
    this.emit('state', this.publicState());
  }

  hint() {
    const c = this.current;
    if (!c || !this.cfg.display.hints || answerMode(c.q) === 'choice') return null;
    const lang = this.cfg.display.lang;
    const ans = displayAnswer(c.q);
    const text = ans[lang] || ans.ar || ans.en || '';
    if (!text) return null;
    if (this.phase === 'reveal') return { words: maskAnswer(text, 99).map((w) => w), level: 3 };
    const frac = this.activeElapsed() / (this.cfg.timing.duration * 1000);
    const level = HINT_STEPS.filter((s) => frac >= s).length;
    return { words: maskAnswer(text, level), level };
  }

  /** Snapshot for the overlay and dashboard. Never contains the answer while the question is open. */
  publicState() {
    const cfg = this.cfg;
    const out = {
      phase: this.phase,
      paused: this.paused,
      gameId: this.game?.id || null,
      serverNow: this.now(),
      phaseEndsAt: this.phaseEndsAt,
      pausedRemaining: this.pausedRemaining,
      duration: cfg.timing.duration,
      reveal: cfg.timing.reveal,
      index: this.game?.index ?? -1,
      total: this.game?.questions.length || 0,
      config: { lang: cfg.display.lang, hints: cfg.display.hints, showFeed: cfg.display.showFeed, showLeaderboard: cfg.display.showLeaderboard, winners: cfg.scoring.winners, points: cfg.scoring.points },
      effects: this.settings.get().effects,
      question: null,
      result: null,
      final: this.phase === 'finished' ? this.finalResult : null,
      leaderboard: this.game ? this.players.gameTop(this.game.id, 10) : [],
      allTime: this.players.top(10),
    };
    if (this.current && (this.phase === 'question' || this.phase === 'reveal')) {
      const q = this.current.q;
      out.question = {
        id: q.id, category: q.category, subcategory: q.subcategory, difficulty: q.difficulty, type: q.type,
        answerMode: answerMode(q), text: q.text, image: q.image, choices: this.current.choices,
        hint: this.hint(), attempts: this.current.attempts, seats: this.current.winners.map(publicWinner), feed: this.current.feed,
        startedAt: this.current.startedAt,
      };
    }
    if (this.phase === 'reveal') out.result = this.lastResult;
    return out;
  }

  persist() {
    if (!this.kv) return;
    const c = this.current;
    this.kv.set('engine', {
      phase: this.phase,
      paused: this.paused,
      remaining: this.paused ? this.pausedRemaining : this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.now()) : null,
      game: this.game ? { id: this.game.id, ids: this.game.questions.map((q) => q.id), index: this.game.index, snapshot: this.game.snapshot } : null,
      current: c ? { order: c.order, winners: c.winners, attempted: [...c.attempted], elapsed: this.activeElapsed(), attempts: c.attempts, feed: c.feed } : null,
      lastResult: this.lastResult,
      finalResult: this.finalResult,
      recentIds: this.recentIds,
    });
  }

  /** Reload the saved state after a restart. A running game comes back paused. */
  restore() {
    const s = this.kv?.get('engine');
    if (!s) return;
    this.recentIds = s.recentIds || [];
    if (!s.game) return;
    const questions = s.game.ids.map((id) => this.store.get(id)).filter(Boolean);
    if (questions.length !== s.game.ids.length) return; // questions deleted meanwhile → drop the game
    this.game = { id: s.game.id, questions, index: s.game.index, snapshot: s.game.snapshot };
    this.phase = s.phase;
    this.lastResult = s.lastResult;
    this.finalResult = s.finalResult;
    if (s.current && questions[s.game.index] && (s.phase === 'question' || s.phase === 'reveal')) {
      const now = this.now();
      this.current = this.buildCurrent(questions[s.game.index], s.current.order, {
        winners: s.current.winners || [], attempted: new Set(s.current.attempted || []), attempts: s.current.attempts || 0, feed: s.current.feed || [],
        startedAt: now - (s.current.elapsed || 0), pausedAt: now,
      });
    }
    if (['countdown', 'question', 'reveal'].includes(this.phase)) {
      this.paused = true;
      this.pausedRemaining = s.remaining ?? 0;
    }
  }
}

function publicWinner(w) {
  return { rank: w.rank, nickname: w.nickname, avatar: w.avatar, points: w.points, ms: w.ms, demo: !!w.demo };
}
