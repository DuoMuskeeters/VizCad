# Ürün modeli: organizasyon, proje, kişi

Tarih: 23 Kasım 2026. Durum: **öneri, onay bekliyor.** Onaylanan maddeler `01-decisions.md`'ye karar olarak geçer. Pazar bağlamı: `05-market.md`.

## 1. Soru

"Organizasyon yönetim paneli" neyi yönetir? Bu üründe cevap üç şey: **kim** (üyeler, dış kişiler), **neye** (proje, dosya), **ne kadar** erişiyor (görüntüle, indir, düzenle) ve **ne oldu** (kim neyi ne zaman açtı). Eski uygulamada bunların hiçbiri yoktu; her dosya bir kişiye bağlıydı (audit 🔴).

## 2. Rakipler nasıl kurmuş

Kaynaklar vendor yardım sayfaları; bazıları eski sürüm olabilir, ayrıntılar doğrulanmadı.

| Ürün | Hiyerarşi | İç roller | Dış kişi | Ücret birimi |
|---|---|---|---|---|
| Google Drive (Workspace) | Firma → Ortak drive → klasör → dosya | Yönetici, içerik yöneticisi, katkıda bulunan, yorumcu, izleyici | Dosya/klasör bazında e-posta veya link | Kullanıcı başına |
| Frame.io V4 | Hesap → Workspace → Proje (kısıtlı proje seçeneği) | Hesap: admin/üye. Workspace ve proje: tam erişim, editör, yalnızca düzenleme, yorumcu, izleyici. Yetki aşağı miras kalır, miras altına düşürülemez | Reviewer: paylaşım linkiyle, hesap üyesi değil | Koltuk |
| Onshape | Şirket → Takımlar, Projeler (Enterprise) → Doküman | Full user, Light user (görüntüle, yorum, dışa aktar). Proje rolleri izin şemasıyla; varsayılan şemada "Suppliers" yalnızca görüntüler | Full/Light guest: yalnızca kendisine açılan doküman veya proje; şirket ayarlarını görmez | Full kullanıcı ücretli, light/guest ayrı |
| CAD ROOMS | Workspace → Proje → dosya | Workspace: Owner, Admin. Proje: Viewer, Collaborator; workspace admin'leri tüm projelerde admin | Guest: dosya bazında, koltuk tüketmez, görüntüle + ölç + yorum, yükleyemez | ~$60/kullanıcı/ay (Team, 5 editöre kadar) |
| Bild | Proje → parça/montaj, BOM, değişiklik talebi | (doğrulanmadı) | Tedarikçi portalı: CAD lisansı olmadan görüntüleme | Teklif usulü |
| Linear / Notion (genel SaaS) | Workspace → Takım/Teamspace → proje/sayfa | Admin, üye, (Notion) misafir | Notion: sayfa bazında misafir | Üye başına |

### Ortak kalıp

1. **Üç katman:** firma (workspace) → proje → dosya. Klasör projenin içinde, ikincil.
2. **İki düzey yetki:** firmadaki rol (kim yönetir, kim ödenir) + proje/dosyadaki erişim (kim neyi görür). Yönetici rolleri her projeyi görür.
3. **Dış kişi = misafir:** firmanın üyesi değil, koltuk tüketmez, yalnızca kendisine açılanı görür, firma ayarlarını hiç görmez.
4. **Link paylaşımı ayrıdır:** hesapsız, en hafif erişim; misafirden farkı kimliğin belli olmaması.
5. **Ücret iç kullanıcıdan alınır;** görüntüleyen dış kişi ücretsiz. Bu, tedarikçi/müşteri ağının ürünü yaymasını sağlar (Onshape, CAD ROOMS).

## 3. VizCad önerisi

