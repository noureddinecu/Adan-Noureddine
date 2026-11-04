import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { ROOT } from './helpers.js';

function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lqg-api-'));
  const app = createApp({ port: 0, host: '127.0.0.1', dataDir, dbFile: path.join(dataDir, 'db.sqlite'), uploadsDir: path.join(dataDir, 'uploads'), seedDir: path.join(ROOT, 'data'), distDir: path.join(dataDir, 'dist'), adminPassword: '', volatileMaxAgeDays: 180 });
  return new Promise((resolve) => app.server.listen(0, '127.0.0.1', () => resolve({ app, base: `http://127.0.0.1:${app.server.address().port}` })));
}

test('auth, game control, manual answers and the ingest webhook over HTTP', async () => {
  const { app, base } = await start();
  try {
    const j = (r) => r.json();
    assert.equal((await fetch(`${base}/api/questions`)).status, 401);
    assert.deepEqual(await fetch(`${base}/api/auth/status`).then(j), { configured: false, authenticated: false, managedByEnv: false });
    assert.equal((await fetch(`${base}/api/auth/setup`, { method: 'POST', body: JSON.stringify({ code: '000000', password: 'secret1' }) })).status, 400);
    const setup = await fetch(`${base}/api/auth/setup`, { method: 'POST', body: JSON.stringify({ code: app.auth.setupCode, password: 'secret1' }) });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie').split(';')[0];
    assert.match(setup.headers.get('set-cookie'), /HttpOnly/);
    const H = { cookie, 'x-lqg': '1', 'content-type': 'application/json' };
    // CSRF header required for mutations
    assert.equal((await fetch(`${base}/api/game/start`, { method: 'POST', headers: { cookie } })).status, 403);

    const boot = await fetch(`${base}/api/admin/bootstrap`, { headers: H }).then(j);
    assert.ok(boot.stats.total >= 150);

    await fetch(`${base}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify({ timing: { startDelay: 0 }, round: { count: 3, types: ['open', 'capital', 'country', 'complete'] } }) });
    await fetch(`${base}/api/provider/connect`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'manual' }) });
    const started = await fetch(`${base}/api/game/start`, { method: 'POST', headers: H, body: '{}' }).then(j);
    assert.equal(started.ok, true);
    const host = await fetch(`${base}/api/game/host`, { headers: H }).then(j);
    assert.ok(host.accepted.length > 0);
    // public overlay state must not contain the answer
    const pubState = await fetch(`${base}/api/public/state`).then(j);
    assert.equal(pubState.phase, 'question');
    assert.equal(pubState.result, null);

    const r1 = await fetch(`${base}/api/game/manual`, { method: 'POST', headers: H, body: JSON.stringify({ nickname: 'Sara', text: host.accepted[0] }) }).then(j);
    assert.equal(r1.status, 'correct');
    const r2 = await fetch(`${base}/api/game/manual`, { method: 'POST', headers: H, body: JSON.stringify({ nickname: 'Ali', markCorrect: true }) }).then(j);
    assert.equal(r2.rank, 2);

    // webhook provider
    const st = await fetch(`${base}/api/settings`, { headers: H }).then(j);
    await fetch(`${base}/api/provider/connect`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'webhook' }) });
    assert.equal((await fetch(`${base}/api/ingest/comment?key=wrong`, { method: 'POST', body: '{}' })).status, 401);
    const wh = await fetch(`${base}/api/ingest/comment`, { method: 'POST', headers: { 'x-ingest-key': st.provider.ingestKey }, body: JSON.stringify({ username: 'omar', comment: host.accepted[0] }) }).then(j);
    assert.deepEqual(wh.results, ['correct']);

    const pl = await fetch(`${base}/api/players`, { headers: H }).then(j);
    assert.deepEqual(pl.players.map((p) => [p.nickname, p.points]).sort(), [['Ali', 70], ['Sara', 100], ['omar', 50]]);

    // manual adjustment is logged
    const sara = pl.players.find((p) => p.nickname === 'Sara');
    await fetch(`${base}/api/players/${encodeURIComponent(sara.id)}/adjust`, { method: 'POST', headers: H, body: JSON.stringify({ delta: -20, reason: 'test' }) });
    const detail = await fetch(`${base}/api/players/${encodeURIComponent(sara.id)}`, { headers: H }).then(j);
    assert.equal(detail.player.points, 80);
    assert.equal(detail.adjustments[0].delta, -20);
    assert.equal(detail.answers[0].rank, 1);

    await fetch(`${base}/api/game/stop`, { method: 'POST', headers: H });
    const hist = await fetch(`${base}/api/history`, { headers: H }).then(j);
    assert.equal(hist.games[0].champion_name, 'Sara');

    // logout kills the session
    await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: H });
    assert.equal((await fetch(`${base}/api/players`, { headers: H })).status, 401);
    // wrong password
    assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ password: 'nope' }) })).status, 401);
  } finally {
    app.close();
  }
});
