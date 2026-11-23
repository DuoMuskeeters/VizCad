# Tasarım

Başlangıç: 23 Kasım 2026 (Faz 2). Yön kararları `01-decisions.md` D11–D14'te: genel ton (mühendis olmayanlar da kullanır), açık tema varsayılan + koyu destekli, mevcut marka (logo + `#0891b2`), uygulama masaüstü öncelikli / paylaşılan sayfa ve pazarlama mobil öncelikli.

Bu dosyanın bölümleri sırayla dolacak: ekran envanteri → referans panosu → tel kafesler → token'lar → yasaklar.

## 1. Bilgi mimarisi (taslak)

Tel kafeslerde sınanacak; kesinleşince burası güncellenir.

```
Üst çubuk:  [Workspace değiştirici ▾]  [Ara]                    [Yükle] [Bildirim] [Profil ▾]
Sol menü:   Dosyalar
              Son açılanlar · Yıldızlı          (Dosyalar'ın filtreleri, ayrı sayfa değil)
            Paylaşılanlar                       (benimle paylaşılanlar / benim paylaştıklarım)
            Ekip                                (B2B; kişisel workspace'te "Ekip kur" çağrısı)
            Faturalandırma                      (yalnızca owner/admin)
            Ayarlar
            ─────
            Çöp kutusu
            Depolama göstergesi (Entitlements'tan)
Mobil:      sol menü çekmece olur; üst çubukta workspace adı + menü + yükle
```

Rol bazlı görünürlük (workspace rolü: owner / admin / member / viewer):

| Öğe | owner | admin | member | viewer |
|---|---|---|---|---|
| Dosya yükleme, ad değiştirme, silme | ✓ | ✓ | ✓ (kendi dosyaları + editör izni olanlar) | – |
| Paylaşım linki oluşturma | ✓ | ✓ | ✓ | – |
| Ekip: üye davet, rol değiştirme | ✓ | ✓ | görüntüler | görüntüler |
| Faturalandırma | ✓ | ertelendi (D15) | – | – |
| Workspace silme / sahiplik devri | ✓ | – | – | – |

Dosya düzeyi izinler (sahip / düzenleyici / önizleme / indirme) workspace rolünden ayrıdır; tek karar fonksiyonu `permissions.ts`'te (D2). Tasarımda izinsiz eylem **gizlenmez, devre dışı + neden** gösterilir ("İndirme izni yok, sahibinden iste"), çünkü satın alma/tedarikçi kullanıcısı neyi neden yapamadığını bilmeli.

## 2. Ekran envanteri

Kaynak: `02-feature-audit.md`, `00-refactor-plan.md` Faz 2–8, eski kod (`vizcad-legacy`). Öncelik sütunu D14'e göre. "Mockup" sütunu Faz 2'de çizilecek ilk üç ekranı (★) ve tel kafes sırasını gösterir.

