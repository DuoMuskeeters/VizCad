# Yürütme planı

Tarih: 23 Kasım 2026. Bu dosya "şu an ne oluyor, sırada ne var, kim yapıyor" sorusunun cevabı. Fazların içeriği `00-refactor-plan.md`'de, kararlar `01-decisions.md`'de.

## Nasıl çalışıyoruz

- **Orkestratör** (bu thread, Claude Opus): plan, tasarım kararları, işleri dağıtma, inceleme, birleştirme, staging'e yayın. Kullanıcıya yalnızca karar gerektiğinde soru gelir.
- **Alt ajanlar** işin ağırlığına göre seçilir:

Sağlayıcı sırası (24 Kasım kararı): önce **Antigravity** (Gemini), onun yapamadığını **Codex**, **Claude** yalnızca kritik işlerde. Bir sağlayıcının haftalık kullanımı %50'ye gelince ona iş verilmez; Claude ve Codex ikisi de %50'deyse işler durur ve kullanıcıya rapor verilir.

| İş türü | Model | Efor |
|---|---|---|
| Güvenlik kritik inceleme (auth, migration, cutover öncesi son kontrol) | Claude Opus 5.5 | xhigh, yalnız kapılarda |
| En görünür ekranların görsel tasarımı (görüntüleyici, landing) | Claude Opus 5.5 | high |
| Kalıbı belli ekranlar, UI bileşenleri | Antigravity Gemini; olmazsa Codex GPT-6.2 Sol | high |
| Effect programları, servisler, testler | Codex GPT-6.2 Sol | high |
| Ara incelemeler (yazan model ≠ inceleyen) | Antigravity Gemini ya da Codex GPT-6.2 Astra | high |
| Mekanik işler (ekran görüntüsü, i18n anahtarı, taşıma) | Antigravity Gemini Flash ya da Codex düşük efor | low–medium |

- **Branch'ler:** `main` = canlı site (dokunulmaz, Faz 9'a kadar). `rewrite` = yeniden yazımın ana branch'i; dokümanlar ve tasarım burada. Her faz kendi branch'inde ve worktree'sinde (`rewrite-faz1`, `rewrite-faz3` …), bitince incelenip `rewrite`'a birleşir.
- **Hosting:** `rewrite` branch'i ayrı bir Worker'a (`vizcad-rewrite`, workers.dev adresi) ve **ayrı staging kaynaklarına** (D1 `vizcad-staging`, R2 `vizcad-files-staging`) yayınlanır. Production D1/R2'ye dokunulmaz; staging'de sahte veri.
- **Kalite kapısı:** her birleştirmeden önce `pnpm check` + `pnpm build` yeşil, yeni her program için test, ekranlarda 390/1280 px ve açık/koyu kontrol.

## Şu an (24 Kasım 2026)

| İz | Durum |
|---|---|
| Kararlar | D1–D19 verildi. Açık: Q9 (ödeme sağlayıcısı), Q10 (fiyat), Q12 (pivot) |
| Tasarım | Görsel dil onaylandı (v2). Çizilenler: Tüm dosyalar, Projeler, Proje (dosyalar, erişim, aktivite, misafir), Ekip. Eski gri tel kafesler `design/mockups/` kökünde, arşiv |
| Geliştirme | Faz 1 ve Faz 3 (auth, workspace, ekip, davet, ekranlar) `rewrite`'ta ve staging'de. Sırada: Faz 3 artıkları, sonra Faz 4 (dosyalar ve paylaşım). **Duraklatıldı** (24 Kasım): Claude %78, Codex %49, Antigravity kotası dolu |
| Hosting | Staging yayında. Kullanıcı staging'de kayıt, doğrulama e-postası ve girişi denedi: çalışıyor (24 Kasım) |

## Dalgalar

### Dalga 1: temel (şimdi)
- [x] Faz 1 bitişi, Codex incelemesi (9 bulgu düzeltildi), `rewrite`'a birleştirme (PR #5)
- [x] Tasarım A: onboarding / firma oluşturma, davet kabulü (üye, misafir), workspace aktivitesi, ayarlar. *Sonnet high*
- [x] Tasarım B: görüntüleyici + paylaşım penceresi, paylaşılan dosya sayfası, giriş/kayıt. *Opus high*
- [x] Token'lar: açık + koyu tema, tipografi ölçeği, boşluk; `docs/03-design.md` §5. *orkestratör*
- [x] Faz 3 teknik tasarımı (`docs/08-auth-org-design.md`): better-auth organization, şema, geçiş, `permissions.ts` test matrisi. *Codex high, Opus inceleme*
- [x] Staging kurulumu ve yayın: https://vizcad-rewrite.ferhatrudvanogullari6.workers.dev (`pnpm deploy:staging`)

