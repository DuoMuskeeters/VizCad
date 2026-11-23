import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

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

export default defineConfig({
  resolve: { tsconfigPaths: true },
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
  ],
})
