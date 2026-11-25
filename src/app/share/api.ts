/** Browser client for the share link endpoints (src/server/http/share.ts). No `effect` here: this code ships to the client. */

export interface LinkFileView {
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly updatedAt: number
  readonly currentVersion: { readonly number: number }
  readonly thumbnailAvailable: boolean
  readonly can: { readonly download: boolean; readonly comment: false }
  readonly sharer: { readonly displayName: string; readonly workspaceLabel: string | null }
  readonly expiresAt: number | null
}

export type ResolvedLink = { readonly kind: 'file'; readonly file: LinkFileView } | { readonly kind: 'password' }

export interface ShareFailure {
  readonly ok: false
  /** 0 = the request never reached the server. */
  readonly status: number
  readonly error: string
  /** `LinkExpired`: who shared it. */
  readonly sharer?: string | null
  /** `LinkPasswordInvalid`: the next try must carry a Turnstile token. */
  readonly captchaRequired?: boolean
}

export type ShareResult<T> = { readonly ok: true; readonly data: T } | ShareFailure

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const post = async <T>(path: string, body: Record<string, unknown>, fetcher: typeof fetch): Promise<ShareResult<T>> => {
  try {
    const response = await fetcher(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await readJson(response)
    if (response.ok && json['ok'] === true) return { ok: true, data: json['data'] as T }
    return {
      ok: false,
      status: response.status,
      error: typeof json['error'] === 'string' ? json['error'] : 'Unknown',
      ...(typeof json['sharer'] === 'string' || json['sharer'] === null ? { sharer: json['sharer'] as string | null } : {}),
      ...(typeof json['captchaRequired'] === 'boolean' ? { captchaRequired: json['captchaRequired'] } : {}),
    }
  } catch {
    return { ok: false, status: 0, error: 'Network' }
  }
}

export const resolveLink = (token: string, fetcher: typeof fetch = (...args) => fetch(...args)) =>
  post<ResolvedLink>('/api/s/resolve', { token }, fetcher)

/** The password goes in this POST body only, never in a URL. The proof comes back as an HttpOnly cookie. */
export const sendPassword = (
  input: { readonly token: string; readonly password: string; readonly turnstileToken?: string | null },
  fetcher: typeof fetch = (...args) => fetch(...args),
) =>
  post<{ verified: true }>(
    '/api/s/password',
    { token: input.token, password: input.password, ...(input.turnstileToken ? { turnstileToken: input.turnstileToken } : {}) },
    fetcher,
  )

/** 1536 -> "1.5 KB". Binary units, one decimal from KB up. */
export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}
