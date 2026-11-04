// محرك المسابقة المباشرة: الجولات، احتساب الإجابات، النقاط، الترتيب
// Live quiz engine: rounds, comment answers, speed-based points, leaderboards.
import { EventEmitter } from 'node:events';
import { selectQuestions, DEFAULT_QUOTA } from './selector.js';
import { answerMode, acceptedAnswers, displayAnswer } from './schema.js';
import { matchesAnswer, parseChoice } from './normalize.js';

export const BASE_POINTS = { easy: 100, medium: 200, hard: 300 };
export const DEFAULT_SETTINGS = {
  categories: [], // empty = all categories (random mode)
  excludeCategories: [],
  excludeSubcategories: [],
  difficulties: [], // empty = all
  types: [],
  count: 10,
  lang: 'ar',
  duration: 20, // seconds per question
  revealDuration: 7, // seconds the answer + winner stay on screen
  startDelay: 5, // countdown before the first question
  mode: 'first', // 'first': first correct answer wins and closes the question; 'all': everyone correct scores
  progressive: true, // easy → hard within the round
  autoAdvance: true,
  shuffleChoices: true,
  quota: DEFAULT_QUOTA,
};

/** Points for a correct answer: difficulty base × speed (50%–100%), +50% for the first in "all" mode. */
export function computePoints(difficulty, elapsedMs, durationMs, { first = true, mode = 'first' } = {}) {
  const base = BASE_POINTS[difficulty] || BASE_POINTS.medium;
  const speed = Math.max(0, Math.min(1, 1 - elapsedMs / durationMs));
  let pts = base * (0.5 + 0.5 * speed);
  if (mode === 'all' && first) pts *= 1.5;
  return Math.round(pts);
}

class Scoreboard {
  constructor() { this.map = new Map(); }
  add(user, points, ms) {
    const e = this.map.get(user.userId) || { userId: user.userId, nickname: user.nickname, avatar: user.avatar, points: 0, correct: 0, bestMs: Infinity, since: Date.now() };
    e.nickname = user.nickname || e.nickname;
    e.avatar = user.avatar || e.avatar;
    e.points += points;
    e.correct += 1;
    e.bestMs = Math.min(e.bestMs, ms);
    this.map.set(user.userId, e);
  }
  top(n = 10) {
    return [...this.map.values()]
      .sort((a, b) => b.points - a.points || b.correct - a.correct || a.bestMs - b.bestMs || a.since - b.since)
      .slice(0, n)
      .map((e, i) => ({ rank: i + 1, userId: e.userId, nickname: e.nickname, avatar: e.avatar, points: e.points, correct: e.correct }));
  }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

export class QuizGame extends EventEmitter {
  constructor(store, { now = () => Date.now(), timers = { setTimeout, clearTimeout }, rng = Math.random, recentMemory = 300 } = {}) {
    super();
    this.store = store;
    this.now = now;
    this.timers = timers;
    this.rng = rng;
    this.recentMemory = recentMemory;
    this.recentIds = []; // asked in previous rounds of this session (avoid repeats across rounds too)
    this.roundScores = new Scoreboard();
    this.sessionScores = new Scoreboard();
    this.timer = null;
    this.reset();
  }

  reset() {
    this.clearTimer();
    this.phase = 'idle'; // idle | countdown | question | reveal | finished
    this.settings = { ...DEFAULT_SETTINGS };
    this.questions = [];
    this.index = -1;
    this.current = null;
    this.phaseEndsAt = null;
    this.roundId = null;
    this.lastResult = null;
    this.finalResult = null;
  }

  clearTimer() {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(ms, fn) {
    this.clearTimer();
    this.phaseEndsAt = this.now() + ms;
    this.timer = this.timers.setTimeout(() => { this.timer = null; fn(); }, ms);
  }

  /** Preview selection without starting (used by the control panel). */
  preview(settings = {}) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    return selectQuestions(this.store.all(), { ...s, recentIds: this.recentIds, maxAgeDays: this.store.maxAgeDays }, this.rng).stats;
  }

  startRound(settings = {}) {
    this.clearTimer();
    const s = { ...DEFAULT_SETTINGS, ...settings };
    s.count = Math.max(1, Math.min(100, Number(s.count) || DEFAULT_SETTINGS.count));
    s.duration = Math.max(5, Math.min(120, Number(s.duration) || DEFAULT_SETTINGS.duration));
    s.revealDuration = Math.max(2, Math.min(60, Number(s.revealDuration) || DEFAULT_SETTINGS.revealDuration));
    s.startDelay = Math.max(0, Math.min(60, Number(s.startDelay ?? DEFAULT_SETTINGS.startDelay)));
    const { questions, stats } = selectQuestions(this.store.all(), { ...s, recentIds: this.recentIds, maxAgeDays: this.store.maxAgeDays }, this.rng);
    if (!questions.length) return { ok: false, error: 'لا توجد أسئلة منشورة تطابق هذه الإعدادات', stats };

    this.settings = s;
    this.questions = questions;
    this.index = -1;
    this.roundId = `${this.now().toString(36)}`;
    this.roundScores.clear();
    this.lastResult = null;
    this.finalResult = null;
    this.current = null;
    this.phase = 'countdown';
    if (s.startDelay > 0) this.schedule(s.startDelay * 1000, () => this.nextQuestion());
    else this.nextQuestion();
    this.changed();
    return { ok: true, stats };
  }

