// Screenshots of Faz 5b (GLB derivative) with the in-memory dev fixtures. Needs `pnpm dev` (BASE_URL, default :3000).
//   GLB_DIR: GLBs written by `VIZCAD_SAMPLES=… VIZCAD_GLB_OUT=… vitest run src/viewer/scene/glb.test.ts`
//   SAMPLES_DIR: the STEP uploaded for the "Hazırlanıyor" card (converted for real in the dev Worker)
// Output: design/ui-shots/viewer/. Usage: node scripts/shoot-derivative.cjs [name-filter]
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/viewer');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const glbDir = process.env.GLB_DIR || '/tmp/vizcad-glb';
const samples = process.env.SAMPLES_DIR || '/tmp/viewer-samples';
const TOKEN = 'T'.repeat(43);

const glbRoute = (file) => async (route) => {
  const body = fs.readFileSync(path.join(glbDir, file));
  await route.fulfill({ body, headers: { 'content-type': 'model/gltf-binary', 'content-length': String(body.length) } }).catch(() => {});
};
const ready = (page) => page.waitForFunction(() => { const c = document.querySelector('canvas[role=img]'); return c && !c.parentElement.classList.contains('invisible'); }, null, { timeout: 90000 }).then(() => page.waitForTimeout(700));
let thumbnail = null;

const screens = [
  {
    // A commenter (view/comment level, no download) opens the GLB derivative of a STEP (D23).
    name: 'derivative-view-level',
    url: '/app/files/f2?fixture=commenter',
    routes: async (page) => {
      await page.route('**/api/files/*/model*', glbRoute('MiniSB_Bowden.step.glb'));
      await page.route('**/api/files/*/thumbnail*', (route) => route.fulfill({ status: 404 }));
    },
    setup: async (page) => {
      await ready(page);
      if (thumbnail === null) thumbnail = await page.locator('canvas[role=img]').screenshot();
    },
  },
  {
    // Upload on a desktop: the card shows "Hazırlanıyor" while the Worker writes the GLB.
    name: 'card-preparing',
    url: '/app?fixture=admin',
    routes: async (page) => {
      await page.route('**/api/files/*/derivative/**', (route) => route.fulfill({ json: { ok: true, data: { state: 'ready', sessionId: 's', url: `${baseUrl}/__r2`, headers: {} } } }));
      await page.route('**/__r2', (route) => route.fulfill({ status: 200, headers: { etag: '"e"' } }));
      await page.route('**/api/files/*/thumbnail*', (route) => route.request().method() === 'POST' ? route.fulfill({ json: { ok: true, data: { thumbnailAvailable: true } } }) : route.fulfill({ status: 404 }));
    },
    setup: async (page) => {
      // The grid toggle is desktop only; at 390 px the list row shows the same state.
      await page.getByRole('radio', { name: 'Izgara' }).click({ timeout: 3000 }).catch(() => {});
      await page.locator('input[type=file]').setInputFiles(path.join(samples, 'MiniSB_Bowden.step'));
      await page.getByText('Hazırlanıyor').first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(300);
    },
  },
  {
    // Mobile shared page: never 3D by itself; thumbnail + "3B'yi aç · N MB". Desktop: opens the GLB.
    name: 'shared-3d',
    url: `/s/${TOKEN}?fixture=share-3d`,
    routes: async (page) => {
      await page.route(`**/s/${TOKEN}/model*`, glbRoute('as1-montaj-renkli.stp.glb'));
      await page.route(`**/s/${TOKEN}/thumbnail*`, (route) => thumbnail ? route.fulfill({ body: thumbnail, headers: { 'content-type': 'image/png' } }) : route.fulfill({ status: 404 }));
    },
    setup: async (page, phone) => {
      if (phone) await page.getByRole('button', { name: /3B'yi aç/ }).waitFor({ timeout: 30000 });
      else await ready(page);
    },
  },
];

const viewports = [
  { tag: '390', phone: true, ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', phone: false, ctx: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 } },
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
  const only = process.argv[2];
  let overflowFound = false;
  for (const s of screens) {
    if (only && !s.name.includes(only)) continue;
    for (const vp of viewports) {
      for (const theme of ['light', 'dark']) {
        // The card shot needs a desktop-class device even at 390 px: phones convert nothing.
        const coarse = vp.phone && s.name !== 'card-preparing';
        const ctx = s.name === 'card-preparing' && vp.phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : vp.ctx;
        const context = await browser.newContext({ ...ctx, colorScheme: theme, locale: 'tr-TR' });
        if (coarse) await context.addInitScript(() => { const m = window.matchMedia.bind(window); window.matchMedia = (q) => (q === '(pointer: coarse)' ? { ...m(q), matches: true, media: q } : m(q)); });
        const page = await context.newPage();
        await s.routes(page);
        await page.goto(`${baseUrl}${s.url}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        await s.setup(page, coarse);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) { overflowFound = true; console.log(`OVERFLOW ${overflow}px: ${s.name} ${vp.tag} ${theme}`); }
        await page.screenshot({ path: path.join(outDir, `${s.name}-${vp.tag}-${theme}.png`), fullPage: false });
        console.log(`shot ${s.name}-${vp.tag}-${theme}`);
        await context.close();
      }
    }
  }
  await browser.close();
  console.log(overflowFound ? 'overflow found' : 'no horizontal overflow');
})();
