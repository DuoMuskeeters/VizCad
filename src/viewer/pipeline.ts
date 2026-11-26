/**
 * Main-thread side of the parse Worker (docs/11 §1.1): download with progress, one Worker per job, timeout and cancel
 * (cancel terminates the Worker; the next job starts a fresh one). No three.js here, so the upload flow can use it
 * without loading the viewer chunk.
 */
import {
  isWorkerResponse,
  PARSE_TIMEOUT_MS,
  type ErrorCode,
  type ParsedModel,
  type SourceFormat,
  type Stage,
  type Stats,
  type WorkerRequest,
  type WorkerResponse,
} from './worker/protocol'

/** The part of `Worker` the pipeline uses; tests pass a fake. */
export type WorkerLike = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
  postMessage: (message: WorkerRequest, transfer: Transferable[]) => void
  terminate: () => void
}

export const spawnParseWorker = (): WorkerLike => new Worker(new URL('./worker/parse.worker.ts', import.meta.url), { type: 'module', name: 'vizcad-parse' })

export type ParseOutcome =
  | { readonly ok: true; readonly model: ParsedModel; readonly stats: Stats; readonly thumbnail: Blob | null }
  | { readonly ok: false; readonly code: ErrorCode | 'canceled' }

export type ThumbnailOutcome = { readonly ok: true; readonly blob: Blob } | { readonly ok: false; readonly code: ErrorCode | 'canceled' }

export type Job<T> = { readonly result: Promise<T>; readonly cancel: () => void }

type JobInput = {
  readonly format: SourceFormat
  readonly name: string
  /** Transferred to the Worker: the caller's buffer is detached afterwards. */
  readonly bytes: ArrayBuffer
  readonly onProgress?: (stage: Stage, ratio: number | null) => void
  readonly spawn?: () => WorkerLike
  readonly timeoutMs?: number
}

let nextId = 1

type Answer = Extract<WorkerResponse, { kind: 'parsed' | 'thumbnail' }>

const narrow = (data: unknown, id: number) => (isWorkerResponse(data) && data.id === id ? data : null)

const run = <T>(input: JobInput, request: (id: number) => WorkerRequest, settle: (message: Answer) => T | null, failed: (code: ErrorCode | 'canceled') => T): Job<T> => {
  const id = nextId++
  const worker = (input.spawn ?? spawnParseWorker)()
  let finish: (value: T) => void = () => {}
  let done = false
  const result = new Promise<T>((resolve) => {
    finish = (value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      worker.terminate()
      resolve(value)
    }
  })
  const timer = setTimeout(() => finish(failed('timeout')), input.timeoutMs ?? PARSE_TIMEOUT_MS)
  worker.onmessage = (event) => {
    const message = narrow(event.data, id)
    if (message === null) return
    if (message.kind === 'progress') return input.onProgress?.(message.stage, message.ratio)
    if (message.kind === 'failed') return finish(failed(message.code))
    const value = settle(message)
    if (value !== null) finish(value)
  }
  // A Worker that dies (most often the tab's memory limit) reports an ErrorEvent without a useful code.
  worker.onerror = (event) => {
    event.preventDefault?.()
    finish(failed(/memory/i.test(event.message ?? '') ? 'out_of_memory' : 'corrupt'))
  }
  worker.onmessageerror = () => finish(failed('corrupt'))
  worker.postMessage(request(id), [input.bytes])
  return { result, cancel: () => finish(failed('canceled')) }
}

/** Parses a source file; with `thumbnail`, the Worker also renders one before handing the geometry over. */
export const parseInWorker = (input: JobInput & { readonly thumbnail: boolean }): Job<ParseOutcome> =>
  run<ParseOutcome>(
    input,
    (id) => ({ kind: 'parse', id, format: input.format, name: input.name, bytes: input.bytes, thumbnail: input.thumbnail }),
    (message) => (message.kind === 'parsed' ? { ok: true, model: message.model, stats: message.stats, thumbnail: message.thumbnail } : null),
    (code) => ({ ok: false, code }),
  )

/** Renders only a thumbnail (upload flow). */
export const thumbnailInWorker = (input: JobInput): Job<ThumbnailOutcome> =>
  run<ThumbnailOutcome>(
    input,
    (id) => ({ kind: 'thumbnail', id, format: input.format, name: input.name, bytes: input.bytes }),
    (message) => (message.kind === 'thumbnail' ? { ok: true, blob: message.blob } : null),
    (code) => ({ ok: false, code }),
  )

export type DownloadOutcome = { readonly ok: true; readonly bytes: ArrayBuffer } | { readonly ok: false; readonly canceled: boolean }

/** GET with progress (Content-Length when the server sends one). Same-origin cookies; the endpoint decides permission. */
export const download = async (url: string, signal: AbortSignal, onProgress: (ratio: number | null) => void, fetcher: typeof fetch = (...args) => fetch(...args)): Promise<DownloadOutcome> => {
  try {
    const response = await fetcher(url, { credentials: 'same-origin', signal })
    if (!response.ok || response.body === null) return { ok: false, canceled: false }
    const total = Number(response.headers.get('content-length') ?? '')
    const known = Number.isFinite(total) && total > 0
    onProgress(known ? 0 : null)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      onProgress(known ? Math.min(1, received / total) : null)
    }
    const bytes = new Uint8Array(received)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    return { ok: true, bytes: bytes.buffer }
  } catch {
    return { ok: false, canceled: signal.aborted }
  }
}