| # | Ekran | Route (hedef) | Öncelik | Kim kullanır | Mockup |
|---|---|---|---|---|---|
| 1 | Dosyalar (dashboard) | `/files` | Masaüstü | Tüm üyeler | ★ |
| 2 | Görüntüleyici | `/files/$id` (görüntü) | Masaüstü | Tüm üyeler | ★ |
| 3 | Paylaşım penceresi | `/files/$id` üzerinde modal | Masaüstü | owner/admin/member | ★ |
| 4 | Paylaşılan dosya sayfası | `/s/$token` | **Mobil** | Hesabı olmayan alıcı | ★ |
| 5 | Dosya ayrıntıları paneli | `/files/$id` yan paneli | Masaüstü | Tüm üyeler | 2 |
| 6 | Yükleme | Dosyalar üzerinde katman | Masaüstü | owner/admin/member | 2 |
| 7 | Paylaşılanlar | `/shared` | Masaüstü | Tüm üyeler | 3 |
| 8 | Çöp kutusu | `/trash` | Masaüstü | owner/admin/member | 3 |
| 9 | Giriş, kayıt, doğrulama, şifre sıfırlama | `/login`, `/signup`, `/verify`, `/reset` | **Mobil** | Ziyaretçi | 2 |
| 10 | Onboarding | `/welcome` | **Mobil** | Yeni kullanıcı | 2 |
| 11 | Ekip (üyeler, davetler) + davet kabulü | `/team`, `/invite/$id` | Masaüstü (kabul: mobil) | owner/admin | 2 |
| 12 | Faturalandırma ve kullanım | `/billing` | Masaüstü | owner/admin | 3 |
| 13 | Ayarlar (profil, workspace, tercihler) | `/settings/*` | Masaüstü | Herkes | 3 |
| 14 | Platform admin (genel bakış, kullanıcılar, workspace'ler, aktivite, depolama, onboarding raporu) | `/admin/*` | Masaüstü | Yalnızca Ferhat | 3 |
| 15 | Admin CMS (yazılar + editör, yazarlar, site metinleri, sayfa SEO'su) | `/admin/cms/*` | Masaüstü | Yalnızca Ferhat | 3 |
| 16 | Landing | `/` | **Mobil** | Ziyaretçi | Son (D: gerçek ekranlarla) |
| 17 | Blog listesi + yazı + yazar | `/blog`, `/blog/$slug`, `/authors/$slug` | **Mobil** | Ziyaretçi | Son |
| 18 | Fiyatlandırma, SSS, iletişim, yasal | `/pricing`, `/faq`, `/contact`, `/legal/*` | **Mobil** | Ziyaretçi | Son |
| 19 | Sistem sayfaları: 404, erişim yok, sunucu hatası | – | Mobil | Herkes | 2 |

Route adları onaylandı (D15); eski URL'ler (`/dashboard`, `/app`, `/file/$id`, `/shared/$token`) canlıda kullanıldığı için yönlendirme ile korunur (paylaşılmış linkler kırılmamalı).

Durum yazımı ilkesi: boş ekran bir eylem çağrısıdır; hata ne olduğunu ve nasıl düzeleceğini söyler, özür dilemez; yükleniyor durumu iskeletle (skeleton) gösterilir, 300 ms'den kısa yüklemelerde hiçbir şey gösterilmez. Metinler aşağıda taslak; son hali i18n anahtarlarına gider.

### 2.1 Dosyalar (dashboard) ★
- **Ana iş:** Bir dosyayı bulmak ve açmak. İkincil: yüklemek, düzenlemek (ad, yıldız, taşı, sil).
- **İçerik:** Liste ve ızgara görünümü (küçük resimli); sütunlar: ad, tür, boyut, sahip, son değişiklik, paylaşım durumu. Filtreler: tümü / son açılanlar / yıldızlı / benim yüklediklerim. Arama. Çoklu seçim + toplu eylem. Sürükle-bırak yükleme alanı tüm sayfa.
- **Klasörler (D15):** İlk sürümde yok, ileride gelebilir. Başlık alanı ("Dosyalar") ileride yol/breadcrumb'a dönüşecek şekilde çizilir; satır yapısı klasör satırını kaldırabilir.
- **Boş:**
  - Yeni workspace: "Henüz dosya yok. Bir STEP, STL veya OBJ dosyasını buraya sürükle ya da yükle." + desteklenen formatlar + örnek modeli aç linki.
  - Filtre sonucu boş: "Yıldızlı dosya yok. Bir dosyanın yanındaki yıldıza bas, burada görünsün."
  - Arama sonucu boş: "'flanş' ile eşleşen dosya yok." + aramayı temizle.
- **Yükleniyor:** Satır/kart iskeleti (8 adet), küçük resimler ayrı yüklenir (yer tutucu: format ikonu).
- **Hata:** Liste alınamadı: "Dosyalar yüklenemedi. Bağlantını kontrol edip yeniden dene." + Yeniden dene. Küçük resim üretilemedi: format ikonu, hata gösterilmez.
- **Mobil:** Tek sütun liste, satır ≥ 56 px, eylemler satır menüsünde (⋯), yükleme alt sağda sabit buton.

### 2.2 Görüntüleyici ★
- **Ana iş:** Modeli anlamak: döndürmek, yakınlaştırmak, parçalara bakmak; sonra yorum yazmak veya paylaşmak.
- **İçerik:** Tam yükseklik tuval (koyu/nötr zemin, her iki temada, D12). Üst çubuk: geri, dosya adı, sürüm seçici, Paylaş, İndir (izne göre), ⋯. Araç çubuğu: görünüm küpü / standart görünümler, tel kafes, sıfırla. Faz 5 araçları (ölçüm, kesit, montaj ağacı, işaretleme) için yer ayrılır ama "yakında" düğmesi olarak gösterilmez. Sağ panel: Ayrıntılar / Yorumlar / Aktivite / Sürümler (ekran 5).
- **Eski "stüdyo" sekmeleri** (Görünüm, Işıklar, Çıktı) taşınmaz (D15). Görüntüleyici araçları Faz 5'te baştan tasarlanır.
- **Boş:** Görüntüleyicinin boş hali yok; dosyasız açılırsa Dosyalar'a yönlendirir. Yorum paneli boş: "Henüz yorum yok. Modelde bir noktayı işaretleyip yorum bırakabilirsin" (işaretleme gelene kadar: "İlk yorumu yaz").
- **Yükleniyor:** Aşamalı ilerleme: "İndiriliyor %42" → "Dönüştürülüyor (STEP)" → "Hazırlanıyor". Küçük resim varsa bulanık arka plan olarak gösterilir. İptal düğmesi.
- **Hata:**
  - Format desteklenmiyor: "Bu dosya türü (.dwg) henüz açılamıyor. Desteklenenler: STEP, IGES, STL, OBJ, PLY, 3MF." + indir (izin varsa).
  - Dönüşüm başarısız: "Model dönüştürülemedi. Dosya bozuk olabilir ya da desteklenmeyen bir STEP sürümü kullanıyor." + yeniden dene + dosyayı bildir.
  - Bellek / cihaz yetersiz (büyük dosya, mobil): "Bu model bu cihaz için çok büyük. Masaüstünde açmayı dene." + küçük resim gösterilir.
  - WebGL yok: "Tarayıcın 3B görüntülemeyi desteklemiyor." + küçük resim.
- **Mobil:** Tuval tam ekran, paneller alttan açılan sayfa (bottom sheet), dokunma: tek parmak döndür, iki parmak yakınlaştır/kaydır.

### 2.3 Paylaşım penceresi ★
- **Ana iş:** Bir kişiye veya linke, ne yapabileceğini (önizleme / indirme / düzenleme) seçerek dosyayı açmak.
- **İçerik:** E-posta ile davet (çoklu, izin seçimi), link bölümü (kapalı / açık; izin: yalnızca önizleme / önizleme + indirme; son kullanma tarihi; parola), erişimi olanlar listesi (izin değiştir, kaldır), kopyala. Workspace içi üyeler öneri olarak listelenir.
- **Dürüstlük kuralı:** "Yalnızca önizleme" seçiliyken ham dosyanın gerçekten korunduğu (audit 🔒) Faz 4/5'te sağlanana kadar arayüz bunu vaat etmez. Seçenek etiketi teknik gerçeğe göre yazılır.
- **Boş:** "Bu dosya henüz kimseyle paylaşılmadı."
- **Yükleniyor:** Erişim listesi iskeleti; kaydetme sırasında ilgili satırda gösterge (tüm pencere kilitlenmez).
- **Hata:** Geçersiz e-posta: alanın altında. Davet gönderilemedi: "Davet gönderilemedi: ali@firma.com. Adresi kontrol et." Plan limiti (Entitlements): "Bu planda en fazla 3 dış paylaşım linki açılabilir. Planı yükselt." (limit metni Entitlements'tan, koddan değil).
- **Mobil:** Tam ekran sayfa.

### 2.4 Paylaşılan dosya sayfası ★ (mobil öncelikli)
- **Ana iş:** Hesabı olmayan alıcının (tedarikçi, müşteri, yönetici) linki telefonda açıp modeli görmesi ve gerekiyorsa indirmesi. Giriş istemez.
- **İçerik:** Paylaşan kişi ve firma ("Ayşe Yılmaz, Demir Makina sizinle paylaştı"), dosya adı, boyut, tarih, son kullanma; görüntüleyici (sade araç seti); İndir (izin varsa); "VizCad ile kendi dosyalarını paylaş" küçük alt bilgi (tek pazarlama dokunuşu).
- **Kapılar (ayrı durumlar):** Parola gerekli (alan + göster/gizle; parola body'de gider, audit düzeltmesi 1). Giriş gerekli (e-posta davetinde hesap şartı varsa).
- **Boş:** Yok.
- **Yükleniyor:** Önce dosya kartı ve küçük resim (SSR), görüntüleyici sonra lazy yüklenir; "Modeli aç" düğmesi mobilde otomatik 3B yükleme yerine (veri ve pil için) düşünülür.
- **Hata:**
  - Süresi doldu: "Bu linkin süresi 12 Kasım'da doldu. Yeni link için Ayşe Yılmaz ile iletişime geç." (paylaşanın adı gösterilir, e-postası gösterilmez).
  - Kaldırıldı / bulunamadı: "Bu link artık geçerli değil. Paylaşan kişi erişimi kaldırmış olabilir."
  - Yanlış parola: "Parola yanlış." (deneme sınırı sonrası bekleme süresi).
  - İndirme izni yok: İndir düğmesi yerine "Bu dosya yalnızca görüntülenebilir."

### 2.5 Dosya ayrıntıları paneli
- **Ana iş:** Dosya hakkında bilgi ve geçmiş: kim, ne zaman, hangi sürüm, ne konuşuldu.
- **Sekmeler:** Ayrıntılar (boyut, format, yükleyen, tarihler, paylaşım özeti) · Yorumlar · Aktivite · Sürümler (API var, arayüz yok: audit düzeltmesi 4; yeni sürüm yükle, eski sürümü aç/geri yükle).
- **Boş:** Sürüm: "Tek sürüm var. Aynı dosyanın yeni halini yükleyerek sürüm ekleyebilirsin." Aktivite: oluşturma olayı her zaman vardır, boş olmaz.
- **Yükleniyor / hata:** Sekme başına iskelet; hata sekme içinde, panel kapanmaz.

### 2.6 Yükleme
- **Ana iş:** Bir veya birçok dosyayı yüklemek ve bittiğini görmek.
- **İçerik:** Sürükle-bırak veya dosya seçici; sağ altta kalıcı ilerleme kartı (dosya başına ilerleme, iptal, tamamlananı aç). Sayfadan ayrılınca uyarı.
- **Boş:** Seçilmemiş hali yükleme alanının kendisi.
- **Yükleniyor:** Dosya başına çubuk + kalan süre; küçük resim üretimi "Küçük resim hazırlanıyor" olarak ayrı satır.
- **Hata:** Boyut sınırı (Entitlements): "rotor.step 240 MB; bu planda dosya başına sınır 100 MB." Depolama dolu: "Depolama dolu (5 / 5 GB). Yer aç ya da planı yükselt." Format desteklenmiyor (D15: reddedilir, yükleme başlamaz): "rotor.dwg yüklenmedi: bu dosya türü desteklenmiyor. Desteklenenler: STEP, IGES, STL, OBJ, PLY, 3MF." Ağ kesildi: "Yükleme durdu. Bağlantı gelince devam edecek." + yeniden dene.

### 2.7 Paylaşılanlar
- **Ana iş:** Bana açılan dosyaları bulmak; benim kime ne açtığımı denetlemek.
- **İçerik:** İki sekme: Benimle paylaşılanlar / Paylaştıklarım. İkincisinde erişim, son kullanma, son açılma; toplu "erişimi kaldır".
- **Boş:** "Seninle henüz dosya paylaşılmadı." / "Henüz bir dosya paylaşmadın. Bir dosyayı açıp Paylaş'a bas."
- **Yükleniyor / hata:** Dosyalar ile aynı kalıp.

### 2.8 Çöp kutusu
- **Ana iş:** Yanlışlıkla silineni geri almak.
- **İçerik:** Silinen dosyalar, silen kişi, kalıcı silinmeye kalan gün (cron Faz 4'te; süre Entitlements'tan). Geri yükle, kalıcı sil (onay penceresi), çöpü boşalt.
- **Boş:** "Çöp kutusu boş. Silinen dosyalar 30 gün burada kalır."
- **Hata:** Geri yükleme çakışması: "Aynı adla bir dosya var; 'rotor (geri yüklendi).step' olarak geri yüklendi." (bilgi bildirimi).

### 2.9 Giriş, kayıt, doğrulama, şifre sıfırlama (mobil öncelikli)
- **Ana iş:** Hesaba en az adımla girmek.
- **İçerik:** Google ile devam + e-posta/şifre, Turnstile (görünmez mod), dil seçici. Doğrulama: "E-postanı kontrol et" + yeniden gönder (bekleme sayacıyla). Davet linkinden gelindiyse "Demir Makina ekibine katılıyorsun" bağlamı.
- **Yükleniyor:** Düğme içinde gösterge, form kilitlenir.
- **Hata:** Alan altında: "Bu e-posta ile kayıtlı hesap yok. Kayıt ol?"; "Şifre en az 8 karakter olmalı". Turnstile başarısız: "Doğrulama tamamlanamadı, sayfayı yenile." Doğrulama linki süresi dolmuş: yeni link gönder.

### 2.10 Onboarding (mobil öncelikli, D6)
- **Ana iş:** Kullanıcıyı ilk dosyasına götürmek; yol üstünde segment bilgisini toplamak.
- **Adımlar:** (1) Kişisel mi, firma mı → (2) Workspace adı (firma ise) → (3) Ekip büyüklüğü + kullanım amacı → (4) "Bizi nereden duydunuz?" (atlanabilir) → (5) İlk dosyayı yükle / örnek modeli aç / ekibi davet et. Adım göstergesi gerçek bir sıra olduğu için numaralı.
- **Hata:** Workspace adı alınmış değil, ad benzersiz olmak zorunda değil (slug otomatik). Kayıt hatası alan altında.

### 2.11 Ekip ve davet kabulü
- **Ana iş:** Ekibe kişi eklemek, rollerini yönetmek.
- **İçerik:** Üye listesi (ad, e-posta, rol, son etkinlik), bekleyen davetler (yeniden gönder, iptal), davet et (çoklu e-posta + rol), koltuk kullanımı (Entitlements: "4 / 5 koltuk"). Rol açıklamaları sade dille ("İzleyici: dosyaları görür, yükleyemez").
- **Boş (kişisel workspace):** "Şu an tek başınasın. Ekip arkadaşlarını davet et, dosyaları birlikte yönetin."
- **Davet kabul sayfası (mobil):** "Mehmet seni Demir Makina'ya İzleyici olarak davet etti" + Katıl (hesap yoksa kayıt akışına bağlamla gider).
- **Hata:** Koltuk dolu: "5 koltuğun hepsi dolu. Bir üyeyi çıkar ya da plan yükselt." Davet süresi dolmuş: "Bu davetin süresi dolmuş. Mehmet'ten yeni davet iste." Son owner'ı düşürme: devre dışı + neden.

### 2.12 Faturalandırma ve kullanım
- **Ertelendi (D15):** Faz 8'de Q9–Q10 ile birlikte tasarlanır. Aşağıdaki not taslak olarak kalır.
- **Ana iş:** Ne kadar kullandığımı ve ne ödediğimi görmek; planı değiştirmek.
- **İçerik:** Mevcut plan, kullanım çubukları (depolama, koltuk, dosya boyutu sınırı; hepsi Entitlements), plan karşılaştırma, ödeme yöntemi ve faturalar (sağlayıcının portalına link, Q9). Ödeme yokken (Faz 8 öncesi) yalnızca kullanım ve "Ücretsiz plan".
- **Boş:** Fatura yok: "Henüz fatura yok."
- **Hata:** Başarısız ödeme bandı (tüm uygulamada üstte): "Son ödeme alınamadı. Ödeme yöntemini güncelle; 7 gün içinde yükleme kapanacak." Webhook gecikmesi: "Plan değişikliğin işleniyor" ara durumu.

### 2.13 Ayarlar
- **Ana iş:** Profil, workspace ve kişisel tercihleri değiştirmek.
- **Bölümler:** Profil (ad, fotoğraf, e-posta, şifre, bağlı Google hesabı) · Tercihler (dil, tema: açık/koyu/sistem, e-posta bildirimleri) · Workspace (ad, logo, varsayılan paylaşım ayarları; owner: sahiplik devri, silme) · Hesabı sil.
- **Hata:** Kaydetme hatası alan yanında; tehlikeli eylemler ayrı bölümde, ad yazarak onay.

### 2.14 Platform admin
- **Ana iş:** Ferhat'ın platformu izlemesi: kim kayıt oldu, kim aktif, ne kadar depolama, onboarding cevapları.
- **İçerik:** Genel bakış (sayılar + basit trend), kullanıcılar (ara, filtre, detay), workspace'ler, aktivite akışı, depolama (en büyük workspace/dosya), onboarding/anket raporu (mevcut anket verisi korunur, D6).
- **Boş / yükleniyor / hata:** Tablo kalıbı (iskelet, "sonuç yok", yeniden dene). Sayılar için grafikler `dataviz` kurallarıyla.

### 2.15 Admin CMS
- **Ana iş:** Blog yazısı, site metni ve SEO alanlarını dillere göre düzenleyip yayınlamak.
- **İçerik:** Yazılar listesi (durum: taslak/yayında, dil kapsaması rozetleri), editör (dil sekmeleri, eksik çeviri uyarısı, markdown + önizleme, SEO alanları, kapak görseli R2'ye), yazarlar, site metinleri (anahtar × dil tablosu, İngilizce varsayılan gri yer tutucu olarak), sayfa SEO'su. Yayınlayınca "önbellek temizlendi: 3 URL" bildirimi (D4).
- **Boş:** "Henüz yazı yok. İlk yazıyı oluştur." Çeviri yok: "Türkçe çeviri yok; ziyaretçiler İngilizceyi görür."
- **Hata:** Kaydedilmemiş değişiklik uyarısı; yayın hatası; slug çakışması alan altında.

### 2.16–2.18 Pazarlama: landing, blog, fiyatlandırma, SSS, iletişim, yasal (mobil öncelikli)
- **Ana iş (landing):** Ziyaretçinin VizCad'in ne yaptığını 5 saniyede anlaması ve bir dosyayı denemesi. Gerçek uygulama ekranları ve canlı (ama hafif) model; mockup'lar uygulama ekranları bittikten sonra çizilir (plan sırası).
- **Blog:** okunabilirlik (≤ 75 karakter satır), yazar kutusu, ilgili yazılar. SSR + edge cache, JS olmadan okunur (D4).
- **İletişim:** Turnstile, sunucudan e-posta (EmailJS kalkar). Hata: alan altında; gönderildi: "Mesajın ulaştı. 2 iş günü içinde dönüyoruz."
- **Fiyatlandırma:** Q10 açık; tel kafes çizilmez, yalnızca yer ayrılır.

### 2.19 Sistem sayfaları
- **404:** "Bu sayfa yok." + Dosyalar'a dön / ana sayfa.
- **Erişim yok:** "Bu dosyayı görme iznin yok. Erişim iste" (sahibine istek gönderir; Faz 4'te kapsam kararı).
- **Sunucu hatası:** "Bir şey bozuldu, kayıt alındı. Biraz sonra yeniden dene." + hata kimliği (destek için).
- **Bakım (Faz 9 geçişi):** Tarih ve süre.

## 3. Referans panosu

Görüntüler: `design/references/<ad>-390.jpg` (iPhone 14, DPR 2, ilk 1690 px) ve `<ad>-1280.jpg` (ilk 2400 px). Script: `design/references/_shoot.cjs` (23 Kasım 2026).

**Sınırlar.** Uygulama ekranları giriş arkasında; çekilenler pazarlama sayfaları ve içlerindeki ürün görüntüleri. Gerçek uygulama akışları (Drive dosya listesi, Linear kenar menüsü, Frame.io paylaşım sayfası) aşağıdaki tabloda bu görüntülerden ve ürün bilgisinden değerlendirildi; tel kafeste kararlaştırılırken bu ayrım akılda tutulmalı. Paylaşılan sayfa için giriş gerektirmeyen gerçek bir örnek olarak Sketchfab model sayfası eklendi. Google Drive sayfası coğrafi yönlendirmeyle Türkçe geldi (Türkçe metin uzunluğu için ayrıca faydalı). Dropbox Transfer ve CoLab'da çerez penceresi kapanmadı. Sketchfab 1280'de 3B tuval headless tarayıcıda çizilmedi.

### 3.1 Ürün başına

| Ürün | Hangi ekran için | Ne alıyoruz | Ne almıyoruz |
|---|---|---|---|
| **Linear** | Uygulama kabuğu, aktivite akışı | Dar, sakin sol menü (ikon + kısa etiket, bölüm başlığı küçük ve sönük); workspace adı menünün tepesinde açılır menüyle (bizim workspace değiştirici); aktivite akışı olay cümlesi + göreli zaman tek satır ("Ayşe yükledi · 2 dk önce"); yorum kartları akışın içinde; klavye kısayolları (⌘K arama). | Koyu varsayılan ve gri-üstüne-gri düşük kontrast (D12, 4.5:1 kuralı); mühendis/geliştirici dili ("issues", "cycles"); çok yoğun 13 px metin; pazarlamadaki mono "FIG 0.1" süsleri. |
| **Vercel** | Ayarlar, kullanım/faturalandırma, tablolar | Siyah-beyaz nötr zemin üstünde tek vurgu rengi disiplini (bizde camgöbeği); geniş boşluk; birincil düğme dolu, ikincil düğme çerçeveli ve aynı yükseklikte; ayarlarda "bölüm başlığı + açıklama + kontrol + kaydet" kartı kalıbı. | Geliştirici tonu ve mono yazı tipi vurguları; büyük üçgen hero gibi markaya özgü gösteriş; teknik jargon. |
| **Google Drive** | Dosyalar, paylaşım penceresi | Herkesin zaten bildiği zihinsel model: sol menüde "Yeni" düğmesi, Drive/Benimle paylaşılanlar/Son/Yıldızlı/Çöp; liste satırında ad + sahip + tarih + boyut; paylaşım penceresinde "Erişimi olan kişiler" listesi ve "Genel erişim" bölümü ayrı (bizim davet + link ayrımı); rol açılır menüsü satırın sağında. Satın alma/yönetici kullanıcısı bu kalıbı tanır (D11). | Renkli format ikonları kalabalığı; Material'ın yuvarlak hap butonları ve mavi; "Yapay zeka destekli" vurgusu; yoğun üst araç çubuğu. |
| **Frame.io** | Görüntüleyici + yorum paneli, paylaşılan sayfa | Sol varlık ağacı + orta ızgara + sağda görüntüleyici/yorum düzeni; ızgara kartında küçük resim üstünde sürüm rozeti (V2) ve yorum sayısı; seçimde alt "1 öğe seçildi · 460 MB" toplu eylem çubuğu; dış paylaşımın "sunum" olarak markalanabilmesi (ileride workspace logosu paylaşılan sayfada). | Mor-lacivert koyu tema ve parıltılı gradyanlar; yaratıcı sektör dili; büyük dekoratif başlık tipografisi. |
| **Notion** | Onboarding, boş durumlar, Admin CMS | Açık temada sıcak ama nötr zemin, siyah birincil düğme + gri ikincil; sade, insan dili ("A shared brain for your team"); tablo görünümünde etiket rozetleri (CMS'te dil/durum rozetleri); onboarding'de tek soru tek ekran. | El çizimi illüstrasyonlar ve maskot dili (D11 genel ama oyuncak değil); her yerde emoji/ikon başlık (CLAUDE.md yasağı). |
| **Onshape** | Görüntüleyici, pazarlama karşı örneği | CAD görüntüleyicide modelin beyaz/açık nötr zeminde gerçekçi gölgelendirme ile gösterilmesi, açık tema ile çelişmeden 3B'nin öne çıkması. | Pazarlamada kalabalık: sohbet balonu içeriği kapatıyor (mobilde başlığın üstüne biniyor; bizim eski anket balonu sorununun aynısı, D6), banner yığını, tamamı büyük harf düğme, gradyanlar. Karşı örnek olarak saklanıyor. |
| **Dropbox Transfer** | Yükleme, paylaşılan sayfa | Tek iş tek ekran: sayfanın tamamı sürükle-bırak alanı, tek düğme "Upload files" + seçenek oku; mobilde de aynı sadelik. Boş Dosyalar ekranımız ve yükleme durumu için en net örnek. | Kesik çizgili büyük kutunun kendisi (eski moda görünüm); kimlik ve bağlam eksikliği (kim gönderdi belirsiz); çerez penceresinin ekranın yarısını kapatması. |
| **Bild** | Görüntüleyici, ayrıntılar paneli | En yakın rakip düzeni: solda montaj ağacı (onay kutulu görünürlük), ortada model, sağda Details/Activity/Suppliers sekmeli panel; ayrıntılar anahtar-değer listesi; ölçüm kutusunda birim seçimi (mm/inch). Faz 5 araçları ve sağ panel sekmeleri için yer planı buradan. | Siyah zemin, küçük gri metin, yoğun PDM alanları (ECO status, nomenclature, tooling type): mühendis olmayan kullanıcıya fazla (D11). Rozet duvarı, "3x faster" istatistik şeridi. |
| **CAD ROOMS** | Sürümler, görüntüleyici araç çubuğu | Modelin altında yüzen yatay araç çubuğu (döndür, kesit, ölçüm, ekran görüntüsü, yorum) ve seçili aracın vurgusu; sürüm seçicide "Revizyon 3 · @kişi · 20 dk önce" satırı + "Yeni revizyon" düğmesi; "Laura K. bu dosyada çalışıyor" varlık göstergesi (ileride). | Koyu tema, neon mavi; dosya formatı rozet duvarı; çiplerle dolu başlık alanı; "supercharged" dili. |
| **CoLab** | (Sınır çizmek için) | Görüntüleyici yanında yorumun modeldeki noktaya bağlanması (pin + kart), Faz 5 işaretleme için hedef. | Kurumsal AI inceleme konumlandırması (05-market: önerilmeyen yön), siyah + mor, büyük başlık + video atlıkarınca. |
| **Sketchfab (model sayfası)** | Paylaşılan dosya sayfası (mobil) | Mobilde akış: önce tam genişlik model, altında ad, sahibi, temel sayılar, eylem ızgarası (İndir, Paylaş, Göm), sonra ayrıntılar ve yorumlar. Yorum için giriş gerektiğinde açık bir kutu ("Yorum yazmak için giriş yap"). Bu sıralama ekran 4 için doğrudan model. | Sosyal ağ öğeleri (takip, beğeni, öneri listesi), büyük harf mavi düğmeler, etiket bulutu, kalabalık alt bilgi. |
| **VizCad bugün** (`vizcad-today-*.jpg`) | Karşılaştırma tabanı | Logo ve camgöbeği (D13); hero'da gerçek model; kısa vaat ("tarayıcıda görüntüle, paylaş"); mockup'taki "dosya adı + Download + Share" üst çubuğu ve sağda Details/Comments paneli doğru iskelet. | Yüzen gölgeli menü kartı, sağ altta içeriğin üstüne binen yardım balonu, mobilde ortalanmış ve 7 satıra kırılan açıklama, her kartta yumuşak gölge; marka camgöbeği yanında ikinci bir mavi (#2563eb Share düğmesi); telifli karakter modeli (Batman) demolar; **olmayan veya korunmayan özelliklerin vaadi**: "markups and measurements" (audit 🔴) ve "view-only link" (audit 🔒, ham dosya alınabiliyor). Yeni landing yalnızca var olanı söyler. |

### 3.2 Ortak çıkarımlar

1. **Rakiplerin hepsi koyu ve mühendis dilinde** (Bild, CAD ROOMS, CoLab, Onshape'in uygulaması). Açık tema + sade dil (D11, D12) bizi görsel olarak ayırıyor; buna yaslanıyoruz. Koyu tema bir tercih olarak var, kimlik değil.
2. **Dosya yönetimi Drive gibi, görüntüleyici Bild/CAD ROOMS gibi.** Kullanıcı ilk ekranda yeni bir şey öğrenmemeli; teknik derinlik görüntüleyiciye açıldıkça gelir.
3. **Üç sütunlu görüntüleyici** (sol: ağaç/araçlar · orta: model · sağ: sekmeli panel) masaüstünde standart; mobilde tuval tam ekran + alttan açılan sayfa.
4. **Paylaşılan sayfa = kim, ne, ne yapabilirsin.** Paylaşanın adı ve firması üstte, model, sonra tek birincil eylem. Sketchfab'in mobil sırası, Dropbox Transfer'in sadeliği.
5. **Kaplayan katman yok.** Sohbet/anket balonu, çerez penceresi ve banner yığını referanslarda en sık bozulan şey; landing'de sabit katman kullanmıyoruz (çerez bildirimi gerekiyorsa alt şerit, içerik kapatmadan).
6. **Tek vurgu rengi.** Vercel ve Notion'da olduğu gibi nötr zemin + tek renk; camgöbeği yalnızca birincil eylem, seçili durum ve odak için.

## 4. Tel kafesler

Gri, düşük ayrıntılı HTML: yerleşim, hiyerarşi ve gerçek metin; renk, yazı tipi ve gölge yok. Her sayfanın üstündeki çubuktan durumlar açılır (`?durum=`). Görüntüler `design/mockups/shots/` (390 ve 1280 px, `node design/mockups/_shoot.cjs`; script yatay taşmayı da kontrol eder).

| Dosya | Ekran | Durumlar |
|---|---|---|
| `design/mockups/01-dosyalar.html` | 1. Dosyalar | dolu, seçim, yükleme (reddedilen .dwg dahil), boş, yükleniyor, hata |
| `design/mockups/02-goruntuleyici.html` | 2–3. Görüntüleyici + paylaşım penceresi | ayrıntılar, yorumlar, sürümler, paylaşım, yükleniyor, hata |
| `design/mockups/03-paylasilan.html` | 4. Paylaşılan dosya sayfası | indirilebilir, yalnızca görüntüleme, parola, süresi doldu, geçersiz link |

Tel kafeslerde verilen ve onay bekleyen kararlar:
- Dosya listesinde "Erişim" sütunu düz dille ("Yalnızca ekip", "2 kişi", "Link · süresi doldu").
- Görüntüleyicide araç çubuğu modelin altında yüzer; sağ panel sekmeleri Ayrıntılar / Yorumlar / Aktivite / Sürümler. Mobilde panel alttan açılan sayfa.
- Sürüm geri yükleme eskiyi silmez, yeni sürüm olarak ekler.
- Paylaşım penceresi: kişi daveti + isteğe bağlı mesaj, erişimi olanlar, link (izin, son kullanma, parola). İzin adları: Görüntüleyebilir / Görüntüleyip indirebilir / Düzenleyebilir.
- Paylaşılan sayfa: paylaşan + firma + mesaj üstte; mobilde 3B, "3B modeli aç" ile yüklenir (önce küçük resim). Masaüstünde model solda büyük, bilgi sağda.

### 4.1 Görsel taslak (v2, onay bekliyor)

Gri tel kafes yerleşimi tartışmak için fazla soyut bulundu ("modern, sade" beklentisi). Aynı yerleşim görsel tasarımla çizildi: `design/mockups/v2/01-dosyalar.html` (görüntüler `design/mockups/v2/shots/`, `node design/mockups/v2/_shoot.cjs <sayfa> <durumlar>`).

- Yazı tipi: Figtree (tek aile; Türkçe karakter desteği, mühendis olmayan kullanıcıya sıcak ama ciddi).
- Renk: beyaz içerik, `#f7f8fa` kenar menü, metin `#142033` (logodaki lacivert), ikincil metin `#5a6475`. Marka `#0891b2` beyazda 3.7:1 olduğu için metin ve dolu düğmelerde `#0e7490` (5.4:1); `#0891b2` seçili gösterge, ilerleme çubuğu ve odak halkasında.
- Kabuk: workspace değiştirici, arama (⌘K), menü, depolama ve hesap kenar menüde; üst çubuk yok. Mobilde üst çubuk + alttaki "Yükle" düğmesi.
- Gölge yalnızca üstte duran katmanlarda (seçim çubuğu, yükleme kartı, menüler).

## 5. Token'lar

_(tel kafesler onaylandıktan sonra)_

## 6. Yasaklar

`CLAUDE.md` UI kurallarına ek olarak, referans incelemesinden sonra burada kesinleşecek.
