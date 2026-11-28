/** Browser client for `POST /api/cms/<operation>` (src/server/http/cms.ts). No `effect` here: this code ships to the client. */

export type CmsFailure = {
  readonly ok: false
  /** 0 = the request never reached the server. */
  readonly status: number
  /** Tagged error name (`ContentConflict`, `PublishBlocked` …), or `Network` / `Unknown`. */
  readonly error: string
  /** `PublishBlocked`: the fixed reason code. */
  readonly reason?: string
  /** `PublishBlocked` `invalid-fields` / `other-locales-live`: the field names or locales. */
  readonly fields?: ReadonlyArray<string>
  /** `TextTooLong`: the field and its limit. */
  readonly field?: string
  readonly max?: number
}

export type CmsResult<T> = { readonly ok: true; readonly data: T } | CmsFailure

export type CmsCall = <T>(operation: string, body?: Record<string, unknown>) => Promise<CmsResult<T>>

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const strings = (value: unknown): ReadonlyArray<string> | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as ReadonlyArray<string>) : undefined

const send = async <T>(fetcher: typeof fetch, operation: string, init: { readonly contentType: string; readonly body: BodyInit }): Promise<CmsResult<T>> => {
    try {
      const response = await fetcher(`/api/cms/${operation}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': init.contentType },
        body: init.body,
      })
      const json = await readJson(response)
      if (response.ok && json['ok'] === true) return { ok: true, data: json['data'] as T }
      const fields = strings(json['fields'])
      return {
        ok: false,
        status: response.status,
        error: typeof json['error'] === 'string' ? json['error'] : 'Unknown',
        ...(typeof json['reason'] === 'string' ? { reason: json['reason'] } : {}),
        ...(fields === undefined ? {} : { fields }),
        ...(typeof json['field'] === 'string' ? { field: json['field'] } : {}),
        ...(typeof json['max'] === 'number' ? { max: json['max'] } : {}),
      }
    } catch {
      return { ok: false, status: 0, error: 'Network' }
    }
  }

export const makeCmsCall =
  (fetcher: typeof fetch = (...args) => fetch(...args)): CmsCall =>
  <T>(operation: string, body: Record<string, unknown> = {}) =>
    send<T>(fetcher, operation, { contentType: 'application/json', body: JSON.stringify(body) })

/** `POST /api/cms/assets` with the image bytes (its type as Content-Type; the server judges the magic bytes). */
export const makeCmsUpload =
  (fetcher: typeof fetch = (...args) => fetch(...args)) =>
  <T>(image: Blob) =>
    send<T>(fetcher, 'assets', { contentType: image.type || 'application/octet-stream', body: image })

const FIXTURE_KEY = 'vizcad_admin_fixture'

/**
 * Dev only: `?fixture=admin` (and the other `AdminScenario`s) swaps the network for an in-memory API (admin/fixture.ts),
 * kept for the tab in sessionStorage so in-app navigation keeps it. The branch is dropped from production builds.
 */
const devFetcher = (): Promise<typeof fetch> | null => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const fromUrl = new URLSearchParams(window.location.search).get('fixture')
  let scenario: string | null = null
  try {
    if (fromUrl?.startsWith('admin')) sessionStorage.setItem(FIXTURE_KEY, fromUrl)
    scenario = sessionStorage.getItem(FIXTURE_KEY)
  } catch {
    scenario = fromUrl
  }
  if (scenario === null) return null
  return import('./fixture').then((m) => m.fixtureCmsFetch(scenario as Parameters<typeof m.fixtureCmsFetch>[0]))
}

let fixture: Promise<typeof fetch> | null | undefined
const live = makeCmsCall()

/** Image upload through the same network or fixture as `cmsCall`. */
export const cmsUpload = async <T>(image: Blob): Promise<CmsResult<T>> => {
  if (fixture === undefined) fixture = devFetcher()
  return makeCmsUpload(fixture === null ? undefined : await fixture)<T>(image)
}

/** The admin screens' client: the network, or in development the `?fixture=` stand-in. */
export const cmsCall: CmsCall = async <T>(operation: string, body?: Record<string, unknown>) => {
  if (fixture === undefined) fixture = devFetcher()
  if (fixture === null) return live<T>(operation, body)
  return makeCmsCall(await fixture)<T>(operation, body)
}
