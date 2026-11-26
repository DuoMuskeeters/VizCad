/**
 * Stores a GLB derivative the parse Worker wrote (docs/11 §2.3) through `POST /api/files/{id}/derivative/start` →
 * presigned PUT to R2 → `…/complete`, or records why there is none (`…/failed`). No `effect`, no three.js: both the
 * upload flow and the file page use it. Failures are quiet for the person: the file keeps opening from its source.
 */
import type { ErrorCode, Stats } from '#/viewer/worker/protocol'

/** Worker codes worth recording: they are about the file. `network` and a cancel are not (the next open tries again). */
export const RECORDED_CODES: ReadonlySet<ErrorCode> = new Set(['empty', 'unsupported', 'too_large', 'too_complex', 'out_of_memory', 'corrupt', 'timeout'])

export type DerivativeResult = 'ready' | 'failed' | 'version_changed' | 'error'

type Fetch = typeof fetch

const base = (fileId: string) => `/api/files/${encodeURIComponent(fileId)}/derivative`

const postJson = (fetcher: Fetch, url: string, body: unknown) =>
  fetcher(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const errorOf = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : 'Unknown'
  } catch {
    return 'Unknown'
  }
}

const dataOf = async <T>(response: Response): Promise<T> => ((await response.json()) as { data: T }).data

/** What the server keeps of the Worker's stats (the `DerivativeStats` schema): finite numbers, the reader's name. */
export const statsBody = (stats: Stats, converter: string) => ({
  converter,
  triangles: stats.triangles,
  nodes: stats.nodes,
  parts: stats.parts,
  bbox: { min: [...stats.bbox.min], max: [...stats.bbox.max] },
})

export type DerivativeUpload = {
  readonly fileId: string
  /** The version number the GLB was converted from; a newer one makes the server refuse it (`version_changed`). */
  readonly version: number
  readonly glb: ArrayBuffer
  readonly stats: Stats
  readonly converter: string
  readonly fetcher?: Fetch
}

/** start → PUT (exactly the signed headers and bytes) → complete. */
export const uploadDerivative = async (input: DerivativeUpload): Promise<DerivativeResult> => {
  const fetcher = input.fetcher ?? ((...args: Parameters<Fetch>) => fetch(...args))
  try {
    const started = await postJson(fetcher, `${base(input.fileId)}/start`, { version: input.version, size: input.glb.byteLength })
    if (!started.ok) {
      const error = await errorOf(started)
      if (error === 'VersionChanged') return 'version_changed'
      // The GLB is over the plan's cap (a multiple of the source, docs/11 §2.6): recorded as too_large, like a source over maxConvertBytes.
      if (error === 'FileTooLarge') return reportDerivativeFailure({ fileId: input.fileId, version: input.version, code: 'too_large', fetcher })
      return 'error'
    }
    const ticket = await dataOf<{ sessionId: string; url: string; headers: Record<string, string> }>(started)
    const put = await fetcher(ticket.url, { method: 'PUT', headers: ticket.headers, body: input.glb })
    const etag = put.headers.get('etag')
    if (!put.ok || etag === null) return 'error'
    const completed = await postJson(fetcher, `${base(input.fileId)}/complete`, { sessionId: ticket.sessionId, etag, stats: statsBody(input.stats, input.converter) })
    if (completed.ok) return 'ready'
    return (await errorOf(completed)) === 'VersionChanged' ? 'version_changed' : 'error'
  } catch {
    return 'error'
  }
}

/** Records a failed conversion (`too_large` included); other codes are dropped. */
export const reportDerivativeFailure = async (input: { readonly fileId: string; readonly version: number; readonly code: ErrorCode; readonly fetcher?: Fetch }): Promise<DerivativeResult> => {
  if (!RECORDED_CODES.has(input.code)) return 'error'
  const fetcher = input.fetcher ?? ((...args: Parameters<Fetch>) => fetch(...args))
  try {
    const response = await postJson(fetcher, `${base(input.fileId)}/failed`, { version: input.version, code: input.code })
    if (response.ok) return (await dataOf<{ state: string }>(response)).state === 'ready' ? 'ready' : 'failed'
    return (await errorOf(response)) === 'VersionChanged' ? 'version_changed' : 'error'
  } catch {
    return 'error'
  }
}
