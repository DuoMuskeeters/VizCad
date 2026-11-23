# Güvenlik incelemesi: `08-auth-org-design.md`

Tarih: 23 Kasım 2026. İnceleyen: Claude Opus 5.5 (xhigh). Yazar: Codex. better-auth bulguları legacy `node_modules/better-auth` 1.4.7 kaynağında satır satır doğrulandı; D1/SQLite bulguları belgelenmiş SQLite davranışına dayanıyor, kopyada test edilmeli. Orkestratör kararları en altta.

**Kalmalı:** `permissions.ts` tek karar kaynağı · workspace kaynaktan çözülür · bileşik FK'ler · görünmeyen kaynağa tek 404 · misafirde zorunlu bitiş · rol tavanı okuma tarafında da · legacy `view` → `view` · platform `user.role` içerik erişimi vermez · `/organization/*` kapalı.

## 1. Yetki modeli
- **1.1 [Yüksek]** Projesiz dosyada ve `team` projede `member` tabanı `edit`: her üye sahibin dosyasına hesapsız `download` linki açabilir, misafir ekleyebilir, yeni revizyon yükleyebilir, çöpe atabilir. Öneri: taban `download`; yükleyene yükleme batch'inde açık `file_access(edit)`; dış paylaşım, çöp, sürüm yükleme yalnız yükleyen + açık `edit` + sahip/yönetici. İleride projeye `teamLevel`.
- **1.2 [Orta]** Kısıtlı projede `edit`'li üye, projeye alınmamış kişiye dosya grant'i/link verip "Yalnızca davetliler" sınırını deler. Öneri: kısıtlı projedeki dosyada grant/link için proje yöneticisi şartı. Kısıtlı projeyi açan üyenin kendi projesine kişi ekleyememesi ürün kararı olarak yazılmalı.
- **1.3 [Orta]** Üye yalnız kendi verdiği misafir grant'ini kaldırsın (`grantedByUserId`).
- **1.4 [Orta]** Misafir sızıntı yüzeyi: dosya DTO'sunda proje bilgisi, sürüm geçmişinde e-posta, dosya aktivitesi, erişimi olanlar, üye önerileri, yorum yazarlarının e-postaları, aynı projedeki rakip misafirler. Öneri: ayrı `GuestFileView` projeksiyonu (proje yok, ad var e-posta yok, aktivite/erişim listesi yok), misafirlerin birbirini görmesi için ürün kararı, kontrat testi.
- **1.5 [Orta]** Link yaşam döngüsü: oluşturan üye çıkarılınca linkler çalışmaya devam eder; link hangi sürümü verir tanımsız. Öneri: üye kaldırmada canlı linkleri listele, varsayılan iptal; kısıtlı projeye taşımada uyarı; yönetici link envanteri; link yalnız güncel hazır sürümü verir.
- **1.6 [Düşük]** Link uçları yetki için oturumu okumaz; `access_log` `actorKind=link`; uygulama uçları parola kanıtı çerezini kabul etmez; link sayfası workspace/proje adını göstermez.
- **1.7 [Düşük]** Tek sahip kuralı: `member(organizationId) WHERE role='owner'` kısmi UQ.
- **1.8 [Düşük]** better-auth `ac` ile `permissions.ts` kayması: minimum tanım ya da eşitlik testi.

## 2. Yetki yükseltme ve kiracılar arası sızıntı
- **2.1 [Yüksek, doğrulandı]** `role: "admin,owner"` ile yönetici kendini sahip yapabiliyor (`crud-members.mjs:251,264,290,310`). İzin listesi ve rol `CHECK`'i zorunlu; D1'e `admin,owner` yazımı reddi ve Worker'da 404 testi.
- **2.2 [Yüksek, doğrulandı]** `get-full-organization`, `list-members`, `list-invitations`, `get-active-member-role`, `set-active` yalnız `member` satırı arar; süresi dolmuş misafir tüm üye e-postalarını görür. İzin listesinde okuma dahil hiçbir `/organization/*` yok; istemcide `organizationClient` yok; tüm `/organization/*` ve `/admin/*` GET/POST testi.
- **2.3 [Orta, doğrulandı]** `additionalFields` `input: false` değilse istemciden yazılabilir (`kind`, `personalOwnerUserId`, `archivedAt`). `input: false` ya da better-auth şemasına koyma; değişmezlik trigger'la.
- **2.4 [Düşük]** İzin listesi (yöntem, kanonik yol) tam eşleşme; `/`, `//`, `%2F`, büyük harf varyantları ret. Minimum: sign-up/email (Turnstile), sign-in/email, sign-in/social, callback/google, sign-out, get-session, verify-email, send-verification-email, request-password-reset, reset-password, `/reset-password/:token`. Hariç: `/update-user` (gerekirse alan beyaz listesi), `/delete-user*`, `/link-social`, `/unlink-account`, `/get-access-token`, `/refresh-token`, `/account-info`.
- **2.5 [Orta]** Oluşturma uçlarında hedef workspace gövdeden açıkça gelir ve yetki kontrolü yapılır; aktif workspace'e sessiz düşüş yok. `session.cookieCache` kapalı ya da yetkide kullanılmaz.
- **2.6 [Orta]** CSRF: ürün mutasyonları yalnız POST, Origin/`Sec-Fetch-Site` kontrolü, JSON içerik türü, davet linki açılınca otomatik kabul yok.

