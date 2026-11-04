import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine, MCQ, OPEN, comment } from './helpers.js';
import { maskAnswer } from '../server/game/engine.js';

test('first four correct answers win 100 / 70 / 50 / 30 in arrival order, then the question closes', () => {
  const { engine, players, clock } = makeEngine([OPEN]);
  assert.ok(engine.start().ok);
  assert.equal(engine.phase, 'question');
  const res = [];
  for (const [i, name] of ['a', 'b', 'c', 'd', 'e'].entries()) {
    clock.advance(100);
    res.push(engine.handleComment(comment(name, i === 1 ? 'TUNIS' : 'تونس', { receivedAt: clock.now() })));
  }
  assert.deepEqual(res.slice(0, 4).map((r) => [r.rank, r.points]), [[1, 100], [2, 70], [3, 50], [4, 30]]);
  assert.equal(res[4].status, 'closed'); // seats full → question already closed
  assert.equal(engine.phase, 'reveal');
  assert.deepEqual(engine.lastResult.winners.map((w) => w.nickname), ['a', 'b', 'c', 'd']);
  assert.equal(engine.lastResult.winners[0].ms, 100);
  assert.equal(players.get('tiktok:a').points, 100);
  assert.equal(players.get('tiktok:a').wins, 1);
  assert.equal(players.get('tiktok:d').points, 30);
});

test('a player cannot win twice on the same question; wrong and unrelated comments do not score', () => {
  const { engine } = makeEngine([OPEN]);
  engine.start();
  assert.equal(engine.handleComment(comment('a', 'tunis')).status, 'correct');
  assert.equal(engine.handleComment(comment('a', 'tunis', { receivedAt: 2e6 })).status, 'already-won');
  assert.equal(engine.handleComment(comment('b', 'الرباط')).status, 'wrong');
  assert.equal(engine.handleComment(comment('c', 'السلام عليكم ورحمة الله وبركاته يا أهل البث الكرام')).status, 'ignored');
  assert.equal(engine.current.winners.length, 1);
});

test('multiple choice: one attempt per player, letters / Arabic letters / choice text', () => {
  const { engine } = makeEngine([MCQ]);
  engine.start();
  assert.equal(engine.handleComment(comment('a', 'B')).status, 'wrong');
  assert.equal(engine.handleComment(comment('a', 'A')).status, 'one-attempt');
  assert.equal(engine.handleComment(comment('b', 'hello')).status, 'ignored');
  assert.equal(engine.handleComment(comment('b', 'أ')).status, 'correct');
  assert.equal(engine.handleComment(comment('c', 'Rabat')).status, 'correct');
});

test('pause stops the timer and ignores answers; resume continues with the remaining time', () => {
  const { engine, clock } = makeEngine([OPEN]);
  engine.start();
  clock.advance(5000);
  engine.pause();
  assert.equal(engine.handleComment(comment('a', 'tunis')).status, 'paused');
  clock.advance(60000);
  assert.equal(engine.phase, 'question'); // timer frozen
  engine.resume();
  clock.advance(14000);
  assert.equal(engine.phase, 'question');
  const r = engine.handleComment(comment('a', 'tunis', { receivedAt: clock.now() }));
  assert.equal(r.status, 'correct');
  assert.equal(engine.current.winners[0].ms, 19000); // pause time excluded
  clock.advance(1000);
  assert.equal(engine.phase, 'reveal');
});

test('timeout with fewer than four winners, auto advance, finish with champion', () => {
  const { engine, clock, history } = makeEngine([MCQ, OPEN]);
  engine.start();
  engine.handleComment(comment('a', engine.current.q.id === 't-mcq' ? 'A' : 'tunis'));
  clock.advance(20000); // timeout
  assert.equal(engine.phase, 'reveal');
  clock.advance(5000); // auto advance
  assert.equal(engine.phase, 'question');
  engine.next(); // host skips → reveal
  engine.next(); // → finished
  assert.equal(engine.phase, 'finished');
  assert.equal(engine.finalResult.champion.nickname, 'a');
  const g = history.list()[0];
  assert.equal(g.champion_name, 'a');
  assert.equal(g.questions_played, 2);
});

test('restart round reverts the points awarded in that round', () => {
  const { engine, players } = makeEngine([OPEN]);
  engine.start();
  engine.handleComment(comment('a', 'tunis'));
  assert.equal(players.get('tiktok:a').points, 100);
  engine.restartRound();
  assert.equal(players.get('tiktok:a').points, 0);
  assert.equal(engine.phase, 'question');
});

test('configurable winners count and points', () => {
  const { engine, settings } = makeEngine([OPEN]);
  settings.update({ scoring: { winners: 2, points: [10, 5] } });
  engine.start();
  assert.equal(engine.handleComment(comment('a', 'tunis')).points, 10);
  assert.equal(engine.handleComment(comment('b', 'tunis')).points, 5);
  assert.equal(engine.phase, 'reveal');
});

test('hidden letters: masked while open, progressively revealed, never the full answer before reveal', () => {
  assert.deepEqual(maskAnswer('Tunis', 0), [['_', '_', '_', '_', '_']]);
  assert.deepEqual(maskAnswer('ابن بطوطة', 1).map((w) => w[0]), ['ا', 'ب']);
  const { engine, clock } = makeEngine([OPEN]);
  engine.start();
  assert.equal(engine.publicState().question.hint.level, 0);
  clock.advance(8000);
  assert.equal(engine.publicState().question.hint.level, 1);
  assert.equal(JSON.stringify(engine.publicState()).includes('"تونس"'), false);
});

test('public state never leaks the answer while the question is open', () => {
  const { engine } = makeEngine([MCQ]);
  engine.start();
  const s = engine.publicState();
  assert.equal(s.result, null);
  assert.equal('correct' in s.question, false);
  assert.equal(JSON.stringify(s).includes('correctIndex'), false);
});

test('state survives a restart: running game comes back paused', () => {
  const a = makeEngine([OPEN]);
  a.engine.start();
  a.engine.handleComment(comment('a', 'tunis'));
  a.clock.advance(3000);
  const { GameEngine } = a.engine.constructor === undefined ? {} : { GameEngine: a.engine.constructor };
  const b = new GameEngine({ store: a.store, players: a.players, history: a.history, settings: a.settings, kv: a.kv, now: a.clock.now, timers: a.clock.timers });
  assert.equal(b.phase, 'question');
  assert.equal(b.paused, true);
  assert.equal(b.current.winners.length, 1);
  b.resume();
  assert.equal(b.handleComment(comment('a', 'tunis')).status, 'already-won');
  assert.equal(b.handleComment(comment('z', 'tunis')).rank, 2);
});
