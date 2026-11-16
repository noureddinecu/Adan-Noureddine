// Builds the offline data used by the quiz:
//   web/data/world.js  → window.QUIZ_WORLD = { countries, shapes, bg }
//   web/flags/xx.svg   → flags (flag-icons, MIT)
// Map data: Natural Earth via world-atlas (public domain). Morocco is drawn together with
// its Sahara (no border line); disputed territories are not used in questions.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as topojson from 'topojson-client';
import { CAPITALS } from './capitals.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'web');
const ar = require('i18n-iso-countries/langs/ar.json').countries;
const en = require('i18n-iso-countries/langs/en.json').countries;
const fr = require('i18n-iso-countries/langs/fr.json').countries;
const iso = require('i18n-iso-countries/codes.json');           // [alpha2, alpha3, numeric]
const topo = require('world-atlas/countries-50m.json');

const num2a2 = {};
iso.forEach(([a2, , n]) => { num2a2[String(n).padStart(3, '0')] = a2; });
const arr = v => (Array.isArray(v) ? v : v ? [v] : []);
const uniq = a => [...new Set(a.filter(Boolean).map(s => s.trim()))];

// --- geometry --------------------------------------------------------------
const geoms = topo.objects.countries.geometries;
const byA2 = {};
geoms.forEach(g => { const a2 = num2a2[String(g.id).padStart(3, '0')]; if (a2) (byA2[a2] = byA2[a2] || []).push(g); });
const SKIP_BG = new Set(['AQ']);
const round = (v, p) => Math.round(v * p) / p;
// Douglas–Peucker line simplification (keeps the look, drops ~80% of points)
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, dmax = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L; if (d > dmax) { dmax = d; idx = i; } }
    if (idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function rings(geo, p) {
  const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
  const out = [];
  for (const poly of polys) for (const ring of poly) {
    const r = [];
    for (const [x, y] of ring) { const q = [round(x, p), round(y, p)]; const l = r[r.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) r.push(q); }
    // closed ring: split at the farthest point so both halves have distinct end points
    const tol = p >= 100 ? 0.02 : 0.12;
    let far = 1, fd = -1;
    for (let i = 1; i < r.length; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > fd) { fd = d; far = i; } }
    const sr = simplify(r.slice(0, far + 1), tol).concat(simplify(r.slice(far), tol).slice(1));
    if (sr.length >= 4) out.push(sr);
  }
  return out;
}
function geomFor(a2) {
  let list = byA2[a2] || [];
  if (a2 === 'MA') list = list.concat(byA2.EH || []);          // Morocco with its Sahara, merged
  if (!list.length) return null;
  return list.length > 1 ? topojson.merge(topo, list) : topojson.feature(topo, list[0]).geometry;
}
function area(rs) { let a = 0; for (const r of rs) for (let i = 1; i < r.length; i++) a += (r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]) / 2; return Math.abs(a); }

// background: every country (Morocco merged with EH, EH itself skipped), low precision
const bg = [];
for (const a2 of Object.keys(byA2)) {
  if (SKIP_BG.has(a2) || a2 === 'EH') continue;
  const g = geomFor(a2); if (g) rings(g, 10).forEach(r => bg.push(r));
}
// unidentified pieces (no ISO code) still drawn as land
geoms.filter(g => !num2a2[String(g.id).padStart(3, '0')]).forEach(g => rings(topojson.feature(topo, g).geometry, 10).forEach(r => bg.push(r)));

// --- countries --------------------------------------------------------------
const countries = [];
const shapes = {};
for (const [a2, [capAr, capEn, tier, capExtra, nameExtra]] of Object.entries(CAPITALS)) {
  const names = arr(ar[a2]);
  if (!names.length) { console.warn('no arabic name', a2); continue; }
  const g = geomFor(a2);
  let sh = g ? rings(g, 100) : [];
  const ar2 = area(sh);
  if (sh.length) shapes[a2] = sh;
  countries.push({
    c: a2, tier,
    ar: uniq([...names, ...nameExtra.filter(x => /[؀-ۿ]/.test(x))]),
    en: uniq([...arr(en[a2]).sort((a, b) => ((a.length <= 3) - (b.length <= 3)) || a.length - b.length), ...arr(fr[a2]), ...nameExtra.filter(x => !/[؀-ۿ]/.test(x))]),
    cap: { ar: capAr, en: capEn, al: uniq([capAr, capEn, ...capExtra]) },
    area: Math.round(ar2 * 10) / 10
  });
  // flag
  const src = require.resolve(`flag-icons/flags/4x3/${a2.toLowerCase()}.svg`);
  fs.mkdirSync(path.join(OUT, 'flags'), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, 'flags', a2.toLowerCase() + '.svg'));
}

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
const js = '/* generated by tools/quizdata/build.mjs — do not edit */\nwindow.QUIZ_WORLD=' + JSON.stringify({ countries, shapes, bg }) + ';\n';
fs.writeFileSync(path.join(OUT, 'data', 'world.js'), js);
fs.copyFileSync(require.resolve('flag-icons/LICENSE'), path.join(OUT, 'flags', 'LICENSE-flag-icons.txt'));
console.log('countries', countries.length, '| shapes', Object.keys(shapes).length, '| bg rings', bg.length, '| world.js', (js.length / 1024).toFixed(0) + 'KB');
console.log(countries.filter(c => c.area < 0.5).map(c => c.c + ':' + c.area).join(' '));
console.log(countries.slice(0, 3).map(c => JSON.stringify(c)).join('\n'));
