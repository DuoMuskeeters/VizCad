# legacy/

Eski VizCad kodu (`main` @ 090a4a3), yalnızca referans. Build, `tsconfig`, Vitest ve Tailwind taramasının dışında.

- Yeni kod buraya yamanmaz. Bir parça yeni yapıya (`src/`) port edilince buradaki karşılığı silinir.
- `package.json`, `vite.config.ts`, `tsconfig.json` eski yapılandırmadır; kurulmaz, çalıştırılmaz. Eski uygulamayı çalıştırmak için `~/.t3/projects/vizcad-legacy` worktree'sini kullan.
- `public/` altındaki demo dosyaları (`video.mp4`, STL'ler, landing görselleri) R2'ye taşınmayı bekliyor; liste `docs/00-refactor-plan.md` Faz 1 notlarında.
