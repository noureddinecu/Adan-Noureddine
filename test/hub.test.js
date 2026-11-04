import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeEngine, OPEN, MCQ } from './helpers.js';
import { CommentHub } from '../server/comments/hub.js';
import { normalizeTikTokChat, explainTikTokError } from '../server/comments/tiktok.js';

class FakeTikTok extends EventEmitter {
  constructor(plan) { super(); this.plan = plan; }
  async connect() { const step = this.plan.shift(); if (step instanceof Error) throw step; return {}; }
  async disconnect() {}
}

test('normalizes TikTok chat events (v2 shape)', () => {
  const c = normalizeTikTokChat({ comment: 'Rabat', user: { userId: '42', uniqueId: 'noor', nickname: 'Noor', avatarThumb: { urlList: ['https://p16.tiktokcdn.com/a.jpg'] } } });
  assert.deepEqual(c, { platform: 'tiktok', userId: '42', uniqueId: 'noor', nickname: 'Noor', avatar: 'https://p16.tiktokcdn.com/a.jpg', text: 'Rabat' });
});

test('explains connection failures', () => {
  class UserOfflineError extends Error {}
  assert.equal(explainTikTokError(new UserOfflineError('x')).code, 'offline');
  assert.equal(explainTikTokError(new Error('getaddrinfo ENOTFOUND www.tiktok.com')).code, 'network');
  assert.equal(explainTikTokError(new Error('Rate Limit exceeded 429')).code, 'ratelimit');
  assert.equal(explainTikTokError(new Error('Failed to retrieve Room ID from all sources.')).code, 'room');
});

test('tiktok provider: comments flow into the game; drops trigger auto-reconnect', async () => {
  const { engine, settings, clock } = makeEngine([OPEN]);
  const instances = [];
  const plan = [null, new Error('ETIMEDOUT'), null];
  const hub = new CommentHub({ engine, settings, now: clock.now, timers: clock.timers, providerFactory: () => { const p = new FakeTikTok(plan); instances.push(p); return p; } });
  await hub.connect('tiktok', { username: 'my_live' });
  assert.equal(hub.status.state, 'connected');
  engine.start();
  instances[0].emit('comment', { platform: 'tiktok', userId: '1', uniqueId: 'u1', nickname: 'U1', text: 'تونس' });
  assert.equal(engine.current.winners[0].nickname, 'U1');
  instances[0].emit('dropped');
  assert.equal(hub.status.state, 'reconnecting');
  clock.advance(2000); // first retry fails (ETIMEDOUT)
  await new Promise((r) => setImmediate(r));
  assert.equal(hub.status.state, 'reconnecting');
  assert.equal(hub.status.message.code, 'network');
  clock.advance(4000); // second retry succeeds
  await new Promise((r) => setImmediate(r));
  assert.equal(hub.status.state, 'connected');
  assert.equal(instances.length, 3);
});

test('rejects invalid usernames without connecting', async () => {
  const { engine, settings } = makeEngine([OPEN]);
  const hub = new CommentHub({ engine, settings, providerFactory: () => assert.fail('should not connect') });
  await hub.connect('tiktok', { username: 'bad name!' });
  assert.equal(hub.status.state, 'error');
});

test('demo mode generates clearly labelled bot answers', async () => {
  const { engine, settings, clock, players } = makeEngine([MCQ]);
  const hub = new CommentHub({ engine, settings, now: clock.now, timers: clock.timers });
  await hub.connect('demo');
  engine.start();
  clock.advance(19000);
  assert.ok(hub.recent.length > 0);
  assert.ok(hub.recent.every((c) => c.platform === 'demo' && c.nickname.startsWith('🤖')));
  const w = engine.lastResult?.winners || engine.current?.winners;
  assert.ok(w.length > 0);
  assert.ok(players.top(10).every((p) => p.demo));
  await hub.disconnect();
});
