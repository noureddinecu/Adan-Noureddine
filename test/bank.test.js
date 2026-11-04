import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { QuestionStore } from '../server/questions/store.js';
import { parseCsv, toCsv, CSV_COLUMNS, questionToRow, rowsToRawQuestions } from '../server/questions/csv.js';
import { ROOT, seedDir, MCQ } from './helpers.js';

test('shipped question bank passes every quality check', () => {
  const store = new QuestionStore(openDb(':memory:'), { seedDir: path.join(ROOT, 'data') });
  const qs = store.all();
  assert.ok(qs.length >= 150);
  for (const q of qs) {
    const v = store.validate(q);
    assert.deepEqual(v.structural, [], `${q.id}: ${v.structural}`);
    if (q.status === 'published') assert.deepEqual(v.quality, [], `${q.id}: ${v.quality}`);
  }
  const pub = qs.filter((q) => q.status === 'published');
  assert.ok(pub.filter((q) => q.region === 'arab').length / pub.length >= 0.6);
  assert.ok(qs.filter((q) => q.volatile).every((q) => q.verifiedAt));
  for (const t of ['mcq', 'open', 'complete', 'flag', 'map', 'capital', 'country']) assert.ok(pub.some((q) => q.type === t), `type ${t}`);
});

test('seed merge does not re-add deleted questions or overwrite edits', () => {
  const dir = seedDir([MCQ]);
  const db = openDb(':memory:');
  let store = new QuestionStore(db, { seedDir: dir });
  store.save({ ...store.get('t-mcq'), notes: 'edited' });
  store = new QuestionStore(db, { seedDir: dir });
  assert.equal(store.get('t-mcq').notes, 'edited');
  store.remove('t-mcq');
  store = new QuestionStore(db, { seedDir: dir });
  assert.equal(store.get('t-mcq'), undefined);
});

test('duplicates are rejected and incomplete questions cannot be published', () => {
  const store = new QuestionStore(openDb(':memory:'), { seedDir: seedDir([MCQ]) });
  const { id, ...rest } = store.get('t-mcq');
  assert.equal(store.save(rest, { isNew: true }).ok, false);
  assert.equal(store.save({ ...rest, text: { ar: 'سؤال آخر؟' }, source: {} }, { isNew: true }).ok, false);
  assert.equal(store.save({ ...rest, text: { ar: 'سؤال آخر؟' }, source: {}, status: 'draft' }, { isNew: true }).ok, true);
});

test('CSV round trip imports into review', () => {
  const a = new QuestionStore(openDb(':memory:'), { seedDir: seedDir([MCQ]) });
  const csv = toCsv([CSV_COLUMNS, questionToRow(a.get('t-mcq'))]);
  const b = new QuestionStore(openDb(':memory:'), { seedDir: seedDir([]) });
  const res = b.importMany(rowsToRawQuestions(parseCsv(csv)).map((x) => ({ ...x, id: '' })));
  assert.equal(res.imported, 1);
  assert.equal(b.all()[0].status, 'review');
  assert.equal(b.all()[0].correct, 0);
});

test('CSV parser handles quotes, commas, newlines and semicolons', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
  assert.deepEqual(parseCsv('a;b\r\n1;"2\n3"'), [['a', 'b'], ['1', '2\n3']]);
});
