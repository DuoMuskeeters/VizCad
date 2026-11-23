# Özellik durumu (eski kod, `main` @ 090a4a3)

Tarih: 23 Kasım 2026. Yöntem: kod okuma + `tsc` + `vite build` (`~/.t3/projects/vizcad-legacy` worktree'sinde). Uygulama canlıda tıklanarak test edilmedi; canlı akış testi Faz 0'da Playwright ile yapılacak.

Derleme: `tsc` 0 hata (strict, ama `noUnusedLocals` kapalı), `vite build` başarılı. Sunucu bundle'ı 7.5 MB (vtk.js sunucu bundle'ına da giriyor), istemci 10 MB (en büyük chunk 1 MB). `pnpm-lock.yaml` güncel değil; proje en son npm ile kurulmuş.

Durum: ✅ çalışıyor · 🟡 kısmen / eksik · 🔴 yok veya kırık · 🔒 güvenlik sorunu

## Görüntüleyici / stüdyo (`/app`)
| Özellik | Durum | Not |
|---|---|---|
| STL, OBJ, PLY, 3MF açma | ✅ | vtk.js okuyucuları |
| STEP/IGES açma | 🟡 | Tarayıcıda `occt-import-js` ile **STL'e çevriliyor**: parça ağacı, parça adları, renkler, kenarlar (B-rep) kayboluyor. **5 MB sınırı** var; gerçek montaj dosyaları çoğu zaman 10–200 MB. |
| Scenes sekmesi | ✅ | Herkese açık tek sekme |
| Appearance, Lights, Output sekmeleri | 🟡 | Yalnızca `isDeveloper` kullanıcılara açık; diğerlerine "yakında" modalı |
| "Yakında haber ver" | 🟡 | `prompt()` + `alert()` + istemciden EmailJS |
| Wireframe, kamera sıfırlama | ✅ | |
| Ölçüm, kesit düzlemi, montaj ağacı, patlatılmış görünüm, işaretleme (markup) | 🔴 | Yok. Bir CAD görüntüleyicisinden beklenen temel araçlar. |
| Parola korumalı paylaşılan dosyayı açma | 🔴 | `app.tsx:469` TODO: "Parola desteği yakında" alert'i |
| Demo model | ✅ | `/dragon.stl` |

**Motor değerlendirmesi.** vtk.js bilimsel görselleştirme (mesh, hacim, simülasyon sonucu) için güçlü bir kütüphane, ama CAD görüntüleyicisi değil: B-rep yüz/kenar seçimi, montaj yapısı ve PMI kavramı yok. "Güçlü ama isteneni vermiyor" hissinin sebebi bu. Asıl darboğaz STEP'in tarayıcıda STL'e düzleştirilmesi ve 5 MB sınırı. Faz 5'te değerlendirilecek seçenekler:
- three.js + `occt-import-js` (STL'e çevirmeden; ağaç, ad, renk korunur). Açık kaynak, düşük risk.
- Online3DViewer motoru (MIT; three.js + occt; ölçüm var).
- Sunucuda dönüşüm (Cloudflare Containers'ta OCCT veya ticari SDK) → glTF/mesh + ağaç JSON'u. Büyük dosya ve "önizleme ama indirme yok" için gerekli (aşağıdaki güvenlik notu).
- Ticari: HOOPS (Tech Soft 3D), CAD Exchanger, ODA. Güçlü ama pahalı.
- xeokit AGPL lisanslı; SaaS'ta kaynak açma yükümlülüğü riski.

## Dosyalar ve dashboard
| Özellik | Durum | Not |
|---|---|---|
| Yükleme (presigned URL ile R2'ye doğrudan) | ✅ | STEP'te 5 MB sınırı burada da var |
| Liste, son açılanlar, yıldızlı, ad değiştirme | ✅ | |
| Çöp kutusu | 🟡 | Var; otomatik kalıcı silme (cron) yok |
| Küçük resim üretimi | ✅ | Tarayıcıda |
| Sürümler | 🟡 | API (`api/files/versions.ts`) ve tablo var, **arayüzden çağrılmıyor** |
| Yorumlar | ✅ | `file.$fileId.tsx` içinde |
| Aktivite akışı | ✅ | |
| Depolama kullanımı göstergesi | ✅ | Kota/limit yok |
| Klasörler | 🔴 | Yok (düz liste) |

## Paylaşım
| Özellik | Durum | Not |
|---|---|---|
| Link ile paylaşım, e-posta daveti, benimle/benim paylaştıklarım | ✅ | |
| Son kullanma tarihi | ✅ | Sunucuda kontrol ediliyor |
| Parola | 🔒 | Parola veritabanında **düz metin** saklanıyor, URL query'sinde gönderiliyor (loglara düşer), arayüzde girilemiyor |
| "Önizleme var, indirme yok" izni | 🔒 | `download.ts`: `?purpose=preview` ile yalnızca görüntüleme izni olan kullanıcı da **ham dosyayı** alabiliyor ve bu indirme loglanmıyor. Yani izin arayüzde var, gerçekte koruma yok. Gerçek koruma için önizleme ham dosyadan değil, sunucuda üretilen görüntüleme formatından yapılmalı. |

## Kimlik ve admin
| Özellik | Durum | Not |
|---|---|---|
| E-posta + şifre, doğrulama, şifre sıfırlama | ✅ | better-auth + Resend |
| Google ile giriş | ✅ | |
| Organizasyon/ekip | 🔴 | Yok; her şey kullanıcıya bağlı |
| Admin: kullanıcılar, kullanıcı detayı, aktivite, depolama, anket | ✅ | `admin.index.tsx` 953 satır |
| Admin: blog yazıları, yazarlar | ✅ | Markdown editör, R2 görselleri |

## Pazarlama, blog, SEO
| Özellik | Durum | Not |
|---|---|---|
| Landing (canlı vtk hero, 3 demo, fiyatlandırma) | ✅ | Demolar "Batman" mock'ları; fiyatlandırma ödeme olmadan |
| FAQ | ✅ | |
| İletişim formu | 🟡 | İstemciden EmailJS; bot koruması yok |
| Blog (D1, tek dil) | ✅ | `__root.tsx`: "blog content itself is hardcoded to English" |
| Sitemap, robots, meta | ✅ | Blog ve `viz-cad.com` arama sonuçlarında görünüyor (ör. bulut CAD işbirliği rehberi) |
| Anket balonu | ✅ | Her sayfada, `localStorage` ile bir kez |
| 5 dil arayüz | ✅ | i18next |

## Testler ve altyapı
| Konu | Durum |
|---|---|
| Otomatik test | 🔴 0 test |
| Hata izleme / observability | 🔴 `wrangler.jsonc`'de kapalı |
| Turnstile | 🔴 Yok |
| Cron (çöp kutusu, süresi dolan paylaşımlar) | 🔴 Yok |

## Yeniden yazımda kesin düzeltilecekler
1. Paylaşım parolaları hash'lenir (mevcutlar geçişte hash'e çevrilir), parola body'de gider.
2. "Yalnızca önizleme" izni sunucuda gerçekten uygulanır; tüm erişimler loglanır.
3. STEP 5 MB sınırı kalkar (Faz 5, motor kararıyla).
4. Sürümler arayüze bağlanır.
