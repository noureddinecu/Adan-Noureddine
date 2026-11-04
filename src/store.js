// بنك الأسئلة: التحميل والحفظ والاستيراد
// Question bank persistence. One JSON file per category in data/questions/,
// plus data/questions/volatile.json for changing sports facts (kept separate from
// historical questions so they can be re-verified on their own schedule).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sanitizeQuestion, validateQuestion, isStale } from './schema.js';

export const VOLATILE_FILE = 'volatile.json';

export class QuestionStore {
  constructor(dataDir, { maxAgeDays = 180 } = {}) {
    this.dataDir = dataDir;
    this.questionsDir = path.join(dataDir, 'questions');
    this.maxAgeDays = maxAgeDays;
    this.categories = [];
    this.questions = new Map(); // id -> question
    this.load();
  }

  load() {
    this.categories = JSON.parse(fs.readFileSync(path.join(this.dataDir, 'categories.json'), 'utf8')).categories;
    this.questions.clear();
    fs.mkdirSync(this.questionsDir, { recursive: true });
    for (const f of fs.readdirSync(this.questionsDir).filter((x) => x.endsWith('.json')).sort()) {
      const data = JSON.parse(fs.readFileSync(path.join(this.questionsDir, f), 'utf8'));
      for (const raw of data.questions || []) {
        const q = sanitizeQuestion(raw);
        if (!q.id) q.id = this.newId(q.category);
        this.questions.set(q.id, q);
      }
    }
  }

  fileFor(q) {
    return q.volatile ? VOLATILE_FILE : `${q.category || 'uncategorized'}.json`;
  }

  /** Rewrite every bank file atomically (small bank, simplest correct approach). */
  persist() {
    const files = new Map();
    for (const q of this.questions.values()) {
      const f = this.fileFor(q);
      if (!files.has(f)) files.set(f, []);
      files.get(f).push(q);
    }
    const existing = fs.readdirSync(this.questionsDir).filter((x) => x.endsWith('.json'));
    for (const f of existing) if (!files.has(f)) files.set(f, []);
    for (const [f, qs] of files) {
      const header = f === VOLATILE_FILE
        ? { description: 'معلومات رياضية متغيرة — يجب إعادة التحقق منها دورياً (verifiedAt). Changing sports facts, re-verify regularly.' }
        : {};
      const body = JSON.stringify({ ...header, questions: qs.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + '\n';
      const target = path.join(this.questionsDir, f);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, target);
    }
  }

  newId(category = 'q') {
    let id;
    do id = `${category || 'q'}-${crypto.randomBytes(3).toString('hex')}`;
    while (this.questions.has(id));
    return id;
  }

  all() {
    return [...this.questions.values()];
  }

  get(id) {
    return this.questions.get(id);
  }

  validate(q) {
    return validateQuestion(q, { categories: this.categories, others: this.all(), maxAgeDays: this.maxAgeDays });
  }

  /**
   * Create or replace a question. Structural errors always block; quality errors only
   * block when the question is (or would become) published.
   */
  save(raw, { isNew = false } = {}) {
    const q = sanitizeQuestion(raw);
    if (isNew) {
      if (q.id && this.questions.has(q.id)) q.id = '';
      if (!q.id) q.id = this.newId(q.category);
    } else if (!this.questions.has(q.id)) {
      return { ok: false, status: 404, errors: ['السؤال غير موجود'] };
    }
    const prev = this.questions.get(q.id);
    q.createdAt = prev?.createdAt || new Date().toISOString();
    q.updatedAt = new Date().toISOString();
    const v = this.validate(q);
    if (v.structural.length) return { ok: false, status: 400, errors: v.structural, warnings: v.warnings };
    if (q.status === 'published' && !v.publishable) return { ok: false, status: 400, errors: v.quality, warnings: v.warnings };
    this.questions.set(q.id, q);
    this.persist();
    return { ok: true, question: q, warnings: v.warnings };
  }

  setStatus(id, status) {
    const q = this.questions.get(id);
    if (!q) return { ok: false, status: 404, errors: ['السؤال غير موجود'] };
    return this.save({ ...q, status });
  }

  remove(id) {
    const ok = this.questions.delete(id);
    if (ok) this.persist();
    return ok;
  }

  /** Import many raw questions; each is validated on its own. Default status: review. */
  importMany(rawList, { status = 'review', overwrite = false } = {}) {
    const result = { imported: 0, updated: 0, skipped: [] };
    rawList.forEach((raw, i) => {
      const exists = raw.id && this.questions.has(raw.id);
      if (exists && !overwrite) {
        result.skipped.push({ row: i + 1, id: raw.id, errors: ['المعرّف موجود مسبقاً (فعّل الاستبدال)'] });
        return;
      }
      const q = sanitizeQuestion({ ...raw, status: raw.status && overwrite ? raw.status : status });
      if (!exists) q.id = q.id || this.newId(q.category);
      q.createdAt = exists ? this.questions.get(q.id).createdAt : new Date().toISOString();
      q.updatedAt = new Date().toISOString();
      const v = this.validate(q);
      if (v.structural.length || (q.status === 'published' && !v.publishable)) {
        result.skipped.push({ row: i + 1, id: raw.id || '', errors: v.errors });
        return;
      }
      this.questions.set(q.id, q);
      if (exists) result.updated++;
      else result.imported++;
    });
    if (result.imported || result.updated) this.persist();
    return result;
  }

  stats() {
    const s = { total: 0, byStatus: {}, byCategory: {}, byRegion: {}, byDifficulty: {}, byType: {}, stale: 0, publishedByRegion: {} };
    const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
    for (const q of this.questions.values()) {
      s.total++;
      inc(s.byStatus, q.status);
      inc(s.byCategory, q.category);
      inc(s.byRegion, q.region);
      inc(s.byDifficulty, q.difficulty);
      inc(s.byType, q.type);
      if (q.status === 'published') inc(s.publishedByRegion, q.region);
      if (isStale(q, this.maxAgeDays)) s.stale++;
    }
    return s;
  }
}
