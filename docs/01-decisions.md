# Kararlar

Bu dosya projenin tek doğru kaynağıdır. Bir karar değişirse burada güncellenir, eskisi üstü çizili kalır.

## Ferhat'ın cevapları (23 Kasım 2026)

| # | Konu | Karar |
|---|---|---|
| Q1 | Repo | Aynı repo (`DuoMuskeeters/VizCad`), `rewrite` branch'i. Organizasyon olduğu gibi kalır. |
| Q2 | Canlı veri | **Canlı kullanıcılar ve dosyalar var.** Veri kaybı yok: D1 şeması geçiş boyunca geriye uyumlu, R2 key'leri değişmez, her production migration önce kopyada prova edilir. |
| Q3 | Ortaklık | Ortak yok; `DuoMuskeeters` yalnızca organizasyon. PR akışı tek kişilik. |
| Q4 | Blog ve metinler | Blog kalır. **Yazılar, SEO alanları ve site metinleri admin panelinden yönetilir** (D1'de). |
| Q5 | Diller | 5 dil kalır: `en`, `tr`, `de`, `es`, `fr`. |
| Q6 | Anket ve yazar profilleri | Kalır (gerekçe aşağıda). |
| Q7 | Ödeme | Şu an yok; **refactor sonunda ödeme alınabilir olacak.** |
| Q8 | Ürün | B2B ve B2C firmalar için **organizasyon yönetim paneli** (CAD dosyaları merkezde). Yeni tasarım bu imajı verecek. Pivot ihtimali açık. |

## Bu cevaplardan çıkan kararlar

**D1. Çok kiracılı yapı (organizasyon/workspace).** Dosyalar bugün kullanıcıya bağlı; hedefte bir **workspace**'e bağlı olacak. B2B'de workspace = firma (üyeler, roller, davetler, koltuk). B2C'de her kullanıcının kişisel workspace'i olur. Kimlik için better-auth'un `organization` plugin'i kullanılır (organizasyon, üye, davet, rol tabloları hazır). Mevcut her kullanıcıya geçişte bir kişisel workspace açılır ve dosyaları oraya taşınır (yalnızca `workspaceId` sütunu eklenir, `userId` kalır).

**D2. Pivot'a dayanıklı çekirdek.** Dosya, görüntüleyici ve paylaşım modülleri organizasyon kavramını bilmez; yalnızca `workspaceId` ve yetki sonucu alır. Plan limitleri (depolama, koltuk, dosya boyutu) kod içine gömülmez, tek bir `Entitlements` servisinden okunur. Böylece ürün yönü veya fiyatlandırma değişirse çekirdek kod değişmez.

**D3. İçerik yönetimi (CMS) D1'de, 5 dilde.**
- Blog: `posts` (dil bağımsız: yazar, kapak, kategori, durum, tarih) + `post_translations` (dil başına slug, başlık, özet, içerik, meta title/description, keywords). Mevcut yazılar `en` çevirisi olarak taşınır.
- Site metinleri: anahtarlar ve İngilizce varsayılanlar kodda tipli tanımlanır (yazım hatası derleme hatası olur); admin her dil için üzerine yazar. Çeviri yoksa İngilizce gösterilir.
- Sayfa başına SEO alanları (title, description, OG görseli) adminden düzenlenir; canonical ve hreflang kodda üretilir.

**D4. Pazarlama sayfaları prerender değil, SSR + edge cache.** Metinler adminden değiştiği için build anında üretilen HTML eskir. Sayfalar Worker'da render edilir, Cloudflare önbelleğinde tutulur; admin yayınlayınca ilgili URL'ler önbellekten silinir. İçerik JS olmadan okunabilir kalır. (Portfolyodan ayrıldığımız tek yer.)

**D5. Yazar profilleri kalır.** Gerekçe: adminden yönetilen, çok dilli bir blogda yazar sayfası ve `Article` JSON-LD'deki `author` SEO'ya katkı sağlar (E-E-A-T). İlk planda kaldırmayı önermemin sebebi tek yazarlı bir blog varsaymamdı; ürün blogu için bu varsayım yanlış.

**D6. Anket kalır, yeri değişir.** Bugünkü anket "bizi nereden duydunuz?" sorusu; her sayfada köşede açılan bir balon olarak `__root`'ta duruyor. Kaldırmayı önermemin sebebi bu yerleşimdi: pazarlama sayfalarında açılan balon dikkat dağıtır, mobilde içeriği kapatır ve ziyaretçinin çoğu kayıt olmayacağı için gürültülü veri üretir. Veri değerli olduğu için soru kalır, **kayıt sonrası onboarding adımına** taşınır (workspace adı, ekip büyüklüğü, kullanım amacı ile birlikte). Mevcut yanıtlar korunur, admin grafiği kalır. B2B satış için bu onboarding cevapları ayrıca segment bilgisi verir.

**D7. Ödeme altyapısı sağlayıcıdan bağımsız.** `Billing` Effect servisi (plan, abonelik, checkout, webhook) arayüzü önce yazılır; sağlayıcı ona takılır. Abonelik workspace'e bağlıdır, kullanıcıya değil. Sağlayıcı seçimi açık soru (aşağıda).

## 23 Kasım 2026, ikinci tur

**D8. Önce tasarım.** İlk iş tasarımın yenilenmesi. Görüntüleme motoru değişikliği (vtk.js → ?) Faz 5'e kadar ertelendi; bulgular `02-feature-audit.md`'de.

**D9. Blog çevirileri acil değil.** Blog tek dilde (EN) başladı; şema çok dilli kurulur ama çeviriler ve dil başına blog sayfaları sonraya kalır.

**D10. Q9–Q12 şimdilik açık.** Pazar notları `05-market.md`'de; yön kararı canlı veri ve müşteri görüşmelerinden sonra.

## 23 Kasım 2026, tasarım yönü

**D11. Ton: genel, herkesin kullanabileceği.** Mühendis olmayanlar (satın alma, tedarikçi, yönetici) da rahat kullanabilmeli: ferah uygulama kabuğu, sade dil, teknik ayrıntı yalnızca görüntüleyicide.

**D12. Varsayılan tema açık.** Koyu tema destekli; görüntüleyici zemini her iki temada da modele uygun koyu/nötr kalabilir.

**D13. Marka korunur.** Mevcut logo (`public/vizcad-logo*.png`) ve marka rengi (camgöbeği, `#0891b2`) kalır; token'lar bunun etrafında kurulur.

**D14. Ekran önceliği (23 Kasım 2026, onaylandı).** Uygulama (dashboard, görüntüleyici, ekip, faturalandırma, admin) masaüstü öncelikli tasarlanır ama mobilde tam çalışır. Paylaşılan dosya sayfası (`/shared/$token`), landing, pazarlama, blog ve giriş/kayıt mobil öncelikli. Gerekçe: panel işi çoğunlukla masaüstünde yapılır; paylaşılan link ve landing ise çoğunlukla telefonda (e-posta, mesajlaşma) açılır. Her yerde: 320 px'te yatay kaydırma yok, dokunmatikte ≥ 44 px hedef, zoom kapatılmaz, kontrast ≥ 4.5:1. `CLAUDE.md` güncellendi.

**D15. Ekran envanteri gözden geçirmesi (23 Kasım 2026).**
- Klasörler ilk sürümde yok, ileride gelebilir. Dosyalar ekranı ve veri modeli klasöre yer bırakır (başlık alanı yol/breadcrumb'a dönüşebilir, şemada sonradan `parentId` eklenebilir).
- Route'lar: `/files`, `/files/$id`, `/s/$token` vb. Eski URL'ler (`/dashboard`, `/app`, `/file/$id`, `/shared/$token`) yönlendirmeyle korunur.
- Eski stüdyo sekmeleri (Görünüm, Işıklar, Çıktı) taşınmaz; amatör bulundu. Görüntüleyici araçları Faz 5'te baştan tasarlanır.
- Desteklenmeyen dosya türleri yüklemeden önce reddedilir; hata mesajı desteklenen türleri sayar.
- Faturalandırma ekranı ve admin rolünün faturalandırma yetkisi sonraya bırakıldı (Faz 8, Q9–Q10 ile).

**D16. Tasarım ve geliştirme paralel (23 Kasım 2026).** D8'deki "önce tasarım" sırası gevşetildi: iki iz birlikte ilerler.
- Tasarım izi: sıradaki ekranlar organizasyon ekranları (workspace değiştirici, workspace oluşturma/onboarding, ekip ve davetler, davet kabulü, workspace ayarları), sonra görüntüleyici + paylaşım penceresi, paylaşılan sayfa, giriş/kayıt. Token'lar ve bileşen seti bu ekranlarla birlikte çıkar.
- Geliştirme izi: Faz 1 iskeleti ve servisler (UI kararı gerektirmez), ardından Faz 3 kimlik + organizasyon altyapısı. Ekranın tasarımı onaylandıkça arayüzü yapılır.
- Gerekçe: eski uygulamada organizasyon yoktu (audit 🔴), kullanıcı akışı belirsiz; ekranları görmek altyapı kararlarını (rol adları, davet akışı, kişisel/firma ayrımı) netleştirir.

**D17. Ürün modeli (23 Kasım 2026).** Ayrıntı `06-product-model.md`.
- Hiyerarşi: Workspace → **Projeler** → Dosyalar → Sürümler. Proje hem gruplama hem erişim sınırı; erişim "Tüm ekip" ya da "Yalnızca davetliler". Dosya projesiz de durabilir. Klasörler ileride projenin içine (D15).
- Erişim düzeyleri (dosya, proje, misafir, link için aynı, her biri öncekini kapsar): **Görüntüleyebilir · Yorum yapabilir · İndirebilir · Düzenleyebilir.** Hesapsız link yorum yapamaz; linkte yalnızca Görüntüleyebilir / İndirebilir.
- Workspace rolleri: **Sahip · Yönetici · Üye · Yorumcu.** Yorumcu firma içinde görür ve yorum yapar, yükleyemez (kullanıcının "yorum seçeneği olmalı" isteğinden yorumlandı; fiyatı Q10'da, Onshape'teki light kullanıcı gibi ucuz/ücretsiz olabilir).
- **Misafir:** dış kişi (tedarikçi, müşteri); üye sayılmaz, koltuk tüketmez, yalnızca kendisine açılan proje/dosyayı görür, varsayılan düzey Yorum yapabilir, şimdilik yükleyemez. Tüm erişimler aktivite kaydına geçer.
- Q11 cevaplandı: bir kişi birden fazla workspace'e üye/misafir olabilir.
- Bilgi mimarisi `06-product-model.md` §6'daki menüye geçer (03-design §1'in yerine).

**D18. Çalışma düzeni ve tasarım onayları (23 Kasım 2026).**
- Orkestratör `rewrite` ve `rewrite-*` branch'lerine sormadan push eder, PR'ları `rewrite`'a birleştirir. `main`'e dokunulmaz.
- Staging (`vizcad-rewrite` Worker, D1 `vizcad-staging`, R2 `vizcad-files-staging`) her birleştirmeden sonra orkestratör tarafından elle yayınlanır. Workers Builds bağlanmadı.
- Faz 5'in sunucu türevi hazır olana kadar Görüntüleyebilir / Yorum yapabilir erişiminde **statik küçük resim** gösterilir; 3B döndürme İndirebilir ve üstünde. "Yalnızca görüntüleme" vaadi doğru kalır.
- Tasarım taslaklarındaki kararlar onaylandı: misafir şifresiz giriş (Google ya da e-posta bağlantısı) · paylaşılan sayfanın üstünde paylaşan firma, VizCad alt bilgide · paylaşılan sayfada "link ile görünür" şeffaflık notu · telefonda 3B "3B modeli aç" ile yüklenir · tehlikeli işlemler yalnızca Sahip'e · tercihler anında kaydedilir.

## Açık sorular

| # | Soru | Notlar |
|---|---|---|
| Q9 | Ödemeyi hangi şirket alacak, şirket nerede kurulu? | Stripe Türkiye'de kurulu şirketleri kabul etmiyor. Seçenekler: Paddle veya Lemon Squeezy gibi "merchant of record" (global KDV/fatura onlarda), Türkiye için iyzico. Seçimden önce şartları güncel olarak doğrulayacağım. |
| Q10 | Fiyatlandırma modeli: koltuk başına mı, depolama kademesi mi, ikisi mi? Ücretsiz plan olacak mı? | `Entitlements` servisi hepsini destekler; tasarım ve landing için gerekli. |
| ~~Q11~~ | ~~Birden fazla organizasyona üyelik~~ | Cevaplandı: evet (D17). |
| Q12 | Pivot adayları neler? | Tasarımda nelerin genel kalması gerektiğini belirler. |
