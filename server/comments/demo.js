// وضع العرض التجريبي: مشاهدون آليون (🤖) لتجربة اللعبة بدون بث — بيانات تجريبية معلنة بوضوح
// Demo mode: clearly-labelled simulated viewers (🤖) so the game can be tried without a live stream.
const NAMES = ['Lina', 'Yassine', 'Salma', 'Omar', 'Hiba', 'Anas', 'Khadija', 'Ayoub', 'Nora', 'Mehdi', 'Rania', 'Ilyas', 'Sara', 'Hamza', 'Douae', 'Zakaria'];
const CHAT = ['🔥🔥', 'السلام عليكم', 'Hello from Casablanca', 'سؤال صعب 😅', 'Go go!', 'مرحبا', '❤️', 'next!'];

export class DemoProvider {
  constructor({ engine, ingest, rng = Math.random, timers = { setTimeout, clearTimeout, setInterval, clearInterval } }) {
    Object.assign(this, { engine, ingest, rng, timers });
    this.timeouts = [];
    this.lastKey = '';
    this.loop = null;
  }

  start() {
    this.stop();
    this.loop = this.timers.setInterval(() => this.tick(), 400);
  }

  stop() {
    if (this.loop) this.timers.clearInterval(this.loop);
    this.loop = null;
    for (const t of this.timeouts) this.timers.clearTimeout(t);
    this.timeouts = [];
  }

  bot(i) {
    const name = NAMES[i % NAMES.length];
    return { platform: 'demo', userId: `bot${i}`, uniqueId: `demo_${name.toLowerCase()}`, nickname: `🤖 ${name}`, avatar: '' };
  }

  send(i, text, delay) {
    const t = this.timers.setTimeout(() => this.ingest({ ...this.bot(i), text }), delay);
    this.timeouts.push(t);
  }

  tick() {
    const p = this.engine.demoPeek();
    if (!p || p.key === this.lastKey) return;
    this.lastKey = p.key;
    const window = Math.max(1500, Math.min(p.duration, p.remaining) * 0.85);
    const bots = 10 + Math.floor(this.rng() * 6);
    for (let i = 0; i < bots; i++) {
      const delay = 800 + this.rng() * window;
      if (this.rng() < 0.15) { this.send(i, CHAT[i % CHAT.length], delay); continue; }
      const right = this.rng() < 0.55;
      let text;
      if (p.mode === 'choice') {
        const idx = right ? p.correctIndex : (p.correctIndex + 1 + Math.floor(this.rng() * (p.choices - 1))) % p.choices;
        text = ['A', 'B', 'C', 'D'][idx];
      } else {
        text = right && p.answers.length ? p.answers[Math.floor(this.rng() * p.answers.length)] : ['لا أعرف', 'xyz', '؟؟', 'idk'][i % 4];
      }
      this.send(i, text, delay);
    }
  }
}
