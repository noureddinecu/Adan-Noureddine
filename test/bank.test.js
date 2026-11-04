import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionStore } from '../src/store.js';
import { parseCsv, toCsv, CSV_COLUMNS, questionToRow, rowsToRawQuestions } from '../src/csv.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('shipped question bank: every published question passes quality checks', () => {
  const store = new QuestionStore(path.join(root, 'data'));
  const qs = store.all();
  assert.ok(qs.length >= 100);
  for (const q of qs) {
    const v = store.validate(q);
    assert.deepEqual(v.structural, [], `${q.id}: ${v.structural}`);
    if (q.status === 'published') assert.deepEqual(v.quality, [], `${q.id}: ${v.quality}`);
  }
  const pub = qs.filter((q) => q.status === 'published');
  const arab = pub.filter((q) => q.region === 'arab').length / pub.length;
  assert.ok(arab >= 0.6, `arab share ${arab}`);
  assert.ok(qs.filter((q) => q.volatile).every((q) => q.verifiedAt), 'volatile questions need verifiedAt');
});

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-'));
  fs.copyFileSync(path.join(root, 'data/categories.json'), path.join(dir, 'categories.json'));
  fs.mkdirSync(path.join(dir, 'questions'));
  return { dir, store: new QuestionStore(dir) };
}

const sample = {
  category: 'geography', subcategory: 'capitals', region: 'arab', difficulty: 'easy', type: 'mcq',
  text: { ar: 'ما عاصمة ليبيا؟', fr: 'Capitale de la Libye ?', en: 'Capital of Libya?' },
  choices: [{ ar: 'طرابلس', fr: 'Tripoli', en: 'Tripoli' }, { ar: 'بنغازي', fr: 'Benghazi', en: 'Benghazi' }, { ar: 'مصراتة', fr: 'Misrata', en: 'Misrata' }, { ar: 'سبها', fr: 'Sebha', en: 'Sabha' }],
  correct: 0, source: { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tripoli,_Libya' }, status: 'published',
};

test('store: create, block duplicates, block publishing incomplete questions, delete', () => {
  const { dir, store } = tempStore();
  const r = store.save(sample, { isNew: true });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(fs.existsSync(path.join(dir, 'questions/geography.json')));
  assert.equal(store.save(sample, { isNew: true }).ok, false); // same wording → duplicate
  const noSource = store.save({ ...sample, text: { ar: 'سؤال آخر؟' }, source: {} }, { isNew: true });
  assert.equal(noSource.ok, false);
  const draft = store.save({ ...sample, text: { ar: 'سؤال آخر؟' }, source: {}, status: 'draft' }, { isNew: true });
  assert.ok(draft.ok);
  assert.ok(store.remove(r.question.id));
  assert.equal(new QuestionStore(dir).all().length, 1); // persisted
});

test('volatile questions are stored in their own file', () => {
  const { dir, store } = tempStore();
  store.save({ ...sample, volatile: true, verifiedAt: '2026-01-01' }, { isNew: true });
  assert.ok(fs.existsSync(path.join(dir, 'questions/volatile.json')));
});

test('CSV round trip and import into review', () => {
  const { store } = tempStore();
  const r = store.save(sample, { isNew: true });
  const csv = toCsv([CSV_COLUMNS, questionToRow(r.question)]);
  const raws = rowsToRawQuestions(parseCsv(csv));
  assert.equal(raws[0].text.ar, sample.text.ar);
  assert.equal(raws[0].correct, 0);
  const { store: other } = tempStore();
  const res = other.importMany(raws.map((x) => ({ ...x, id: '' })));
  assert.equal(res.imported, 1);
  assert.equal(other.all()[0].status, 'review');
});

test('CSV parser handles quotes, commas, newlines and semicolons', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
  assert.deepEqual(parseCsv('a;b\r\n1;"2\n3"'), [['a', 'b'], ['1', '2\n3']]);
});
