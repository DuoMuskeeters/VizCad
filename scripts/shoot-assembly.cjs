// Screenshots of Faz 5c (assembly studio) with the in-memory dev fixtures. Needs `pnpm dev` (BASE_URL, default :3000).
//   GLB_DIR: GLBs written by `VIZCAD_SAMPLES=… VIZCAD_GLB_OUT=… vitest run src/viewer/scene/glb.test.ts`
//   (Stealthburner_455parca.step.glb is the 455-part assembly of docs/11 §9 5c)
// Output: design/ui-shots/assembly/. Usage: node scripts/shoot-assembly.cjs [name-filter]
const { chromium, devices } = require(process.env.PLAYWRIGHT || '/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/assembly');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const glbDir = process.env.GLB_DIR || '/tmp/vizcad-glb';
const glb = process.env.GLB || 'Stealthburner_455parca.step.glb';

const routes = async (page) => {
  await page.route('**/api/files/*/model*', async (route) => {
    const body = fs.readFileSync(path.join(glbDir, glb));
    await route.fulfill({ body, headers: { 'content-type': 'model/gltf-binary', 'content-length': String(body.length) } }).catch(() => {});
  });
  await page.route('**/api/files/*/thumbnail*', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/files/*/scene*', (route) => route.fulfill({ json: { ok: true, data: { scene: null, previous: null } } }));
};
const ready = (page) => page.waitForFunction(() => { const c = document.querySelector('canvas[role=img]'); return c && !c.parentElement.classList.contains('invisible'); }, null, { timeout: 90000 }).then(() => page.waitForTimeout(800));
/** The first sub-assembly under the root, read from the tree or the parts list. */
const firstAssembly = (page) => page.evaluate(() => {
  const row = [...document.querySelectorAll('[role=treeitem][aria-expanded]')].find((r) => r.getAttribute('data-path') !== '0');
  return row?.getAttribute('data-path') ?? '0.0';
});

const screens = [
  {
    name: 'studio',
    url: '/app/files/f2?fixture=admin',
    setup: async (page, phone) => {
      await ready(page);
      if (phone) {
        await page.getByRole('button', { name: 'Parçalar', exact: true }).last().click();
        await page.waitForTimeout(300);
        return;
      }
      const path0 = await firstAssembly(page);
      await page.locator(`[data-path="${path0}"] [data-row-main]`).click();
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'folder',
    url: '/app/files/f2?fixture=admin&view=parts',
    setup: async (page) => {
      await page.getByRole('heading', { name: /montaj ·/i }).waitFor({ timeout: 90000 });
      await page.waitForFunction(() => document.querySelectorAll('section[aria-label=Parçalar] img').length >= 4 || !document.querySelector('section[aria-label=Parçalar] .animate-spin'), null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'isolate',
    url: '/app/files/f2?fixture=admin',
    setup: async (page, phone) => {
      await ready(page);
      if (phone) {
        await page.getByRole('button', { name: 'Parçalar', exact: true }).last().click()
        await page.locator('section[aria-label="Parça ağacı"] li button').first().click()
        await page.getByRole('button', { name: 'Parçaları kapat' }).click()
        await page.getByRole('toolbar', { name: /Seçili/ }).getByRole('button', { name: 'Yalnız bunu aç' }).click()
      } else {
        const path0 = await firstAssembly(page);
        await page.locator(`[data-path="${path0}"] [data-row-main]`).click();
        await page.getByRole('toolbar', { name: /Seçili/ }).getByRole('button', { name: 'Yalnız bunu aç' }).click();
      }
      await page.waitForTimeout(900);
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
        const context = await browser.newContext({ ...vp.ctx, colorScheme: theme, locale: 'tr-TR' });
        // A desktop-class device at 390 px too: the phone rule would otherwise hold back nothing here (GLB), but keep it explicit.
        const page = await context.newPage();
        page.on('pageerror', (e) => console.log('pageerror', e.message));
        await routes(page);
        await page.goto(`${baseUrl}${s.url}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);
        await s.setup(page, vp.phone);
        for (const width of vp.phone ? [320] : []) {
          await page.setViewportSize({ width, height: 700 });
          await page.waitForTimeout(200);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 0) { overflowFound = true; console.log(`OVERFLOW ${overflow}px at ${width}: ${s.name} ${theme}`); }
          const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (r.width < 44 || r.height < 44) && !el.closest('[data-skip-tap]');
          }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
          if (small.length) console.log(`small targets ${s.name} ${theme}:`, small.slice(0, 12).join(' | '));
          await page.setViewportSize(vp.ctx.viewport ?? { width: 390, height: 664 });
          await page.waitForTimeout(200);
        }
        await page.screenshot({ path: path.join(outDir, `${s.name}-${vp.tag}-${theme}.png`), fullPage: false });
        console.log(`shot ${s.name}-${vp.tag}-${theme}`);
        await context.close();
      }
    }
  }
  await browser.close();
  console.log(overflowFound ? 'overflow found' : 'no horizontal overflow');
})();
