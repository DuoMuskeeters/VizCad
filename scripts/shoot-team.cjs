// Screenshots of the app shell, team, onboarding and invitation screens, using the in-memory dev fixture
// (`?fixture=<scenario>`, src/app/fixture.ts). Needs `pnpm dev`. Output: design/ui-shots/team/.
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/team');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

const click = (name, role = 'button') => async (page) => { await page.getByRole(role, { name }).first().click(); await page.waitForTimeout(350); };

const screens = [
  { name: 'home-personal', url: '/app?fixture=personal' },
  { name: 'home-company', url: '/app?fixture=owner' },
  { name: 'team-owner', url: '/app/team?fixture=owner' },
  { name: 'team-guests', url: '/app/team?fixture=owner', setup: click(/Guests|Misafirler/, 'tab') },
  { name: 'team-invitations', url: '/app/team?fixture=admin', setup: click(/Pending invitations|Bekleyen/, 'tab') },
  { name: 'team-commenter', url: '/app/team?fixture=commenter' },
  { name: 'team-guest-view', url: '/app/team?fixture=guest' },
  { name: 'team-personal', url: '/app/team?fixture=empty-team' },
  { name: 'team-invite-dialog', url: '/app/team?fixture=owner', setup: click(/Invite members|Üye davet et/) },
  { name: 'team-confirm-remove', url: '/app/team?fixture=owner', setup: async (page) => {
      await page.getByRole('button', { name: /Actions for Zeynep|Zeynep Arslan için/ }).click();
      await page.getByRole('menuitem', { name: /Remove from workspace|Workspace’ten çıkar/ }).click();
      await page.waitForTimeout(350); } },
  { name: 'switcher-open', url: '/app/team?fixture=owner', setup: async (page) => {
      const vw = page.viewportSize().width;
      await page.locator(vw < 900 ? 'header button[aria-haspopup="menu"]' : 'aside button[aria-haspopup="menu"]').first().click();
      await page.waitForTimeout(350); } },
  { name: 'onboarding-kind', url: '/onboarding?fixture=newuser' },
  { name: 'onboarding-company', url: '/onboarding?fixture=newuser', setup: async (page) => {
      await page.getByRole('radio', { name: /For my company|Firmam için/ }).click();
      await page.getByRole('button', { name: /Continue|Devam/ }).click(); await page.waitForTimeout(300); } },
  { name: 'invite-anonymous', url: '/invite/abc?fixture=anon' },
  { name: 'invite-signed-in', url: '/invite/abc?fixture=invite-ok' },
  { name: 'invite-expired', url: '/invite/abc?fixture=invite-expired', setup: click(/Accept invitation|Daveti kabul et/) },
  { name: 'invite-other-account', url: '/invite/abc?fixture=invite-other', setup: click(/Accept invitation|Daveti kabul et/) },
  { name: 'invite-guest', url: '/guest-invite/abcdefghijklmnopqrstuvwxyz?fixture=invite-ok' },
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
        await page.screenshot({ path: path.join(outDir, `${s.name}-${vp.tag}-${theme}.png`), fullPage: s.name.includes('dialog') || s.name.includes('confirm') || s.name.includes('switcher') ? false : true });
        if (overflow > 0) { overflowFound = true; console.log(`OVERFLOW ${overflow}px: ${s.name} ${vp.tag} ${theme}`); }
        await context.close();
      }
    }
  }
  // 320px: no horizontal scroll
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