```
Workspace (firma ya da kişisel)
├── Üyeler ........ Sahip · Yönetici · Üye        (koltuk)
├── Misafirler .... dış kişiler                    (koltuk değil)
├── Projeler
│   ├── Erişim: "Tüm ekip" (varsayılan) ya da "Yalnızca davetliler"
│   ├── Proje üyeleri + misafirler, her biri bir erişim düzeyiyle
│   └── Dosyalar → Sürümler, yorumlar        (ileride: klasörler)
├── Projesiz dosyalar (tüm üyelere açık)
└── Aktivite kaydı (kim, neyi, ne zaman açtı/indirdi/paylaştı)
```

**Tek erişim dili.** Dosya, proje, link ve misafir için aynı üç düzey: **Görüntüleyebilir · Görüntüleyip indirebilir · Düzenleyebilir.** Satın almacı ya da tedarikçi her yerde aynı kelimeleri görür (D11). "Görüntüleyebilir" sunucuda gerçekten uygulanana kadar (audit 🔒) arayüzde vaat edilmez.

**Proje neden var.** Drive kullanıcısı klasörle düşünür, ama bir firmada işin doğal birimi müşteri işi, ürün ya da ihaledir. Proje hem gruplama hem **erişim sınırı**: "Pompa revizyonu" projesine tedarikçiyi misafir olarak ekleyince yalnızca o projeyi görür. Bu, `05-market.md`'deki 1 numaralı ayrışma yönünün (tedarikçi ve teklif işbirliği) çekirdeği. Klasörler ileride projenin içine gelir (D15 ile uyumlu).

**Kişisel workspace'te de proje var ama zorunlu değil.** Dosya projesiz de durabilir; tek kullanıcı için ek adım yok.

**Misafir ile link farkı.**
| | Link | Misafir |
|---|---|---|
| Hesap | Gerekmez | E-posta ile giriş (şifresiz bağlantı da olabilir) |
| Kapsam | Tek dosya | Proje ya da dosya |
| Kimlik ve kayıt | "Link ile açıldı" | "Ömer Koç (Koç Kalıp) açtı, indirdi" |
| Süre | Son kullanma tarihi | Son kullanma tarihi + elle kaldırma |
| Yorum | Hayır | Evet |
| Koltuk | Hayır | Hayır |

**Aktivite kaydı.** Sahip ve yöneticiler workspace'teki tüm erişimleri görür (dosya açıldı, indirildi, paylaşıldı, misafir eklendi). Güvenli paylaşım iddiasının kanıtı bu; rakiplerde kurumsal planlarda var, bizde temel olabilir.

**Ücret (Q10 için girdi).** Koltuk = Sahip, Yönetici, Üye. Misafir ve link izleyicisi ücretsiz. Limitler `Entitlements`'tan (D2): koltuk, depolama, dosya boyutu, misafir sayısı, kısıtlı proje sayısı.

## 4. Kapsam

**İlk sürüm (Faz 3–4):** workspace (kişisel + firma), üyeler ve 3 rol, e-posta daveti, projeler (tüm ekip / yalnızca davetliler), misafir (görüntüle, indir, yorum), link paylaşımı, aktivite kaydı, workspace değiştirici.

**Sonra, talebe göre:** proje içi klasörler · misafirin dosya yüklemesi (teklif dosyası) · teklif/RFQ akışı (son tarih, teklif toplama, ihale bitince erişimi kapatma) · onay/yayın durumu (taslak → onaylı revizyon) · özel roller · SSO.

**Bilerek yapmıyoruz:** parça numarası, BOM, değişiklik talebi (ECO), check-in/out. Bunlar Bild ve CAD ROOMS'un PDM alanı; mühendis olmayan kullanıcıyı uzaklaştırır (D11) ve doğrudan rekabet demek (`05-market.md`).

## 5. Altyapıya etkisi

