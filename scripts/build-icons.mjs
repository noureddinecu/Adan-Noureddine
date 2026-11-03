// Renders the app icon SVG into the PNG sizes required by the PWA manifest (uses Playwright's Chromium).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
// Use the globally pre-installed Playwright (no browser download needed).
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium } = pw;
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zTile = readFileSync(join(root, 'public/patterns/zellige-line-gold.svg'));
const zColor = readFileSync(join(root, 'public/patterns/zellige-color.svg'));
const zWarm = readFileSync(join(root, 'public/patterns/zellige-warm.svg'));
const zUri = (b) => `data:image/svg+xml;base64,${b.toString('base64')}`;
const logo = readFileSync(join(root, 'public/icons/logo.svg'));
const zGreen = readFileSync(join(root, 'public/patterns/zellige-line-green.svg'));
const svg = (pad, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#f3ead3"/></linearGradient>
  <pattern id="z" width="96" height="96" patternUnits="userSpaceOnUse"><image href="${zUri(zGreen)}" width="96" height="96"/></pattern></defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#z)" opacity=".07"/>
  ${rounded ? '<rect x="10" y="10" width="492" height="492" rx="104" fill="none" stroke="#c9a227" stroke-width="6" opacity=".7"/>' : ''}
  <image href="${zUri(logo)}" x="${256 - 256 * pad}" y="${256 - 256 * pad}" width="${512 * pad}" height="${512 * pad}"/></svg>`;
const androidOut = process.argv[2] === '--android' ? process.argv[3] : null;
mkdirSync(join(root, 'public/icons'), { recursive: true });
writeFileSync(join(root, 'public/favicon.svg'), svg(0.86, true));
writeFileSync(join(root, 'public/icons/icon.svg'), svg(0.86, true));
const browser = await chromium.launch();
const page = await browser.newPage();
const shots = androidOut ? [
  ['mipmap-mdpi/ic_launcher.png', 48, svg(0.86, true)],
  ['mipmap-hdpi/ic_launcher.png', 72, svg(0.86, true)],
  ['mipmap-xhdpi/ic_launcher.png', 96, svg(0.86, true)],
  ['mipmap-xxhdpi/ic_launcher.png', 144, svg(0.86, true)],
  ['mipmap-xxxhdpi/ic_launcher.png', 192, svg(0.86, true)],
  ['drawable/splash_logo.png', 288, svg(0.86, true)],
  ['drawable/splash_pattern.png', 192, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 192 192"><rect width="192" height="192" fill="#fbe9dc"/><image href="${zUri(zWarm)}" width="96" height="96" opacity=".55"/><image href="${zUri(zWarm)}" x="96" width="96" height="96" opacity=".55"/><image href="${zUri(zWarm)}" y="96" width="96" height="96" opacity=".55"/><image href="${zUri(zWarm)}" x="96" y="96" width="96" height="96" opacity=".55"/></svg>`],
] : [
  ['icon-192.png', 192, svg(0.86, true)],
  ['icon-512.png', 512, svg(0.86, true)],
  ['maskable-512.png', 512, svg(0.66, false)],
  ['apple-touch-icon.png', 180, svg(0.8, false)],
];
for (const [name, size, s] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${s.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  const dest = androidOut ? join(androidOut, name) : join(root, 'public/icons', name);
  mkdirSync(dirname(dest), { recursive: true });
  await page.screenshot({ path: dest, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons ok');
