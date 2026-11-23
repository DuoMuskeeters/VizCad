// Tel kafes görüntüleri: her sayfa × durum için 390 ve 1280 px. Kullanım: node design/mockups/_shoot.cjs
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const path = require('path');
const dir = __dirname;
const out = path.join(dir, 'shots');
const pages = {
  '01-dosyalar': ['dolu', 'secim', 'yukleme', 'bos', 'yukleniyor', 'hata'],
  '02-goruntuleyici': ['ayrintilar', 'yorumlar', 'surumler', 'paylas', 'yukleniyor', 'hata'],
  '03-paylasilan': ['indir', 'goruntule', 'parola', 'suresi-doldu', 'gecersiz'],
};
const vps = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
];
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  for (const v of vps) {
    const ctx = await b.newContext(v.ctx);
    const p = await ctx.newPage();
    for (const [name, states] of Object.entries(pages)) for (const s of states) {
      await p.goto(`file://${dir}/${name}.html?durum=${s}`);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await p.screenshot({ path: `${out}/${name}-${s}-${v.tag}.png`, fullPage: true });
      console.log(name, s, v.tag, overflow > 0 ? `YATAY TAŞMA ${overflow}px` : 'ok');
    }
    await ctx.close();
  }
  await b.close();
})();
