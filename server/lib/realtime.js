// البث اللحظي عبر Server-Sent Events (إعادة اتصال تلقائية مدمجة في المتصفح)
// Real-time push with Server-Sent Events: one-way server→client stream with built-in browser
// auto-reconnect; commands go through authenticated REST calls.
export class Realtime {
  constructor() {
    this.clients = new Set(); // { res, admin }
    this.ping = setInterval(() => this.raw(': ping\n\n'), 15000);
    this.ping.unref?.();
  }
  add(req, res, { admin, initial = [] }) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    for (const [ev, data] of initial) res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
    const client = { res, admin };
    this.clients.add(client);
    req.on('close', () => this.clients.delete(client));
  }
  raw(s) { for (const c of this.clients) c.res.write(s); }
  send(event, data, { adminOnly = false } = {}) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) if (!adminOnly || c.admin) c.res.write(msg);
  }
  get counts() {
    let admin = 0;
    for (const c of this.clients) if (c.admin) admin++;
    return { admin, overlay: this.clients.size - admin };
  }
  close() { clearInterval(this.ping); for (const c of this.clients) c.res.end(); this.clients.clear(); }
}
