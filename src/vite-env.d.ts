/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_TURNSTILE_SITE_KEY?: string
  /** 'true' shows the Google button; leave unset where Google is not configured (staging). */
  readonly VITE_GOOGLE_SIGN_IN?: string
}
