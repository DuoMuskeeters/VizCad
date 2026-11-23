// Referans panosu çekimi: her site için 390 px (iPhone 14, DPR 2) ve 1280 px (DPR 1) görüntü.
// Kullanım: node design/references/_shoot.cjs <çıktı klasörü> '<[["ad","url"],...]>'
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const out = process.argv[2];
const sites = JSON.parse(process.argv[3]);
const viewports = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 }, clip: { width: 390, height: 1690 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, clip: { width: 1280, height: 2400 } },
];
// Çerez/izin pencerelerini kapatmayı dene; bulamazsa sessizce geç.
const dismiss = async (p) => {
  for (const name of [/accept all/i, /^accept$/i, /allow all/i, /agree/i, /got it/i, /kabul/i, /^ok$/i]) {
    const b = p.getByRole('button', { name }).first();
    if (await b.isVisible({ timeout: 300 }).catch(() => false)) { await b.click().catch(() => {}); await p.waitForTimeout(500); return; }
  }
};
(async () => {
  const browser = await chromium.launch();
  for (const v of viewports) {
    const ctx = await browser.newContext({ ...v.ctx, locale: 'en-US' });
    for (const [n, u] of sites) {
      const p = await ctx.newPage();
      try {
        await p.goto(u, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await p.waitForTimeout(2500);
        await dismiss(p);
        // Lazy yüklenen görselleri tetiklemek için sayfayı kaydır, sonra başa dön.
        await p.evaluate(async () => { for (let y = 0; y < 3000; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); } window.scrollTo(0, 0); });
        await p.waitForTimeout(1200);
        const h = await p.evaluate(() => document.documentElement.scrollHeight);
        await p.screenshot({ path: `${out}/${n}-${v.tag}.jpg`, type: 'jpeg', quality: 78, fullPage: true,
          clip: { x: 0, y: 0, width: v.clip.width, height: Math.min(v.clip.height, h) } });
        console.log('ok', n, v.tag);
      } catch (e) { console.log('fail', n, v.tag, e.message.split('\n')[0]); }
      await p.close();
    }
    await ctx.close();
  }
  await browser.close();
})();
