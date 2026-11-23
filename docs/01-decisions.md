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

## Açık sorular

| # | Soru | Notlar |
|---|---|---|
| Q9 | Ödemeyi hangi şirket alacak, şirket nerede kurulu? | Stripe Türkiye'de kurulu şirketleri kabul etmiyor. Seçenekler: Paddle veya Lemon Squeezy gibi "merchant of record" (global KDV/fatura onlarda), Türkiye için iyzico. Seçimden önce şartları güncel olarak doğrulayacağım. |
| Q10 | Fiyatlandırma modeli: koltuk başına mı, depolama kademesi mi, ikisi mi? Ücretsiz plan olacak mı? | `Entitlements` servisi hepsini destekler; tasarım ve landing için gerekli. |
| Q11 | B2B'de bir kullanıcı birden fazla organizasyona üye olabilsin mi (ajans, tedarikçi senaryosu)? | Önerim evet; workspace değiştirici üst menüde. |
| Q12 | Pivot adayları neler? | Tasarımda nelerin genel kalması gerektiğini belirler. |
