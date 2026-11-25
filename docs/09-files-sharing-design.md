# Faz 4 · Dosyalar ve paylaşım tasarımı

Durum **teknik tasarım, inceleme bekliyor**. D2, D15, D17–D20 ve `08-auth-org-design.md`’deki kurallar bağlayıcıdır. Bu doküman o kuralları dosya, sürüm, yükleme, teslim, link, yorum ve aktivite uçlarına uygular. Çelişki olursa `01-decisions.md` kazanır. [Kararlar](01-decisions.md) · [Ürün modeli](06-product-model.md) · [Faz 3 tasarımı](08-auth-org-design.md) · [Güvenlik incelemesi](reviews/08-security-review.md) · [Tasarım](03-design.md)

Her başlıkta önce **karar**, sonra **gerekçe** ve reddedilen **alternatif** yer alır. Kod adları öneridir. Davranış bağlayıcıdır.

### Uygulamaya başlamadan önce düzeltilmesi gerekenler

| # | Zorunlu kural |
|---|---|
| 1 | R2 anahtarları hiçbir zaman yeniden adlandırılmaz, taşınmaz veya kopyalanmaz. Yeni anahtar yalnız sunucuda, opak kimliklerden üretilir. İstemciden gelen anahtar, dosya adı veya MIME hiçbir zaman anahtara ya da teslim başlığına girmez (legacy `complete-upload` istemcinin `key` değerine güveniyordu). |
| 2 | `0014+` migration’ları yalnız `08 §3` izin listesindeki işlemleri kullanır: legacy tablolarda nullable `ADD COLUMN`, `CREATE INDEX`, `CREATE TRIGGER`. Yeni tablolar serbest. Legacy tablolara eklenen trigger, legacy’nin bugün yazdığı her satır şeklini kabul etmelidir. Aksi halde canlı legacy yüklemesi kırılır. |
| 3 | Ham dosya yalnız Worker üzerinden, yetki ve audit sonrası, `08 §5` başlıklarıyla teslim edilir. Kullanıcı içeriği için presigned GET üretilmez. |
| 4 | Presigned PUT URL’si tek yazımlıktır (`If-None-Match: *` imzalı), boyutu imzalıdır (`Content-Length` imzalı) ve kısa ömürlüdür. Tamamlama R2’deki gerçek boyutu, ETag’i ve imza baytlarını doğrular. Teslimde kayıtlı ETag ile R2 nesnesi karşılaştırılır. |
| 5 | Silme sırası her zaman önce D1, sonra R2’dir. R2 silmesi aynı batch’te yazılan `storage_deletions` kuyruğundan yürür. Silme işçisi, D1’de hâlâ başvurulan anahtarı asla silmez. |

## 1. Canlı veriyle uyum

### 1.1 Legacy tabloların bugünkü şekli

Kaynak: `src/server/db/schema.ts` (legacy `0000–0011` + `0012`) ve `vizcad-legacy/src/routes/api/files/*`.

| Tablo | Canlı alanlar | Legacy davranışı (önemli olanlar) |
|---|---|---|
| `files` | `id`, `name`, `r2Key` (UQ), `size`, `mimeType`, `extension`, `status` (`pending/uploaded/failed`, varsayılan `pending`), `userId` (cascade), `createdAt`, `updatedAt`, `isDeleted`, `deletedAt?`, `thumbnailR2Key?`; 0012’den `workspaceId?`, `projectId?` | Satır yalnız tamamlamada ve `status = 'uploaded'` ile yazılır. `pending/failed` satırı pratikte yok ama şema izin veriyor. **Satır güncel sürümü temsil eder.** Yeni sürümde `r2Key`, `size`, `name`, `mimeType` güncellenir. |
| `file_versions` | `id`, `fileId` (cascade), `versionNumber`, `r2Key`, `size`, `changeNote?`, `uploadedByUserId` (cascade), `createdAt` | **Yalnız önceki sürümlerin anlık görüntüsü.** Yeni sürüm: önce güncel satırın kopyası `versionNumber = count + 1` ile eklenir, sonra `files` yeni anahtara geçer. Geri yükleme de önce güncel hâli anlık görüntü olarak ekler, sonra eski anahtarı güncel yapar. Bu yüzden aynı `r2Key` hem `files`’ta hem bir sürüm satırında bulunabilir. `(fileId, versionNumber)` benzersiz değil. |
| `file_comments` | `id`, `fileId`, `userId`, `parentId?`, `content`, `createdAt`, `updatedAt` | Tek seviye yanıt. Silme yorumu ve yanıtlarını kalıcı siler. |
| `file_stars` | `id`, `fileId`, `userId`, `createdAt` | `(fileId,userId)` benzersiz değil. Yinelenen satır olabilir. |
| `file_activities` | `id`, `fileId`, `userId`, `action` (`viewed/edited/downloaded/shared`), `createdAt` | “Son açılanlar” için. |
| `file_shares`, `file_invitations` | `08 §3`’te eşlendi | Link token’ı 32 karakter `Math.random`. Parola düz metin. |
| `activity_logs` | `userId`, `action`, `entityId?`, `entityType?`, `details?`, `ipAddress?`, `userAgent?` | IP ve user agent saklıyor. Yorum içeriği `details` içine yazılıyor. |
| `user.storageQuotaGb` | varsayılan 5 | Kullanıcı başına kota, `list.ts` gösteriyor, yükleme denetlemiyor. |

**R2 anahtar biçimleri (canlı).** Dosya `{userId}/{fileId}/{dosyaAdı}`, sürüm `{userId}/{fileId}/v{n}/{dosyaAdı}`, küçük resim `{userId}/{fileId}/thumbnail.png`, blog `blog/{klasör}/{ad}`. Legacy kalıcı silme yalnız güncel `r2Key`’i siler. Sürüm ve küçük resim nesneleri yetim kalır.

### 1.2 Yeni yazımların anahtar biçimi

**Karar.** Yeni nesneler `w/{workspaceId}/f/{fileId}/{objectId}` altında. `objectId` her yükleme için yeni ULID. Küçük resim `w/{workspaceId}/f/{fileId}/{objectId}.thumb`. Dosya adı, uzantı ve kullanıcı kimliği anahtara girmez.

- **Gerekçe.** Ad değiştirme ve sürüm, anahtarı etkilemez. Legacy’deki `#`, `?`, `+` kodlama hataları ve ad içindeki `..` gibi segment sorunları oluşmaz. `w/` öneki legacy kullanıcı kimliği öneklerinden ve `blog/`’dan ayrılır, bu da yetim taraması ve maliyet raporu için yararlı. Dosya workspace değiştirmez (`moveFile` aynı workspace’i şart koşar), bu yüzden önek sabit kalır.
- **Alternatif.** Legacy biçimi `{userId}/{fileId}/{ad}` sürdürmek. Reddedildi: dosya artık kullanıcıya değil workspace’e ait, ad anahtarda kodlama riski taşıyor, sürümde ad değişince anahtar anlamsızlaşıyor.
- **Okuma kuralı.** Yeni kod `files.r2Key`, `file_versions.r2Key`, `thumbnailR2Key` değerlerini bayt bayt kullanır, biçimine bakmaz, ayrıştırmaz ve yetki çıkarmaz. Legacy önekindeki `userId` yetki kanıtı değildir.

### 1.3 Legacy açıkken okuma/yazma kuralları

Cutover’a kadar legacy uygulama prod D1’e yazar. Rewrite yalnız staging’de çalışır. Ancak `0014+` migration’ları onayla ve yedek kapısıyla (08 §3) cutover’dan önce prod’a uygulanabilir. Bu nedenle:

1. Yeni sütunların hepsi nullable ve legacy bunları hiç yazmaz. Yeni kod her yeni sütun için **NULL yedek anlamı** tanımlar (tablo §1.4).
2. Legacy tablolara konan trigger, legacy’nin yazdığı her satırı kabul etmeli. 0012’deki `files_project_workspace_*` yalnız `projectId` doluysa çalıştığı için uyumlu. Faz 4 legacy tablolara yeni trigger koymaz.
3. Yeni kod `files.status = 'uploaded'` olmayan satırı listelemez ve teslim etmez. Yükleme yaşam döngüsü `files.status`’u kullanmaz, ayrı `upload_sessions` tablosunda yürür. `files` satırı yalnız doğrulanmış nesne için oluşur. Legacy’nin bu değişmezi korunur.
4. `workspaceId IS NULL` dosya yeni kodda görünmez (08 §2). Kalan farkı cutover backfill’i kapatır.
5. Yeni kod `activity_logs` ve `file_activities` tablolarına yazmaz (IP/UA ve gereksiz kopya). Aktivite `access_log`’a gider (§7).
6. Staging testleri legacy biçimli fixture satırlarıyla da koşar: legacy anahtarlı dosya, sürüm satırı, `NULL` yeni sütunlar, yinelenen yıldız, kapsamı belirsiz yorum.

### 1.4 Migration `0014_files_sharing` (yalnız izinli işlemler)

| Tablo | İşlem | NULL yedek anlamı / not |
|---|---|---|
| `files` | `ADD COLUMN contentEtag TEXT` | NULL: legacy nesne, teslimde ETag karşılaştırması atlanır, boyut yine karşılaştırılır. |
| `files` | `ADD COLUMN currentVersionNumber INTEGER` | NULL: `COUNT(file_versions) + 1` (legacy hesabı). |
| `files` | `ADD COLUMN currentUploadedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL` | NULL: `files.userId`. Yalnız gösterim, yetki vermez. |
| `files` | `ADD COLUMN deletedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL` | NULL: “bilinmiyor” gösterilir. |
| `file_versions` | `ADD COLUMN contentEtag TEXT`, `ADD COLUMN thumbnailR2Key TEXT` | NULL: ETag denetimi atlanır, küçük resim yok. |
| `file_comments` | `ADD COLUMN authorScopeAtWrite TEXT CHECK (authorScopeAtWrite IN ('internal','guest'))` | NULL: kapsam kanıtlanamaz, misafire kapalı (08 §4). |
| `file_comments` | `ADD COLUMN versionNumber INTEGER`, `ADD COLUMN deletedAt INTEGER` | Yazıldığı andaki sürüm. Silinen yorum mezar taşı olur. |
| yeni `upload_sessions` | §2.5 | — |
| yeni `storage_deletions` | `key PK`, `reason`, `createdAt`, `attempts`, `lastError?`, `notBefore` | Silme kuyruğu (§5.3). |
| indeksler | `file_versions(fileId, versionNumber)`, `file_comments(fileId, createdAt, id)`, `file_stars(userId, fileId)`, `file_stars(fileId, userId)`, `access_log(workspaceId, actorUserId, createdAt, id)` | Legacy tablolarda **benzersiz olmayan** indeks. Legacy veride yinelenen satır olabileceği için `UNIQUE` cutover’a kalır. |
| `share_links` | `CREATE UNIQUE INDEX share_links_one_active_uq ON share_links(fileId) WHERE revokedAt IS NULL AND legacyMaxExpiresAt IS NULL` | Dosya başına tek aktif yeni link (§4.1). Legacy eşlemesinden gelen birden çok link bu kuralın dışında. |

