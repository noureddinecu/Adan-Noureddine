// إدارة اللاعبين والنقاط وسجل المسابقات
// Players, scores and game history. Points are only ever written here, by the game engine
// (or by an authenticated, logged manual adjustment) — never from client-supplied values.
import { tx } from './db.js';

const now = () => Date.now();

export class PlayerRepo {
  constructor(db) {
    this.db = db;
    this.s = {
      get: db.prepare('SELECT * FROM players WHERE id = ?'),
      upsert: db.prepare(`INSERT INTO players (id, platform, unique_id, nickname, avatar, is_demo, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        nickname = COALESCE(NULLIF(excluded.nickname, ''), players.nickname),
        avatar = COALESCE(NULLIF(excluded.avatar, ''), players.avatar),
        unique_id = COALESCE(NULLIF(excluded.unique_id, ''), players.unique_id), last_seen = excluded.last_seen`),
      attempt: db.prepare('UPDATE players SET attempts = attempts + 1 WHERE id = ?'),
      award: db.prepare('UPDATE players SET points = points + ?, correct = correct + 1, wins = wins + ?, podiums = podiums + 1 WHERE id = ?'),
      gameAward: db.prepare(`INSERT INTO game_scores (game_id, player_id, points, correct, wins) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(game_id, player_id) DO UPDATE SET points = points + excluded.points, correct = correct + 1, wins = wins + excluded.wins`),
      answer: db.prepare('INSERT INTO answers (game_id, question_id, player_id, text, correct, rank, points, ms, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      adjust: db.prepare('UPDATE players SET points = MAX(0, points + ?) WHERE id = ?'),
      adjustLog: db.prepare('INSERT INTO adjustments (player_id, delta, reason, at) VALUES (?, ?, ?, ?)'),
      top: db.prepare('SELECT id, nickname, avatar, points, correct, wins, is_demo FROM players WHERE points > 0 AND banned = 0 ORDER BY points DESC, wins DESC, correct DESC, first_seen ASC LIMIT ?'),
      gameTop: db.prepare(`SELECT p.id, p.nickname, p.avatar, p.is_demo, g.points, g.correct, g.wins FROM game_scores g JOIN players p ON p.id = g.player_id
        WHERE g.game_id = ? AND p.banned = 0 ORDER BY g.points DESC, g.wins DESC, g.correct DESC LIMIT ?`),
    };
  }

  /** Create/refresh a player from a normalized comment. Returns the player row. */
  touch(c) {
    const id = `${c.platform}:${c.userId}`;
    this.s.upsert.run(id, c.platform, c.uniqueId || '', c.nickname || c.uniqueId || '', c.avatar || '', c.platform === 'demo' ? 1 : 0, now(), now());
    return this.s.get.get(id);
  }

  get(id) { return this.s.get.get(id); }

  recordAttempt({ gameId, questionId, playerId, text, ms }) {
    this.s.attempt.run(playerId);
    this.s.answer.run(gameId, questionId, playerId, String(text).slice(0, 200), 0, null, 0, ms, now());
  }

  recordCorrect({ gameId, questionId, playerId, text, ms, rank, points }) {
    tx(this.db, () => {
      this.s.attempt.run(playerId);
      this.s.award.run(points, rank === 1 ? 1 : 0, playerId);
      this.s.gameAward.run(gameId, playerId, points, rank === 1 ? 1 : 0);
      this.s.answer.run(gameId, questionId, playerId, String(text).slice(0, 200), 1, rank, points, ms, now());
    });
  }

  /** Undo everything a game awarded (used by "Restart round"). */
  revertGame(gameId) {
    tx(this.db, () => {
      for (const r of this.db.prepare('SELECT player_id, points, correct, wins FROM game_scores WHERE game_id = ?').all(gameId)) {
        this.db.prepare('UPDATE players SET points = MAX(0, points - ?), correct = MAX(0, correct - ?), wins = MAX(0, wins - ?), podiums = MAX(0, podiums - ?) WHERE id = ?')
          .run(r.points, r.correct, r.wins, r.correct, r.player_id);
      }
      this.db.prepare('DELETE FROM game_scores WHERE game_id = ?').run(gameId);
      this.db.prepare('DELETE FROM answers WHERE game_id = ?').run(gameId);
    });
  }

  adjust(id, delta, reason = '') {
    const p = this.get(id);
    if (!p) return null;
    delta = Math.trunc(Number(delta) || 0);
    if (!delta || Math.abs(delta) > 100000) return p;
    tx(this.db, () => {
      this.s.adjust.run(delta, id);
      this.s.adjustLog.run(id, delta, String(reason).slice(0, 200), now());
    });
    return this.get(id);
  }

  setBanned(id, banned) {
    this.db.prepare('UPDATE players SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id);
    return this.get(id);
  }

  isBanned(id) {
    const r = this.db.prepare('SELECT banned FROM players WHERE id = ?').get(id);
    return !!r?.banned;
  }

  remove(id) {
    tx(this.db, () => {
      for (const t of ['answers', 'game_scores', 'adjustments']) this.db.prepare(`DELETE FROM ${t} WHERE player_id = ?`).run(id);
      this.db.prepare('DELETE FROM players WHERE id = ?').run(id);
    });
  }

  removeDemo() {
    const ids = this.db.prepare('SELECT id FROM players WHERE is_demo = 1').all().map((r) => r.id);
    for (const id of ids) this.remove(id);
    return ids.length;
  }

  resetScores() {
    tx(this.db, () => {
      this.db.exec('UPDATE players SET points = 0, correct = 0, wins = 0, podiums = 0, attempts = 0');
    });
  }

  top(n = 10) { return this.s.top.all(n).map(rowToEntry); }
  gameTop(gameId, n = 10) { return gameId ? this.s.gameTop.all(gameId, n).map(rowToEntry) : []; }

  list({ q = '', sort = 'points', limit = 200, offset = 0 } = {}) {
    const order = { points: 'points DESC', wins: 'wins DESC, points DESC', correct: 'correct DESC', recent: 'last_seen DESC', name: 'nickname COLLATE NOCASE' }[sort] || 'points DESC';
    const like = `%${q}%`;
    const rows = this.db.prepare(`SELECT * FROM players WHERE (nickname LIKE ? OR unique_id LIKE ?) ORDER BY ${order} LIMIT ? OFFSET ?`).all(like, like, limit, offset);
    const total = this.db.prepare('SELECT COUNT(*) n FROM players WHERE (nickname LIKE ? OR unique_id LIKE ?)').get(like, like).n;
    const rankOf = this.db.prepare('SELECT COUNT(*) + 1 r FROM players WHERE points > ? AND banned = 0');
    return { total, players: rows.map((p) => ({ ...p, rank: p.points > 0 ? rankOf.get(p.points).r : null })) };
  }

  history(id, limit = 100) {
    return {
      answers: this.db.prepare('SELECT a.*, g.started_at game_started FROM answers a LEFT JOIN games g ON g.id = a.game_id WHERE a.player_id = ? ORDER BY a.at DESC LIMIT ?').all(id, limit),
      adjustments: this.db.prepare('SELECT * FROM adjustments WHERE player_id = ? ORDER BY at DESC LIMIT 50').all(id),
      games: this.db.prepare('SELECT g.id, g.started_at, s.points, s.correct, s.wins FROM game_scores s JOIN games g ON g.id = s.game_id WHERE s.player_id = ? ORDER BY g.started_at DESC LIMIT 50').all(id),
    };
  }
}

function rowToEntry(r, i) {
  return { rank: i + 1, id: r.id, nickname: r.nickname, avatar: r.avatar, points: r.points, correct: r.correct, wins: r.wins, demo: !!r.is_demo };
}

export class GameHistory {
  constructor(db) { this.db = db; }

  create({ id, settings, questionIds, provider }) {
    this.db.prepare('INSERT INTO games (id, started_at, status, settings, question_ids, provider) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, now(), 'running', JSON.stringify(settings), JSON.stringify(questionIds), provider || '');
  }

  progress(id, questionsPlayed) {
    this.db.prepare('UPDATE games SET questions_played = ? WHERE id = ?').run(questionsPlayed, id);
  }

  finish(id, { top, questionsPlayed, status = 'finished' }) {
    const players = this.db.prepare('SELECT COUNT(*) n FROM game_scores WHERE game_id = ?').get(id).n;
    const c = top[0];
    this.db.prepare(`UPDATE games SET ended_at = ?, status = ?, questions_played = ?, players_count = ?, champion_id = ?, champion_name = ?,
      champion_avatar = ?, champion_points = ?, top = ? WHERE id = ?`)
      .run(now(), status, questionsPlayed, players, c?.id || null, c?.nickname || null, c?.avatar || null, c?.points ?? null, JSON.stringify(top), id);
  }

  remove(id) {
    tx(this.db, () => {
      this.db.prepare('DELETE FROM games WHERE id = ?').run(id);
    });
  }

  list(limit = 50) {
    return this.db.prepare('SELECT id, started_at, ended_at, status, questions_played, players_count, champion_name, champion_avatar, champion_points, top, provider FROM games ORDER BY started_at DESC LIMIT ?')
      .all(limit).map((g) => ({ ...g, top: g.top ? JSON.parse(g.top) : [] }));
  }

  get(id) {
    const g = this.db.prepare('SELECT * FROM games WHERE id = ?').get(id);
    if (!g) return null;
    return { ...g, settings: JSON.parse(g.settings || '{}'), question_ids: JSON.parse(g.question_ids || '[]'), top: g.top ? JSON.parse(g.top) : [] };
  }
}
