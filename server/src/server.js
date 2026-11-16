/**
 * Gold Rail LIVE relay — HTTP + WebSocket entry point.
 *
 *   GET  /            → small status page
 *   GET  /health      → {"ok":true,...}  (the app pings this to keep free hosts awake)
 *   WS   /ws?user=<tiktok username>&token=<ACCESS_TOKEN>
 *
 * Environment variables:
 *   PORT           port to listen on (Render/Railway set it automatically)
 *   ACCESS_TOKEN   shared secret the app must send (strongly recommended)
 *   EULER_API_KEY  optional Euler Stream key (raises the free signing rate limits)
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { createRelay } from './relay.js';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.ACCESS_TOKEN || '';
const EULER = process.env.EULER_API_KEY || '';
const log = (...a) => console.log(new Date().toISOString(), ...a);
// bump on every server change → visible at /health so the host can check what Render runs
export const RELAY_VERSION = '2.1.2';

export function startServer({ port = PORT, token = TOKEN, createConnection, events } = {}) {
  const relay = createRelay({
    log,
    createConnection: createConnection || (id => new TikTokLiveConnection(id, {
      signApiKey: EULER || undefined,
      processInitialData: false,
      enableExtendedGiftInfo: false
    })),
    events: events || {
      CHAT: WebcastEvent.CHAT, ROOM_USER: WebcastEvent.ROOM_USER, STREAM_END: WebcastEvent.STREAM_END,
      DISCONNECTED: ControlEvent.DISCONNECTED, ERROR: ControlEvent.ERROR
    }
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, version: RELAY_VERSION, rooms: relay.rooms.size, auth: !!token, time: Date.now() }));
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;text-align:center;padding:40px;background:#F5F1E7">'
        + '<h1>🚂 عربة الذهب — سيرفر LIVE</h1><p>السيرفر خدّام ✓ · النسخة ' + RELAY_VERSION + '</p><p>حط هاد الرابط فالتطبيق: <b>' + (req.headers.host || '') + '</b></p>'
        + (token ? '' : '<p style="color:#c00">⚠️ ACCESS_TOKEN ما متحطش</p>') + '</body>');
    }
    res.writeHead(404); res.end('not found');
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    if (token && url.searchParams.get('token') !== token) {
      ws.close(4401, 'bad token');
      return;
    }
    const user = url.searchParams.get('user');
    let detach = null;
    const client = { send: s => { if (ws.readyState === 1) ws.send(s); } };
    try { detach = relay.join(user, client); } catch (e) { ws.close(4400, 'bad user'); return; }
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', m => {
      try { const d = JSON.parse(String(m)); if (d.t === 'ping') client.send(JSON.stringify({ t: 'pong', ts: Date.now() })); } catch (_) { /* ignore */ }
    });
    ws.on('close', () => detach && detach());
  });
  const hb = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (_) { /* */ } }
  }, 25000);

  return new Promise(resolve => server.listen(port, () => {
    log(`relay v${RELAY_VERSION} listening on :${server.address().port} auth=${!!token} euler=${!!EULER}`);
    resolve({ server, wss, relay, port: server.address().port, close: () => { clearInterval(hb); relay.shutdown(); wss.close(); server.close(); } });
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
