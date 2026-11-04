import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizGame, computePoints } from '../src/game.js';
import { sanitizeQuestion } from '../src/schema.js';

function fakeStore(questions) {
  return { all: () => questions.map(sanitizeQuestion), maxAgeDays: 180 };
}
const mcq = {
  id: 'q1', category: 'geography', region: 'arab', difficulty: 'easy', type: 'mcq', status: 'published',
  text: { ar: 'عاصمة المغرب؟' }, source: { title: 'x' },
  choices: [{ ar: 'الرباط', en: 'Rabat' }, { ar: 'فاس', en: 'Fez' }, { ar: 'مراكش', en: 'Marrakesh' }, { ar: 'طنجة', en: 'Tangier' }], correct: 0,
};
const open = {
  id: 'q2', category: 'geography', region: 'arab', difficulty: 'hard', type: 'open', status: 'published',
  text: { ar: 'عاصمة تونس؟' }, source: { title: 'x' }, answers: { ar: ['تونس'], en: ['Tunis'] },
};

function setup(questions, settings = {}) {
  let now = 1000;
  const timers = { setTimeout: () => 1, clearTimeout: () => {} }; // manual control
  const g = new QuizGame(fakeStore(questions), { now: () => now, timers, rng: () => 0.99 });
  const r = g.startRound({ startDelay: 0, shuffleChoices: false, progressive: false, ...settings });
  assert.ok(r.ok);
  return { g, tick: (ms) => { now += ms; } };
}

test('points depend on difficulty and speed', () => {
  assert.equal(computePoints('easy', 0, 20000), 100);
  assert.equal(computePoints('easy', 20000, 20000), 50);
  assert.equal(computePoints('hard', 10000, 20000), 225);
  assert.equal(computePoints('easy', 0, 20000, { mode: 'all', first: true }), 150);
});

test('first correct answer wins and closes the question (mode first)', () => {
  const { g, tick } = setup([mcq]);
  assert.equal(g.phase, 'question');
  assert.equal(g.publicState().result, null); // no answer leaked
  assert.equal(g.handleComment({ userId: 'u1', nickname: 'Ali', text: 'B' }).correct, false);
  tick(5000);
  const res = g.handleComment({ userId: 'u2', nickname: 'Sara', avatar: 'a.png', text: 'A' });
  assert.equal(res.correct, true);
  assert.equal(g.phase, 'reveal');
  const st = g.publicState();
  assert.equal(st.result.winner.nickname, 'Sara');
  assert.equal(st.result.winner.points, 88); // 100 * (0.5 + 0.5 * 0.75)
  assert.equal(st.leaderboard[0].nickname, 'Sara');
});

test('only one attempt per user on choice questions (no A/B/C/D spam)', () => {
  const { g } = setup([mcq]);
  g.handleComment({ userId: 'u1', nickname: 'Ali', text: 'B' });
  assert.equal(g.handleComment({ userId: 'u1', nickname: 'Ali', text: 'A' }).reason, 'one-attempt');
  assert.equal(g.phase, 'question');
  // Chat that is not an answer does not consume the attempt.
  assert.equal(g.handleComment({ userId: 'u3', nickname: 'Omar', text: 'السلام عليكم' }).reason, 'not-an-answer');
  assert.equal(g.handleComment({ userId: 'u3', nickname: 'Omar', text: 'الرباط' }).correct, true);
});

test('open questions accept typed answers in any language; mode all scores everyone', () => {
  const { g, tick } = setup([open], { mode: 'all' });
  assert.equal(g.handleComment({ userId: 'u1', nickname: 'A', text: 'tunis' }).first, true);
  tick(1000);
  assert.equal(g.handleComment({ userId: 'u2', nickname: 'B', text: 'تونس' }).first, false);
  assert.equal(g.handleComment({ userId: 'u1', nickname: 'A', text: 'tunis' }).reason, 'already-won');
  assert.equal(g.phase, 'question');
  g.closeQuestion('timeout');
  assert.equal(g.lastResult.winners.length, 2);
});

test('round ends with a champion and top 10', () => {
  const { g } = setup([mcq, open]);
  g.handleComment({ userId: 'u1', nickname: 'Ali', text: 'A' });
  g.next(); // reveal -> next question
  g.handleComment({ userId: 'u1', nickname: 'Ali', text: 'Tunis' });
  g.next(); // reveal -> finish
  assert.equal(g.phase, 'finished');
  assert.equal(g.finalResult.champion.nickname, 'Ali');
  assert.equal(g.publicState().final.top.length, 1);
});
