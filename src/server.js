// خادم المسابقة: واجهة الإدارة، شاشة البث (Overlay)، وواجهة برمجية REST + SSE
// Quiz server: static pages, admin REST API, live overlay updates via Server-Sent Events.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { QuestionStore } from './store.js';
import { QuizGame, DEFAULT_SETTINGS } from './game.js';
import { TikTokBridge } from './tiktok.js';
import { parseCsv, toCsv, CSV_COLUMNS, questionToRow, rowsToRawQuestions } from './csv.js';
import { LANGS, DIFFICULTIES, REGIONS, STATUSES, TYPES } from './schema.js';
import { DEFAULT_QUOTA } from './selector.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(PUBLIC, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(9).toString('base64url');
const MAX_BODY = 6 * 1024 * 1024;
const MAX_IMAGE = 3 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8',
};
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

export function createApp({ dataDir = path.join(ROOT, 'data'), token = ADMIN_TOKEN } = {}) {
  const store = new QuestionStore(dataDir, { maxAgeDays: Number(process.env.VOLATILE_MAX_AGE_DAYS || 180) });
  const game = new QuizGame(store);
  const tiktok = new TikTokBridge();
  const clients = new Set();
  const recentComments = [];

  function broadcast(type, payload) {
    const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(msg);
  }
  game.on('state', (s) => broadcast('state', s));
  game.on('correct', (w) => broadcast('correct', w));
  game.on('finished', (f) => broadcast('finished', f));
  tiktok.on('status', (s) => broadcast('tiktok', s));

  function onComment(c, simulated = false) {
    const outcome = game.handleComment(c);
    recentComments.push({ nickname: c.nickname, text: c.text.slice(0, 120), correct: !!outcome.correct, simulated });
    if (recentComments.length > 30) recentComments.shift();
    broadcast('comment', recentComments[recentComments.length - 1]);
    return outcome;
  }
  tiktok.on('comment', (c) => onComment(c));

  const send = (res, status, body, headers = {}) => {
    const isStr = typeof body === 'string' || Buffer.isBuffer(body);
    res.writeHead(status, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(isStr ? body : JSON.stringify(body));
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('الطلب كبير جداً'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON غير صالح'), { status: 400 })); }
    });
    req.on('error', reject);
  });

  const isAdmin = (req, url) => {
    const given = req.headers['x-admin-token'] || url.searchParams.get('token') || '';
    const a = Buffer.from(String(given));
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  function serveStatic(res, pathname) {
    if (pathname === '/') pathname = '/admin.html';
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'Not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    });
  }

  function saveImage(dataUrl) {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw Object.assign(new Error('صيغة الصورة غير مدعومة (PNG / JPG / WEBP / GIF)'), { status: 400 });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGE) throw Object.assign(new Error('حجم الصورة أكبر من 3MB'), { status: 413 });
    fs.mkdirSync(UPLOADS, { recursive: true });
    const name = `${crypto.randomBytes(8).toString('hex')}${IMAGE_EXT[m[1]]}`;
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    return `/uploads/${name}`;
  }

  const withValidation = (q) => ({ ...q, validation: store.validate(q) });

  async function api(req, res, url) {
    const p = url.pathname;
    const m = req.method;

    // ---- Public endpoints (overlay) ----
    if (m === 'GET' && p === '/api/meta') {
      return send(res, 200, { categories: store.categories, langs: LANGS, difficulties: DIFFICULTIES, regions: REGIONS, statuses: STATUSES, types: TYPES, defaults: DEFAULT_SETTINGS, quota: DEFAULT_QUOTA });
    }
    if (m === 'GET' && p === '/api/state') return send(res, 200, game.publicState());

    // ---- Admin endpoints ----
    if (!isAdmin(req, url)) return send(res, 401, { error: 'رمز الإدارة غير صحيح' });

    if (m === 'GET' && p === '/api/auth') return send(res, 200, { ok: true });
    if (m === 'GET' && p === '/api/stats') return send(res, 200, store.stats());

    if (m === 'GET' && p === '/api/questions') {
      const f = Object.fromEntries(url.searchParams);
      const needle = (f.q || '').toLowerCase();
      let list = store.all().filter((q) =>
        (!f.category || q.category === f.category) && (!f.status || q.status === f.status) &&
        (!f.difficulty || q.difficulty === f.difficulty) && (!f.region || q.region === f.region) &&
        (!f.type || q.type === f.type) && (!f.volatile || q.volatile) &&
        (!needle || JSON.stringify([q.id, q.text, q.choices, q.answers, q.tags]).toLowerCase().includes(needle)));
      list = list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id)).map(withValidation);
      if (f.issues === 'stale') list = list.filter((q) => q.validation.warnings.some((w) => w.includes('آخر تحقق قديم')));
      return send(res, 200, { questions: list });
    }
    if (m === 'POST' && p === '/api/questions') {
      const r = store.save(await readBody(req), { isNew: true });
      return send(res, r.ok ? 201 : r.status, r.ok ? { question: withValidation(r.question), warnings: r.warnings } : r);
    }
    if (m === 'GET' && p === '/api/questions/export') {
      const fmt = url.searchParams.get('format') || 'json';
      const status = url.searchParams.get('status');
      const list = store.all().filter((q) => !status || q.status === status);
      if (fmt === 'csv') return send(res, 200, toCsv([CSV_COLUMNS, ...list.map(questionToRow)]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="questions.csv"' });
      return send(res, 200, JSON.stringify({ questions: list }, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="questions.json"' });
    }
    if (m === 'GET' && p === '/api/questions/template.csv') {
      return send(res, 200, toCsv([CSV_COLUMNS]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="questions-template.csv"' });
    }
    if (m === 'POST' && p === '/api/questions/import') {
      const body = await readBody(req);
      let raw;
      try {
        if (body.format === 'csv') raw = rowsToRawQuestions(parseCsv(body.content || ''));
        else {
          const data = typeof body.content === 'string' ? JSON.parse(body.content) : body.content;
          raw = Array.isArray(data) ? data : data?.questions;
        }
      } catch (e) {
        return send(res, 400, { error: `تعذر قراءة الملف: ${e.message}` });
      }
      if (!Array.isArray(raw)) return send(res, 400, { error: 'الملف لا يحتوي على قائمة أسئلة' });
      const status = STATUSES.includes(body.status) ? body.status : 'review';
      return send(res, 200, store.importMany(raw, { status, overwrite: !!body.overwrite }));
    }
    const qm = /^\/api\/questions\/([\w-]+)(\/status)?$/.exec(p);
    if (qm) {
      const id = qm[1];
      if (qm[2] && m === 'POST') {
        const r = store.setStatus(id, (await readBody(req)).status);
        return send(res, r.ok ? 200 : r.status, r.ok ? { question: withValidation(r.question) } : r);
      }
      if (m === 'GET') { const q = store.get(id); return q ? send(res, 200, withValidation(q)) : send(res, 404, { error: 'غير موجود' }); }
      if (m === 'PUT') {
        const r = store.save({ ...(await readBody(req)), id });
        return send(res, r.ok ? 200 : r.status, r.ok ? { question: withValidation(r.question), warnings: r.warnings } : r);
      }
      if (m === 'DELETE') return store.remove(id) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'غير موجود' });
    }
    if (m === 'POST' && p === '/api/upload') return send(res, 201, { url: saveImage((await readBody(req)).dataUrl) });

    // ---- Live game control ----
    if (m === 'POST' && p === '/api/game/preview') return send(res, 200, game.preview(await readBody(req)));
    if (m === 'POST' && p === '/api/game/start') { const r = game.startRound(await readBody(req)); return send(res, r.ok ? 200 : 400, r); }
    if (m === 'POST' && p === '/api/game/next') { game.next(); return send(res, 200, { ok: true }); }
    if (m === 'POST' && p === '/api/game/stop') { game.stop(); return send(res, 200, { ok: true }); }
    if (m === 'POST' && p === '/api/game/reset-scores') { game.resetScores(); return send(res, 200, { ok: true }); }
    if (m === 'GET' && p === '/api/game/current-answer') {
      // Host-only peek at the answer of the open question.
      const cur = game.current;
      return send(res, 200, cur ? { id: cur.q.id, correctIndex: cur.correctIndex, accepted: cur.accepted } : {});
    }
    if (m === 'POST' && p === '/api/simulate') {
      const b = await readBody(req);
      const nickname = String(b.nickname || 'tester').slice(0, 40);
      return send(res, 200, onComment({ userId: `sim:${nickname}`, nickname, avatar: b.avatar || '', text: String(b.text || '') }, true));
    }
    if (m === 'GET' && p === '/api/comments') return send(res, 200, { comments: recentComments, tiktok: tiktok.status });
    if (m === 'POST' && p === '/api/tiktok/connect') {
      try { return send(res, 200, await tiktok.connect((await readBody(req)).username)); } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
    }
    if (m === 'POST' && p === '/api/tiktok/disconnect') { await tiktok.disconnect(); return send(res, 200, tiktok.status); }

    return send(res, 404, { error: 'Not found' });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`retry: 2000\nevent: state\ndata: ${JSON.stringify(game.publicState())}\n\n`);
        res.write(`event: tiktok\ndata: ${JSON.stringify(tiktok.status)}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
      }
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(res, url.pathname);
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: e.message || 'خطأ في الخادم' });
    }
  });

  return { server, store, game, tiktok };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, store } = createApp();
  server.listen(PORT, HOST, () => {
    const base = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`\n🎮 منصة المسابقات تعمل — ${store.all().length} سؤال في البنك`);
    console.log(`   لوحة الإدارة:  ${base}/admin.html`);
    console.log(`   شاشة البث:     ${base}/overlay.html?lang=ar   (أضفها كـ Browser Source / Link في TikTok LIVE Studio أو OBS)`);
    console.log(`   رمز الإدارة:   ${ADMIN_TOKEN}${process.env.ADMIN_TOKEN ? '' : '   (عيّن ADMIN_TOKEN لتثبيته)'}\n`);
  });
}
