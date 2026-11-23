# VizCad

CAD dosyaları merkezli, B2B/B2C organizasyon yönetim paneli ([viz-cad.com](https://viz-cad.com)). Bu branch yeniden yazım; kurallar `CLAUDE.md`, kararlar `docs/01-decisions.md`, plan `docs/00-refactor-plan.md`.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # yerel değerler; production kaynağı değil
pnpm db:migrate:local            # yerel Miniflare D1'e migration'lar
pnpm dev                         # http://localhost:3000
pnpm check                       # tsc + vitest
pnpm build
```

Eski uygulama referans olarak `legacy/` altında; build ve testlere girmez.
