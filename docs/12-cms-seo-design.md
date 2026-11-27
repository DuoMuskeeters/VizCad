# Faz 6 · CMS, pazarlama ve SEO tasarımı

Durum **teknik tasarım, inceleme bulgularıyla revize edildi** (26 Kasım 2026). D3, D4, D5, D6, D9 ve D14 bağlayıcıdır. Çelişki olursa `01-decisions.md` kazanır. [Kararlar](01-decisions.md) · [Plan, Faz 6](00-refactor-plan.md) · [Tasarım §2.15–2.18](03-design.md) · [Faz 4 tasarımı](09-files-sharing-design.md) · [Faz 5 tasarımı](11-viewer-design.md)

Her başlıkta önce **karar**, sonra **gerekçe** ve reddedilen **alternatif** gelir. Kod adları öneridir, davranış bağlayıcıdır.

Kısaca: blog, yazarlar, site metinleri, sayfa SEO'su ve yasal metinler D1'de, 5 dilde tutulur. Pazarlama sayfaları Worker'da SSR ile çizilir ve Cloudflare Cache API'de saklanır. Önbellek isabeti Effect'i ve router'ı hiç yüklemez. Admin yayınlayınca etkilenen URL'ler saf bir fonksiyonla hesaplanır ve temizlenir. Temizleme başarısız olursa kuyruğa girer. İngilizce önek almaz (`/blog/x`), diğer diller önek alır (`/tr/blog/x`). Böylece canlıdaki her blog URL'si aynı kalır. Mevcut yazılar `posts` tablosunda durur ve bir script'le `post_translations`'a `en` olarak kopyalanır: production'da cutover'da, staging'de örnek veri yüklenir yüklenmez. Genel istek hiçbir zaman markdown çevirmez. Admin bundan sonra İngilizceyi yayınladığında aynı batch'te `posts` sütunlarına da yazar, böylece eski Worker'a geri dönüş blogu kırmaz.

### Uygulamaya başlamadan önce düzeltilmesi gerekenler

| # | Zorunlu kural |
|---|---|
| 1 | Önbelleğe giren HTML çereze, oturuma, sorgu dizgisine ve `Accept-Language`'a bağlı olamaz: ıskada SSR'a sorgusuz ve çerezsiz, temizlenmiş bir istek gider (§7.1). Önbelleği yalnız `GET` ıskası doldurur. `HEAD`, `Set-Cookie` taşıyan ya da 200/301 olmayan yanıt önbelleğe girmez. Anahtar build kimliğini içerir, deploy eski HTML'i geçersiz kılar. Pazarlama başlığı oturumlu ve oturumsuz ziyaretçide aynıdır. |
| 2 | `Cache.live.ts`'teki TODO kapatılır: `CF_ZONE_ID`/`CF_PURGE_TOKEN` yoksa yayın `CacheError` ile **başarısız sayılır**. Yalnız yerel silme, yayın için başarı değildir. `purge_everything` hiç kullanılmaz, çünkü zone legacy siteyle ortak. |
| 3 | Legacy `GET /api/blog?status=draft` ve `GET /api/blog/{id}` taslakları kimlik doğrulamadan veriyor. `POST /api/blog` gövdeyi `...data` ile olduğu gibi yazıyor. Bu uçlar yeni Worker'da yok (404). Yerine admin uçları gelir (§3). |
| 4 | Markdown güvenli çevrilir: ham HTML kaçışlanır, `javascript:`/`data:` bağlantıları atılır, görsel yalnız kendi alan adımızdan gelir (§4.3). JSON-LD içinde `<` → `\u003c`, `>` → `\u003e`, `&` → `\u0026` olarak yazılır (`JSON.stringify` bunları kaçışlamaz; `</script>` içeren bir başlık betiği kapatamaz). |
| 5 | Legacy blog görselleri (`/api/blog/image/{kodlanmış anahtar}`, R2 `blog/...`) aynı URL'de çalışmaya devam eder. Yeni yüklemeler de **aynı biçimde** URL alır (`/media/...` yok), böylece eski Worker'a geri dönüşte görseller kırılmaz. R2 anahtarı yeniden adlandırılmaz. SVG yüklemesi kapanır. Var olan SVG'ler `CSP: sandbox` ve `nosniff` ile verilir. |
| 6 | `posts.authorId` kullanıcı silinince `CASCADE` ile yazıları siliyor (legacy 0006). `user` **ve** `account` tablolarına `BEFORE DELETE` trigger'ı eklenir: yazısı olan kullanıcı silinemez. better-auth `deleteUser` önce oturumları, sonra hesapları, en son kullanıcıyı ayrı komutlarla siler; yalnız `user` korunursa hesap yarım silinir (giriş yöntemleri gider, kullanıcı kalır). Yeni kod SDK'yı çağırmadan önce de reddeder (§1.4). |

## 0. Kapsam

| Var (Faz 6) | Yok (sonra) |
|---|---|
| Blog: liste, yazı, yazar sayfası (`en`). Şema, editör, çözümleme ve temizleme 5 dile hazır | D9: blog çevirileri ve dil başına blog sayfaları sonra. `/{locale}/blog/**`, `/{locale}/authors/*` ve dil RSS'i, dil `blogLocales` listesine eklenene kadar 404 (K14) |
| Admin CMS: yazılar, yazarlar, site metinleri, sayfa SEO'su, yasal metinler, görseller, önbellek günlüğü | Zamanlanmış yayın, çok kişili editör rolleri (yalnız platform admini yazar) |
| SSR + edge cache + yayında temizleme (D4), başarısız temizleme kuyruğu | Kategori ve etiket sayfaları (zayıf içerik; kategori yalnız etiket olarak görünür) |
| SEO: canonical, hreflang (5 dil + `x-default`), JSON-LD, dil başına sitemap, robots, `llms.txt`, RSS, OG | Worker'da dinamik OG görseli üretimi (Free plan CPU) |
| Landing, fiyatlandırma iskeleti, SSS, iletişim (Turnstile + e-posta), yasal sayfalar ve kabul kaydı | Fiyat verisi ve ödeme sayfaları (Faz 8, Q9/Q10). Bülten (legacy EmailJS, K8) |
| Legacy URL'lerin korunması ve yönlendirmeler | Uygulama içi metinlerin adminden değiştirilmesi (K4) |

## 1. Veri modeli ve migration

### 1.1 Legacy tabloların bugünkü şekli

Kaynak: `src/server/db/schema.ts` (legacy `0006`, `0007`, `0008`) ve `legacy/src/lib/blog.server.ts`, `legacy/src/routes/api/blog*.ts`, `legacy/src/components/admin/BlogEditor.tsx`.

| Tablo | Canlı alanlar | Legacy davranışı (önemli olanlar) |
|---|---|---|
| `posts` | `id`, `slug` (UQ), `title`, `excerpt`, `content` (markdown), `coverImage?` (URL metni), `metaTitle?`, `metaDescription?`, `keywords?` (JSON dizi), `tableOfContents` (bool, varsayılan 1), `publishedAt?`, `status` (`draft/published/archived`), `category` (serbest metin, zorunlu), `tags?` (JSON), `readTime` (dk, zorunlu), `featured`, `views` (0008), `authorId` → `user.id` **ON DELETE CASCADE**, `createdAt`, `updatedAt` | Tek dilli. Yazar oturumdaki kullanıcı. Yayına geçişte `publishedAt` boşsa doldurulur. `views` her ziyarette okunup bir artırılarak yazılır (yarışlı). Markdown `@uiw/react-md-editor` ile istemcide çizilir; ham HTML içerebilir. |
| `author_profiles` | `id`, `userId` (UQ, cascade), `name`, `bio?`, `role?`, `avatarUrl?` (serbest URL), `socialLinks?` (JSON nesne), `createdAt`, `updatedAt` | `posts.authorId = author_profiles.userId` ile birleşir. Yazar sayfası yok; JSON-LD'deki `/author/{userId}` bağlantısı 404'e gidiyor. |
| `survey_responses` | `id`, `source`, `createdAt` | D6: soru onboarding'e taşındı. Faz 6 dokunmaz, rapor Faz 7'de. |

**URL'ler (canlı).** `/`, `/blog`, `/blog/{slug}`, `/faq`, `/contact`, `/ModelSnap` (sitemap'te `/modelsnap`), `/sitemap.xml`. Dil URL'de yok: legacy dili istemcide tarayıcıdan seçiyor, SSR her zaman İngilizce. Yasal sayfa yok. Yeni giriş/kayıt ekranları `/legal/privacy` ve `/legal/terms`'e bağlantı veriyor; ikisi bugün 404.

**R2.** Blog görselleri `blog/{yazı slug'ı ya da general}/{ad}` anahtarında, `/api/blog/image/{encodeURIComponent(key)}` ile `public, max-age=31536000, immutable` veriliyor. Yazı içerikleri ve `coverImage` bu URL'leri barındırıyor. Silme işçisi `blog/` önekine dokunmuyor (09 §5.3, `storageCleanup.ts`).

### 1.2 URL şeması

**Karar.**

| Sayfa | `en` | Diğer diller (`tr`, `de`, `es`, `fr`) |
|---|---|---|
| Landing | `/` | `/tr` |
| Blog listesi | `/blog`, `/blog/page/2` | `/tr/blog`, `/tr/blog/page/2` |
| Yazı | `/blog/{slug}` | `/tr/blog/{dile özgü slug}` |
| Yazar | `/authors/{slug}` | `/tr/authors/{slug}` |
| Fiyatlandırma, SSS, iletişim | `/pricing`, `/faq`, `/contact` | `/tr/pricing` … |
| Yasal | `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/subprocessors` | `/tr/legal/...`; `kvkk` yalnız `/tr/legal/kvkk` |
| RSS | `/blog/rss.xml` | `/tr/blog/rss.xml` |
| Sitemap, robots, llms | `/sitemap.xml` (dizin), `/sitemaps/{locale}.xml`, `/robots.txt`, `/llms.txt` | aynı dosyalar |

- **D9 sınırı.** Tablodaki blog, yazar ve RSS satırlarının `en` dışı sütunu bugün kapalıdır: kodda tek liste `blogLocales = ['en']`. Listede olmayan dilde bu rotalar 404 döner, sitemap'e ve hreflang'e girmez, `publishTranslation` o dil için `PublishBlocked` döner (taslak kaydedilebilir). Dil başına blog sayfaları K14 cevabıyla açılır. Landing, fiyatlandırma, SSS, iletişim ve yasal sayfalar D9'un dışındadır ve 5 dilde çalışır.
- Rota parçaları her dilde İngilizce kalır; yalnız yazı slug'ı dile özgüdür (D3). `/en/...` → `/...` 301. Sondaki `/` → `/` olmayan sürüme 301. Büyük harfli dil öneki (`/TR`) 404.
- TanStack Router'da isteğe bağlı parametre: `src/routes/{-$locale}/...`. `params.parse` yalnız `tr|de|es|fr` kabul eder, `en` 301'e, diğeri 404'e gider. Statik rotalar (`/app`, `/s/...`, `/sign-in`) parametreli rotadan önce eşleşir. 6a'da rota sıralama testiyle doğrulanır.
- Pazarlama sayfaları arası bağlantılar `reloadDocument` ile tam sayfa gezinmesidir. İstemci router'ı pazarlamada sunucu fonksiyonu çağırmaz; her gezinme edge cache'ten gelir.
- **Gerekçe.** Canlı blog URL'leri ve Search Console kaydı aynen kalır, hiçbir yazı için yönlendirme gerekmez. Dil başına çevrilmiş rota parçaları (`/tr/fiyatlandirma`) her rotayı beş kez tanımlamayı ve temizleme listesini büyütmeyi gerektirir, SEO kazancı küçüktür.
- **Alternatif.** Her dil önekli (`/en/blog/x`): tüm legacy URL'ler 301 olur. Reddedildi. Alt alan adı (`tr.viz-cad.com`): ayrı sertifika ve çerez kapsamı, reddedildi.
- **Dil seçimi.** Otomatik yönlendirme yok: `Accept-Language`'a göre yönlendirmek önbellek anahtarını böler ve tarayıcıları (çoğu `en-US`) yanıltır. Üst çubukta ve alt bilgide dil seçici var. Seçici, aynı sayfanın o dildeki URL'sine gider; sayfa o dilde yoksa o dilin ana sayfasına. Uygulama içi dil tercihi (`vizcad_locale`) ayrıdır ve URL'yi etkilemez (K2).

### 1.3 Yeni tablolar

