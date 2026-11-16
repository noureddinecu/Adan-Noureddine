// End-to-end quiz test: relay (fake TikTok upstream, real v3 comment shape) ⇄ WebSocket ⇄ quiz UI in Chromium.
import { startServer } from '../src/server.js';
import { makeFactory, EVENTS } from './fake-tiktok.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || 'playwright');
const shots = process.argv[2] || '.';
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true; const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

const factory = makeFactory();
const srv = await startServer({ port: 0, token: 'qz', createConnection: factory, events: EVENTS });
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file:///home/user/Adan-Noureddine/web/index.html'); await wait(2300);
await p.tap('#hLive'); await wait(300);
await p.selectOption('#cp_source', 'relay');
await p.fill('#cp_user', '@my_live'); await p.fill('#cp_relayUrl', `ws://127.0.0.1:${srv.port}`); await p.fill('#cp_token', 'qz');
await p.fill('#cp_qTime', '30'); await p.fill('#cp_winnersTime', '30');
await p.dispatchEvent('#cp_qTime', 'change');
await p.tap('#cpStart');
await p.waitForFunction(() => Live._debug().connState.state === 'connected', null, { timeout: 20000 });
check(await p.isVisible('#quizHud'), 'quiz broadcast screen shown');
const up = () => factory.made.at(-1);

async function askAndAnswer(cat, plan) {
  await p.evaluate(c => Quiz.ctl.newTopic(c), cat);
  await p.waitForFunction(() => Quiz.phase === 'question', null, { timeout: 15000 });
  const q = await p.evaluate(() => ({ ans: Quiz._debug().q.answers, show: Quiz._debug().q.show.ar }));
  for (const [user, kind] of plan) {
    const text = kind === 'right' ? q.ans[0] : kind === 'alt' ? (q.ans.find(a => /^[a-z]/i.test(a)) || q.ans[0]) : kind === 'typo' ? q.ans[0] + q.ans[0].slice(-1) : 'جواب غالط تماما';
    up().chat(user, text, user.toUpperCase());
    await wait(150);
  }
  await wait(500);
  return q;
}
// Q1: flags — salma first, then hamza (English), nour typo, wrong guy
const q1 = await askAndAnswer('flags', [['salma', 'right'], ['wrong_guy', 'wrong'], ['hamza', 'alt'], ['nour', 'typo'], ['salma', 'right']]);
await p.screenshot({ path: shots + '/e2e_q1.png' });
check(await p.evaluate(() => Quiz._debug().q.correct.length) === 3, 'Q1: 3 correct (right, English, typo), wrong ignored, duplicate ignored — answer ' + q1.show);
await p.evaluate(() => Quiz.ctl.reveal());
await p.waitForFunction(() => Quiz.phase === 'board', null, { timeout: 25000 });
// Q2: capitals — hamza first, salma second
const q2 = await askAndAnswer('capitals', [['hamza', 'right'], ['salma', 'right'], ['wrong_guy', 'right']]);
await p.evaluate(() => Quiz.ctl.reveal());
await p.waitForFunction(() => Quiz.phase === 'board', null, { timeout: 25000 }); await wait(1200);
await p.screenshot({ path: shots + '/e2e_board.png' });
const rows = await p.$$eval('#qzList li', ls => ls.map(l => ({ n: l.querySelector('.nm').textContent, ok: l.querySelector('.ok').textContent, pts: +l.querySelector(':scope > b').textContent, img: !!l.querySelector('.qa') })));
console.log(JSON.stringify(rows));
const by = Object.fromEntries(rows.map(r => [r.n, r]));
check(by.SALMA && by.SALMA.ok.includes('2') && by.HAMZA.ok.includes('2') && by.NOUR.ok.includes('1') && by.WRONG_GUY.ok.includes('1'), 'correct counts accumulate across questions (✓2, ✓2, ✓1, ✓1) — Q2 answer ' + q2.show);
check(rows.every((r, i) => i === 0 || rows[i - 1].pts >= r.pts), 'leaderboard sorted by points');
check(rows.every(r => r.img), 'every row shows the player photo');
const av = await p.evaluate(() => Live._debug().session.participants.salma.a);
check(av === 'https://p16.example.com/salma.jpg', 'TikTok profile picture URL kept: ' + av);
check(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
await b.close(); srv.close();
console.log(ok ? 'QUIZ E2E OK' : 'QUIZ E2E FAILED'); process.exit(ok ? 0 : 1);
