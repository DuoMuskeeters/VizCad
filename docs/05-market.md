# Pazar notları

Tarih: 23 Kasım 2026. Kaynaklar çoğunlukla vendor sayfaları ve yazılım listeleri; rakamları doğrulanmış kabul etme.

## Kısa cevap

Pazar var ve para dönüyor, ama "tarayıcıda CAD görüntüle + link ile paylaş" katmanı **kalabalık ve kısmen ücretsiz**. VizCad'in bugünkü hali (görüntüleyici + Drive benzeri depolama + paylaşım) tek başına ayrışmıyor. "Organizasyon yönetim paneli" yönü VizCad'i hafif bulut PDM'e (Bild, CAD ROOMS) yaklaştırıyor; orada da rakipler sürüm, BOM, check-in/out ve tedarikçi portalı sunuyor. Ayrışma için hedef müşteri ve tek bir iş net seçilmeli.

## Rakip haritası

| Ürün | Ne yapıyor | Fiyat / durum | VizCad'e göre |
|---|---|---|---|
| Autodesk Viewer | Ücretsiz tarayıcı görüntüleyici, ölçüm, işaretleme, paylaşım linki | Ücretsiz | Görüntüleme tek başına satılamaz |
| Onshape | Bulut CAD; sınırsız salt-görüntüleme kullanıcısı, dış paylaşım | Ücretli CAD lisansı | Firmalar zaten CAD'lerinin paylaşımını kullanıyor |
| CoLab | Mekanik mühendislik ekipleri için tasarım incelemesi, AI review ajanı | Kasım 2025'te $72M Series C; toplam ~$137M | Kurumsal, ABD odaklı; "inceleme" işini sahiplenmiş |
| Bild | Donanım ekipleri için bulut PDM, tedarikçi portalı (CAD lisansı olmadan görüntüleme) | Teklif usulü; listelerde ~$600/ay | "Organizasyon paneli + tedarikçi" yönüne en yakın rakip |
| CAD ROOMS | Bulut PDM/PLM, 35+ format görüntüleyici, misafir paylaşımı, ISO 27001/SOC 2 | Team ~$60/kullanıcı/ay (5 editöre kadar) | Yeni ve doğrudan rakip |
| ShareCAD | CAD/BIM dosyalarını şirket dışına güvenli link ile gönderme | | Yalnızca dağıtım |
| SOURCIX, Machine Research | RFQ odaklı: güvenli görüntüleyici, ihale bitince erişimi kapatma, atölye teklif akışı | | Tedarikçi/teklif yönü örnekleri |
| Glovius, CAD-Viewer.com | Masaüstü/tarayıcı görüntüleyiciler | Ücretsiz / düşük | Görüntüleme emtia |

