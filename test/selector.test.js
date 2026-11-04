import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, selectQuestions } from '../src/selector.js';

let seed = 42;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function makeBank() {
  const bank = [];
  const add = (region, category, n, extra = {}) => {
    for (let i = 0; i < n; i++) bank.push({ id: `${region}-${category}-${i}`, region, category, difficulty: ['easy', 'medium', 'hard'][i % 3], type: 'mcq', status: 'published', factKey: '', ...extra });
  };
  add('arab', 'arab_culture', 40);
  add('arab', 'sports', 30);
  add('world', 'foreign_culture', 30);
  add('foreign', 'foreign_culture', 15);
  return bank;
}

test('allocate follows the 65/25/10 quota', () => {
  assert.deepEqual(allocate(20, { arab: 0.65, world: 0.25, foreign: 0.1 }, { arab: 99, world: 99, foreign: 99 }), { arab: 13, world: 5, foreign: 2 });
  assert.deepEqual(allocate(10, { arab: 0.65, world: 0.25, foreign: 0.1 }, { arab: 99, world: 99, foreign: 99 }), { arab: 7, world: 2, foreign: 1 });
});

test('allocate redistributes when a region is short', () => {
  assert.deepEqual(allocate(20, { arab: 0.65, world: 0.25, foreign: 0.1 }, { arab: 99, world: 99, foreign: 0 }), { arab: 15, world: 5, foreign: 0 });
});

test('selects the requested count with quota and no duplicates', () => {
  const { questions, stats } = selectQuestions(makeBank(), { count: 20 }, rng);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map((q) => q.id)).size, 20);
  assert.deepEqual(stats.byRegion, { arab: 13, world: 5, foreign: 2 });
});

test('category include / exclude and difficulty filters', () => {
  const bank = makeBank();
  let r = selectQuestions(bank, { count: 10, categories: ['sports'] }, rng);
  assert.ok(r.questions.every((q) => q.category === 'sports'));
  assert.equal(r.questions.length, 10);
  r = selectQuestions(bank, { count: 50, excludeCategories: ['foreign_culture'], difficulties: ['hard'] }, rng);
  assert.ok(r.questions.every((q) => q.category !== 'foreign_culture' && q.difficulty === 'hard'));
});

test('never picks two questions about the same fact in one round', () => {
  const bank = makeBank().map((q, i) => ({ ...q, factKey: `fact-${i % 5}` }));
  const { questions } = selectQuestions(bank, { count: 30 }, rng);
  assert.equal(new Set(questions.map((q) => q.factKey)).size, questions.length);
  assert.ok(questions.length <= 5);
});

test('prefers questions not asked in previous rounds', () => {
  const bank = makeBank();
  const recent = bank.filter((q) => q.category === 'sports').map((q) => q.id);
  const { questions } = selectQuestions(bank, { count: 20, recentIds: recent }, rng);
  assert.ok(questions.every((q) => q.category !== 'sports'));
});

test('excludes unpublished and stale volatile questions; progressive ordering', () => {
  const bank = makeBank();
  bank[0].status = 'review';
  bank[1].volatile = true; bank[1].verifiedAt = '2000-01-01';
  const { questions } = selectQuestions(bank, { count: 115, progressive: true }, rng);
  assert.ok(!questions.some((q) => q.id === bank[0].id || q.id === bank[1].id));
  const rank = { easy: 0, medium: 1, hard: 2 };
  for (let i = 1; i < questions.length; i++) assert.ok(rank[questions[i - 1].difficulty] <= rank[questions[i].difficulty]);
});
