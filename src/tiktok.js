// الربط مع تعليقات TikTok LIVE
// Bridge to TikTok LIVE comments through the optional `tiktok-live-connector` package.
import { EventEmitter } from 'node:events';

/** Normalise a chat event from tiktok-live-connector v1 or v2 into {userId, nickname, avatar, text}. */
export function normalizeChat(d = {}) {
  const u = d.user || d;
  const pic = d.profilePictureUrl || u.profilePictureUrl || u.profilePicture?.url?.[0] || u.profilePicture?.urls?.[0] || u.profilePicture?.urlList?.[0] || '';
  const uniqueId = u.uniqueId || d.uniqueId || '';
  return {
    userId: String(u.userId || d.userId || uniqueId),
    uniqueId,
    nickname: u.nickname || d.nickname || uniqueId,
    avatar: pic,
    text: String(d.comment ?? d.content ?? ''),
  };
}

export class TikTokBridge extends EventEmitter {
  constructor() {
    super();
    this.conn = null;
    this.status = { connected: false, username: '', viewers: 0, error: '' };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  async connect(username) {
    username = String(username || '').trim().replace(/^@/, '');
    if (!username) throw new Error('اسم المستخدم مطلوب');
    await this.disconnect();
    let mod;
    try {
      mod = await import('tiktok-live-connector');
    } catch {
      throw new Error('مكتبة tiktok-live-connector غير مثبتة. نفّذ: npm install tiktok-live-connector');
    }
    const Conn = mod.TikTokLiveConnection || mod.WebcastPushConnection || mod.default?.TikTokLiveConnection || mod.default?.WebcastPushConnection;
    if (!Conn) throw new Error('نسخة غير مدعومة من tiktok-live-connector');
    const conn = new Conn(username, { processInitialData: false, enableExtendedGiftInfo: false });
    this.conn = conn;
    conn.on('chat', (d) => this.emit('comment', normalizeChat(d)));
    conn.on('roomUser', (d) => this.setStatus({ viewers: d.viewerCount || 0 }));
    conn.on('disconnected', () => this.setStatus({ connected: false }));
    conn.on('streamEnd', () => this.setStatus({ connected: false, error: 'انتهى البث' }));
    conn.on('error', (e) => this.setStatus({ error: String(e?.message || e) }));
    try {
      await conn.connect();
      this.setStatus({ connected: true, username, error: '' });
    } catch (e) {
      this.conn = null;
      this.setStatus({ connected: false, username, error: String(e?.message || e) });
      throw e;
    }
    return this.status;
  }

  async disconnect() {
    if (this.conn) {
      try { await this.conn.disconnect(); } catch { /* ignore */ }
      this.conn = null;
    }
    this.setStatus({ connected: false, viewers: 0 });
  }
}