Pazar büyüklüğü raporları birbirini tutmuyor (PDM için 2025'te $0.8B ile $7B arası). Tutarlı olan eğilim: KOBİ'lerin PLM harcamasındaki payının büyümesi (ABI: %26 → 2035'te %46) ve küçük firmaların bulutu tercih etmesi; en büyük engel maliyet.

## "Tam bu işi yapan yok" gözlemi

Bu iki anlama gelebilir: boş bir niş, ya da işin komşu araçlar (CAD'in kendi paylaşımı, Drive, e-posta) tarafından "yeterince iyi" çözülmesi. Hangisi olduğunu kod değil müşteri görüşmesi söyler.

## Ayrışma adayları (pivot dahil)

1. **Tedarikçi ve teklif (RFQ) işbirliği.** Üretici firma parçayı tedarikçilere tek tek açar, süre ve izin verir, teklif toplar, ihale bitince erişim kapanır, kimin neyi ne zaman açtığı loglanır. Rakipler ya kurumsal PDM'in bir modülü ya da yalnızca atölye tarafı. Senin RFQ ve sourcing projelerinle doğal bağ var.
2. **Yerel pazar için hafif PDM.** Türkiye ve Avrupa'daki küçük üretici ve atölyeler için 5 dilli, yerel ödeme ve faturalı, ucuz bir ekip paneli. ABD rakipleri İngilizce ve dolar bazlı.
3. **Tasarım incelemesi / AI review.** CoLab'ın alanı; $137M yatırım almış bir rakiple doğrudan yarış. Önerilmez.

Her üç senaryoda da ortak çekirdek aynı: güvenli görüntüleme (ham dosyayı vermeden), ince izinler, denetim logu, büyük STEP desteği. Bu yüzden yeniden yazımın çekirdeği yön seçiminden bağımsız olarak boşa gitmez.

## Karar vermeden önce yapılacaklar
- [x] Canlı veri (27 Kasım 2026, aşağıda): kullanıcı sayısı, aktif kullanıcı, yüklenen dosya sayısı ve boyutları, paylaşım sayısı, hangi formatlar (D1'den salt-okuma sorgular, onayla)
- [ ] Search Console ve analitik: hangi sayfalar ve sorgular trafik getiriyor
- [ ] 8–10 hedef firma ile görüşme (üretici, atölye, tasarım bürosu): bugün CAD'i dışarıya nasıl gönderiyorlar, neye para veriyorlar
- [ ] Bild ve CAD ROOMS deneme hesapları: akış ve fiyat karşılaştırması

## Canlı veri (27 Kasım 2026, production D1, yalnız okuma, toplu sayılar)
- **Kullanıcı:** 457 kayıt (449 doğrulanmış, 5 admin). Kayıtlar Aralık 2025'ten beri ayda 20–70; zirve Mart 2026 (73).
- **Aktiflik (son oturum):** son 7 gün 2, son 30 gün 14, son 90 gün 76 kişi. Kayıttan 7 günden sonra geri gelen 17, 30 günden sonra 7 kişi. Neredeyse herkes bir kez deneyip bırakıyor.
- **Dosya:** 457 dosya (386 silinmemiş, 15,7 GB), 243 kişi yüklemiş; 214 kullanıcı hiç yüklememiş. Kişi başına: 1 dosya 182, 2 dosya 32, 3–9 dosya 24, 10+ dosya 5 kişi. Son 30 günde 17, son 90 günde 108 yükleme.
- **Format:** stl 144, stp/step 103, obj 55, sldprt 22 + sldasm 7 (desteklenmiyor), fbx 8, zip 8, ayrıca ilgisiz uzantılar (.class, .model).
- **Paylaşım ve işbirliği:** 52 paylaşım (22 kişi), 28 yorum, 7 davet; paylaşımların çoğu Ocak–Mart 2026, sonra ayda 0–4. Aktivite kaydı 12 Şubat 2026'dan sonra hiç yazılmamış (eski kodda kırık olabilir).
- **Ödeme:** 0 abonelik.
- **Nereden geldiler (anket, 64 cevap):** çoğu "Opened/Dismissed" (cevap yok); Google 2, arkadaş 2, blog 2, diğer 4.

**Yorum:** Trafik ve kayıt var (organik, ayda ~40), ama kalıcı kullanım yok denecek kadar az. Kullanıcıların çoğu tek bir STL/STEP'i görüntülemek için gelip gidiyor: bugünkü kitle "ücretsiz görüntüleyici" kitlesi. Paylaşım ve işbirliği özelliği az kullanılmış. Ödeyen yok. Konumlandırma kararını (D10) bu tablo değiştirmez ama netleştirir: bugünkü kullanıcılar hedef müşteri değil; hedef firmalar ayrıca bulunmalı. 10+ dosya yükleyen 5 kişi ve paylaşım yapan 22 kişi görüşme için ilk adaylar.

## Kaynaklar
- https://www.onshape.com/en/blog/onshape-cad-viewer
- https://cadrooms.com/ · https://develop3d.com/lifecycle-management/cad-rooms-launches-engineering-collaboration-platform-for-modern-teams/ · https://www.softwareadvice.com/product/532376-CAD-Rooms
- https://www.getbild.com/plm/supplier-collaboration · https://www.capterra.com/p/255580/Bild/
- https://siliconangle.com/2025/11/10/colab-gets-72m-funding-capture-knowledge-worlds-best-engineers/ · https://www.zoominfo.com/financial/colab-software-inc/453470893
- https://sharecad.com/ · https://sourcixai.com/ai-tools/document-security/ · https://machineresearch.com/part-library/
- https://www.autodesk.com/viewers
- https://www.abiresearch.com/news-resources/chart-data/product-lifecycle-management-market-size-outlook
- https://www.globalgrowthinsights.com/market-reports/product-data-management-software-market-114279
- https://viz-cad.com/blog/cloud-based-cad-collaboration-guide
