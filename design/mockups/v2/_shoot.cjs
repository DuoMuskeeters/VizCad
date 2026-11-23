// v2 görsel taslak görüntüleri. Kullanım: node design/mockups/v2/_shoot.cjs <sayfa> <durum,durum,...>
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs'); const path = require('path');
const [name, list] = process.argv.slice(2);
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const vps = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 } },
];
(async () => {
  const b = await chromium.launch();
  for (const v of vps) {
    const ctx = await b.newContext(v.ctx); const p = await ctx.newPage();
    for (const s of list.split(',')) {
      await p.goto(`file://${__dirname}/${name}.html?durum=${s}`, { waitUntil: 'networkidle' });
      await p.evaluate(() => document.fonts.ready);
      const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await p.screenshot({ path: `${out}/${name}-${s}-${v.tag}.png`, fullPage: true });
      console.log(name, s, v.tag, o > 0 ? `YATAY TAŞMA ${o}px` : 'ok');
    }
    await ctx.close();
  }
  await b.close();
})();
