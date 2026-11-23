# Faz 3 · Kimlik, workspace ve erişim tasarımı

Durum **uygulama önerisi**. D1, D2, D7, Q2 ve D17 bağlayıcıdır. D17, faz planındaki eski rol adlarını ve ürün modelinin §4’ündeki rol sayısını günceller. Faz 3 kimliği, workspace’leri, proje ve misafir erişimini ve saf izin politikasını kurar. Faz 4 aynı politikayı dosya, sürüm, yorum ve link uçlarına uygular. Faz 5 etkileşimli önizleme için güvenli çıktı üretimini doğrular. [Kararlar](01-decisions.md) · [Ürün modeli](06-product-model.md) · [Faz planı](00-refactor-plan.md) · [Özellik denetimi](02-feature-audit.md)

## 1. better-auth ve `Auth` servisi

**Doğrulanan sürüm `better-auth` 1.4.7.** Legacy `main` (`090a4a3`) altındaki kurulu paketin `package.json` ve pnpm kilidi bu sürümü gösteriyor. Legacy npm kilidi `1.4.18` çözümlüyor. İncelenen Faz 1 worktree’sinde paket henüz kurulu değil ve hedef sürüm seçilmemiş. Aşağıdaki gözlemler `1.4.7` içindir. Uygulamada seçilen sürümü pnpm kilidine sabitle, aynı sürümden şema üret, bu davranışları entegrasyon testinde tekrar doğrula.

| Konu | Kurulu kaynakta gözlenen davranış | VizCad tasarımı |
|---|---|---|
| Rol ifadeleri | `createAccessControl` ve `ac.newRole` kaynak → eylem listesi alır. Plugin, `roles` ile varsayılan rolleri birleştirir. Virgülle ayrılan çoklu rolleri de değerlendirir. | Beş statik rolü de açıkça tanımla, `creatorRole = owner`. Schema ve D1 tek rolü zorunlu kılsın. `teams` ve `dynamicAccessControl` kapalı. |
| Davet | Kabulde bekleyen durum, süre ve e-posta eşleşmesi kontrol edilir. Doğrulanmış e-posta kontrolü seçenekle açılır. Kabul önce davet durumunu, sonra üyeliği ve aktif workspace’i yazar. Gönderim hook’u davet yazıldıktan sonra çalışır. Kabuldeki varsayılan üye sayımı `guest` satırlarını da kapsar. | `requireEmailVerificationOnInvitation = true` ek savunma. Ürün davetleri için aşağıdaki atomik programları ve `Entitlements` sayımını kullan. |
| Birden fazla workspace | Listeleme `userId` ile bütün `member` satırlarının organizasyonlarını getirir. Satırda rol filtresi yoktur. `setActiveOrganization` üyelik arar, `session.activeOrganizationId` alanını günceller ve başarıda oturum çerezini yazar. | Aktif workspace oturumda bir gezinme tercihi. Seçicide üyelik rolünü ve misafirin canlı kapsamlarını ayrıca yükle. |
| Uçların sınırlandırılması | Üye ekleme sunucu API’si. Plugin başka üyelik, davet ve organizasyon uçlarını HTTP’ye açar. `disabledPaths` normalleştirilmiş HTTP yollarına uygulanır. | `Auth.handleIdentityRequest` yalnızca kullanılan kimlik uçlarını izin listesine alır. `/organization/*` ve platform admin mutasyonları ürün uçlarının arkasında kalır. Worker testinde doğrudan isteğin reddini ve gerekli OAuth callback’lerini doğrula. |

Yerel paket referansları `dist/plugins/organization/{organization,adapter,permission}.mjs`, `dist/plugins/organization/routes/{crud-org,crud-invites,crud-members}.mjs`, `dist/plugins/organization/types.d.mts`, `dist/plugins/organization/access/statement.mjs`, `dist/plugins/access/access.mjs` ve `dist/api/index.mjs`.

### Rol ifadeleri

`defaultStatements` üzerine `project`, `file`, `guest`, `activity` ve `billing` kaynaklarını ekle. Aşağıdaki ifade listesi rolün **üst sınırıdır**. Kapsam ve süre her istekte §4 ile çözülür. `team` ve `ac` dizileri boş. `project:view` ve `file:view`, misafirde yalnızca atanmış kaynağa uygulanır.

| Rol | better-auth kaynak → eylem ifadeleri |
|---|---|
| `owner` | `organization: update, delete, transfer`; `member: create, update, delete`; `invitation: create, cancel`; `project: view, create, update, grant`; `file: view, comment, download, edit, upload, share`; `guest: grant, revoke`; `activity: read`; `billing: manage` |
| `admin` | `organization: update`; `member: create, update, delete`; `invitation: create, cancel`; `project: view, create, update, grant`; `file: view, comment, download, edit, upload, share`; `guest: grant, revoke`; `activity: read` |
| `member` | `project: view, create`; `file: view, comment, download, edit, upload, share`; `guest: grant, revoke` (yalnız düzenleyebildiği dosyadaki misafir paylaşımı) |
| `commenter` | `project: view`; `file: view, comment` |
| `guest` | `project: view`; `file: view, comment, download` |

`user.role` platform düzeyindedir. Workspace rolü `member.role` alanından gelir. Firma sahipliği ayrı işlemle devredilir. Yönetici `member` ve `commenter` rollerini davet eder, değiştirir ve kaldırır. Sahip bunlara ek olarak `admin` rolünü yönetir. Misafir ekleme ve yükseltme, kayıtlı erişimlerin kapsamını koruyan ayrı akışlardır. Kişisel workspace’in tek iç üyesi sahibidir. Misafir paylaşımı kişisel workspace’te de çalışır. Firma workspace’ini arşivleme sahibine açıktır. Faturalandırma workspace’e bağlıdır ve sahibine ayrılır. Faz 3’te faturalandırma işlemi `FEATURE_UNAVAILABLE` döner (D7, D15).

### Kimlik, davet ve aktif workspace