## 3. Davet ve misafir
- **3.1 [Yüksek, doğrulandı]** Google ile ön-hesap ele geçirme (`oauth2/link-account.mjs:21-47`): saldırgan kurbanın e-postasıyla doğrulanmamış parola hesabı açar; kurban Google ile girince hesap doğrulanır; saldırganın parolası geçerli kalır. Öneri: bağlamada doğrulanmamış kullanıcının credential hesabını sil + tüm oturumları iptal et, ya da bağlamayı reddet + parola sıfırlama iste. Test; seçilen sürümde yeniden doğrula.
- **3.2 [Orta]** Legacy davetler doğrulamadan önce paylaşıma çevriliyor (`share.server.ts`). `emailVerified = 0` alıcılı aktif paylaşımlar bekleyen `resource_invitations` olarak taşınsın; prova sayımı.
- **3.3 [Orta]** better-auth hız sınırlayıcısı isolate'ler arası paylaşılmaz. Tek `RateLimit` servisi (Workers Rate Limiting binding ya da Durable Object; KV değil); davet gönderen doğrulanmış; günlük davet kotası Entitlements'tan; mesaj uzunluğu sınırı; e-posta şablonlarında HTML escape (legacy `user.name` escape edilmiyor).
- **3.4 [Düşük]** Doğrulama token'ı HS256 JWT, tek kullanımlık değil: test "idempotent doğrulama".
- **3.5 [Düşük]** E-posta normalizasyonu = trim + küçük harf (legacy `file_invitations.email` normalize edilsin) · `changeRole` hedefi `owner`/`guest` olamaz · misafir bitişine üst sınır (Entitlements) · "Bu e-posta ile kayıtlı hesap yok" giriş hatası kullanıcı varlığını açar (03-design ile çelişki) · üye daveti `id`, misafir daveti `tokenDigest`: tek desen ya da `id`'nin bearer olmadığı açık · onboarding tamamlanma sütunu şemada yok.