Drizzle satır içi `REFERENCES` için `ON DELETE` yazmıyor (Faz 3a notu). SQL elle düzeltilir. `scripts/check-migrations.ts` değişmez. Yeni migration onun izin listesinden geçmeli. Ek test: 0014 uygulandıktan sonra legacy fixture’daki her `INSERT/UPDATE` şekli hâlâ başarılı. Yani legacy yazar kırılmaz.

### 1.5 Cutover’da yapılacak dönüşümler (migration değil, onaylı veri adımları)

Yazımlar dondurulmuşken, kopyada provadan sonra, 08 §3 sırasının içinde koşar. Hepsi idempotent, kaynak kazanır.

1. 08 §3’teki workspace backfill farkı ve ACL/link/davet eşlemesi (değişmedi).
2. **Yorum kapsamı.** `file_comments.authorScopeAtWrite = 'internal'` yalnız yazar dosyanın legacy sahibi (`files.userId`) ise. Diğer legacy yorumlar `NULL` kalır ve misafire kapalıdır.
3. **Yıldız tekilleştirme.** `(fileId,userId)` başına en eski satır kalır. Ardından ayrı migration’da `CREATE UNIQUE INDEX file_stars_file_user_uq`.
4. **Sürüm numarası.** `files.currentVersionNumber` doldurulmaz, NULL yedek anlamı yeterli. `(fileId, versionNumber)` için benzersizlik getirilmez, çünkü legacy yarışları yineleme üretmiş olabilir.
5. **Yetim R2 taraması.** Bucket listesi ile D1’deki bütün anahtar başvuruları karşılaştırılır (`blog/` hariç). Yalnız rapor, sayı ve toplam bayt. Silme ayrı kullanıcı onayı ister.
6. **Legacy presign anahtarı iptali** ve eski indirme/paylaşım API’lerinin kapatılması (08 §3 adım 4). Faz 4’ün teslim uçları buna dayanır.
7. `/shared/$token` → `/s/$token`, `/file/$id` → `/files/$id`, `/dashboard` ve `/app` → `/files` yönlendirmeleri (D15) yayına girer.
8. `activity_logs.ipAddress` ve `userAgent` için karar §11 S3’te.
9. Production’da `TRASH_RETENTION_FLOOR` cutover zamanına (unix saniye) ayarlanır (legacy çöp süresizdi; 30 gün cutover’dan sayılır: saklama başlangıcı `max(COALESCE(deletedAt, updatedAt), floor)`, `listTrash.purgeAt` aynı formülle). Kullanıcılara bildirim önerilir.

## 2. Yükleme

### 2.1 Yol: presigned PUT, doğrudan R2’ye

**Karar.** Tarayıcı dosyayı `aws4fetch` ile imzalanmış tek bir PUT ile doğrudan R2’ye yükler. Worker yalnız oturum açar, URL imzalar ve tamamlamayı doğrular.

- **Gerekçe.** Worker istek gövdesi zone planına göre 100 MB (Free/Pro) ile sınırlı. CAD dosyaları bunu aşar. Akış Worker CPU ve süre bütçesini de tüketir. Legacy de presign kullanıyordu ve kod parçası (`r2Presign.ts`) hazır, testli.
- **Alternatif.** Worker üzerinden akış. Bayt bayt magic byte ve boyut denetimi kolaylaşırdı, ama gövde sınırı ürün için kabul edilemez. Multipart upload şimdilik yok: tek PUT 5 GiB’a kadar çalışır. `Entitlements.maxFileBytes` 1 GB’ı aşarsa multipart (parça başı imza) eklenir. “Bağlantı gelince devam edecek” (03 §2.6) bu yüzden ilk sürümde “yeniden dene” olarak uygulanır. Yeniden deneme aynı oturumla yeni bir URL ister.

### 2.2 Dosya türü reddi (D15)

Desteklenen türler tek modülde (`src/shared/fileTypes.ts`, Effect’siz, istemci ve sunucu ortak): **STEP (`.step`, `.stp`), IGES (`.iges`, `.igs`), STL, OBJ, PLY, 3MF.** Hata metni bu listeden üretilir.

| Katman | Denetim |
|---|---|
| İstemci (yüklemeden önce) | Uzantı ve ilk 4 KiB `File.slice` ile aynı imza fonksiyonu. Reddedilen dosya yüklemeye başlamaz (D15). Bu yalnız kullanıcı deneyimi içindir. |
| `requestUpload` | Uzantı küçük harfe çevrilir ve listede olmalı, değilse `UnsupportedFileType`. Ad 1–255 karakter, kontrol karakteri yok, `/` ve `\` yok. |
| `completeUpload` | R2’den aralıklı GET ile ilk 64 KiB (3MF için ek olarak son 64 KiB) okunur ve imza doğrulanır. Başarısızsa nesne silme kuyruğuna girer ve `UnsupportedFileType` döner. |

İmza kuralları (sunucu, saf fonksiyon, tam test):

- **STEP:** isteğe bağlı BOM ve boşluktan sonra `ISO-10303-21;`.
- **IGES:** ilk satırın 73. sütunu `S`, satır uzunluğu 80 (CRLF/LF toleranslı).
- **STL:** önce ikili: `size == 84 + 50 × uint32le(@80)`. Değilse ASCII: `solid` ile başlar, ilk 64 KiB içinde `facet` geçer, NUL yok.
- **OBJ:** NUL yok, geçerli UTF-8, ilk 64 KiB’ta en az bir `v `, `f `, `o `, `g ` veya `mtllib` satırı.
- **PLY:** `ply\n` veya `ply\r\n`, ardından `format `.
- **3MF:** `PK\x03\x04`, sondaki merkezi dizinde `3D/3dmodel.model` girdisi.

MIME beyanı kaydedilir (`files.mimeType` NOT NULL olduğu için). Değer sunucuda uzantıdan türetilen sabit tablo değeridir, istemci beyanı değildir. Hiçbir teslim başlığına girmez.

### 2.3 Boyut ve depolama limitleri (`Entitlements`)

`WorkspaceLimits`’e eklenen alanlar (değerler yalnız `defaultPlan`’da):

| Alan | Varsayılan öneri | Not |
|---|---|---|
| `maxFileBytes` | 100 MB | 03 §2.6 örneği. |
| `storageBytes` | 5 GB | Legacy varsayılanı. Kişisel workspace’te `max(defaultPlan, sahibin user.storageQuotaGb)`, böylece elle artırılmış legacy kotalar korunur. |
| `trashRetentionDays` | 30 | 03 §2.8. |
| `activeShareLinks` | `null` (sınırsız) | Plan farkı için yer. |
| `linkMaxLifetimeSeconds` | `null` | Süresiz link izinli, arayüz 30 günü önseçer. |
| `auditRetentionDays` | 365 | §7.3. |
| `uploadSessionsPerUser` | 20 eşzamanlı | Rezervasyonla kota doldurmayı sınırlar. |

**Kullanım hesabı.** `files ∪ file_versions` üzerinde workspace kapsamında `DISTINCT (r2Key, size)` toplamı (geri yüklemede paylaşılan anahtar iki kez sayılmaz), artı süresi dolmamış açık yükleme oturumlarının beyan boyutu. Çöp dahil, kalıcı silinene kadar sayılır. Küçük resimler sayılmaz. İleride sayaç sütunu gerekirse ölçümle karar verilir.

**Yarış.** `requestUpload` rezervasyonu ve `completeUpload` yazımı `batch_guard` içinde kotayı yazım anında yeniden hesaplar (Faz 3b-2 deseni). Aşımda `StorageQuotaExceeded`, dosya başı aşımda `FileTooLarge`.

### 2.4 Akış

1. `requestUpload({ workspaceId, projectId?, name, size, targetFileId? })`. Yetki: `uploadFile` veya `uploadProjectFile`, sürüm için `uploadVersion` (dosyada `edit`). Tür, boyut, kota ve oturum sayısı denetimi. Batch: guard + `upload_sessions` satırı (`pending`). Yanıt: `uploadId`, `url`, `headers` (`Content-Type: application/octet-stream`, `If-None-Match: *`), `expiresAt`.
2. Tarayıcı PUT. İmzada `content-length` = beyan boyutu, `if-none-match: *` ve sabit `content-type`. Süre: `clamp(600 s, size / 1 MB/s × 2, 3600 s)`.
3. `completeUpload({ uploadId, etag })`. Sıra:
   - Oturum aktörün, `pending` ve süresi dolmamış olmalı. Değilse `UploadUnavailable`.
   - `Storage.head(key)`. Nesne yoksa `UploadIncomplete`. `size` beyandan farklıysa veya istemcinin bildirdiği `etag` HEAD ile uyuşmuyorsa nesne silme kuyruğuna girer ve `UploadMismatch` döner.
   - İmza denetimi (§2.2).
   - Batch: guard (oturum hâlâ `pending`, aktörün yetkisi ve rolü yazım anında, kota), sonra yeni dosyada `files` + `file_access(edit, source=uploader)` (yalnız iç rol, 08 §4) veya sürümde §5.2 adımları, ardından `upload_sessions.status = 'completed'` ve `access_log` (`file.uploaded` / `file.version_uploaded`).
   - Yanıt: dosya özeti.
4. Tamamlama idempotent. Aynı oturum için ikinci çağrı `completed` durumunu görür ve aynı `fileId`’yi döner.

### 2.5 `upload_sessions` ve yarım kalan yüklemeler

`upload_sessions`: `id PK`, `workspaceId`, `projectId?`, `targetFileId?`, `userId`, `r2Key UQ`, `objectId`, `name`, `extension`, `declaredSize`, `status` (`pending/completed/expired/rejected`), `expiresAt`, `createdAt`, `completedAt?`. Workspace ve kullanıcı FK `RESTRICT`, `(userId,status)`, `(status,expiresAt)` ve `CHECK`’ler.

**Temizlik.** Saatlik cron (`scheduled`, `src/server.ts`’e eklenir): `expiresAt + 1 saat` geçmiş `pending` oturum `expired` olur ve anahtarı aynı batch’te `storage_deletions`’a girer. Reddedilen tamamlamalar da (`rejected`) anahtarı kuyruğa koyar.

**Alternatif.** R2 lifecycle kuralı ile önekten otomatik silme. Reddedildi: tamamlanmamış ve tamamlanmış nesneler aynı önekte duruyor ve lifecycle D1 başvurusunu bilmez. Ayrı “staging” önekinden kopyalama da büyük dosyada iki kat yazım maliyeti getirir.

## 3. Teslim (indirme ve görüntüleme)

### 3.1 Uçlar ve başlıklar

| Uç | Yetki eylemi | Yanıt |
|---|---|---|
| `GET /api/files/{fileId}/content?v={versionId\|current}` | `download` (eski sürümde ayrıca `viewHistory`) | Worker R2 akışı. `Content-Type: application/octet-stream`, `Content-Disposition: attachment; filename*=UTF-8''…` (ad temizlenir ve kodlanır, mevcut `attachmentDisposition` kullanılır), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`, `Accept-Ranges: bytes`. `Range` → 206 ve aynı başlıklar. |
| `GET /api/files/{fileId}/thumbnail?v=` | `preview` | Yalnız imzası doğrulanmış PNG/WebP, en çok 1 MiB. Sabit `image/png` veya `image/webp`, `nosniff`, `CSP: sandbox`, `private, no-store`. Yoksa veya imza tutmazsa `PreviewUnavailable` (404). |
| `GET /s/{token}/content`, `GET /s/{token}/thumbnail` | link + `download` / `preview` | Aynı başlıklar, ayrıca `Referrer-Policy: no-referrer`. Yalnız güncel hazır sürüm (08 §4.6). |
| `POST /api/files/{fileId}/thumbnail` | `edit` | Gövde ≤ 1 MiB, `Content-Type` `image/png` veya `image/webp`. PNG’de imza, IHDR, boyut ≤ 1024×1024, chunk CRC ve IEND denetlenir. WebP’de RIFF/WEBP ve VP8/VP8L/VP8X başlığı. Worker `Storage.put` ile `….thumb` anahtarına yazar (bu yüzden presign yok). Üreteç Faz 5 pipeline’ı. |