- Kimlikte e-posta/parola, doğrulama, şifre sıfırlama ve Google akışı korunur. Kayıt ucu better-auth çağrısından önce sunucuda Turnstile doğrular. `AppConfig` sabit site kökünü, güvenilen origin’leri ve doğrulanmış gizli ayarları sağlar. `Email`, doğrulama, sıfırlama ve davetleri beş dilde gönderir. İlk doğrulanmış oturum `ensurePersonalWorkspace` ile kişisel workspace’i tamamlar. Onboarding workspace adı, ekip büyüklüğü, kullanım amacı ve D6 anketini kaydeder. Anket yanıtı mevcut `survey_responses` tablosuna gider, onboarding tamamlanma işaretiyle aynı batch’te bir kez yazılır.
- **Üye daveti** `invitation` tablosuna workspace ve tek iç rol ile yazılır. Kabul, aynı normalize e-postaya sahip doğrulanmış oturumda açık onay ister. Geçerli davet ve davet edenin güncel yetkisi, rol, koltuk ve üyelik yeniden kontrol edilir. Davet, üyelik ve audit tek batch’te değişir. Aynı kullanıcının tekrar kabulü aynı sonucu verir. Mevcut misafir, açık üye davetiyle iç role yükseltilebilir. Var olan kapsam izinlerinin düzeyi korunur.
- **Misafir daveti** `resource_invitations` tablosunda tek proje veya dosyaya bağlıdır. Varsayılan `comment`, en yüksek `download`, erişim bitişi zorunlu. Doğrulanmış alıcı açık kabul verince, davet edenin o kaynaktaki güncel paylaşım yetkisi ve kaynak durumu yeniden kontrol edilir. `member.role = guest` satırı gerekirse açılır ve ilgili erişim yazılır. Zaten iç üye olan alıcı için misafir akışı `RoleConflict` döner. İç üyeye proje/dosya düzeyi atama ayrı yapılır. Davetin kabul süresi ve verilen erişimin bitişi iki ayrı alandır. E-posta başarısız olursa davet kalır, tek satır üzerinden yeniden gönderilir. İlk sürümde giriş/kayıt kullanılır.
- **Workspace seçimi** ancak geçerli iç üyelik veya en az bir canlı proje/dosya izni olan misafire açılır. Misafir seçicide “Misafir” etiketiyle ve kapsamındaki kaynaklarla görünür. Ekip, ayarlar ve aktivite menüleri iç rol izinlerine göre üretilir. Dosya misafiri proje adını veya kardeş dosyaları sırf dosya erişimi üzerinden öğrenemez. Kabulden sonra ayrı bir `switchWorkspace` çağrısı yapılır. Çerez güncellemesi başarısızsa kabul kaydı geçerlidir ve seçim tekrar denenir. Aktif workspace kaldırılmış, arşivlenmiş veya süresi geçmişse sonraki istekte kişisel workspace’e dönülür. Kaynağın workspace’i her zaman kaynaktan çözülür. Derin bağlantılar ve başka sekmelerdeki seçim sunucu kararını değiştirmez.

### Effect sınırı

| `Auth` operasyonu | Sonuç ve hata yüzeyi |
|---|---|
| `handleIdentityRequest(request)` | İzin listesi ve kayıt kontrolünden geçen better-auth kimlik uçları için `Response`, callback ve `Set-Cookie` dahil. Beklenmeyen SDK arızası `AuthError`. |
| `readSession(headers)` | Doğrulanmış oturum özeti veya boş sonuç. Özet `sessionId`, `userId`, e-posta, `emailVerified`, hesap durumu ve `activeWorkspaceId` taşır. Ürün yetkisini veya session token’ı taşımaz. |
| `setActiveWorkspace(headers, workspaceId)` | Yetkisi `switchWorkspace` programında çözülmüş oturum için aktif alan ve gerektiğinde yanıt başlıkları. `Unauthenticated`, `WorkspaceUnavailable`, `AuthError`. |

