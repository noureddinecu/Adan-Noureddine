// Lists every sentence the announcers say (announcer lines + all statements) as JSON: [{key, text, kind}]
// usage: node tools/voice/items.js > items.json
const path = require('path');
const W = path.join(__dirname, '../../web/');
global.window = {}; global.document = { getElementById() { return null; } };
require(W + 'data/world.js'); require(W + 'js/quiz-bank.js'); require(W + 'js/tf-bank.js'); require(W + "js/tf-sets.js"); require(W + "js/tf-lines.js");
const fs = require('fs');
const RAW = process.argv.includes('--raw');
// vocalised statements (tools/voice/tashkeel.py): the voice reads the version with diacritics
const TK = fs.existsSync(__dirname + '/tashkeel.json') ? JSON.parse(fs.readFileSync(__dirname + '/tashkeel.json', 'utf8')) : {};
const out = [], seen = new Set();
const add = (key, text, kind, raw) => { if (seen.has(key)) return; seen.add(key); out.push({ key, text, kind, raw }); };
for (const [g, arr] of Object.entries(window.TF_LINES)) arr.forEach((t, i) => add('a_' + g + '_' + i, t, 'line'));
for (const [n, t] of Object.entries(window.TF_COUNTS)) add('n_' + n, t, 'line');
// questions (optional, recorded with --only=q): easiest first, since those are asked first in every round
const qs = window.TF_SETS.flatMap(g => g.flatMap((stage, s) => stage.map(x => [s, x]))).sort((a, b) => a[0] - b[0]);
for (const [, x] of qs) add(window.TF_QKEY(x[2]), (TK[x[2]] || x[2]) + '… إِيهْ وْلَّا لَا؟', 'q', x[2]);
process.stdout.write(JSON.stringify(out));
