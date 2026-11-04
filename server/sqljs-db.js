// بديل لقاعدة SQLite المدمجة لإصدارات Node الأقدم (مثل Node 18 داخل تطبيق Android)
// Fallback for Node versions without node:sqlite (e.g. Node 18 embedded in the Android app):
// SQLite compiled to WebAssembly (sql.js) behind the small subset of the DatabaseSync API we use.
// The database lives in memory and is written to disk atomically shortly after every change.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function loadSqlJs() {
  try {
    const initWasm = require('sql.js/dist/sql-wasm.js');
    return await initWasm({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
  } catch {
    // No WebAssembly available → pure JavaScript build (slower, same behaviour).
    const initAsm = require('sql.js/dist/sql-asm.js');
    return await initAsm();
  }
}

const SQL = await loadSqlJs();
const SAVE_DELAY_MS = 300;

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }
  #exec(params, mode) {
    const st = this.db.raw.prepare(this.sql);
    try {
      st.bind(params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)));
      if (mode === 'run') {
        st.step();
        this.db.dirty();
        return { changes: this.db.raw.getRowsModified() };
      }
      const rows = [];
      while (st.step()) {
        rows.push(st.getAsObject());
        if (mode === 'get') break;
      }
      return mode === 'get' ? rows[0] : rows;
    } finally {
      st.free();
    }
  }
  get(...params) { return this.#exec(params, 'get'); }
  all(...params) { return this.#exec(params, 'all'); }
  run(...params) { return this.#exec(params, 'run'); }
}

export class SqlJsDatabase {
  constructor(file) {
    this.file = file === ':memory:' ? null : file;
    const data = this.file && fs.existsSync(this.file) ? fs.readFileSync(this.file) : null;
    this.raw = new SQL.Database(data);
    this.timer = null;
    this.inTx = 0;
    process.on('exit', () => this.flush());
  }
  exec(sql) {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN')) this.inTx++;
    this.raw.exec(sql);
    if (s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) this.inTx = Math.max(0, this.inTx - 1);
    this.dirty();
  }
  prepare(sql) { return new Statement(this, sql); }
  dirty() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; if (this.inTx) this.dirty(); else this.flush(); }, SAVE_DELAY_MS);
    this.timer.unref?.();
  }
  flush() {
    if (!this.file || !this.raw) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const bytes = this.raw.export();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, this.file);
  }
  close() {
    this.flush();
    this.raw.close();
    this.raw = null;
  }
}
