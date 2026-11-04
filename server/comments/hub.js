// مدير مزودات التعليقات (TikTok / Demo / Manual / Webhook) — مفصول عن محرك اللعبة
// Comment provider manager. Decoupled from the game engine: providers push normalized comments
// into `ingest()`, which time-stamps them on arrival and forwards them to the engine.
import { EventEmitter } from 'node:events';
import { TikTokProvider, explainTikTokError } from './tiktok.js';
import { DemoProvider } from './demo.js';

const RECENT = 80;
const BACKOFF = [2000, 4000, 8000, 15000, 30000, 30000, 60000];

export class CommentHub extends EventEmitter {
  constructor({ engine, settings, signApiKey = '', providerFactory = null, now = () => Date.now(), timers = { setTimeout, clearTimeout, setInterval, clearInterval } }) {
    super();
    Object.assign(this, { engine, settings, signApiKey, now, timers });
    this.makeTikTok = providerFactory || (() => new TikTokProvider({ signApiKey }));
    this.recent = [];
    this.tiktok = null;
    this.demo = null;
    this.retryTimer = null;
    this.status = { type: 'none', state: 'idle', username: '', message: null, viewers: 0, received: 0, lastAt: null, attempt: 0, since: null };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  /** Entry point for every comment from any provider. */
  ingest(raw) {
    const receivedAt = this.now(); // arrival time, recorded before anything else
    const c = {
      platform: String(raw.platform || 'manual'),
      userId: String(raw.userId || raw.uniqueId || raw.nickname || '').slice(0, 80),
      uniqueId: String(raw.uniqueId || '').slice(0, 80),
      nickname: String(raw.nickname || raw.uniqueId || '').slice(0, 60),
      avatar: /^https:\/\//.test(raw.avatar || '') ? String(raw.avatar).slice(0, 600) : '',
      text: String(raw.text || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      receivedAt,
    };
    if (!c.userId || !c.text) return { status: 'invalid' };
    this.status.received++;
    this.status.lastAt = receivedAt;
    const outcome = this.engine.handleComment(c);
    const entry = { id: `${receivedAt}-${this.status.received}`, at: receivedAt, platform: c.platform, nickname: c.nickname, avatar: c.avatar, text: c.text, outcome: outcome.status, rank: outcome.rank || null, points: outcome.points || 0 };
    this.recent.push(entry);
    if (this.recent.length > RECENT) this.recent.shift();
    this.emit('comment', entry);
    return outcome;
  }

  async connect(type, { username } = {}) {
    await this.disconnect({ silent: true });
    this.engine.providerName = type;
    this.settings.update({ provider: { type, ...(username !== undefined ? { username } : {}) } });
    const base = { type, viewers: 0, attempt: 0, message: null, since: this.now(), username: '' };
    if (type === 'demo') {
      this.demo = new DemoProvider({ engine: this.engine, ingest: (c) => this.ingest(c), timers: this.timers });
      this.demo.start();
      this.setStatus({ ...base, state: 'connected' });
    } else if (type === 'manual' || type === 'webhook') {
      this.setStatus({ ...base, state: 'connected' });
    } else if (type === 'tiktok') {
      const name = String(username || this.settings.get().provider.username || '').trim().replace(/^@/, '');
      if (!/^[\w.]{2,40}$/.test(name)) {
        this.setStatus({ ...base, state: 'error', message: { ar: 'أدخل اسم مستخدم TikTok صحيح (بدون كلمة مرور).', en: 'Enter a valid TikTok username (no password needed).' } });
        return this.status;
      }
      this.setStatus({ ...base, username: name, state: 'connecting' });
      await this.connectTikTok(name);
    } else {
      this.setStatus({ ...base, type: 'none', state: 'idle' });
    }
    return this.status;
  }

  async connectTikTok(name) {
    const provider = this.makeTikTok();
    this.tiktok = provider;
    provider.on('comment', (c) => this.ingest(c));
    provider.on('viewers', (n) => this.setStatus({ viewers: n }));
    provider.on('ended', () => this.onDrop(provider, { ar: 'انتهى البث المباشر.', en: 'The LIVE stream ended.' }, false));
    provider.on('dropped', () => this.onDrop(provider, { ar: 'انقطع الاتصال بالبث.', en: 'Connection to the LIVE dropped.' }, true));
    provider.on('warn', () => {});
    try {
      await provider.connect(name);
      if (this.tiktok !== provider) return;
      this.setStatus({ state: 'connected', attempt: 0, message: null, since: this.now() });
    } catch (e) {
      if (this.tiktok !== provider) return;
      const info = explainTikTokError(e);
      await provider.disconnect();
      this.tiktok = null;
      this.setStatus({ state: 'error', message: { ar: info.ar, en: info.en, code: info.code } });
      if (info.retry) this.scheduleRetry(name);
    }
  }

  onDrop(provider, message, retry) {
    if (this.tiktok !== provider) return;
    this.tiktok = null;
    provider.disconnect();
    this.setStatus({ state: retry ? 'reconnecting' : 'ended', message });
    if (retry) this.scheduleRetry(this.status.username);
  }

  scheduleRetry(name) {
    if (!this.settings.get().provider.autoReconnect || this.status.type !== 'tiktok') return;
    const attempt = this.status.attempt + 1;
    if (attempt > BACKOFF.length) return this.setStatus({ state: 'error' });
    const delay = BACKOFF[attempt - 1];
    this.setStatus({ state: 'reconnecting', attempt, retryAt: this.now() + delay });
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      if (this.status.type === 'tiktok') { this.setStatus({ state: 'connecting' }); this.connectTikTok(name); }
    }, delay);
  }

  async disconnect({ silent = false } = {}) {
    if (this.retryTimer) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.demo?.stop();
    this.demo = null;
    const t = this.tiktok;
    this.tiktok = null;
    if (t) await t.disconnect();
    if (!silent) this.setStatus({ type: 'none', state: 'idle', message: null, viewers: 0, attempt: 0, since: null });
    return this.status;
  }
}