Migration `0016_cms` (5b `0015_viewer`'ı alıyor; numara birleştirme sırasına göre). Tümü yeni tablo ya da legacy tabloda izinli işlem (§1.4). Zaman damgaları mevcut şemadaki gibi `integer` ve **Unix saniyesi**dir: Drizzle `mode: "timestamp"` saniye yazar, şemada `timestamp_ms` hiç yok. Birim sütun sütun:

- Legacy, saniye: `posts.publishedAt`, `posts.createdAt`, `posts.updatedAt`, `author_profiles.createdAt`, `author_profiles.updatedAt`, `user.*`. Legacy bunları Drizzle üzerinden `new Date()` ile yazdı, yani saniye.
- Yeni, saniye (aynı `mode: "timestamp"`): `post_translations.publishedAt/updatedAt`, `post_drafts.updatedAt`, `post_slug_redirects.createdAt`, `author_translations.updatedAt`, `site_texts.updatedAt/publishedAt`, `page_seo.updatedAt/publishedAt`, `cms_assets.createdAt`, `legal_documents.effectiveAt/publishedAt/createdAt`, `legal_acceptances.acceptedAt`, `cache_purges.createdAt/notBefore`, `contact_messages.createdAt/emailedAt`, `site_settings.updatedAt`.
- Drizzle sütunu üzerinden okuyan kod `Date` alır. Ham SQL'e bağlanan her değer (migration, `materializeLegacyTranslations`, cron eşikleri, `--source-wins` karşılaştırması, `notBefore`) tek yardımcıdan geçer: `toUnixSeconds(date) = Math.floor(date.getTime() / 1000)`. `Date.now()` ham SQL'e hiç doğrudan bağlanmaz.
- Saniye çözünürlüğünde aynı saniyedeki iki yazım `>` karşılaştırmasında eşit sayılır: `--source-wins` o satırı güncellemez ve raporda ayrıca listeler.
 `locale` sütunlarında `CHECK (locale IN ('en','tr','de','es','fr'))`.

**`post_translations`** (yayındaki çeviri, dil başına bir satır)

| Sütun | Not |
|---|---|
| `postId` → `posts.id` ON DELETE CASCADE, `locale` | PK (`postId`, `locale`) |
| `slug` | `UNIQUE (locale, slug)`. Biçim §4.2 |
| `title`, `excerpt` | Zorunlu. Başlık ≤ 120, özet ≤ 300 |
| `contentMd` | Kaynak markdown, ≤ 200 KB |
| `contentHtml` | Kayıtta sunucuda üretilmiş güvenli HTML (§4.3). SSR yalnız bunu basar |
| `toc` | JSON: `[{ depth, id, text }]`, kayıtta üretilir |
| `readTimeMin` | Kayıtta hesaplanır (dil başına kelime hızı) |
| `metaTitle?`, `metaDescription?`, `keywords?` (JSON) | Boşsa başlık ve özet kullanılır |
| `coverAlt?` | Kapak görselinin bu dildeki alt metni |
| `ogAssetId?` → `cms_assets.id` ON DELETE SET NULL | Kapaktan farklı OG görseli istenirse |
| `publishedAt`, `updatedAt`, `updatedByUserId` → `user.id` SET NULL | `publishedAt` bu dilin ilk yayını; `updatedAt` son yayın |

**`post_drafts`** (çalışma kopyası). `post_translations` ile aynı içerik sütunları (`contentHtml`/`toc` yok, önizlemede üretilir) + `revision INTEGER NOT NULL`, `updatedAt`, `updatedByUserId`. PK (`postId`, `locale`). Yayın taslağı `post_translations`'a kopyalar ve taslak satırını siler. Yayındaki yazıyı düzenlemek canlı sayfayı değiştirmez.

**`post_slug_redirects`**: `locale`, `slug`, `postId` → `posts.id` CASCADE, `createdAt`. PK (`locale`, `slug`). Slug değişince eskisi buraya yazılır; eski URL 301 ile yeniye gider. Aynı slug yeni bir yazıya verilirse yönlendirme satırı silinir (yayın batch'inde).

**`author_translations`**: `authorId` → `author_profiles.id` CASCADE, `locale`, `bio?` (≤ 600), `jobTitle?` (≤ 80), `updatedAt`. PK (`authorId`, `locale`). `en` satırı yoksa legacy `bio` ve `role` okunur.

**`site_texts`**: `key`, `locale`, `value?`, `draftValue?`, `updatedAt`, `updatedByUserId`, `publishedAt?`. PK (`key`, `locale`). Anahtar kod kaydında olmalı (§5.1). `value` yayında olan, `draftValue` yayınlanmamış değişiklik.

**`page_seo`**: `pageKey`, `locale`, `title?`, `description?`, `ogAssetId?`, aynı üç alanın `draft*` karşılıkları, `live INTEGER NOT NULL DEFAULT 0`, `updatedAt`, `updatedByUserId`, `publishedAt?`. PK (`pageKey`, `locale`). `pageKey` kod kaydında olmalı. `live = 1` o sayfanın o dilde yayında (dizine açık) olduğunu söyler (§6.2).

**`cms_assets`**: `id` (ULID), `r2Key` UQ, `mime` (`image/webp|png|jpeg|gif|avif`), `bytes`, `width`, `height`, `sha256` UQ (aynı dosya ikinci kez yüklenmez), `variants` (JSON: `{ "800": "<r2Key>" }`), `alt?` (varsayılan, İngilizce), `createdAt`, `createdByUserId`. R2 anahtarı `blog/a/{id}.{ext}`, varyant `blog/a/{id}-800.webp`. `blog/` öneki silme işçisinin korunan öneki olarak kalır.

**`legal_documents`**: `id`, `kind` (`privacy`, `terms`, `cookies`, `subprocessors`, `kvkk`), `locale`, `version INTEGER`, `title`, `contentMd`, `contentHtml`, `changeSummary?`, `effectiveAt`, `publishedAt?`, `createdAt`, `createdByUserId`. `UNIQUE (kind, locale, version)`. Yayınlanmış satır değişmez: `BEFORE UPDATE … WHEN OLD.publishedAt IS NOT NULL` ve `BEFORE DELETE` aynı koşulla `RAISE(ABORT)`. Yeni metin yeni sürümdür.

**`legal_acceptances`**: `userId` → `user.id` CASCADE, `kind`, `version`, `locale`, `acceptedAt`. PK (`userId`, `kind`, `version`). Kayıtta `terms` ve `privacy` için yazılır (§8.3).

**`cache_purges`** (temizleme kuyruğu, `storage_deletions` kalıbı): `id` PK, `kind` (`url` \| `host`), `target` (URL ya da hostname), `reason`, `createdAt`, `notBefore`, `attempts`, `lastError?`. `UNIQUE (kind, target, notBefore)`, ekleme `ON CONFLICT DO NOTHING`. İndeks `(notBefore)`. Aynı hedef hem hemen hem 60 s sonra temizlensin diye iki satır taşıyabilir (§7.4).

**`contact_messages`**: `id`, `name` (≤ 80), `email`, `company?` (≤ 120), `message` (≤ 4000), `locale`, `createdAt`, `emailedAt?`, `emailAttempts INTEGER NOT NULL DEFAULT 0`. IP ve tarayıcı bilgisi yok (hız sınırı DO'da tutulur). 365 günde silinir (günlük cron).

**`site_settings`**: `key` PK, `value` (JSON), `updatedAt`, `updatedByUserId`. Anahtarlar kodda tipli: `organization.legalName`, `organization.sameAs` (URL dizisi), `organization.logoAssetId`, `contact.recipient`, `defaultOg.{locale}`, `legal.controller` (veri sorumlusu adı, adresi, iletişim). Değerler `Schema` ile çözülür.

### 1.4 Legacy tablolarda değişiklik (yalnız izinli işlemler)

| Tablo | İşlem | NULL yedek anlamı / not |
|---|---|---|
| `posts` | `ADD COLUMN revision INTEGER` | NULL = 0. Yazı düzeyindeki alanlarda (kategori, etiketler, yazar, kapak, öne çıkan) iyimser kilit |
| `posts` | `ADD COLUMN coverAssetId TEXT REFERENCES cms_assets(id) ON DELETE SET NULL` | NULL: `coverImage` URL'si kullanılır (legacy) |
| `posts` | `ADD COLUMN updatedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL` | NULL: "bilinmiyor" |
| `author_profiles` | `ADD COLUMN slug TEXT` + `CREATE UNIQUE INDEX author_profiles_slug_uq ON author_profiles(slug)` | NULL: yazar sayfası yok, `Person` JSON-LD'de `url` atlanır. Yeni sütun tamamen NULL olduğu için benzersiz indeks legacy veride çakışmaz |
| `author_profiles` | `ADD COLUMN avatarAssetId TEXT REFERENCES cms_assets(id) ON DELETE SET NULL` | NULL: `avatarUrl` kullanılır, o da yoksa baş harfler |
| `user` | `CREATE TRIGGER user_delete_guard_author BEFORE DELETE ON user WHEN EXISTS (SELECT 1 FROM posts WHERE authorId = OLD.id) BEGIN SELECT RAISE(ABORT, 'author_has_posts'); END` | Legacy admin panelinden yazar silinirse işlem hata verir. İstenen davranış budur: yazılar sessizce silinmez |
| `account` | `CREATE TRIGGER account_delete_guard_author BEFORE DELETE ON account WHEN EXISTS (SELECT 1 FROM posts WHERE authorId = OLD.userId) BEGIN SELECT RAISE(ABORT, 'author_has_posts'); END` | better-auth 1.4.7 `internalAdapter.deleteUser` (legacy `admin.removeUser` da bunu çağırır) sırayla `session`, `account`, `user` siler, transaction yok. `account` korunmazsa yazarın giriş yöntemleri silinir, `user` satırı kalır. Bu trigger'la yalnız oturumlar silinir (kullanıcı çıkış yapmış olur), hesap ve kullanıcı yerinde kalır. Yan etki: yazar bir giriş yöntemini (ör. Google bağlantısı) kaldıramaz; yazarlar yalnız platform adminleri olduğu için kabul edilir |
| indeksler | `post_translations(locale, publishedAt DESC)`, `posts(status, publishedAt)` (benzersiz değil) | Liste ve sitemap sorguları |

**Yeni kodda silme.** Rewrite'ta `deleteUser` kapalı (`authOptions.ts`, 08 §2). Faz 7'nin hesap silme akışı SDK'yı çağırmadan önce `posts` sorgular ve yazısı olan kullanıcıyı `AuthorHasPosts` (409) ile reddeder: "Önce yazılarını başka bir yazara devret." Trigger'lar ikinci kat ve legacy yolu içindir.

`scripts/check-migrations.ts` değişmez; `0016` onun izin listesinden geçmelidir (`UPDATE`, `DELETE`, `INSERT … SELECT` kopyası migration'da yok). Ek test: 0016 uygulandıktan sonra legacy'nin yazdığı her `posts`/`author_profiles` şekli hâlâ başarılı. Legacy `POST /api/blog` gövdeyi aynen yazdığı için fixture yeni sütunları **içermeyen** satırla koşar. Trigger testi gerçek silme sırasıyla koşar: memory D1 üzerinde kurulan better-auth (`Auth.init.test` kalıbı) `internalAdapter.deleteUser` ile yazarı siler. Beklenen: hata, `user` ve `account` satırları yerinde, `posts` yerinde. Yazısı olmayan kullanıcıda üç tablo da temizlenir. Ayrıca `account` satırını tek başına silmek de yazar için reddedilir.

### 1.5 Mevcut yazıların `en` çevirisine geçişi

**Karar.** Kopya migration'da değil, cutover'da yapılır. O zamana kadar okuma tarafında bir yedek kural çalışır.

1. **Okuma yedeği yok.** Genel programlar yalnız `post_translations`'tan okur. `en` satırı olmayan yazı genel tarafta yoktur (404). Böylece genel istek hiçbir zaman markdown çevirmez (§7.5). Staging'de legacy biçimli örnek yazılar yüklendikten hemen sonra aynı script staging D1'e karşı koşar; production'da cutover'da, trafik yeni Worker'a geçmeden önce. Cutover kapısı: yayındaki `posts` sayısı = `en` çeviri satırı sayısı, değilse geçiş durur.
2. **Cutover adımı (`materializeLegacyTranslations`, script).** Yazımlar dondurulmuşken, production kopyasında provadan sonra koşar (08 §3 sırasının içinde): her yazı için `INSERT … ON CONFLICT (postId, locale) DO NOTHING` ile `en` satırı yazılır, `contentHtml`/`toc`/`readTimeMin` §4.3 çeviricisinden üretilir. İdempotent. Sonuç raporu: yazı sayısı, kopyalanan satır, ham HTML içeren yazılar (§4.3, kaçışlanan etiketlerin listesi), kuraldışı slug'lar. Rapor kullanıcıya gösterilir; ham HTML'li yazı varsa yayına ayrı onay gelir.
3. **Ayna kuralı.** Cutover'dan sonra admin `en` çevirisini yayınladığında aynı `db.batch` içinde `posts.slug/title/excerpt/content/metaTitle/metaDescription/keywords/readTime/status/publishedAt/updatedAt` da yazılır. `updatePostMeta` kapak değiştirince `posts.coverImage` da `/api/blog/image/{encodeURIComponent(r2Key)}` olarak yazılır; kapak kaldırılınca `NULL`. Yeni yazı oluşturmak da `posts`'un zorunlu legacy sütunlarını doldurur (`category` boşsa `general`, `slug` geçici `draft-{postId}`, gerçek slug'ı rezerve etmez). Böylece eski Worker sürümüne geri dönüşte (Faz 9 geri dönüş planı) blog, kapaklar ve içerik görselleri çalışır: içerik görselleri zaten legacy URL biçimindedir (§7.3).
   - **Slug denetimi.** `posts.slug` legacy'de tablo genelinde `UNIQUE`. `en` slug'ı yayında yalnız `post_translations(en)` ile değil, diğer yazıların `posts.slug` değeriyle de karşılaştırılır (taslaklar ve `en` satırı olmayan legacy yazılar dahil). Çakışma `SlugConflict` döner; denetim olmasa batch `UNIQUE` hatasıyla `DbError` olurdu.
4. **Geri dönüşten sonra yeniden ileri.** Legacy geri dönüş sırasında `posts`'u değiştirdiyse, `materializeLegacyTranslations --source-wins` yalnız `posts.updatedAt > post_translations.updatedAt` olan `en` satırlarını günceller. Aynı script, ayrı bayrak.
5. **Yazarlar.** `author_profiles.slug` cutover adımında addan üretilir (§4.2, çakışmada `-2`). `bio`/`role` `en` yedeği olarak okunur; ayna kuralı yazarda da geçerli.

- **Gerekçe.** `0016` cutover'dan önce production'a uygulanabilir (09 §1.3). Migration içinde kopya, legacy'nin sonradan yazdığı yazıları kaçırır ve iki kaynak oluşturur. Script tek ve idempotenttir; Node'da koştuğu için uzun yazının çevirisi Worker CPU sınırına takılmaz. Yeni Worker production'a cutover'dan önce hizmet vermediği için okuma yedeğine gerek yoktur.
- **Alternatif.** `posts`'a dil sütunları eklemek ya da `posts`'u yeniden oluşturmak. İlki tabloyu şişirir; ikincisi yasak (`__new_` kopya, 08 §3).

## 2. Görünürlük kuralları

- Bir yazı `L` dilinde yayındadır: `posts.status = 'published'` **ve** `post_translations(post, L)` var **ve** (`L = 'en'` ya da `en` de yayında). `en` yayında değilse hiçbir dil yayında olamaz (K3). Böylece `x-default` her zaman vardır ve ayna kuralı tutarlı kalır.
- `en` yayından kaldırılınca `posts.status = 'draft'` olur, tüm dillerin URL'leri 404 döner.
- **Arşiv:** `posts.status = 'archived'` → tüm dillerin URL'leri **410** döner, sitemap ve listelerden çıkar. Arşivden çıkarılınca eski hâline döner.
- Taslak hiçbir genel uçta görünmez. Önizleme yalnız admin rotasında (§7.2).
- Bir sayfa (`pageKey`) `L` dilinde dizine açıktır: `page_seo(pageKey, L).live = 1`. `en` her zaman açık. Kapalı dilde sayfa yine çizilir (İngilizce yedek metinlerle), ama canonical `en` sürümünü gösterir, hreflang listesinde ve sitemap'te yer almaz (§6.2).

## 3. Programlar, uçlar ve servisler

### 3.1 Genel (önbellekli SSR, oturumsuz)

`src/server/programs/cms/public.ts`. Route loader'ları `createServerFn` üzerinden `#/server/http/entry.cms`'i dinamik `import()` ile yükler (CLAUDE.md kuralı). Her program sayfa başına en çok 3 D1 sorgusu yapar (`db.batch` ile tek gidiş). Free planda çağrı başına 50 D1 sorgusu sınırı var.

| Program | Girdi → çıktı | Hata etiketleri |
|---|---|---|
| `getPublicPage` | `pageKey, locale` → `{ texts, seo, alternates, canonical, live }` | `PageUnavailable` |
| `listPublicPosts` | `locale, page` → `{ cards, total, alternates }` (12 kart/sayfa, öne çıkan en üstte) | `PageUnavailable` (sayfa aralık dışı) |
| `getPublicPost` | `locale, slug` → `PostView` \| `Redirect(url)` | `PostUnavailable` (404), `PostGone` (410) |
| `getPublicAuthor` | `locale, slug` → `{ author, posts, alternates }` | `AuthorUnavailable` |
| `getLegalDocument` | `kind, locale` → en güncel yayınlanmış sürüm (+ sürüm listesi) | `LegalUnavailable` |
| `buildSitemapIndex`, `buildSitemap(locale)` | → XML | — |
| `buildRss(locale)` | → RSS 2.0 (son 20 yazı) | — |
| `buildLlmsTxt` | → metin | — |
| `buildRobotsTxt` | `appEnv` → metin | — |
| `submitContactMessage` | `name, email, company?, message, locale, turnstileToken` → `void`. `name` ve `email` CR/LF içeremez (`email` `Reply-To` başlığına girer), `Schema` reddeder | `CaptchaFailed`, `RateLimitExceeded`, `ValidationError`, `EmailError` (mesaj yine kaydedilir, `emailedAt` boş kalır, saatlik cron çalışma başına en çok 5 mesajı yeniden dener; `emailAttempts` 5'e ulaşınca durur ve Ayarlar ekranında "N mesaj iletilemedi" görünür) |

`PostView` = başlık, özet, `contentHtml`, `toc`, okuma süresi, kapak (URL, boyut, alt), yazar (ad, slug, görsel, bio, unvan), tarih, kategori, ilgili yazılar (aynı dilde, kategori + etiket puanı, legacy algoritması, en çok 3), `alternates` (yayında olan diller ve URL'leri). İlgili yazılar yayında hesaplanmaz; liste küçük olduğu için sorguda sıralanır.

### 3.2 Admin (yalnız platform admini)

`POST /api/cms/<operation>` dağıtıcısı (`http/cms.ts`, `entry.cms.ts`). `/api/app` ile aynı katmanlar: CSRF (`http/csrf.ts`), oturum, hız sınırı (`cmsWrite`), `Schema`, `private, no-store`. Ek olarak `requirePlatformAdmin`: oturum özetine `platformRole` (`user.role = 'admin'`, better-auth admin eklentisinin legacy alanı) eklenir; karar `permissions.ts`'te `canManageContent(session)` olarak tek yerde durur: `platformRole = 'admin'` **ve** `accountStatus = 'active'` (askıya alınmış değil) **ve** `emailVerified`. Üçü de `SessionSummary`'de var. Biri eksikse 403 `PermissionDenied`, oturum yoksa 401. Test üç koşulun her birini ayrı ayrı düşürür.

| Program | Girdi → çıktı | Hata etiketleri (ortak `DbError`, `ValidationError`, `RateLimitExceeded`, `PermissionDenied` hariç) |
|---|---|---|
| `listPostsAdmin` | `status?, missingLocale?, q?, cursor` → satırlar (dil kapsaması, taslak var mı, görüntülenme) | — |
| `getPostAdmin` | `postId` → yazı + her dil için yayın ve taslak | `PostUnavailable` |
| `createPost` | `title` (en) → `postId` | — |
| `saveDraft` | `postId, locale, fields, revision` → `{ revision }` | `PostUnavailable`, `ContentConflict` (409) |
| `updatePostMeta` | `postId, category, tags, authorId, coverAssetId, featured, revision` | `ContentConflict`, `AuthorUnavailable`, `AssetUnavailable` |
| `previewDraft` | `postId, locale` → `PostView` (taslaktan) | `PostUnavailable` |
| `publishTranslation` | `postId, locale, revision` → `{ urls, purge }` | `ContentConflict`, `SlugConflict` (409), `PublishBlocked` (422: `en` yayında değil, zorunlu alan eksik) |
| `unpublishTranslation` | `postId, locale` → `{ urls, purge }` | `PublishBlocked` (`en` kaldırılırken diğer diller yayındaysa onay bayrağı ister) |
| `archivePost`, `restorePost` | `postId` → `{ urls, purge }` | — |
| `deletePost` | `postId` → `void`, yalnız hiç yayınlanmamış yazı | `PublishBlocked` |
| `listAuthors`, `saveAuthor`, `saveAuthorTranslation` | yazar alanları, `userId` | `AuthorUnavailable`, `SlugConflict` |
| `listSiteTexts` | `pageKey?, locale, missingOnly?` → anahtar, kod varsayılanı, yayındaki, taslak, sınır | — |
| `saveTextDrafts` | `[{ key, locale, draftValue }]` (≤ 200) | `UnknownTextKey`, `TextTooLong`, `PlaceholderMismatch` (422) |
| `publishTexts`, `discardTextDrafts` | `pageKey \| 'shared', locale` → `{ urls, purge }` | — |
| `listPages`, `savePageSeoDraft`, `publishPageSeo` | `pageKey, locale, title, description, ogAssetId` | `UnknownPage`, `TextTooLong` |
| `setPageLive` | `pageKey, locale, live` → `{ urls, purge }` | `TranslationIncomplete` (422, eksik anahtarlar listesiyle) |
| `listLegal`, `createLegalDraft`, `saveLegalDraft`, `publishLegal` | `kind, locale, contentMd, effectiveAt, changeSummary` | `LegalImmutable` (409), `LegalUnavailable` |
| `listAssets`, `updateAssetAlt`, `deleteAsset` | — | `AssetInUse` (409). Kullanım denetimi şunları tarar: `post_translations` ve `post_drafts` (`contentMd`, `ogAssetId`), `legal_documents` (her sürümün `contentMd`'si), `page_seo` (`ogAssetId`, `draftOgAssetId`), `posts` (`coverAssetId` ve legacy `content`, `coverImage` metni), `author_profiles.avatarAssetId`, `site_settings` (`logoAssetId`, `defaultOg.*`). Metin sütunlarında hem kodlanmış URL'ye hem ham anahtara bakılır; varyant anahtarları da sayılır |
| `getSettings`, `saveSettings` | §1.3 `site_settings` anahtarları | `ValidationError` |
| `listPurges`, `drainPurges`, `purgeUrls` | — / `limit` / `urls` (yalnız kendi hostumuz) | `CacheError` |

**Yayın batch'i.** Her yayın tek `db.batch`: içerik satırları, (dil `en` ise) `posts` aynası, slug yönlendirmesi, `cache_purges` satırları (etkilenen URL'ler). Batch'ten sonra temizleme hemen denenir (§7.4). D1 yazısı temizlemeden önce gelir; temizleme başarısızsa içerik yine yayındadır, kuyrukta bekleyen URL'ler admin ekranında görünür.

**İkili uçlar.**

| Uç | Kim | Ne yapar |
|---|---|---|
| `POST /api/cms/assets` | platform admini, CSRF | Gövde ≤ 5 MB görsel (istemci önceden küçültür, §7.3). Sihirli baytlar (PNG, JPEG, WebP, GIF, AVIF), boyut başlıktan okunur (≤ 4096 px), SHA-256 ile tekilleştirme. SVG ve diğer türler 415. R2'ye `put` (`httpMetadata.contentType` doğru MIME ile), sonra `cms_assets` satırı. Varyant ikinci istekle (`?variant=800&of={id}`) |
| `GET /api/blog/image/{key}` | herkes | **Tek görsel ucu**, eski ve yeni görseller için. Yalnız `blog/` öneki, R2 akışı, `public, max-age=31536000, immutable`, `nosniff`, `Content-Security-Policy: sandbox`, MIME R2 `httpMetadata.contentType`'tan (legacy uç da buradan okur; yükleme bunu yazar). Yalnız GET. Ayrı bir `/media/...` ucu yok: legacy Worker onu tanımaz ve geri dönüşte görseller kırılırdı |
| `POST /api/contact` | herkes | CSRF (Origin), Turnstile (`contact` eylemi), hız sınırı (IP başına saatte 5), `Schema` |

**Yeni tagged error'lar ve durumlar** (`respond.ts` `STATUS`, tam eşleme): `PageUnavailable` 404, `PostUnavailable` 404, `PostGone` 410, `AuthorUnavailable` 404, `LegalUnavailable` 404, `AssetUnavailable` 404, `UnknownPage` 404, `ContentConflict` 409, `SlugConflict` 409, `AssetInUse` 409, `LegalImmutable` 409, `PublishBlocked` 422, `TranslationIncomplete` 422, `UnknownTextKey` 422, `TextTooLong` 422, `PlaceholderMismatch` 422, `InvalidAsset` 422. `CacheError` admin uçlarında 502 olarak döner, genel sayfalarda hiç dönmez.

### 3.3 Servisler

| Servis | Faz 6'daki rolü | Değişiklik |
|---|---|---|
| `Db` | tüm tablolar | yok. `Db.memory` 0016 dahil tüm migration'larla |
| `Storage` | `blog/` görselleri: `put`, `get`, `head` | yok |
| `Cache` | yayında temizleme (`purge`, yeni `purgeHost`) | yapılandırma yoksa `CacheError` (kural 2). `purge` URL listesini, `purgeHost` hostname'i yalnız `siteUrl` hostuyla kabul eder. Yerel `cache.delete` kalkar, çağrı başına 100 URL (§7.4) |
| `EdgeCache` (yeni, **Effect'siz**) | isabet yolu: `match`, `put`, anahtar (`BUILD_ID` ekiyle), `sanitizeForSsr` | `services/EdgeCache.ts`. `D1Health` gibi bilinçli istisna (CLAUDE.md'ye eklenir): isabette Effect, Drizzle ve router yüklenmez |
| `AppConfig` | `siteUrl`, `appEnv`, `cachePurge`, `turnstile` | ek: `contactRecipient` (yoksa iletişim formu `ConfigError` ile kapalı) |
| `Auth` | oturum özeti | `SessionSummary.platformRole` (`'admin' \| 'user'`), aynı sorgudan |
| `Email` | iletişim mesajı | şablon `emails/contact.ts` (düz metin, kullanıcı girdisi kaçışlı, `Reply-To` gönderen) |
| `Turnstile`, `RateLimit` | iletişim, görsel yükleme, admin yazımları | yeni eylemler: `contact`, `cmsWrite`, `cmsAsset` |

Markdown çeviricisi, slug, metin çözümleyici, SEO kurucuları ve `affectedUrls` saf modüllerdir (`src/server/cms/*.ts`, `src/shared/seo/*.ts`), servis değildir. `Entitlements` ve `Billing` CMS'e girmez (D2: CMS workspace bilmez).

## 4. İçerik işleme

### 4.1 Editör ve biçim

**Karar.** Kaynak biçim markdown (GFM: tablo, görev listesi, üstü çizili) olarak kalır. Admin editörü CodeMirror 6 (markdown modu), `/admin/cms` chunk'ında tembel yüklenir. Önizleme sunucudaki aynı çeviricinin çıktısıdır (`previewDraft`), istemcide ayrı çevirici yok.

- **Gerekçe.** Legacy içerik markdown. Tek çevirici, önizleme ile yayının farklı görünmesini engeller. `@uiw/react-md-editor` hem ağır hem de yayın sayfasına da giriyordu (legacy `blog.$slug.tsx` editör paketini okuyucuya yüklüyordu).
- **Alternatif.** Blok editör (TipTap/Lexical) ve JSON içerik: legacy içeriği dönüştürme gerektirir, reddedildi.

### 4.2 Slug

`^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 96 karakter. Başlıktan üretilir: küçük harf, Türkçe/Almanca/İspanyolca/Fransızca harf eşlemesi (`ı→i`, `ğ→g`, `ş→s`, `ç→c`, `ö→o`, `ü→u`, `ß→ss`, `ñ→n`, aksanlar düşer), diğer her şey `-`. Ayrılmış: `page`, `rss.xml`. Legacy slug kurala uymasa da okunur ve değiştirilmedikçe korunur. Değişen slug `post_slug_redirects`'e yazılır.

### 4.3 Güvenli çeviri (`renderMarkdown`)

**Karar.** `mdast-util-from-markdown` + `micromark-extension-gfm`/`mdast-util-gfm` ile sözdizimi ağacı, ağaç üzerinde son işlem, sonra `mdast-util-to-hast` (ham HTML **kapalı**: HTML düğümleri kaçışlanmış metin olur) ve `hast-util-to-html`. Son işlem (dizgi üzerinde değil, ağaçta):

- Başlıklara `id` (slug kuralı, sayfa içinde tekil) ve `toc` çıkarımı (h2–h3).
- Bağlantılar: yalnız `https:`, `mailto:` ve göreli. Dış bağlantıya `rel="noopener"`; `nofollow` yok (editoryal içerik).
- Görseller: yalnız `/api/blog/image/...` ya da `https://viz-cad.com/...`. Diğer görsel adresi metin bağlantısına çevrilir ve kayıtta uyarı döner. `loading="lazy"`, `decoding="async"`, `cms_assets`'ten (URL'deki anahtar çözülüp `r2Key` ile) bilinen `width`/`height` (CLS), varyant varsa `srcset`.
- Kod blokları: sözdizimi renklendirmesi yok (ilk sürüm), `<pre><code class="language-x">`.
- Okuma süresi: kelime / dil hızı (en 230, tr 190, de 200, es 220, fr 210 kelime/dk), en az 1.

`contentHtml` kayıtta üretilir, SSR hiç markdown çevirmez (Free plan CPU, §7.5). Çevirici saftır ve sabit girdide sabit çıktı verir (test). Legacy içerikte ham HTML varsa kaçışlanmış metin olarak görünür; cutover raporu bunları listeler (§1.5 adım 2).

- **Gerekçe.** Admin tek yazar olsa da oturumu çalınan bir admin hesabının tüm ziyaretçilere betik basması kabul edilemez. HTML'i kapatmak ayrı bir temizleyici (DOMPurify, sanitize-html) çalıştırmaktan hem daha güvenli hem Worker'da daha ucuzdur.
- **Alternatif.** `marked` + `sanitize-html`: iki kütüphane, temizleyici Worker'da CPU harcar. Reddedildi. Çeviri yalnız önizlemede, yayında (admin isteği) ve cutover script'inde çalışır; genel sayfa isteğinde hiç çalışmaz (§1.5). Admin isteğindeki maliyet 6a CPU kapısıyla ölçülür (§7.5).

## 5. Site metinleri

### 5.1 Kayıt (kodda, tipli)

`src/i18n/marketing.ts`: CMS'ten değiştirilebilen her anahtar burada İngilizce varsayılanıyla tanımlıdır. Her anahtarın kaydında `page` (`landing`, `pricing`, `faq`, `contact`, `blog`, `legal`, `shared` = üst çubuk ve alt bilgi), `maxLength` ve izinli parametreler (`{count}`) vardır. Anahtar adı tipli olduğu için yazım hatası derleme hatasıdır (D3). Kodda Türkçe çeviri de bulunabilir (mevcut `app.ts`/`files.ts` kalıbı).

SSS ilk sürümde sabit bir anahtar listesidir (`faq.items` = kodda sıralı kimlikler, her biri `faq.{id}.q` ve `faq.{id}.a`). Admin metni değiştirir; soru eklemek kod değişikliğidir. Bir dilde sorusu boş kalan madde o dilde gizlenir.

**Kapsam (K4).** Yalnız genel sayfaların metinleri: landing, fiyatlandırma, SSS, iletişim, blog arayüzü, yasal sayfa kabuğu, üst çubuk ve alt bilgi, `llms.txt` özeti. Uygulama içi metinler (`auth.*`, `files.*`, `viewer.*`) kodda kalır.

### 5.2 Çözümleme sırası

`resolveText(key, locale)`: `site_texts[locale].value` → kod[`locale`] → `site_texts['en'].value` → kod[`en`]. Parametreli metinde parametre kümesi İngilizce varsayılanla aynı olmalıdır; değilse kayıt `PlaceholderMismatch` ile reddedilir. Metin düz metindir; HTML ve markdown yok. Bağlantı gereken yerler kodda bileşen olarak kurulur, metin yalnız etiketi verir.

Bir dilin metni İngilizce metinden eski kaldığında (`site_texts[en].publishedAt > site_texts[L].publishedAt`) admin tablosunda "İngilizce sonradan değişti" işareti çıkar.

### 5.3 Taslak ve yayın

Kayıt `draftValue`'ya yazar. "Yayınla" bir sayfa grubunun bir dildeki tüm taslaklarını tek batch'te `value`'ya taşır ve etkilenen URL'leri kuyruğa yazar. Önizleme (`/admin/cms/preview/page/{pageKey}/{locale}`) taslakları gösterir. Böylece birden çok değişiklik tek temizlemeyle yayınlanır.

## 6. SEO

### 6.1 Ortak `<head>` kurucusu

`src/shared/seo/head.ts` (saf, istemci ve sunucuda aynı). Route `head()` loader verisinden şunu üretir:

| Etiket | Kural |
|---|---|
| `<html lang>` | URL'deki dil. Kök belge SSR'da doğru `lang` ile çizilir (bugün istemcide ayarlanıyor) |
| `title` | `page_seo.title` → sayfa varsayılanı. Yazıda `metaTitle` → `title`, sonuna ` · VizCad Blog`. ≤ 60 karakter uyarısı adminde |
| `description` | `page_seo.description` / `metaDescription` → özet. ≤ 160 uyarısı |
| `canonical` | Mutlak, `siteUrl` + yol, sorgu dizgisi yok. Yayındaki dilde kendisi, kapalı dilde `en` sürümü |
| `alternate hreflang` | Yayında olan her dil için bir satır + `x-default` (`en`). Her sayfa kendini de listeler. Kapalı dil sayfası hiç hreflang basmaz |
| `robots` | Pazarlama: yok (varsayılan index). Uygulama rotaları, admin, önizleme, `/s/*`, giriş ekranları: `noindex, nofollow` meta **ve** `X-Robots-Tag` başlığı. Staging'de her yanıtta `X-Robots-Tag: noindex, nofollow` |
| Open Graph | `og:type` (`website` / `article`), `og:url` = canonical, `og:title`, `og:description`, `og:image` (mutlak, 1200×630, `og:image:width/height/alt`), `og:site_name`, `og:locale` (`en_US`, `tr_TR`, `de_DE`, `es_ES`, `fr_FR`) ve yayındaki diğer diller için `og:locale:alternate`. Yazıda `article:published_time`, `article:modified_time`, `article:author` (yazar sayfası URL'si), `article:section` |
| X | `twitter:card = summary_large_image`, `twitter:site` `site_settings`'ten |
| JSON-LD | §6.3 |

### 6.2 Kapalı dil sayfası ve yinelenen içerik

Bir sayfa `L` dilinde `live = 0` ise sayfa İngilizce yedekle çizilir: kullanıcı kırık sayfa görmez, ama arama motoru bunu `en` sürümünün kopyası olarak görür. Bu yüzden canonical `en`'i gösterir, sayfa hreflang'e ve sitemap'e girmez, iç bağlantılar (dil seçici hariç) bu sayfaya gitmez. `noindex` konmaz; canonical ile `noindex` birlikte çelişen sinyaldir.

`setPageLive(L, true)` sayfanın tüm zorunlu anahtarları `L` dilinde (D1 ya da kod) varsa geçer, yoksa eksik listesiyle `TranslationIncomplete`. Yazıda dilin varlığı zaten çeviri satırıdır; bu kural yalnız sayfalar içindir.

### 6.3 JSON-LD

`src/shared/seo/jsonld.ts`, her biri saf fonksiyon, `@id`'ler sabit (`{siteUrl}/#organization`, `{siteUrl}/#website`, `{yazar URL'si}#person`). Serileştirme `JSON.stringify` sonrası üç değiştirme: `<` → `\u003c`, `>` → `\u003e`, `&` → `\u0026` (altı karakterlik JSON Unicode kaçışları; çıktı geçerli JSON kalır ve `JSON.parse` aynı değeri verir). Test: başlığı `</script><script>alert(1)</script>` olan yazının çıktısında `</script` ve `<` hiç geçmez, `JSON.parse` başlığı aynen geri verir.

| Sayfa | Türler | Not |
|---|---|---|
| Landing | `Organization` (ad, `url`, `logo`, `sameAs`, `legalName` ayardan), `WebSite` (`inLanguage`, `publisher` → org), `SoftwareApplication` (`name`, `applicationCategory: BusinessApplication`, `operatingSystem: Web`, `url`) | `offers` yalnız Faz 8'de gerçek fiyat gelince. Uydurma `aggregateRating` hiçbir zaman yok |
| Fiyatlandırma | `SoftwareApplication` + `offers` (Faz 8) | Faz 6'da iskelet, `offers` yok |
| Yazı | `BlogPosting` (`headline`, `description`, `image` [1200 px genişlik], `datePublished`, `dateModified`, `inLanguage`, `author` → `Person` `@id`, `publisher` → org `@id`, `mainEntityOfPage`, `isPartOf` → `Blog`), `BreadcrumbList` (Ana sayfa › Blog › yazı) | Legacy kırıntıdaki `?category=` bağlantısı kalkar |
| Blog listesi | `Blog` (`blogPost`: sayfadaki yazılar, yalnız `@id` + `headline` + `url`) | |
| Yazar | `ProfilePage` + `mainEntity: Person` (`name`, `jobTitle`, `image`, `description`, `sameAs`, `url`) | D5 (E-E-A-T) |
| SSS | `FAQPage` | Google zengin sonucu bu tür siteler için 2023'ten beri göstermiyor; işaretleme yine geçerli, sohbet motorları okuyor. Vaat değil |
| Yasal | `BreadcrumbList` | |

### 6.4 Sitemap

- `/sitemap.xml` = sitemap dizini (Search Console'daki kayıtlı adres korunur) → `/sitemaps/{locale}.xml`, her dil için bir dosya.
- Her `<url>`: `loc`, gerçek `lastmod` (yazıda çevirinin `updatedAt`'i, sayfada `page_seo` ve sayfa metinlerinin en yeni `publishedAt`'i), ve yayındaki her dil + `x-default` için `xhtml:link rel="alternate" hreflang`. `changefreq`/`priority` yok (arama motorları yok sayıyor).
- Yalnız dizine açık URL'ler: yayındaki yazılar, `live` sayfalar, yazısı olan yazarlar, yasal sayfalar. Sayfalanmış blog listeleri (`/blog/page/2`) girmez.
- XML kaçışı (`&`, `<`, `'`, `"`) tek fonksiyonda. 50.000 URL sınırı uzak; tek dosyada kalır.

### 6.5 robots.txt

Kodda üretilir (`buildRobotsTxt`), statik `public/robots.txt` silinir.

- **Production:** `User-agent: *` → `Allow: /`, `Allow: /api/blog/image/`; `Disallow: /app`, `/admin`, `/api/`, `/s/`, `/dev/`, `/onboarding`, `/invite/`, `/guest-invite/`; `Sitemap: https://viz-cad.com/sitemap.xml`. Uygulama rotaları ayrıca `X-Robots-Tag: noindex` gönderir. Giriş/kayıt sayfaları taranabilir ama `noindex`. Blog görselleri `/api/` altında olduğu için `Allow: /api/blog/image/` şarttır; en uzun eşleşen kural kazandığından bu satır `Disallow: /api/`'yi o önek için geçersiz kılar, yoksa yazı görselleri ve OG görselleri taranmaz. Legacy dosyadaki `/src/`, `/node_modules/` gibi satırlar kalkar (öyle yollar yok).
- **Yapay zekâ tarayıcıları (K11):** GPTBot, ClaudeBot, PerplexityBot, Google-Extended için aynı kurallar: pazarlama ve blog açık, uygulama kapalı. Cloudflare zone'undaki "AI botlarını engelle" ve "Managed robots.txt" ayarları bu dosyanın önüne geçebilir; 6a'da salt okunur kontrol edilir, değişiklik kullanıcı onayıyla.
- **Staging:** `User-agent: *` → `Disallow: /` ve her yanıtta `X-Robots-Tag`. Statik dosyalar (Workers Static Assets) Worker'dan geçmez, bu yüzden staging build'i `dist/client/_headers` dosyasına `/*` → `X-Robots-Tag: noindex, nofollow` yazar. Production build bu dosyayı yazmaz (Vite eklentisi, `CLOUDFLARE_ENV`'e göre; `vite.config.ts`'teki mevcut ayrım). Test: staging build çıktısında `_headers` var ve bu satırı içeriyor, production çıktısında yok.

### 6.6 llms.txt

`/llms.txt`, llmstxt.org biçimi, İngilizce: `# VizCad`, `>` ile tek paragraf özet (`llms.summary` site metni), "Product" bölümünde landing, fiyatlandırma, SSS, yasal sayfaların bağlantıları ve tek satır açıklamaları, "Blog" bölümünde son 30 yayındaki `en` yazının başlık + URL + özeti, "Languages" bölümünde dil ana sayfaları. Yalnız gerçekten var olan özellikler (03 §6: olmayanı vaat etme). Yayında temizlenen URL listesinde. `llms-full.txt` ilk sürümde yok.

### 6.7 RSS

`/blog/rss.xml` ve `/{locale}/blog/rss.xml`, RSS 2.0, son 20 yazı, `description` = özet (tam içerik yok). Blog sayfalarının `<head>`'inde `alternate type="application/rss+xml"`.

### 6.8 OG görselleri

- **Karar.** Worker OG görseli üretmez. Sırayla: çevirinin `ogAssetId`'si → yazının kapağı (≥ 1200 px genişlik şartı, yoksa uyarı) → admin tarayıcısında şablondan üretilmiş kart → `site_settings.defaultOg.{locale}`.
- **Şablon kart:** yazı kaydedilirken kapak yoksa editör, `OffscreenCanvas` üzerinde 1200×630 kart çizer (logo, başlık, dil, marka rengi, Figtree; gradyan yok). WebP olarak `POST /api/cms/assets`'e yüklenir ve `ogAssetId` olur. Başlık değişince yeniden üretilir. Aynı kalıp sayfa SEO'sunda da var.
- **Gerekçe.** Satori + resvg WASM'ı Worker'da çalıştırmak Free plandaki 10 ms CPU sınırını aşar. Küçük resim ve GLB'de olduğu gibi üretimi tarayıcı yapar, sunucu doğrular (09, 11 kalıbı).
- **Alternatif.** Build anında her sayfaya PNG: içerik adminden değiştiği için build eskir (D4 ile aynı gerekçe). Reddedildi.

### 6.9 Yönlendirmeler (301)

| Eski | Yeni |
|---|---|
| `/ModelSnap`, `/modelsnap` | `/` (stüdyo Çıktı sekmesi taşınmadı, D15; K12) |
| `/author/{userId}` (legacy JSON-LD'deki ölü bağlantı) | `/authors/{slug}` ya da `/blog` |
| `/en/...` | önek olmadan |
| `/dashboard` | `/app` |
| `/file/{id}` | `/app/files/{id}` (yeni dosya rotası `src/routes/app.files.$id.tsx`) |
| `/login` | `/sign-in` (sorgu atılır) |
| `/signup` | `/sign-up` (sorgu atılır; legacy davet e-postalarındaki `?invite=…` dahil. Bekleyen legacy davetlerin nasıl karşılanacağı 08'in geçiş adımına aittir, bu yönlendirmeye değil) |
| `/blog/{eski slug}` | `post_slug_redirects` ile güncel slug |

`/blog?category=x` yönlendirilmez: pazarlama sayfaları sorgu dizgisini hiç okumaz ve `/blog` yanıtını verir (canonical sorgusuz, §7.1). Yönlendirme yanıtı sorguya bağlı olacağı için önbellek anahtarını zehirlerdi.

Bugün `src/`'de yalnız `/shared/{token}` → `/s/{token}` var (302, `http/legacyRedirect.ts`, `routes/shared/$token.ts`). `/dashboard` ve `/file/*` yönlendirmesi yok (doğrulandı). 09 §1.5 adım 7 bunları `/files/$id` ve `/files` hedefiyle sayıyor, ama yeni rotalar `/app` altında: hedefler yukarıdaki tablodaki gibidir. `/app` yeni uygulamanın kendi yoludur; legacy'deki tek başına stüdyo `/app` sayfası taşınmadı (D15), yönlendirme gerekmez. Uygulama ve giriş yönlendirmeleri (`/dashboard`, `/file/{id}`, `/login`, `/signup`) **6b'de** gelir: `legacySharedRedirect` gibi router'dan önce Worker'da cevaplanır, 301, `Cache-Control: private, no-store`, pazarlama önbelleğine girmez. `/file/{id}` yalnız tek parçalı ve `[A-Za-z0-9_-]{1,64}` kimlik kabul eder, değilse 404. Test: her satır için hedef ve durum, `/file/a/b` 404, `/signup?invite=x` → `/sign-up` sorgusuz.

## 7. SSR, edge cache ve yayında temizleme (D4)

### 7.1 İstek yolu

```
istek → src/server.ts fetch
  ├─ marketingCacheKey(request)  (saf, Effect'siz; pazarlama rotası değilse ya da yöntem GET/HEAD değilse null)
  │    null → TanStack handler (değişiklik yok)
  │
  ├─ EdgeCache.match(key) ── isabet → kopya, tarayıcı başlıklarıyla + x-vizcad-cache: hit   (Effect, router, D1 yok)
  │                          HEAD ise gövdesiz; match hatası → ıska
  │
  └─ ıska → sanitizeForSsr(request): aynı yol, sorgu yok, Cookie ve diğer başlıklar yok, yöntem GET
         → TanStack handler (SSR, loader → entry.cms → program → D1)
         └─ istek GET ve isCacheable(yanıt) → ctx.waitUntil(EdgeCache.put(key, kenar başlıklarıyla kopya))
            yanıt + x-vizcad-cache: miss   (HEAD ise gövdesiz, put hiç çağrılmaz)
```

- **Pazarlama rotaları:** `/`, dil ana sayfaları, `/blog/**`, `/authors/*`, `/pricing`, `/faq`, `/contact`, `/legal/**`, `/sitemap.xml`, `/sitemaps/*`, `/robots.txt`, `/llms.txt`, RSS. Kalıplar tek listede (`src/shared/marketingRoutes.ts`), hem `marketingCacheKey` hem `affectedUrls` bu listeyi kullanır.
- **Anahtar:** `https://{siteUrl hostu}{yol}?v={BUILD_ID}`. İsteğin sorgu dizgisi atılır (utm ve benzeri önbelleği delip CPU harcatmasın). `BUILD_ID` build anında Vite `define` ile koda gömülür (git kısa SHA + build zamanı). Deploy Cache API kayıtlarını silmez; eski kayıtlar artık var olmayan hash'li JS/CSS dosyalarına bağlanır. Her build kendi anahtar alanını kullandığı için eski HTML deploy'dan sonra bir daha eşleşmez ve `s-maxage` ile düşer. Temizleme (§7.4) URL'leri API'ye aynı `?v=` ekiyle gönderir. Yol normalleştirilmez; normalleştirme gerekiyorsa 301 verilir, 301 de önbelleğe girer.
- **Temizlenmiş istek (`sanitizeForSsr`, saf).** Iskada handler'a orijinal istek gitmez: `new Request(origin + yol, { method: 'GET', headers: { accept: 'text/html' } })`. Sorgu, `Cookie`, `Authorization`, `Accept-Language` ve diğer bütün başlıklar düşer. Böylece önbelleğe giren yanıt yalnız yola bağlıdır: sorgu ya da çerez yanıtı değiştirip (ör. bir 301 ya da oturuma özel içerik) o yolun anahtarına yazamaz. Hiçbir pazarlama sayfası sorgu dizgisi okumaz. `/blog?category=x` `/blog` ile aynı yanıtı alır (200, canonical sorgusuz), yönlendirme yok (§6.9).
- **`isCacheable`:** istek `GET`, durum 200 ya da 301, `Set-Cookie` yok, yanıtta `x-vizcad-no-store` yok. `HEAD` hiçbir zaman `put` çağırmaz: gövdesiz bir yanıt anahtarı doldurursa sonraki `GET`'ler boş sayfa alır. `HEAD` isabeti, kaydın başlıklarını gövdesiz döner. 404 ve 410 önbelleğe girmez (rastgele URL'ler önbelleği doldurmasın; 410 yalnız var olan yazı için ve D1'de ucuz).
- **Başlıklar ve ETag.** Kenar kopyası `Cache-Control: public, s-maxage=86400` (güvenlik ağı: temizleme kaçarsa en geç bir günde yenilenir) ve `ETag: W/"{BUILD_ID}.{put zamanı, base36}"` taşır. ETag ıskada üretilir, gövde hash'lenmez (CPU). Tarayıcıya giden yanıtta, ıskada da isabette de, `Cache-Control` `public, max-age=0, must-revalidate` ile değiştirilir (yayın anında görünsün) ve ETag aynen gider. İstekteki `If-None-Match` kaydın ETag'iyle eşleşiyorsa 304 (gövdesiz). Farklı veri merkezleri farklı ETag üretir; bunun bedeli yalnız fazladan bir indirmedir. Görseller ve fontlar `immutable`.
- **Önbellek hatası ıskadır.** `match` istisna atarsa istek ıska yoluna gider. `put` hatası yalnız etiketle günlüğe yazılır ve yanıtı etkilemez. Bozuk önbellek sayfayı kırmaz.
- **Alternatif (deploy).** Her deploy'dan sonra hostname temizleme. Deploy yollarının hepsine (elle staging, ileride Workers Builds) bir adım ekler ve adım unutulursa site kırılır. Reddedildi. Kalan risk: kademeli dağıtım sürerken eski sürümdeki isolate'ler eski anahtarlarla hizmet verir ve o arada yapılan yayının temizliği onlara ulaşmayabilir. Pencere dağıtım süresi kadardır.
- **Pazarlama HTML'i çerez okumaz.** Üst çubukta her zaman "Giriş yap" ve "Ücretsiz başla" vardır; oturumu açık kişi `/sign-in`'den uygulamaya yönlenir (bugünkü davranış). İletişim formu Turnstile'ı istemcide yükler.
- **Önizleme ve admin** pazarlama listesinde değildir: `private, no-store`, `noindex`.
- `Cache.live.ts`'teki not geçerli: Cache API workers.dev'de çalışmaz, yalnız özel alan adında. Staging doğrulaması için §10.

### 7.2 Önizleme

`/admin/cms/preview/post/{postId}/{locale}` ve `/admin/cms/preview/page/{pageKey}/{locale}`: genel şablonun aynısı, taslak verisiyle, üstte "Önizleme · yayınlanmadı" bandı. Yalnız platform admini.

### 7.3 Görsel yükleme akışı

Editörde dosya seçilir ya da yapıştırılır → istemci `createImageBitmap` ile okur, en uzun kenar 1600 px'e küçültür, WebP'ye çevirir (Safari'de desteklenmiyorsa JPEG), ayrıca 800 px varyantı üretir → iki `POST /api/cms/assets` → editöre `![alt](/api/blog/image/blog%2Fa%2F{id}.webp)` eklenir (`encodeURIComponent(r2Key)`, legacy biçimi). Alt metin zorunlu alan olarak sorulur.

### 7.4 Temizleme

**`affectedUrls(change)`** saf fonksiyonu (`src/server/cms/affectedUrls.ts`), tam test edilir:

| Değişiklik | Temizlenen URL'ler |
|---|---|
| Yazı çevirisi yayın/kaldırma (`L`) | Yazının **tüm** dillerdeki URL'leri (hreflang listeleri değişir) + eski slug; `L` dilinde kategori ya da etiket paylaşan yayındaki yazılar (ilgili yazılar listeleri bu yazıyı gösterebilir, başlığı ya da kapağı değişmiş olabilir); `L` blog listesinin tüm sayfaları (değişiklikten önceki ve sonraki sayfa sayısının büyüğüne kadar: kaldırma listeyi kısaltırsa düşen sayfa da önbellekte); `L` RSS; yazarın tüm dillerdeki sayfası; yazının yayında olduğu **tüm** dillerin sitemap'i ve dizin (her dil sitemap'i yazının hreflang alternatiflerini listeler); `L = en` ise `/llms.txt`; landing "son yazılar" gösteriyorsa `L` landing'i |
| Arşiv/geri alma, yazı alanları (kapak, yazar, kategori, etiketler) | yukarıdakinin tüm diller için birleşimi; kategori ya da etiket değiştiyse hem eski hem yeni kategori/etiketi paylaşan yazılar |
| Sayfa metinleri/SEO (`pageKey`, `L`) | o sayfanın `L` URL'si; sayfa `live` değiştiyse o sayfanın tüm dilleri (hreflang) + **tüm** dillerin sitemap'i ve dizin (her dil sitemap'i sayfanın hreflang alternatiflerini listeler); `pageKey = landing` ise `/llms.txt` |
| `shared` metinler (üst çubuk, alt bilgi) | hostname temizliği (tek API çağrısı; URL listesi değil) |
| Yazar | yazar sayfası (tüm diller) + yazarın yazıları (tüm diller) |
| Yasal sürüm | o belgenin URL'si + `L` sitemap'i ve dizin + `/llms.txt` (yasal sayfaların bağlantıları, §6.6) |
| Ayarlar (`organization.*`, `defaultOg`) | hostname temizliği |

**Bütçe (Free plan).** Çağrı başına 50 alt istek ve 10 ms CPU. Cache API çağrıları (`match`, `put`, `delete`) da alt istek sayılır. URL temizliği API çağrısı başına en çok 100 URL alır. Hostname temizliği Free planda da var: dakikada 5 istek, 25'lik kova. Bu değerler 6a'da API yanıtlarıyla doğrulanır ve sonuç bu dokümana not edilir.

**Akış.**

1. Yayın batch'i hedefleri `cache_purges`'e yazar: URL başına bir `url` satırı, `shared` metin ve ayarlarda tek bir `host` satırı (`siteUrl` hostu). Aynı batch her hedef için gecikmeli ikinci bir satır da yazar (`notBefore = şimdi + 60 s`, aşağıda "Geç put").
2. Aynı istek vadesi gelmiş satırları hemen dener: en çok 2 API çağrısı (URL çağrısı başına 100 URL) ya da tek hostname çağrısı. Yerel `cache.delete` yok: zone temizliği yerel veri merkezi dahil hepsini kapsar, yerel silme ise URL başına bir alt istek harcar. 6a'da `Cache.live.ts`'teki yerel silme döngüsü kalkar ve `PURGE_BATCH` 30'dan 100'e çıkar.
3. Başarılı satırlar silinir. Kalan ya da vadesi gelmemiş satır varsa yanıt `{ purge: { done, queued } }` döner. Admin ekranı `drainPurges`'ı kuyruk (gecikmeli satırlar dahil) boşalana kadar çağırır ("Önbellek temizleniyor · 120/340"). Her `drainPurges` çağrısı en çok 3 API çağrısı yapar.
4. Ayrı cron (`*/10 * * * *`, `drainCachePurges`) yarım kalanı tamamlar. Bu çağrıda başka iş koşmaz: saatlik işlerle (`expireUploadSessions`, `drainStorageDeletions`) aynı çağrıyı paylaşsa CPU ve alt istek bütçesi ortak olurdu. Çalışma başına en çok 3 API çağrısı ve 300 URL. `wrangler.jsonc` `triggers`, `cron.ts` sabitleri ve `wranglerCrons.test.ts` birlikte güncellenir; production cron'ları cutover'da gelir (bugünkü kural).
5. Hostname çağrısı 429 alırsa satır kalır ve `notBefore` 60 s ileri alınır. Deneme sayısı 10'u geçen satır ekranda "başarısız" kalır ve elle yeniden denenir. Yayın bildirimi: "Yayınlandı · önbellek temizlendi: 12 URL" ya da "Yayınlandı · 3 URL temizlenemedi, yeniden denenecek" (03 §2.15).

**Geç put (yarış).** Yayından hemen önce başlamış bir ıska D1'den eski veriyi okumuş olabilir ve `put`'unu temizlemeden sonra yapar. O kayıt `s-maxage` (bir gün) boyunca eski kalırdı. Bu yüzden her hedef 60 s sonra ikinci kez temizlenir (adım 1). Iska çizimi bir saniyenin altında biter; 60 s yeterli pay bırakır. Admin sekmeyi kapatırsa ikinci temizliği cron yapar; eski içerik penceresi en kötü durumda yaklaşık 11 dakikadır. `s-maxage` kısaltılmaz, çünkü her veri merkezinde daha sık SSR Free CPU bütçesine ters düşer.

- Hostname temizliği yalnız `shared` metin ve ayarlarda kullanılır. `purge_everything` hiç kullanılmaz. Cutover'dan önce production hostu legacy siteyle ortaktır ama o dönemde production'da CMS yayını yoktur; staging yalnız kendi hostunu temizler.
- `purge` ve hostname temizliği yalnız `siteUrl` hostunu kabul eder; staging kodu production URL'si temizleyemez. Token bunu sağlamaz (§10.1), tek koruma bu denetimdir ve tam test edilir.
- **Gerekçe.** D4 kararı URL bazlı temizlemedir ve `Cache` servisi bunun için yazıldı. Kuyruk, D1 yazısı ile temizleme arasındaki tutarsızlığı görünür ve onarılabilir kılar.
- **Alternatif.** Önbellek anahtarına bir "içerik nesli" sayısı eklemek (yayında nesil artar, temizleme API'si gerekmez). Doğruluğu kolay ama her isabette nesli okumak gerekir ve tek bir değişiklik o dilin bütün önbelleğini soğutur: Free planda her veri merkezinde bir SSR dalgası. 6a ölçümünde URL temizleme güvenilmez çıkarsa yedek plan olarak kalır.

### 7.5 CPU ve performans bütçesi

Free plan: çağrı başına 10 ms CPU, 50 D1 sorgusu, 50 alt istek (kullanıcı Paid istemiyor, 07 PR #16).

| Yol | Bütçe | Nasıl |
|---|---|---|
| İsabet | ≤ 2 ms CPU | `src/server.ts`'te router'dan önce, Effect'siz |
| Iska (yazı, landing) | ≤ 8 ms CPU (ölçülecek) | `contentHtml` hazır, en çok 3 D1 sorgusu tek batch'te, bileşen ağacı sade. `wrangler` gözlem verisinden `cpuTime`: 6a'da geçici `/dev/cms-probe` sayfasıyla (6a'da yazı sayfası yok), 6b'de gerçek yazı sayfasıyla |
| Pazarlama ilk JS | ≤ 120 KB gzip | three.js landing'de yalnız görünür olunca ve dokununca (11 kalıbı). Yazı sayfasında yalnız dil seçici ve menü etkileşimli |
| Lighthouse (mobil) | Performans ≥ 90, SEO 100 (yerelde production başlıklarıyla, §11), erişilebilirlik ≥ 95, en iyi uygulamalar ≥ 95 | Figtree kendi sunucumuzdan, `preload`, `font-display: swap`; LCP görseli `fetchpriority="high"` |

Iska 10 ms'yi aşarsa sırası: ağacı sadeleştir, ilgili yazıları istemciye bırak, son çare olarak kullanıcıya Workers Paid sorulur (K6).

**6a CPU kapısı (6b ve 6c'den önce).** Admin istekleri de 10 ms sınırı altındadır. `previewDraft` ve `publishTranslation` 200 KB'a kadar markdown çevirir; `POST /api/cms/assets` 5 MB'a kadar gövdeyi okur ve SHA-256 hesaplar. İkisi de staging'de, Worker içinde (`wrangler` gözlem verisi `cpuTime`) ölçülür:

1. `renderMarkdown`: canlıdaki en uzun yazı ve 200 KB'lık sentetik en kötü girdi (uzun tablolar, çok başlık, çok bağlantı ve görsel). En uzun yazı canlı sitenin genel yazı sayfasından alınır; production D1'e komut çalışmaz.
2. Görsel ucu, 5 MB gövdeyle: okuma, sihirli bayt, boyut başlığı, SHA-256, R2 `put`.

Sınırlar sonuca göre konur ve bu dokümana yazılır: `contentMd` ve yükleme gövdesi sınırı, ölçümde 8 ms'nin altında kalan en büyük boyutun yarısına iner (200 KB ve 5 MB üst sınır olarak kalır). Adlandırılmış yedekler:

- **Markdown aşarsa:** sınır düşer; aşan yazı kaydedilirken `TextTooLong` ile reddedilir ve editör yazıyı bölmeyi önerir. Canlıdaki en uzun yazı bile sınıra sığmıyorsa (o yazı admin'de yeniden kaydedilemezdi) K6 sorulur. Cutover script'i Node'da koştuğu için bundan etkilenmez.
- **SHA-256 aşarsa:** sunucu hash'i bırakılır. Tekilleştirme R2'nin kendi hesapladığı değerle yapılır: tek parça `put` sonucundaki `etag` içeriğin MD5'idir ve Worker CPU'su harcamaz. Aynı değerli kayıt varsa yeni nesne silinir ve var olan `cms_assets` satırı döner; `sha256` sütunu `md5` olur.

## 8. Pazarlama sayfaları ve yasal metinler

### 8.1 Sayfalar

| Sayfa | Faz 6 içeriği | Not |
|---|---|---|
| Landing | Faz 6f'de, onaylı tasarımla (Opus high, 07 Dalga 5). 6a–6e'de yer tutucu kalır | Gerçek ekran görüntüleri, hafif canlı model. Yalnız var olan özellikler (03 §6) |
| Fiyatlandırma | İskelet: ücretsiz planın gerçek limitleri (`Entitlements` varsayılanları, D21) ve iletişim çağrısı. Fiyat tablosu yok (Q10), "yakında" metni yok (03 §6) | Plan verisi Faz 8'de koddan; metinler CMS'ten |
| SSS | §5.1, `FAQPage` | |
| İletişim | Ad, e-posta, firma (isteğe bağlı), mesaj, Turnstile. Gönderilince "Mesajın ulaştı. 2 iş günü içinde dönüyoruz." (03 §2.18) | EmailJS kalkar. Kayıt + e-posta (§3.1) |
| Blog, yazı, yazar | 03 §2.17: ≤ 75 karakter satır, 17 px gövde, yazar kutusu, ilgili yazılar, içindekiler (yazının `tableOfContents` bayrağı) | JS olmadan okunur |

Görüntülenme sayacı (K7): legacy `views` artık artırılmaz, yalnız admin listesinde eski değer görünür. Trafik Cloudflare Web Analytics (çerezsiz) ile izlenir, böylece çerez bandı gerekmez.

### 8.2 Yasal sayfalar

| Belge | Diller | İçerik (taslağın iskeleti) |
|---|---|---|
| Gizlilik politikası (`privacy`) | 5 dil | Veri sorumlusu (`site_settings.legal.controller`), toplanan veriler (hesap, workspace, dosyalar ve türevleri, yorumlar, aktivite kaydı 365 gün, güvenlik kaydı IP/tarayıcı 90 gün (D21), onboarding cevapları, iletişim mesajları 365 gün), amaçlar ve hukuki dayanak, alt işleyenler, yurt dışı aktarım (Cloudflare), saklama süreleri, haklar ve başvuru yolu |
| Kullanım şartları (`terms`) | 5 dil | Hizmet tanımı, hesap, kabul edilebilir kullanım, kullanıcı içeriğinin sahipliği, paylaşım linklerinin sorumluluğu, hizmet seviyesi yok (ücretsiz plan), fesih, uygulanacak hukuk. Ödeme maddeleri Faz 8'de yeni sürümle |
| Çerez politikası (`cookies`) | 5 dil | Yalnız zorunlu çerezler (oturum, CSRF, link parola kanıtı); analitik çerezsiz. Bu yüzden onay bandı yok |
| Alt işleyenler (`subprocessors`) | 5 dil | Cloudflare (barındırma, D1, R2, e-posta), Google (isteğe bağlı giriş). B2B satış için gerekli |
| KVKK aydınlatma metni (`kvkk`) | yalnız `tr` | 6698 sayılı Kanun md. 10 başlıkları |

- Taslakları orkestratör, VizCad'in **gerçek** veri akışından (09, 11, D21) çıkarır ve "hukuki inceleme gerekli" işaretiyle `legal_documents`'a taslak olarak yazar. Yayın kullanıcının onayıyla yapılır (K10). Şirket bilgisi (Q9) gelmeden veri sorumlusu alanı boş kalır ve `publishLegal` `privacy`/`kvkk` için `PublishBlocked` döner.
- Mesafeli satış sözleşmesi, ön bilgilendirme formu ve iade koşulları ödeme sağlayıcısına bağlıdır (Q9; merchant of record bunların bir kısmını üstlenir); Faz 8'de aynı tabloyla eklenir.
- Sayfa: başlık, "Yürürlük: 1 Aralık 2026 · Sürüm 3", içindekiler, metin, önceki sürümler listesi (`/legal/privacy/v/2`, salt okunur, `noindex`).

### 8.3 Kabul kaydı

Kayıt formundaki "hesap oluşturarak kabul edersin" cümlesi (`auth.signUp.termsAgreement`) yürürlükteki `terms` ve `privacy` sürümlerine bağlanır. Kayıt başarılı olunca yürürlükte olan her belge için `legal_acceptances`'a bir satır yazılır (sürüm, dil, zaman): ikisi de yayındaysa iki satır. `privacy` Q9 gelene kadar yayınlanamadığı için o dönemde yalnız `terms` satırı yazılır. Google ile kayıtta aynı. Bu Faz 3 kayıt akışına küçük bir ektir (`Auth` hook'u, aynı batch değil; kayıt sonrası program). Mevcut kullanıcılar için kayıt yok: kabul tarihi bilinmez, yeni sürümde kabul isteme akışı Faz 8'de (ödeme şartlarıyla) gelir.

## 9. Admin CMS ekranları

Masaüstü öncelikli, mobilde tam çalışır (D14). 03 §2.15 ve §5 token'ları. Tel kafesler 6c başlamadan `design/mockups/v2/14-cms.html` olarak onaya sunulur. Kenar menüde platform admininin "İçerik" bölümü: Yazılar · Yazarlar · Sayfalar · Site metinleri · Yasal · Görseller · Önbellek.

| Ekran | Route | İçerik | Boş / hata |
|---|---|---|---|
| Yazılar | `/admin/cms/posts` | Tablo: başlık (en), durum rozeti, dil kapsaması (`EN ●` yayında, `TR ◐` taslak, `DE –` yok), yazar, son yayın, görüntülenme (legacy). Filtre: durum, "çevirisi eksik dil", arama | "Henüz yazı yok. İlk yazıyı oluştur." |
| Yazı editörü | `/admin/cms/posts/$id?locale=tr` | Üst çubuk: geri, başlık, durum, Kaydet, Önizle, Yayınla / Yayından kaldır. Dil sekmeleri (durum noktalarıyla). Sol: CodeMirror (başlık, kalın, bağlantı, görsel, kod araçları). Sağ panel sekmeleri: **Ayrıntılar** (slug, özet, kategori, etiketler, yazar, kapak, öne çıkan, içindekiler), **SEO** (meta başlık/açıklama sayaçlı, anahtar kelimeler, Google sonucu ve sosyal kart önizlemesi, OG görseli), **Çeviri** ("İngilizce 3 gün sonra güncellendi", İngilizce metni yan yana açma) | Kaydedilmemiş değişiklik uyarısı; slug çakışması alan altında; `ContentConflict`: "Başkası bu yazıyı değiştirdi. Yeniden yükle"; çeviri yok: "Türkçe çeviri yok; ziyaretçiler İngilizceyi görür." |
| Yazarlar | `/admin/cms/authors` | Liste + düzenleme: kullanıcı seçimi, görünen ad, slug, avatar (yükleme), dil sekmeli unvan ve bio, sosyal bağlantılar (`sameAs`) | Yazısı olan yazarın silinmesi kapalı, nedeni yazılı |
| Sayfalar | `/admin/cms/pages` | Sayfa × dil ızgarası (yayında / İngilizce yedek / eksik anahtar sayısı). Sayfa ayrıntısı: dil başına başlık, açıklama, OG görseli, arama sonucu önizlemesi, "Bu dilde yayınla" anahtarı (eksik varsa devre dışı + eksik listesi, 03 §1 kuralı) | |
| Site metinleri | `/admin/cms/texts?page=landing&locale=tr` | Solda sayfa grupları, ortada anahtar tablosu: anahtar, İngilizce (gri yer tutucu), bu dildeki değer (satır içi düzenleme), sınır sayacı, durum (taslak / eski / eksik). "Yalnız eksikler" filtresi. Üstte "Yayınla (7 değişiklik)" ve "Taslakları at" | Parametre uyuşmazlığı ve sınır alan altında |
| Yasal | `/admin/cms/legal` | Belge × dil listesi, sürüm geçmişi, yeni sürüm (önceki metinden kopya), yürürlük tarihi, değişiklik özeti, yayın (geri alınamaz uyarısıyla) | Veri sorumlusu bilgisi yoksa yayın devre dışı, nedeni yazılı |
| Görseller | `/admin/cms/assets` | Izgara: önizleme, boyut, alt metin, kullanıldığı yerler, URL kopyala, sil (kullanılıyorsa devre dışı) | SVG reddi: "SVG yüklenemez. PNG, JPEG, WebP, GIF ya da AVIF kullan." |
| Önbellek | `/admin/cms/cache` | Kuyruk (URL, deneme, son hata), "Yeniden dene", "Bir URL'yi temizle" (yalnız kendi hostumuz), son 50 yayının temizleme sonucu | Yapılandırma yoksa üstte kırmızı bant: "Önbellek temizleme yapılandırılmamış; yayın kapalı." |

Ayarlar (`/admin/cms/settings`): kuruluş adı, sosyal profiller, logo, varsayılan OG görselleri, iletişim formu alıcısı, veri sorumlusu bilgisi.

## 10. Staging ihtiyaçları

### 10.1 Kullanıcıdan istenecekler

1. **Staging için özel alan adı (K5).** Cache API workers.dev'de çalışmadığı için önbellek ve temizleme yalnız özel alan adında denenebilir. Öneri: `staging.viz-cad.com` → `vizcad-rewrite` Worker (`routes: [{ pattern: "staging.viz-cad.com", custom_domain: true }]`). Bu, production zone'una bir DNS kaydı ekler; onay gerekir. Staging her yanıtta `noindex` ve `Disallow: /` gönderir.
2. **Önbellek temizleme token'ı.** Cloudflare panosu → My Profile → API Tokens → Create Token → Custom: izin **Zone · Cache Purge · Purge**, kaynak **yalnız viz-cad.com zone'u**. Değer orkestratörün açacağı gizli giriş kartına yapıştırılır. `CF_ZONE_ID` (salt okunur bilgi) ve `CF_PURGE_TOKEN` yalnız staging'e yazılır. Production'a cutover'da, onayla.
   **Dikkat:** Cloudflare bu izni hostname ile sınırlamıyor. Staging'e verilen token bütün zone'u temizleyebilir: production URL'leri, `viz-cad.com` hostname'i, hatta `purge_everything`. Yanlış kullanımı yalnız koddaki host denetimi (§7.4) engeller. Token yalnız staging Worker'ının gizli değerinde durur, başka hiçbir yere yazılmaz; sızarsa en kötü sonuç canlı sitenin önbelleğinin boşalmasıdır (veri kaybı yok, yalnız SSR yükü).

### 10.2 Orkestratörün kendi yapacakları

- `CONTACT_RECIPIENT` staging değişkeni (staging e-posta izin listesinde olan bir adres).
- Staging D1'e legacy biçimli örnek yazılar (sahte içerik; çeviri satırı olmayan, ham HTML içeren, kuraldışı slug'lı, legacy görsel URL'li birer yazı) ve `blog/` altında örnek görseller.
- Zone'daki "AI botlarını engelle" / "Managed robots.txt" ayarlarının salt okunur kontrolü (§6.5), sonucu bu dokümana not.
- Search Console: cutover'da sitemap yeniden gönderilir (kullanıcının hesabı; o gün adım listesinde).

## 11. Test planı

- **Saf:** `renderMarkdown` (ham HTML kaçışı, `<script>`, `javascript:`/`data:` bağlantı, dış görsel, başlık kimliği tekilliği, `toc`, GFM tablo, deterministik çıktı, legacy içerik örnekleri), slug üretimi (5 dilin harfleri, ayrılmış kelimeler, uzunluk), okuma süresi, `resolveText` sırası (dört kaynak, kısmi D1), parametre denetimi, `head.ts` (canonical ve hreflang: yalnız `en`, `en`+`tr`, kapalı dil sayfası, arşiv), JSON-LD kurucuları (beklenen anahtar kümeleri; `</script>` içeren başlıkta çıktıda `<` yok, `\u003c` var ve `JSON.parse` başlığı aynen verir; `&` → `\u0026`), sitemap XML (kaçış, alternatifler, yalnız yayındakiler, `lastmod`), robots (production/staging; production çıktısında `Allow: /api/blog/image/` var ve bir robots ayrıştırıcısıyla `/api/blog/image/blog%2Fx.webp` izinli, `/api/app/x` yasak), `llms.txt` biçimi, RSS, `affectedUrls` (§7.4 tablosunun her satırı, slug değişimi, `live` değişimi), `marketingCacheKey` (sorgu atma, `?v={BUILD_ID}` eki, rota dışı null, POST null), `sanitizeForSsr` (sorgu, `Cookie`, `Authorization`, `Accept-Language` düşer; yöntem GET), `isCacheable` (Set-Cookie, 404, POST, HEAD, `x-vizcad-no-store`).
- **Temizleme:** `affectedUrls` ilgili yazı adaylarını (kategori ya da etiket paylaşan, eski ve yeni değerler) ve yazının yayında olduğu her dilin sitemap'ini içerir; `shared` metin ve ayar değişikliği tek `host` hedefi üretir; her hedef için 60 s gecikmeli ikinci satır yazılır; yayın isteği en çok 2, `drainPurges` ve cron en çok 3 API çağrısı yapar, çağrı başına ≤ 100 URL; yerel `cache.delete` çağrılmaz; hostname 429'da satır kalır ve `notBefore` ilerler; başka hostun URL'si ya da hostname'i reddedilir.
- **Program (memory `Db` + `Storage` + `Cache.memory`/`CachePurges` + `Turnstile` + `Email` + `RateLimit`):** taslak → yayın → canlı; yayındaki yazıyı düzenlemek canlıyı değiştirmez; `en` olmadan başka dil yayını `PublishBlocked`; `en` kaldırınca tüm diller 404; arşiv 410; slug çakışması dil içinde (diller arası serbest); slug değişimi yönlendirme yazar ve eski yönlendirmeyi yeni yazıya bırakmaz; revizyon çakışması; **ayna**: `en` yayını `posts` sütunlarını aynı batch'te yazar ve legacy okuyucu (fixture) aynı yazıyı görür; **okuma yedeği yok**: çeviri satırı olmayan legacy yazı genel uçta 404, script sonrası `en` olarak çıkar, taslak legacy yazı script sonrası da çıkmaz, genel programlar `renderMarkdown`'ı hiç çağırmaz; `materializeLegacyTranslations` idempotent, `--source-wins` yalnız yeni olanı günceller; **D9**: `blogLocales` dışındaki dilde blog, yazar ve RSS rotaları 404, o dilde `publishTranslation` `PublishBlocked`, taslak kaydı geçer; her admin işleminde admin olmayan 403, oturumsuz 401; yayın `CachePurges`'e beklenen URL'leri yazar; temizleme hatası içerik yayınını geri almaz, kuyruk ve cron boşaltır; yapılandırma yoksa yayın `CacheError`; görsel: SVG, uzantısı PNG içeriği HTML, 4096 px üstü, yinelenen SHA; kullanımdaki görsel silinemez; yasal sürüm yayından sonra değişmez (trigger), veri sorumlusu yoksa yayın kapalı; iletişim: Turnstile hatası, hız sınırı, ad ya da e-postada CR/LF reddi, e-posta hatasında kayıt durur ve cron yeniden dener, 5 denemeden sonra durur, 365 günden eski mesaj silinir ve 364 günlük kalır; kabul kaydı kayıt akışında yazılır.
- **Migration:** `0016` `check-migrations`'tan geçer. 0016 sonrası legacy `posts`/`author_profiles` yazım şekilleri başarılı. **Zaman birimi:** legacy'nin yazdığı gibi saniye değerli ham SQL satırı eklenir; okuyan program doğru tarihi (1970 değil), sitemap doğru `lastmod`'u verir, `--source-wins` saniye karşılaştırmasıyla doğru satırı seçer, cron eşikleri saniyedir. `user_delete_guard_author` ve `account_delete_guard_author` (gerçek better-auth silme sırası, §1.4). `sqlite_master`'da beklenen indeksler ve trigger'lar.
- **HTTP:** pazarlama yanıt başlıkları (tarayıcı ve kenar kopyası ayrı; isabette tarayıcı `Cache-Control`'ü yeniden yazılır), ETag ve `If-None-Match` → 304, `x-vizcad-cache` hit/miss, `Set-Cookie`'li yanıtın önbelleğe girmemesi, **zehirleme**: önce `Cookie` başlığıyla `/blog?category=x`, sonra çıplak `/blog` istenir; ikincisi 200 ve liste döner, SSR handler'ın gördüğü istekte sorgu ve `Cookie` yoktur; **HEAD**: `HEAD` ıskası `put` çağırmaz, ardından gelen `GET` `miss` ve tam gövde alır; `match` istisnası ıskaya düşer, `put` istisnası yanıtı bozmaz; uygulama rotalarında `X-Robots-Tag`, staging'de her yanıtta `noindex`, 301/404/410, `/api/cms/*` CSRF ve bilinmeyen işlem 404, legacy `/api/blog` JSON uçları 404, `/api/blog/image` yalnız `blog/`, başlıklar ve R2'deki MIME, `/media/*` 404, `/api/contact` CSRF.
- **Rota:** `{-$locale}` statik rotaları gölgelemez (`/app`, `/s/x`, `/sign-in`, `/api/health`), `/en/x` 301, `/xx/blog` 404.
- **Kontrat:** `PostView` ve genel yanıtlarda e-posta, `userId` ve taslak alanı yok. R2 anahtarı yalnız `blog/` önekli görsel URL'sinin içinde görünür (legacy biçimi); başka hiçbir anahtar yok.
- **Geri dönüş:** yeni kodun yazdığı bir yazı (içerik görseli + kapak) legacy okuyucu fixture'ıyla okunur; içerik görseli ve `coverImage` URL'leri legacy `/api/blog/image/$key` işleyicisinin kabul ettiği biçimdedir. `en` slug'ı başka yazının `posts.slug`'ıyla çakışınca `SlugConflict`.
- **Staging (elle, özel alan adında, her PR kabulünde listelenir):** ikinci istekte `hit`; **deploy**: sayfa `hit` iken yeniden deploy edilir, sonraki ilk istek `miss` olur ve HTML'deki her `/assets/*` adresi 200 döner; yayından sonra birkaç saniye içinde yeni içerik (iki farklı ağdan, ör. telefon hücresel + masaüstü); temizleme API yanıtı; JS kapalıyken yazı okunuyor; Lighthouse mobil performans ve erişilebilirlik (landing, yazı, SSS); 320, 390 ve 1280 px, açık ve koyu; ıska `cpuTime` ölçümü.
- **SEO doğrulaması (yerel, production başlıklarıyla):** staging `noindex` ve `Disallow: /` gönderdiği için Lighthouse SEO kategorisi orada 100 olamaz, Google da staging'i tarayamaz. Bu yüzden `pnpm build` + `wrangler dev` yerel D1/R2 ile ve `APP_ENV=production` değişkeniyle koşar (`--remote` yok, `--env production` yok, e-posta bağlaması yerelde simüle). Lighthouse SEO burada ölçülür. Google Rich Results Test ve Schema.org doğrulayıcısına sayfanın HTML'i "kod" olarak yapıştırılır (yazı, yazar, landing).

## 12. Bölünme ve kabul ölçütleri

Her PR `rewrite`'a. Ortak kabul: `pnpm check` ve `pnpm build` yeşil, yeni programların testleri var, `respond.ts` eşlemesi tam, staging'e elle yayın ve listedeki elle doğrulama (07 kalite kapısı). Opus yazar, Sonnet inceler.

| Alt faz | İçerik | Kabul |
|---|---|---|
| **6a** Altyapı | `0016_cms` (tablolar, legacy sütunlar, `user` ve `account` trigger'ları), `{-$locale}` rota iskeleti ve dil seçici, `blogLocales`, `EdgeCache` isabet yolu + `put`, `sanitizeForSsr`, `BUILD_ID` anahtarı, `isCacheable`, ETag/304, `Cache.live` değişiklikleri (yapılandırma zorunlu, yerel silme yok, 100 URL, `purgeHost`), `cache_purges` + `affectedUrls` + ayrı temizleme cron'u, `head.ts`, `Organization`/`WebSite` JSON-LD, `buildRobotsTxt`, sitemap dizini iskeleti, staging `noindex` (yanıt başlığı ve `_headers`), `platformRole`, `canManageContent`, `/api/cms` dağıtıcısı, `toUnixSeconds`. Geçici ölçüm sayfası `/dev/cms-probe` (pazarlama kabuğu + 3 D1 sorgusu, yalnız staging, 6b'de silinir). CPU kapısı ölçümleri (§7.5) | **Kapı: K5.** Alan adı ve token gelmeden 6a'nın kodu birleşebilir ama 6a kapanmaz; 6c (yayın) de başlamaz. Migration denetimi, zaman birimi, legacy yazar ve trigger testleri (gerçek silme sırası). Staging özel alan adında `hit`/`miss`, `?v=` anahtarıyla gerçek API temizlemesi, deploy sonrası `miss`, hostname temizleme; 100 URL ve hostname sınırları API'yle doğrulandı ve not edildi. Iska `cpuTime` `/dev/cms-probe` ile ölçüldü, §7.5 bütçesiyle karşılaştırıldı. CPU kapısı sonuçları, konan sınırlar ve gerekirse seçilen yedek bu dokümana yazıldı. Rota gölgeleme testi |
| **6b** Genel blog (`en`, D9) | `renderMarkdown`, slug, `getPublicPost`/`listPublicPosts`/`getPublicAuthor`, yazı/liste/yazar sayfaları (03 §2.17, mobil öncelikli), `BlogPosting`/`Blog`/`ProfilePage`/`BreadcrumbList`, dil başına sitemap (blog yalnız `en`), RSS, `llms.txt`, `/api/blog/image` ucu, yönlendirmeler (§6.9, uygulama ve giriş yönlendirmeleri dahil), legacy JSON uçlarının kaldırılması, `materializeLegacyTranslations` script'i ve staging'de koşturulması | Staging'deki legacy biçimli örnek yazılar script'ten sonra eski URL'lerinde açılıyor, görselleri geliyor; script öncesi genel uç onları göstermiyor (404). Ham HTML kaçışlı. Yazı sayfasının ıska `cpuTime`'ı ölçüldü (§7.5). Rich Results Test (kod yapıştırarak) ve Lighthouse SEO yerelde production başlıklarıyla; Lighthouse performans staging'de. JS kapalı okuma. `/dashboard`, `/file/{id}`, `/login`, `/signup` yönlendirme testleri. 320/390/1280 açık/koyu |
| **6c** Admin: yazılar, yazarlar, görseller | Tel kafes onayı (`14-cms.html`), yazı listesi ve editörü (CodeMirror, dil sekmeleri, önizleme, SEO paneli, OG şablon kartı), yazarlar, görsel yükleme (istemcide küçültme), önbellek ekranı, yayın bildirimi | Staging'de: yazı oluştur → taslak → önizle → yayınla → genel sayfada birkaç saniyede görünür ve `hit` olur; slug değiştir → eski URL 301; çakışma ve slug hataları ekranda; admin olmayan hesapla tüm uçlar 403. Ekran 390 px'te çalışıyor |
| **6d** Site metinleri, sayfa SEO'su, sayfalar | `marketing.ts` kaydı, `resolveText`, taslak/yayın, `page_seo`, `setPageLive`, admin ekranları (Sayfalar, Site metinleri, Ayarlar), fiyatlandırma iskeleti, SSS + `FAQPage`, iletişim formu (`submitContactMessage`, Turnstile, e-posta, cron) | Bir metni `tr` için değiştir → yayınla → `/tr/...` güncel, `en` değişmedi; eksik çeviride `live` açılamıyor; kapalı dil sayfasında canonical `en` ve hreflang yok; iletişim formu staging izin listesindeki adrese ulaşıyor; Lighthouse SSS ve iletişim |
| **6e** Yasal | `legal_documents`, `legal_acceptances`, sayfalar ve sürüm geçmişi, admin Yasal ekranı, kayıtta kabul kaydı, taslak metinler (§8.2) | **`terms` üzerinden kabul edilir.** Taslaklar kullanıcıya sunuldu (yayın onayı ayrı). Staging'de `terms` yayında, `/legal/terms` artık 404 değil. `privacy` ve `kvkk` gerçek veri sorumlusu (Q9, K10) gelene kadar yayınlanamaz; staging'de yalnız sahte bir `legal.controller` fixture'ıyla yayınlanıp sayfası ve sürüm geçmişi sınanır, fixture sonra silinir. Veri sorumlusu yokken `publishLegal` `PublishBlocked` (test). Kayıt sonrası yürürlükteki her belge için bir kabul satırı (fixture'lı staging'de iki). Yayınlanmış sürüm değiştirilemiyor |
| **6f** Landing | Landing tasarımı (gerçek ekranlarla, Opus high) ve yapımı, `SoftwareApplication`, hafif canlı model | Tasarım onayı; Lighthouse mobil §7.5; 320 px'te yatay kaydırma yok; vaat edilen her özellik uygulamada var (03 §6) |

Sıra: 6a → 6b → 6c ve 6d paralel → 6e → 6f. 6f, 07'deki "Landing tasarımı ve yapımı" işidir; Faz 5 ekranları bitmeden başlamaz (gerçek ekran görüntüleri).

**Cutover adımları (Faz 9 listesine eklenir):** `0016` production'a (yedek kapısıyla, onaylı) → yazımlar dondurulmuşken `materializeLegacyTranslations` (kopyada prova, rapor kullanıcıya; yayındaki yazı sayısı = `en` satırı sayısı kapısı) → yazar slug'ları → production `CF_ZONE_ID`/`CF_PURGE_TOKEN` ve `CONTACT_RECIPIENT` → yasal metinlerin yayını → Search Console'da sitemap → `public/robots.txt`'nin kalktığının doğrulanması.

## 13. Kullanıcı kararları (26 Kasım 2026)

Kullanıcı 26 Kasım 2026'da K1–K14'ün önerilen varsayılanlarını onayladı (D24). **K5 açık kalır:** `staging.viz-cad.com` kurulumu ve temizleme token'ı kullanıcının işlemini bekliyor; 6a'nın kabul kapısıdır.

| # | Soru | Önerilen varsayılan | Durum |
|---|---|---|---|
| K1 | URL yapısı: İngilizce öneksiz, diğer diller `/tr/...`, rota adları her dilde İngilizce, yalnız yazı slug'ı dile özgü. | **Evet.** Canlı blog URL'leri değişmez. | **Onaylandı (2026-11-26).** |
| K2 | Ziyaretçiyi tarayıcı diline göre otomatik yönlendirelim mi? | **Hayır.** Yalnız dil seçici. Yönlendirme önbelleği böler ve tarayıcıları yanıltır. | **Onaylandı (2026-11-26).** |
| K3 | Bir yazının başka bir dilde yayını için önce İngilizcesi yayında olsun mu? | **Evet.** Yedek dil hep var olur, eski Worker'a geri dönüş bozulmaz. | **Onaylandı (2026-11-26).** |
| K4 | Adminden değiştirilebilen metinler yalnız genel sayfalarınki mi (landing, fiyat, SSS, iletişim, blog arayüzü, üst çubuk/alt bilgi)? | **Evet.** Uygulama içi metinler kodda kalır. Yoksa her uygulama açılışında metin indirmek gerekir. | **Onaylandı (2026-11-26).** |
| K5 | Önbelleği staging'de denemek için `staging.viz-cad.com` alan adı ve viz-cad.com zone'unda önbellek temizleyebilen bir token. Token'ı Cloudflare host ile sınırlamıyor: staging'deki token canlı sitenin önbelleğini de (tamamını) temizleyebilir; bunu yalnız koddaki host denetimi engeller. | **Evet** (§10.1). İkisi de senin onayın ya da işlemin. **6a'nın kabul kapısı:** cevap gelmeden 6a kapanmaz ve 6c başlamaz. | **Açık** (2026-11-26): varsayılan onaylı, kurulum ve token bekleniyor. |
| K6 | Önbellekte olmayan sayfanın çizimi Free plandaki 10 ms CPU sınırını aşarsa? | **Önce sadeleştirme** (§7.5). Ölçüm yine aşarsa Workers Paid (aylık 5 $) sana ayrıca sorulur. | **Onaylandı (2026-11-26).** |
| K7 | Yazı görüntülenme sayacı. | **Cloudflare Web Analytics** (çerezsiz, çerez bandı gerekmez). Eski sayaç dondurulur, adminde görünür. | **Onaylandı (2026-11-26).** |
| K8 | Blogdaki bülten kutusu (EmailJS ile e-posta topluyordu). | **Kaldır.** Gönderim altyapısı ve çift onay yok. Gerekirse sonra iletişim kalıbıyla. | **Onaylandı (2026-11-26).** |
| K9 | Kapak görseli olmayan yazının paylaşım görseli. | **Admin tarayıcısında şablondan otomatik kart** (logo + başlık). Sunucuda üretim yok. | **Onaylandı (2026-11-26).** |
| K10 | Yasal metinleri kim yazacak, veri sorumlusu kim (şirket adı, adres, iletişim)? | **Taslakları ben gerçek veri akışından hazırlarım**, "hukuki inceleme gerekli" işaretiyle. Şirket bilgisi (Q9) gelene kadar gizlilik ve KVKK yayınlanmaz. Yayından önce bir hukukçuya göstermeni öneririm. | **Onaylandı (2026-11-26).** Yasal metinler taslak olarak hazırlanır ve hukuki inceleme için işaretlenir. |
| K11 | Yapay zekâ tarayıcıları (ChatGPT, Claude, Perplexity, Google AI) pazarlama ve bloga erişsin mi? | **Evet**, uygulama kapalı. `llms.txt` ile aynı amaç: yapay zekâ cevaplarında görünmek. Cloudflare'in "AI botlarını engelle" ayarı açıksa kapatmak için onayın gerekir. | **Onaylandı (2026-11-26).** |
| K12 | Eski `/ModelSnap` sayfası nereye yönlensin? | **Ana sayfaya 301.** Stüdyo Çıktı sekmesi taşınmadı (D15). | **Onaylandı (2026-11-26).** |
| K13 | Yazarlar bir kullanıcı hesabına bağlı kalsın mı? | **Evet.** Legacy tablo bunu zorunlu kılıyor, gerçek kişi yazar E-E-A-T için de doğru (D5). "VizCad Ekibi" gibi hesapsız yazar olmaz. | **Onaylandı (2026-11-26).** |
| K14 | D9 "dil başına blog sayfaları sonraya" diyor. Faz 6'da açalım mı? (Önerilen D9 güncellemesi: "Dil başına blog sayfaları Faz 6'da hazır gelir, bir dil ilk çevirisi yayınlanınca açılır.") | **Hayır, D9 kalsın.** 6b yalnız `en` blog sayfalarını yayınlar; şema, editör ve temizleme 5 dile hazırdır. Bir dili açmak `blogLocales` listesine ekleme ve testlerdir, ayrı küçük bir PR. `01-decisions.md` senin kararınla değişir. | **Onaylandı (2026-11-26).** |

## Uygulama notları · Faz 6a

Bu PR 6a'nın altyapı çekirdeğidir: migration, önbellek servisleri, kuyruk, cron, isabet yolu ve ölçüm sayfası. 6a satırının kalanı (aşağıda "Açık") ayrı bir 6a PR'ında gelir. 6a, K5 gelmeden kapanmaz.

- **Migration numarası: `0016_cms`.** Faz 5c paralel ilerliyor. 5c önce birleşip `0016`'yı alırsa bu dosya `0017_cms` olur: dosya adı, `_journal.json` girdisi (`idx`, `tag`), `meta/0017_snapshot.json` ve `migration0016.test.ts` içindeki dosya adı ile `applyMigrations({ to: 16 })` sınırı birlikte kayar. `check-migrations` değişmedi ve geçiyor. `drizzle-kit` legacy tablolara eklenen yabancı anahtarlı sütunlarda `ON DELETE SET NULL`'u yazmadı, SQL'e elle eklendi (test de bunu denetliyor). Trigger'lar elle yazıldı: `user_delete_guard_author`, `account_delete_guard_author`, `legal_documents_published_immutable`, `legal_documents_published_undeletable`. `post_translations(locale, publishedAt DESC)` indeksi şemada `sql` ile tanımlı.
- **Trigger testi gerçek silme sırasıyla koşar.** Memory D1 üzerinde `createAuth` kurulur ve `internalAdapter.deleteUser` çağrılır. Yazar için hata `account` silmesinde gelir: oturumlar gider, `user`, iki `account` satırı, `posts` ve `author_profiles` yerinde kalır. Drizzle hatayı sarar ("Failed query: delete from account …"); trigger mesajı `cause` zincirinde. Yazısı olmayan kullanıcıda üç tablo temizlenir. Yazılar devredilince silme geçer.
- **Zaman yardımcıları.** `src/server/time.ts`: `toUnixSeconds`, `fromUnixSeconds`, `millisToUnixSeconds`. `programs/shared.ts`'teki `toDate`, `toSeconds` ve `nowSeconds` artık bunlara bağlı, böylece tek tanım var.
- **`Cache` yalnız temizler.** `match`/`put` Effect servisinden çıktı (kullanan yoktu) ve Effect'siz `services/EdgeCache.ts`'e taşındı. `Cache`: `configured`, `purge(urls)` (çağrı başına 100 URL, `?v={BUILD_ID}` ekiyle), `purgeHost(hostname)` (429 → `CacheError` `rate-limited`). Yapılandırma yoksa ikisi de `CacheError` `purge-not-configured` döner. Hiçbir çağrı API'ye `purge_everything` göndermez. Yalnız `siteUrl` hostuna izin var: şema, host, sorgu ve hash denetlenir ve paylaşılan `checkUrls`/`checkHost` hem canlı hem bellek katmanında aynıdır. Yerel `cache.delete` kalktı. `live.ts` artık `caches.default` okumuyor.
- **Kuyruk bir servis değil, `Db` üzerinde bir program** (`programs/cachePurges.ts`). Gerekçe: kuyruk satırları içerikle aynı `db.batch`'te yazılmalı (`enqueuePurges(d, …)` batch ifadeleri döner), ayrı servis bunu bölerdi. Test katmanı `Db.memory` + `Cache.memoryWith`.
  - `enqueuePurges`: her hedef iki satır (şimdi ve +60 s), `ON CONFLICT DO NOTHING`, 16 satırlık ifadelere bölünür (D1: ifade başına 100 bağlı parametre; Drizzle satır başına 6 parametre bağlar, `attempts` varsayılanı dahil, yani 96).
  - `drainCachePurges({ maxCalls })`: önce vadesi gelmiş `host` satırı. Başarılı hostname temizliği vadesi gelmiş bütün URL satırlarını kendi çağrısı olmadan kapatır. Sonra çağrı başına 100 URL. Aynı hedef iki kez vadesi gelmişse tek gönderilir, iki satır da silinir. Sabitler: yayın isteği `PUBLISH_MAX_CALLS = 2`, admin ve cron `DRAIN_MAX_CALLS = 3` (≤ 300 URL).
  - Başarısız hedef 60 s sonraya kayar. O hedefin +60 s satırı zaten varsa `UNIQUE (kind, target, notBefore)` çakışırdı (testte bulundu). Bu yüzden başarısız satır silinir ve deneme sayısı (`max`) ile hata nedeni var olan satıra yazılır. Güncellemeler aynı değerleri paylaşan satırlar için tek ifadede toplanır. Deneme sayısı 10'a ulaşan satır otomatik denenmez.
  - Yapılandırma yoksa (K5): `cache purge skipped` uyarısı `reason=purge-not-configured` ve kuyruk sayısıyla yazılır, API çağrısı yapılmaz, satırlara dokunulmaz.
- **Cron.** `PURGE = '*/10 * * * *'` kendi çağrısında yalnız `drainCachePurges` koşar. `wrangler.jsonc` (staging), `cron.ts` ve `wranglerCrons.test.ts` birlikte güncellendi. Production'da cron yok (cutover kuralı).
- **`affectedUrls`** (`src/server/cms/affectedUrls.ts`) §7.4 tablosunun her satırını kapsar. İki karar: (1) blog, yazar ve RSS URL'leri yalnız `blogLocales` için listelenir. Diğer dillerde bu rotalar 404'tür, önbelleğe girmez, temizlemek bütçe harcar. Sitemap'ler her dil için listelenir. (2) `blog` ve `legal` sayfa metinleri, yani yazı ve yasal sayfaların kabuk metinleri, birçok URL'de göründüğü için tek hostname temizliğidir. Tablodaki "o sayfanın `L` URL'si" kuralı yalnız tek URL'li sayfalara (landing, fiyatlandırma, SSS, iletişim) uygulanır. URL'ler `?v=` eki olmadan döner, eki temizleme istemcisi ekler.
- **Rota listesi.** `src/shared/marketingRoutes.ts`: `isMarketingPath`, yol kurucuları, `blogLocales = ['en']`, `NO_STORE_HEADER`. Bir test, kurucuların ürettiği her yolun önbelleğe giren URL alanında olduğunu denetler, böylece temizleme listesi ile anahtar ayrışamaz.
- **İsabet yolu** (`services/EdgeCache.ts`, `src/server.ts`). Anahtar `{siteUrl origin}{yol}?v={BUILD_ID}`. İsteğin origin'i (şema + host + port) `siteUrl` origin'i değilse (workers.dev, önizleme adresi, aynı hosta düz `http`) önbellek hiç kullanılmaz. Saklanamayan ıska yanıtı (404, `Set-Cookie`, `x-vizcad-no-store`) kendi `Cache-Control`'üyle geçer; `public, max-age=0` ile yeniden yazılmaz. ETag yalnız saklanan kopyada üretilir, `HEAD` ıskası ETag almaz. 304 yanıtında `content-length` ve `content-type` düşer. `match`/`put` hataları sabit etiketle loglanır (`edge-cache.match-failed`, `edge-cache.put-failed`).
- **`BUILD_ID`.** `vite build`'de `define` ile `{git kısa SHA}.{build zamanı base36}` (örnek `4348bdd.mwyb253x`). `vite dev` ve testlerde `dev`. `src/shared/buildId.ts`.
- **JSON-LD.** `src/shared/seo/jsonld.ts`: `serializeJsonLd` (`<`, `>`, `&` ve ayrıca U+2028/U+2029 kaçışları), `organization`, `website`. `</script>` testi çıktıyı ve `JSON.parse` dönüşünü denetler.
- **`/dev/cms-probe`.** Önbelleksiz kabuk (`components/marketing/MarketingShell.tsx`, çerez okumaz) + `createServerFn` → `entry.cms` (dinamik `import()`) → `cmsProbe`: tek `db.batch`'te 3 sorgu (yayındaki 12 yazı, dilin site metinleri, landing SEO'su). D1 hatasında sayfa `x-vizcad-no-store` ve `no-store` gönderir. Production'da 404. Yerelde doğrulandı (`vite dev`, `SITE_URL=http://localhost`): ilk istek `miss`, ikinci `hit`, `?utm=` aynı anahtar, `HEAD` isabeti gövdesiz, eşleşen `If-None-Match` 304, `/pricing` 404 önbelleğe girmedi. 6b'de silinir.
- **Worker giriş boyutu.** Kök modülün statik içe aktarma kapanışı (`dist/server/index.js` + statik chunk'lar), aynı script ile ölçüldü: önce 928,3 kB (gzip 204,7 kB), sonra 936,8 kB (gzip 211,5 kB), yani +8,5 kB (gzip +6,9 kB). Artışın çoğu uygulamadaki ilk `createServerFn`'in TanStack çalışma zamanından geliyor (yaklaşık 15 kB ham); 6b'nin loader'ları da bunu kullanacak. `EdgeCache` + `marketingRoutes` yaklaşık 7 kB ham. Effect, Drizzle ve router isabet yolunda yüklenmiyor.

**Açık (K5 bekleniyor, staging özel alan adı ve temizleme token'ı):** staging alan adında `hit`/`miss`; `?v=` anahtarıyla gerçek API temizlemesi; deploy sonrası ilk isteğin `miss` olması ve `/assets/*` adreslerinin 200 dönmesi; hostname temizleme; 100 URL ve hostname hız sınırlarının API yanıtıyla doğrulanıp buraya not edilmesi; `/dev/cms-probe` ıska `cpuTime`'ının ölçülüp §7.5 bütçesiyle karşılaştırılması. CPU kapısının `renderMarkdown` ve görsel ucu ölçümleri de açık, çünkü o kodlar 6b/6c'de yazılıyor.

**Açık (6a satırında olup bu PR'a girmeyenler, ayrı 6a PR'ı):** `{-$locale}` rota iskeleti, dil seçici ve rota gölgeleme testi; `head.ts`; `buildRobotsTxt` (statik `public/robots.txt` hâlâ yerinde); sitemap dizini iskeleti; staging `noindex` (`X-Robots-Tag` yanıt başlığı ve `_headers`); `platformRole` ve `canManageContent`; `/api/cms` dağıtıcısı; zone'daki AI bot ayarlarının salt okunur kontrolü.