`Auth.live.ts` better-auth ve Worker uyarlamasını, `Auth.memory.ts` oturum ve hata senaryolarını taşır. SDK çağrılarını `Effect.tryPromise` ve tagged error ile sar. `Db.use` aynı Drizzle D1 sürücüsüyle şema ve atomik ürün yazımlarını yürütür. Drizzle adapter için `provider: sqlite`, açık şema ve `transaction: false`. Kurulu adapter’ın işlem seçeneği `db.transaction` çağırır. Ürün programları, plugin şemasını ve aktif workspace API’sini kullanır, organizasyon mutasyonlarını koşullu D1 batch’leriyle kendileri uygular. `permissions.ts` ürün kararının tek kaynağıdır. `Entitlements` koltuk, misafir, kısıtlı proje, boyut ve depolama limitlerini verir. Üyelik ve erişim okumaları ana D1 üzerinden yapılır. [D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/) · [D1 okuma replikasyonu](https://developers.cloudflare.com/d1/best-practices/read-replication/)

## 2. Eklemeli D1 şeması

Aşağıda `?` nullable, `PK` birincil anahtar, `FK` yabancı anahtar, `UQ` benzersiz kısıttır. Kimlikler ve metinler `TEXT`, tarihler mevcut Drizzle `timestamp` eşlemesiyle UTC Unix saniyesi `INTEGER`, bayraklar `INTEGER 0/1` olur. Tarih karşılaştırması `now >= expiresAt` ise süresi dolmuş kabul eder. Yeni iş alanları aksi belirtilmedikçe zorunludur. Plugin sütunları kurulu kaynak sözleşmesidir. İndeksler, ilave sütunlar ve iş kısıtları VizCad önerisidir.

| Tablo | Sütunlar | İndeks ve kısıtlar |
|---|---|---|
| `organization` | `id PK`, `name`, `slug`, `logo?`, `createdAt`, `metadata?` (JSON); VizCad `kind`, `personalOwnerUserId?`, `archivedAt?` | `UQ(slug)`, `UQ(personalOwnerUserId)` ve kullanıcı FK. `kind` kişiselde `personal`, firmada `company`. `personalOwnerUserId` yalnız kişiselde ve zorunlu. `kind` ve kişisel sahip kimliği oluşturulduktan sonra sabit. |
| `member` | `id PK`, `organizationId`, `userId`, `role` (varsayılan `member`), `createdAt` | Workspace ve kullanıcı FK. `UQ(organizationId,userId)`, `(userId,organizationId)`, `(organizationId,role)`. Tam beş rol için `CHECK`. Üyelik silinince kapsam izinleri cascade ile silinir. |
| `invitation` | `id PK`, `organizationId`, `email`, `role` (plugin’de nullable, uygulama şemasında zorunlu), `status` (varsayılan `pending`), `expiresAt`, `createdAt`, `inviterId`; VizCad `acceptedByUserId?` | Workspace ve kullanıcı FK’leri. `role ∈ {admin, member, commenter}`, `status ∈ {pending, accepted, rejected, canceled}`. Bekleyenler için kısmi `UQ(organizationId,email)`. `(email,status,expiresAt)` ve `(organizationId,status,expiresAt)`. Süresi geçmiş bekleyen kayıt yeni davetten önce aynı batch’te kapatılır. |
| `session` (mevcut) | Ekle `activeOrganizationId?` | Organization FK `ON DELETE SET NULL`, indeks `(activeOrganizationId)`. Oturum biçimi, `token` ve `userId` korunur. |
| `projects` | `id PK`, `workspaceId`, `name`, `description?`, `accessMode` (varsayılan `team`), `createdByUserId?`, `createdAt`, `updatedAt`, `archivedAt?` | Workspace FK, oluşturucu FK `SET NULL`; `CHECK` `team/restricted`; `UQ(workspaceId,id)`, `(workspaceId,archivedAt,name,id)`. Ad boş olamaz. `workspaceId` sabit. |
| `files` (mevcut) | Ekle `workspaceId?`, `projectId?`. `userId`, `r2Key`, `thumbnailR2Key` ve sürüm tablosu aynen kalır. | Ayrı workspace ve proje FK, `UQ(workspaceId,id)`, `(workspaceId,isDeleted,updatedAt,id)` ve `(workspaceId,projectId,isDeleted,updatedAt,id)`. Ekleme/güncelleme trigger’ı projeli dosyada workspace’in dolu ve projeyle aynı olmasını zorunlu kılar. Nullable alanlar legacy yazarı destekler, yeni akışta workspace şarttır. |
| `project_access` | `workspaceId`, `projectId`, `userId`, `level`, `expiresAt?`, `grantedByUserId?`, `createdAt`, `updatedAt` | `PK(projectId,userId)`, `(workspaceId,userId,expiresAt)`. Bileşik FK `(workspaceId,projectId)` → proje, `(workspaceId,userId)` → üyelik, silmede cascade. `level ∈ {view,comment,download,edit}`. |
| `file_access` | `workspaceId`, `fileId`, `userId`, `level`, `expiresAt?`, `grantedByUserId?`, `createdAt`, `updatedAt` | `PK(fileId,userId)`, `(workspaceId,userId,expiresAt)`. Aynı bileşik FK ve seviye kuralları, hedef `files`. Yalnız ilgili dosyayı kapsar. |
| `resource_invitations` | `id PK`, `workspaceId`, `projectId?`, `fileId?`, `email`, `level`, `expiresAt`, `accessExpiresAt`, `status`, `tokenDigest`, `inviterId`, `acceptedByUserId?`, `createdAt` | Proje/dosya alanlarından tam biri dolu. Workspace ile hedefe bileşik FK, davet eden/alıcı kullanıcı FK. `UQ(tokenDigest)`, ayrı kısmi bekleyen `UQ(projectId,email)` ve `UQ(fileId,email)`, `(workspaceId,status,expiresAt)`. `CHECK(accessExpiresAt > expiresAt)`. `level ∈ {view,comment,download}` ve `invitation` ile aynı durum kümesi. |
| `share_links` | `id PK`, `workspaceId`, `fileId`, `createdByUserId?`, `tokenDigest`, `level`, `passwordHash?`, `expiresAt?`, `revokedAt?`, `revision`, `createdAt`, `updatedAt` | Bileşik dosya FK, oluşturucu FK `SET NULL`. `UQ(tokenDigest)`, `(workspaceId,fileId,revokedAt)`. `CHECK` `view/download`, `revision >= 1`. Yeni token CSPRNG ile, veritabanında yalnız token özeti. Parola doğrulama kanıtı link ve revizyona bağlı. |
| `access_log` | `id PK`, `workspaceId`, `actorKind`, `actorUserId?`, `linkId?`, `targetKind`, `targetId`, `action`, `outcome`, `requestId`, `createdAt`, `reason?` | `(workspaceId,createdAt,id)`, `(workspaceId,targetKind,targetId,createdAt,id)`. `actorKind` kullanıcı/link/sistem, karşılık gelen tek aktör kimliği veya sistemde hiçbiri, `outcome` izin/ret. Kimlikler olay anı değerleridir. Audit, kullanıcı veya hedef silinse de tutulur. Parola, token, URL ve ham istek saklanmaz. |
| `legacy_access_migration` | `sourceTable`, `sourceId`, `outcome`, `targetId?`, `reason?`, `createdAt` | `PK(sourceTable,sourceId)`, `(sourceTable,outcome)`. Kaynak `file_shares/file_invitations`, sonuç `mapped/ineligible/quarantined`, eşlenen satırda hedef kimliği zorunlu. Geçiş muhasebesi için, sır saklamaz. |

Erişim tablosundaki `grantedByUserId` kullanıcı FK `SET NULL`. Misafir erişimi program içinde bitişli ve en çok `download` yazılır. Okuma tarafı hatalı rol/düzey/süre değerlerinde de §4’teki tavanı uygular, süresiz misafir kaydını reddeder. `organizationRole`, `team`, `teamMember` ve `activeTeamId` kurulu plugin şemasında ilgili özelliklere bağlıdır. Bu yapılandırmada migration’a girmez. Fiziksel workspace/proje silme ilk fazda kapalıdır. Legacy kullanıcı silme cascade’i `files.userId` üzerinden çalışır, bu yüzden cutover sonrasında platform hesabı silme ucu arşivleme/sahiplik politikası tasarlanana kadar kapalıdır. [D1 yabancı anahtarları](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)

**Eşzamanlılık.** Üyelik, davet durumu, izin ve ilgili audit kaydı tek `Db.use` batch’inde yazılır. Aktörün güncel yetkisi, hedef workspace, önceki durum, son sahip ve kota sayımları yazım koşuluna girer. Audit yalnız geçerli durum geçişi için eklenir. Sıfır etkilenen satır, yetki/kota/durum çakışması veya idempotent tekrar olarak çözülür. Benzersiz kısıtlar yinelenen üyeliği, grant’i ve daveti engeller. Rol düşürme/kaldırma ile son sahip kontrolü aynı yazımda yapılır. Devir tek batch’te önce hedefi sahip yapar, ardından eskisini yöneticiye indirir. Kabulden sonra oturum seçimi ve e-posta, D1 batch’inin dışında yeniden denenebilir.

## 3. Mevcut veriden geçiş

**Başlangıç noktası.** Legacy `drizzle/0000–0011` Faz 1 worktree’sinde de mevcut. `0004` düz metin `file_shares.password` alanını ekliyor. `0011` bekleyen dosya davetlerini ekliyor. Legacy e-postada `/signup?invite=…` kullanılıyor. Kullanıcı oluşturma hook’u davetleri e-posta ile bulup paylaşım açıyor ve davet süresini yeni paylaşıma taşımıyor. Legacy indirme ucu kullanıcı paylaşımında `isActive` kontrol ediyor, süreyi sorgulamıyor. Geçiş, verideki süre ve iptal koşullarını uygular. [Legacy inceleme özeti](02-feature-audit.md)

### Eşleme

| Kaynak | Hedef ve karar |
|---|---|
| `user`, `account`, `session`, `verification` | Kimlikler ve mevcut hesaplar korunur. Her kullanıcı için sabit, çakışmasız kişisel workspace kimliği ve slug, aynı batch’te `owner` üyeliği. `user.role` workspace’e kopyalanmaz. Mevcut oturumların yeni Worker’a taşınabilirliği yerel entegrasyonda doğrulanacak. |
| `files` ve sürümler | `files.userId` → sahibin kişisel `workspaceId` alanı. Dosyalar `projectId = NULL` kalır. Yükleme durumları ve çöp dahil tüm satırlar korunur. R2 nesneleri veya anahtarları taşınmaz. |
| Aktif kullanıcı paylaşımı | Dosyanın workspace’inde `guest` üyeliği ve tek `file_access` satırı. `view → view`, `edit/admin → download` (eski indirme erişimini korur). Mevcut alıcı iç üyeyse rolüne dokunmadan dosya izni eklenir. Eski `expiresAt` korunur, süresiz kişisel erişime önerilen geçiş bitişi cutover + 90 gün. |
| Bekleyen `file_invitations` | Yalnız ilgili dosya için `resource_invitations`. `view → view`, `edit/admin → download`. Eski e-posta bağlantısı kabul sayfasına taşınır ve aynı doğrulanmış e-posta ile açık kabul ister. Varsa eski tarih kabul sonudur, süresiz davet için öneri cutover + 30 gün. Geçişte erişim sonu kabul sonundan 90 gün sonra olarak belirlenir. Kaydı bulunmayan eski davet geçmişi tahmin edilmez. |
| Aktif link paylaşımı | `share_links`. `view → view`, `edit/admin → download`. Süresi dolmuş/iptal edilmiş satırlar erişim üretmez. `/shared/$token` → `/s/$token`, eski token özeti geçici olarak tanınır. Legacy token’lar `Math.random` ile üretilmiş. Öneri yenileme için cutover + 30 gün üst sınırı, daha erken mevcut bitiş varsa onu koru. Yeni token CSPRNG ile üretilir. |
| Hatalı, çelişkili veya kapsam dışı satır | Beklenmeyen tip, boş token, çelişkili yinelenen hedef veya çözülemeyen başvuru `quarantined` olur. Tam aynı kapsam/düzey/süreye ait tekrarlar tek hedefe eşlenebilir. Süresi geçmiş, iptal edilmiş veya çöp dosyaya bağlı satır `ineligible` olur. Kaynak satır geçiş boyunca saklanır ve yetki hesaplamasına katılmaz. |

Legacy link parolası yeni `passwordHash` alanına rastgele tuzlu, sürümlü scrypt özeti olarak taşınır. Legacy eşitlik davranışı için parola girdisi aynen kullanılır. Kopyada çevrimdışı hash üretimini ve Worker’da doğrulamanın CPU/bellek maliyetini ölç. Doğrulama ve migration loglarında parola, hash, token veya URL yer almaz. Parola POST gövdesinden alınır. Doğrulama hız sınırı, kısa ömürlü `HttpOnly`/`Secure` çerez, link ve `revision` bağlama uygulanır. Parola değişimi veya iptal önceki kanıtı geçersiz kılar. Link parolasının geçmişte URL’ye girmiş olabileceği hesaba katılarak link/parola yenilemesi sunulur.

### Sıra ve idempotans

1. **Prova.** Önce kurmaca fixture’lar, ardından yalnız onayla alınmış prod D1 kopyasının yalıtılmış çalışma kopyası. Gerçek e-posta ve R2 yazımı kapalı. Başlangıçta şema, migration geçmişi, tablolar, sayımlar ve tek bir geçiş zamanı kaydedilir. Prod’da bu görev kapsamında hiçbir işlem yapılmaz.
2. **Şemayı genişlet.** Tablolar, nullable alanlar, indeksler ve koruyucu trigger’lar eklenir. Legacy şeması ve okuyucu bu adımda çalışabilir. Kaynak kayıtlar yeni ACL’ler üzerinden henüz sunulmaz.
3. **Backfill.** Workspace/üyelik kimlikleri deterministik. Dosya doldurma koşulu `workspaceId IS NULL`; beklenen eşlemeyle farklı olan satırlar incelemeye çıkar. Her eski paylaşım/davet, hedef kayıt ve geçiş muhasebesiyle aynı batch’te işlenir. Tekrar çalıştırmada aynı kaynak kimliği ikinci hedef yaratmaz. Hash yalnız ilk eşlemede yazılır. İlk koşu, yarıda kesip devam ve tam tekrar aynı hedef kapsama ve sayımlara ulaşır.
4. **Cutover provası.** Legacy yazımları kısa bir pencerede durdur. Son kaynak görüntüsünden, ilk denemelerden kalmış iş tablosu durumuna güvenmeden backfill yap ve aşağıdaki kontrolleri çalıştır. Prod için aynı sıra ayrıca onaylanır. Yeni uçları birlikte aç. Eski `/api/shared/*` ve dosya indirme uçları ham dosyaya eski yetkiyle erişim veremez. Eski ham presigned GET’ler için kaynakta görülen bir saatlik ömrü hesaba kat. Cutover provası varsayılan olarak eski URL’ler sona erene kadar bunların geçerliliğini test eder ve bu pencereyi yayın takvimine katar.
5. **Parola temizliği.** Legacy paylaşım okuyucusunun kapanışı ve yeni hash doğrulaması teyit edilince eski `file_shares.password` değerlerini onaylı ayrı veri adımında `NULL` yap. Sütun ve kaynak kayıtlar yerinde durur. Düz metin içeren geçiş kopyaları erişimi kısıtlı saklama planına alınır.

### Prova doğrulama sorguları

`önce` sayımları son yazma kesimindeki kaynak görüntüsünden alınır. Aşağıdaki sorgular salt okunur ve yalnız kopya içindir.

| Sorgu | Beklenen sonuç |
|---|---|
| `COUNT(*)` ayrı ayrı `user`, `account`, `files` ve `file_versions` üzerinde. Dosya için toplamı `isDeleted/status` ile grupla. | Önce = sonra, her grup dahil. |
| `user` → `organization` (`personalOwnerUserId`, `kind=personal`) → `member` (`userId`, `role=owner`) sol birleştirme, kullanıcı başına eşleşme sayısı. Aktif workspace’lerde ayrı sahip sayımı. | Her kullanıcı tam bir kişisel workspace ve sahip satırına eşlenir. Sıfır sahipli aktif workspace = 0. |
| `files` → kişisel `organization` eşlemesi. Null veya `files.workspaceId` ile eşleşmeyen workspace, dolu `projectId` ve workspace’ler arası proje bağlantısı sayısı. | Backfill sonunda her sayaç = 0. |
| Önce/sonra `(id,userId,r2Key,thumbnailR2Key)` dosya kümesi ve `(id,fileId,r2Key)` sürüm kümesi için iki yönlü `EXCEPT`. | Her iki yönde fark = 0. |
| Kaynak tablo başına `COUNT(*)` ile muhasebede `mapped + ineligible + quarantined`; iki yönlü kaynak kimliği anti-join; `mapped` hedefi için ilgili ACL/link/davet varlık sorgusu. | Kaynak sayısı = sonuçların toplamı, eksik/fazla ID ve hedefsiz eşleme = 0. Tekilleştirilen kaynaklar için `COUNT(DISTINCT targetId)` hedef adediyle eşleşir. Karantinadaki her satır inceleme listesine girer. |
| Aktif parola korumalı eşlenmiş linkler → `passwordHash IS NULL`; her eşleme için kopyada doğru/yanlış parola doğrulaması. Temizlikten sonra `file_shares.password IS NOT NULL` sayımı. | Eksik hash ve hatalı doğrulama = 0. Temizlik sonrası düz metin satır sayısı = 0. |
| `PRAGMA foreign_key_check`, geçersiz rol ve duplicate üyelik/grant grupları, canlı misafir izni olup bitişi boş olan kayıtlar. | Sonuç kümeleri boş. |

**Geri dönüş.** Yeni yazımlar açılana kadar uygulama sürümünü geri al ve eklemeli şemayı yerinde bırak. Eski paylaşım açığına dönmemek için ham önizleme ve eski paylaşım API’leri kapalı kalır. Yeni firma, erişim veya çalışma alanı yazımları başladıktan sonra legacy’ye otomatik dönüş veri/kapsam kaybettirir. Yazımları dondur, cutover snapshot’ı ve değişiklikleri karşılaştır, ileri düzeltme veya doğrulanmış veri uzlaştırması uygula. Eski düz metin parolaları geri yükleme.

## 4. `permissions.ts`

**Sözleşme.** Tek saf `decidePermission` fonksiyonu bir `allowed` sonucu ve kararlı bir `reason` kodu döndürür. Aktör girdisi hedef workspace’e bağlı güncel `member.role`, doğrulanmış misafir veya tek dosyaya bağlı link kanıtıdır. Oturumsuz ve üyeliği kaldırılmış aktör de temsil edilir. Kaynak workspace/proje/dosya ve gerekirse sürüm kimliği, projenin `team/restricted` modu, arşiv/çöp/yükleme durumu, geçerli proje ve dosya atamaları, işlem hedefi ve `now` girdi olur. Link girdisi hedef, düzey, bitiş, iptal, parola kanıtı ve revizyon taşır. Son sahip, hedef rol ve özellik kullanılabilirliği de ilgili eylem için girdidir. I/O, saat okuması, cookie ve hash doğrulama program katmanında kalır.

1. Kaynak zinciri aynı workspace’e ait olmalı. Üyelik hedef workspace’ten, dosya sürümü gerçek dosyadan çözülür. Arşiv ve çöp olağan içerik erişimini kapatır. Geri al/temizle ayrı eylemler olarak değerlendirilir. İndirme/önizleme yalnız hazır sürümde çalışır. Rol, kaynak veya workspace eşleşmesi eksikse erişim reddedilir.
2. Geçerli rol tabanı ve geçerli atamalar birleştirilir. Açık ekip projelerinde ve projesiz dosyalarda `member` tabanı `edit`, `commenter` tabanı `comment`. Kısıtlı projede bu iki rolün tabanı boş. Sahip ve yönetici tüm projelerde `edit` alır. Aktif proje izni alt dosyalara aynı düzeyde iner. Dosya izni yalnız o dosyada çalışır. İki izin bir aradaysa yüksek olan uygulanır. `commenter` tavanı `comment`, `guest` tavanı `download`. Misafirin rol tabanı boş ve kapsam kaydının bitişi zorunlu. Yükleyen kimliği (`files.userId`) ayrı erişim vermez.
3. D17 sırası `view < comment < download < edit`. `edit`, kaynak adı/içeriği ile sürüm yükleme gibi değişiklikleri kapsar. Paylaşım, grant, yeni dosya yükleme ve yönetim ayrıca değerlendirilir. `shareFile` için iç rol ve dosyada `edit`, verilecek izin için hedef rolün tavanı aranır. Kısıtlı projeyi oluşturan üyeye aynı batch’te `edit` proje ataması açılır. Proje ayarları, erişim modu ve grant’leri sahip/yönetici yönetir. Projeye yeni dosya yükleme, iç rol ve proje düzeyinde `edit` ister. Projesiz yükleme sahip/yönetici/üyeye açık. Dosya grant’i tek başına projeye dosya yükleme izni vermez.
4. Link uçları her ziyaretçi için link kapsamını kullanır. Link `view/download` ile sınırlı ve yorum her durumda kapalı. Geçersiz/iptal/süresi dolmuş link, eksik veya başka revizyona ait parola kanıtı `view` dahil tüm içerik erişimini kapatır. Geçerli dosya linki proje modundan bağımsız kendi dosyasını açabilir. Workspace ve proje listelemelerine katılmaz.

Kullanıcıya güvenle gösterilebilen nedenler arasında `INSUFFICIENT_LEVEL`, `ROLE_LIMIT`, `FEATURE_UNAVAILABLE`, `LINK_NO_COMMENTS` ve `LAST_OWNER` bulunur. Kaynak görünür değilse dışarıya tek 404/`RESOURCE_UNAVAILABLE` döner. `TENANT_MISMATCH`, `NO_MEMBERSHIP`, `GRANT_EXPIRED` gibi ayrıntılar yalnız sunucu tanısı ve yetkili audit görünümünde kullanılır. Görünür kaynakta arayüz izin sonucunu “devre dışı + neden” olarak gösterir. Sunucu listeleme, arama, son açılanlar, yıldızlılar, sayfa toplamı ve tekil uçlarda aynı kapsamı uygular. Liste sorgusu adayları workspace ve canlı grant ile daraltır ve sayfalama öncesi izinli küme doğrulanır.

### Tam test matrisi · içerik eylemleri

Her hücre bir **görüntüle / yorum / indir / düzenle** vektörüdür. `Ø=0000`, `G=1000`, `Y=1100`, `İ=1110`, `D=1111`, `L=1010`. `—` ürünün kabul etmediği link girdisi, karar testi `Ø` bekler. İlk dört iç rol ve misafir için sütun, ilgili kaynağa taşınan canlı atamaların en yüksek düzeyidir. Link satırlarında sütun, linkin düzeyidir. Rol tavanından yüksek misafir/yorumcu girdileri saf politika testinde özellikle denenir.

| Aktör | Proje modu | Yok | `view` | `comment` | `download` | `edit` |
|---|---|---|---|---|---|---|
| `owner` | Projesiz | D | D | D | D | D |
| `owner` | `team` | D | D | D | D | D |
| `owner` | `restricted` | D | D | D | D | D |
| `admin` | Projesiz | D | D | D | D | D |
| `admin` | `team` | D | D | D | D | D |
| `admin` | `restricted` | D | D | D | D | D |
| `member` | Projesiz | D | D | D | D | D |
| `member` | `team` | D | D | D | D | D |
| `member` | `restricted` | Ø | G | Y | İ | D |
| `commenter` | Projesiz | Y | Y | Y | Y | Y |
| `commenter` | `team` | Y | Y | Y | Y | Y |
| `commenter` | `restricted` | Ø | G | Y | Y | Y |
| `guest` | Projesiz | Ø | G | Y | İ | İ |
| `guest` | `team` | Ø | G | Y | İ | İ |
| `guest` | `restricted` | Ø | G | Y | İ | İ |
| Anonim link | Projesiz | Ø | G | — | L | — |
| Anonim link | `team` | Ø | G | — | L | — |
| Anonim link | `restricted` | Ø | G | — | L | — |
| Oturumsuz / üyeliği yok | Her üç mod | Ø | Ø | Ø | Ø | Ø |

Projesiz dosyada yalnız dosya ataması geçerlidir. Projeli dosyada her satırı `proje izni × dosya izni` olarak 5 × 5 üret. Beklenen sütun, iki girdinin tablodaki sıralamaya göre en yükseğidir. Süresi dolmuş, kaldırılmış, yanlış aktöre ya da kaynağa ait her girdi `Yok` olur. Proje sayfası için aynı matrisin görüntüleme biti yalnız proje izniyle değerlendirilir. Dosyadaki `edit` ile proje `edit` ayrımı ve görünür proje içindeki kardeş dosya izolasyonu ayrıca test edilir.

| Aktör | Dosya paylaşımı / dosya misafiri | Proje oluştur | Projeye dosya yükle | Proje ayarı / proje grant’i / proje misafiri | Üye yönet | Workspace ayarı | Aktivite | Sahiplik / arşiv | Fatura |
|---|---|---|---|---|---|---|---|---|---|
| `owner` | Evet | Evet | Evet | Evet | Evet, §1 sınırları | Evet | Evet | Firmada evet | Faz 8’de evet |
| `admin` | Evet | Evet | Evet | Evet | Evet, §1 sınırları | Evet | Evet | Hayır | Hayır |
| `member` | Dosyada `edit` ile | Evet | Projede `edit` ile | Hayır | Hayır | Hayır | Hayır | Hayır | Hayır |
| `commenter`, `guest`, anonim, üyeliği yok | Hayır | Hayır | Hayır | Hayır | Hayır | Hayır | Hayır | Hayır | Hayır |

İkinci matrisi de her geçerli mod/düzey birleşiminde çalıştır. Proje bağlamı bulunmayan proje eylemleri reddedilir. Yükleme tamamlanırken ilk izin yeniden doğrulanır. Silme/geri alma dosyada `edit` ve iç rol gerektirir, kalıcı temizleme sahip/yöneticiye ayrılır. Çöp kutusunda önceki geçerli erişim kapsamı korunur. Dosyayı taşımak için kaynak ve hedefte yazma izni gerekir, Faz 4’te workspace’ler arası taşıma kapalıdır.

| Sınır testi | Beklenen karar |
|---|---|
| Misafir bitişinden bir saniye önce, bitiş anında, sonra. İki grant’ten yalnız biri dolmuş. | Sırayla canlı/ret/ret. İkinci örnekte kapsam canlı grant kadar. Son canlı izinde seçiciden düşer. |
| Kaldırılan üye, eski aktif workspace çerezi, eski dosya URL’si, sonra yeniden katılım. | Eski kapsam kapalı, oturum kişisele döner. Silinen grant yeniden katılımla dirilmez. |
| Aynı kullanıcı A’da misafir, B’de yönetici ve kişiselde sahip. | Her workspace kendi rolünü kullanır. Aktif seçici ve platform `user.role` ayrıcalık taşımaz. |
| Son sahibi çıkarma, düşürme veya hesabını silme. İki sahip eşzamanlı ayrılır. | Son sahip işlemi reddedilir. Eşzamanlı yazımdan sonra en az bir sahip kalır. |
| `team → restricted`, dosya proje değişimi, grant revizyonu ve eşzamanlı indirme. | Sonraki istek güncel kapsamı görür. Hedef workspace tutarlılığı ve artık görünmeyen dosya/sürüm URL’si test edilir. |
| Link süresi, iptal, yanlış token/şifre, değiştirilmiş parola, yanlış dosya ve önceki revizyon. | Tümü içerik erişimini reddeder. Oturum açmış ziyaretçi link uçlarında yalnız link politikasını alır. |
| Arşiv proje, çöp dosya, yüklemesi bekleyen veya başka dosyanın sürümü, sahte `workspaceId`. | Genel teslim kapalı. Çöp geri alma ve eşik hataları ilgili eyleme göre değerlendirilir. |

## 5. Yalnızca görüntüleme ve erişim kaydı

Legacy `download.ts` önizleme isteğine imzalı ham R2 URL’si veriyor ve bu erişimi kaydetmiyor. Anonim `api/shared.$token.ts` da `view` linkiyle ham imzalı URL üretiyor. Yeni modelde önizleme ve ham teslim farklı nesneler ve ayrı sunucu işlemleridir. [Özellik denetimi](02-feature-audit.md)

| Seçenek | Karar |
|---|---|
| Ham dosyayı tarayıcıya verip istemcide dönüştürmek | `download` hakkı olan aktörler için kullanılabilir. Tarayıcıya ulaşan dosya kullanıcı tarafından alınabilir. |
| Hazır küçük resim | Faz 4 geçici gösterimi. Statik görsel olarak etiketlenir. Etkileşimli görüntüleme vaadi güvenli türev hazır olana kadar kapalıdır. |
| Sunucuda dönüştürülmüş, özel R2’de tutulan türev (`glTF`/mesh, gerekirse seçili montaj bilgisi) | **Öneri.** Faz 5, dönüşüm süresi, büyük STEP, ölçüm doğruluğu ve STL benzeri mesh formatlarında sadeleştirme politikasını doğrular. Türev sürüme bağlıdır. Türevden geometri çıkarılabilir. Ürün taahhüdü orijinal CAD dosyasının teslim edilmemesidir. |
| Sunucuda render edilen kareler | Etkileşim, kalite ve maliyet daha ağır. Mesh’in teslimini de sınırlamak için ayrı ürün ihtiyacı oluşursa değerlendirilir. |

`preview` yalnız sunucunun sürüme bağladığı türev veya onaylı küçük resmi getirir. Türev yoksa `PREVIEW_UNAVAILABLE`. `download` orijinali sunucu kontrolünden geçirip stream eder. Her açış ve indirme, oturumlu veya link aktörü ile sunucuda kaydedilir. Range istekleri dahil yeni teslimlerde yetki tekrar kontrol edilir. Aktarım başlamadan önce erişim kaydı başarıyla yazılır. Aynı teslim içindeki range kayıtları audit ekranında işlem kimliğiyle gruplanabilir. Erişim olayları teslim başlangıcını ifade eder. Önbellek özel ve `no-store`, link sayfasının referrer ilkesi `no-referrer`. Ham GET için yeni istemci presign yolu açılmaz. Küçük resim, sürüm, export, hata yanıtı ve arka plan dönüşümünde ham anahtar/URL sızıntısı test edilir. Faz 5’in motor kararı izin modelinden bağımsızdır, sunucu türevi şartı motor seçiminin girdisidir.

## 6. Faz 3 programları ve testleri

Aşağıdaki adlar `src/server/programs` için öneridir. Hatalar `src/server/errors.ts` içinde `Data.TaggedError` olur. Route haritası `ValidationError` → 400, `Unauthenticated` → 401, görünür kaynakta `PermissionDenied`/`EmailUnverified` → 403, `WorkspaceUnavailable`/`ResourceUnavailable` ve davet alıcısı uyuşmazlığı → 404, durum/kota çakışmaları → 409, geçerli alıcı için süresi dolmuş davet → 410. `CaptchaFailed` kayıt isteğini reddeder. I/O hatasında 5xx ve güvenli mesaj, e-posta hatasında kalıcı davet üzerinden yeniden gönderim sunulur. `DbError` her ilgili satıra dahildir.

| Program | Tagged error’lar | Test başlıkları |
|---|---|---|
| `signUp`, `verifyEmail` | `ValidationError`, `CaptchaFailed`, `IdentityConflict`, `VerificationInvalid`, `AuthError`, `EmailError` | Turnstile reddiyle kayıt yok, geçerli kayıt, doğrulama öncesi erişim kapalı, tek kullanımlık doğrulama, beş dilde şablon. |
| `signIn`, `signOut`, `requestPasswordReset`, `resetPassword` | `InvalidCredentials`, `EmailUnverified`, `ResetTokenInvalid`, `AuthError`, `EmailError` | Mevcut parola hash’iyle giriş, doğrulanmamış hesap, Google callback, çerez ve çıkış, kullanıcı varlığını açmadan sıfırlama, süresi dolmuş/tekrar kullanılan token. |
| `ensurePersonalWorkspace`, `completeOnboarding` | `Unauthenticated`, `EmailUnverified`, `ValidationError`, `WorkspaceConflict` | İlk doğrulanmış oturum eşzamanlı iki çağrı, bir kişisel sahip, tekrar çağrıda tek workspace ve tek anket, kısmi yazım rollback. |
| `createWorkspace` | `Unauthenticated`, `EmailUnverified`, `ValidationError`, `SlugTaken`, `WorkspaceConflict` | Firma + kurucu sahip atomik, slug yarışı, kişisel alana ikinci iç üye reddi. |
| `inviteMember`, `cancelInvitation` | `WorkspaceUnavailable`, `PermissionDenied`, `InvitationConflict`, `SeatLimitReached`, `EmailError`, `InvitationUnavailable` | Rol hedefi, yeniden gönderim, geçersiz/eski davet, e-posta hatası sonrası yeniden deneme, başka workspace davetini iptal edememe. |
| `acceptInvitation` | `Unauthenticated`, `EmailUnverified`, `InvitationUnavailable`, `InvitationExpired`, `InvitationConflict`, `SeatLimitReached`, `WorkspaceUnavailable` | Yanlış e-posta, son saniye, çift kabul, eşzamanlı son koltuk, iptal ile yarış, davet edenin rolü kaldırılmış, misafirden iç role geçiş, oturum hatasında kabulün korunması. |
| `changeRole`, `removeMember`, `transferOwnership` | `WorkspaceUnavailable`, `PermissionDenied`, `MemberUnavailable`, `RoleConflict`, `SeatLimitReached`, `LastOwner` | Yönetici yükseltme sınırı, son sahip yarışı, devir rollback, izinlerin silinmesi, tekrar katılım, kaldırılan üyeyle eşzamanlı grant. |
| `createProject`, `updateProject` | `WorkspaceUnavailable`, `PermissionDenied`, `ValidationError`, `ProjectLimitReached`, `ResourceUnavailable` | Varsayılan mod, kısıtlı projede oluşturucu grant’i, mod değişiminde erişim, kota yarışı, başka workspace’te aynı kimliğe erişim reddi. |
| `grantProjectAccess` | `PermissionDenied`, `ResourceUnavailable`, `MemberUnavailable`, `InvalidAccessLevel`, `AccessExpiryInvalid` | Seviyeler, yanlış workspace’te üyelik, yorumcu tavanı, upsert ve süre sınırı. |
| `inviteGuest`, `addGuest` (kabul) | `PermissionDenied`, `ResourceUnavailable`, `InvitationUnavailable`, `InvitationExpired`, `InvitationConflict`, `EmailUnverified`, `Unauthenticated`, `RoleConflict`, `GuestLimitReached`, `InvalidAccessLevel`, `AccessExpiryInvalid`, `EmailError` | Dosya/proje kapsamı, doğrulanmış alıcı, default yorum, düzenleme reddi, birden çok grant tek guest satırı, koltuk tüketimi yok, iptal/kabul yarışı, kayıt gönderim hatasına dayanıklı. |
| `revokeAccess` | `PermissionDenied`, `ResourceUnavailable`, `AccessConflict` | Bir grant’i ve tüm misafir kapsamlarını kaldırma, denetim kaydı, tekrar çağrı, başka canlı kapsam varsa seçicide kalma ve yoksa düşme. |
| `listWorkspaces`, `switchWorkspace` | `Unauthenticated`, `WorkspaceUnavailable`, `AuthError` | İki firma ve kişisel, farklı workspace’lerde farklı rol, geçersiz seçim, süresi dolmuş veya kaldırılmış misafir, kalıcı güncelleme ve çerez. |
| `listActivity` | `WorkspaceUnavailable`, `PermissionDenied`, `ValidationError` | Sahip/yöneticiye workspace sınırında sayfalama, üye/misafir reddi, link/kullanıcı kayıtları, sırların yanıta girmemesi. |

Faz 3 testleri saf matrisi, in-memory `Auth`/`Db`/`Email` katmanlarını ve legacy şema fixture’ından backfill’i kapsar. Seçilen better-auth sürümü ile kurulu plugin şeması, Worker kimlik callback’i, çerez ve HTTP izin listesi ayrıca yerel Worker entegrasyon testine girer. Faz 4 aynı matrisle `requestUpload`, `completeUpload`, listeleme, sürüm, çöpe atma/geri alma, dosya grant’i, `shareFile`, `resolveShareToken`, `addComment`, önizleme, indirme ve audit teslimi entegrasyonlarını çalıştırır. Kabul ölçütü `pnpm check`, `pnpm build` ve kopya prova eşitlikleridir.

## 7. Riskler ve açık sorular

- **better-auth hedef kurulumu.** Kurulu `1.4.7` kaynak davranışı doğrulandı. Hedef sürüm, Drizzle 0.45/D1 ile çalışma, üretilmiş SQL, Google callback, legacy çerez ve hesap taşıma testleri doğrulanmadı. Hedef sürüm seçildiğinde şema ve izin listesi yeniden denetlenir.
- **Geçişte kapsam.** Legacy süresiz erişimler, zayıf token’lar ve eski uçlarda eksik süre denetimi süreklilik ile kapsam sınırını karşı karşıya getiriyor. Kopyada gerçek adetler, çelişkili kayıtlar, geçmiş davetlerin süre kaybının ölçülebilen kısmı ve hash maliyeti doğrulanmadı. Prova çıktısı yalnız sayım ve güvenli kimliklerle raporlanır.
- **Dosya yaşam döngüsü.** Eski `userId` cascade’i, kişi silinince workspace dosyalarını da etkileyebilir. Kesin silme ve tutulacak audit süresi ilgili yaşam döngüsü tasarımına bırakılır. Yük ve türev maliyeti ile büyük dosya stream davranışı Faz 4–5’te ölçülür.

### Kullanıcıya sorulacaklar

1. Eski token’lar ve süresiz dosya davetleri için 30 günlük, süresiz kullanıcı paylaşımları için 90 günlük geçiş penceresi uygun mu?
2. Faz 5 türevi hazır olana kadar görüntüleme/yorum erişiminde statik küçük resim yeterli mi, yoksa etkileşimli önizleme hazır olana kadar bu paylaşım arayüzü ertelensin mi?
3. Prod kopyası alma izni ve yazımları durduracağımız geçiş penceresi Dalga 6’da ne zaman onaylanacak?