  nextQuestion() {
    this.clearTimer();
    if (!this.questions.length) return;
    this.index++;
    if (this.index >= this.questions.length) return this.finishRound();
    const q = this.questions[this.index];
    let order = q.choices.map((_, i) => i);
    if (this.settings.shuffleChoices && answerMode(q) === 'choice') {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    this.current = {
      q,
      choices: order.map((i) => q.choices[i]),
      correctIndex: answerMode(q) === 'choice' ? order.indexOf(q.correct) : null,
      accepted: acceptedAnswers(q),
      startedAt: this.now(),
      winners: [], // [{userId, nickname, avatar, points, ms}]
      attempted: new Set(), // users who already used their single attempt (choice questions)
      lastTry: new Map(), // per-user throttle for text questions
      answersCount: 0,
    };
    this.phase = 'question';
    this.rememberAsked(q.id);
    this.schedule(this.settings.duration * 1000, () => this.closeQuestion('timeout'));
    this.changed();
  }

  rememberAsked(id) {
    this.recentIds = [...this.recentIds.filter((x) => x !== id), id].slice(-this.recentMemory);
  }

  /** Handle one live comment: {userId, nickname, avatar, text}. Returns the outcome (for tests/logs). */
  handleComment(c) {
    if (this.phase !== 'question' || !this.current || !c || !c.text) return { accepted: false, reason: 'closed' };
    const user = { userId: String(c.userId || c.nickname || ''), nickname: c.nickname || c.userId || '؟', avatar: c.avatar || '' };
    if (!user.userId) return { accepted: false, reason: 'anonymous' };
    const cur = this.current;
    if (cur.winners.some((w) => w.userId === user.userId)) return { accepted: false, reason: 'already-won' };

    let correct;
    if (answerMode(cur.q) === 'choice') {
      const idx = parseChoice(c.text, cur.choices);
      if (idx === -1) return { accepted: false, reason: 'not-an-answer' };
      // One attempt per user: spamming A, B, C, D does not work.
      if (cur.attempted.has(user.userId)) return { accepted: false, reason: 'one-attempt' };
      cur.attempted.add(user.userId);
      correct = idx === cur.correctIndex;
    } else {
      const t = this.now();
      if (t - (cur.lastTry.get(user.userId) || 0) < 700) return { accepted: false, reason: 'throttled' };
      cur.lastTry.set(user.userId, t);
      correct = matchesAnswer(c.text, cur.accepted);
    }
    cur.answersCount++;
    if (!correct) return { accepted: true, correct: false };

    const ms = this.now() - cur.startedAt;
    const first = cur.winners.length === 0;
    const points = computePoints(cur.q.difficulty, ms, this.settings.duration * 1000, { first, mode: this.settings.mode });
    const win = { ...user, points, ms };
    cur.winners.push(win);
    this.roundScores.add(user, points, ms);
    this.sessionScores.add(user, points, ms);
    this.emit('correct', { ...win, first, questionIndex: this.index });
    if (this.settings.mode === 'first') this.closeQuestion('answered');
    else this.changed();
    return { accepted: true, correct: true, points, first };
  }

  closeQuestion(reason = 'timeout') {
    if (this.phase !== 'question') return;
    this.clearTimer();
    const cur = this.current;
    this.lastResult = {
      reason,
      winner: cur.winners[0] || null,
      winners: cur.winners.slice(0, 10),
      answer: displayAnswer(cur.q),
      correctIndex: cur.correctIndex,
      source: cur.q.source,
    };
    this.phase = 'reveal';
    if (this.settings.autoAdvance) this.schedule(this.settings.revealDuration * 1000, () => this.nextQuestion());
    else this.phaseEndsAt = null;
    this.emit('reveal', this.lastResult);
    this.changed();
  }

  /** Admin: skip the current question (reveal) or move on from the reveal/countdown. */
  next() {
    if (this.phase === 'question') this.closeQuestion('skipped');
    else if (this.phase === 'reveal' || this.phase === 'countdown') this.nextQuestion();
  }

  finishRound() {
    this.clearTimer();
    this.phase = 'finished';
    this.phaseEndsAt = null;
    const top = this.roundScores.top(10);
    this.finalResult = { champion: top[0] || null, top, questions: this.questions.length, players: this.roundScores.size };
    this.emit('finished', this.finalResult);
    this.changed();
  }

  stop() {
    if (this.phase === 'idle') return;
    if (this.phase === 'finished') { this.reset(); this.changed(); return; }
    this.finishRound();
  }

  resetScores() {
    this.roundScores.clear();
    this.sessionScores.clear();
    this.changed();
  }

  changed() {
    this.emit('state', this.publicState());
  }

  /** Snapshot sent to the overlay. Never contains the answer while the question is open. */
  publicState() {
    const s = this.settings;
    const out = {
      phase: this.phase,
      roundId: this.roundId,
      serverNow: this.now(),
      phaseEndsAt: this.phaseEndsAt,
      lang: s.lang,
      mode: s.mode,
      duration: s.duration,
      index: this.index,
      total: this.questions.length,
      leaderboard: this.roundScores.top(10),
      sessionLeaderboard: this.sessionScores.top(10),
      question: null,
      result: null,
      final: this.phase === 'finished' ? this.finalResult : null,
    };
    if (this.current && (this.phase === 'question' || this.phase === 'reveal')) {
      const q = this.current.q;
      out.question = {
        id: q.id,
        category: q.category,
        subcategory: q.subcategory,
        difficulty: q.difficulty,
        type: q.type,
        answerMode: answerMode(q),
        text: q.text,
        image: q.image,
        choices: this.current.choices,
        points: BASE_POINTS[q.difficulty],
        answersCount: this.current.answersCount,
        winners: s.mode === 'all' ? this.current.winners.slice(-5).map(({ nickname, avatar, points }) => ({ nickname, avatar, points })) : [],
      };
    }
    if (this.phase === 'reveal') out.result = this.lastResult;
    return out;
  }
}
