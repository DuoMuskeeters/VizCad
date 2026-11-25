// Screenshots of the files screens (list, upload, file page, share dialog) with the in-memory dev fixture
// (`?fixture=<scenario>`, src/app/fixture.ts). Needs `pnpm dev`. Output: design/ui-shots/files/.
// Usage: node scripts/shoot-files.cjs [name-filter]. Upload samples come from FILES_DIR (default /tmp/shots).
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/files');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const filesDir = process.env.FILES_DIR || '/tmp/shots';

const click = (name, role = 'button') => async (page) => { await page.getByRole(role, { name }).first().click(); await page.waitForTimeout(400); };
const rowMenu = (file, item) => async (page) => {
  await page.getByRole('button', { name: `${file}: diğer eylemler` }).first().click();
  if (item) await page.getByRole('menuitem', { name: item }).click();
  await page.waitForTimeout(400);
};
const openShare = async (page) => { await page.getByRole('button', { name: 'Paylaş', exact: true }).first().click(); await page.waitForTimeout(700); };

const screens = [
  { name: 'list', url: '/app?fixture=admin' },
  { name: 'grid', url: '/app?fixture=admin', setup: async (page) => {
      const vw = page.viewportSize().width;
      if (vw >= 900) await page.getByRole('radio', { name: 'Izgara' }).click();
      else await page.evaluate(() => localStorage.setItem('vizcad_files_view', 'grid'));
      if (vw < 900) await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500); } },
  { name: 'empty', url: '/app?fixture=files-empty' },
  { name: 'starred-empty', url: '/app?fixture=files-empty', setup: click('Yıldızlı') },
  { name: 'search-empty', url: '/app?fixture=admin', setup: async (page) => { await page.getByRole('searchbox').fill('flanş99'); await page.waitForTimeout(900); } },
  { name: 'error', url: '/app?fixture=files-error' },
  { name: 'loading', url: '/app?fixture=files-slow', noWait: true },
  { name: 'selection', url: '/app?fixture=admin', setup: async (page) => {
      await rowMenu('Konveyör_şase.iges', 'Seç')(page);
      await page.getByRole('checkbox', { name: 'Rulman_yuvası_6205.stl seç' }).check({ force: true });
      await page.waitForTimeout(300); } },
  { name: 'row-menu', url: '/app?fixture=admin', setup: rowMenu('Konveyör_şase.iges') },
  { name: 'row-menu-commenter', url: '/app?fixture=files-commenter', setup: rowMenu('Konveyör_şase.iges') },
  { name: 'rename', url: '/app?fixture=admin', setup: rowMenu('Konveyör_şase.iges', 'Adını değiştir') },
  { name: 'upload', url: '/app?fixture=admin', setup: async (page) => {
      await page.locator('input[type=file]').setInputFiles([path.join(filesDir, 'Pompa_kapak.step'), path.join(filesDir, 'rotor.dwg')]);
      await page.waitForTimeout(1000); } },
  { name: 'upload-done', url: '/app?fixture=admin', setup: async (page) => {
      await page.locator('input[type=file]').setInputFiles([path.join(filesDir, 'Pompa_kapak.step'), path.join(filesDir, 'rotor.dwg')]);
      await page.waitForTimeout(2600); } },
  { name: 'file-details', url: '/app/files/f1?fixture=admin' },
  { name: 'file-comments', url: '/app/files/f1?fixture=admin', setup: click('Yorumlar', 'tab') },
  { name: 'file-activity', url: '/app/files/f1?fixture=admin', setup: click('Aktivite', 'tab') },
  { name: 'file-versions', url: '/app/files/f1?fixture=admin', setup: click('Sürümler', 'tab') },
  { name: 'file-versions-single', url: '/app/files/f1?fixture=files-one-version', setup: click('Sürümler', 'tab') },
  { name: 'file-commenter', url: '/app/files/f1?fixture=files-commenter', setup: click('Aktivite', 'tab') },
  { name: 'share-people', url: '/app/files/f1?fixture=admin', setup: async (page) => {
      await openShare(page);
      await page.getByRole('textbox', { name: 'Kişi ya da e-posta ekle' }).fill('satinalma@yildiztorna.com');
      await page.getByRole('button', { name: /misafir olarak davet et/ }).click();
      await page.waitForTimeout(400); } },
  { name: 'share-link', url: '/app/files/f1?fixture=admin', setup: async (page) => {
      await openShare(page);
      await page.getByRole('switch', { name: /Linki aç/ }).click();
      await page.waitForTimeout(500);
      await page.getByRole('switch', { name: /Parola iste/ }).click();
      await page.getByRole('button', { name: 'Linki kopyala' }).click().catch(() => {});
      await page.waitForTimeout(500); } },
];

const viewports = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 } },
];

(async () => {
  const browser = await chromium.launch();
  let overflowFound = false;
  const only = process.argv[2];
  for (const s of screens) {
    if (only && !s.name.includes(only)) continue;
    for (const vp of viewports) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ ...vp.ctx, colorScheme: theme, locale: 'tr-TR', permissions: ['clipboard-read', 'clipboard-write'] });
        const page = await context.newPage();
        await page.goto(`${baseUrl}${s.url}`, { waitUntil: 'networkidle' });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(s.noWait ? 500 : 900);
        if (s.setup) await s.setup(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const modal = /rename|share|menu/.test(s.name);
        await page.screenshot({ path: path.join(outDir, `${s.name}-${vp.tag}-${theme}.png`), fullPage: !modal && !/upload/.test(s.name) });
        if (overflow > 0) { overflowFound = true; console.log(`OVERFLOW ${overflow}px: ${s.name} ${vp.tag} ${theme}`); }
        await context.close();
      }
    }
  }
  for (const s of screens) {
    if (only && !s.name.includes(only)) continue;
    const context = await browser.newContext({ viewport: { width: 320, height: 640 }, locale: 'tr-TR' });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${s.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if (s.setup) await s.setup(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) { overflowFound = true; console.log(`OVERFLOW 320px ${overflow}px: ${s.name}`); }
    await context.close();
  }
  await browser.close();
  console.log(overflowFound ? 'overflow found' : 'no horizontal overflow');
})();
