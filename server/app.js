// تجميع التطبيق: قاعدة البيانات + المحرك + التعليقات + واجهات API + الملفات الثابتة
// Application assembly: DB + engine + comment hub + REST API + static files.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDb, KV } from './db.js';
import { QuestionStore } from './questions/store.js';
import { PlayerRepo, GameHistory } from './players.js';
import { SettingsStore } from './settings.js';
import { GameEngine } from './game/engine.js';
import { CommentHub } from './comments/hub.js';
import { Auth } from './auth.js';
import { Router, HttpError, sendJson, sendText, readJson, serveFile } from './lib/http.js';
import { Realtime } from './lib/realtime.js';
import { parseCsv, toCsv, CSV_COLUMNS, questionToRow, rowsToRawQuestions } from './questions/csv.js';
import { LANGS, DIFFICULTIES, REGIONS, STATUSES, TYPES, IMAGE_TYPES } from './questions/schema.js';

const UPLOAD_TYPES = {
  'image/png': ['.png', 3], 'image/jpeg': ['.jpg', 3], 'image/webp': ['.webp', 3], 'image/gif': ['.gif', 3], 'image/svg+xml': null,
  'audio/mpeg': ['.mp3', 2], 'audio/mp3': ['.mp3', 2], 'audio/ogg': ['.ogg', 2], 'audio/wav': ['.wav', 2], 'audio/x-wav': ['.wav', 2], 'audio/mp4': ['.m4a', 2], 'audio/x-m4a': ['.m4a', 2],
};