GET uçları yalnız `Sec-Fetch-Site: same-origin` (veya başlık yokken aynı `Origin`) kabul eder. Böylece başka siteden tetiklenen indirme, kullanıcı adına audit kaydı üretemez. Teslimde `files.size` ve, doluysa, `contentEtag` R2 HEAD değeriyle karşılaştırılır. Uyuşmazlık 409 `ContentIntegrity` döner ve sunucu tanısı loglanır.

### 3.2 Presigned GET

**Karar.** Kullanıcı içeriği için presigned GET **yok**. `Storage.presignDownload` serviste kalır ama hiçbir program onu kullanmaz. Bir test, `src/server/programs` altında `presignDownload` çağrısı olmadığını denetler.

- **Gerekçe.** Presigned URL taşınabilir bir hamiline yetki kanıtıdır: süresi içinde iptali ve audit’i atlar, ve R2 alan adından `nosniff`/`sandbox` başlıklarını garanti etmez (08 §5, güvenlik 6.3). R2’de çıkış ücreti olmadığından Worker’dan akışın maliyeti yalnız istek başına ücrettir.
- **Alternatif.** 60 saniyelik presigned GET. Reddedildi: Range ile paralel indirme (legacy `parallel-download.ts`) aynı URL’yi dakikalarca kullanır, kısa süre bunu bozar, uzun süre de iptali boşa çıkarır.

### 3.3 “Yalnızca görüntüleme” (D18)

Sunucu `view` ve `comment` düzeyine yalnız küçük resim ucunu açar. `content` ucu `decidePermission({ kind: 'download' })` ister. 3B görüntüleyici yalnız `content` ucundan beslenir, bu yüzden Faz 5’in sunucu türevi gelene kadar `view/comment` düzeyi 3B açamaz. Arayüz bunu “Bu dosya yalnızca görüntülenebilir” ile söyler ve 3B düğmesini göstermez. Kontrat testi: `view` misafiri ve `view` linki için `content` 404 (görünür kaynakta 403), `thumbnail` 200.

### 3.4 Audit ve Range

Teslim kimliği = `HMAC(proofKey, actor ‖ fileId ‖ r2Key ‖ floor(now / 600))`. `access_log.id` bu değerdir ve `INSERT … ON CONFLICT(id) DO NOTHING` ile 10 dakikalık pencerede teslim başına tek kayıt düşer (08 §5, güvenlik 6.4). Her Range parçası yetkiyi yeniden değerlendirir. Kayıt yazılamazsa teslim yapılmaz (önce audit, sonra akış).

### 3.5 `GuestFileView` ve `LinkFileView`

İzin listesiyle üretilen projeksiyonlar. Kontrat testi anahtar kümesinin tam eşitliğini denetler.

- **`GuestFileView`:** `id`, `name`, `extension`, `size`, `updatedAt`, `currentVersion { number }`, `thumbnailAvailable`, `can { download, comment }`, `sharedBy { displayName }`. **Yok:** e-posta, `projectId`/proje adı, sürüm listesi, aktivite, erişimi olanlar, R2 anahtarı, `userId`.
- **`LinkFileView`:** aynısı, `can.comment = false`, ayrıca `sharer { displayName, workspaceLabel }` (D18: paylaşan firma üstte) ve `expiresAt`. Workspace etiketi yalnız company workspace’te ve `publicSharerLabel` ile, kişisel workspace’te yalnız paylaşanın adı.

İç kullanıcı `FileView` alır: projeksiyon yanında sürümler (`viewHistory`), paylaşım özeti (`shareFile` yetkisi varsa) ve yükleyen.

## 4. Link paylaşımı

### 4.1 Model (`share_links`, 0012)

- **Token.** 32 bayt CSPRNG, base64url. `tokenDigest = SHA-256(token)` ile aranır. `tokenCiphertext` AES-GCM ile, 12 bayt rastgele nonce, AAD = `linkId ‖ workspaceId`, anahtar `AppConfig.shareTokenKeys[tokenKeyVersion]`. Anahtar halkası `SHARE_TOKEN_KEYS` sırrından (JSON, sürüm → 32 bayt base64, `active` alanı) gelir. Dönüşüm 08 §5’teki gibi: yeni yazım aktif sürümle yapılır, bir script eski sürümdekileri yeniden şifreler ve eski anahtar ancak sayım 0 olunca kaldırılır.
- **Dosya başına bir aktif link.** Tasarımdaki “link açık/kapalı” anahtarı tek link varsayar (03 §2.3). Kısıt §1.4’teki kısmi UQ ile sağlanır. **Alternatif:** dosya başına çoklu link (alıcı başına link). Reddedildi: arayüz ve envanter karmaşıklaşır, kişi bazlı ihtiyaç misafir davetiyle zaten karşılanıyor.
- **Düzey.** `view` (küçük resim) veya `download`. Link yorum yapamaz (`LINK_NO_COMMENTS`).
- **Süre.** `expiresAt` isteğe bağlı. Arayüz 30 günü önseçer. `Entitlements.linkMaxLifetimeSeconds` doluysa tavandır.
- **Revizyon.** Düzey, parola veya süre değişikliği, token yenileme ve iptal `revision`’ı artırır. Böylece eski parola çerezleri geçersiz olur.
- **Paylaşan etiketi.** `publicSharerLabel`, oluşturma anında workspace adından kopyalanır (company) ve yalnız yöneticinin onayıyla değişir.

### 4.2 Parola

- Yalnız POST gövdesinde (`/api/s/password`, gövde `{ token, password, turnstileToken? }`). Parola 8–128 karakter.
- Hash: sürümlü scrypt `s1$N$r$p$salt$hash`, `N=16384, r=16, p=1`, 16 bayt tuz. Önce `node:crypto` scrypt (nodejs_compat) ölçülür. Yetmezse `@noble/hashes`. Kabul ölçütü: staging’de 10 eşzamanlı doğrulamada bellek sınırı aşılmaz.
- Sıra: `RateLimit(linkPassword: ip, digest)` → üç başarısızlıktan sonra Turnstile → digest araması → scrypt → sabit zamanlı karşılaştırma.
- Kanıt çerezi: `__Host-vizcad-share-<linkId>`, değer `v1.<exp>.<mac>`, MAC = `HMAC-SHA-256(SHARE_PROOF_KEY, linkId ‖ revision ‖ exp)`, `HttpOnly; Secure; SameSite=Lax; Path=/`, süre `min(12 saat, link bitişi, legacy tavanı)` (08 §5). Uygulama uçları bu çerezi yetki olarak okumaz.

### 4.3 Çözümleme (`resolveShareLink`)

`/s/$token` SSR yükleyicisi programı çağırır. Sıra: token biçimi (yeni: 43 karakter base64url, legacy: 32 alfanümerik) → `RateLimit(linkOpen: ip)` → digest araması → `decidePermission` (aktör `link`). Durumlar:

| Durum | Yanıt |
|---|---|
| Bulunamadı, iptal, dosya çöpte, workspace arşivli | 404 `LinkUnavailable`. Tek metin: “Bu link artık geçerli değil.” |
| Süresi doldu (legacy tavanı dahil) | 410 `LinkExpired`. Paylaşanın görünen adı döner (03 §2.4, token sahibi zaten linki bilir). |
| Parola gerekli, geçerli çerez yok | 200, sayfa parola kapısını gösterir (`LinkPasswordRequired`). İçerik ve dosya adı dönmez. |
| Geçerli | `LinkFileView`. |

Bütün `/s/*` yanıtları `private, no-store`, `Referrer-Policy: no-referrer`, analitik betiği yok ve edge cache dışında. Uygulama logları URL’yi yazmaz. Token’ın Cloudflare istek günlüklerinde görünmesi kabul edilen kalan risktir (link paylaşımının doğası).

### 4.4 Legacy linkler (D19)

- Cutover eşlemesi 08 §3’te. Faz 4 eşleme fonksiyonunu ve testlerini yazar, prod’da koşmaz.
- Okuma tarafı her istekte `legacyMaxExpiresAt` tavanını uygular, yazım tavanı (0012 trigger’ı) değişmez.
- Legacy token biçimi digest ile aranır. Şifreli kopya eşleme sırasında oluşturulur, böylece “Linki kopyala” legacy linkte de çalışır.
- Legacy link düzenlenemez. Sahibi yalnız iptal edebilir veya “yeni link oluştur” der (yeni link legacy’yi aynı batch’te iptal eder). Sahibine yayın bildirimi 08 §3’te.

### 4.5 Rate limit

