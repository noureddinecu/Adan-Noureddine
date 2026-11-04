import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, KV } from '../server/db.js';
import { QuestionStore } from '../server/questions/store.js';
import { PlayerRepo, GameHistory } from '../server/players.js';
import { SettingsStore } from '../server/settings.js';
import { GameEngine } from '../server/game/engine.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Seed dir with the real categories and only the given questions. */
export function seedDir(questions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lqg-seed-'));
  fs.copyFileSync(path.join(ROOT, 'data/categories.json'), path.join(dir, 'categories.json'));
  fs.mkdirSync(path.join(dir, 'questions'));
  fs.writeFileSync(path.join(dir, 'questions/test.json'), JSON.stringify({ questions }));
  return dir;
}

/** Manual clock + timers so tests control time precisely. */
export function fakeClock(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  const api = {
    now: () => now,
    timers: {
      setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; },
      clearTimeout: (id) => timers.delete(id),
      setInterval: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms, every: ms }); return id; },
      clearInterval: (id) => timers.delete(id),
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, t] = due;
        now = t.at;
        if (t.every) t.at += t.every; else timers.delete(id);
        t.fn();
      }
      now = end;
    },
  };
  return api;
}

export function makeEngine(questions, settingsPatch = {}) {
  const db = openDb(':memory:');
  const kv = new KV(db);
  const store = new QuestionStore(db, { seedDir: seedDir(questions) });
  const players = new PlayerRepo(db);
  const history = new GameHistory(db);
  const settings = new SettingsStore(kv);
  settings.update({ timing: { startDelay: 0, duration: 20, reveal: 5, autoAdvance: true }, display: { shuffleChoices: false }, round: { progressive: false }, ...settingsPatch });
  const clock = fakeClock();
  const engine = new GameEngine({ store, players, history, settings, kv, now: clock.now, timers: clock.timers, rng: () => 0.42 });
  return { db, kv, store, players, history, settings, engine, clock };
}

export const MCQ = {
  id: 't-mcq', category: 'geography', subcategory: 'capitals', region: 'arab', difficulty: 'easy', type: 'mcq', status: 'published',
  text: { ar: 'ما هي عاصمة المغرب؟', fr: 'Capitale du Maroc ?', en: 'Capital of Morocco?' }, source: { title: 'Wikipedia' },
  choices: [{ ar: 'الرباط', fr: 'Rabat', en: 'Rabat' }, { ar: 'فاس', fr: 'Fès', en: 'Fez' }, { ar: 'مراكش', fr: 'Marrakech', en: 'Marrakesh' }, { ar: 'طنجة', fr: 'Tanger', en: 'Tangier' }], correct: 0,
};
export const OPEN = {
  id: 't-open', category: 'geography', subcategory: 'capitals', region: 'arab', difficulty: 'medium', type: 'open', status: 'published',
  text: { ar: 'ما هي عاصمة تونس؟', fr: 'Capitale de la Tunisie ?', en: 'Capital of Tunisia?' }, source: { title: 'Wikipedia' },
  answers: { ar: ['تونس'], fr: ['Tunis'], en: ['Tunis'] },
};
export const comment = (name, text, extra = {}) => ({ platform: 'tiktok', userId: name, uniqueId: name, nickname: name, avatar: '', text, ...extra });
