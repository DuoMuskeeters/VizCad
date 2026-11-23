# VizCad yeniden yazım planı

Başlangıç: 23 Kasım 2026. Hedef: VizCad'i portfolyo ile aynı stack'e taşımak, sunucu kodunu Effect ile yeniden yazmak, B2B/B2C organizasyon paneli imajıyla yeniden tasarlamak, ödeme alınabilir hale getirmek ve projeyi agent'larla güvenle geliştirilebilir yapmak. Kararlar: `01-decisions.md`.

## 1. Bugünkü durum (kod taraması)

- 133 commit, ~23k satır TS/TSX, **0 test**. Canlı kullanıcı ve dosya var.
- Dev dosyalar: `routes/app.tsx` 2002 satır (stüdyo), `admin.index.tsx` 953, `file-list.tsx` 750, `file.$fileId.tsx` 665, `api/files/share.ts` 537.
- 127 `try {` bloğu, 118 `any`. İş mantığı route dosyalarında; servis katmanı yok, D1/R2'ye her yerden doğrudan erişiliyor.
- Sürümler eski: TanStack 1.141, Vite 6, TS 5.9, Vitest 3, `compatibility_date` 2025-09-02.
- Kullanılmayan veya çakışan paketler: `@vueuse/head`, `vite-ssg`, `vite-plugin-pages`, `vite-plugin-html`, `vite-plugin-sitemap`, `react-helmet-async`, `keystatic`, `@emailjs/browser`, `vtk.js` (+ `@kitware/vtk.js`), `@aws-sdk/*` (+ `aws4fetch`). İki lock dosyası.
- Repoda 20 MB `video.mp4` ve demo STL'ler (~4 MB). `diagnose_db.ts`, `seed_blog.sql`, `gemini.md`, `FEATURE_CAD_STORAGE_REPORT.md` artıkları.
- Dosyalar kullanıcıya bağlı; organizasyon kavramı yok. Blog yazıları tek dilli.

### Korunacak işlevler
| Alan | Ne yapıyor | Eski dosyalar |
|---|---|---|
| Görüntüleyici/stüdyo | vtk.js ile STL/STEP görüntüleme, ışık, kamera, görünüm, çıktı; STEP→STL (`occt-import-js`) | `routes/app.tsx`, `components/vtk.tsx`, `scene.tsx`, `tabs/*`, `BrepToStlConverter.tsx` |
| Küçük resim | Tarayıcıda küçük resim üretip yükleme | `ThumbnailGenerator*.tsx`, `api/files/thumbnail.ts` |
| Dosyalar | R2'ye presigned yükleme, liste, ad değiştirme, yıldız, çöp kutusu, sürümler, son açılanlar | `api/files/*`, `components/dashboard/*` |
| Paylaşım | Link, e-posta daveti, önizleme/indirme izni, benimle paylaşılanlar | `api/files/share.ts`, `shared.$token.tsx`, `share-modal.tsx` |
| İşbirliği | Yorumlar, aktivite akışı | `api/files/comments.ts`, `file_activities` |
| Kimlik | better-auth: e-posta+şifre, Google, admin plugin; Resend | `lib/auth.ts`, `login/signup/verify-email` |
| Admin | Kullanıcılar, aktivite, depolama, anket sonuçları | `admin.*`, `api/admin/*` |
| Blog | D1'de yazılar, yazar profilleri, markdown editör, R2 görselleri, sitemap | `blog.*`, `admin.blog.*`, `admin.authors.tsx`, `api/blog*` |
| Pazarlama | Landing (canlı vtk hero, demolar, fiyatlandırma), FAQ, iletişim, anket | `components/landing/*`, `faq.tsx`, `contact.tsx`, `SurveyBubble.tsx` |

## 2. Hedef stack

Portfolyo ile aynı: TanStack Start 1.169 + Router 1.170 · React 19.2 · TypeScript 6 strict · Vite 8 + plugin-react 6 · Cloudflare Workers (`nodejs_compat`, `compatibility_date` 2026-11-19, Wrangler 4.166) · D1 + Drizzle 0.45 / drizzle-kit 0.31 · R2 · Turnstile · Workers Builds · Effect 4.1.5 (yalnızca sunucu/build) · Tailwind 4.1 · Vitest 5 + `@effect/vitest` · Playwright Core 1.62 · pnpm 10.33.