`AppConfig.rateLimitActions`’a eklenir (eşikler `defaultRateLimits`’te): `linkOpen` (IP), `linkPassword` (IP + link), `upload` (kullanıcı + IP, `requestUpload`), `comment` (kullanıcı), `thumbnailPut` (kullanıcı). Sayaç erişilemezse 503 ve işlem çalışmaz (Faz 3b-1 davranışı). İndirme için ayrı sayaç yok, çünkü yetki ve audit zaten her istekte çalışıyor.

### 4.6 Erişim kaydı

Link olayları `actorKind = 'link'`, `linkId` ile yazılır: `link.opened` (çözümleme başına, 10 dakikalık teslim kimliğiyle tekilleştirilmiş), `link.password_failed` (`outcome = denied`, rate limit sınırlı), `file.previewed`, `file.downloaded`. Yönetim olayları `actorKind = 'user'`: `link.created`, `link.updated`, `link.revoked`, `link.copied`.

## 5. Dosya yaşam döngüsü

### 5.1 Liste ve proje

- `listFiles({ workspaceId, projectId?, filter: all|recent|starred|mine, query?, sort, cursor })`. Adaylar workspace ve canlı grant ile SQL’de daraltılır, sayfalamadan önce her satır `decidePermission(view)` ile doğrulanır (08 §4). Keyset imleç `(updatedAt, id)`. `status = 'uploaded'`, `isDeleted = 0`, `workspaceId` dolu.
- `recent`: `access_log`’dan aktörün son 50 farklı dosyası (yeni indeks). `starred`: `file_stars`. `mine`: `file_access.source = 'uploader'` veya legacy `files.userId` (yalnız filtre için, yetki için değil).
- Proje sayfası aynı programı `projectId` ile çağırır. Misafir proje grant’i yalnız o projenin dosyalarını açar. Dosya grant’i proje listesini açmaz.
- “Paylaşılanlar”: `listSharedWithMe` (aktif workspace’te aktörün grant’leri) ve `listSharedByMe` (aktörün verdiği grant’ler ve oluşturduğu linkler, son açılma `access_log`’dan).

### 5.2 Sürümler

**Karar.** Legacy modeli korunur: `files` güncel sürüm, `file_versions` önceki sürümlerin anlık görüntüsü. API’de güncel sürümün kimliği `current`, eski sürümün kimliği `file_versions.id`.

- **Yeni sürüm** (`completeUpload` ile `targetFileId`) aynı batch’te: guard (dosya çöpte değil, `edit` hâlâ geçerli, `currentVersionNumber` okunduğu değerde), ardından güncelin anlık görüntüsü (`versionNumber = current`, `uploadedByUserId = currentUploadedByUserId ?? files.userId`, ETag ve küçük resim), sonra `files` güncellenir (`r2Key`, `size`, `contentEtag`, `currentVersionNumber + 1`, `currentUploadedByUserId`, `thumbnailR2Key = NULL`, `updatedAt`). Ad değişmez (legacy adı yeni dosyanın adıyla eziyordu).
- **Uzantı.** Yeni sürümün uzantısı dosyanınkiyle aynı olmalı, değilse `VersionTypeMismatch`. Alternatif: tür değişimine izin. Reddedildi: görüntüleyici, küçük resim ve ad uzantısı tutarsızlaşır, farklı tür yeni dosyadır.
- **Geri yükleme** (`restoreVersion`, eylem `uploadVersion`): güncelin anlık görüntüsü, sonra seçilen sürümün anahtarı güncel olur, numara artar (legacy ile aynı, geçmiş silinmez). Aynı anahtar iki satırda bulunabilir. Silme ve kota hesabı bunu bilir.
- **Liste** (`listVersions`, eylem `viewHistory`): yalnız iç kullanıcı. Yükleyen adı gösterilir, e-posta gösterilmez. Misafir ve link eski sürüme erişemez.
- Tek sürüm silme bu fazda yok.

### 5.3 Çöp kutusu

- `trashFile` (eylem `trashFile`, `edit`): `isDeleted = 1`, `deletedAt`, `deletedByUserId`. Aynı batch’te dosyanın aktif linkleri iptal edilir (revizyon artar) ve bekleyen dış davetleri `canceled` olur. Grant’ler kalır, ama çöpteki dosyaya içerik erişimi `decidePermission` tarafından zaten kapalı.
- `restoreFile` (`edit`): ad çakışması varsa (aynı konumda aynı ad) `ad (2).ext`, sonra `(3)` … (dile bağlı metin D1’e yazılmaz; istemci `name` farkından bilgi bildirimini kendisi üretir). Linkler geri gelmez, yeniden oluşturulur.
- `purgeFile` (`permissions.ts`: yalnız sahip/yönetici): bir batch’te guard (hâlâ çöpte), sonra dosyanın `file_access`, `share_links`, `resource_invitations` satırları silinir (bu tablolar `RESTRICT`), ardından bütün anahtarlar (`files.r2Key`, `thumbnailR2Key`, her `file_versions.r2Key/thumbnailR2Key`, tekilleştirilmiş) `storage_deletions`’a yazılır ve en son `files` silinir. Legacy tablolar cascade ile gider. `access_log` kalır (FK yok, anlık değer).
- `emptyTrash`: workspace’in çöpü için aynı işlem, 50’lik gruplar halinde.
- **Otomatik temizlik:** günlük cron, `deletedAt + trashRetentionDays` geçmiş dosyalara `purgeFile` uygular (`actorKind = 'system'`).
- **Silme işçisi:** `storage_deletions`’tan 100’lük grup alır. Her anahtar için D1’de `files`/`file_versions`/`upload_sessions(completed)` başvurusu varsa **silmez** ve kaydı düşürür (emniyet ağı), yoksa `Storage.delete` çağırır. Hata olursa `attempts++` ve üstel `notBefore`. 10 denemeden sonra yalnız etiketle loglanır.

### 5.4 Yıldız, ad değiştirme, taşıma

- **Yıldız** (`starFile`/`unstarFile`, eylem `view`): `INSERT … SELECT … WHERE NOT EXISTS`, kaldırmada çiftin bütün satırları silinir. Yetkisi kalkan dosyanın yıldızı satırda kalır ama listede görünmez.
- **Ad değiştirme** (`renameFile`, `edit`): uzantı sabit, kullanıcı yalnız taban adı değiştirir. Doğrulama `requestUpload` ile aynı. Ad benzersiz değil (Drive modeli). `access_log` `file.renamed` olayında eski ve yeni ad **yazılmaz**, yalnız olay.
- **Taşıma** (`moveFile`): `permissions.ts` `moveFile` kaynak ve hedef kuralları aynen. Önce `previewMoveFile` etkilenenleri döndürür: hedef kısıtlıysa iptal edilecek link, dış davet, misafir grant’i ve olağan dosya grant’i sayıları (08 §4.5). `moveFile` aynı kümeyi aynı batch’te uygular (uploader grant’i ve hedef projenin kendi kapsamı kalır) ve guard, önizlemedeki sayımın değişmediğini denetler, aksi halde `WriteConflict`.

## 6. Yorumlar

- **Kim yazar:** dosyada `comment` ve üstü (iç rol veya canlı misafir grant’i). Link asla yazamaz (`LINK_NO_COMMENTS`). Yorumcu rolü tabanı `comment`.
- **`authorScopeAtWrite`:** yazım anında aktörün o workspace’teki rolü `guest` ise `guest`, diğer bütün iç rollerde `internal`. Rol aynı batch’in guard’ında yeniden okunur, böylece rol değişimiyle yarışta yanlış kapsam yazılmaz. `versionNumber` güncel sürüm numarasıdır.
- **Kim görür:** iç kullanıcı dosyadaki bütün yorumları görür. Misafir yalnız (a) kendi yorumlarını ve (b) `authorScopeAtWrite = 'internal'` olup yazarı **okuma anında** da workspace’in iç üyesi olan yorumları görür (D19, 08 §4). `NULL` kapsamlı legacy yorum misafire kapalı. Filtre SQL’de, sayım ve sayfalamadan önce uygulanır ve `viewComment` kararıyla eşdeğerlik testi yapılır. Yanıt e-posta içermez, yalnız görünen ad.
- **Yanıt:** tek seviye (`parentId` bir üst seviye yorum olmalı). Misafir, göremediği bir yoruma yanıt yazamaz (404).
- **Silme:** yazar veya sahip/yönetici. Yumuşak silme: `deletedAt`, `content = ''`. Yanıtlar kalır, arayüz “Yorum silindi” gösterir. Düzenleme bu fazda yok.
- **Sınırlar:** içerik 1–4000 karakter, düz metin (HTML render edilmez), `RateLimit(comment)`. `access_log`’a `comment.created`/`comment.deleted` yazılır, içerik yazılmaz.

## 7. Aktivite ve erişim kaydı

### 7.1 Olaylar (`access_log.action`, sabit adlar)

`file.uploaded`, `file.version_uploaded`, `file.version_restored`, `file.renamed`, `file.moved`, `file.trashed`, `file.restored`, `file.purged`, `file.previewed`, `file.downloaded`, `comment.created`, `comment.deleted`, `link.created`, `link.updated`, `link.revoked`, `link.copied`, `link.opened`, `link.password_failed`, `access.granted`, `access.revoked` (Faz 3’te var). Ret olayları yalnız yetkili ama başarısız link parolası ve teslim bütünlüğü için yazılır. Diğer retler log sayacıdır, tabloya girmez (gürültü ve sayfalama yükü).

### 7.2 PII yok

Saklanan: kimlikler, eylem, sonuç, `requestId` (`cf-ray`), zaman, sabit `reason` kodu. **Saklanmayan:** e-posta, ad, dosya adı, yorum içeriği, IP, user agent, URL, token, parola. Arayüz adları okuma anında güncel tablolardan çözer. Silinmiş hedef “silinmiş dosya” olarak görünür.

### 7.2a Güvenlik kaydı (D21)

IP ve user agent `access_log`'a hiç girmez. Ayrı bir `security_log` tablosu (yeni tablo, 0014'te) yalnız şu olaylarda yazılır: giriş başarılı/başarısız, parola sıfırlama isteği, `link.opened`, `link.password_failed`, `file.downloaded`. Alanlar: zaman, olay, `userId` (varsa), `workspaceId` (varsa), hedef kimliği, `cf-connecting-ip`, kısaltılmış user agent (en çok 256 karakter), `requestId`. Saklama 90 gün (`AppConfig`, plan bağımsız), günlük cron siler. Yalnız platform yöneticisi okur (Faz 7 admin ekranı); workspace aktivite ekranında görünmez, hiçbir workspace ucu bu tabloyu okumaz. Gizlilik politikasına eklenir. Legacy `activity_logs` içindeki IP/user agent değerleri cutover'da 90 günden eskiyse `NULL` yapılır (§1.5, cutover günü onay).

