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
    up.emit('roomUser', { viewerCount: 42 });
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