VizCad'e özel: `@kitware/vtk.js` (güncel), `occt-import-js` (Web Worker), `better-auth` + `organization` plugin (Effect servisi arkasında), `aws4fetch` (presigned URL), `lucide-react`, ödeme sağlayıcısı SDK'sı (Q9).

Portfolyodan tek fark: pazarlama sayfaları prerender değil, SSR + edge cache (D4).

## 3. Mimari

```
src/
  routes/            ince: girdi çöz → program çalıştır → hatayı HTTP'ye eşle
  server/
    errors.ts        tagged error'lar
    services/        Db, Storage, Email, Auth, Turnstile, AppConfig, Cache, Billing, Entitlements
                     (her biri: arayüz + canlı Layer + bellek içi test Layer'ı)
    programs/        files/, sharing/, workspaces/, cms/, billing/, admin/ (+ *.test.ts)
    permissions.ts   workspace rolü + dosya paylaşım izni → tek karar fonksiyonu
    db/schema.ts
  viewer/            vtk + occt, yalnızca istemci, lazy, dönüşüm Web Worker'da
  components/        düz React; ui/ (kendi bileşen setimiz), app/, marketing/
  i18n/              5 dil, tipli anahtarlar, İngilizce varsayılanlar
```

Katmanlar: **çekirdek** (dosya, görüntüleyici, paylaşım; `workspaceId` dışında organizasyon bilmez) → **kiracılık** (workspace, üyelik, rol) → **ticari** (plan, abonelik, limit). Pivot olursa yalnızca dış katmanlar değişir (D2).

## 4. Fazlar

Öncelik (D8, D16): tasarım (Faz 2) ve geliştirme (Faz 1 → Faz 3) **paralel** ilerler. Tasarımda sıradaki iş organizasyon ekranları; geliştirmede iskelet, servisler ve kimlik/organizasyon altyapısı. Her ekranın arayüzü tasarımı onaylanınca yapılır. Özellik durumu: `02-feature-audit.md`. Pazar: `05-market.md`.

Her faz kendi PR'ı (`rewrite` branch'ine). Her PR'da `pnpm check` yeşil ve yeni her program için test var. Production'a hiçbir şey Faz 9'dan önce gitmez.

### Faz 0: Kararlar ve hazırlık
- [x] Repo T3 projesi olarak klonlandı: `~/.t3/projects/vizcad`
- [x] Proje skill'leri (`.claude/skills`, `skills-lock.json`), `CLAUDE.md` + `AGENTS.md`
- [x] Q1–Q8 cevaplandı → `01-decisions.md`
- [x] `rewrite` branch'i
- [ ] Q9–Q12 (ödeme sağlayıcısı, fiyatlandırma modeli, çoklu üyelik, pivot adayları)
- [ ] Production yedeği: `wrangler d1 export vizcad_auth --remote` + R2 envanteri (sadece okuma, onayla)
- [ ] Mevcut sitenin ekran görüntüleri ve akış envanteri (Playwright) → `design/before/`
- [ ] Canlı verinin boyutu: kullanıcı, dosya, toplam depolama, blog yazısı sayısı

