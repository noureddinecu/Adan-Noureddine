// End-to-end: relay server (fake TikTok upstream) ⇄ WebSocket ⇄ the real game UI in Chromium.
// Run: node test/e2e-app.mjs   (needs playwright; used during development)
import { startServer } from '../src/server.js';
import { makeFactory, EVENTS } from './fake-tiktok.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || 'playwright');
const shots = process.argv[2] || '.';
const wait = ms => new Promise(r => setTimeout(r, ms));

const factory = makeFactory({ offlineTimes: 1 });   // creator "not live" first, then goes live
const srv = await startServer({ port: 0, token: 'e2e-token', createConnection: factory, events: EVENTS });
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = true; const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

await p.goto('file:///home/user/Adan-Noureddine/web/index.html'); await wait(2300);
await p.tap('#mLive'); await wait(300);
await p.selectOption('#cp_game', 'gold');
await p.selectOption('#cp_source', 'relay');
await p.fill('#cp_user', '@my_live_account');
await p.fill('#cp_relayUrl', `ws://127.0.0.1:${srv.port}`);
await p.fill('#cp_token', 'e2e-token');
await p.fill('#cp_qTime', '9'); await p.fill('#cp_winnersTime', '30'); await p.fill('#cp_startLevel', '3');
await p.dispatchEvent('#cp_qTime', 'change');
await p.tap('#cpStart');
// relay reports offline first, then connects when the (fake) creator goes live (retry 20s in prod; fast here)
await p.waitForFunction(() => Live._debug().connState.state === 'connected', null, { timeout: 40000 });
check(true, 'app shows "متصل بـ TikTok LIVE" after creator went live: ' + await p.evaluate(() => Live._debug().connState.msg));
check(factory.made.at(-1).id === 'my_live_account', 'relay used the @username (no password)');
const up = () => factory.made.at(-1);

await p.waitForFunction(() => game.phase === 'running', null, { timeout: 30000 });
up().chat('early_bird', '1');   // comments before the question must NOT count
await p.waitForFunction(() => game.phase === 'question', null, { timeout: 90000 });
const gold = await p.evaluate(() => Live._debug().round.gold);
const lanes = await p.evaluate(() => Live._debug().round.lanes);
const wrong = gold === 1 ? 2 : 1;
const correctOrder = ['salma_ma', 'hamza.ok', 'nour', 'yassine', 'imane', 'amine', 'kawtar', 'reda', 'hiba', 'ayoub', 'meryem', 'anas', 'ghita', 'zakaria'];
up().chat('wrong_guy', String(wrong), 'Wrong Guy');
for (const [i, u] of correctOrder.entries()) {
  const forms = [String(gold), 'العربة ' + String.fromCharCode(0x660 + gold), String(gold) + ' 🔥'];
  up().chat(u, forms[i % 3], u.replace(/[._]/g, ' '));
  await wait(120);
}
up().chat('salma_ma', String(wrong), 'salma ma');  // second answer from same viewer is ignored
up().emit('roomUser', { total: '321' });
await wait(800);
await p.screenshot({ path: shots + '/e2e_question.png' });
check(await p.evaluate(() => Live._debug().round.count) === correctOrder.length + 1, 'answers counted once per viewer, pre-question comment ignored');
await p.evaluate(() => onLiveKey('up'));         // host reveals with volume +
await p.waitForSelector('#lvBoard.show', { timeout: 15000 });
await wait(700);
await p.screenshot({ path: shots + '/e2e_winners.png' });
const pod = await p.$$eval('.pod .pn', els => els.map(e => e.textContent));
const list = await p.$$eval('.lb-list .nm', els => els.map(e => e.textContent));
check(pod[1] === 'salma ma' && pod[0] === 'hamza ok' && pod[2] === 'nour', 'podium gold/silver/bronze = fastest correct: ' + JSON.stringify(pod));
check(list.length === 10, 'Top-10 list after podium has 10 names: ' + list.length);
check(!list.includes('Wrong Guy') && !pod.includes('Wrong Guy'), 'wrong answer not among winners');
const av = await p.evaluate(() => Live._debug().session.participants['salma_ma'].a);
check(av === 'https://p16.example.com/salma_ma.jpg', 'profile-picture URL from TikTok kept for the podium (falls back to initials if it cannot load): ' + av);
const st = await p.evaluate(() => { const d = Live._debug(); return { viewers: d.session.peakViewers, comments: d.session.comments, parts: Object.keys(d.session.participants).length }; });
check(st.viewers === 321 && st.comments === 17 && st.parts === 16, 'stats: ' + JSON.stringify(st));
check(lanes >= 3, 'lanes=' + lanes);
// relay drop → app reconnects automatically
for (const c of srv.wss.clients) c.terminate();
await p.waitForFunction(() => Live._debug().connState.state === 'connected', null, { timeout: 20000 });
check(true, 'app reconnected after the WebSocket was dropped');
check(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
await b.close(); srv.close();
console.log(ok ? 'E2E OK' : 'E2E FAILED');
process.exit(ok ? 0 : 1);
