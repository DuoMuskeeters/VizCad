const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../design/ui-shots');
fs.mkdirSync(outDir, { recursive: true });

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

const pages = [
  { path: '/dev/ui', name: 'dev-ui' },
  { path: '/dev/ui/shell', name: 'dev-shell' },
];

const viewports = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 } },
];

const themes = ['light', 'dark'];

(async () => {
  const browser = await chromium.launch();
  let hasOverflow = false;

  for (const pageInfo of pages) {
    for (const vp of viewports) {
      for (const theme of themes) {
        const context = await browser.newContext({
          ...vp.ctx,
          colorScheme: theme,
        });
        const page = await context.newPage();
        const url = `${baseUrl}${pageInfo.path}?theme=${theme}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate((t) => {
          document.documentElement.setAttribute('data-theme', t);
        }, theme);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const screenshotPath = path.join(outDir, `${pageInfo.name}-${vp.tag}-${theme}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        console.log(`[${pageInfo.name}] [${vp.tag}] [${theme}] -> ${overflow > 0 ? `YATAY TAŞMA: ${overflow}px` : 'OK'}`);
        if (overflow > 0) hasOverflow = true;
        await context.close();
      }
    }
  }

  // Also check 320px viewport for horizontal overflow (CLAUDE.md non-negotiable)
  for (const pageInfo of pages) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${pageInfo.path}?theme=light`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`[320px check] [${pageInfo.name}] -> ${overflow > 0 ? `YATAY TAŞMA: ${overflow}px` : 'OK'}`);
    if (overflow > 0) hasOverflow = true;
    await context.close();
  }

  await browser.close();
  if (hasOverflow) {
    console.error('Horizontal overflow detected on one or more configurations!');
    process.exit(1);
  }
  console.log('All screenshots captured successfully in design/ui-shots/');
})();
