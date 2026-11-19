// A stand-in for TikTokLiveConnection used by tests and the local demo.
import { EventEmitter } from 'node:events';
export const EVENTS = { CHAT: 'chat', ROOM_USER: 'roomUser', STREAM_END: 'streamEnd', DISCONNECTED: 'disconnected', ERROR: 'error', GIFT: 'gift', LIKE: 'like', FOLLOW: 'follow', SHARE: 'share' };
export function makeFactory({ offlineTimes = 0 } = {}) {
  const made = [];
  let fails = offlineTimes;
  const factory = id => {
    const c = new EventEmitter();
    c.id = id;
    c.connect = async () => { if (fails-- > 0) { const e = new Error('The requested user isn\'t online :('); e.name = 'UserOfflineError'; throw e; } c.live = true; return { roomId: '1' }; };
    c.disconnect = async () => { c.live = false; };
    // same shape as tiktok-live-connector 2.5 (webcast schema v3)
    c.chat = (uniqueId, comment, nickname) => c.emit('chat', {
      content: comment, common: { msgId: String(Math.random()) },
      user: { id: String(Math.floor(Math.random() * 1e9)), displayId: uniqueId, nickname: nickname || uniqueId, avatarThumb: { urlList: [`https://p16.example.com/${uniqueId}.jpg`] } }
    });
    const user = (id, nick) => ({ id: '77' + id.length, displayId: id, nickname: nick || id, avatarThumb: { urlList: [`https://p16.example.com/${id}.jpg`] } });
    // v3-shaped gift: combo gifts are sent as a growing repeatCount + a final repeatEnd=1
    c.gift = (id, { name = 'Rose', coins = 1, combo = true, repeats = [1], group = 'g1', nick } = {}) => {
      for (const r of repeats) c.emit('gift', { common: { msgId: String(Math.random()) }, giftId: '5655', groupId: group, repeatCount: r, repeatEnd: 0, user: user(id, nick), gift: { name, diamondCount: coins, combo, type: combo ? 1 : 0, image: { urlList: ['https://p16.example.com/gift.png'] } } });
      if (combo) c.emit('gift', { common: { msgId: String(Math.random()) }, giftId: '5655', groupId: group, repeatCount: repeats[repeats.length - 1], repeatEnd: 1, user: user(id, nick), gift: { name, diamondCount: coins, combo, type: 1 } });
    };
    c.like = (id, count = 1, nick) => c.emit('like', { count, total: '1000', user: user(id, nick) });
    c.follow = (id, nick) => c.emit('follow', { user: user(id, nick) });
    made.push(c);
    return c;
  };
  factory.made = made;
  return factory;
}
