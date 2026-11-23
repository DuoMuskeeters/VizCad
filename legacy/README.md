# legacy/

Eski VizCad kodu (`main` @ 090a4a3), yalnızca referans. Build, `tsconfig`, Vitest ve Tailwind taramasının dışında.

- Yeni kod buraya yamanmaz. Bir parça yeni yapıya (`src/`) port edilince buradaki karşılığı silinir.
- `package.json`, `vite.config.ts`, `tsconfig.json` eski yapılandırmadır; kurulmaz, çalıştırılmaz. Eski uygulamayı çalıştırmak için `~/.t3/projects/vizcad-legacy` worktree'sini kullan.
- `public/` altındaki demo dosyaları yeni build'e girmiyor. Büyük olanlar R2'ye taşınacak; **production R2'ye yazmak onay ister**, bu yüzden Faz 1'de taşınmadı. Önerilen hedef bir `public/` ya da `demo/` önekidir (kullanıcı key'leriyle çakışmaz; kullanıcı key'leri `<userId>/<fileId>/<ad>`).

| Dosya | Boyut | Eski kullanım | Öneri |
|---|---|---|---|
| `public/video.mp4` | 20.2 MB | Hiçbir yerde referans yok | R2'ye arşivle ya da sil (kararı sen ver) |
| `public/Robotic-Arm.stl` | 2.2 MB | Landing hero (`components/landing/Hero.tsx`) | R2 (landing yenilenince gerekirse) |
| `public/dragon.stl` | 1.8 MB | `/app` demo modeli (`routes/app.tsx`) | R2 (görüntüleyici demosu, Faz 5) |
| `public/hero.png` | 877 KB | Referans yok | Sil |
| `public/broken-filename.png` | 716 KB | Referans yok | Sil |
| `public/video-poster.jpg` | 40 KB | Referans yok | `video.mp4` ile birlikte karar |
| `public/images/features/*.png` (3) | 1.3 MB | Landing `FeatureShowcase` | Yeni landing gerçek ekranlarla yapılacak (D8); muhtemelen gereksiz |
| `public/images/demo/batman-*.png` (2) | 209 KB | Landing demo mock'ları | Aynı |
