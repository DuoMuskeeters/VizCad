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

- **start:** yetki `edit`; format STEP/IGES/3MF; kaynak boyutu `Entitlements.maxConvertBytes` (50 MB) altında; beyan edilen GLB boyutu ≤ `maxFileBytes`; rate limit `derivativeStart` (kullanıcı + IP). Yanıt: `{ sessionId, url, headers }`. İmza `Content-Length`'i bağlar.
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