### Faz 1: Temiz iskelet ve Effect temeli
- [x] Eski kod `legacy/` altına (build ve tsconfig dışında); port edilen parça oradan silinir
- [x] Portfolyo iskeleti: `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `wrangler.jsonc`, `.node-version`, `.npmrc`, `pnpm-workspace.yaml`
- [ ] Gereksiz paket ve dosyaları at; `video.mp4` ve demo STL'leri R2'ye
- [x] Servisler: `AppConfig`, `Db`, `Storage` (R2 + presign), `Email`, `Turnstile`, `Cache` + test Layer'ları
- [x] Drizzle şeması yeni yapıya; migration geçmişi korunur, yeni migration'lar yalnızca ekleme yapar
- [ ] Yerelde production kopyasıyla çalışma: `wrangler d1 export` → local D1
- [ ] Workers Builds: `rewrite` branch'i önizleme URL'sine

### Faz 2: Tasarım sistemi (ilk iş, D8)
Yön: genel ton, açık tema varsayılan, mevcut marka (D11–D13). Süreç sırası: ekran envanteri → referans panosu → gri tel kafes → token'lar → 3 ana ekran (dosya listesi, görüntüleyici + paylaşım penceresi, paylaşılan dosya sayfası) → bileşen seti + `/dev/ui` → 5 kullanıcıyla görev testi → landing en son (gerçek ekranlarla).
- [x] Ekran envanteri (`02-feature-audit.md`'den ~15 ekran; her biri için ana iş, boş/yükleniyor/hata durumları) → `docs/03-design.md` (19 ekran, gözden geçirme bekliyor)
- [x] Referans panosu: 8–10 ürün, 390 ve 1280 px ekran görüntüsü (`design/references/`), "ne alıyoruz / ne almıyoruz" tablosu. Çekilenler: Linear, Vercel, Google Drive, Frame.io, Notion, Onshape, Dropbox Transfer, Bild, CAD ROOMS, CoLab, Sketchfab model sayfası, bugünkü VizCad (gözden geçirme bekliyor)
- [ ] `docs/03-design.md`: referanslar, token'lar, yasaklar
- [ ] Bilgi mimarisi: workspace değiştirici, sol menü (Dosyalar, Paylaşılanlar, Ekip, Faturalandırma, Ayarlar), boş durumlar, rol bazlı görünürlük
- [ ] Marka: logo, renk, tipografi, açık + koyu tema
- [ ] Mockup'lar (`design/mockups/*.html`): landing (mobil/masaüstü), onboarding, dashboard, görüntüleyici, paylaşım, ekip yönetimi, faturalandırma, admin CMS
- [ ] Bileşen seti: Radix ilkel bileşenleri + kendi token'larımız (shadcn varsayılan görünümü yok)
- [ ] Onay

### Faz 3: Kimlik ve organizasyonlar
- [ ] better-auth `Auth` servisi arkasında; `organization` plugin (workspace, üye, davet, rol: owner/admin/member/viewer)
- [ ] Migration: her mevcut kullanıcıya kişisel workspace; `files.workspaceId` doldurulur (kopyada prova + test)
- [ ] Onboarding: workspace adı, ekip büyüklüğü, kullanım amacı, "bizi nereden duydunuz" (D6)
- [ ] E-posta: Resend → Cloudflare Email Service; doğrulama, şifre sıfırlama, ekip daveti, dosya daveti şablonları, 5 dilde
- [ ] Giriş/kayıt sayfaları yeni tasarımla, kayıtta Turnstile
- [ ] Testler: kayıt, doğrulama, davet kabulü, rol kontrolü, workspace izolasyonu

### Faz 4: Dosyalar ve paylaşım (çekirdek)
- [ ] Programlar: `requestUpload`, `completeUpload`, `listFiles`, `renameFile`, `starFile`, `trashFile`/`restore`/`purge`, `listVersions`, `shareFile`, `acceptInvite`, `resolveShareToken`, `addComment`, `listActivity`
- [ ] `permissions.ts`: workspace rolü + dosya izni (sahip/düzenleyici/önizleme/indirme) tek fonksiyonda, tam test
- [ ] Limitler `Entitlements`'tan (depolama, dosya boyutu); şimdilik tek "ücretsiz" plan
- [ ] Dashboard UI: liste/ızgara, sürükle-bırak yükleme, ilerleme, boş durumlar
- [ ] Paylaşım modalı ve `/shared/$token`

### Faz 5: Görüntüleyici / stüdyo
- [ ] `app.tsx` parçalanır: `ViewerCanvas`, `useVtkScene`, sekme panelleri, araç çubuğu; durum tek `useReducer`
- [ ] vtk temizliği (`.delete()`), bellek sızıntısı kontrolü
- [ ] STEP/IGES dönüşümü Web Worker'da, ilerleme göstergesi; küçük resim aynı pipeline'dan
- [ ] Mobilde dokunmatik kontroller, büyük dosya performans bütçesi

### Faz 6: CMS, pazarlama ve SEO
- [ ] Şema: `posts` + `post_translations`, `author_profiles` (dil başına bio), `site_texts` (anahtar × dil), `page_seo` (sayfa × dil)
- [ ] Mevcut yazılar `en` çevirisi olarak taşınır
- [ ] Admin CMS: yazı editörü (dil sekmeleri, eksik çeviri uyarısı, önizleme, taslak/yayın), yazarlar, site metinleri, sayfa SEO'su, görsel yükleme (R2)
- [ ] Pazarlama sayfaları SSR + edge cache; yayınlayınca ilgili URL'ler temizlenir (D4)
- [ ] SEO: canonical, 5 dilde hreflang, `Article` + `Person` (yazar) + `Organization` + `SoftwareApplication` JSON-LD, sitemap (dil başına), robots, `llms.txt`, OG görselleri
- [ ] Landing, FAQ, iletişim, yasal sayfalar (gizlilik, kullanım şartları, KVKK/GDPR; ödeme için şart)

### Faz 7: Admin
- [ ] Platform admini (sen) ve workspace admini ayrı yüzeyler
- [ ] Platform: kullanıcılar, workspace'ler, aktivite, depolama, onboarding/anket raporları, CMS
- [ ] Workspace: üyeler, roller, davetler, kullanım

### Faz 8: Ödeme
- [ ] Q9 kararı: sağlayıcı (MoR veya iyzico), şirket/vergi bilgileri
- [ ] `Billing` servisi: planlar, checkout, müşteri portalı, webhook (imza doğrulama, idempotent), abonelik durumu workspace'te
- [ ] `Entitlements` gerçek planlara bağlanır: koltuk/depolama limitleri, aşımda davranış
- [ ] Fiyatlandırma sayfası CMS'ten, plan verisi koddan
- [ ] Testler: webhook senaryoları (ödeme, iptal, başarısız ödeme, plan değişikliği), limit aşımı

### Faz 9: Geçiş ve yayın
- [ ] Production D1 kopyasında tüm migration'ların provası, veri doğrulama scripti (kullanıcı/dosya sayıları, R2 key'leri)
- [ ] Mobil QA (320/390px, açık/koyu), Lighthouse, erişilebilirlik, konsol hatası yok
- [ ] Bakım penceresi planı, geri dönüş planı (eski Worker sürümü + D1 Time Travel)
- [ ] `rewrite` → `main`, `viz-cad.com` yeni sürümde; kullanıcılara duyuru e-postası

## 5. Kurulu skill'ler

Proje kapsamında (`.claude/skills/`, sürümler `skills-lock.json`'da; güncelleme: `npx skills update -p`):

| Skill | Kaynak | Ne için |
|---|---|---|
| `effect-ts` | Effect-TS/skills | Effect kurulumu; asıl rehber `node_modules/effect/AGENTS.md` |
| `cloudflare`, `workers-best-practices`, `wrangler` | cloudflare/skills | Workers, D1, R2, binding'ler, deploy |
| `cloudflare-email-service` | cloudflare/skills | Doğrulama/davet e-postaları |
| `turnstile-spin` | cloudflare/skills | Kayıt ve form koruması |
| `web-perf` | cloudflare/skills | Core Web Vitals, Lighthouse |
| `tanstack-start-best-practices`, `tanstack-router-best-practices` | deckardger/tanstack-agent-skills | Server function, middleware, SSR, route kalıpları |
| `vercel-react-best-practices`, `vercel-composition-patterns` | vercel-labs/agent-skills | React 19 performans ve bileşen yapısı |
| `web-design-guidelines` | vercel-labs/agent-skills | UI denetimi |

Kullanıcı seviyesinde: `frontend-design`, `ui-ux-pro-max` (Faz 2).

Ödeme sağlayıcısı seçilince (Faz 8) onun resmi skill'i varsa eklenir.
