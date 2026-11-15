// A stand-in for TikTokLiveConnection used by tests and the local demo.
import { EventEmitter } from 'node:events';
export const EVENTS = { CHAT: 'chat', ROOM_USER: 'roomUser', STREAM_END: 'streamEnd', DISCONNECTED: 'disconnected', ERROR: 'error' };
export function makeFactory({ offlineTimes = 0 } = {}) {
  const made = [];
  let fails = offlineTimes;
  const factory = id => {
    const c = new EventEmitter();
    c.id = id;
    c.connect = async () => { if (fails-- > 0) { const e = new Error('The requested user isn\'t online :('); e.name = 'UserOfflineError'; throw e; } c.live = true; return { roomId: '1' }; };
    c.disconnect = async () => { c.live = false; };
    c.chat = (uniqueId, comment, nickname) => c.emit('chat', {
      comment, common: { msgId: String(Math.random()) },
      user: { uniqueId, nickname: nickname || uniqueId, profilePicture: { url: [`https://p16.example.com/${uniqueId}.jpg`] } }
    });
    made.push(c);
    return c;
  };
  factory.made = made;
  return factory;
}
