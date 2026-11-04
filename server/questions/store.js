// بنك الأسئلة على SQLite — Question bank stored in SQLite.
// The JSON files in data/questions/ are the seed: new seed questions are merged in at
// startup (never overwriting your edits, never re-adding questions you deleted).
// Changing sports facts (volatile) live in their own seed file and their own review flow.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sanitizeQuestion, validateQuestion, isStale } from './schema.js';

export class QuestionStore {
  constructor(db, { seedDir, maxAgeDays = 180 } = {}) {
    this.db = db;
    this.seedDir = seedDir;
    this.maxAgeDays = maxAgeDays;
    this.categories = JSON.parse(fs.readFileSync(path.join(seedDir, 'categories.json'), 'utf8')).categories;
    this.questions = new Map();
    this.upsertStmt = db.prepare(`INSERT INTO questions (id, data, category, region, difficulty, type, status, volatile, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, category = excluded.category,
      region = excluded.region, difficulty = excluded.difficulty, type = excluded.type, status = excluded.status,
      volatile = excluded.volatile, updated_at = excluded.updated_at`);
    this.deleteStmt = db.prepare('DELETE FROM questions WHERE id = ?');
    this.tombstoneStmt = db.prepare('INSERT OR REPLACE INTO deleted_questions (id, deleted_at) VALUES (?, ?)');
    for (const row of db.prepare('SELECT data FROM questions').all()) {
      const q = sanitizeQuestion(JSON.parse(row.data));
      this.questions.set(q.id, q);
    }
    this.seedResult = this.mergeSeed();
  }

  /** Insert seed questions that are not in the DB yet (and were not deleted by the admin). */
  mergeSeed() {
    const dir = path.join(this.seedDir, 'questions');
    if (!fs.existsSync(dir)) return { added: 0 };
    const deleted = new Set(this.db.prepare('SELECT id FROM deleted_questions').all().map((r) => r.id));
    let added = 0;
    this.db.exec('BEGIN');
    try {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        for (const raw of data.questions || []) {
          if (!raw.id || this.questions.has(raw.id) || deleted.has(raw.id)) continue;
          const q = sanitizeQuestion(raw);
          this.write(q);
          added++;
        }
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { added };
  }

  write(q) {
    this.upsertStmt.run(q.id, JSON.stringify(q), q.category, q.region, q.difficulty, q.type, q.status, q.volatile ? 1 : 0, q.updatedAt || new Date().toISOString());
    this.questions.set(q.id, q);
  }

  newId(category = 'q') {
    let id;
    do id = `${category || 'q'}-${crypto.randomBytes(3).toString('hex')}`;
    while (this.questions.has(id));
    return id;
  }

  all() { return [...this.questions.values()]; }
  get(id) { return this.questions.get(id); }

  validate(q) {
    return validateQuestion(q, { categories: this.categories, others: this.all(), maxAgeDays: this.maxAgeDays });
  }

  /** Structural errors always block; quality errors block only when publishing. */
  save(raw, { isNew = false } = {}) {
    const q = sanitizeQuestion(raw);
    if (isNew) {
      if (q.id && this.questions.has(q.id)) q.id = '';
      if (!q.id) q.id = this.newId(q.category);
    } else if (!this.questions.has(q.id)) {
      return { ok: false, status: 404, errors: ['السؤال غير موجود / question not found'] };
    }
    const prev = this.questions.get(q.id);
    q.createdAt = prev?.createdAt || new Date().toISOString();
    q.updatedAt = new Date().toISOString();
    const v = this.validate(q);
    if (v.structural.length) return { ok: false, status: 400, errors: v.structural, warnings: v.warnings };
    if (q.status === 'published' && !v.publishable) return { ok: false, status: 400, errors: v.quality, warnings: v.warnings };
    this.write(q);
    return { ok: true, question: q, warnings: v.warnings };
  }

  setStatus(id, status) {
    const q = this.questions.get(id);
    if (!q) return { ok: false, status: 404, errors: ['السؤال غير موجود / question not found'] };
    return this.save({ ...q, status });
  }

  markVerified(id, date = new Date().toISOString().slice(0, 10)) {
    const q = this.questions.get(id);
    if (!q) return { ok: false, status: 404, errors: ['not found'] };
    return this.save({ ...q, verifiedAt: date });
  }

  remove(id) {
    if (!this.questions.has(id)) return false;
    this.deleteStmt.run(id);
    this.tombstoneStmt.run(id, new Date().toISOString());
    this.questions.delete(id);
    return true;
  }

  importMany(rawList, { status = 'review', overwrite = false } = {}) {
    const result = { imported: 0, updated: 0, skipped: [] };
    this.db.exec('BEGIN');
    try {
      rawList.forEach((raw, i) => {
        const exists = raw.id && this.questions.has(raw.id);
        if (exists && !overwrite) {
          result.skipped.push({ row: i + 1, id: raw.id, errors: ['المعرّف موجود مسبقاً / id already exists'] });
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
        this.write(q);
        if (exists) result.updated++;
        else result.imported++;
      });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return result;
  }

  stats() {
    const s = { total: 0, byStatus: {}, byCategory: {}, byRegion: {}, byDifficulty: {}, byType: {}, stale: 0, publishedByRegion: {}, volatile: 0 };
    const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
    for (const q of this.questions.values()) {
      s.total++;
      inc(s.byStatus, q.status);
      inc(s.byCategory, q.category);
      inc(s.byRegion, q.region);
      inc(s.byDifficulty, q.difficulty);
      inc(s.byType, q.type);
      if (q.status === 'published') inc(s.publishedByRegion, q.region);
      if (q.volatile) s.volatile++;
      if (isStale(q, this.maxAgeDays)) s.stale++;
    }
    return s;
  }
}
