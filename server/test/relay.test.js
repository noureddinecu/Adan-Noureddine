import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../src/server.js';
import { normaliseUniqueId, chatToMessage } from '../src/relay.js';
import { makeFactory, EVENTS } from './fake-tiktok.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
function client(port, q) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${q}`);
  ws.msgs = [];
  ws.on('message', m => ws.msgs.push(JSON.parse(String(m))));
  return new Promise((res, rej) => { ws.on('open', () => res(ws)); ws.on('error', rej); ws.on('close', (c) => { ws.closeCode = c; res(ws); }); });
}

test('normaliseUniqueId accepts @user, URLs and junk', () => {
  assert.equal(normaliseUniqueId('@Gold.Rail_1'), 'gold.rail_1');
  assert.equal(normaliseUniqueId('https://www.tiktok.com/@abc/live'), 'abc');
  assert.equal(normaliseUniqueId('  x y<script>'), 'xyscript');
});

test('chatToMessage extracts name, avatar and text', () => {
  const m = chatToMessage({ comment: 'العربة 3', user: { uniqueId: 'u1', nickname: 'Nour', profilePicture: { url: ['https://a/b.jpg'] } } }, 0);
  assert.equal(m.t, 'chat'); assert.equal(m.u, 'u1'); assert.equal(m.n, 'Nour'); assert.equal(m.a, 'https://a/b.jpg'); assert.equal(m.c, 'العربة 3');
});

test('chatToMessage reads the v3 schema used by tiktok-live-connector 2.5 (content / displayId / avatarThumb)', async () => {
  const { viewersOf } = await import('../src/relay.js');
  const m = chatToMessage({ content: '3', user: { id: '7123', displayId: 'mohssin_1', nickname: 'mohssin', avatarThumb: { urlList: ['https://p16/av.webp'] } } }, 0);
  assert.equal(m.c, '3'); assert.equal(m.u, 'mohssin_1'); assert.equal(m.n, 'mohssin'); assert.equal(m.a, 'https://p16/av.webp');
  assert.equal(viewersOf({ total: '57' }), 57);
  assert.equal(viewersOf({ viewerCount: 9 }), 9);
});

test('relay forwards chats to every app client, rejects bad tokens', async () => {
  const factory = makeFactory();
  const srv = await startServer({ port: 0, token: 's3cret', createConnection: factory, events: EVENTS });
  try {
    const bad = await client(srv.port, 'user=abc&token=nope');
    await wait(100);
    assert.equal(bad.closeCode, 4401);

    const a = await client(srv.port, 'user=@Streamer&token=s3cret');
    const b = await client(srv.port, 'user=streamer&token=s3cret');
    await wait(150);
    assert.equal(factory.made.length, 1, 'one upstream per creator');
    const up = factory.made[0];
    assert.equal(up.id, 'streamer');
    up.chat('viewer1', '3'); up.chat('viewer2', 'أظن 5');
    up.emit('roomUser', { total: '42' });
    await wait(150);
    for (const ws of [a, b]) {
      const chats = ws.msgs.filter(m => m.t === 'chat');
      assert.deepEqual(chats.map(c => c.c), ['3', 'أظن 5']);
      assert.ok(chats[0].a.startsWith('https://'));
      assert.ok(ws.msgs.some(m => m.t === 'status' && m.state === 'connected'));
      assert.ok(ws.msgs.some(m => m.t === 'viewers' && m.n === 42));
    }
    a.send(JSON.stringify({ t: 'ping' })); await wait(100);
    assert.ok(a.msgs.some(m => m.t === 'pong'));
    const h = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json();
    assert.equal(h.ok, true);
    a.close(); b.close();
  } finally { srv.close(); }
});

test('relay waits for an offline creator and connects when they go live', async () => {
  const factory = makeFactory({ offlineTimes: 2 });
  const { createRelay } = await import('../src/relay.js');
  const got = [];
  const relay = createRelay({ createConnection: factory, events: EVENTS, retryMs: 50 });
  relay.join('late_streamer', { send: s => got.push(JSON.parse(s)) });
  await wait(400);
  const states = got.filter(m => m.t === 'status').map(m => m.state);
  assert.ok(states.includes('offline'), 'reports offline first');
  assert.equal(states[states.length - 1], 'connected');
  factory.made[factory.made.length - 1].chat('v', '2');
  await wait(20);
  assert.equal(got[got.length - 1].c, '2');
  relay.shutdown();
});

test('gift tracker counts streaks once (growing repeatCount + repeatEnd) and plain gifts per event', async () => {
  const { createGiftTracker } = await import('../src/relay.js');
  const t = createGiftTracker();
  const ev = (repeatCount, repeatEnd, combo = true, msgId = String(Math.random())) => t({ common: { msgId }, giftId: '1', groupId: 'a', repeatCount, repeatEnd,
    user: { displayId: 'yassine', nickname: 'Yassine' }, gift: { name: 'Rose', diamondCount: 1, combo, type: combo ? 1 : 0 } }, 0);
  const counts = [ev(1, 0), ev(3, 0), ev(5, 0), ev(5, 1)].map(m => m && m.count);
  assert.deepEqual(counts, [1, 2, 2, null]);
  const big = t({ common: { msgId: 'x1' }, giftId: '2', repeatCount: 1, user: { displayId: 'salma' }, gift: { name: 'Lion', diamondCount: 29999, combo: false, type: 0 } }, 0);
  assert.equal(big.coins, 29999); assert.equal(big.count, 1); assert.equal(big.gname, 'Lion');
  assert.equal(t({ common: { msgId: 'x1' }, giftId: '2', repeatCount: 1, user: { displayId: 'salma' }, gift: { diamondCount: 29999 } }, 0), null, 'duplicate msgId ignored');
});

test('relay forwards gifts, likes and follows', async () => {
  const factory = makeFactory();
  const srv = await startServer({ port: 0, token: 't', createConnection: factory, events: EVENTS });
  try {
    const a = await client(srv.port, 'user=x&token=t');
    await wait(150);
    const up = factory.made[0];
    up.gift('yassine', { coins: 1, repeats: [1, 4, 10] });
    up.gift('salma', { name: 'Galaxy', coins: 1000, combo: false });
    up.like('hamza', 15); up.follow('nour');
    await wait(150);
    const gifts = a.msgs.filter(m => m.t === 'gift');
    assert.deepEqual(gifts.map(g => [g.u, g.count, g.coins]), [['yassine', 1, 1], ['yassine', 3, 1], ['yassine', 6, 1], ['salma', 1, 1000]]);
    assert.ok(a.msgs.some(m => m.t === 'like' && m.count === 15 && m.u === 'hamza'));
    assert.ok(a.msgs.some(m => m.t === 'follow' && m.u === 'nour'));
    a.close();
  } finally { srv.close(); }
});