### 7.3 Saklama

`Entitlements.auditRetentionDays` (varsayılan 365). Günlük cron eski satırları 1000’lik gruplarla siler. **Gerekçe:** “kim neyi açtı” iddiası bir yıllık geçmişle anlamlı, sınırsız tutmak D1 boyutunu ve veri minimizasyonu ilkesini zorlar. **Alternatif:** 90 gün. Kurumsal denetimler için kısa bulundu, plan bazlı uzatma için alan zaten `Entitlements`’ta.

### 7.4 Kim görür

`listActivity` (sahip/yönetici, mevcut) dosya filtresi (`targetKind = 'file'`, `targetId`) alır. Dosya ayrıntı panelindeki “Aktivite” sekmesi için `listFileActivity` dosyada `edit` ister. Misafir hiçbir aktivite görmez.

## 8. Programlar, HTTP uçları, servisler, testler

### 8.1 Programlar

Uygulama işlemleri mevcut `POST /api/app/<operation>` dağıtıcısına eklenir (CSRF, oturum, hız sınırı, Schema, `private, no-store`). İkili uçlar ayrı route’larda, `http/files.ts` ve `http/share.ts` ile aynı katman düzeninde.

| Program / işlem | Girdi → çıktı | Yetki eylemi | Hata etiketleri (ortak `DbError`, `ValidationError`, `RateLimitExceeded` hariç) |
|---|---|---|---|
| `requestUpload` | `workspaceId, projectId?, targetFileId?, name, size` → `uploadId, url, headers, expiresAt` | `uploadFile` / `uploadProjectFile` / `uploadVersion` | `ResourceUnavailable`, `PermissionDenied`, `UnsupportedFileType`, `FileTooLarge`, `StorageQuotaExceeded`, `UploadLimitReached`, `StorageError`, `ConfigError` |
| `completeUpload` | `uploadId, etag` → `FileView` | aynı (yeniden) | `UploadUnavailable`, `UploadIncomplete`, `UploadMismatch`, `UnsupportedFileType`, `VersionTypeMismatch`, `StorageQuotaExceeded`, `WriteConflict`, `StorageError` |
| `cancelUpload` | `uploadId` → `void` | oturum sahibi | `UploadUnavailable` |
| `listFiles` | §5.1 → sayfa | `view` (satır başına) | `WorkspaceUnavailable`, `ResourceUnavailable` |
| `getFile` | `fileId` → `FileView \| GuestFileView` | `view` | `ResourceUnavailable` |
| `renameFile`, `moveFile`, `previewMoveFile` | §5.4 | `edit` / `moveFile` | `ResourceUnavailable`, `PermissionDenied`, `WriteConflict` |
| `starFile`, `unstarFile` | `fileId` | `view` | `ResourceUnavailable` |
| `trashFile`, `restoreFile`, `purgeFile`, `emptyTrash`, `listTrash` | §5.3 | `trashFile` / `restoreFile` / `purgeFile` | `ResourceUnavailable`, `PermissionDenied`, `WriteConflict` |
| `listVersions`, `restoreVersion` | §5.2 | `viewHistory` / `uploadVersion` | `ResourceUnavailable`, `PermissionDenied`, `VersionUnavailable`, `WriteConflict` |
| `deliverContent`, `deliverThumbnail` (GET) | `fileId, v, range?` → akış | `download` / `preview` | `ResourceUnavailable`, `PermissionDenied`, `PreviewUnavailable`, `ContentIntegrity`, `StorageError` |
| `putThumbnail` (POST ikili) | `fileId, v, bytes` → `void` | `edit` | `ResourceUnavailable`, `PermissionDenied`, `InvalidThumbnail`, `PayloadTooLarge` |
| `createShareLink`, `updateShareLink`, `revokeShareLink`, `copyShareLink`, `getShareSettings` | `fileId, level, expiresAt?, password?` → `ShareSettings` (+ `url` yalnız oluşturma ve kopyalamada) | `shareFile` | `PermissionDenied`, `ResourceUnavailable`, `ShareLinkLimitReached`, `AccessExpiryInvalid`, `LinkConflict`, `WriteConflict`, `ConfigError` |
| `resolveShareLink` (SSR) | `token` → `LinkFileView \| PasswordGate` | link | `LinkUnavailable`, `LinkExpired`, `RateLimitError` |
| `verifyLinkPassword` | `token, password, turnstileToken?` → `Set-Cookie` | link | `LinkUnavailable`, `LinkPasswordInvalid`, `CaptchaFailed` |
| `deliverLinkContent`, `deliverLinkThumbnail` | `token, range?` | link + `download` / `preview` | `LinkUnavailable`, `LinkExpired`, `LinkPasswordRequired`, `PermissionDenied`, `PreviewUnavailable` |
| `listComments`, `addComment`, `deleteComment` | `fileId, cursor` / `fileId, content, parentId?` / `commentId` | `view`+`viewComment` / `comment` / yazar veya yönetici | `ResourceUnavailable`, `PermissionDenied`, `CommentUnavailable`, `WriteConflict` |
| `listSharedWithMe`, `listSharedByMe` | `workspaceId, cursor` → sayfa | aktörün kendi kayıtları | `WorkspaceUnavailable` |
| `listFileActivity` | `fileId, cursor` | `edit` | `ResourceUnavailable`, `PermissionDenied` |
| cron: `expireUploadSessions`, `purgeExpiredTrash`, `drainStorageDeletions`, `pruneAccessLog` | — | `system` | yalnız log |

**Yeni tagged error’lar ve durumlar** (`respond.ts` `STATUS`, tam eşleme): `UnsupportedFileType` 415, `FileTooLarge` 413, `StorageQuotaExceeded` 409, `UploadLimitReached` 429, `UploadUnavailable` 404, `UploadIncomplete` 409, `UploadMismatch` 422, `VersionTypeMismatch` 422, `VersionUnavailable` 404, `PreviewUnavailable` 404, `ContentIntegrity` 409, `InvalidThumbnail` 422, `ShareLinkLimitReached` 409, `LinkConflict` 409, `LinkUnavailable` 404, `LinkExpired` 410, `LinkPasswordRequired` 401, `LinkPasswordInvalid` 401, `CommentUnavailable` 404.

### 8.2 `Storage` servisinin genişletilmesi

Mevcut: `head`, `get`, `put`, `delete`, `presignUpload`, `presignDownload`. Değişiklikler:

- `UploadUrlOptions` + `contentLength: number` ve `ifNoneMatch: '*'` (ikisi de imzalı başlık). `r2Presign.presign` başlıkları zaten imzalıyor, yalnız seçenek eklenir.
- `getRange(key, { offset, length } | { suffix })` → `Option<ObjectBody>` (imza denetimi ve teslim için). Live: `bucket.get(key, { range })`. Teslim için `get(key, { range?, onlyIf? })` da aynı biçimi alır ve `R2Range`’i yansıtır.
- `delete` değişmez (çoklu anahtar).
- **Memory layer:** `simulateBrowserPut(url, bytes, headers)` test yardımcısı. Sahte URL’deki `contentLength` ve `ifNoneMatch` kurallarını uygular: boyut farkında 403, var olan anahtarda 412. Böylece programlar R2 davranışına karşı test edilir. `getRange` bayt dilimi döner. Her çağrı bir sayaca yazılır (“presignDownload çağrılmadı” gibi testler için).
- **Live doğrulaması (staging entegrasyon testi, 4a kabulü):** R2’nin imzalı `content-length` uyuşmazlığını ve `If-None-Match: *` ile ikinci PUT’u reddettiği gerçek bucket’ta denenir. Biri desteklenmiyorsa telafi: PUT süresi 5 dakikaya iner ve teslimdeki boyut/ETag karşılaştırması (§3.1) son savunma olur. Tamamlamadan sonra üzerine yazılan nesne `ContentIntegrity` ile kapanır ve kota hesabı D1’deki doğrulanmış boyutu kullanmaya devam eder. Sonuç bu dokümana not edilir.

### 8.3 `AppConfig` ekleri

`shareTokenKeys` (`SHARE_TOKEN_KEYS`, Schema ile çözülür, aktif sürüm zorunlu), `shareProofKey` (`SHARE_PROOF_KEY`, ≥ 32 bayt), yeni `rateLimits` eylemleri. Eksikse ilgili programlar `ConfigError` ile kapanır. Uygulamanın geri kalanı çalışır.

### 8.4 Test planı

- **Saf:** imza doğrulayıcıları (her tür için geçerli, kesik, yanlış ve “uzantı doğru, içerik HTML/SVG” örnekleri), ad temizleme, `Content-Disposition` kodlama, kota hesabı (paylaşılan anahtar), teslim kimliği, parola çerezi (süre, revizyon, MAC kurcalama, sabit zaman), token şifreleme ve anahtar dönüşümü, legacy link eşleme fonksiyonu.
- **Program (memory `Db` + `Storage` + `RateLimit` + `Entitlements.fixed`):** her satır için olumlu ve olumsuz yol. Ayrıca: eşzamanlı iki tamamlama, kota yarışı, sürüm yarışı (`currentVersionNumber` guard), boyut uyuşmazlığı ve yeniden PUT (412), tür reddinde nesnenin kuyruğa girmesi, purge’ün `RESTRICT` tablolarını temizlemesi, silme işçisinin başvurulan anahtarı silmemesi, `blog/` anahtarına dokunmaması, kısıtlı projeye taşımada link/grant iptali, çöpe atınca link iptali, misafir yorum görünürlüğü (kendi, iç, diğer misafir, legacy `NULL`, yazarı sonradan misafire düşen iç üye), link ile yorum reddi, misafirin eski sürüm kimliğiyle teslim reddi.
- **Kontrat:** `GuestFileView`, `LinkFileView` anahtar kümeleri. Hata yanıtlarında R2 anahtarı, e-posta ve token yok. `access_log` satırlarında yasaklı alan yok (sütun kümesi + örnek değer taraması).
- **HTTP:** teslim başlıkları (200 ve 206), `Sec-Fetch-Site: cross-site` reddi, `/s/*` önbellek ve referrer başlıkları, parola gövdesi zorunluluğu (sorgu dizgisinde parola 400), CSRF, bilinmeyen işlem 404.
- **Migration:** 0014 `check-migrations`’tan geçer. Legacy fixture yazımları 0014 sonrası başarılı. `sqlite_master` beklenen indeksler.
- **Staging entegrasyon (elle, her PR’ın kabulünde listelenir):** gerçek presign PUT, tamamlama, indirme, Range, link ve parola akışı.

## 9. Staging ihtiyaçları

### 9.1 Kullanıcıdan istenecekler (tam liste)

