// Screenshots of the file page with the 3D viewer (Faz 5a) using the in-memory dev fixture (`?fixture=admin`).
// The model bytes come from SAMPLES_DIR through a route on `/api/files/<id>/content`; the thumbnail POST is answered locally.
// Needs `pnpm dev`. Output: design/ui-shots/viewer/. Usage: node scripts/shoot-viewer.cjs [name-filter]
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/viewer');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const samples = process.env.SAMPLES_DIR || '/tmp/viewer-samples';

// Fixture files: f1 Flanş_DN100_rev3.step, f4 Rulman_yuvası_6205.stl, f6 Kapak_plakası_t5.obj, f7 Braket_sol_v2.3mf.
const content = { f1: 'as1-oc-214.stp', f4: 'dragon.stl', f6: 'as1.obj', f7: 'as1.3mf' };
const ready = (page) => page.waitForFunction(() => { const c = document.querySelector('canvas[role=img]'); return c && !c.parentElement.classList.contains('invisible'); }, null, { timeout: 60000 }).then(() => page.waitForTimeout(700));
// On the phone viewport STEP waits for the person (phone rule); on desktop it opens by itself.
const openOnPhone = async (page) => { if (page.viewportSize().width < 900) await page.getByRole('button', { name: 'Bu cihazda aç' }).click({ timeout: 20000 }); };

const screens = [
  { name: 'step', file: 'f1', setup: async (page) => { await openOnPhone(page); await ready(page); } },
  { name: 'step-edges', file: 'f1', setup: async (page) => { await openOnPhone(page); await ready(page); await page.getByRole('button', { name: 'Kenarlar' }).click(); await page.waitForTimeout(500); } },
  { name: 'step-views', file: 'f1', modal: true, setup: async (page) => { await openOnPhone(page); await ready(page); await page.getByRole('button', { name: 'Standart görünümler' }).click(); await page.waitForTimeout(400); } },
  { name: 'step-phone', file: 'f1', only: '390', setup: (page) => page.getByRole('button', { name: 'Bu cihazda aç' }).waitFor({ timeout: 20000 }) },
  { name: 'stl', file: 'f4', setup: ready },
  { name: '3mf', file: 'f7', setup: ready },
  { name: 'loading', file: 'f4', slow: true, setup: (page) => page.waitForTimeout(900) },
  { name: 'error', file: 'f6', broken: true, setup: (page) => page.getByText('Dosya okunamadı').waitFor({ timeout: 30000 }) },
];

const viewports = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 } },
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
  const only = process.argv[2];
  let overflowFound = false;
  for (const s of screens) {
    if (only && !s.name.includes(only)) continue;
    for (const vp of viewports) {
      if (s.only && s.only !== vp.tag) continue;
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ ...vp.ctx, colorScheme: theme, locale: 'tr-TR' });
        // Chromium's iPhone profile does not report a coarse pointer; real phones do (phone rule, docs/11 §2.5).
        if (vp.tag === '390') await context.addInitScript(() => { const m = window.matchMedia.bind(window); window.matchMedia = (q) => (q === '(pointer: coarse)' ? { ...m(q), matches: true, media: q } : m(q)); });
        const page = await context.newPage();
        await page.route('**/api/files/*/content*', async (route) => {
          if (s.slow) await new Promise((r) => setTimeout(r, 60000));
          const body = s.broken ? Buffer.from('v 0 0 0\nnot an obj at all \u0000') : fs.readFileSync(path.join(samples, content[s.file]));
          await route.fulfill({ body, headers: { 'content-type': 'application/octet-stream', 'content-length': String(body.length) } }).catch(() => {});
        });
        await page.route('**/api/files/*/thumbnail*', (route) => route.request().method() === 'POST' ? route.fulfill({ json: { ok: true, data: { thumbnailAvailable: true } } }) : route.fulfill({ status: 404 }));
        await page.goto(`${baseUrl}/app/files/${s.file}?fixture=admin`, { waitUntil: 'domcontentloaded' });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (s.setup) await s.setup(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) { overflowFound = true; console.log(`OVERFLOW ${overflow}px: ${s.name} ${vp.tag} ${theme}`); }
        await page.screenshot({ path: path.join(outDir, `${s.name}-${vp.tag}-${theme}.png`), fullPage: false });
        await context.close();
      }
    }
  }
  // 320 px: no horizontal scroll with the viewer open.
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, locale: 'tr-TR' });
  const page = await context.newPage();
  await page.route('**/api/files/*/content*', (route) => route.fulfill({ body: fs.readFileSync(path.join(samples, 'dragon.stl')) }));
  await page.route('**/api/files/*/thumbnail*', (route) => route.fulfill({ json: { ok: true, data: {} } }));
  await page.goto(`${baseUrl}/app/files/f4?fixture=admin`);
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) { overflowFound = true; console.log(`OVERFLOW 320px ${overflow}px`); }
  await context.close();
  await browser.close();
  console.log(overflowFound ? 'overflow found' : 'no horizontal overflow');
})();
