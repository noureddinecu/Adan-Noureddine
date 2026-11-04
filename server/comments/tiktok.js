// مزود تعليقات TikTok LIVE عبر مكتبة tiktok-live-connector (غير رسمية)
// TikTok LIVE chat through the unofficial `tiktok-live-connector` library.
// Reads the PUBLIC chat of a live stream by username only — no TikTok password or session is used or stored.
import { EventEmitter } from 'node:events';

/** Normalise a chat event (library v1 or v2 shapes). */
export function normalizeTikTokChat(d = {}) {
  const u = d.user || d;
  const avatar = u.profilePictureUrl || d.profilePictureUrl || u.profilePicture?.url?.[0] || u.profilePicture?.urls?.[0]
    || u.avatarThumb?.urlList?.[0] || u.avatarMedium?.urlList?.[0] || '';
  const uniqueId = u.uniqueId || d.uniqueId || u.displayId || '';
  return {
    platform: 'tiktok',
    userId: String(u.userId || d.userId || uniqueId || ''),
    uniqueId,
    nickname: u.nickname || d.nickname || uniqueId,
    avatar: /^https:\/\//.test(avatar) ? avatar : '',
    text: String(d.comment ?? d.content ?? ''),
  };
}

/** Human explanation (ar/en) for a connection failure. */
export function explainTikTokError(e) {
  const name = e?.constructor?.name || e?.name || '';
  const msg = String(e?.message || e || '');
  const has = (re) => re.test(msg) || re.test(name);
  if (has(/UserOffline|isn't online|not live|LIVE has ended|offline/i)) return { code: 'offline', retry: true, ar: 'الحساب ليس في بث مباشر الآن. ابدأ البث ثم أعد المحاولة.', en: 'This account is not LIVE right now. Start the stream, then retry.' };
  if (has(/InvalidUniqueId|user_not_found|not found|19881007/i)) return { code: 'user', retry: false, ar: 'اسم المستخدم غير صحيح أو غير موجود.', en: 'Invalid or unknown username.' };
  if (has(/RateLimit|429|Too Many/i)) return { code: 'ratelimit', retry: true, ar: 'تم تجاوز حد خادم التوقيع (Euler Stream). أضف مفتاح TIKTOK_SIGN_API_KEY أو انتظر قليلاً.', en: 'Sign server rate limit (Euler Stream). Add TIKTOK_SIGN_API_KEY or wait.' };
  if (has(/SignAPI|Sign server|signature|Premium/i)) return { code: 'sign', retry: true, ar: 'فشل خادم التوقيع الخارجي (Euler Stream) الذي تحتاجه المكتبة للاتصال.', en: 'The external sign server (Euler Stream) required by the library failed.' };
  if (has(/Room ID|roomId|InvalidResponseComposite/i)) return { code: 'room', retry: true, ar: 'تعذر العثور على البث: إما أن الحساب ليس في بث مباشر الآن، أو أن هذا الخادم لا يستطيع الوصول إلى TikTok (شبكة/حظر IP).', en: 'Could not find the LIVE room: the account is not live, or this server cannot reach TikTok (network / IP block).' };
  if (has(/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|socket hang up|tunnel|403/i)) return { code: 'network', retry: true, ar: 'تعذر الوصول إلى خوادم TikTok من هذا الخادم (شبكة أو جدار ناري أو حظر لعنوان IP).', en: 'Cannot reach TikTok servers from this host (network, firewall or IP block).' };
  if (has(/ConnectTimeout|timeout/i)) return { code: 'timeout', retry: true, ar: 'انتهت مهلة الاتصال. أعد المحاولة.', en: 'Connection timed out. Retry.' };
  if (has(/Cannot find (module|package)|ERR_MODULE_NOT_FOUND/i)) return { code: 'missing', retry: false, ar: 'مكتبة tiktok-live-connector غير مثبتة. نفّذ npm install.', en: 'tiktok-live-connector is not installed. Run npm install.' };
  return { code: 'unknown', retry: true, ar: `خطأ في الاتصال: ${msg.slice(0, 160)}`, en: `Connection error: ${msg.slice(0, 160)}` };
}

/**
 * tiktok-live-connector v2 needs Node ≥ 20. On older runtimes (the Node 18 embedded in the Android app)
 * fall back to the last v1 release, installed as "tiktok-live-connector-legacy". Both emit the same events.
 */
async function loadConnector() {
  try {
    const mod = await import('tiktok-live-connector');
    const C = mod.TikTokLiveConnection || mod.WebcastPushConnection || mod.default?.TikTokLiveConnection;
    if (C) return C;
  } catch { /* fall through to v1 */ }
  const legacy = await import('tiktok-live-connector-legacy');
  return legacy.WebcastPushConnection || legacy.default?.WebcastPushConnection;
}

export class TikTokProvider extends EventEmitter {
  constructor({ signApiKey = '' } = {}) {
    super();
    this.signApiKey = signApiKey;
    this.conn = null;
  }

  async connect(username) {
    const Conn = await loadConnector();
    const opts = { processInitialData: false, enableExtendedGiftInfo: false, fetchRoomInfoOnConnect: true };
    if (this.signApiKey) opts.signApiKey = this.signApiKey;
    const conn = new Conn(username, opts);
    this.conn = conn;
    conn.on('chat', (d) => this.emit('comment', normalizeTikTokChat(d)));
    conn.on('roomUser', (d) => this.emit('viewers', Number(d?.viewerCount) || 0));
    conn.on('streamEnd', () => this.emit('ended'));
    conn.on('disconnected', () => { if (this.conn === conn) this.emit('dropped'); });
    conn.on('error', (e) => this.emit('warn', e));
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ConnectTimeout: no answer from TikTok after 25 s')), 25000); });
    try {
      const state = await Promise.race([conn.connect(), timeout]);
      return { roomId: state?.roomId || '' };
    } finally {
      clearTimeout(timer);
    }
  }

  async disconnect() {
    const c = this.conn;
    this.conn = null;
    if (c) { try { c.removeAllListeners?.(); await c.disconnect(); } catch { /* ignore */ } }
  }
}