## 4. Link paylaşımı
- **4.1 [Orta]** Yalnız token özeti saklanırsa "Linki kopyala" sonradan çalışmaz. Token 32 bayt CSPRNG base64url, SHA-256 özeti.
- **4.2 [Orta]** scrypt: Workers 128 MB; better-auth N=16384, r=16, p=1 (32 MiB) legacy prod'da çalışıyor; aynı parametreler, sürümlü biçim, hız sınırı hash'ten önce, birkaç hatadan sonra Turnstile.
- **4.3 [Orta]** Parola kanıtı çerezi: `__Host-` önekli, link başına ad, değer `HMAC(AppConfig anahtarı, linkId ‖ revision ‖ exp)`, `HttpOnly; Secure; SameSite=Lax`, en fazla 12 saat.
- **4.4 [Orta]** `/s/*` ve uygulama rotalarında `private, no-store` (pazarlama edge cache'inden ayrı) ve test; bu sayfada analitik betiği yok.
- **4.5 [Orta]** `Math.random` token'larına 30 gün tavanı okuma tarafında da (`legacy` işareti); legacy parolalar ele geçmiş kabul; parolalı eski linkler de 30 gün tavanı + sahibine bildirim.
- **4.6 [Orta]** Cutover'da legacy R2 S3 API token'ı iptal (eski presigned URL'ler anında geçersiz); bucket'ta r2.dev/genel erişim kapalı mı doğrula.

## 5. Geçiş
- **5.1 [Kritik]** drizzle-kit SQLite'ta yapamadığı değişikliklerde tabloyu yeniden kurar (`__new_x`, kopyala, `DROP TABLE x`, adlandır). `DROP TABLE` örtük `DELETE` yapar ve `ON DELETE CASCADE` tetikler; `files` yeniden kurulursa `file_versions`, `file_comments`, `file_shares`, `file_stars`, `file_activities` silinir. Legacy tablolarda yalnız `ADD COLUMN` (nullable, satır içi `REFERENCES`), `CREATE INDEX`, `CREATE TRIGGER`; üretilen SQL elle incelenir; CI `DROP TABLE`, `__new_`, `PRAGMA foreign_keys` görürse kırılır; kopyada bilinçli test.
- **5.2 [Yüksek]** Legacy `0000–0011` aynı adlarla taşınır, yeni migration'lar `0012`'den; better-auth CLI çıktısı doğrudan uygulanmaz, Drizzle şemasına elle.
- **5.3 [Yüksek]** Prod'da legacy açıkken ACL/link eşlemesi koşulursa sonradan iptal edilen paylaşımlar yeni sistemde canlı kalır. ACL/link/davet eşlemesi yalnız yazımların durdurulduğu cutover penceresinde tek koşu; önce yalnız workspace, üyelik, `files.workspaceId`; tekrar koşu gerekiyorsa "kaynak kazanır" uzlaştırması.
- **5.4 [Yüksek]** Her prod migration'dan önce `wrangler d1 time-travel info` bookmark'ı ve `wrangler d1 export` yedeği.
- **5.5 [Orta]** D1 batch'te 0 satır etkileyen ifade batch'i durdurmaz: bağımlı ifadelerde aynı `WHERE EXISTS` ya da kısıt ihlali üreten guard ifadesi; `changes()`'a test etmeden güvenme; backfill küme tabanlı `INSERT … SELECT … WHERE NOT EXISTS`.
- **5.6 [Orta]** Trigger'lar Drizzle'ın bilgisi dışında: migration sonrası `sqlite_master` doğrulama testi.
- **5.7 [Orta]** Legacy'de `file_versions.uploadedByUserId`, `file_comments.userId`, `posts.authorId`, `activity_logs.userId` de kullanıcıya cascade. Hesap silme kapalılığı better-auth `deleteUser` ve admin `removeUser` için de; yeni workspace FK'leri ve `personalOwnerUserId` `ON DELETE RESTRICT`.
- **5.8 [Düşük]** Parola `NULL`'lamak Time Travel (30 gün) ve prova kopyalarındaki düz metni silmez: kopyalar tarihli silinsin; karantina cutover'dan önce sıfır ya da satır satır karar.

## 6. "Yalnızca görüntüleme"
- **6.1 [Orta]** STL/OBJ/PLY/3MF'de türev neredeyse orijinal: vaat "orijinal dosya teslim edilmez", "geometri korunur" değil. STEP'te B-rep/PMI kaybı anlamlı koruma.
- **6.2 [Yüksek]** Yeni XSS yüzeyi: aynı origin'den stream; `mimeType` istemciden geliyor. İndirmede `application/octet-stream`, `Content-Disposition: attachment; filename*=…`, `nosniff`, `CSP: sandbox`; küçük resim yalnız magic byte doğrulanmış PNG/WebP, sabit content-type.
- **6.3 [Orta]** Türevler için de presign yok, her istekte yetki ve kayıt.
- **6.4 [Düşük]** Range indirmede kayıt işlem kimliğiyle bir kez; her parçada yalnız yetki.

## 7. Eksik testler
Google ön-hesap · tüm `/organization/*` ve `/admin/*` yolları ve varyantları 404 · `admin,owner` yazım reddi · misafir yanıtı kontrat testi · kısıtlı projede dosya grant'iyle sınır delme · kaldırılan üyenin linkleri, `team → restricted` geçişinde link/grant · link ve misafirin eski sürümlere erişimi · CSRF · iptal edilmiş linkin önbellekten açılmaması · yüklenen HTML/SVG'nin çalışmaması · parola denemelerinin hash'ten önce kesilmesi, e-posta uçlarında hız sınırı · doğrulanmamış alıcılı legacy paylaşımlar · migration SQL'inde `DROP TABLE` yok, child tablo sayıları eşit · Turnstile token tekrarı, hostname/action · `completeUpload`'da R2'deki gerçek boyut Entitlements ile · sahiplik devrinde hedef misafir/yorumcu olamaz, kişisel workspace devredilemez · platform admin içerik erişimi yok (yalnız metadata).

## Orkestratör kararları (D19)
1. **1.1 kabul:** `member` tabanı projesiz dosyada ve `team` projede `download`; yükleyen kendi dosyasında `edit`; sahip/yönetici her yerde `edit`. "Herkes düzenler" ihtiyacı çıkarsa projeye `teamLevel`.
2. **1.2:** Kısıtlı projenin erişimini sahip, yönetici ve **projeyi oluşturan üye** yönetir (proje yöneticisi); kısıtlı projedeki dosyada grant ve link yalnız proje yöneticisinde.
3. **1.4:** Misafirler birbirini görmez (rakip tedarikçi senaryosu): misafire yalnız iç kişilerin yorumları ve kendi yorumları görünür; misafir yorumları iç ekibe görünür.
4. **4.1:** Link token'ı özetle aranır, ayrıca `AppConfig` anahtarıyla AES-GCM şifreli saklanır; yalnız düzenleme yetkisi olana "Linki kopyala" ile çözülür. Anahtar dönüşümü sürümlü.
5. **3.1, 2.1, 2.2, 5.1–5.4, 6.2:** aynen uygulanır, uygulamadan önce dokümana girer.
