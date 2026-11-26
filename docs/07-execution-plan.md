# Yürütme planı

Tarih: 23 Kasım 2026. Bu dosya "şu an ne oluyor, sırada ne var, kim yapıyor" sorusunun cevabı. Fazların içeriği `00-refactor-plan.md`'de, kararlar `01-decisions.md`'de.

## Nasıl çalışıyoruz

- **Orkestratör** (bu thread, Claude Opus): plan, tasarım kararları, işleri dağıtma, inceleme, birleştirme, staging'e yayın. Kullanıcıya yalnızca karar gerektiğinde soru gelir.
- **Alt ajanlar** işin ağırlığına göre seçilir:

Sağlayıcılar (26 Kasım kararı): **Codex artık kullanılmıyor.** İşler Claude'da (ikinci hesap), kotası olduğunda Antigravity'de. Opus yazar, Sonnet inceler (yazan model ≠ inceleyen). Claude kullanımı haftalık doğrusal hız çizgisini aşmaz; 5 saatlik pencere %85'e gelince yeni iş başlatılmaz (`usage-pace.py`).

| İş türü | Model | Efor |
|---|---|---|
| Güvenlik kritik inceleme (auth, migration, cutover öncesi son kontrol) | Claude Opus 5.5 | xhigh, yalnız kapılarda |
| En görünür ekranların görsel tasarımı (görüntüleyici, landing) | Claude Opus 5.5 | high |
| Kalıbı belli ekranlar, UI bileşenleri | Claude Sonnet 5.5 (ya da Antigravity Gemini) | high |
| Effect programları, servisler, testler | Claude Opus 5.5 | high |
| Ara incelemeler (yazan model ≠ inceleyen) | Claude Sonnet 5.5 (Opus'un yazdığına) | high |
| Mekanik işler (ekran görüntüsü, i18n anahtarı, taşıma) | Claude Haiku/Sonnet ya da Antigravity Gemini Flash | low–medium |

- **Branch'ler:** `main` = canlı site (dokunulmaz, Faz 9'a kadar). `rewrite` = yeniden yazımın ana branch'i; dokümanlar ve tasarım burada. Her faz kendi branch'inde ve worktree'sinde (`rewrite-faz1`, `rewrite-faz3` …), bitince incelenip `rewrite`'a birleşir.
- **Hosting:** `rewrite` branch'i ayrı bir Worker'a (`vizcad-rewrite`, workers.dev adresi) ve **ayrı staging kaynaklarına** (D1 `vizcad-staging`, R2 `vizcad-files-staging`) yayınlanır. Production D1/R2'ye dokunulmaz; staging'de sahte veri.
- **Kalite kapısı:** her birleştirmeden önce `pnpm check` + `pnpm build` yeşil, yeni her program için test, ekranlarda 390/1280 px ve açık/koyu kontrol.

## Şu an (25 Kasım 2026)

| İz | Durum |
|---|---|
| Kararlar | D1–D22 verildi. Açık: Q9 (ödeme sağlayıcısı), Q10 (fiyat), Q12 (pivot) |
| Tasarım | Görsel dil onaylandı (v2). Çizilenler: Tüm dosyalar, Projeler, Proje (dosyalar, erişim, aktivite, misafir), Ekip. Eski gri tel kafesler `design/mockups/` kökünde, arşiv |
| Geliştirme | Faz 1 ve Faz 3 (auth, workspace, ekip, davet, ekranlar) `rewrite`'ta ve staging'de. Faz 4 (dosyalar ve paylaşım) bitti, staging'de. Faz 5 tasarımı yazıldı (`11`), 5a staging'de; sırada 5b (GLB türevi) (görüntüleyici çekirdeği). Claude kullanımı `~/.claude/bin/usage-pace.py` ile ölçülüp hıza göre çalışılıyor (25 Kasım) |
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
- [x] 4a: şema 0014, Storage, yükleme (PR #14; Opus incelemesi, staging'de gerçek R2 kabulü 20/20)
- [x] 4b liste/çöp/sürüm/yıldız/taşıma (PR #15; Opus incelemesi, 8 bulgu düzeltildi; legacy çöpü cutover'dan sayılır: `TRASH_RETENTION_FLOOR`). staging kabulü 39/39
- [x] Worker CPU hafifletme (PR #16; Opus incelemesi, oturum çerezi yenileme düzeltildi): Free plan 10 ms sınırı (kullanıcı Paid istemiyor); isolate başına kurulum, better-auth'suz oturum okuma, kod bölme, uygulama sayfalarında SSR kapalı
- [x] 4d yorumlar ve aktivite (PR #17; staging 32/32)
- [x] 4c link ve teslim (PR #18; Opus incelemesi, 8 bulgu düzeltildi; staging 66/67, kalan 1 betik hatasıydı; link parolası PBKDF2 10 000 tekrar — Free plan CPU)
- [x] Giriş parolası: yeni hash'ler PBKDF2 `p1$10000`, eski scrypt `PASSWORD_REHASH` açıkken ilk girişte dönüştürülür (Free plan CPU; PR `rewrite-login-hash`, staging CPU ölçümü bekliyor)
- [x] 4e-1 Tüm dosyalar, yükleme, dosya sayfası, paylaşım penceresi (PR #20; staging'de)
- [x] 4e-2 Projeler, Paylaşılanlar, Çöp, Aktivite, Ayarlar, `/s/$token` + `listProjects`, `listFileAccess`, `listProjectAccess` (PR #21; staging'de, kenar çubuğunda "Sonra" kalmadı). Eksik: workspace adını değiştirme ucu; aktivitede dosya/proje adları ve sunucu tarafı filtre
- [ ] Faz 4 programları: yükleme (presign), liste, ad, yıldız, çöp kutusu, sürümler, projeler, link paylaşımı, misafir, yorumlar, aktivite kaydı; limitler `Entitlements`'tan. *Codex high*
- [ ] Güvenlik düzeltmeleri: link parolası hash + body, "yalnızca görüntüleme" sunucuda zorunlu, tüm erişimler kayıtlı. *Codex high, Opus xhigh inceleme*
- [ ] UI: Tüm dosyalar, Projeler, Proje, Paylaşılanlar, Çöp kutusu, Aktivite, paylaşılan sayfa. *Sonnet high*

### Dalga 4: görüntüleyici
- [x] Motor araştırması (PR #22, `docs/10-viewer-engine.md`): three.js seçildi, STEP yüklemede GLB'ye çevrilir (D22)
- [x] Faz 5 teknik tasarımı `docs/11-viewer-design.md`: GLB türevi (presigned + başlık denetimi), sahne kaydı `file_scenes`, montaj klasör görünümü, alt fazlar 5a–5d; kararlar D23
- [x] 5a görüntüleyici çekirdeği (PR #23; Opus yazdı, Sonnet inceledi, 5 önemli + 10 küçük bulgu düzeltildi; staging'de). Önizleme `model` ucundan, `file.previewed` olarak kaydedilir
- [ ] 5b GLB türevi, 5c montaj + sahne, 5d araçlar + mobil. *Opus high*
- [x] **Kullanıcı kararı:** motor three.js, orijinal STEP indirilebilir, kopya yoksa küçük resim + İndir, eski dosyalar ilk açılışta (D22)

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
