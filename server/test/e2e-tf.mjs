// End-to-end test of «صح أم خطأ»: relay (fake TikTok upstream) ⇄ WebSocket ⇄ the game in Chromium.
// Checks the rules: join with «العب», first answer is final, no answer = fall, spectators are ignored,
// a gift brings a fallen player back (max 2), no comeback in the final stage, last one standing wins.
import { startServer } from '../src/server.js';
import { makeFactory, EVENTS } from './fake-tiktok.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || 'playwright');
const shots = process.argv[2] || '.';
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true; const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

const factory = makeFactory();
const srv = await startServer({ port: 0, token: 'tf', createConnection: factory, events: EVENTS });
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file:///home/user/Adan-Noureddine/web/tf.html'); await wait(2000);
await p.tap('#hLive'); await wait(300);
await p.selectOption('#cp_source', 'relay');
await p.fill('#cp_user', '@my_live'); await p.fill('#cp_relayUrl', `ws://127.0.0.1:${srv.port}`); await p.fill('#cp_token', 'tf');
await p.fill('#cp_qTime', '30'); await p.selectOption('#cp_finalAt', '5');
await p.dispatchEvent('#cp_qTime', 'change');
await p.tap('#cpStart');
await p.waitForFunction(() => Live._debug().connState.state === 'connected', null, { timeout: 20000 });
await p.evaluate(() => { Live._debug().cfg.grace = 0; });      // no hidden extra time in the test
const up = () => factory.made.at(-1);
const st = () => p.evaluate(() => { const s = Quiz._debug().st; return { phase: Quiz.phase, q: s.qNo, players: Object.fromEntries(Object.entries(s.players).map(([u, x]) => [u, { alive: x.alive, ans: x.ans, rev: x.revives, next: !!x.reviveNext }])) }; });

// --- lobby: 8 players write «العب» in different ways; a random comment does not join
const names = ['salma', 'hamza', 'nour', 'amine', 'sara', 'omar', 'imane', 'yassine'];
const joinWords = ['العب', 'play', 'العب 🔥', 'jouer', 'نلعب', '🎮', 'Play!', 'العب'];
names.forEach((n, i) => up().chat(n, joinWords[i], n.toUpperCase()));
up().chat('visitor', 'سلام عليكم', 'VISITOR');
await wait(800);
let s = await st();
check(Object.keys(s.players).length === 8 && !s.players.visitor, 'lobby: 8 joined with «العب» in several languages, a greeting does not join');
await p.screenshot({ path: shots + '/tf_lobby.png' });

// --- Q1
await p.evaluate(() => Quiz.ctl.next());                        // end of the lobby
await p.waitForFunction(() => Quiz.phase === 'question', null, { timeout: 15000 });
const truth1 = await p.evaluate(() => Quiz._debug().st.q.truth);
const R = t => t ? 'نعم' : 'لا', Wr = t => t ? 'no' : 'yes';
up().chat('salma', R(truth1)); up().chat('hamza', R(truth1) === 'نعم' ? 'oui' : 'non');
up().chat('nour', Wr(truth1));                                  // wrong
up().chat('amine', Wr(truth1)); up().chat('amine', R(truth1));  // first answer wrong, then tries to change
up().chat('sara', R(truth1)); up().chat('omar', R(truth1)); up().chat('imane', R(truth1));
// yassine does not answer
up().chat('latecomer', 'العب');
await wait(800);
s = await st();
check(s.players.amine.ans === (truth1 ? 'no' : 'yes'), 'first answer is final (amine could not change his answer)');
check(!s.players.latecomer, 'a viewer writing «العب» after the start waits for the next round');
await p.screenshot({ path: shots + '/tf_q1.png' });
await p.evaluate(() => Quiz.ctl.reveal());
await p.waitForFunction(() => Quiz.phase === 'fall', null, { timeout: 10000 }); await wait(900);
await p.screenshot({ path: shots + '/tf_fall.png' });
s = await st();
check(!s.players.nour.alive && !s.players.amine.alive, 'wrong answers fall');
check(!s.players.yassine.alive, 'no answer = falls too (stayed in the middle)');
check(['salma', 'hamza', 'sara', 'omar', 'imane'].every(u => s.players[u].alive), 'right answers stay (5 left)');

