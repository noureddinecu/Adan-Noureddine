// قاعدة البيانات SQLite (مدمجة في Node.js ≥ 22.13 عبر node:sqlite)
// SQLite database through the built-in node:sqlite module — no native build step.
import fs from 'node:fs';
import path from 'node:path';

// Built-in SQLite on Node ≥ 22.13; WebAssembly SQLite (sql.js) on older runtimes such as the
// Node 18 embedded in the Android app.
let DatabaseSync;
export let DB_ENGINE = 'node:sqlite';
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  ({ SqlJsDatabase: DatabaseSync } = await import('./sqljs-db.js'));
  DB_ENGINE = 'sql.js';
}

const MIGRATIONS = [
  `CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE questions (
     id TEXT PRIMARY KEY, data TEXT NOT NULL, category TEXT, region TEXT, difficulty TEXT, type TEXT,
     status TEXT, volatile INTEGER DEFAULT 0, updated_at TEXT);
   CREATE TABLE deleted_questions (id TEXT PRIMARY KEY, deleted_at TEXT);
   CREATE TABLE players (
     id TEXT PRIMARY KEY, platform TEXT NOT NULL, unique_id TEXT, nickname TEXT, avatar TEXT,
     points INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
     podiums INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
     banned INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
     first_seen INTEGER, last_seen INTEGER);
   CREATE INDEX players_points ON players(points DESC);
   CREATE TABLE games (
     id TEXT PRIMARY KEY, started_at INTEGER, ended_at INTEGER, status TEXT, settings TEXT, question_ids TEXT,
     questions_played INTEGER DEFAULT 0, players_count INTEGER DEFAULT 0,
     champion_id TEXT, champion_name TEXT, champion_avatar TEXT, champion_points INTEGER, top TEXT, provider TEXT);
   CREATE TABLE game_scores (
     game_id TEXT NOT NULL, player_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0,
     correct INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (game_id, player_id));
   CREATE TABLE answers (
     id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT, question_id TEXT, player_id TEXT, text TEXT,
     correct INTEGER, rank INTEGER, points INTEGER, ms INTEGER, at INTEGER);
   CREATE INDEX answers_player ON answers(player_id, at DESC);
   CREATE INDEX answers_game ON answers(game_id);
   CREATE TABLE adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, delta INTEGER, reason TEXT, at INTEGER);
   CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, created_at INTEGER, expires_at INTEGER, ua TEXT);`,
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Small JSON key/value store on top of the kv table. */
export class KV {
  constructor(db) {
    this.db = db;
    this.getStmt = db.prepare('SELECT value FROM kv WHERE key = ?');
    this.setStmt = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.delStmt = db.prepare('DELETE FROM kv WHERE key = ?');
  }
  get(key, fallback = null) {
    const row = this.getStmt.get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
  }
  set(key, value) { this.setStmt.run(key, JSON.stringify(value)); }
  delete(key) { this.delStmt.run(key); }
}