Yalnız bir şey: **staging bucket’ına sınırlı R2 API token’ı.**

1. Cloudflare panosu → **R2 Object Storage** → **Manage R2 API Tokens** (API → R2 API tokens) → **Create API token**.
2. Ad: `vizcad-staging-presign`. İzin: **Object Read & Write**. **Specify bucket(s)** → yalnız `vizcad-files-staging`. TTL: süresiz veya cutover’a kadar. IP filtresi yok (Worker çıkış IP’leri sabit değil).
3. Oluşturunca çıkan **Access Key ID** ve **Secret Access Key** değerlerini orkestratörün açacağı gizli giriş kartına yapıştır (sohbete yazma). Değerler bir kez gösterilir.

Orkestratör bunları `wrangler secret put R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` ile **yalnız staging** (üst düzey) ortamına yazar. `R2_ACCOUNT_ID` hesap kimliğidir, zaten biliniyor. Doğrulama: token ile `vizcad-files-bucket`’a erişim denemesi 403 dönmeli (yalnız `HEAD`, yazma yok).

### 9.2 Orkestratörün kendi yapacakları

- `SHARE_TOKEN_KEYS` ve `SHARE_PROOF_KEY` staging sırları (`openssl rand -base64 32`, depoya girmez).
- Bucket CORS (`wrangler r2 bucket cors set vizcad-files-staging --file cors.json`, prod’a dokunmadan):

```json
{
  "rules": [{
    "allowed": {
      "origins": ["https://vizcad-rewrite.ferhatrudvanogullari6.workers.dev", "http://localhost:3000"],
      "methods": ["PUT"],
      "headers": ["content-type", "if-none-match"]
    },
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600
  }]
}
```

  GET için CORS yok, çünkü teslim Worker’dan aynı origin ile yapılır. Prod CORS’u cutover adımıdır ve onay ister.
- `wrangler.jsonc` üst düzeyine `triggers.crons` (`0 * * * *` yükleme oturumları ve silme kuyruğu, `30 3 * * *` çöp ve audit temizliği). `env.production` içinde `"triggers": { "crons": [] }` ile boşaltılır (Wrangler `triggers`’ı env’lere miras verir); cutover’da doldurulur.
- Bucket’ta `r2.dev` ve genel erişimin kapalı olduğunu doğrulamak (salt okunur komut).

## 10. Bölünme ve kabul ölçütleri

Her PR `rewrite`’a. Her birinde ortak kabul: `pnpm check` ve `pnpm build` yeşil, yeni programların testleri var, `respond.ts` eşlemesi tam, staging’e elle yayın ve listedeki elle doğrulama.

| PR | Kapsam | Kabul ölçütleri |
|---|---|---|
| **4a** Şema, Storage, yükleme | 0014, `fileTypes.ts` ve imza doğrulayıcıları, `Storage` genişlemesi ve memory layer, `Entitlements` alanları, `upload_sessions`, `storage_deletions`, `requestUpload`/`completeUpload`/`cancelUpload` (yeni dosya ve yeni sürüm), cron iskeleti (`scheduled`), staging sırları ve CORS | Migration denetimi ve legacy yazar testi geçer. Staging’de 50 MB STL ve 5 MB STEP yüklenir. `.dwg` ve STL uzantılı HTML reddedilir ve nesne kuyrukla silinir. Boyut uyuşmazlığı ve ikinci PUT reddi gerçek R2’de doğrulanır (sonuç dokümana not edilir). Kota yarışı testi. |
| **4b** Liste, çöp, sürüm, yıldız, ad, taşıma | `listFiles` (filtreler, proje), `getFile` ve `FileView`/`GuestFileView`, `rename`, `star`, `trash/restore/purge/emptyTrash/listTrash`, `listVersions/restoreVersion`, `moveFile/previewMoveFile`, çöp ve silme cron’ları | İzin matrisi her eylemde (sahip, yönetici, üye, yorumcu, misafir, kaldırılmış üye, kısıtlı proje). Misafir projeksiyon kontrat testi. Purge sonrası R2’de nesne kalmaz, `blog/` dokunulmaz. Legacy biçimli fixture dosyası listelenir, sürümlenir, geri yüklenir. |
| **4c** Link paylaşımı ve teslim | `deliverContent/Thumbnail`, `putThumbnail`, link programları, parola ve çerez, `resolveShareLink`, `/s/$token` sunucu tarafı, `/shared/$token` yönlendirmesi, yeni rate limit eylemleri, audit tekilleştirme | Başlık testleri (200/206), cross-site reddi, `view` linkinde `content` kapalı, parola yalnız gövdede, üç hatadan sonra Turnstile, iptal ve revizyon sonrası çerez geçersiz, legacy tavanı okumada, “Linki kopyala” yetkisiz kullanıcıda kapalı. Staging’de telefonla link açma ve indirme. |
| **4d** Yorumlar ve aktivite | `file_comments` programları, görünürlük filtresi, `access_log` olayları (4a–4c olayları burada tamamlanır), `recent` filtresi, `listFileActivity`, `listSharedWithMe/ByMe`, audit saklama cron’u | Misafir görünürlük matrisi (beş durum) ve `viewComment` eşdeğerlik testi. Audit satırlarında PII taraması. Link ile yorum reddi. |
| **4e** Arayüz | Tüm dosyalar (liste/ızgara, filtreler, arama, toplu eylem, sürükle-bırak, ilerleme kartı), Projeler ve proje sayfası dosya listesi, Paylaşılanlar, Çöp kutusu, Aktivite, dosya ayrıntı paneli (ayrıntı, yorum, aktivite, sürümler), paylaşım penceresi (03 §2.3), `/s/$token` sayfası (mobil öncelikli, parola kapısı, hata durumları) | 03 tasarım kuralları, 390 px açık/koyu, 320 px’te yatay kaydırma yok, 44 px dokunma hedefi. `/s/$token` için Lighthouse. Boş, yükleniyor ve hata durumları 03’teki metinlerle. Görüntüleyici yok (Faz 5): dosya sayfası küçük resim ve “İndir” gösterir. |

4a ve 4b sıralı, 4c ve 4d 4b’den sonra paralel gidebilir. 4e’nin ekranları ilgili API PR’ı birleşince başlar.

## 11. Açık sorular (kullanıcı kararı)

**Cevaplandı (D21, 24 Kasım 2026):** 1 onaylandı; 2 Faz 5'e kadar dosya kartı; 3 ayrı güvenlik kaydı, 90 gün (§7.2a).


1. **Varsayılan plan değerleri:** workspace başına 5 GB depolama, dosya başına 100 MB, çöpte 30 gün, aktivite kaydı 365 gün, link sayısı sınırsız. Onay mı, değişiklik mi?
2. **Yeni yüklemelerde küçük resim:** küçük resim üreteci Faz 5 pipeline’ında. O zamana kadar yeni dosyaların “yalnızca görüntüleme” linkinde görsel yerine dosya kartı görünür. Kabul mü, yoksa legacy’deki tarayıcı içi küçük resim üretimi 4e’ye mi taşınsın (vtk.js Faz 4’e girer)?
3. **Legacy `activity_logs` kişisel verisi:** cutover’da `ipAddress` ve `userAgent` sütunları `NULL` yapılsın mı (KVKK/GDPR veri minimizasyonu, geri alınamaz), yoksa tablo olduğu gibi mi kalsın?

## Uygulama notları · Faz 4a

Şema, `Storage`, yükleme ve cron iskeleti uygulandı. Tasarımdan sapmalar ve eklenenler:

