/**
 * The build's identity (docs/12 §7.1): git short SHA + build time in base36, set by `define` in vite.config.ts. Part of
 * every edge cache key, so a deploy never serves HTML from an older build. `dev` outside a build (tests, `vite dev`).
 */
export const BUILD_ID: string = import.meta.env.VIZCAD_BUILD_ID ?? 'dev'
