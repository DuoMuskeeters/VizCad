# Faz 5 · Görüntüleyici ve stüdyo tasarımı

Kaynaklar: D22 (`01-decisions.md`), motor araştırması `10-viewer-engine.md`, teslim kuralları `09-files-sharing-design.md` §3, ekran kuralları `03-design.md` §2.2–2.5. Bu belge Faz 5'in teknik tasarımıdır; ekran tel kafesleri §9'daki alt fazlarla birlikte çizilir.

Kısaca: görüntüleyici three.js ile yazılır, tüm ayrıştırma bir Web Worker'da yapılır. STEP/IGES/3MF bir kez GLB'ye çevrilir ve R2'de dosya sürümünün yanında saklanır. Kullanıcı düzenlemeleri (ad, renk, görünürlük, kayıtlı görünüm) GLB'ye yazılmaz, D1'de ayrı bir **sahne kaydında** tutulur. Montaj dosya listesinde klasör gibi açılır. Stüdyo bütün montajı açar, düğüm yolu URL'dedir.

## 0. Kapsam

| Var (Faz 5) | Yok (sonra) |
|---|---|
| STL, OBJ, PLY, 3MF, STEP, IGES açma (hepsi Worker'da) | Sunucuda dönüşüm (Containers, ücretli plan; D22 karar 3b) |
| GLB türevi: yüklemede ve tembel (ilk masaüstü açılışında) | 3MF dışa aktarma |
| Küçük resim: tüm türlerde, Worker'da `OffscreenCanvas` | B-rep kenar/yüz seçimi, PMI |
| Montaj ağacı, klasör görünümü, izole açma, yol çubuğu | Gerçek malzeme kütüphanesi (yalnız renk + metalik/mat ön ayarı) |
| Sahne kaydı: ad, renk, görünürlük, kayıtlı görünümler | Patlatılmış görünüm (ağaç hazır, Faz 5 sonrası küçük iş) |
| Kesit düzlemi, nokta–nokta ölçüm, tel kafes/kenar | Eski stüdyo sekmeleri: Görünüm, Işıklar, Çıktı (D15) |
| Tek parçayı STL olarak indirme (indirme yetkisiyle) | Eski dosyalar için toplu türev script'i (isteğe bağlı, production onayı) |
| Yorum pini (modelde nokta) | |
| Mobil dokunma, performans bütçesi, gerçek telefon testi | |

## 1. İstemci mimarisi

### 1.1 Dosya düzeni (`src/viewer/`, yalnız istemci)

```
src/viewer/
  Viewer.client.tsx        tuval + araç çubuğu + panel yerleri; lazy chunk'ın girişi
  scene/                   three.js sahne kurulumu, kamera, ışık, kontroller, dispose
    createScene.ts         renderer, kamera, OrbitControls, ışıklar, ızgara, ViewHelper
    fit.ts                 sığdır, standart görünümler (ön, üst, sağ, izometrik)
    dispose.ts             geometri/malzeme/doku serbest bırakma (her kapatmada)
  tools/                   section.ts, measure.ts, pick.ts (three-mesh-bvh, tembel), edges.ts
  tree/                    düğüm yolu, ağaç modeli, sahne kaydının uygulanması
  worker/
    parse.worker.ts        tek Worker: ayrıştır, GLB yaz, küçük resim üret
    protocol.ts            Worker mesaj tipleri (istemci ile Worker arasındaki tek sözleşme)
    formats/               step.ts (occt-import-js), stl.ts, obj.ts, ply.ts, threemf.ts
  pipeline.ts              ana iş parçacığı tarafı: Worker'ı başlatır, ilerleme, iptal, yükleme uçları
```

- **Karar.** Görüntüleyici `/app/files/$id` içinde `React.lazy` ile yüklenir, SSR'da yoktur. Uygulama sayfalarında SSR zaten kapalı (PR #16). `three` ve `occt-import-js` yalnız bu chunk'ta. `effect` bu ağaçta hiç yok (CLAUDE.md).
- **Karar.** Görüntüleyici durumu tek `useReducer` (`viewerReducer`): yükleniyor/hazır/hata, seçili düğüm, izole yol, etkin araç, panel. three.js nesneleri React durumuna girmez; reducer yalnız kimlik ve düz veri tutar, sahne bir `ref` içinde yaşar. Reducer saf olduğu için Vitest ile test edilir.
- **Gerekçe.** Eski `app.tsx` 2.002 satırdı ve vtk nesnelerini React durumunda tutuyordu (02-feature-audit, 00 §Faz 5). Saf reducer + sahne ref'i, sızıntı ve gereksiz render'ı ayırır.

### 1.2 Worker sözleşmesi

Tek Worker, istek başına bir iş. Mesajlar `protocol.ts`'te ayrık birleşim (discriminated union):

| İstek | Yanıt |
|---|---|
| `{ kind: 'parse', format, bytes }` | `progress { stage, ratio }`* → `parsed { meshes, tree, stats }` (geometri `ArrayBuffer`'ları transfer edilir, kopyalanmaz) |
| `{ kind: 'derive', format, bytes }` | `progress`* → `derived { glb: ArrayBuffer, thumbnail: Blob, tree, stats }` |
| `{ kind: 'thumbnail', glb }` | `thumbnail { blob }` |
| `{ kind: 'cancel' }` | Worker sonlandırılır (`terminate`), yenisi gerektiğinde açılır |

- `stats` = üçgen sayısı, düğüm sayısı, parça sayısı, sınır kutusu, süre. **0 üçgen hata sayılır** (D22): `failed { code: 'empty' }`.
- Hata kodları sabit: `empty`, `unsupported`, `too_large`, `out_of_memory`, `corrupt`, `timeout`. Kullanıcıya her kodun bir metni var (§8).
- **Zaman aşımı:** STEP için 5 dakika. 179 MB'lık dosya 11,7 dakika sonra boş döndü (10 §7); bekletmek yerine `timeout` + "küçük resim + İndir" yoluna düşülür.
- WASM (`occt-import-js.wasm`, brotli 2,2 MB) yalnız STEP/IGES işinde, Worker içinde yüklenir. Lisans metni (LGPL-2.1) WASM'ın yanında `/licenses/occt-import-js.txt` olarak yayınlanır; WASM değiştirilmez.
- **3MF:** three'nin `3MFLoader`'ı `DOMParser` kullanıyor ve Worker'da `DOMParser` yok. Seçenek: Worker'da küçük bir XML okuyucu (`fflate` ile açılan `3D/3dmodel.model`, yalnız `object`/`mesh`/`vertices`/`triangles`/`components`/`build`/`basematerials`). İlk sürümde bu okuyucu yazılır, testi örnek 3MF dosyalarıyla yapılır. Geri dönüş: 3MF'i ana iş parçacığında `3MFLoader` ile açmak (küçük dosyalarda kabul edilebilir).

### 1.3 Düğüm yolu

- **Karar.** Ağaçtaki her düğümün kimliği, kökten itibaren çocuk sıralarının yoludur: `0.3.2`. GLB'ye `node.extras.vizcadPath` olarak yazılır; yeniden okumada ad ya da sıraya güvenilmez, bu değer okunur.
- URL: `/app/files/$id?node=0.3.2` (izole açılan alt bileşen). Tarayıcının geri tuşu düğümler arasında gezinir (D22). Yol çubuğu: `Montaj › Alt montaj › Parça`, her parçası bağlantı.
- **Gerekçe.** Yol, aynı dönüşüm çıktısında deterministiktir ve sahne kaydının anahtarıdır (§3). Dönüştürücü sürümü değişirse yollar kayabilir; bu yüzden sahne kaydı türevin kimliğine bağlanır ve ad-yolu ile yeniden eşleme yapılır (§3.3).

## 2. GLB türevi

### 2.1 Hangi dosyalar

| Tür | Türev | Neden |
|---|---|---|
| STEP, IGES | Evet | Çevirme pahalı (43 s → 0,05 s), WASM mobilde yük, ağaç ve renk korunur |
| 3MF | Evet | Çok parçalı; klasör görünümü aynı ağaç modelinden beslenir |
| STL, OBJ, PLY | Hayır | Zaten üçgen ağı; okuyucu hızlı. Türev aynı veriyi kopyalamaktan ibaret |

STL/OBJ/PLY için türev yoktur; görüntüleyici kaynağı `model` ucundan okur (§2.4, D23).

### 2.2 Saklama ve şema (`0015_viewer`, yalnız izinli işlemler)

Yeni nesneler mevcut anahtar biçiminde: `w/{workspaceId}/f/{fileId}/{objectId}.glb` (09 §1.2). `objectId` türev başına yeni ULID. Legacy bu sütunları ne okur ne yazar; hepsi `NULL` olabilir.

| Tablo | Sütun | Anlam |
|---|---|---|
| `files` | `derivativeR2Key` | Güncel sürümün GLB'si; `NULL` = yok |
| `files` | `derivativeState` | `NULL` (denenmedi), `ready`, `failed`, `too_large` |
| `files` | `derivativeMeta` | JSON metin: `{ converter, triangles, nodes, parts, bbox }`. Klasör görünümü "Montaj · N parça" bandını buradan okur, GLB'yi indirmez |
| `file_versions` | `derivativeR2Key`, `derivativeState`, `derivativeMeta` | Yeni sürüm yüklenince güncel değerler buraya taşınır (küçük resim gibi, `uploads.ts` yeni sürüm batch'i) |
| `file_scenes` (yeni) | §3 | Sahne kaydı |
| `derivative_sessions` (yeni) | §2.3 | Yarım kalan türev yüklemeleri |

- `derivativeState = 'failed'` kalıcı değildir: düzenleme yetkili biri "Yeniden dene" diyebilir. Amacı, her masaüstü açılışında aynı bozuk dosyayı otomatik olarak yeniden çevirmemektir.
- Silme: `trash.ts` (kalıcı silme), `storageCleanup.ts`, `versions.ts` ve `uploads.ts`, `thumbnailR2Key`'e ne yapıyorsa `derivativeR2Key`'e de aynısını yapar (`storage_deletions` kuyruğu, önce D1 sonra R2). Test: `fileLifecycle.test.ts`'e türev senaryoları.
- Migration denetimi (izin listesi, Faz 3a) yalnız `ADD COLUMN` (nullable) ve `CREATE TABLE`/`CREATE INDEX` görür. Yeniden adlandırma yok, R2 anahtarı değişmez.

### 2.3 Yazma yolu: presigned PUT + tamamlama

**Karar.** GLB, asıl yüklemeyle aynı yoldan gider: `POST /api/files/{id}/derivative/start` → presigned PUT (R2'ye doğrudan) → `POST /api/files/{id}/derivative/complete`.

- **start:** yetki `edit`; format STEP/IGES/3MF; kaynak boyutu `Entitlements.maxConvertBytes` (50 MB) altında; beyan edilen GLB boyutu ≤ `maxDerivativeBytes` (kaynağın katı, aşağıda §2.6); rate limit `derivativeStart` (kullanıcı + IP). Yanıt: `{ sessionId, url, headers }`. İmza `Content-Length`'i bağlar.
- **complete:** `HEAD` ile boyut, Range GET ile ilk 20 bayt: `glTF` sihri, sürüm 2, başlıktaki toplam uzunluk = nesne boyutu, ilk chunk `JSON`. Tutarsa tek batch: `files.derivativeR2Key/State/Meta` yazılır, eski türev silme kuyruğuna girer, oturum `completed`. Batch, dosyanın hâlâ aynı `r2Key`'de olduğunu şart koşar (sürüm değiştiyse türev eskidir; nesne silinir, `409 VersionChanged`).
- `meta` istemciden gelir ve `Schema` ile doğrulanır (sayılar sınırlı, `converter` ≤ 64 karakter). Değerler yalnız görüntüleme amaçlıdır, yetkiye girmez.
- **Başarısızlık:** `POST /api/files/{id}/derivative/failed { code }` → `derivativeState = 'failed' | 'too_large'`. Yalnız `edit`.
- **Gerekçe.** GLB onlarca MB olabilir (Stealthburner 14,9 MB). Worker'dan akıtmak Free plan CPU sınırını (10 ms) zorlamasa da gövde sınırı ve süre riski taşır; presigned yol 4a'da kanıtlandı (20/20). Başlık denetimi R2'den 20 bayt okur, CPU harcamaz.
- **Güven.** GLB'yi istemci üretir. Bozuk/yanıltıcı GLB yükleyebilen kişi zaten `edit` yetkilidir ve ham dosyayı da değiştirebilir; yeni bir yetki açığı yok (10 §7). Görüntüleyici GLB'yi okurken boyut, düğüm (≤ 20.000) ve üçgen (≤ 20 M) sınırlarını uygular; aşarsa `corrupt` gösterir.
- `derivative_sessions`, `upload_sessions` ile aynı yaşam döngüsü: süresi dolan oturumun nesnesi cron'da silinir (`storageCleanup`). Ayrı tablo, çünkü `upload_sessions`'ın kotası, kontrolleri ve `files` satırı oluşturma mantığı türeve uymuyor.

### 2.4 Okuma ucu

| Uç | Yetki | Yanıt |
|---|---|---|
| `GET /api/files/{id}/model` | `preview` (D23: tüm düzeyler) | STEP/IGES/3MF: GLB türevi; STL/OBJ/PLY: kaynak nesne. R2 akışı, `Content-Type: model/gltf-binary` (türev) veya `application/octet-stream` (kaynak), `nosniff`, `CSP: sandbox`, `private, no-store`, `Content-Disposition: attachment`. Yoksa 404 `PreviewUnavailable` |
| `GET /s/{token}/model` | link + aynı kural | Aynı başlıklar + `Referrer-Policy: no-referrer` |

- Audit: `file.previewed` (indirme değildir). 09 §3.4'teki 10 dakikalık teslim kimliği aynen.
- `Sec-Fetch-Site: same-origin` şartı aynen (09 §3.1).
- Yalnız güncel sürüm. Eski sürümü açmak `viewHistory` + `download` ister ve `content` ucundan yerinde çevrilir (türev üretilmez).

### 2.5 Akışlar

**Yükleme (masaüstü):** yükleme biter → kart küçük resim yerine yükleniyor göstergesi ("Hazırlanıyor") gösterir → istemci, elindeki dosya baytlarını (yeniden indirmeden) Worker'a `derive` olarak verir → GLB + küçük resim yüklenir → kart güncellenir. Sekme kapanırsa iş yarım kalır; dosya "küçük resim yok, türev yok" durumundadır ve ilk masaüstü açılışında tamamlanır (D22). Sekmeyi kapatmaya çalışırken `beforeunload` uyarısı yalnız dönüşüm sürerken açıktır.

**Yükleme (telefon):** dönüşüm yapılmaz (bellek, pil). STL/OBJ/PLY için küçük resim telefonda da üretilir (hafif); STEP/IGES/3MF için kart "Masaüstünde açılınca hazırlanır" der. Telefon tespiti: `navigator.deviceMemory < 4` veya dokunmatik + dar ekran; tahmin yanılırsa sonuç yalnızca biraz gecikmedir.

**Tembel üretim:** `derivativeState IS NULL`, kaynak ≤ `maxConvertBytes`, kullanıcı `edit` + `download` yetkili, masaüstü → görüntüleyici STEP'i yerinde çevirir, modeli hemen gösterir ve arka planda GLB'yi yazar. Yetkisiz kullanıcı (yorumcu, görüntüleyici, link) için: küçük resim + İndir (yetkisi varsa) + "Dosya henüz 3B için hazırlanmadı".

**Büyük dosya:** kaynak > `maxConvertBytes` → hiç denenmez, `derivativeState = 'too_large'`, "küçük resim + İndir" (küçük resim de yoksa dosya türü kartı). Sunucu dönüşümü gelince (Q9/Q10 sonrası) bu durum dolar.

### 2.6 `Entitlements` ekleri

| Alan | Varsayılan | Not |
|---|---|---|
| `maxConvertBytes` | 50 MB | D22 karar 4. Yükleme sınırı (`maxFileBytes`, 100 MB) ayrı kalır |
| `scenesPerFile` | 1 | Sahne kaydı sayısı (ileride birden fazla "sunum" olabilir) |
| `savedViewsPerScene` | 20 | |
| `derivativeBytesPerSourceByte` | 4 | GLB ≤ `max(derivativeMinBytes, 4 × kaynak)`, hiçbir zaman `maxFileBytes` üstü değil (`maxDerivativeBytes`). start ve complete (HEAD boyutu) ikisi de denetler |
| `derivativeMinBytes` | 2 MB | Küçük kaynağın tabanı (birkaç KB'lık eğri yüzeyli STEP de üçgen üretir) |

**GLB ve depolama kotası.** Türev `storageBytes`'a sayılmaz; bunun yerine boyutu kaynağa bağlıdır. Seçim gerekçesi: kotaya saymak her yükleme ve kullanım göstergesi sorgusunu (`committedBytes`), değiştirilen türevin çıkarılmasını ve "kotam neden doldu" metnini değiştirirdi; oran sınırı tek bir denetimdir ve türevlerin toplamını sayılan depolamanın sabit bir katıyla (artı dosya başına 2 MB) sınırlar. Ölçülen oranlar (Faz 5b notları): STEP 0,3–0,5, 3MF en çok 2,5. Sınırı aşan GLB yüklenmez; istemci `glb_too_large` kodunu kaydeder (durum `too_large`) ve dosya, kaynak `maxConvertBytes` altında olduğu için düzenleme yetkilisinin açılışında yerinde çevrilmeye devam eder.

İstemci bunları zaten açılan limit nesnesinden okur (Faz 3 artıkları, PR #13 kalıbı).

## 3. Sahne kaydı (`file_scenes`)

### 3.1 Model

D22: "Düzenlemeler GLB'yi ve STEP'i değiştirmez; dosya sürümüne bağlı ayrı bir sahne kaydında tutulur." Kayıt **seyrek**tir: yalnız değiştirilen düğümler yazılır.

```
file_scenes
  id              ULID
  workspaceId     (FK, files ile bileşik)
  fileId
  derivativeR2Key hangi türev için yazıldığı (yollar bu türevde geçerli)
  revision        iyimser eşzamanlılık: her yazımda +1
  body            JSON metin (≤ 128 KiB)
  updatedByUserId, updatedAt
unique (fileId, derivativeR2Key)
```

`body` (Schema ile doğrulanır):

```ts
{
  v: 1,
  nodes: { [path: string]: { name?: string; color?: '#rrggbb'; finish?: 'matte' | 'satin' | 'metal'; hidden?: true } },  // ≤ 2000 giriş
  views: Array<{ id: string; name: string; camera: { position: [n,n,n]; target: [n,n,n]; up: [n,n,n]; fov: n }; hidden?: string[]; section?: { normal: [n,n,n]; constant: n } }>, // ≤ savedViewsPerScene
}
```

- **Yetki:** okuma `preview`, yazma `edit`. Link ve misafir yalnız okur; görüntüleyici kaydı uygular.
- **Yazma:** `PUT /api/files/{id}/scene { revision, body }`. `revision` tutmazsa `409 SceneConflict` + güncel kayıt; istemci kullanıcıya "Başkası bu sahneyi değiştirdi, yeniden yükle" der. Kaydetme otomatik (değişiklikten 1,5 s sonra), aynı anda bir istek.
- **CPU.** 2000 girişlik gövdenin `Schema` ile doğrulanması Free planın 10 ms'ine yaklaşabilir. Staging'de en büyük gövdeyle ölçülür (link parolasındaki PBKDF2 ölçümü gibi). Aşarsa sınır düşürülür ya da doğrulama düz döngüye çevrilir; gövde yine sınırlı kalır.
- Aktivite: `scene.updated` en çok 10 dakikada bir kez kayda girer (her renk değişimi değil).

### 3.2 Neden D1, neden GLB değil

- **Karar.** D1'de ayrı satır. GLB'ye yazmak türevi yeniden üretip yüklemeyi gerektirir ve "orijinal türev"i kaybettirir; R2'de ayrı JSON ise doğrulama ve eşzamanlılık için yine D1 satırı ister.
- **Alternatif.** GLB'yi düzenlenmiş haliyle yeniden yazmak. Reddedildi: her renk değişiminde onlarca MB yükleme, geri alma yok, eşzamanlı düzenleme kayıp.

### 3.3 Yeni sürüm ve yeniden dönüşüm

- Yeni sürüm yüklenince yeni türevin sahne kaydı yoktur. Görüntüleyici önceki sürümün kaydını **ad yolu** ile eşler (`Montaj/Gövde/Vida M3 [2]`): eşleşen düğümlere değerler önerilir, kullanıcı "Önceki sürümün renklerini uygula" bandından onaylar, kayıt ilk düzenlemede yazılır. Eşleşmeyenler sayılır ("12 parça eşleşmedi").
- Türev yeniden üretilirse (dönüştürücü sürümü değişti, "Yeniden dene") aynı eşleme yapılır. Eski kayıt silinmez, `derivativeR2Key` farklı olduğu için yalnız eşleme kaynağıdır; türev silinince kaydı da silme kuyruğuna girer (D1 satırı, R2 değil).

## 4. Montaj klasör görünümü ve stüdyo

### 4.1 Dosya listesinde

- Türevi olan ve `derivativeMeta.parts > 1` olan dosya kartında küçük resim üstünde "Montaj · 455 parça" rozeti.
- Karta tıklamak dosya sayfasını açar (bugünkü gibi). Dosya sayfasında, görüntüleyicinin yanında **"Parçalar"** görünümü: üstte "Montaj · N parça" bandı, altında ağacın ilk düzeyi ızgara/liste olarak: alt montajlar klasör simgesiyle, parçalar parça kartıyla. Alt montaja girmek URL'de `?node=` değiştirir.
- Alt parçalar sanal öğedir (GLB düğümü): ayrı dosya değil, kota tutmaz, yıldızlanmaz, taşınmaz, ayrı paylaşılmaz (D22). Paylaşım her zaman dosyanın kendisidir.
- **Parça küçük resimleri:** ilk sürümde istemci, görünür kartlar için GLB'den tek tek çizer (Worker, `OffscreenCanvas`, 128 px, sırayla) ve tarayıcı belleğinde tutar. Sunucuya yazılmaz. Alternatif (türev üretiminde tek WebP atlas) açık soru A3.

### 4.2 Stüdyo düzeni (03 §2.2 ile uyumlu)

Masaüstü üç sütun: sol ağaç (onay kutulu görünürlük, arama, izole), orta tuval (`#1b222c`, D12) ve altında yüzen araç çubuğu, sağ sekmeli panel (Ayrıntılar / Yorumlar / Aktivite / Sürümler, sahne düzenlenirken **Görünüm** sekmesi: ad, renk, bitiş, kayıtlı görünümler). Mobil: tuval tam ekran, ağaç ve panel alttan açılan sayfa, araç çubuğu altta tek sıra.

- Montaj açılınca stüdyo bütün montajı gösterir. Ağaçta bir düğüm seçmek onu vurgular. "Yalnız bunu aç" (izole) URL'ye `?node=` yazar ve kamerayı ona sığdırır. Yol çubuğu ve geri tuşu üst düzeye döndürür.
- Seçme: `Raycaster` + `three-mesh-bvh` (tembel, +28 KB). Seçim ağaçta karşılık gelen satırı açar.
- **Sahne hazırlama** bir moddur, ayrı sayfa değil: `edit` yetkilisi sağ panelde "Görünümü düzenle"ye basınca ağaçta ad değiştirme ve renk seçici açılır. Düzenleme yetkisi olmayan aynı ekranı salt okunur görür.

### 4.3 Araçlar

| Araç | Uygulama | Not |
|---|---|---|
| Döndür/kaydır/yakınlaştır | `OrbitControls` (tek parmak döndür, iki parmak yakınlaştır/kaydır) | Dokunma hedefi ≥ 44 px |
| Sığdır, standart görünümler | sınır kutusundan | `ViewHelper` köşede |
| Tel kafes / kenarlar | `EdgesGeometry` (açı eşiği 30°), tembel üretilir | Büyük montajda yalnız seçilene |
| Kesit düzlemi | `renderer.clippingPlanes` + stencil kapak | Eksen seç + kaydırıcı; kayıtlı görünüme girer |
| Ölçüm | iki nokta seçimi + çizgi + HTML etiket; birim mm/inç | Dosya birimi STEP'ten gelir, yoksa mm varsayılır ve gösterilir |
| Ekran görüntüsü | `toBlob`, indirme | İndirme yetkisi gerekmez (zaten ekranda) |
| Tek parçayı STL indir | `STLExporter` seçili düğümden | Yalnız `download` yetkisiyle görünür. Not: GLB'yi alan biri bunu kendisi de yapabilir; düğme bir kolaylıktır, koruma değildir (§5) |
| Yorum pini | seçmeden dünya noktası + normal, `file_comments`'e `anchor` (nullable JSON: düğüm yolu + yerel koordinat) | Pin, düğüm gizliyse soluk gösterilir |

`file_comments.anchor` `0015`'e nullable sütun olarak eklenir. Yorum programı (`comments.ts`) anchor'ı `Schema` ile doğrular (sayılar sonlu, yol ≤ 256 karakter).

### 4.4 Mobil kapsam (kullanıcı kararı 2026-11-26)

Koşul: telefonu düşün; karmaşıklaşan özellik telefonda sınırlanır, basit ve anlaşılır bir modül olarak sunulur. 5c/5d için bu tablo, §4.2–4.3'ün ve tel kafeslerin mobil anlatımının önüne geçer. "Tam": masaüstüyle aynı iş, dokunmaya uygun yerleşim. "Basit": daha az seçenek. "Yalnız masaüstü": telefonda "Masaüstünde açın" ipucu.

| Özellik | Masaüstü | Telefon | Neden |
|---|---|---|---|
| Görüntüleme (döndür, yakınlaştır, sığdır, standart görünüm, tel kafes) | tam | tam | Telefonun asıl işi modele bakmak |
| Parçalar klasör görünümü ve ağaç | tam | basit: aramalı düz liste, alt montaja girerek ilerlenir; parça küçük resmi ve çok düzeyli ağaç yok | Dar ekranda girintili ağaç ve ızgara okunmuyor |
| Parça seçme ve izole | tam | tam | Tek dokunuş yeter |
| Göster/gizle (yalnız benim ekranım, B2) | tam | tam | Kayıt yazmaz, geri alması kolay |
| Yol çubuğu, `?node=` linkleri, parça linkini kopyalama (B6) | tam | tam | Paylaşılan link çoğunlukla telefonda açılır |
| Kayıtlı görünümler | tam (kaydet + uygula) | basit: yalnız uygula | Kaydetme sahne hazırlamanın parçası |
| Kesit | tam: eksen, kaydırıcı, düzlem tutamağı | basit: tek eksen hazır seçimi (X/Y/Z) + kaydırıcı; düzlemde tutamak yok | Tuvaldeki tutamak döndürme hareketiyle çakışır |
| Ölçü | tam | basit: büyüteçli iki nokta ölçümü, mm/inç | Atölyede hızlı ölçü telefonda gerekli; büyüteç parmağın kapattığı noktayı gösterir. Ölçü kaydedilmez (B4) |
| Ekran görüntüsü (B8) | tam | tam: "Paylaş ya da kaydet" | Telefonun paylaşım sayfası işi kolaylaştırır |
| Yorum pini (B3) | tam | tam | Sahada geri bildirim en çok telefondan gelir |
| Sahne hazırlama (ad, renk, yüzey, kalıcı gizleme, görünüm kaydetme) ve sahne çakışması | tam | yalnız masaüstü; kayıtlı sahne telefonda uygulanmış görünür | Çok alanlı düzenleme paneli dar ekrana sığmıyor |
| Yeni sürümde renk eşleme bandı | tam | yalnız masaüstü | Eşlemeyi onaylamak sahneyi yazar ve sonucu incelemek gerekir |
| Tek parçayı STL indirme (B7) | tam | yalnız masaüstü | CAD dosyası masaüstünde kullanılır |

Telefon alt araç çubuğu (B5): **Parçalar · Kesit · Ölçü · Yorum · Görüntü · Daha**. "Daha": Sığdır, Görünümler (yalnız uygula), Tel kafes; çift dokunma sığdırır. "Görünümü düzenle" ve "STL indir" araç çubuğunda yer almaz; menüde devre dışı ve "Masaüstünde açın" ipucuyla görünür. Yetkisi olmayan kullanıcıda neden olarak yetki yazılır.

## 5. Yetki ve "yalnızca görüntüleme"

| Düzey | Küçük resim | 3B (türev) | 3B (ham, STL/OBJ/PLY) | İndir | STL parça dışa aktarma | Sahne yazma |
|---|---|---|---|---|---|---|
| owner / editor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| download (link/misafir) | ✓ | ✓ | ✓ | ✓ | ✓ | |
| view / comment | ✓ | ✓ (D23) | ✓ (D23) | | | |

- D23 (A1): görüntüleme düzeyi tüm formatlarda 3B açar; 09 §3.3'teki kısıtın yerine geçer. `content` ucu yine `download` ister.
- **Dürüst metin:** görüntüleme düzeyine 3B açılırsa paylaşım penceresinde "3B önizleme açılır; kaynak dosya (STEP) indirilemez. Önizlemedeki şekil kopyalanabilir." STL/OBJ/PLY'de metin: "3B önizleme açılır; bu biçimde önizleme dosyanın kendisidir, indirme düğmesi gösterilmez."
- Kontrat testleri (09 §3.3'e ek): `view` linki → `model` 200, `content` 404; `download` linki → ikisi de 200; sahne `PUT` yalnız `edit`.

## 6. Performans bütçesi

| Ölçü | Hedef | Nasıl ölçülür |
|---|---|---|
| Görüntüleyici chunk (gzip) | ≤ 160 KB (three 147 KB + kendi kodumuz) | `bench/viewer/bundle-size.mjs` CI'da, aşarsa uyarı |
| GLB'li dosya, ilk model (masaüstü) | < 1 s (15 MB GLB) | staging, Playwright izleme |
| GLB'li dosya, orta sınıf Android | < 3 s, 60 sn'de çökme yok | gerçek cihaz (10 §7 risk) |
| Seçme | < 5 ms | bench |
| Bellek | Stealthburner'da sekme < 1 GB | Chrome görev yöneticisi |
| Dispose | 10 kez aç/kapa sonrası `renderer.info.memory` sıfıra döner | Vitest + jsdom yetmez; Playwright testi |

Mobilde paylaşılan sayfada 3B otomatik açılmaz: küçük resim + "3B'yi aç" düğmesi (03 §2.4, veri ve pil). GLB boyutu düğmede yazar ("3B'yi aç · 6 MB").

## 7. Sunucu programları ve testler

| Program | Dosya | Test |
|---|---|---|
| `startDerivative`, `completeDerivative`, `failDerivative` | `programs/derivatives.ts` | yetki matrisi, sınırlar, başlık denetimi (geçerli/bozuk GLB baytları `testing/glb.ts`), sürüm değişti yarışı, eski türevin silme kuyruğu |
| `deliverModel` | `programs/delivery.ts` | türev/kaynak seçimi, başlıklar, audit, D23 düzeyleri, link |
| `getScene`, `putScene` | `programs/scenes.ts` | Schema sınırları, revizyon çakışması, yetki, yeni sürümde boş kayıt |
| yorum `anchor` | `programs/comments.ts` | doğrulama, eski yorumlar `NULL` |
| silme yolları | `trash.ts`, `versions.ts`, `uploads.ts`, `storageCleanup.ts` | türev ve sahne satırı küçük resimle aynı yollardan temizlenir |
| GLB başlığı | `server/glb.ts` (saf) | sihir, sürüm, uzunluk, chunk türü |

İstemci: `viewerReducer`, düğüm yolu, ad-yolu eşleme, sahne gövdesi üretimi (saf, Vitest). Worker: Node'da `occt-import-js` ile örnek dosyalar (`bench/viewer/node-convert.cjs` kalıbı), ağaç ve `vizcadPath` doğrulaması. Görüntüleyici: Playwright ile staging'de aç/kapa, seçme, kesit, 390 ve 1280 px, açık/koyu.

HTTP: `http/files.ts` yolu `content|thumbnail|model|scene` olarak genişler; `/derivative/start|complete|failed` CSRF ile. `respond.ts` `STATUS`'a `SceneConflict` (409), `VersionChanged` (409), `InvalidDerivative` (422) eklenir.

## 8. Durumlar ve metinler

| Durum | Gösterim |
|---|---|
| Görüntüleyici yükleniyor | Küçük resim (varsa) tuvalin yerinde, üstünde ilerleme çubuğu: "Model açılıyor" → STEP'te "Dönüştürülüyor · %40" |
| Türev hazırlanıyor (kart) | Küçük resim alanında dönen gösterge + "Hazırlanıyor" |
| `empty` | "Bu dosyada görüntülenecek bir şekil bulunamadı." + İndir |
| `too_large` | "Bu dosya tarayıcıda açmak için çok büyük (50 MB üstü)." + İndir |
| `timeout` / `out_of_memory` | "Dosya bu cihazda açılamadı. Daha güçlü bir bilgisayarda yeniden dene ya da indir." |
| `corrupt` / `unsupported` | "Dosya okunamadı. Bozuk olabilir." + (edit) "Yeni sürüm yükle" |
| Türev yok, yetkisiz kullanıcı | "Bu dosya henüz 3B için hazırlanmadı. Dosyanın sahibi açtığında hazır olur." |
| Telefonda STEP | "3B önizleme masaüstünde hazırlanır." + küçük resim |
| Sahne çakışması | "Başkası bu görünümü değiştirdi." + "Yeniden yükle" |

Metinler i18n anahtarı olarak İngilizce varsayılanla yazılır (`viewer.*`), Türkçe çeviri ilk sürümde eklenir.

## 9. Bölünme ve kabul ölçütleri

| Alt faz | İçerik | Kabul |
|---|---|---|
| **5a** Görüntüleyici çekirdeği | `src/viewer/` iskeleti, Worker, altı format, sahne/kamera/kontroller/dispose, sığdır, standart görünüm, tel kafes, durumlar (§8), dosya sayfasına lazy bağlama; tüm türlerde küçük resim üretimi (mevcut `POST thumbnail`) | `pnpm check`/`build` yeşil; chunk bütçesi; 6 formatın örnek dosyası staging'de açılıyor; 390/1280 açık/koyu ekran görüntüleri |
| **5b** GLB türevi | `0015_viewer` (türev sütunları, `derivative_sessions`), start/complete/failed/deliver, yükleme akışında "Hazırlanıyor", tembel üretim, telefon kuralı, `maxConvertBytes` | Program testleri; staging'de Stealthburner: yükle → türev → ikinci açılış < 1 s; sürüm değişikliği yarışı; silme kuyruğu |
| **5c** Montaj | ağaç paneli, klasör görünümü, `?node=`, yol çubuğu, izole, seçme, `file_scenes` + sahne hazırlama modu, ad-yolu eşleme, STL parça indirme | Sahne testleri; staging'de 455 parçalı montajda klasör gezinme + renk kaydı + yeni sürümde eşleme |
| **5d** Araçlar ve mobil | kesit, ölçüm, ekran görüntüsü, yorum pini (`anchor`), mobil alt sayfa, dokunma; gerçek telefon ölçümü | iOS Safari + orta sınıf Android'de §6 bütçesi; Lighthouse paylaşılan sayfa |

Her alt faz kendi branch'inde (`rewrite-faz5a` …), inceleme sonrası `rewrite`'a birleşir (07 kalite kapısı). 5c ve 5d başlamadan önce ilgili ekranların tel kafesleri (`design/mockups/v2/12-stüdyo.html`, `13-montaj.html`) onaya sunulur.

## 10. Kararlar (D23, 26 Kasım 2026)

A1: tüm formatlarda evet (öneriden farklı: kullanıcı STL/OBJ/PLY'de de açılmasını seçti). A2: onayla. A3: anlık. A4: hayır.


| # | Soru | Öneri |
|---|---|---|
| A1 | "Görüntüleyebilir / Yorum yapabilir" düzeyi (ve bu düzeydeki link) 3B önizleme açsın mı? STEP/IGES/3MF'de yalnız GLB türevi açılır, kaynak indirilemez. STL/OBJ/PLY'de önizleme kaynakla aynı veridir. | STEP/IGES/3MF için **evet**, dürüst metinle. STL/OBJ/PLY için **hayır**: bu düzeyde küçük resim, 3B yalnız indirme yetkisiyle. |
| A2 | Yeni sürümde önceki sahnenin renkleri otomatik mi uygulansın, onayla mı? | **Onayla** (bant + tek düğme). Otomatik, yanlış eşlemeyi sessizce yayar. |
| A3 | Klasör görünümünde parça küçük resimleri: istemcide anlık mı (ilk sürüm), türevle birlikte üretilen tek atlas mı? | İlk sürümde **anlık**; 455 parçada yavaş kalırsa atlas (5c'de ölçülür). |
| A4 | Montaj olmayan tek parçalı STEP de "Parçalar" görünümü göstersin mi? | **Hayır**: `parts ≤ 1` ise doğrudan görüntüleyici. |

## Uygulama notları · Faz 5a

Branch `rewrite-faz5a` (26 Kasım 2026). Yapılanlar ve spesifikasyondan sapmalar.

### Yapılanlar

- `src/viewer/`: `Viewer.client.tsx` (lazy chunk girişi), `scene/` (`createScene`, `build`, `fit`, `lights`, `thumbnail`, `dispose`), `worker/parse.worker.ts` + `protocol.ts`, `worker/formats/` (STEP/IGES `occt-import-js`, STL, OBJ, PLY, 3MF + `xml.ts`), `tree/tree.ts` (düğüm yolu, normalleştirme, istatistik), `pipeline.ts` (indirme, Worker, zaman aşımı, iptal), `state.ts` (`viewerReducer`), `device.ts` (telefon kuralı).
- Dosya sayfası (`/app/files/$id`): indirme yetkisi olan kişide görüntüleyici, `GET /api/files/{id}/model` ucundan okur. Görüntüleme/yorum düzeyi değişmedi (küçük resim kartı; 3B, uç `preview`'a geçince 5b'de, D23).
- **Model ucu (§2.4, 5a biçimi).** `GET /api/files/{id}/model` ve `GET /s/{token}/model`: güncel sürümün kaynak nesnesi, `content` ile aynı başlıklar ve Range (link ucunda ek olarak `no-referrer`). Audit `file.previewed`; `security_log`'a indirme olayı yazılmaz (görüntülemek indirmek değildir). 5a'da yetki hâlâ `download` (görünüm/yorum 404/403, indirme 200), yalnız `current` (başka `v` 404). `content` ucuna istemcinin seçtiği bir "amaç" bayrağı eklenmedi; amacı uç belirler. 5b'de iki uç `preview` yetkisine ve STEP/IGES/3MF için GLB türevine geçer (D23; kodda not var). Link ucu sunucuda hazır, paylaşım sayfası henüz görüntüleyici göstermiyor.
- Küçük resim: yüklemeden sonra (`UploadProvider`, eldeki baytlardan, sırayla) ve açılışta tembel (küçük resim yoksa ve kişi `edit` yetkiliyse, aynı ayrıştırmada Worker çizer). Mevcut `POST /api/files/{id}/thumbnail` ucuna WebP (Safari'de PNG), 512 px; 1 MiB'ı aşarsa 384 ve 256 px denenir.
- Metinler `src/i18n/viewer.ts` (`viewer.*`, İngilizce + Türkçe). Araç çubuğu: sığdır, standart görünümler (menü), tel kafes, kenarlar, ekran görüntüsü; masaüstünde üçgen/parça sayısı.
- LGPL metni `/licenses/occt-import-js.txt` (paketteki dosyanın kopyası). WASM değiştirilmeden ayrı dosya olarak yüklenir.
- Ölçüm (`pnpm build && pnpm size:viewer`, gzip -9, KB = 1000 bayt): görüntüleyici chunk'ı **146 KB** (bütçe 160). Worker 147 KB, `pipeline` 1 KB, occt yapıştırıcısı 20 KB ve WASM 3.111 KB yalnız STEP/IGES açılınca Worker'da yüklenir. Sunucu derlemesinde three.js ve Worker yok.
- Doğrulama: Vitest (reducer, cihaz kuralı, pipeline sahte Worker ile, `buildModel`/`vizcadPath`, `fit`, format okuyucuları: occt Node'da CAx-IF AS1 montajı ve IGES küpü, ağaç yolları, 0 üçgen → `empty`, 3MF okuyucu). İnceleme sonrası eklenenler: `deliverModel`/`deliverLinkModel` program ve HTTP testleri (yetki matrisi, audit eylemi, güvenlik günlüğü boş), Worker mesaj işleme (`worker/handle.ts`, sahte `post`), `createScene` sahte renderer ile (her geometri/malzeme bir kez bırakılıyor, renderer + bağlam + tuval gidiyor, bağlam kaybı/geri gelişi), `Viewer` bileşeni (yeniden adlandırma yeniden yüklemiyor, 50 MB üstü indirmeden reddediliyor, ana iş parçacığı hatası, canlı bölge), dosya sayfası (küçük resim yalnız `edit` ile, eski sürümün küçük resmi atılıyor), yükleme küçük resim kuyruğu, düşmanca 3MF/STL/PLY/OBJ girdileri. Gerçek Chromium'da (GPU ile) altı format Worker'da açıldı ve küçük resimleri sunucunun `validateThumbnail` denetiminden geçti. 11 aç/kapa döngüsünden sonra tek tuval kaldı, WebGL bağlam uyarısı yok. Ekran görüntüleri: `design/ui-shots/viewer/` (`scripts/shoot-viewer.cjs`).

### Sapmalar ve gerekçeleri

1. **Worker sözleşmesi.** `thumbnail` isteği 5a'da kaynak baytlarla gelir (`{ kind: 'thumbnail', format, bytes }`); GLB'li biçim 5b'de eklenir. `parse` isteğinde `thumbnail: boolean` var: küçük resmi olmayan dosyada model ve küçük resim tek ayrıştırmada çıkar, geometri ana iş parçacığına sonra aktarılır. `cancel` bir mesaj değil: `pipeline.ts` Worker'ı `terminate` eder; her iş kendi Worker'ını açar (§1.2'deki "iptal = sonlandır" ile aynı sonuç, daha az durum).
2. **Zaman aşımı** yalnız STEP'e değil, tüm biçimlere 5 dakika uygulanır. Diğer biçimler bu süreye hiç yaklaşmaz; tek kural daha basit.
3. **50 MB dönüşüm sınırı** 5a'da `protocol.ts`'te sabit (`MAX_CONVERT_BYTES`). 5b `Entitlements.maxConvertBytes`'ı istemciye açınca oradan okunur. Plan sınırı değil, cihaz koruması olarak duruyor. Sayfa dosya boyutunu görüntüleyiciye verir; STEP/IGES/3MF bu sınırı aşıyorsa hiç indirilmeden `too_large` gösterilir (§2.5). Worker'daki denetim yedek olarak duruyor.
4. **Telefon kuralı.** Telefonda STEP/IGES kendiliğinden açılmaz: §8'deki "3B önizleme masaüstünde hazırlanır" metni, altında "Bu cihazda aç" düğmesi ve İndir. 5a'da GLB türevi henüz yok, bu yüzden düğme olmadan telefondaki kişi küçük bir STEP'i bile göremezdi. 3MF telefonda açılır: kendi okuyucumuz WASM kullanmıyor ve hafif. Küçük resim kuralı görevdeki gibi: telefonda STEP/IGES/3MF küçük resmi üretilmez.
5. **Eksen.** Görüntüleyicinin dünyası Z-yukarı (CAD alışkanlığı; STEP, IGES, STL, PLY, 3MF). OBJ genelde Y-yukarı olduğu için kökte 90° döndürülür. `ViewHelper` yalnız gösterge: tıklama animasyonu Y-yukarı varsayıyor, standart görünümler araç çubuğundaki menüden. 128 px'lik gösterge 480 px'ten dar tuvalde çizilmez. 5b notu: GLB yazılırken bu dönüşüm kökte açıkça yazılmalı (glTF Y-yukarı).
6. **Renk.** STEP/IGES'te saf siyah "renk yok" sayılır: IGES dışa aktarımları (ve bazı STEP'ler) varsayılan olarak siyah yazıyor ve siyah parça koyu tuvalde kayboluyor. Gerçekten siyah olan parça nötr parça renginde görünür.
7. **Kenarlar** (`EdgesGeometry`, 30°) 1,5 milyon üçgenin üstünde kapalı ve nedeni yazılı; 5a'da seçim olmadığı için "yalnız seçilene" yolu 5c'ye kaldı.
8. **Sığdırma** sınır küresi yerine kutunun sekiz köşesiyle yapılır; uzun ince parçalar ekranı daha iyi doldurur.
9. **3MF okuyucu** spesifikasyondan biraz geniş: `basematerials`'a ek olarak materials uzantısının `colorgroup`'u ve production uzantısının `p:path`'i (Bambu Studio ve PrusaSlicer dosyaları başka model parçalarına bağlanıyor) okunur. Birimler milimetreye çevrilir. Ana iş parçacığına geri dönüş (`3MFLoader`) gerekmedi.
10. **Düğüm yolu kuralı.** Kök `0`. Bir düğüm en çok bir mesh taşır: tek mesh'li ve çocuksuz düğüm mesh'i kendisi taşır; aksi halde önce çocuk düğümler, sonra her mesh ayrı yaprak olarak sıralanır. Aynı girdi aynı yolları verir (testte iki dönüşüm karşılaştırılıyor). Yol `userData.vizcadPath`'e yazılır; `GLTFExporter` bunu `extras.vizcadPath` olarak yazar.
11. **Tuval.** Sahne kendi `<canvas>`'ını oluşturur ve kapanışta kaldırır. React'in geliştirmedeki çift bağlamasında `forceContextLoss` edilmiş tuval yeniden kullanılınca WebGL açılmıyordu; yeni tuval bunu önlüyor ve kapanışta GPU belleği hemen bırakılıyor.
12. **Derleme.** TanStack Start `.client` dosyalarını sunucu tarafında yasaklıyor: görüntüleyici ve `pipeline` `createClientOnlyFn` ile yüklenir. `vite.config.ts`'e `worker.format: 'es'` eklendi; böylece occt yapıştırıcısı Worker içinde ayrı chunk olur.
13. **Yükleme sonrası küçük resim** saklanınca `UploadProvider.finished` bir kez daha artar; listeler küçük resmi bu yenilemede gösterir. Ayrı sayaç açmak yerine mevcut yenileme yolu kullanıldı. `POST …/thumbnail?v=current` indiği andaki güncel sürüme yazdığı için eski sürümün resmi yeni sürüme düşmemeli: yükleme kuyruğu (`thumbnailQueue.ts`) dosya başına yalnız en yeni işi tutar, yeni sürüm yüklemesi başlayınca süren iş de atılır; dosya sayfası görüntüleyicinin ürettiği resmi yalnız o sürüm hâlâ güncelse ve yeni sürüm yüklenmiyorsa gönderir.
14. **Hata kodları.** §8'deki listeye iki kod eklendi. `too_complex`: düğüm (`MAX_NODES`) ya da üçgen (`MAX_TRIANGLES`) sınırı; metni 50 MB metninden ayrı ("Bu modelde tarayıcıda açılamayacak kadar çok parça ya da üçgen var."). `network`: model indirilemedi ya da Worker chunk'ı / OCCT WASM gelmedi; "Yeniden dene" düğmesi var. İlk mesajından önce hata veren Worker ve yüklenemeyen OCCT (bellek hatası dışında) `network` sayılır; başarısız yükleme önbelleğe alınmaz.
15. **Düşmanca girdiler.** STL/OBJ/PLY'de dizini köşe sayısı dışında ya da köşesi sonlu olmayan üçgenler atılır; hiç kalmazsa `empty`. Sınır kutusu sonlu değilse `corrupt`, tüm köşeler tek noktadaysa `empty` (boş küçük resim saklanmaz). PLY'de yüz olup olmadığı başlıktaki `element face N`'den okunur: yüz rengi/UV'si olan dosyada `PLYLoader` dizinsiz geometri döndürür. 3MF'de yalnız `_rels/.rels` ve yapının gerçekten başvurduğu model parçaları açılır; ZIP'in bildirdiği açılmış boyutların toplamı 512 MB'ı geçerse açmadan `too_complex` (PR #24 ikinci tur; eskiden `too_large`) (fflate bildirilen boyutta tampon ayırdığından yalan başlık bunu aşamaz). Bileşen açılımı düğüm sayarak ilerler, `MAX_NODES` aşılınca `too_complex` (kendini ikiye katlayan zincir 2^30 düğüm kurmadan durur). Renkler parça başına tekilleştirilir, Map ile gruplanır; parça başına 65.536 palet girdisi, mesh başına 256 renk (aşılırsa nesne rengi). `xml.ts` öznitelikleri tek geçişte okur; etiket 64 KB, öznitelik adı 256 karakter, etiket başına 64 öznitelik ile sınırlı.
16. **Kamera.** Uzak düzlem, en fazla uzaklaştırmada (`MAX_ZOOM_OUT` = 20 × sığdırma uzaklığı) modelin tamamını kapsar. Sahne `webglcontextlost`'ta çizmeyi durdurur, `webglcontextrestored`'da yeniden çizer.

### Açık kalanlar

- Kabul ölçütündeki "staging'de altı format" adımı yapılmadı (bu iş staging'e dağıtım içermiyordu); aynı kontrol yerelde gerçek Chromium ve GPU ile yapıldı. Staging'e dağıtımdan sonra `scripts/shoot-viewer.cjs` örnekleriyle tekrarlanmalı.
- §6'daki dispose denetimi artık sahte renderer'la otomatik (geometri/malzeme `dispose` olayları, `renderer.dispose`, `forceContextLoss`). Gerçek GPU'da `renderer.info.memory` sıfırlanması hâlâ elle (11 döngü); Playwright testi 5d'deki telefon ölçümüyle birlikte yazılabilir.
- Küçük resim yarışı yalnız istemcide kapatıldı: başka sekme ya da kişi tam o sırada yeni sürüm yüklerse eski sürümün resmi yine yeniye düşebilir. Kalıcı çözüm 5b'de: `POST …/thumbnail` beklenen sürümü (ör. sürüm numarası) alıp eşleşmezse reddetsin.
- Değişen ekranlarda görsel fark yok (yalnız görünmez canlı bölge ve iki yeni hata metni); 390 px ekran görüntüleri bu turda yenilenmedi.
- Eski sürümlerin küçük resmi üretilmez (yalnız güncel sürüm; uç da yalnız `current` kabul ediyor).

## Uygulama notları · Faz 5b

Branch `rewrite-faz5b` (26 Kasım 2026). Yapılanlar, spesifikasyondan sapmalar ve açık kalanlar.

### Yapılanlar

- **Migration `0015_viewer`** (yalnız izinli işlemler: nullable `ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`; `check-migrations` geçiyor). `files` ve `file_versions`'a `derivativeR2Key`, `derivativeState`, `derivativeMeta`; yeni `derivative_sessions` (`id`, `workspaceId` RESTRICT, `fileId` anlık değer/FK yok, `sourceR2Key`, `userId` RESTRICT, `r2Key` UQ, `declaredSize`, `status`, `expiresAt`, `createdAt`, `completedAt`; durum/boyut/tamamlanma CHECK'leri). `file_scenes` ve `file_comments.anchor` 5c/5d'ye kaldı. **Staging D1'e (`vizcad-staging`) uygulandı**; production'a dokunulmadı. Testi: `src/server/db/migration0015.test.ts` (eski satırlar aynen, legacy yazımları çalışıyor, durum CHECK'i, oturum kısıtları).
- **Programlar** (`programs/derivatives.ts`): `startDerivative` (`edit`, yalnız STEP/IGES/3MF, kaynak ≤ `maxConvertBytes`, GLB ≤ `maxDerivativeBytes` (inceleme düzeltmesi, aşağıda), hız sınırı `derivativeStart` kullanıcı + IP, açık oturum ≤ `uploadSessionsPerUser`, beklenen sürüm numarası; presigned PUT `Content-Length` ve `If-None-Match: *` bağlar), `completeDerivative` (yetki yeniden, kaynak hâlâ aynı `r2Key` mi, HEAD boyut + ETag, ≤ `maxDerivativeBytes` = `min(maxFileBytes, max(2 MB, 4 × kaynak))`, 20 baytlık Range okuma ile `server/glb.ts` başlık denetimi, tek batch: guard → eski türevi ve aynı kaynağın anlık görüntülerindeki GLB'leri yazım anında `storage_deletions`'a → `files` ve aynı kaynak `r2Key`'li `file_versions` satırlarını güncelle → oturum `completed`; idempotent), `failDerivative` (`failed`/`too_large` + kod, var olan GLB'nin üstüne yazmaz), `expireDerivativeSessions` (saatlik cron). HTTP: `POST /api/files/{id}/derivative/start|complete|failed` (`http/files.ts`, CSRF + Schema, fazla alan 400). Yeni hatalar: `VersionChanged` (409), `InvalidDerivative` (422).
- **Teslim (D23).** `GET /api/files/{id}/model` ve `/s/{token}/model` artık `preview` ister. STEP/IGES/3MF: hazır türev varsa GLB (`model/gltf-binary`, `Ad.glb`, aynı güvenlik başlıkları ve Range); yoksa kaynak yalnız indirme yetkilisine (görüntüleyici yerinde çevirir), diğerlerine 404 `PreviewUnavailable`. STL/OBJ/PLY her düzeyde kaynak. Audit `file.previewed`, güvenlik kaydına indirme olayı yazılmaz. `content` yine `download` ister. Kontrat testleri güncellendi (görünüm/yorum düzeyi ve görünüm linki `model` 200, `content` 403/404).
- **Yaşam döngüsü.** Yeni sürüm (`uploads.ts`) türevi küçük resimle birlikte anlık görüntüye taşır ve `files` sütunlarını boşaltır; geri yükleme (`versions.ts`) türevi iki yönde taşır; kalıcı silme (`trash.ts`) türev anahtarlarını da kuyruğa koyar (başka satırın kullandığı hariç); silme işçisi (`storageCleanup.ts`) `derivativeR2Key` ve bekleyen `derivative_sessions` başvurusunu da görür. Testler `fileLifecycle.test.ts` ve `uploads.test.ts`'te.
- **`Entitlements.maxConvertBytes`** (50 MB). İstemciye her dosya görünümündeki yeni `model` bloğuyla (`FileView`, `GuestFileView`, `LinkFileView`: `kind`, `bytes`, `derivative { state, code, parts }`, `maxConvertBytes`) ve `completeUpload` yanıtıyla gelir. Görüntüleyici ve Worker bu değeri kullanır; `MAX_CONVERT_BYTES` yalnız varsayılan.
- **Küçük resim yarışı kapandı.** `POST …/thumbnail?v=current&expect=<sürüm no>`: `expect` zorunlu (yoksa 400); güncel sürüm numarası farklıysa `VersionChanged` ve hiçbir şey yazılmaz. İstemci (yükleme kuyruğu ve dosya sayfası) gönderiyor.
- **Worker `derive`** (`scene/glb.ts`): ayrıştır → `buildModel` → `GLTFExporter` (ikili) → aynı ağaçtan küçük resim. Y-yukarı dönüşüm kökte açık: `vizcad` adlı düğüm, X'te -90°, `extras.vizcadUp = 'z'`. Düğüm yolları `extras.vizcadPath`. GLB yalnız GLB tamponunu aktarır, geometri ana iş parçacığına gitmez. Tembel yol için `parse` isteğine `derive` bayrağı eklendi (STEP bir kez ayrıştırılır, model hemen görünür, GLB arka planda yüklenir).
- **Görüntüleyici GLB okur** (`scene/loadGlb.ts`, `GLTFLoader`, tembel chunk): yanıt `model/gltf-binary` ise Worker ve WASM hiç yüklenmez; kök +90° ile Z-yukarı dünyaya döner; düğüm (≤ 20.000) ve üçgen (≤ 20 M) sınırları, 0 üçgen `empty`.
- **Akışlar (§2.5).** Yükleme (masaüstü): STEP/IGES/3MF için kuyrukta `derive` → GLB + küçük resim; kartta ve listede "Hazırlanıyor", yükleme kartında "Yüklendi · Hazırlanıyor"; `beforeunload` uyarısı yalnız dönüşüm (ya da yükleme) sürerken. Kaynak > `maxConvertBytes` → hiç okunmadan `too_large` kaydı. Telefonda dönüşüm yok (kartta telefonda "Masaüstünde açılınca hazırlanır"). Tembel üretim: `edit` + `download`, masaüstü, `model.kind = source` → `derive` ile açılır, GLB arka planda saklanır; dosyanın suçu olan hata kodu `failed` olarak kaydedilir (`network`/iptal kaydedilmez). Kayıtlı `failed` ve kaynak hâlâ sınırın üstündeyken kayıtlı `too_large` açılışta yeniden çevrilmez (GLB sınırı `glb_too_large` ya da daha düşük sınırdan kalan `too_large` yerinde yeniden çevrilir): hata metni gösterilir; `edit` + `download` kişisine her kodda "Yeniden dene". Türevi olmayan STEP'te görüntüleme düzeyi: küçük resim + "Bu dosya henüz 3B için hazırlanmadı…".
- **Paylaşılan sayfa.** `model.kind ≠ none` ise görüntüleyici (`/s/{token}/model`). Telefonda 3B kendiliğinden açılmaz: küçük resim + "3B'yi aç · N MB" (`tap` başlangıcı); STEP/IGES kaynağı telefonda 5a'daki "Bu cihazda aç" kuralını korur. Masaüstünde GLB hemen açılır.
- **Paylaşım penceresi (D23 dürüst metin).** Link "Görüntüleyebilir" ipucu ve kişiler bölümünün altında: STEP/IGES/3MF "3B önizleme açılır; kaynak dosya (STEP) indirilemez. Önizlemedeki şekil kopyalanabilir."; STL/OBJ/PLY "3B önizleme açılır; bu biçimde önizleme dosyanın kendisidir, indirme düğmesi gösterilmez."
- **Ölçüm** (`pnpm build && pnpm size:viewer`, gzip -9): görüntüleyici chunk'ı **154 KB** (bütçe 160; 5a'da 146). Artışın sebebi GLTFLoader'ın kullandığı three sınıflarının ortak chunk'a düşmesi (three tek modül); `GLTFLoader` kendisi tembel **14 KB** chunk, yalnız GLB açılınca. Worker 159 KB (GLTFExporter eklendi), occt değişmedi.
- **Node'da dönüşüm** (`scene/glb.test.ts`, `VIZCAD_SAMPLES` ile masaüstü örnekleri): MiniSB 13,5 MB → GLB 3,9 MB, 44 parça, 9,7 s; Stealthburner 39,5 MB → **14,9 MB**, 455 parça, 461 düğüm, 29 s; AS1 0,4 → 0,2 MB; kamyon.3mf 2,6 → 3,7 MB; dişli-küp.3mf 0,2 → 0,5 MB; IGES küp. Her birinde ağaçtaki tüm yollar ve çizen düğümler GLB'den geri okunuyor, üçgen sayıları aynı, sınır kutusu µm toleransla aynı yerde, sunucunun başlık denetimi geçiyor.
- **Ekran görüntüleri** `design/ui-shots/viewer/` (`scripts/shoot-derivative.cjs`): `card-preparing-*`, `derivative-view-level-*` (yorumcu, GLB açık, İndir kapalı), `shared-3d-*` (390: "3B'yi aç · 6,2 MB", 1280: GLB açık); 390 ve 1280, açık/koyu. 320 px'te yatay kaydırma yok (paylaşılan sayfa, dosya sayfası, liste).

### Sapmalar ve gerekçeleri

1. **`derivativeMeta` içeriği.** İstemcinin `{ converter, triangles, nodes, parts, bbox }`'ına sunucu HEAD'den ölçtüğü `bytes` ve `etag` eklenir (`v: 1`). `model` ucu GLB'yi `content` gibi boyut ve ETag denetimiyle akıtır; bu yüzden ikisi şart. `failed`'da meta `{ v: 1, code }`. Okunamayan meta "türev yok" sayılır.
2. **`derivativeState` CHECK'i** migration'da sütun düzeyinde elle eklendi (`ADD COLUMN … CHECK(…)`); Drizzle anlık görüntüsü bunu bilmez, sonraki `db:generate` fark üretmez.
3. **Silme nedenleri.** `storage_deletions.reason` CHECK'i tablo yeniden kurulmadan genişlemez; yeni değer eklenmedi: değiştirilen türev `purged`, reddedilen GLB `upload_rejected`, süresi dolan oturum `upload_expired` (küçük resimle aynı yaklaşım, 09 Faz 4c notu).
4. **Açık oturum sınırı** ayrı bir `Entitlements` alanı değil; türev oturumları kendi sayımıyla `uploadSessionsPerUser` sınırını kullanır.
5. **GLB ana iş parçacığında okunur**, Worker'da değil (§1.2'deki `{ kind: 'thumbnail', glb }` yazılmadı). GLB zaten üçgen; `GLTFLoader.parse` tamponu görünümle okur, Worker'a gidip geri gelmek kopya ve kod ekler. Küçük resim türevle aynı geçişte üretildiği için GLB'den küçük resim gerekmedi.
6. **Worker sözleşmesi.** Upload yolu için `derive` isteği ve `derived` yanıtı; tembel yol için `parse` + `derive: true` (yanıtta `glb`). İsteklerde `maxConvertBytes`. Yeni aşama `derive` ("3B kopya kaydediliyor").
7. **Küçük resim beklenen sürümü** sorgu parametresi `expect` (sürüm numarası) olarak geldi ve zorunlu; gövde görüntü olduğu için JSON alanı mümkün değildi.
8. **"Masaüstünde açılınca hazırlanır"** yalnız telefonda kartta gösterilir. Masaüstünde dosyayı açmak zaten hazırlar; binlerce legacy STEP'in hepsinde aynı satırı göstermek gürültü olurdu.
9. **Paylaşım penceresi** dürüst metni hem link düzeyi ipucunda hem kişiler bölümünün altında (görüntüleme/yorum düzeyi misafirler için de geçerli).
10. **Geliştirme fikstürü:** yorumcu rolünde `download` artık kapalı (sunucuyla aynı); `FilesPage` testi buna göre düzeltildi. `f2` hazır türevli örnek.

### Açık kalanlar

- **Staging kabulü** (Stealthburner: yükle → türev → ikinci açılış < 1 s, sürüm yarışı, silme kuyruğu) yapılmadı: bu iş Worker dağıtımı içermiyordu. Migration staging'de; dağıtımdan sonra `scripts/shoot-derivative.cjs` örnekleri ve gerçek yüklemeyle tekrarlanmalı. R2 CORS `ETag` başlığını zaten açıyor (yükleme akışı kullanıyor); GLB PUT'u aynı kurala dayanıyor.
- Hazır türevi olup küçük resmi olmayan dosya (küçük resim POST'u başarısız olmuşsa) GLB yolundan küçük resim üretmez; ilk sürüm ihtiyacı değil, istenirse Worker'a `{ kind: 'thumbnail', glb }` eklenir.
- Eski dosyaların toplu türev script'i yok (D22: isteğe bağlı, production onayı ister). Canlıda türevler ilk masaüstü açılışında oluşur.
- ~~`Auth.test.ts`'teki çerez testi aralıklı düşüyordu~~: inceleme düzeltmelerinde kapandı (aşağıda).

### İnceleme düzeltmeleri (PR #24)

- **Sürüm anlık görüntüsü yazım anında okunur.** `completeUpload` ve `restoreVersion`, `file_versions` satırını R2 denetimlerinden önce okunan `files` satırından kuruyordu; arada biten bir türev (ya da küçük resim) ya R2'de sahipsiz kalıyor ya da anlık görüntü `completeDerivative`'in silme kuyruğuna koyduğu GLB'yi gösteriyordu. Artık anlık görüntü batch içinde `INSERT … SELECT FROM files` (`shared.ts` `snapshotCurrentVersion`); türev ve küçük resim sütunları yazıldığı anda okunur. `putThumbnail` değiştirdiği küçük resmi de yazım anında okuyup kuyruğa koyar; batch'i düşen küçük resim artık "en iyi çaba" silme yerine kuyruğa girer. Testler `versionRaces.test.ts`: yükleme ve geri yükleme, önceki GLB yokken ve GLB A varken, türev arada biterken; küçük resim yeni sürümle ve başka bir küçük resimle yarışırken; her durumda R2'de sahipsiz nesne ya da satırda silinmiş anahtar yok. Yarış, ilk `batch` çağrısından hemen önce öteki isteği sonuna kadar çalıştıran bir Db sarmalayıcısıyla kurulur.
- **GLB boyutu kaynağa bağlı** (§2.6): `maxDerivativeBytes = min(maxFileBytes, max(derivativeMinBytes, derivativeBytesPerSourceByte × kaynak))`, varsayılan 4× ve 2 MB; start ve complete (HEAD boyutu) denetler. Kotaya saymak yerine bu seçildi (gerekçe §2.6). İstemci start'tan `FileTooLarge` alırsa `glb_too_large` kaydeder (ikinci tur).
- **Kayıtlı `too_large`** yalnız kaynak `maxConvertBytes` üstündeyse geçerli: altındaysa (o zamanki daha düşük sınır ya da sınırı aşan GLB) düzenleme yetkilisinin açılışında yerinde yeniden çevrilir; indirme yetkisi olmayana "3B kopyası saklanamayacak kadar büyük" metni (`viewer.derivativeTooLarge`).
- **Worker:** `parse` + `derive`'da GLB dışa aktarımı düşerse model yine gösterilir (`glb: null`), `failed` kaydedilmez; upload yolunun `derive`'ı da `derived` + `glb: null` + küçük resim döner (yalnız küçük resim saklanır).
- **GLTFLoader dış URI çekmez:** JSON chunk'taki `buffers`/`images` URI'leri ayrıştırmadan önce denetlenir (yalnız `data:` ve `blob:`), ayrıca `LoadingManager.setURLModifier` yalnız `data:`/`blob:` geçirir, gerisini boş `data:,` yapar; dosya `corrupt` sayılır.
- **Görüntüleyici:** `source` bağlama başına donar (arka planda GLB saklanınca sayfa yenilense de açık model, kamera, tel kafes ve kenarlar olduğu gibi kalır). GLTFLoader chunk'ı gelmezse `network` (Yeniden dene). Yüklenemeyen GLB'yi `edit` + `download` kişisi masaüstünde "3B kopyayı yeniden oluştur" ile kaynaktan (`content` ucu, indirme olarak kayda geçer) yeniden çevirip saklayabilir; eskisi `completeDerivative`'in kuyruğuyla silinir.
- **Dosya sayfası ve yükleme kuyruğu:** bu sekmenin kuyruğu dosyayı hazırlarken sayfa görüntüleyici açmaz, "Hazırlanıyor" gösterir (ikinci dönüşüm yok); iş bitince dosya yeniden okunur. Kuyrukta aynı dosyanın iki işi varsa "Hazırlanıyor" ve `beforeunload` uyarısı son iş bitince kalkar (dosya başına sayaç).
- **Paylaşım penceresi:** bilinmeyen/legacy türde "Bu dosya türünde 3B önizleme açılmaz…" (`share.view3d.none`), STL metni değil.
- `modelPreview` saklı meta'yı satır başına bir kez ayrıştırır (`readyDerivative`/`modelKind` ayrıştırılmış değeri alır).
- `Auth.test.ts`'teki aralıklı hata bir test hatasıydı: sahte imza son base64 karakterinde A↔B değiştiriyordu; 32 baytlık HMAC'te bu karakterin iki biti dolgudur, imza ~16'da 1 aynı çözülüyordu. Artık ilk imza karakteri değişir (40 koşuda 0 hata).
- Ölçüm: görüntüleyici chunk'ı yine **154 KB** gzip (bütçe 160), GLB okuyucu 14 KB, Worker 159 KB.

### İnceleme düzeltmeleri, ikinci tur (PR #24)

- **Yenileme açık modeli yeniden başlatmaz:** `rebuildUrl` (sonraki okumada `derivative` gelince tanımlanır) yükleme efektine ref ile okunur, bağımlılıklarda değil. Test: `source` ve `rebuildUrl` birlikte değişen yeniden çizimde tek indirme, tek `setModel`.
- **"Hazırlanıyor" sonraki okuma yanıtlanana kadar kalır:** iş bitince sayfa dosyayı yeniden okur; o okuma bitmeden görüntüleyici eski (source/auto) veriyle bağlanmaz. Bekleme render sırasında kurulur (`held`), `load().finally` ile kalkar. Test: kayıtlı `timeout` ile okuma bekletilir; görüntüleyici yalnız `{ failed: 'timeout' }` ile açılır.
- **3MF şişme bütçesi `too_complex`:** 512 MB'ı aşan küçük bir 3MF artık `failed` + `too_complex` kaydı; `too_large` gibi yok sayılıp her açılışta yeniden şişirilmez. Sınırı aşan GLB'nin kendi kodu var: `glb_too_large` (durum `too_large`). Kayıtlı `too_large` yalnız kaynak `maxConvertBytes` üstündeyse geçerli (`shared/fileViews.ts` `sourceTooLarge`); `glb_too_large` ve daha düşük sınırla kaydedilmiş `too_large` yerinde yeniden çevrilir. Testler: her durum için birer.
- **Geri yükleme GLB sınırını bozmaz:** `completeDerivative` aynı dosyanın aynı kaynak nesnesine sahip `file_versions` satırlarını da yeni GLB'ye bağlar, tuttukları GLB'leri kuyruğa koyar (başka kaynaktan bir satır tutmuyorsa). Kaynak nesnesi başına bir GLB. Test: `versionRaces.test.ts`, üç tur geri yükle + çevir; kaynak başına en çok bir GLB, her nesne bir satırda ya da kuyrukta.
- **Paylaşım sayfası** dosya sayfasıyla aynı boyut kuralını kullanır; sınırı aşan GLB'de "50 MB üstü" değil misafir metni (`sp.glbTooLarge`, indirilebiliyorsa `sp.glbTooLargeDownload`; en ve tr).
- **Küçük resim:** batch'i düşen küçük resmin doğrudan silme yedeği kaldırıldı; kuyruk satırı cron'a kalır. Test R2 silmesini düşürür ve anahtarın kuyrukta olduğunu doğrular.
- Ölçüm: görüntüleyici chunk'ı **156 KB** gzip (bütçe 160), GLB okuyucu 14 KB. "Hazırlanıyor" ve ardından gelen dosya sayfası 390 ve 1280 px'te, açık ve koyu temada denetlendi (36 MB'lık 3MF ile, fixture).

## Uygulama notları · Faz 5c

Branch `rewrite-faz5c` (5c-1) ve `rewrite-faz5c-2` (5c-2), 27 Kasım 2026. Görev iki parçaya bölündü: 5c-1 ağaç, klasör görünümü, seçme, izole, `?node=`, yol çubuğu ve telefon listesi; 5c-2 sahne kaydı, sahne hazırlama, ad-yolu eşleme ve STL.

### 5c-1 · Yapılanlar

- **B1, tam genişlik stüdyo.** `/app/files/$id` uygulama kabuğunun (sol menü) dışında açılır (`AppLayout`: yol `/app/files/` ise `AppShell` yok, `UploadProvider` aynı). Kendi üst çubuğu: geri bağlantısı (dosyanın projesi, yoksa "Tüm dosyalar"), dosya adı + alt satır (masaüstü "STEP · 86,2 MB · Montaj, 455 parça", telefon "Sürüm 1 · 455 parça"), montajda "3B / Parçalar" seçici, masaüstünde İndir + Paylaş, telefonda Paylaş simgesi (İndir dosya menüsünde), dosya menüsü, ağaç ve sağ panel düğmeleri. Masaüstü üç sütun: ağaç 288 px + tuval + panel 360 px; ikisi de kapatılabilir. Telefon: üst çubuk, tuval, araç çubuğu, altta sekmeler (5a'daki gibi).
- **Ağaç modeli** (`viewer/tree/outline.ts`, three'siz, saf): `OutlineNode { path, name, parts, drawn, children }`, yol doğrulama (`isNodePath`), görünür satırlar, katlanmış aksan/büyük-küçük harf aramalı alt ağaç araması (en çok 200 sonuç), ad yolu (`namePaths`, §3.3 için), `soleChain`. Görüntüleyici model açılınca ağacı bir kez çıkarır (`scene/studio.ts` `outlineOf`; GLB'de dosyadaki ad `userData.name`'den).
- **Stüdyo görünümü** (`scene/studio.ts`, görüntüleyici chunk'ında): görünürlük (benim gizlediklerim, izole: yalnız alt ağaç ve ona giden yol), seçim vurgusu (malzeme kopyası + camgöbeği ışıma), sahne görünüşleri (5c-2 için hazır: en yakın renk ve en yakın yüzey ayrı ayrı miras alınır), seçme (`Raycaster`, yalnız görünen mesh; GLB'nin çok malzemeli düğümü kendi yolunu verir). Kendi oluşturduğu malzemeleri `dispose` bırakır, modelinkini önce geri takar. `createScene` tıklamayı sürüklemeden ayırır (5 px, 500 ms), izolede kamerayı düğüme sığdırır, düğüm boyutunu verir (`sizeOf`) ve klasör görünümü için tek düğüm küçük resmi çizer.
- **Sayfa ve görüntüleyici sözleşmesi:** sayfa seçimi, izoleyi (`?node=`), gizlenenleri tutar (`StudioView`); görüntüleyici uygular. Görüntüleyici `ViewerApi` (`thumbnail`, `sizeOf`, `triangles`, `exportStl`) verir; three nesnesi sayfaya çıkmaz. Uygulama tarafı (`app/files/studio/`: `TreePanel`, `FolderView`, `PartsList`, `Overlays`, `names`, `useWide`) three içermez, görüntüleyici chunk'ına girmez.
- **Ağaç paneli** (masaüstü): arama, girintili satırlar, aç/kapat, satır başına göz (B2, yalnız benim ekranım), seçili satıra kaydırma, klavye (oklar, Home/End, sağ/sol aç-kapat ya da üst düğüm), alt satırda "455 parça · 41 gizli · Tümünü göster" / "X açık · N parça". Açılışta tek alt montajlı sarmalayıcı düzeyler açık gelir.
- **Klasör görünümü** (`?view=parts`, `?node=` düzey): yol, "Montaj · N parça" bandı ("Bu düzeyde X alt montaj, Y parça…"), bu düzeyde arama, ızgara/liste. Alt montaj kartı içine girer (geri tuşu çalışır), parça kartı 3B'ye dönüp parçayı seçer ("Montajda göster"); kart menüsü: Montajda göster, Yalnız bunu aç, linki kopyala (B6). A4: `parts ≤ 1` ise ne ağaç ne Parçalar görünümü.
- **Parça küçük resimleri (A3, anlık):** görüntüleyicinin kendi renderer'ı ile, tuval gizliyken (klasör görünümü), sırayla ve kareler arasında bir `requestAnimationFrame` ile; düğüm 1. katmanda tek başına, izometrik, 392×294. Sayfa belleğinde (nesne URL'leri) tutulur, model değişince bırakılır; sunucuya yazılmaz. Seçim vurgusu küçük resme girmez.
- **İzole ve yol çubuğu:** "Yalnız bunu aç" `?node=` yazar (geçmişe eklenir, geri tuşu üst düzeye döner), kamera düğüme sığar; tuvalin altında yol çubuğu (masaüstü her adım bağlantı + "Tüm montaj", telefon "‹ üst düzey" + ad + tam ekran simgesi). Güncel sürümde olmayan `?node=` yok sayılır ve panelde "Bu parça dosyanın güncel sürümünde yok." yazar.
- **Seçim:** tuvalde üstte seçim çubuğu (ad, parça sayısı, Yalnız bunu aç, Gizle/Göster, kaldır), sağ panelin Ayrıntılar sekmesinde seçim kartı (ad, tür, yol, ölçüler mm, Yalnız bunu aç / Tüm montaj, Gizle, linki kopyala, "yalnız senin ekranın" notu). Ayrıntılara montajda "İçerik" ve "Düzeyler" satırları eklendi.
- **Telefon (§4.4 "basit"):** araç çubuğunda "Parçalar" düğmesi alttan bir sayfa açar: aramalı düz liste, bir düzey, alt montaja sağdaki okla girilir, üst düzeye dönüş satırı; satıra dokunmak seçer, göz gizler. Parçalar görünümü telefonda aynı listeyi küçük resimsiz gösterir (alt montaja dokunmak içine girer). Escape kapatır.
- **Metinler** `src/i18n/studio.ts` (`studio.*`, İngilizce + Türkçe).
- **Ölçüm:** görüntüleyici chunk'ı **157 KB** gzip (bütçe 160; 5b'de 156). STL yazıcısı (`scene/stl.ts`) ayrı tembel chunk.
- **Testler:** `outline.test.ts`, `studio.test.ts` (ağaç, görünürlük, görünüşler, dispose, seçme), `stl.test.ts`, `FileDetailPage.studio.test.tsx` (ağaç, tuvalden seçme, gizleme yalnız ekranda, `?node=` izole ve yol çubuğu, eski `?node=`, klasör görünümü, A4).
- **Ekran görüntüleri** `design/ui-shots/assembly/` (`scripts/shoot-assembly.cjs`, Stealthburner 455 parça GLB'si): `studio`, `folder`, `isolate`; 390 ve 1280, açık/koyu. 320 px'te yatay kaydırma yok.

### 5c-1 · Sapmalar

1. **Seçme `three-mesh-bvh` olmadan.** Tıklama başına bir `Raycaster` taraması yeterince hızlı (455 parça, 398 bin üçgen); BVH (+28 KB) gerekirse ayrı chunk olarak eklenir. §6'daki "< 5 ms" ölçümü 5d'deki telefon ölçümüyle yapılacak.
2. **Telefonda "Daha" menüsü yok:** 5c'de telefon araç çubuğu Parçalar + mevcut 5a araçları (sığdır, görünümler, tel kafes, kenarlar, ekran görüntüsü). Kesit, Ölçü, Yorum 5d'de gelince B5 sırasına ve "Daha"ya geçilir (henüz olmayan araç gösterilmez, 03 §6).
3. **Klasör görünümü açık model ister:** ağaç GLB'den okunur; model hazır olmadan Parçalar görünümünde görüntüleyicinin kendi durumu (yükleniyor, hata) gösterilir.
4. **Tek alt montajlı sarmalayıcı** (CAD dışa aktarımlarında yaygın; Stealthburner'da kök → `SBr2_CW2.5_Assembly`) klasör görünümünde atlanır ve ağaçta açık gelir; yol çubuğundan üst düzeye çıkılabilir.
