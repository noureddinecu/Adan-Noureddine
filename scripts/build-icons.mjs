// Renders the app icon SVG into the PNG sizes required by the PWA manifest (uses Playwright's Chromium).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
// Use the globally pre-installed Playwright (no browser download needed).
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium } = pw;
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shield = `
  <path d="M256 70 92 128v120c0 106 72 188 164 220 92-32 164-114 164-220V128L256 70Z" fill="#fff" stroke="#c9a227" stroke-width="16"/>
  <path d="M256 108 124 154v96c0 84 54 149 132 178 78-29 132-94 132-178v-96L256 108Z" fill="#14532d"/>
  <path d="M220 400 246 170h20l26 230z" fill="#3a4a40"/>
  <path d="M256 188v28M256 248v32M256 312v36" stroke="#f2df00" stroke-width="12" stroke-linecap="round"/>
  <circle cx="346" cy="178" r="50" fill="#e2231a" stroke="#fff" stroke-width="10"/>
  <path d="M322 179l17 17 31-34" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (pad, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f8a44"/><stop offset="1" stop-color="#0a2a19"/></linearGradient></defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${pad}) translate(-256 -270)">${shield}</g></svg>`;

const androidOut = process.argv[2] === '--android' ? process.argv[3] : null;
mkdirSync(join(root, 'public/icons'), { recursive: true });
writeFileSync(join(root, 'public/favicon.svg'), svg(0.92, true));
writeFileSync(join(root, 'public/icons/icon.svg'), svg(0.92, true));
const browser = await chromium.launch();
const page = await browser.newPage();
const shots = androidOut ? [
  ['mipmap-mdpi/ic_launcher.png', 48, svg(0.92, true)],
  ['mipmap-hdpi/ic_launcher.png', 72, svg(0.92, true)],
  ['mipmap-xhdpi/ic_launcher.png', 96, svg(0.92, true)],
  ['mipmap-xxhdpi/ic_launcher.png', 144, svg(0.92, true)],
  ['mipmap-xxxhdpi/ic_launcher.png', 192, svg(0.92, true)],
  ['drawable/splash_logo.png', 288, svg(0.92, true)],
] : [
  ['icon-192.png', 192, svg(0.92, true)],
  ['icon-512.png', 512, svg(0.92, true)],
  ['maskable-512.png', 512, svg(0.72, false)],
  ['apple-touch-icon.png', 180, svg(0.86, false)],
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
