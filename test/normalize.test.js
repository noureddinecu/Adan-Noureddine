import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matchesAnswer, parseChoice, compactKey } from '../server/questions/normalize.js';

test('normalizes Arabic letter variants, diacritics, digits and emojis', () => {
  assert.equal(normalize('أَلْمَغْرِبُ 🔥'), 'المغرب');
  assert.equal(normalize('إفرست'), normalize('افرست'));
  assert.equal(normalize('مدرسة'), 'مدرسه');
  assert.equal(normalize('مستشفى'), 'مستشفي');
  assert.equal(normalize('١٩٥٦'), '1956');
  assert.equal(normalize('Fès !!'), 'fes');
});

test('compact key drops Arabic and Latin articles', () => {
  assert.equal(compactKey('المغرب'), compactKey('مغرب'));
  assert.equal(compactKey('Le Maroc'), compactKey('maroc'));
});

test('matches answers with small typos, but not numbers', () => {
  assert.ok(matchesAnswer('الرباط', ['الرباط']));
  assert.ok(matchesAnswer('رباط', ['الرباط']));
  assert.ok(matchesAnswer('ابن بطوطه', ['ابن بطوطة']));
  assert.ok(matchesAnswer('ابن بطوتة', ['ابن بطوطة'])); // 1 typo
  assert.ok(matchesAnswer('Marakech', ['Marrakech']));
  assert.ok(matchesAnswer('الجواب الرباط 🔥', ['الرباط']));
  assert.ok(!matchesAnswer('1957', ['1956']));
  assert.ok(!matchesAnswer('فاس', ['الرباط']));
  assert.ok(!matchesAnswer('انا اعتقد ان الجواب هو الرباط او فاس', ['الرباط']));
});

test('parses multiple-choice comments: letters, digits, Arabic letters, choice text', () => {
  const choices = [
    { ar: 'الرباط', fr: 'Rabat', en: 'Rabat' },
    { ar: 'الدار البيضاء', fr: 'Casablanca', en: 'Casablanca' },
    { ar: 'فاس', fr: 'Fès', en: 'Fez' },
    { ar: 'مراكش', fr: 'Marrakech', en: 'Marrakesh' },
  ];
  assert.equal(parseChoice('A', choices), 0);
  assert.equal(parseChoice('c', choices), 2);
  assert.equal(parseChoice('4', choices), 3);
  assert.equal(parseChoice('أ', choices), 0);
  assert.equal(parseChoice('ج', choices), 2);
  assert.equal(parseChoice('casablanca', choices), 1);
  assert.equal(parseChoice('مراكش', choices), 3);
  assert.equal(parseChoice('hello everyone', choices), -1);
  assert.equal(parseChoice('5', choices), -1);
});
