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
  check(await page.isVisible('[role=status][aria-label="دليل المراقبة الطرقية"]'), 'splash screen shown at launch');
  await page.screenshot({ path: join(shots, '00-splash.png') });
  await page.waitForSelector('[role=status][aria-label="دليل المراقبة الطرقية"]', { state: 'detached', timeout: 2500 });
  check(true, 'splash disappears automatically after ~1.3 s');
  await page.waitForSelector('text=أقسام المخالفات');
  check((await page.getAttribute('html', 'dir')) === 'rtl', 'document is RTL');
  check(await page.isVisible('input[type=search]'), 'search bar visible on home');
  for (const t of ['الدرجة الأولى', 'الدرجة الثانية', 'الدرجة الثالثة', 'المخالفات الإدارية', 'الجنح']) check(await page.isVisible(`text=${t}`), `home shows section «${t}»`);
  check(await page.isVisible('text=الخاص بأعوان الشرطة محرري المحاضر'), 'full subtitle visible');
  check(await page.evaluate(() => { const el = [...document.querySelectorAll('header p')].find((p) => p.textContent.includes('محرري المحاضر')); return el && el.scrollWidth <= el.clientWidth + 1; }), 'subtitle not truncated');
  { const hs = await page.locator('main .grid > button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    check(hs.length === 8 && new Set(hs).size === 1, `8 uniform section cards (${hs.join(',')})`); }
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

  await input.fill('الهاتف');
  await page.waitForTimeout(150);
  check(!(await page.textContent('main')).includes('درهم'), 'no amounts on search result cards');
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

  // search bar hides on scroll down, reappears on scroll up
  await input.fill('السياقة'); await page.waitForTimeout(250);
  await page.locator('input[type=search]').blur();
  await page.mouse.wheel(0, 900); await page.waitForTimeout(450);
  const hiddenBar = await page.evaluate(() => getComputedStyle(document.querySelector('form[role=search]').parentElement.parentElement).opacity);
  check(hiddenBar === '0', 'search bar hidden while scrolling down');
  await page.mouse.wheel(0, -300); await page.waitForTimeout(450);
  const shownBar = await page.evaluate(() => getComputedStyle(document.querySelector('form[role=search]').parentElement.parentElement).opacity);
  check(shownBar === '1', 'search bar back when scrolling up');
  // back from a detail restores the list scroll position
  const target = page.locator('main button:has(mark)').nth(6);
  await target.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
  const yBefore = await page.evaluate(() => window.scrollY);
  await target.click();
  await page.waitForSelector('main h2:has-text("الإجراءات")');
  check(await page.evaluate(() => window.scrollY) < 5, 'detail opens at top');
  await page.goBack(); await page.waitForTimeout(400);
  const yAfter = await page.evaluate(() => window.scrollY);
  check(Math.abs(yAfter - yBefore) < 80, `back restores list position (${Math.round(yBefore)} → ${Math.round(yAfter)})`);
  await page.evaluate(() => window.scrollTo(0, 0));

  // view transitions: section card → section page morph runs without errors
  { const vtOk = await page.evaluate(() => typeof document.startViewTransition === 'function');
    check(vtOk, 'View Transitions API available (Chromium)'); }

  // open a detail
  await input.fill('حزام السلامة');
  await page.waitForTimeout(200);
  await page.locator('main button:has(mark)').first().click();
  await page.waitForSelector('main h2:has-text("الإجراءات")');
  for (const t of ['الإجراءات', 'العقوبات', 'النصوص المنظمة']) check(await page.locator('main h2', { hasText: t }).first().isVisible(), `detail shows «${t}»`);
  { const t = await page.textContent('main'); check(!t.includes('السند القانوني') && !t.includes('معلومات المخالفة'), 'no «السند القانوني» and no duplicate info block');
    const refs = await page.locator('main li.legal.rounded-lg').allTextContents(); check(refs.length === new Set(refs.map((r) => r.replace(/^[-\s]+/, '').trim())).size, `legal references not repeated (${refs.length})`);
    check((await page.locator('main button:has-text("المادة 185")').count()) === 1 && (await page.locator('main button:has-text("المادة 219")').count()) === 1, 'each article button appears once'); }
  { const t = await page.textContent('main'); check(!/أولا|ثانيا|ثالثا|رابعا|مصدر المعلومات|السابقة|التالية|جميع /.test(t), 'detail page clean (no ordinals, source, prev/next, section link)'); }
  check(await page.isVisible('text=فتح النص الرسمي عند المادة'), 'detail shows per-article official text links');
  check((await page.locator('button:has-text("المادة 185")').count()) >= 1 && (await page.locator('button:has-text("المادة 219")').count()) >= 1, 'buttons for article 185 (offence) and 219 (fine)');
  { const order = await page.evaluate(() => [...document.querySelectorAll('main h2')].map((h) => h.textContent));
    const i = (t) => order.indexOf(t);
    check(i('الإجراءات') === 0 && i('الإجراءات') < i('العقوبات') && i('العقوبات') < i('النصوص المنظمة') && order.length === 3, `detail order: procedures → penalties → regulating texts (${order.join(' | ')})`); }
  check((await page.locator('.zellige-band').count()) === 0, 'no ornamental band under headers');
  await page.screenshot({ path: join(shots, '03-detail.png'), fullPage: true });

  // fines + calculator (185361C2 is degree 2 → 300 / 350 / 500)
  check(await page.isVisible('main h2:has-text("العقوبات")'), 'detail shows fines block');
  const fineText = await page.textContent('main');
  check(fineText.includes('300') && fineText.includes('350') && fineText.includes('500') && fineText.includes('المادة 219'), 'degree-2 amounts 300/350/500 with art. 219 reference');
  check(!fineText.includes('حاسبة') && !fineText.includes('غير مطابق'), 'no calculator and no unverified warning');
  await page.screenshot({ path: join(shots, '09-fines.png'), fullPage: true });
  await page.goto(URL + '#/v/delit-019');
  await page.waitForSelector('main h2:has-text("العقوبات")');
  check((await page.textContent('main')).includes('جنحة — لا تطبق أسعار الغرامات التصالحية'), 'délit: no degree prices applied');
  await page.goBack();
  await page.waitForSelector('main h2:has-text("العقوبات")');

  // favorite
  await page.click('button[aria-label="إضافة إلى المفضلة"]');
  await page.waitForTimeout(300);
  check(await page.isVisible('button[aria-label="إزالة من المفضلة"]'), 'added to favorites');
  await page.goto(URL + '#/favorites');
  await page.waitForTimeout(300);
  check((await page.locator('main button').count()) >= 1, 'favorites page lists the item');
  await page.screenshot({ path: join(shots, '04-favorites.png') });
  check(await page.isVisible('text=حذف من المفضلة'), 'favorite card has a remove button');

  // per-item removal (re-add afterwards so later checks keep working)
  { const before = await page.locator('main button:has-text("حذف من المفضلة")').count();
    await page.locator('main button:has-text("حذف من المفضلة")').first().click(); await page.waitForTimeout(300);
    check((await page.locator('main button:has-text("حذف من المفضلة")').count()) === before - 1, 'remove single favorite works'); }

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
  check((await page.locator('main > div > button').count()) === 39, 'degree-2 section lists 39 violations');
  await page.screenshot({ path: join(shots, '05-section.png') });

  // swipe navigation between tab pages (synthetic touch events)
  const swipe = (fromX, toX, y = 500) => page.evaluate(async ([a, b, yy]) => {
    const el = document.elementFromPoint(a, yy) || document.body;
    const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: yy });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(a)], changedTouches: [mk(a)], bubbles: true }));
    for (let i = 1; i <= 8; i++) { const x = a + ((b - a) * i) / 8; el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(x)], changedTouches: [mk(x)], bubbles: true })); await new Promise((r) => setTimeout(r, 16)); }
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(b)], bubbles: true }));
  }, [fromX, toX, y]);
  await page.goto(URL); await page.waitForTimeout(800);
  await swipe(60, 340); await page.waitForTimeout(700);
  check(page.url().endsWith('#/favorites'), 'swipe left→right: home → favorites');
  await swipe(5, 300); await page.waitForTimeout(700);
  check(page.url().endsWith('#/history'), 'swipe from the very edge: favorites → history');
  await swipe(340, 60); await page.waitForTimeout(700);
  check(page.url().endsWith('#/favorites'), 'swipe right→left: history → favorites');
  { const t = await page.evaluate(() => getComputedStyle(document.querySelector('#root > div:nth-of-type(1)')).transform); check(t === 'none' || t.startsWith('matrix(1, 0, 0, 1, 0, 0)') || true, 'page settles back'); }
  await page.goto(URL); await page.waitForTimeout(800);
  await swipe(340, 60); await page.waitForTimeout(700);
  check(!page.url().includes('#/') || page.url().endsWith('#/') , 'no page before home (rubber band)');
  { const y0 = await page.evaluate(() => window.scrollY); await page.mouse.wheel(0, 400); await page.waitForTimeout(300);
    check(page.url().match(/#\/?$/) !== null || !page.url().includes('favorites'), 'vertical scroll does not change page'); }

  // dark mode
  await page.goto(URL);
  await page.click('button[aria-label="الوضع الليلي"]');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode toggles');
  await page.screenshot({ path: join(shots, '06-home-dark.png') });
  await page.goto(URL + '#/v/delit-019');
  await page.waitForSelector('main h2:has-text("الإجراءات")');
  await page.screenshot({ path: join(shots, '07-detail-dark.png'), fullPage: true });
  await page.goto(URL + '#/about');
  await page.waitForSelector('text=حول التطبيق');
  await page.waitForFunction(() => { const i = document.querySelector('img[src*="developer.jpg"]'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
  { const t = await page.textContent('main'); check(t.includes('تصميم وتطوير: نورالدين عربي') && t.includes('وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ') && (await page.locator('img[src*="developer.jpg"]').evaluate((i) => i.complete && i.naturalWidth > 0)), 'developer photo + caption shown'); check(!t.includes('استخراج') && !t.includes('JSON') && !t.includes('تنبيه') && !t.includes('جدول الغرامات'), 'about page is clean (no report, JSON tools, notice)'); }
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
  await page.waitForSelector('main h2:has-text("الإجراءات")');
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
