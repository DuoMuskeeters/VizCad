# CLAUDE.md

VizCad: an organization management panel for B2B and B2C companies, built around CAD files (vtk.js viewer, storage, sharing, collaboration). Live at viz-cad.com with real users. The project is being **rewritten from scratch** on the `rewrite` branch, on the same stack as the ferhat-portfolio project. Read `docs/01-decisions.md` (source of truth) and `docs/00-refactor-plan.md` first. Docs are in Turkish.

During the rewrite the old code is reference only. Port features into the new structure; don't patch the old files. `gemini.md` describes the old conventions and is superseded by this file.

## Target stack
TanStack Start 1.169 + Router 1.170 on Cloudflare Workers · React 19.2 · TypeScript 6 strict · Vite 8 · Effect 4.1.5 · D1 + Drizzle 0.45 · R2 · Turnstile · Tailwind v4 · pnpm 10 · Vitest 5 + `@effect/vitest`. App-specific: `@kitware/vtk.js`, `occt-import-js` (in a Web Worker), `better-auth` (behind an Effect service), `aws4fetch` (R2 presigned URLs).

## Commands (target)
`pnpm dev` (port 3000) · `pnpm check` (tsc + vitest) · `pnpm build` · `pnpm db:generate` / `pnpm db:migrate:local` / `pnpm db:migrate:remote` · `pnpm cf-typegen`. Deploys happen on push to `main` (Workers Builds).

## Learning more about Effect
Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and follow the links in the file when required. For APIs the guide doesn't cover, search `node_modules/effect/src`. Check module stability (`@since`/`@experimental`) before using Effect 4 modules.
Effect 4 API: services are `class X extends Context.Service<X, Shape>()('vizcad/X') {}`; validation `Schema.decodeUnknownEffect`; checks via `Schema.String.check(Schema.isMaxLength(n))`.

## Layout (target)
- `src/routes/`: thin. Decode input, run a program, map errors to HTTP status. Marketing and blog routes are SSR + edge cached (texts come from the admin CMS, so no prerender); purge affected URLs on publish. App routes (`/app`, `/dashboard`, `/file/*`, `/admin/*`) are `noindex`.
- `src/server/`: `errors.ts` (tagged errors), `services/` (Db, Storage, Email, Auth, Turnstile, AppConfig, Cache, Billing, Entitlements; live layers in separate files so tests never import Worker APIs), `programs/` (business logic + `*.test.ts`), `permissions.ts`, `db/schema.ts`.
- `src/viewer/`: vtk.js and occt code, client only (`.client.tsx`, lazy loaded, conversions in a Web Worker).
- `src/components/`: plain React. `src/i18n/`: 5 locales (`en`, `tr`, `de`, `es`, `fr`); typed text keys with English defaults in code, admin overrides per locale in D1, fallback to English.

## Domain layering (keep it pivot-friendly)
- Core (files, viewer, sharing, comments) knows only `workspaceId` and a permission result, never organizations, plans or billing.
- Tenancy: workspaces via better-auth `organization` plugin. B2B workspace = company with members/roles/invites; B2C = personal workspace. Subscriptions belong to a workspace, not a user.
- Commercial: plan limits (seats, storage, file size) only through the `Entitlements` service; never hard-code limits. Payment provider sits behind `Billing`.

## Effect conventions (server and build code)
- All I/O (D1, R2, fetch, email, auth, Turnstile, env) goes through an Effect service with a `Layer`. No direct binding access outside `src/server/services/`.
- No `try/catch`, no bare `Promise` chains, no `throw` in server code. Use `Effect.tryPromise` with a tagged error.
- Errors are `Data.TaggedError` classes in `src/server/errors.ts`; route handlers map them exhaustively.
- Validate every external input (request bodies, query params, env) with `Schema` at the boundary.
- Config via the `AppConfig` service, never `process.env` or raw `env.X` in business code.
- Each service has an in-memory test Layer; tests never hit real D1/R2.
- Never import `effect` from code that reaches the browser. Don't run Effect inside React components.
- Every new program ships with tests. File permissions (owner / editor / preview / download) live in one module and are fully tested.

## Data safety
- Production D1 `vizcad_auth` and R2 `vizcad-files-bucket` hold live user data. Never run remote migrations, `wrangler d1 execute --remote`, or R2 deletes without asking.
- Schema changes must be backward compatible until the cutover; never rename R2 keys.

## UI non-negotiables
- Mobile first: design and test at 320–430px before desktop. No horizontal scroll, tap targets ≥ 44px, never disable zoom, contrast ≥ 4.5:1.
- Design follows `docs/03-design.md` once it exists. No default shadcn look, no gradients, no emoji headings, no per-section entrance animations. No `any`, no inline styles except for vtk canvas sizing.
- Before finishing any UI change: check 390px wide in light and dark, and run Lighthouse on changed marketing routes.

## Skills
Project skills live in `.claude/skills` (pinned in `skills-lock.json`): Effect, Cloudflare (workers, wrangler, email, turnstile, web-perf), TanStack Start/Router, React best practices, web design guidelines. Use them.
