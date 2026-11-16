// Lists every sentence the announcers say (announcer lines + all statements) as JSON: [{key, text, kind}]
// usage: node tools/voice/items.js > items.json
const path = require('path');
const W = path.join(__dirname, '../../web/');
global.window = {}; global.document = { getElementById() { return null; } };
require(W + 'data/world.js'); require(W + 'js/quiz-bank.js'); require(W + 'js/tf-bank.js'); require(W + 'js/tf-pool.js'); require(W + 'js/tf-lines.js');
const out = [], seen = new Set();
const add = (key, text, kind) => { if (seen.has(key)) return; seen.add(key); out.push({ key, text, kind }); };
for (const [g, arr] of Object.entries(window.TF_LINES)) arr.forEach((t, i) => add('a_' + g + '_' + i, t, 'line'));
for (const [n, t] of Object.entries(window.TF_COUNTS)) add('n_' + n, t, 'line');
for (const x of [...window.TF_BANK, ...window.TF_HARD, ...window.TF_POOL]) add(window.TF_QKEY(x[2]), x[2] + '… إِيهْ وْلَّا لَا؟', 'q');
process.stdout.write(JSON.stringify(out));
