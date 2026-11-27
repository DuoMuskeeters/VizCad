import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { noindexHeaders } from './scripts/noindexHeaders'

// Production builds (Faz 9 cutover only) go to their own directory and leave no deploy redirect behind,
// so a later bare `wrangler deploy` can never pick up a production config. Staging: scripts/staging.ts.
const production = process.env['CLOUDFLARE_ENV'] === 'production'
const outRoot = production ? 'dist-production' : 'dist'

const dropDeployRedirect: Plugin = {
  name: 'vizcad:drop-production-deploy-redirect',
  apply: 'build',
  buildApp: {
    order: 'post',
    async handler() {
      if (production) rmSync(resolve('.wrangler/deploy/config.json'), { force: true })
    },
  },
}

// Edge cache key space of this build (docs/12 §7.1, src/shared/buildId.ts): git short SHA + build time (base36).
// `vite dev` keeps the `dev` fallback so a dev server restart does not matter.
const gitSha = () => {
  const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  return git.status === 0 ? git.stdout.trim() : 'nogit'
}

export default defineConfig(({ command }) => ({
  define: {
    'import.meta.env.VIZCAD_PRODUCTION': JSON.stringify(production),
    ...(command === 'build' ? { 'import.meta.env.VIZCAD_BUILD_ID': JSON.stringify(`${gitSha()}.${Date.now().toString(36)}`) } : {}),
  },
  resolve: { tsconfigPaths: true },
  // ES module Workers can split: the viewer's parse Worker loads the occt-import-js glue (and its WASM) only for STEP/IGES.
  worker: { format: 'es' },
  // Pre-bundle server deps at startup. Without this, Vite discovers them on the first API call,
  // re-optimizes mid-session and loads a second copy of effect/react (breaks Redacted and hooks in dev).
  environments: {
    client: { build: { outDir: `${outRoot}/client` } },
    ssr: {
      build: { outDir: `${outRoot}/server` },
      optimizeDeps: {
        include: [
          'effect',
          'drizzle-orm/d1',
          'drizzle-orm/sqlite-core',
          'aws4fetch',
          'react',
          'react-dom/server',
        ],
      },
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    // No prerender: marketing pages are SSR + edge cached because texts come from the admin CMS (D4).
    tanstackStart(),
    viteReact(),
    dropDeployRedirect,
    // Staging only: X-Robots-Tag for static assets, which never reach the Worker (docs/12 §6.5).
    noindexHeaders({ production }),
  ],
}))