export function createApp(config, { providerFactory } = {}) {
  const db = openDb(config.dbFile);
  const kv = new KV(db);
  const store = new QuestionStore(db, { seedDir: config.seedDir, maxAgeDays: config.volatileMaxAgeDays });
  const players = new PlayerRepo(db);
  const history = new GameHistory(db);
  const settings = new SettingsStore(kv);
  const engine = new GameEngine({ store, players, history, settings, kv });
  const hub = new CommentHub({ engine, settings, signApiKey: config.tiktokSignApiKey, providerFactory });
  const auth = new Auth(db, kv, { envPassword: config.adminPassword });
  const rt = new Realtime();
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  // ---- real-time fan-out ----
  engine.on('state', (s) => rt.send('state', s));
  engine.on('correct', (w) => rt.send('fx', { type: w.rank === 1 ? 'first' : 'correct', rank: w.rank }));
  engine.on('answer', () => rt.send('fx', { type: 'wrong' }));
  engine.on('finished', () => rt.send('fx', { type: 'win' }));
  engine.on('state', () => rt.send('host', engine.hostView(), { adminOnly: true }));
  hub.on('status', (s) => rt.send('provider', publicStatus(s)));
  hub.on('comment', (c) => rt.send('comment', c, { adminOnly: true }));

  const publicStatus = (s) => ({ type: s.type, state: s.state, username: s.username, message: s.message, viewers: s.viewers, received: s.received, lastAt: s.lastAt, attempt: s.attempt, retryAt: s.retryAt || null, since: s.since });

  const meta = () => ({
    name: 'LIVE QUIZ GAME', categories: store.categories, langs: LANGS, difficulties: DIFFICULTIES, regions: REGIONS,
    statuses: STATUSES, types: TYPES, imageTypes: [...IMAGE_TYPES],
  });

  const r = new Router();
  const pub = (m, p, h) => r.add(m, p, h, { public: true });
  const adm = (m, p, h) => r.add(m, p, h, { public: false });

  // ---------- public ----------
  pub('GET', '/api/meta', () => meta());
  pub('GET', '/api/public/state', () => engine.publicState());
  pub('GET', '/api/health', () => ({ ok: true, uptime: process.uptime(), questions: store.all().length, provider: hub.status.state }));
  pub('POST', '/api/ingest/comment', async (req, url) => {
    const key = req.headers['x-ingest-key'] || url.searchParams.get('key') || '';
    const expected = settings.get().provider.ingestKey;
    if (!timingEq(String(key), expected)) throw new HttpError(401, 'invalid ingest key');
    if (hub.status.type !== 'webhook') throw new HttpError(409, 'webhook provider is not active — select "Webhook" in the dashboard');
    const b = await readJson(req, 64 * 1024);
    const list = Array.isArray(b) ? b.slice(0, 100) : [b];
    const out = list.map((x) => hub.ingest({
      platform: 'webhook', userId: x.userId || x.uniqueId || x.username, uniqueId: x.uniqueId || x.username,
      nickname: x.nickname || x.username || x.uniqueId, avatar: x.avatar || x.profilePictureUrl, text: x.comment ?? x.text,
    }).status);
    return { ok: true, results: out };
  });

  // ---------- auth ----------
  const ip = (req) => (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
  const secure = (req) => (config.trustProxy && req.headers['x-forwarded-proto'] === 'https') || !!req.socket.encrypted;
  pub('GET', '/api/auth/status', (req) => auth.status(req));
  pub('POST', '/api/auth/setup', async (req, url, res) => {
    if (auth.rateLimited(ip(req))) throw new HttpError(429, 'محاولات كثيرة، انتظر 10 دقائق / too many attempts');
    const b = await readJson(req);
    const out = auth.setup(b.code, b.password);
    if (!out.ok) { auth.noteFailure(ip(req)); throw new HttpError(400, out.error); }
    res.setHeader('Set-Cookie', auth.cookie(auth.createSession(req.headers['user-agent']), secure(req)));
    return { ok: true };
  });
  pub('POST', '/api/auth/login', async (req, url, res) => {
    if (auth.rateLimited(ip(req))) throw new HttpError(429, 'محاولات كثيرة، انتظر 10 دقائق / too many attempts');
    const b = await readJson(req);
    if (!auth.checkPassword(b.password || '')) { auth.noteFailure(ip(req)); throw new HttpError(401, 'كلمة المرور غير صحيحة / wrong password'); }
    res.setHeader('Set-Cookie', auth.cookie(auth.createSession(req.headers['user-agent']), secure(req)));
    return { ok: true };
  });
  adm('POST', '/api/auth/logout', (req, url, res) => { auth.destroy(req); res.setHeader('Set-Cookie', auth.cookie('', secure(req))); return { ok: true }; });
  adm('POST', '/api/auth/password', async (req) => {
    const b = await readJson(req);
    const out = auth.changePassword(b.current, b.next);
    if (!out.ok) throw new HttpError(400, out.error);
    return out;
  });

  // ---------- dashboard bootstrap & settings ----------
  adm('GET', '/api/admin/bootstrap', () => ({
    meta: meta(), settings: settings.get(), provider: publicStatus(hub.status), comments: hub.recent, host: engine.hostView(),
    state: engine.publicState(), stats: store.stats(), network: networkUrls(config.port), clients: rt.counts,
    tiktokSignKey: !!config.tiktokSignApiKey,
  }));
  adm('GET', '/api/settings', () => settings.get());
  adm('PUT', '/api/settings', async (req) => {
    const s = settings.update(await readJson(req));
    engine.changed(true);
    return s;
  });
  adm('POST', '/api/settings/ingest-key', () => settings.regenerateIngestKey());
  adm('GET', '/api/network', () => ({ urls: networkUrls(config.port), clients: rt.counts }));

  // ---------- game control ----------
  adm('POST', '/api/game/preview', async (req) => engine.preview((await readJson(req)).round || {}));
  adm('POST', '/api/game/start', async (req) => {
    const b = await readJson(req);
    if (b.round) settings.update({ round: b.round });
    const out = engine.start();
    if (!out.ok) throw new HttpError(400, out.error, { stats: out.stats });
    return out;
  });
  for (const action of ['next', 'stop', 'pause', 'resume']) adm('POST', `/api/game/${action}`, () => engine[action]());
  adm('POST', '/api/game/restart', () => {
    const out = engine.restartRound();
    if (!out.ok) throw new HttpError(400, out.error);
    return out;
  });
  adm('GET', '/api/game/host', () => engine.hostView() || {});
  adm('POST', '/api/game/manual', async (req) => {
    const b = await readJson(req);
    const nickname = String(b.nickname || '').trim().slice(0, 40);
    if (!nickname) throw new HttpError(400, 'الاسم مطلوب / name required');
    if (b.markCorrect) return engine.manualCorrect({ nickname });
    return hub.ingest({ platform: 'manual', userId: nickname.toLowerCase(), uniqueId: nickname, nickname, text: String(b.text || '') });
  });

  // ---------- comment providers ----------
  adm('POST', '/api/provider/connect', async (req) => {
    const b = await readJson(req);
    if (!['tiktok', 'demo', 'manual', 'webhook'].includes(b.type)) throw new HttpError(400, 'unknown provider');
    return publicStatus(await hub.connect(b.type, { username: b.username }));
  });
  adm('POST', '/api/provider/disconnect', async () => publicStatus(await hub.disconnect()));

  // ---------- questions ----------
  const withV = (q) => ({ ...q, validation: store.validate(q) });
  adm('GET', '/api/questions', () => ({ questions: store.all().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id)).map(withV) }));
  adm('GET', '/api/questions/stats', () => store.stats());
  adm('POST', '/api/questions', async (req) => {
    const out = store.save(await readJson(req), { isNew: true });
    if (!out.ok) throw new HttpError(out.status, (out.errors || []).join(' · '), { errors: out.errors, warnings: out.warnings });
    return { question: withV(out.question), warnings: out.warnings };
  });
  adm('GET', '/api/questions/export', (req, url, res) => {
    const status = url.searchParams.get('status');
    const list = store.all().filter((q) => !status || q.status === status);
    if (url.searchParams.get('format') === 'csv') {
      sendText(res, 200, toCsv([CSV_COLUMNS, ...list.map(questionToRow)]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="live-quiz-questions.csv"' });
    } else {
      sendText(res, 200, JSON.stringify({ questions: list }, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="live-quiz-questions.json"' });
    }
  });
  adm('GET', '/api/questions/template.csv', (req, url, res) => sendText(res, 200, toCsv([CSV_COLUMNS]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="questions-template.csv"' }));
  adm('POST', '/api/questions/import', async (req) => {
    const b = await readJson(req);
    let raw;
    try {
      if (b.format === 'csv') raw = rowsToRawQuestions(parseCsv(b.content || ''));
      else {
        const data = typeof b.content === 'string' ? JSON.parse(b.content) : b.content;
        raw = Array.isArray(data) ? data : data?.questions;
      }
    } catch (e) { throw new HttpError(400, `تعذر قراءة الملف / cannot parse file: ${e.message}`); }
    if (!Array.isArray(raw)) throw new HttpError(400, 'لا توجد قائمة أسئلة / no question list found');
    return store.importMany(raw.slice(0, 5000), { status: STATUSES.includes(b.status) ? b.status : 'review', overwrite: !!b.overwrite });
  });
  adm('GET', '/api/questions/:id', (req, url, res, p) => { const q = store.get(p.id); if (!q) throw new HttpError(404, 'not found'); return withV(q); });
  adm('PUT', '/api/questions/:id', async (req, url, res, p) => {
    const out = store.save({ ...(await readJson(req)), id: p.id });
    if (!out.ok) throw new HttpError(out.status, (out.errors || []).join(' · '), { errors: out.errors, warnings: out.warnings });
    return { question: withV(out.question), warnings: out.warnings };
  });
  adm('DELETE', '/api/questions/:id', (req, url, res, p) => { if (!store.remove(p.id)) throw new HttpError(404, 'not found'); return { ok: true }; });
  adm('POST', '/api/questions/:id/status', async (req, url, res, p) => {
    const out = store.setStatus(p.id, (await readJson(req)).status);
    if (!out.ok) throw new HttpError(out.status, (out.errors || []).join(' · '), { errors: out.errors });
    return { question: withV(out.question) };
  });
  adm('POST', '/api/questions/:id/verify', (req, url, res, p) => {
    const out = store.markVerified(p.id);
    if (!out.ok) throw new HttpError(out.status, (out.errors || []).join(' · '));
    return { question: withV(out.question) };
  });

  // ---------- uploads ----------
  adm('POST', '/api/upload', async (req) => {
    const { dataUrl } = await readJson(req);
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    const t = m && UPLOAD_TYPES[m[1]];
    if (!t) throw new HttpError(400, 'نوع الملف غير مدعوم (PNG/JPG/WEBP/GIF أو MP3/OGG/WAV/M4A) / unsupported file type');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > t[1] * 1024 * 1024) throw new HttpError(413, `الحجم الأقصى ${t[1]}MB / max ${t[1]}MB`);
    const name = `${crypto.randomBytes(8).toString('hex')}${t[0]}`;
    fs.writeFileSync(path.join(config.uploadsDir, name), buf);
    return { url: `/uploads/${name}` };
  });

  // ---------- players ----------
  adm('GET', '/api/players', (req, url) => players.list({ q: url.searchParams.get('q') || '', sort: url.searchParams.get('sort') || 'points', limit: Math.min(500, Number(url.searchParams.get('limit')) || 200) }));
  adm('POST', '/api/players/reset', () => { players.resetScores(); engine.changed(true); return { ok: true }; });
  adm('POST', '/api/players/remove-demo', () => { const n = players.removeDemo(); engine.changed(true); return { removed: n }; });
  adm('GET', '/api/players/:id', (req, url, res, p) => { const pl = players.get(p.id); if (!pl) throw new HttpError(404, 'not found'); return { player: pl, ...players.history(p.id) }; });
  adm('POST', '/api/players/:id/adjust', async (req, url, res, p) => {
    const b = await readJson(req);
    const pl = players.adjust(p.id, b.delta, b.reason);
    if (!pl) throw new HttpError(404, 'not found');
    engine.changed(true);
    return { player: pl };
  });
  adm('POST', '/api/players/:id/ban', async (req, url, res, p) => { const pl = players.setBanned(p.id, !!(await readJson(req)).banned); engine.changed(true); return { player: pl }; });
  adm('DELETE', '/api/players/:id', (req, url, res, p) => { players.remove(p.id); engine.changed(true); return { ok: true }; });

  // ---------- history ----------
  adm('GET', '/api/history', () => ({ games: history.list(100) }));
  adm('GET', '/api/history/:id', (req, url, res, p) => {
    const g = history.get(p.id);
    if (!g) throw new HttpError(404, 'not found');
    const qs = g.question_ids.map((id) => store.get(id)).filter(Boolean).map((q) => ({ id: q.id, text: q.text, category: q.category }));
    return { game: g, questions: qs };
  });
  adm('DELETE', '/api/history/:id', (req, url, res, p) => { history.remove(p.id); return { ok: true }; });

  // ---------- HTTP server ----------
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname === '/events') {
        const admin = url.searchParams.get('admin') === '1';
        if (admin && !auth.session(req)) return sendJson(res, 401, { error: 'unauthorized' });
        const initial = [['state', engine.publicState()], ['provider', publicStatus(hub.status)]];
        if (admin) initial.push(['host', engine.hostView()]);
        return rt.add(req, res, { admin, initial });
      }
      if (url.pathname.startsWith('/api/')) {
        const route = r.match(req.method, url.pathname);
        if (!route) throw new HttpError(404, 'not found');
        if (!route.opts.public) {
          if (!auth.session(req)) throw new HttpError(401, 'unauthorized');
          // CSRF guard: browsers cannot send this custom header cross-site without a CORS preflight (which we never allow).
          if (req.method !== 'GET' && req.headers['x-lqg'] !== '1') throw new HttpError(403, 'missing X-LQG header');
        }
        const out = await route.handler(req, url, res, route.params);
        if (!res.headersSent && out !== undefined) sendJson(res, 200, out);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) sendJson(res, status, { error: e.message || 'server error', errors: e.errors, warnings: e.warnings, stats: e.stats });
    }
  });

  const CSP = "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; manifest-src 'self'; worker-src 'self'";
  function serveHtml(req, res, name) {
    const file = path.join(config.distDir, name);
    if (!fs.existsSync(file)) return sendText(res, 503, 'الواجهة غير مبنية بعد. نفّذ: npm run build\nUI not built yet. Run: npm run build');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }
  function serveStatic(req, res, pathname) {
    if (pathname === '/overlay' || pathname === '/overlay/' || pathname === '/screen') return serveHtml(req, res, 'overlay.html');
    if (pathname.startsWith('/uploads/')) {
      if (serveFile(req, res, config.uploadsDir, pathname.slice('/uploads/'.length), { cache: 'public, max-age=604800' })) return;
      return sendText(res, 404, 'Not found');
    }
    if (pathname === '/' || pathname === '/index.html') return serveHtml(req, res, 'index.html');
    if (pathname === '/overlay.html') return serveHtml(req, res, 'overlay.html');
    const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (serveFile(req, res, config.distDir, pathname.slice(1), { cache })) return;
    if (!path.extname(pathname)) return serveHtml(req, res, 'index.html'); // SPA fallback
    sendText(res, 404, 'Not found');
  }

  function close() {
    rt.close();
    hub.disconnect({ silent: true });
    engine.clearTimers();
    server.close();
    db.close();
  }

  return { server, db, store, players, history, settings, engine, hub, auth, rt, close };
}

function timingEq(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function networkUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}
