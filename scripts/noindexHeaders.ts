import type { Plugin } from 'vite'

/**
 * Static assets (Workers Static Assets) never pass through the Worker, so `withNoindex` cannot mark them. A staging
 * build writes `_headers` into the client output to send the same header for them (docs/12 §6.5). The production build
 * (`CLOUDFLARE_ENV=production`) never writes it.
 */
export const NOINDEX_HEADERS = '/*\n  X-Robots-Tag: noindex, nofollow\n'

export const noindexHeaders = (options: { readonly production: boolean }): Plugin => ({
  name: 'vizcad:staging-noindex-headers',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'client',
  generateBundle() {
    if (!options.production) this.emitFile({ type: 'asset', fileName: '_headers', source: NOINDEX_HEADERS })
  },
})
