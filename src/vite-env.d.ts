/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_TURNSTILE_SITE_KEY?: string
  /** 'true' shows the Google button; leave unset where Google is not configured (staging). */
  readonly VITE_GOOGLE_SIGN_IN?: string
  /** Set by vite.config.ts `define` at build time (src/shared/buildId.ts). */
  readonly VIZCAD_BUILD_ID?: string
}
