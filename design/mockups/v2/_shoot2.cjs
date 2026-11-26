// 12-stüdyo ve 13-montaj görüntüleri: her durum 390 ve 1280, açık ve koyu; 320'de yatay taşma denetimi.
// Kullanım: node design/mockups/v2/_shoot2.cjs <sayfa> <çıktı klasörü> [durum,durum,...]
// Sayfa adı dosya adıdır (ör. 12-stüdyo). Durum listesi verilmezse sayfadaki tüm durumlar çekilir.
const { chromium, devices } = require('/Users/ferhat/jobspy-scraper/apply-agent/node_modules/playwright-core');
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const [name, outArg, list] = process.argv.slice(2);
const out = path.resolve(outArg); fs.mkdirSync(out, { recursive: true });
const file = pathToFileURL(path.join(__dirname, `${name}.html`)).href;
const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace('ı', 'i');
const vps = [
  { tag: '390', ctx: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { tag: '1280', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { tag: '320', ctx: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }, check: true },
];
(async () => {
  const b = await chromium.launch();
  let states = list ? list.split(',') : null;
  let bad = 0;
  for (const v of vps) {
    const ctx = await b.newContext(v.ctx); const p = await ctx.newPage();
    if (!states) {
      await p.goto(`${file}?tema=acik`, { waitUntil: 'domcontentloaded' });
      states = await p.$$eval('.wire-bar a[data-s]', (as) => as.map((a) => a.dataset.s));
    }
    for (const s of states) for (const t of ['acik', 'koyu']) {
      if (v.check && t === 'koyu') continue;
      await p.goto(`${file}?durum=${s}&tema=${t}`, { waitUntil: 'networkidle' });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(150);
      const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const small = await p.evaluate(() => {
        // Dokunmatik genişlikte görünür etkileşimli öğeler 44 px'ten küçük mü?
        if (innerWidth > 899) return [];
        return [...document.querySelectorAll('.studio button, .studio a, .studio [role="switch"], .studio [role="checkbox"], .studio .pin')]
          .filter((el) => el.offsetParent !== null && !el.closest('[hidden]') && !el.closest('.cube'))
          .map((el) => { const r = el.getBoundingClientRect(); const pseudo = getComputedStyle(el, '::before').content !== 'none' || getComputedStyle(el, '::after').content !== 'none'; return { t: (el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), pseudo }; })
          .filter((r) => r.w > 0 && (r.w < 44 || r.h < 44) && !r.pseudo);
      });
      if (o > 0) bad++;
      if (!v.check) await p.screenshot({ path: `${out}/${slug}-${s}-${v.tag}-${t === 'acik' ? 'light' : 'dark'}.png` });
      console.log(name, s, v.tag, t, o > 0 ? `YATAY TAŞMA ${o}px` : 'ok', small.length ? `küçük hedef: ${JSON.stringify(small)}` : '');
    }
    await ctx.close();
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