### Dalga 2: tasarım sistemi ve kimlik
- [x] Bileşen seti + `/dev/ui` (PR #7; staging'de `/dev/ui`, `/dev/ui/shell`) (düğme, alan, menü, pencere, tablo, sekme, rozet, avatar, boş durum); Radix ilkelleri + token'lar. *Sonnet high*
- [x] Faz 3a: şema (0012), migration denetimi (izin listesi), `permissions.ts`; Opus incelemesi, 5 bulgu düzeltildi, `rewrite`'a birleşti (PR #6), staging D1'e uygulandı
- [x] Faz 3b-1: `Auth` servisi (better-auth 1.4.7), uç allowlist'i, Google ele geçirme koruması, CSRF, rate limit (DO), staging e-posta allowlist'i; Opus incelemesi, 7 bulgu düzeltildi (PR #8), staging'de
- [x] Faz 3b-2: workspace, üye, davet, proje, misafir programları, `Entitlements`, batch guard (0013); Sonnet incelemesi, 9 bulgu düzeltildi (PR #9), staging D1'e uygulandı
- [ ] Faz 3b (kalan) backend: better-auth `Auth` servisi, `organization` plugin (roller: owner, admin, member, commenter, guest), projeler ve proje erişimi tabloları, davetler, `permissions.ts` (D17'nin dört düzeyi), testler. *Codex high, Opus xhigh inceleme*
- [ ] Mevcut kullanıcılar için kişisel workspace backfill'i: script hazır ve testli (`pnpm db:backfill:staging`), henüz çalıştırılmadı; ön koşul legacy admin panelinde kullanıcı silmenin kapatılması. Production kopyasında prova Dalga 6'da.
- [x] Faz 3 UI: giriş/kayıt/doğrulama (PR #10), uygulama çerçevesi, onboarding, ekip, davet kabulü, workspace değiştirici (PR #11); staging'de
- [x] Faz 3 artıkları (PR #13): davet ayrıntısı ucu (`getInvitation`), onboarding işaretinin sunucuda tutulması (`onboardingCompletedAt`), koltuk limitinin istemciye açılması, misafiri üyeye yükseltme arayüzü, üye kaldırmada etkilenenler önizlemesi

### Dalga 3: çekirdek (dosyalar ve paylaşım)
- [x] Faz 4 teknik tasarımı `docs/09-files-sharing-design.md` (PR #12), açık sorular D21'de cevaplandı; staging R2 token, CORS, link anahtarları hazır
- [ ] (sürüyor, Sonnet high) 4a: şema 0014, Storage, yükleme; sonra 4b liste/çöp/sürüm, 4c link ve teslim, 4d yorum ve aktivite, 4e ekranlar
- [ ] Faz 4 programları: yükleme (presign), liste, ad, yıldız, çöp kutusu, sürümler, projeler, link paylaşımı, misafir, yorumlar, aktivite kaydı; limitler `Entitlements`'tan. *Codex high*
- [ ] Güvenlik düzeltmeleri: link parolası hash + body, "yalnızca görüntüleme" sunucuda zorunlu, tüm erişimler kayıtlı. *Codex high, Opus xhigh inceleme*
- [ ] UI: Tüm dosyalar, Projeler, Proje, Paylaşılanlar, Çöp kutusu, Aktivite, paylaşılan sayfa. *Sonnet high*

### Dalga 4: görüntüleyici
- [ ] Motor araştırması: three.js + `occt-import-js` (ağaç, renk korunur) vs mevcut vtk.js; 50 MB STEP ile ölçüm. *Opus high, araştırma*
- [ ] Faz 5: görüntüleyici, Web Worker dönüşüm, küçük resim, mobil dokunma. *Opus high*
- **Kullanıcı kararı:** motor seçimi (rapor sonrası)

### Dalga 5: içerik, admin, ödeme
- [ ] Faz 6: CMS (yazılar, yazarlar, site metinleri, SEO), blog, pazarlama sayfaları SSR + edge cache. *Codex + Sonnet*
- [ ] Faz 7: platform admin. *Sonnet*
- [ ] Landing tasarımı ve yapımı (gerçek ekranlarla). *Opus high*
- [ ] Faz 8: `Billing` + gerçek planlar. **Kullanıcı: Q9 ödeme sağlayıcısı ve şirket, Q10 fiyatlandırma**

### Dalga 6: geçiş
- [ ] Production D1'in salt-okunur kopyasıyla migration provası, veri doğrulama scripti. **Kullanıcı onayı: `wrangler d1 export --remote`**
- [ ] Mobil QA, Lighthouse, erişilebilirlik.
- [ ] `rewrite` → `main`, viz-cad.com geçişi, duyuru. **Kullanıcı onayı: tarih ve geçiş**

## Kullanıcıya sorulacaklar (yalnızca bunlar)

| Ne zaman | Soru |
|---|---|
| Dalga 1 | Cloudflare girişi (staging için `wrangler login` ya da kısıtlı API token) |
| Dalga 1–2 | Tasarım taslaklarının onayı (ekran grupları bitince toplu) |
| Dalga 4 | Görüntüleyici motoru |
| Dalga 5 | Q9 ödeme sağlayıcısı/şirket, Q10 fiyatlandırma, landing metni |
| Dalga 6 | Production kopyası alma, geçiş tarihi |
| Her zaman | GitHub'a push |
