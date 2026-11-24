import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// Cloudflare's documented always-pass test key, used only by `pnpm dev` when no site key is configured.
const DEV_TEST_KEY = '1x00000000000000000000AA'

export const turnstileSiteKey = (): string | null => {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY
  if (key) return key
  return import.meta.env.DEV ? DEV_TEST_KEY : null
}

let scriptPromise: Promise<TurnstileApi> | null = null
const loadScript = (): Promise<TurnstileApi> => {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

type Props = {
  action: string
  onToken: (token: string | null) => void
  onError: () => void
}

/** Interaction-only widget: invisible unless Cloudflare needs a human check. Remount it (change `key`) to get a fresh token. */
export const Turnstile = ({ action, onToken, onError }: Props) => {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onToken, onError })
  callbacks.current = { onToken, onError }

  useEffect(() => {
    const siteKey = turnstileSiteKey()
    const el = host.current
    if (!siteKey || !el) return
    let widgetId: string | null = null
    let cancelled = false
    loadScript().then(
      (api) => {
        if (cancelled) return
        widgetId = api.render(el, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          callback: (token: string) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': () => callbacks.current.onError(),
        })
      },
      () => callbacks.current.onError(),
    )
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [action])

  return <div ref={host} className="empty:hidden" />
}
