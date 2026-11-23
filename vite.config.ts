import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Pre-bundle server deps at startup. Without this, Vite discovers them on the first API call,
  // re-optimizes mid-session and loads a second copy of effect/react (breaks Redacted and hooks in dev).
  environments: {
    ssr: {
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
  ],
})
