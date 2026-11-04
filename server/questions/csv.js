// استيراد وتصدير الأسئلة بصيغة CSV
// RFC 4180 CSV parsing / writing and the question <-> row mapping.
import { LANGS, CHOICE_COUNT } from './schema.js';

export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  // Auto-detect delimiter (Excel in Arabic/French locales often uses ";").
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function esc(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

const choiceCols = [];
for (let i = 1; i <= CHOICE_COUNT; i++) for (const l of LANGS) choiceCols.push(`choice${i}_${l}`);

export const CSV_COLUMNS = [
  'id', 'category', 'subcategory', 'region', 'difficulty', 'type',
  'text_ar', 'text_fr', 'text_en',
  ...choiceCols,
  'correct', // 1..4 for choice questions
  'answers_ar', 'answers_fr', 'answers_en', // accepted answers separated by |
  'image', 'source_title', 'source_url', 'fact_key', 'volatile', 'verified_at', 'tags', 'notes', 'status',
];

export function questionToRow(q) {
  const m = {
    id: q.id, category: q.category, subcategory: q.subcategory, region: q.region, difficulty: q.difficulty, type: q.type,
    correct: q.correct == null ? '' : q.correct + 1,
    image: q.image, source_title: q.source.title, source_url: q.source.url, fact_key: q.factKey,
    volatile: q.volatile ? 'true' : '', verified_at: q.verifiedAt, tags: q.tags.join('|'), notes: q.notes, status: q.status,
  };
  for (const l of LANGS) {
    m[`text_${l}`] = q.text[l];
    m[`answers_${l}`] = (q.answers[l] || []).join('|');
    for (let i = 0; i < CHOICE_COUNT; i++) m[`choice${i + 1}_${l}`] = q.choices[i]?.[l] || '';
  }
  return CSV_COLUMNS.map((c) => m[c] ?? '');
}

/** Convert parsed CSV rows (first row = header) into raw question objects for sanitizeQuestion. */
export function rowsToRawQuestions(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const get = (k) => {
      const i = header.indexOf(k);
      return i === -1 ? '' : (r[i] ?? '').trim();
    };
    const choices = [];
    for (let i = 1; i <= CHOICE_COUNT; i++) {
      const c = {};
      for (const l of LANGS) c[l] = get(`choice${i}_${l}`);
      if (LANGS.some((l) => c[l])) choices.push(c);
    }
    const text = {};
    const answers = {};
    for (const l of LANGS) {
      text[l] = get(`text_${l}`);
      answers[l] = get(`answers_${l}`);
    }
    const correct = get('correct');
    return {
      id: get('id'), category: get('category'), subcategory: get('subcategory'), region: get('region'),
      difficulty: get('difficulty'), type: get('type') || (choices.length ? 'mcq' : 'open'),
      text, choices, correct: correct === '' ? null : Number(correct) - 1, answers,
      image: get('image'), source: { title: get('source_title'), url: get('source_url') },
      factKey: get('fact_key'), volatile: get('volatile'), verifiedAt: get('verified_at'),
      tags: get('tags'), notes: get('notes'), status: get('status'),
    };
  });
}
