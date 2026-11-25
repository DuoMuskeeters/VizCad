// Screenshots of the Faz 4e-2 screens (projects, project, shared, trash, activity, settings, access list, move window,
// shared file page) with the in-memory dev fixtures (`?fixture=<scenario>`, src/app/fixture.ts, src/app/share/fixtureShare.ts).
// Needs `pnpm dev`. Output: design/ui-shots/app/. Usage: node scripts/shoot-app.cjs [name-filter]
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/app');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = 'k8F2mQexampletokenk8F2mQexampletokenk8F2mQ1';

const click = (name, role = 'button') => async (page) => { await page.getByRole(role, { name }).first().click(); await page.waitForTimeout(500); };
const rowMenu = (file, item) => async (page) => {
  await page.getByRole('button', { name: `${file}: diğer eylemler` }).first().click();
  if (item) await page.getByRole('menuitem', { name: item, exact: true }).click();
  await page.waitForTimeout(600);
};

const screens = [
  { name: 'files-access', url: '/app?fixture=admin' },
  { name: 'move', url: '/app?fixture=admin', modal: true, setup: async (page) => {
      await rowMenu('Mil_Ø25x300.step', 'Taşı')(page);
      await page.getByRole('radio', { name: /Pompa revizyonu/ }).click();
      await page.getByRole('button', { name: 'Taşı', exact: true }).click();
      await page.waitForTimeout(600); } },
  { name: 'share-access', url: '/app/files/f1?fixture=admin', modal: true, setup: async (page) => { await page.getByRole('button', { name: 'Paylaş', exact: true }).first().click(); await page.waitForTimeout(900); } },
  { name: 'projects', url: '/app/projects?fixture=admin' },
  { name: 'projects-empty', url: '/app/projects?fixture=files-empty' },
  { name: 'projects-error', url: '/app/projects?fixture=files-error' },
  { name: 'projects-new', url: '/app/projects?fixture=admin', modal: true, setup: click('Yeni proje') },
  { name: 'project-files', url: '/app/projects/p-pompa?fixture=admin' },
  { name: 'project-access', url: '/app/projects/p-pompa?fixture=admin', setup: click('Erişim', 'tab') },
  { name: 'project-confirm', url: '/app/projects/p-pompa?fixture=admin', modal: true, setup: async (page) => {
      await click('Erişim', 'tab')(page);
      await page.getByRole('radio', { name: /Tüm ekip/ }).click(); await page.waitForTimeout(500);
      await page.getByRole('radio', { name: /Yalnızca davetliler/ }).click(); await page.waitForTimeout(500); } },
  { name: 'project-activity', url: '/app/projects/p-pompa?fixture=admin', setup: click('Aktivite', 'tab') },
  { name: 'project-commenter', url: '/app/projects/p-konveyor?fixture=commenter' },
  { name: 'shared-with-me', url: '/app/shared?fixture=admin' },
  { name: 'shared-by-me', url: '/app/shared?fixture=admin', setup: click('Paylaştıklarım', 'tab') },
  { name: 'shared-empty', url: '/app/shared?fixture=files-empty' },
  { name: 'trash', url: '/app/trash?fixture=admin' },
  { name: 'trash-empty', url: '/app/trash?fixture=files-empty' },
  { name: 'trash-purge', url: '/app/trash?fixture=admin', modal: true, setup: rowMenu('Kapak_taslak.stl', 'Kalıcı olarak sil') },
  { name: 'trash-empty-confirm', url: '/app/trash?fixture=admin', modal: true, setup: click('Çöpü boşalt') },
  { name: 'trash-commenter', url: '/app/trash?fixture=commenter' },
  { name: 'activity', url: '/app/activity?fixture=admin' },
  { name: 'activity-filtered', url: '/app/activity?fixture=admin', setup: async (page) => {
      await page.getByRole('combobox', { name: 'Tür' }).click(); await page.getByRole('option', { name: 'Açma ve indirme' }).click(); await page.waitForTimeout(500); } },
  { name: 'activity-empty', url: '/app/activity?fixture=files-empty' },
  { name: 'activity-denied', url: '/app/activity?fixture=commenter' },
  { name: 'settings', url: '/app/settings?fixture=admin' },
  { name: 's-download', url: `/s/${TOKEN}?fixture=share-download`, plain: true },
  { name: 's-view', url: `/s/${TOKEN}?fixture=share-view`, plain: true },
  { name: 's-long', url: `/s/${TOKEN}?fixture=share-long`, plain: true },
  { name: 's-password', url: `/s/${TOKEN}?fixture=share-password`, plain: true },
  { name: 's-password-wrong', url: `/s/${TOKEN}?fixture=share-password`, plain: true, setup: async (page) => {
      await page.getByLabel('Parola').fill('yanlis-parola'); await page.getByRole('button', { name: 'Şifreyi göster' }).click();
      await page.getByRole('button', { name: 'Dosyayı aç' }).click(); await page.waitForTimeout(600); } },
  { name: 's-expired', url: `/s/${TOKEN}?fixture=share-expired`, plain: true },
  { name: 's-invalid', url: `/s/${TOKEN}?fixture=share-invalid`, plain: true },
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
        const context = await browser.newContext({ ...vp.ctx, colorScheme: theme, locale: 'tr-TR' });
        const page = await context.newPage();
        await page.goto(`${baseUrl}${s.url}`, { waitUntil: 'networkidle' });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(900);
        if (s.setup) await s.setup(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await page.screenshot({ path: path.join(outDir, `${s.name}-${vp.tag}-${theme}.png`), fullPage: !s.modal });
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
})().catch((error) => { console.error(error); process.exit(1); });