- **`0014_files_sharing`:** §1.4 tablosunun tamamı. Legacy tablolara yalnız nullable `ADD COLUMN` ve benzersiz olmayan indeksler. Legacy tablolara trigger eklenmedi (§1.3 kural 2). `file_comments.authorScopeAtWrite` için `CHECK` SQL’de elle eklendi (Drizzle varolan tabloda sütun `CHECK`’i üretemez), FK’lerde `ON DELETE SET NULL` elle yazıldı. Test: legacy yazarın her satır şekli (yükleme, sürüm anlık görüntüsü, yinelenen sürüm numarası, yinelenen yıldız, çöp, yorum, paylaşım, silme) 0014 sonrası başarılı (`migration0014.test.ts`).
- **`upload_sessions`:** tasarım sütunlarına ek olarak `fileId NOT NULL` (anahtar `…/f/{fileId}/…` istek anında lazım olduğundan yeni dosyanın kimliği oturumda üretilir; sürümde `targetFileId = fileId`). `fileId` ve `targetFileId` üzerinde FK yok (kalıcı silme oturumlara takılmasın); çalışma alanı, kullanıcı ve proje FK’leri `RESTRICT`. İptal edilen oturum `expired` olur (durum kümesi dört değerde kaldı), kuyruk nedeni `upload_canceled`.
- **Silme işçisi emniyet ağı:** D1’de hâlâ başvurulan anahtar `files`, `file_versions` (anahtar ve küçük resim) ve **`pending`** oturumlarda aranır. §5.3 `completed` oturumu da sayıyordu; `completed` oturum zaten bir `files`/`file_versions` satırına karşılık gelir ve kalıcı silmeden sonra da kalan oturum satırı anahtarı sonsuza dek “başvurulan” yapardı. 4b `purgeFile` bu yüzden oturum satırlarına bağlı kalmaz. `blog/` önekli anahtarlara işçi hiç dokunmaz.
- **Reddedilen nesne:** oturum `rejected` olur ve anahtar aynı D1 batch’inde kuyruğa girer; ardından hemen en iyi çaba ile silinir (`drainStorageDeletions({ keys })`), başarısızsa saatlik cron yeniden dener.
- **Tamamlamada kota:** ön denetim aşılırsa oturum reddedilir ve nesne kuyruğa girer (`StorageQuotaExceeded`); aynı anda başka tamamlama yüzünden `batch_guard` düşerse oturum `completed` ise aynı dosya döner, `pending` ise `WriteConflict` (istemci yeniden `completeUpload` çağırır). Sürüm yarışında kaybeden çağrı `WriteConflict` alır, yeniden denemede sonraki numarayı alır (testli).
- **Birimler:** 1 MB = 1024², 1 GB = 1024³ (legacy `storageQuotaGb` ile uyumlu). `Entitlements.live` kişisel workspace’te `max(plan, sahibin storageQuotaGb × GB)` hesabı için D1 okur.
- **Yeni sürüm uzantısı:** `.stp` dosyasına `.step` sürümü `VersionTypeMismatch` (uzantı bire bir aynı olmalı, tasarım metni gibi).
- **`Storage`:** `presignUpload` `contentLength` ve `ifNoneMatch: '*'` ister ve ikisini de imzalar (`content-length;content-type;host;if-none-match`, bağımsız SigV4 doğrulayıcısıyla test edildi). `get(key, { range })` ve `getRange`; `onlyIf` 4c’de. Memory layer’da `MemoryStorageControl.simulateBrowserPut` (boyut/başlık/süre → 403, var olan anahtar → 412) ve işlem sayacı. `Storage.live` yalnız binding kullanır, ağ çağrısı yoktur, bu yüzden enjekte edilecek `fetch` yok.
- **Hız sınırı:** yalnız `upload` eklendi (kullanıcı başına 120/saat, IP başına 240/saat); diğer eylemler (`linkOpen` …) 4c/4d ile.
- **Cron:** `scheduled` işleyicisi `src/server.ts`’te. Saatlik: oturum süresi doldurma ve silme kuyruğu. Günlük: `security_log` temizliği (90 gün, `AppConfig.securityLogRetentionDays`). Çöp ve `access_log` temizliği 4b/4d’de aynı dağıtıcıya eklenir. `triggers.crons` üst düzeyde; Wrangler miras verdiği için `env.production` boş listeyle geçersiz kılındı (`scripts/wranglerCrons.test.ts`).
- **`SHARE_TOKEN_KEYS` biçimi (4c için):** `{"1":"<base64 32 bayt>"}` §4.1’deki `active` alanını taşımıyor. Öneri: `active` yoksa en yüksek sürüm aktif sayılır, varsa o kullanılır. 4a bu sırları okumaz.
- **Staging gereksinimi:** presign için `R2_ACCOUNT_ID` (veya `R2_ENDPOINT`) de tanımlı olmalı; yoksa `requestUpload` `ConfigError` (500) verir.
- **Gerçek R2 doğrulaması** (`scripts/staging-verify-uploads.sh`): sonuçlar staging’e yayınlandıktan sonra buraya yazılacak. Beklenen: imzalı `content-length` uyuşmazlığı 403, ikinci PUT 412; biri desteklenmezse §8.2’deki telafi (PUT süresi 5 dakika, teslimde boyut/ETag karşılaştırması).
- **İleriye dönük notlar (4a incelemesi):**
  - **4c teslimi:** nesne okunurken ETag (`onlyIf`) zorunlu; `scripts/staging-verify-uploads.sh` 4c’den önce gerçek R2’de çalıştırılmalı.
  - **İmza denetimleri tür koklamasıdır**, içerik güvenliği sağlamaz. 4c’de teslim `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` ve `Content-Security-Policy: sandbox` ile yapılmalı.
  - **`security_log`:** user agent insert öncesi 256 karaktere kısaltılmalı.
  - **4b:** bir anahtara son başvuruyu düşüren her işlem (purge, sürüm silme, geri yükleme …) anahtarı aynı batch’te silme kuyruğuna yazmalı.
  - **`upload_sessions`:** terminal durumdaki (`completed`, `expired`, `rejected`) oturumlar için budama işi gerekir; hesap ve proje silmede önce oturum satırları silinmeli (çalışma alanı, kullanıcı ve proje FK’leri `RESTRICT`).
  - **İptal/red:** kuyruk satırı `notBefore = expiresAt + 5 dk` ile yazılır; anında silme en iyi çabadır, satır URL ölene kadar kalır ve işçi nesneyi son kez siler.

### Staging kabul sonucu · Faz 4a (24 Kasım 2026)

`scripts/staging-verify-uploads.sh` gerçek R2'ye karşı (staging, test kullanıcısı `staging-uploader@vizcad.test`) **20/20** geçti: 5 MB STEP ve 50 MB STL yüklendi, boyut ve ETag kaydedildi; aynı URL'ye ikinci PUT **412** (`If-None-Match: *` R2'de uygulanıyor); yanlış boyutlu gövde **403** (imzalı `content-length` R2'de uygulanıyor); `.dwg` imza öncesi **415**; STL uzantılı HTML tamamlamada **415** ve nesne bucket'tan hemen silindi; iptal/red kuyruk satırları `notBefore = expiresAt + 5 dk` ile bekliyor. Yedek plana gerek kalmadı.

## Uygulama notları · Faz 4b

Liste, ayrıntı, ad değiştirme, yıldız, çöp kutusu, sürümler ve taşıma uygulandı (`programs/files.ts`, `trash.ts`, `versions.ts`, `move.ts`, ortak bağlam `fileContext.ts`, görünüm tipleri `src/shared/fileViews.ts`). Tasarımdan sapmalar ve eklenenler:

- **Şema değişikliği yok.** `0015` gerekmedi; yeni sütun veya indeks eklenmedi.
- **Projeksiyonlar:** `FileView` (iç roller) `id, name, extension, size, projectId, projectName, createdAt, updatedAt, starred, thumbnailAvailable, currentVersion { number, uploadedBy }` ve eylem bayrakları `can { edit, comment, download, viewHistory, trash, share }` taşır. §3.5’teki sürüm listesi ve paylaşım özeti `FileView` içinde **değil**, ayrı uçlarda (`listVersions`, 4c paylaşım uçları). `GuestFileView` tasarımdaki anahtar kümesiyle birebir; `sharedBy` verenin görünen adı, çözülemezse workspace adı. Kontrat testi (`files.test.ts`) iki kümeyi tam eşitlikle ve “anahtar/e-posta/kullanıcı kimliği yok” taramasıyla denetler. Liste öğeleri de aynı projeksiyonlardır (misafire `GuestFileView`).
- **`listFiles`:** süzgeçler `all | starred | mine` + `projectId` + ad araması (`query`); sıralama `updated | created | name | size` (+ `direction`), keyset imleç `<id>|<sıralama değeri>`. SQL yalnız hızlandırır (workspace, durum, süzgeç, misafir için erişilebilir dosyalar, yönetici olmayanlar için kısıtlı proje daraltması); her satır `decidePermission(view)` ile doğrulanır, SQL kural değildir. `projectId` verilirse proje düzeyinde `view` ister (yalnız dosya grant’i olan misafir proje listesini açamaz, `PermissionDenied`). `recent` 4d’de. `mine` = `files.userId` (legacy) veya `file_access.source = 'uploader'`.
- **`renameFile`:** girdi tam ad veya taban ad olabilir; yazılan ad dosyanın uzantısıyla (büyük/küçük harf fark etmez) bitiyorsa olduğu gibi, bitmiyorsa uzantı eklenerek kullanılır (`v1.2` → `v1.2.step`). Sonuç `requestUpload` ile aynı ad kurallarından geçer, taban ad boş olamaz. `updatedAt` güncellenir.
- **`starFile`/`unstarFile`:** `INSERT … SELECT … WHERE NOT EXISTS` (Drizzle’da `d.run()` batch’e girmez, `insert().select(sql)` kullanıldı). `unstarFile` yalnız üyelik ister (yetkisi kalkan dosyanın yıldızı da silinebilsin), çiftin bütün satırlarını siler.
- **Çöp:** `trashFile` aynı batch’te aktif linkleri iptal eder (revizyon +1) ve bekleyen dış davetleri `canceled` yapar. `restoreFile` çakışan adı `ad (2).ext` (sonra `(3)`, …) yapar; dile bağlı metin D1’e yazılmaz. `listTrash` her satırı `restoreFile` kararıyla süzer (yorumcu ve misafir boş liste görür), `purgeAt = deletedAt + Entitlements.trashRetentionDays`; `deletedAt` boş legacy satırlarda `updatedAt` kullanılır.
- **Kalıcı silme (`purgeOne`):** dosya başına **tek batch** (D1 100 bağlı parametre sınırı yüzünden dosya grubu tek batch’e konmaz). Sıra: guard (hâlâ çöpte, aktör hâlâ rolde) → silinen dosyanın bütün anahtarlarını (dosya, küçük resim, her sürüm ve küçük resmi; tekilleştirilmiş) `storage_deletions`’a yazan `INSERT … SELECT` → `file_access`, `share_links`, `resource_invitations` → `files` (sürümler, yıldızlar, yorumlar cascade) → `access_log` (`file.purged`). Anahtar listesi **yazım anında SQL ile** okunur (bu sırada eklenen sürüm de kapsanır). Başka bir `files`/`file_versions` satırının hâlâ kullandığı anahtar ve `blog/` öneki kuyruğa girmez; işçinin emniyet ağı ayrıca aynı denetimi yapar. Aynı anahtar hem dosya hem sürüm satırında olsa (legacy geri yükleme) bir kez kuyruğa girer. Batch sonrası anahtarlar en iyi çabayla hemen silinir (40’lık gruplar); başarısızsa saatlik işçi yeniden dener.
- **`emptyTrash`:** her çağrıda en çok 50 dosya (`{ purged, more }`, `more` ise istemci yeniden çağırır). Her dosya `purgeFile` kararından geçer; arşivli projedeki dosya atlanır (günlük işle silinir), başka her ret (üye, yorumcu) çağrıyı `PermissionDenied` ile düşürür.
- **Cron:** günlük `purgeExpiredTrash` (sistem aktörü, `access_log.actorKind = 'system'`), süresi dolmuş dosyaları seçer (workspace değil; en kısa süre = temel plan, `ORDER BY` saklama başlangıcı, sayfalı), her dosyada workspace’in kendi `trashRetentionDays` süresini ve `AppConfig.trashRetentionFloor` tabanını uygular; `purgeOne` guard’ı sistem silmelerinde süreyi yazım anında yeniden denetler (seçimden sonra geri yükle + yeniden çöpe at silinmez); kuyruk nedeni `trash_retention` (elle silmede `purged`). Çalıştırma başına en çok 200 dosya; `workspaceId` boş legacy dosyalara dokunmaz. Anahtarlar kuyruğa girer, hemen silinmez; sonraki saatlik çalıştırma R2’den siler. `triggers.crons` ve “production’da cron yok” kuralı değişmedi (`scripts/wranglerCrons.test.ts`). Aktör `null` olan `activity()` artık sistem satırı yazar.
- **Sürümler:** `listVersions` (`viewHistory`: misafir hariç) `current` + anlık görüntüler (`versionNumber`, tarih, id azalan; legacy yinelenen numaralar korunur). `restoreVersion` (`uploadVersion`) güncel hâli anlık görüntüler, seçilen sürümün anahtarı/boyutu/ETag’i/küçük resmi güncel olur, numara `current + 1`, `currentUploadedByUserId` = o sürümü yükleyen. Guard: dosyanın güncel anahtarı ve `currentVersionNumber`, sürüm sayısı ve seçilen satır; yarışta `WriteConflict`. Hiçbir başvuru düşmediği için kuyruğa bir şey yazılmaz. Başka dosyanın sürüm kimliği `VersionUnavailable` (404, yeni hata).
- **Taşıma:** `previewMoveFile` ve `moveFile` aynı planı (`permissions.ts moveFile`) paylaşır. Etki (`links`, `invitations`, `guestGrants`, `memberGrants`) yalnız **kısıtlı bir projeye giriş**te vardır; çıkışta veya takım projesine taşımada hiçbir şey iptal edilmez. `moveFile` isteğe bağlı `expected` (önizlemedeki sayılar) alır; şimdiki sayılarla uyuşmazsa veya yazım anında değişirse `WriteConflict`, hiçbir şey taşınmaz. Yükleyen grant’i ve hedef projenin kendi erişimi korunur. Aynı konuma taşıma etkisiz başarıdır (aktivite yazılmaz).
- **HTTP:** `POST /api/app/` altında `listFiles, getFile, renameFile, starFile, unstarFile, trashFile, restoreFile, purgeFile, emptyTrash, listTrash, listVersions, restoreVersion, previewMoveFile, moveFile`; gövdelerde bilinmeyen alan 400. Yeni hata `VersionUnavailable` → 404.
- **İzin matrisi testleri:** sahip, yönetici, üye (yükleyen ve yükleyen değil), yorumcu, misafir (grant’li/grant’siz/süresi dolmuş), kaldırılmış üye, başka workspace, kısıtlı proje ve çöpteki dosya, her eylem için `files.test.ts` ve `fileLifecycle.test.ts` içinde.
- **Staging kabulü:** `scripts/staging-verify-files.sh` (yükleme, liste, ad, yıldız, sürüm geri yükleme, çöp, geri yükleme, taşıma, purge ve R2 nesnelerinin kalkması). Sonuç staging’e yayınlandıktan sonra buraya yazılacak.
- **Legacy sürümler (4c’ye not):** legacy `file_versions.thumbnailR2Key` NULL olduğundan, legacy bir sürüm geri yüklenince dosyanın küçük resmi görünümden düşer (R2’deki nesne güvende, silinmez). Legacy sürümlerde uzantı ile içerik türü uyuşmayabilir; 4c teslimde imza koklamasıyla ele alınır.
- **Taşıma önizlemesi:** `previewMoveFile` sayıları, workspace’ten kaldırılmış kullanıcıların grant’lerini saymaz (zararsız: bu grant’ler zaten etkisizdir).
- **`emptyTrash` çakışma:** `WriteConflict` alan dosya `purged` sayısına girmez ve atlanır; `more` yalnız çağrı en az bir dosya sildiyse ve grup doluysa `true` (sürekli çakışan dosya istemciyi sonsuz döngüye sokmaz).
- **Ad kuralları:** U+200E/200F, U+202A–202E ve U+2066–2069 (yön değiştirici karakterler) yükleme ve yeniden adlandırmada reddedilir.

