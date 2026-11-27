// Screenshots of Faz 5d (studio tools) with the in-memory dev fixtures. Needs a dev server (BASE_URL, e.g. `vite dev --port 3077`).
//   GLB_DIR: GLBs written by `VIZCAD_SAMPLES=… VIZCAD_GLB_OUT=… vitest run src/viewer/scene/glb.test.ts`
// Output: design/ui-shots/tools/. Usage: node scripts/shoot-tools.cjs [name-filter]
// Also checks: no horizontal scroll at 320/390/1280, tap targets of the toolbar and the tool sheet ≥ 44 px on a phone.
const { chromium, devices } = require(process.env.PLAYWRIGHT || '/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/tools');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3077';
const glbDir = process.env.GLB_DIR || '/tmp/vizcad-glb';
const glb = process.env.GLB || 'Stealthburner_455parca.step.glb';

const routes = async (page) => {
  await page.route('**/api/files/*/model*', async (route) => {
    const body = fs.readFileSync(path.join(glbDir, glb));
    await route.fulfill({ body, headers: { 'content-type': 'model/gltf-binary', 'content-length': String(body.length) } }).catch(() => {});
  });
  await page.route('**/api/files/*/thumbnail*', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/files/*/scene*', (route) => route.fulfill({ json: { ok: true, data: { scene: null, previous: null, canEdit: true, maxViews: 20 } } }));
};
const ready = (page) => page.waitForFunction(() => { const c = document.querySelector('canvas[role=img]'); return c && !c.parentElement.classList.contains('invisible'); }, null, { timeout: 90000 }).then(() => page.waitForTimeout(800));
const toolbar = (page) => page.getByRole('toolbar', { name: 'Stüdyo araçları' })
const canvasBox = (page) => page.locator('canvas[role=img]').boundingBox();

const screens = [
  { name: 'toolbar', setup: async () => {} },
  {
    name: 'section',
    setup: async (page) => {
      await toolbar(page).getByRole('button', { name: 'Kesit' }).click();
      await page.waitForTimeout(400);
      await page.getByRole('slider').fill('420');
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'measure',
    setup: async (page, phone) => {
      await toolbar(page).getByRole('button', { name: 'Ölçü' }).click();
      await page.waitForTimeout(400);
      const box = await canvasBox(page);
      const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
      if (phone) {
        const [x, y] = at(0.42, 0.45);
        await page.touchscreen.tap(x, y);
        await page.waitForTimeout(300);
        const [x2, y2] = at(0.6, 0.55);
        await page.touchscreen.tap(x2, y2);
      } else {
        await page.mouse.click(...at(0.42, 0.42));
        await page.waitForTimeout(300);
        await page.mouse.click(...at(0.58, 0.6));
        await page.waitForTimeout(300);
        await page.mouse.move(...at(0.5, 0.35));
      }
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'screenshot',
    setup: async (page) => {
      await toolbar(page).getByRole('button', { name: /Ekran görüntüsü|Görüntü/ }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'more',
    phoneOnly: true,
    setup: async (page) => {
      await toolbar(page).getByRole('button', { name: 'Diğer araçlar' }).click();
      await page.waitForTimeout(400);
    },
  },
];

const viewports = [
  { tag: '390', phone: true, ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', phone: false, ctx: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 } },
];

(async () => {
  const filter = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
  const problems = [];
  for (const screen of screens) {
    if (filter && !screen.name.includes(filter)) continue;
    for (const vp of viewports) {
      if (screen.phoneOnly && !vp.phone) continue;
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ ...vp.ctx, colorScheme: theme, locale: 'tr-TR' });
        await context.addInitScript(() => {
          try { localStorage.setItem('vizcad_locale', 'tr'); localStorage.setItem('vizcad.gestures.seen', '1'); } catch {}
        });
        const page = await context.newPage();
        page.on('pageerror', (e) => problems.push(`${screen.name} ${vp.tag} ${theme}: ${e.message}`));
        await routes(page);
        await page.goto(`${baseUrl}/app/files/f2?fixture=admin`);
        await ready(page);
        await screen.setup(page, vp.phone);
        const file = path.join(outDir, `${screen.name}-${vp.tag}-${theme === 'light' ? 'acik' : 'koyu'}.png`);
        await page.screenshot({ path: file });
        if (vp.phone) {
          const small = await page.evaluate(() => [...document.querySelectorAll('[role=toolbar][aria-label="Stüdyo araçları"] button, section[aria-label] button, [role=menu] [role^=menuitem]')]
            .filter((b) => b.offsetParent !== null)
            .map((b) => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label') || b.textContent.trim(), w: r.width, h: r.height }; })
            .filter((b) => b.h < 44 || b.w < 44));
          if (small.length) problems.push(`${screen.name} ${vp.tag} ${theme}: small targets ${JSON.stringify(small)}`);
          for (const width of [320, 390]) {
            await page.setViewportSize({ width, height: 664 });
            await page.waitForTimeout(200);
            const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            if (over > 0) problems.push(`${screen.name} ${width} ${theme}: horizontal scroll ${over}px`);
          }
        } else {
          const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (over > 0) problems.push(`${screen.name} 1280 ${theme}: horizontal scroll ${over}px`);
        }
        console.log('shot', path.basename(file));
        await context.close();
      }
    }
  }
  await browser.close();
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no problems');
})();