// --- spectators are ignored; a gift brings one back (max 2) — but 5 left = final stage (finalAt=5): no comeback
up().gift('nour', { name: 'Rose', coins: 1, combo: false, repeats: [1] });
await wait(700);
s = await st();
check(!s.players.nour.next && !s.players.nour.alive, 'final stage (5 left): a gift does NOT bring a player back');

// set the final stage lower to test the comeback
await p.evaluate(() => { Live._debug().cfg.finalAt = 3; });
up().gift('amine', { name: 'Rose', coins: 1, combo: false, repeats: [1] });
await wait(700);
s = await st();
check(s.players.amine.next && s.players.amine.rev === 1, 'a fallen player who sends a gift comes back at the next question (1/2)');
await p.screenshot({ path: shots + '/tf_revive.png' });

// --- Q2
await p.waitForFunction(() => Quiz.phase === 'question', null, { timeout: 20000 });
s = await st();
check(s.players.amine.alive, 'amine is back in the game for question 2');
const truth2 = await p.evaluate(() => Quiz._debug().st.q.truth);
up().chat('nour', R(truth2));                                   // spectator: ignored
up().chat('salma', R(truth2)); up().chat('hamza', R(truth2)); up().chat('amine', R(truth2));
up().chat('sara', Wr(truth2)); up().chat('omar', Wr(truth2)); up().chat('imane', Wr(truth2));
await wait(700);
s = await st();
check(!s.players.nour.alive && s.players.nour.ans === (truth1 ? 'no' : 'yes'), 'a spectator\'s answer is ignored (still a spectator, answer not taken)');
await p.evaluate(() => Quiz.ctl.reveal());
await p.waitForFunction(() => Quiz.phase !== 'question' && Quiz.phase !== 'fall', null, { timeout: 15000 });
s = await st();
check(Object.values(s.players).filter(x => x.alive).length === 3, '3 left after question 2');

// --- Q3: only salma right → winner
await p.waitForFunction(() => Quiz.phase === 'question', null, { timeout: 20000 });
const truth3 = await p.evaluate(() => Quiz._debug().st.q.truth);
up().chat('salma', R(truth3)); up().chat('hamza', Wr(truth3)); up().chat('amine', Wr(truth3));
await wait(600);
await p.evaluate(() => Quiz.ctl.reveal());
await p.waitForFunction(() => Quiz.phase === 'winner', null, { timeout: 15000 }); await wait(1200);
await p.screenshot({ path: shots + '/tf_winner.png' });
check(await p.evaluate(() => Quiz._debug().st.winner) === 'salma', 'the last one standing wins (salma), big photo shown');
check(await p.evaluate(() => !!document.querySelector('.tf-win .tf-ph')), 'winner card with the photo');

// --- podium: champion, runner-up (fell last; among equals the one with more right answers), top of the round
await p.evaluate(() => Quiz.ctl.next());
await p.waitForFunction(() => Quiz.phase === 'podium', null, { timeout: 10000 }); await wait(900);
await p.screenshot({ path: shots + '/tf_podium.png' });
const rk = await p.evaluate(() => Quiz._debug().st.ranking);
check(rk[0] === 'salma' && rk[1] === 'hamza', 'podium: champion salma, runner-up hamza (fell last, more right answers than amine) — ' + rk.slice(0, 4).join(','));
check(await p.evaluate(() => document.querySelectorAll('.tf-pod .pd').length) === 4, 'podium shows the last four');
// --- next round: everybody falls → no winner
await p.evaluate(() => Quiz.ctl.next());
await p.waitForFunction(() => Quiz.phase === 'lobby', null, { timeout: 10000 });
['salma', 'hamza'].forEach(n => up().chat(n, 'العب'));
await wait(500);
await p.evaluate(() => Quiz.ctl.next());
await p.waitForFunction(() => Quiz.phase === 'question', null, { timeout: 15000 });
const truth4 = await p.evaluate(() => Quiz._debug().st.q.truth);
up().chat('salma', Wr(truth4)); up().chat('hamza', Wr(truth4));
await wait(600);
await p.evaluate(() => Quiz.ctl.reveal());
await p.waitForFunction(() => Quiz.phase === 'nowinner', null, { timeout: 15000 });
check(true, 'everybody fell → no winner, then a new round');
await p.waitForFunction(() => Quiz.phase === 'lobby', null, { timeout: 15000 });
check(true, 'back to the «العب» lobby automatically');

check(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
await b.close(); srv.close();
console.log(ok ? 'TF E2E OK' : 'TF E2E FAILED'); process.exit(ok ? 0 : 1);
