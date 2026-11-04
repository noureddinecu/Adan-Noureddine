// المصادقة: كلمة مرور لوحة التحكم + جلسات آمنة (لا علاقة لها بحساب TikTok)
// Dashboard authentication: scrypt-hashed password, random session tokens stored hashed,
// HttpOnly cookie, login rate limiting. Nothing here relates to TikTok credentials.
import crypto from 'node:crypto';

const SESSION_DAYS = 30;
const COOKIE = 'lqg_session';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

export class Auth {
  constructor(db, kv, { envPassword = '' } = {}) {
    this.db = db;
    this.kv = kv;
    this.envPassword = envPassword;
    this.attempts = new Map(); // ip -> [timestamps]
    this.setupCode = null;
    if (!envPassword && !kv.get('auth')) this.setupCode = crypto.randomInt(100000, 999999).toString();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }

  get configured() { return !!(this.envPassword || this.kv.get('auth')); }

  status(req) {
    return { configured: this.configured, authenticated: !!this.session(req), managedByEnv: !!this.envPassword };
  }

  checkPassword(password) {
    if (this.envPassword) {
      const a = Buffer.from(sha(String(password)));
      const b = Buffer.from(sha(this.envPassword));
      return crypto.timingSafeEqual(a, b);
    }
    const stored = this.kv.get('auth');
    if (!stored) return false;
    const { hash } = hashPassword(password, stored.salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(stored.hash, 'hex'));
  }

  rateLimited(ip) {
    const now = Date.now();
    const list = (this.attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    this.attempts.set(ip, list);
    return list.length >= 8;
  }
  noteFailure(ip) { this.attempts.set(ip, [...(this.attempts.get(ip) || []), Date.now()]); }

  setup(code, password) {
    if (this.configured) return { ok: false, error: 'already configured' };
    if (!this.setupCode || String(code).trim() !== this.setupCode) return { ok: false, error: 'رمز الإعداد غير صحيح / wrong setup code' };
    if (String(password).length < 6) return { ok: false, error: 'كلمة المرور قصيرة (6 أحرف على الأقل) / password too short' };
    this.kv.set('auth', hashPassword(password));
    this.setupCode = null;
    return { ok: true };
  }

  changePassword(current, next) {
    if (this.envPassword) return { ok: false, error: 'كلمة المرور محددة عبر ADMIN_PASSWORD / managed by ADMIN_PASSWORD' };
    if (!this.checkPassword(current)) return { ok: false, error: 'كلمة المرور الحالية غير صحيحة / wrong current password' };
    if (String(next).length < 6) return { ok: false, error: 'كلمة المرور قصيرة / too short' };
    this.kv.set('auth', hashPassword(next));
    this.db.exec('DELETE FROM sessions');
    return { ok: true };
  }

  createSession(ua = '') {
    const token = crypto.randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at, ua) VALUES (?, ?, ?, ?)')
      .run(sha(token), Date.now(), Date.now() + SESSION_DAYS * 86400000, String(ua).slice(0, 200));
    return token;
  }

  session(req) {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const row = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha(token));
    if (!row || row.expires_at < Date.now()) return null;
    return row;
  }

  destroy(req) {
    const token = readCookie(req, COOKIE);
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  }

  cookie(token, secure) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
    if (secure) parts.push('Secure');
    return parts.join('; ');
  }
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}
