const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots/auth');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

const pages = [
  { path: '/sign-in', name: 'sign-in' },
  { path: '/sign-up', name: 'sign-up' },
  { path: '/verify-email', name: 'verify-email' },
  { path: '/verify-email?error=INVALID_TOKEN', name: 'verify-email-invalid' },
  { path: '/email-verified', name: 'email-verified' },
  { path: '/forgot-password', name: 'forgot-password' },
  { path: '/reset-password?token=abc', name: 'reset-password' },
  { path: '/reset-password?error=INVALID_TOKEN', name: 'reset-password-invalid' },
  { path: '/app', name: 'app-placeholder' },
];
const viewports = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 } },
  { tag: '320', ctx: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 } },
];

(async () => {
  const browser = await chromium.launch();
  let bad = false;
  for (const p of pages) {
    for (const vp of viewports) {
      for (const theme of vp.tag === '320' ? ['light'] : ['light', 'dark']) {
        const context = await browser.newContext({ ...vp.ctx, colorScheme: theme });
        const page = await context.newPage();
        await page.goto(baseUrl + p.path, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (vp.tag !== '320') await page.screenshot({ path: path.join(outDir, `${p.name}-${vp.tag}-${theme}.png`), fullPage: true });
        console.log(`${p.name} ${vp.tag} ${theme}: ${overflow > 0 ? 'OVERFLOW ' + overflow : 'OK'}`);
        if (overflow > 0) bad = true;
        await context.close();
      }
    }
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
