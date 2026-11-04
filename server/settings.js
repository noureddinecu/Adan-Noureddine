// إعدادات اللعبة القابلة للتعديل من لوحة التحكم (محفوظة في قاعدة البيانات)
// Game settings editable from the dashboard, persisted in the kv table and validated here.
import crypto from 'node:crypto';

export const SOUND_EVENTS = ['question', 'tick', 'correct', 'wrong', 'first', 'win'];

export function defaultSettings() {
  return {
    round: { categories: [], excludeSubcategories: [], difficulties: [], types: [], count: 10, progressive: true },
    timing: { duration: 20, reveal: 6, startDelay: 5, autoAdvance: true },
    scoring: { winners: 4, points: [100, 70, 50, 30] },
    quota: { arab: 65, world: 25, foreign: 10 },
    display: { lang: 'ar', hints: true, showFeed: true, showLeaderboard: true, shuffleChoices: true },
    effects: { sound: true, volume: 0.8, confetti: true, lowFx: false, sounds: Object.fromEntries(SOUND_EVENTS.map((e) => [e, ''])) },
    provider: { type: 'demo', username: '', autoReconnect: true, ingestKey: crypto.randomBytes(16).toString('hex') },
  };
}

const int = (v, min, max, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
};
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const strList = (v, max = 50) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length < 80).slice(0, max) : []);
const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);
const soundUrl = (v) => (typeof v === 'string' && /^(\/uploads\/[\w.-]+|https:\/\/[^\s"'<>]{1,400})$/.test(v) ? v : '');

/** Merge a (partial) patch into the current settings, coercing every field to a safe value. */
export function mergeSettings(cur, patch = {}) {
  const d = defaultSettings();
  const p = (k) => ({ ...(cur[k] || d[k]), ...(patch[k] || {}) });
  const round = p('round');
  const timing = p('timing');
  const scoring = p('scoring');
  const quota = p('quota');
  const display = p('display');
  const effects = p('effects');
  const provider = p('provider');

  const winners = int(scoring.winners, 1, 10, 4);
  const points = Array.from({ length: winners }, (_, i) => int(scoring.points?.[i], 0, 10000, d.scoring.points[i] ?? 10));

  return {
    round: {
      categories: strList(round.categories),
      excludeSubcategories: strList(round.excludeSubcategories, 200),
      difficulties: strList(round.difficulties, 3),
      types: strList(round.types, 20),
      count: int(round.count, 1, 100, 10),
      progressive: bool(round.progressive, true),
    },
    timing: {
      duration: int(timing.duration, 5, 180, 20),
      reveal: int(timing.reveal, 2, 60, 6),
      startDelay: int(timing.startDelay, 0, 60, 5),
      autoAdvance: bool(timing.autoAdvance, true),
    },
    scoring: { winners, points },
    quota: { arab: int(quota.arab, 0, 100, 65), world: int(quota.world, 0, 100, 25), foreign: int(quota.foreign, 0, 100, 10) },
    display: {
      lang: pick(display.lang, ['ar', 'fr', 'en'], 'ar'),
      hints: bool(display.hints, true),
      showFeed: bool(display.showFeed, true),
      showLeaderboard: bool(display.showLeaderboard, true),
      shuffleChoices: bool(display.shuffleChoices, true),
    },
    effects: {
      sound: bool(effects.sound, true),
      volume: Math.max(0, Math.min(1, Number(effects.volume ?? 0.8) || 0)),
      confetti: bool(effects.confetti, true),
      lowFx: bool(effects.lowFx, false),
      sounds: Object.fromEntries(SOUND_EVENTS.map((e) => [e, soundUrl(effects.sounds?.[e])])),
    },
    provider: {
      type: pick(provider.type, ['tiktok', 'demo', 'manual', 'webhook'], 'demo'),
      username: String(provider.username || '').trim().replace(/^@/, '').slice(0, 60),
      autoReconnect: bool(provider.autoReconnect, true),
      ingestKey: /^[a-f0-9]{32}$/.test(provider.ingestKey) ? provider.ingestKey : (cur.provider?.ingestKey || d.provider.ingestKey),
    },
  };
}

export class SettingsStore {
  constructor(kv) {
    this.kv = kv;
    this.value = mergeSettings(defaultSettings(), kv.get('settings', {}) || {});
    this.kv.set('settings', this.value);
  }
  get() { return this.value; }
  update(patch) {
    this.value = mergeSettings(this.value, patch);
    this.kv.set('settings', this.value);
    return this.value;
  }
  regenerateIngestKey() {
    return this.update({ provider: { ingestKey: crypto.randomBytes(16).toString('hex') } });
  }
}
