// End-to-end test on a mobile viewport against the production build (vite preview).
// Usage: npm run build && npm run test:e2e   (screenshots → docs/screenshots)
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const shots = join(root, 'docs/screenshots'); mkdirSync(shots, { recursive: true });

const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => d.toString().includes('Local') && r()); setTimeout(r, 6000); });
const URL = `http://localhost:${PORT}/`;

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) failures++; };

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ ...pw.devices['Pixel 7'], locale: 'ar-MA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=أقسام المخالفات');
  check((await page.getAttribute('html', 'dir')) === 'rtl', 'document is RTL');
  check(await page.isVisible('input[type=search]'), 'search bar visible on home');
  for (const t of ['الدرجة الأولى', 'الدرجة الثانية', 'الدرجة الثالثة', 'المخالفات الإدارية', 'الجنح']) check(await page.isVisible(`text=${t}`), `home shows section «${t}»`);
  await page.screenshot({ path: join(shots, '01-home.png') });

  // live search
  const input = page.locator('input[type=search]');
  await input.fill('الوقوف');
  await page.waitForSelector('mark');
  const n1 = await page.locator('main button:has(mark)').count();
  check(n1 >= 5, `«الوقوف» → ${n1} highlighted results (live, no submit)`);
  await page.screenshot({ path: join(shots, '02-search-wuquf.png') });

  await input.fill('ممنوع الوقوف والتوقف');
  await page.waitForTimeout(150);
  check((await page.locator('main button:has(mark)').count()) > 0, '«ممنوع الوقوف والتوقف» returns results');

  await input.fill('المادة 184');
  await page.waitForTimeout(150);
  const t184 = await page.textContent('main');
  check(/46\s*نتيجة/.test(t184), '«المادة 184» → 46 results');

  await input.fill('185361C2');
  await page.waitForTimeout(150);
  check((await page.locator('main button').first().textContent()).includes('185361C2'), 'code search puts exact code first');

  await input.fill('ceinture');
  await page.waitForTimeout(150);
  check((await page.textContent('main')).includes('حزام السلامة'), 'French query «ceinture» → حزام السلامة');

  await input.fill('السرغة');
  await page.waitForTimeout(150);
  check((await page.textContent('main')).includes('السرعة'), 'typo «السرغة» still finds السرعة');

  await input.fill('إنارة');
  await page.waitForTimeout(150);
  const a = await page.locator('main button:has(mark)').count();
  await input.fill('انارة');
  await page.waitForTimeout(150);
  check(a > 0 && a === (await page.locator('main button:has(mark)').count()), 'hamza-insensitive (إنارة = انارة)');

  // clear button
  await page.click('button[aria-label="مسح البحث"]');
  check((await input.inputValue()) === '', 'clear button empties the query');

  // open a detail
  await input.fill('حزام السلامة');
  await page.waitForTimeout(200);
  await page.locator('main button:has(mark)').first().click();
  await page.waitForSelector('text=مصدر المعلومات');
  for (const t of ['معلومات المخالفة', 'النصوص القانونية', 'العقوبات والإجراءات', 'مصدر المعلومات', 'الصفحة في ملف PDF']) check(await page.isVisible(`text=${t}`), `detail shows «${t}»`);
  await page.screenshot({ path: join(shots, '03-detail.png'), fullPage: true });

  // fines + calculator (185361C2 is degree 2 → 300 / 350 / 500)
  check(await page.isVisible('text=الغرامة وآجال الأداء'), 'detail shows fines block');
  const fineText = await page.textContent('main');
  check(fineText.includes('300') && fineText.includes('350') && fineText.includes('500') && fineText.includes('المادة 219'), 'degree-2 amounts 300/350/500 with art. 219 reference');
  check(fineText.includes('الوقت المتبقي'), 'calculator shows current tier & remaining time');
  const inputs = page.locator('input[type=datetime-local]');
  await inputs.nth(0).fill('2026-01-10T09:00');
  await inputs.nth(1).fill('2026-01-20T10:00');
  await page.waitForTimeout(150);
  check((await page.locator('text=المبلغ الواجب أداؤه').locator('..').textContent()).includes('350'), 'calculator: day 10 → 350 DH');
  await inputs.nth(1).fill('2026-03-01T10:00');
  await page.waitForTimeout(150);
  check(await page.isVisible('text=انتهاء أجل الأداء') && (await page.textContent('main')).includes('المادة 227'), 'calculator: after 30 days → art. 227 referral notice');
  await page.screenshot({ path: join(shots, '09-fines-calculator.png'), fullPage: true });
  await page.goto(URL + '#/v/delit-019');
  await page.waitForSelector('text=الغرامة وآجال الأداء');
  check((await page.textContent('main')).includes('جنحة — لا تطبق أسعار الغرامات التصالحية'), 'délit: no degree prices applied');
  await page.goBack();
  await page.waitForSelector('text=الغرامة وآجال الأداء');

  // favorite
  await page.click('button[aria-label="إضافة إلى المفضلة"]');
  await page.waitForTimeout(300);
  check(await page.isVisible('button[aria-label="إزالة من المفضلة"]'), 'added to favorites');
  await page.goto(URL + '#/favorites');
  await page.waitForTimeout(300);
  check((await page.locator('main button').count()) >= 1, 'favorites page lists the item');
  await page.screenshot({ path: join(shots, '04-favorites.png') });

  // history persists after reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.goto(URL + '#/history');
  await page.waitForTimeout(400);
  check((await page.locator('main button').count()) >= 1, 'history (viewed) persisted after reload');
  await page.click('text=عمليات البحث');
  await page.waitForTimeout(200);
  check(await page.isVisible('text=حزام السلامة'), 'search history persisted');

  // section page
  await page.goto(URL + '#/section/deg2');
  await page.waitForSelector('text=مخالفات من الدرجة الثانية');
  check((await page.locator('main > button').count()) === 39, 'degree-2 section lists 39 violations');
  await page.screenshot({ path: join(shots, '05-section.png') });

  // dark mode
  await page.goto(URL);
  await page.click('button[aria-label="الوضع الليلي"]');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode toggles');
  await page.screenshot({ path: join(shots, '06-home-dark.png') });
  await page.goto(URL + '#/v/delit-019');
  await page.waitForSelector('text=مصدر المعلومات');
  await page.screenshot({ path: join(shots, '07-detail-dark.png'), fullPage: true });
  await page.goto(URL + '#/about');
  await page.waitForSelector('text=تقرير استخراج البيانات');
  await page.screenshot({ path: join(shots, '08-report-dark.png'), fullPage: true });
  await page.click('text=نهاري');

  // offline
  const swReady = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  check(swReady, 'service worker active');
  await page.reload({ waitUntil: 'networkidle' });
  await ctx.setOffline(true);
  await page.goto(URL + '#/', { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('text=أقسام المخالفات', { timeout: 8000 });
  await page.locator('input[type=search]').fill('الكحول');
  await page.waitForTimeout(200);
  check((await page.locator('main button:has(mark)').count()) > 0, 'OFFLINE: app loads and search works');
  await page.locator('main button:has(mark)').first().click();
  await page.waitForSelector('text=مصدر المعلومات');
  check(true, 'OFFLINE: detail page opens');
  const idb = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('dalil-muraqaba'); r.onsuccess = () => { const tx = r.result.transaction('dataset'); const g = tx.objectStore('dataset').get('current'); g.onsuccess = () => res(g.result?.violations?.length ?? 0); }; }));
  check(idb === 204, `IndexedDB holds the 204 violations (${idb})`);
  await ctx.setOffline(false);

  // manifest
  const manifest = await (await fetch(URL + 'manifest.webmanifest')).json();
  check(manifest.display === 'standalone' && manifest.icons.length >= 3 && manifest.dir === 'rtl', 'web manifest installable (standalone, icons, rtl)');

  check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
} catch (e) {
  console.error(e); failures++;
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll e2e checks passed');
process.exit(failures ? 1 : 0);
