/**
 * Gold Rail — TikTok LIVE comment relay (core, transport-agnostic)
 *
 * One upstream TikTok connection per creator (@uniqueId), shared by every app
 * client that asks for that creator. Upstream events are normalised to tiny JSON
 * messages so the phone never has to understand TikTok's protocol:
 *
 *   {t:'status', state:'connecting'|'connected'|'offline'|'reconnecting'|'error', msg}
 *   {t:'chat', id, u:uniqueId, n:nickname, a:avatarUrl, c:comment, ts}
 *   {t:'viewers', n}
 *
 * NOTE: reading TikTok LIVE comments uses an UNOFFICIAL reverse-engineered
 * protocol (tiktok-live-connector + Euler Stream signing). No TikTok password or
 * cookie is ever needed or accepted here: only the public @username.
 */

export function normaliseUniqueId(raw) {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
    .replace(/\/live.*$/i, '')
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9._]/g, '')
    .toLowerCase()
    .slice(0, 40);
}

const firstUrl = img => (img && ((img.urlList && img.urlList[0]) || (img.url && img.url[0]) || (img.urls && img.urls[0]))) || '';

/**
 * Normalise a chat event. Supports both TikTok webcast schemas:
 *  - v3 (used by tiktok-live-connector >= 2.5): data.content, user.displayId, user.avatarThumb.urlList
 *  - v1/v2 (older):                             data.comment, user.uniqueId,  user.profilePicture.url
 */
export function chatToMessage(data, seq) {
  const d = data || {};
  const u = d.user || {};
  const avatar = firstUrl(u.avatarThumb) || firstUrl(u.profilePicture) || firstUrl(u.avatarMedium) || u.profilePictureUrl || '';
  const text = [d.content, d.comment].find(x => typeof x === 'string' && x.length) || '';
  const handle = u.displayId || u.uniqueId || '';
  return {
    t: 'chat',
    id: (d.common && (d.common.msgId || d.common.messageId)) || `${Date.now()}-${seq}`,
    u: String(handle || u.id || u.userId || u.nickname || ''),
    n: String(u.nickname || handle || ''),
    a: String(avatar),
    c: String(text).slice(0, 200),
    ts: Date.now()
  };
}

/** Viewer count from a room-user event (v3: total as string, v2: viewerCount). */
export function viewersOf(d) {
  if (!d) return null;
  const v = d.viewerCount != null ? d.viewerCount : (d.total != null ? d.total : d.totalUser);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} opts
 * @param {(uniqueId:string)=>EventEmitterLike} opts.createConnection  factory for upstream connections
 * @param {object} opts.events  {CHAT, ROOM_USER, STREAM_END, DISCONNECTED, ERROR}
 * @param {(...a:any[])=>void} [opts.log]
 * @param {number} [opts.retryMs]  delay between reconnect attempts while the creator is offline
 */
export function createRelay(opts) {
  const log = opts.log || (() => {});
  const retryMs = opts.retryMs || 20000;
  const rooms = new Map(); // uniqueId -> room

  function broadcast(room, msg) {
    const s = JSON.stringify(msg);
    room.lastStatus = msg.t === 'status' ? msg : room.lastStatus;
    for (const c of room.clients) c.send(s);
  }

  async function connectUpstream(room) {
    if (room.closed) return;
    clearTimeout(room.timer);
    broadcast(room, { t: 'status', state: room.everConnected ? 'reconnecting' : 'connecting', msg: '@' + room.id });
    let conn;
    try {
      conn = opts.createConnection(room.id);
      room.conn = conn;
      let seq = 0;
      conn.on(opts.events.CHAT, d => broadcast(room, chatToMessage(d, seq++)));
      conn.on(opts.events.ROOM_USER, d => { const n = viewersOf(d); if (n != null) broadcast(room, { t: 'viewers', n }); });
      conn.on(opts.events.STREAM_END, () => { broadcast(room, { t: 'status', state: 'offline', msg: 'stream ended' }); schedule(room); });
      conn.on(opts.events.DISCONNECTED, () => { if (!room.closed) { broadcast(room, { t: 'status', state: 'reconnecting', msg: 'disconnected' }); schedule(room, 3000); } });
      conn.on(opts.events.ERROR, e => log('upstream error', room.id, e && (e.message || e.info || e)));
      await conn.connect();
      room.everConnected = true;
      broadcast(room, { t: 'status', state: 'connected', msg: '@' + room.id });
      log('connected', room.id);
    } catch (e) {
      const m = String((e && (e.message || e.name)) || e);
      const offline = /offline|not live|UserOffline|isn't online|LIVE has ended/i.test(m) || (e && e.name === 'UserOfflineError');
      broadcast(room, { t: 'status', state: offline ? 'offline' : 'error', msg: m.slice(0, 160) });
      log('connect failed', room.id, m);
      schedule(room);
    }
  }

  function schedule(room, ms) {
    if (room.closed) return;
    clearTimeout(room.timer);
    try { room.conn && room.conn.disconnect && room.conn.disconnect(); } catch (_) { /* ignore */ }
    room.conn = null;
    room.timer = setTimeout(() => connectUpstream(room), ms || retryMs);
  }

  return {
    rooms,
    /** Attach an app client. `client` must have send(string). Returns a detach function. */
    join(uniqueIdRaw, client) {
      const id = normaliseUniqueId(uniqueIdRaw);
      if (!id) throw new Error('invalid username');
      let room = rooms.get(id);
      if (!room) {
        room = { id, clients: new Set(), conn: null, timer: null, closed: false, everConnected: false, lastStatus: null };
        rooms.set(id, room);
        room.clients.add(client);
        connectUpstream(room);
      } else {
        clearTimeout(room.idleTimer);
        room.clients.add(client);
        if (room.lastStatus) client.send(JSON.stringify(room.lastStatus));
      }
      return () => {
        room.clients.delete(client);
        if (room.clients.size === 0) {
          // keep the upstream alive briefly so a quick app reconnect does not lose comments
          room.idleTimer = setTimeout(() => {
            if (room.clients.size) return;
            room.closed = true;
            clearTimeout(room.timer);
            try { room.conn && room.conn.disconnect && room.conn.disconnect(); } catch (_) { /* ignore */ }
            rooms.delete(id);
            log('room closed', id);
          }, 60000);
          if (room.idleTimer.unref) room.idleTimer.unref();
        } else clearTimeout(room.idleTimer);
      };
    },
    stats() { return [...rooms.values()].map(r => ({ id: r.id, clients: r.clients.size, state: r.lastStatus && r.lastStatus.state })); },
    shutdown() { for (const r of rooms.values()) { r.closed = true; clearTimeout(r.timer); clearTimeout(r.idleTimer); try { r.conn && r.conn.disconnect(); } catch (_) { /* */ } } rooms.clear(); }
  };
}