### Staging kabul sonucu · Faz 4b (25 Kasım 2026)

`scripts/staging-verify-files.sh` staging'de **39/39** geçti: liste ve projeksiyonlar (anahtar/kullanıcı kimliği sızmıyor), ad değiştirme (uzantı sabit, `/` reddi), yıldız, sürüm listesi ve geri yükleme, çöpe atma/listeleme/geri alma (`purgeAt` = 30 gün), kısıtlı projeye taşıma (eski önizleme 409), kalıcı silme ve R2 nesnelerinin kuyrukla silinmesi. İlk denemelerdeki 400'ler uygulamadan değil betikten geliyordu (bash küme genişletmesi JSON gövdesini bölüyordu; `set +B` ile düzeltildi). Bu denemelerden önce staging Free plan CPU sınırına takılıyordu; PR #16 sonrası ölçüm (ısınmış): sayfalar 4–8 ms, `get-session` 6 ms, `listFiles` ~14 ms, soğuk isolate ilk istekleri 30–70 ms.

## Uygulama notları · Faz 4d

Yorumlar, dosya aktivitesi, paylaşım listeleri, `recent` süzgeci ve `access_log` saklama işi uygulandı (`programs/comments.ts`, `activity.ts`, `sharedFiles.ts`, `accessLogCleanup.ts`; görünüm tipleri `src/shared/fileViews.ts`). Tasarımdan sapmalar ve eklenenler:

- **Şema değişikliği yok** (`0015` ve `0016` gerekmedi): `file_comments` 0014'te hazırdı, `recent` mevcut `access_log_workspace_actor_created_idx` ile çalışır.
- **Yorum düzenleme yok.** §6 “Düzenleme bu fazda yok” der; yalnız oluştur, listele, sil uygulandı.
- **`listComments`:** `view` ister, eskiden yeniye, keyset imleç `<createdAt>.<id>`, `limit` ≤ 100. Misafir filtresi SQL'dedir ve sayfa kesilmeden önce uygulanır: kendi yorumları veya `authorScopeAtWrite = 'internal'` ve yazarı **şimdi** `owner/admin/member/commenter` olan yorumlar. Eşdeğerlik testi her yorum ve her görüntüleyici için `decidePermission(viewComment)` ile SQL sonucunu karşılaştırır (beş durum + kaldırılmış yazar). Çıktı: `id, parentId, author{displayName}, content, deleted, createdAt, versionNumber, mine, canDelete`; e-posta ve kullanıcı kimliği yok. Aynı saniyedeki yorumlar kimlik sırasıyla gelir.
- **`addComment`:** `comment` izni (link `LINK_NO_COMMENTS` ile `permissions.ts`'te reddedilir; HTTP uçları yalnız oturumla çalışır ve gövdede `token` kabul etmez). İçerik kırpılır, 1–4000 karakter, düz metin. Kapsam (`guest`/`internal`) rol batch guard'ında yeniden okunur; `versionNumber` aynı INSERT içinde `COALESCE(currentVersionNumber, COUNT(file_versions)+1)` ile yazılır. Yanıt: üst yorum aynı dosyada, üst seviye, silinmemiş ve **yazara görünür** olmalı, aksi halde `CommentUnavailable` (404, yeni hata). `RateLimit(comment)`: kullanıcı başına 60/saat, IP başına 120/saat. Çöpteki dosyaya yorum `ResourceUnavailable`.
- **`deleteComment`:** yazar veya owner/admin. Yorum önce görünürlük kararından geçer: misafir göremediği yorum için `CommentUnavailable` (404), görünen ama başkasının yorumu için `PermissionDenied(ROLE_LIMIT)`. Yumuşak silme (`content = ''`, `deletedAt`), yanıtlar kalır, tekrar silme no-op başarıdır (log yazılmaz). `access_log`: `comment.created` / `comment.deleted`, `targetKind = 'file'`, `targetId` = dosya (yorum kimliği ve içerik yazılmaz), böylece dosya aktivite sekmesinde görünür.
- **Olaylar:** 4a–4b olayları (`file.uploaded`, `file.version_uploaded`, `file.version_restored`, `file.renamed`, `file.moved`, `file.trashed`, `file.restored`, `file.purged`, erişim olayları `file.access_granted/revoked`) kendi programlarında yazılıyordu; bu PR `comment.*` olaylarını ekler. `file.previewed`, `file.downloaded` ve `link.*` teslim/link tarafındadır ve **4c** yazar. PII taraması testi (`comments.test.ts`) sütun kümesini ve örnek değerleri (e-posta, ad, dosya adı, yorum metni, IP) denetler.
- **`listFileActivity`:** dosyada `edit` ister (yorumcu ve misafir `ROLE_LIMIT`), `targetKind = 'file'` satırları, yeniden eskiye. Çıktı yalnız `id, action, outcome, createdAt, actor{kind, displayName}`; `link` ve `system` aktörlerinin adı yok, `linkId`, `requestId` ve `reason` dönmez.
- **`recent`:** aktörün `access_log`'daki son 50 **farklı** dosyası; sayılan eylemler `file.previewed`, `file.downloaded`, `file.uploaded`, `file.version_uploaded` (yalnız `allowed`). Kapsam 4c'deki `previewed/downloaded` yazımlarıyla büyür. Sıralama yine istenen `sort` ile yapılır (son açılma sırası değil); kullanıcı arayüzü `updated` ile çağırır. Satırlar yine `view` kararından geçer.
- **`listSharedWithMe`:** aktörün canlı `source = 'grant'` dosya grant'leri (süresi dolmamış, dosya çöpte değil), grant tarihine göre yeniden eskiye, `view` kararıyla doğrulanır. Yalnız **dosya** grant'leri sayılır, proje grant'leri Projeler'de görünür. Öğe misafire da aynıdır: `id, name, extension, size, updatedAt, thumbnailAvailable, level, expiresAt, sharedAt, sharedBy`; proje, sürüm ve anahtar yok. `limit` ≤ 50.
- **`listSharedByMe`:** dosya başına bir satır: aktörün verdiği canlı grant sayısı (`grants`) ve aktörün oluşturduğu aktif link (`linkActive`; iptal, süresi dolmuş ve legacy tavanı geçmiş link sayılmaz), son paylaşım tarihine göre. Alıcı adları listelenmez (paylaşım penceresinde). Tasarımdaki “son açılma” `link.opened` ile 4c'den sonra eklenir.
- **Saklama cron'u:** günlük `pruneAccessLog` (aynı dağıtıcı, `DAILY`): taban planın saklama süresinden eski satırı olan workspace'ler kimlik sırasıyla yürünür, her biri kendi `Entitlements.auditRetentionDays` kesimiyle (varsayılan 365) 1000'lik gruplarla silinir; çalıştırma başına en çok 20 grup. Günlük `security_log` temizliği (90 gün, D21) 4a'daki yerinde duruyor. `triggers.crons` ve “production'da cron yok” kuralı değişmedi.
- **HTTP:** `POST /api/app/` altında `listComments, addComment, deleteComment, listFileActivity, listSharedWithMe, listSharedByMe`; `listFiles.filter` artık `recent` da kabul eder. Bilinmeyen alan 400 (istemci kapsam veya token veremez). Yeni hata `CommentUnavailable` → 404. Yeni hız sınırı eylemi `comment`.
- **CPU:** her liste tek ana sorgu (+ `openFile`/`loadScope` bağlamı ve `fileGrantsOf`); yorum sayfası tek JOIN, misafir filtresi aynı sorguda. `recent` bir alt sorgu (50 satırlık GROUP BY, indeksli).
- **Staging kabulü:** `scripts/staging-verify-comments.sh` (yükleme, yorum, yanıt, silme/mezar taşı, aktivite, `recent`, paylaşım listeleri, temizlik). Misafir görünürlük matrisi ikinci kullanıcı gerektirdiğinden program testlerinde (`comments.test.ts`). Sonuç staging'e yayınlandıktan sonra buraya yazılacak.