- better-auth `organization` plugin'i: workspace = organization, üye ve davet tabloları hazır. Roller: `owner`, `admin`, `member`, `guest`. Misafir teknik olarak `guest` rollü üyelik olarak tutulabilir; böylece oturumda aktif workspace mantığı aynı kalır, ama arayüz ve faturalama onu üye saymaz.
- Projeler bizim tablomuz: `projects` (workspaceId, ad, erişim modu), `project_access` (projectId, userId, düzey). better-auth'un "teams" özelliği proje için kullanılmaz; erişim düzeyi kavramı orada yok.
- Bir tedarikçi birden fazla üreticinin misafiri olabilir, artı kendi kişisel workspace'i olur. Bu yüzden **Q11 (birden fazla organizasyona üyelik) "evet" olmak zorunda.**
- `permissions.ts` tek karar fonksiyonu: workspace rolü + proje erişimi + dosya paylaşımı + link → sonuç (D2). Çekirdek yine yalnızca `workspaceId` ve yetki sonucunu bilir.
- Aktivite kaydı için `access_log` (workspaceId, aktör ya da link, dosya, eylem, zaman); indirme ve önizleme sunucudan geçtiği için kayıt da sunucuda (audit düzeltmesi 2).

## 6. Bilgi mimarisine etkisi

Sol menü önerisi (03-design §1'in yerine geçer, onaylanırsa):

```
[Demir Makina ▾]      workspace değiştirici; misafir olduğun firmalar da burada, "Misafir" etiketiyle
Ara ⌘K
Projeler              proje listesi; kısıtlı olanlarda kilit
Tüm dosyalar          projeli + projesiz, filtreler: son açılanlar, yıldızlı, benim yüklediklerim
Paylaşılanlar
Ekip                  sekmeler: Üyeler · Misafirler · Davetler
Aktivite              yalnızca sahip/yönetici
Ayarlar
──
Çöp kutusu
```

Misafirin gördüğü menü: yalnızca kendisine açılan projeler ve dosyalar; Ekip, Aktivite, Ayarlar yok.

Tasarlanacak organizasyon ekranları: workspace değiştirici · workspace oluşturma (onboarding) · projeler listesi + proje oluşturma · proje sayfası (dosyalar + erişim) · ekip (üyeler, misafirler, davetler) · davet kabulü (üye ve misafir için ayrı metin) · aktivite kaydı · workspace ayarları.

## 7. Onay bekleyen kararlar

1. Projeler ilk sürümde var mı (klasör yerine birincil gruplama ve erişim sınırı)?
2. Misafir modeli: dış kişi koltuk tüketmez, yalnızca kendisine açılanı görür, yorum yapabilir, yükleyemez (şimdilik)?
3. Tek erişim dili: Görüntüleyebilir · Görüntüleyip indirebilir · Düzenleyebilir?
4. Workspace rolleri üç tane mi (Sahip, Yönetici, Üye), yoksa ayrıca "İzleyici" üye rolü de olsun mu? Öneri: üç; içeride yalnızca bakacak kişiye proje/dosya düzeyinde "Görüntüleyebilir" verilir.
5. Q11: birden fazla workspace'e üyelik evet (misafir modeli bunu gerektirir).

## Kaynaklar
- Frame.io V4 hiyerarşi ve roller: https://next.developer.frame.io/platform/docs/guides/accounts-projects-and-workspaces · https://next.developer.frame.io/platform/docs/guides/managing-user-permissions · https://help.frame.io/en/articles/9875389-user-roles-and-permissions
- Onshape misafir, light kullanıcı ve proje rolleri: https://cad.onshape.com/help/Content/Plans/users.htm · https://www.onshape.com/en/resource-center/tech-tips/tech-tip-working-with-third-parties · https://cad.onshape.com/help/Content/Plans/project_roles_and_permission_schemes.htm · https://www.onshape.com/en/resource-center/tech-tips/manage-users-teams-onshape-standard-professional-enterprise-plans
- CAD ROOMS roller ve misafir paylaşımı (resmî olmayan yardım sayfası kopyası): https://cad-rooms-help-center-bullet.pages.dev/understanding-roles-and-permissions · https://cad-rooms-help-center-bullet.pages.dev/secure-external-collaboration-with-guest-sharing/ · fiyat: https://www.getapp.com/operations-management-software/a/cad-rooms
- Bild tedarikçi işbirliği: https://www.getbild.com/plm/supplier-collaboration
