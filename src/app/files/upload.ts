/**
 * The browser side of an upload (docs/09 §2.4): `requestUpload` → presigned PUT straight to R2 → `completeUpload`.
 * No React and no `effect` here. The type check before uploading is user experience only; the server's `completeUpload` decides.
 */
import { extensionOf, fileTypeOfExtension, hasValidSignature, isValidFileName, SIGNATURE_BYTES, signatureNeedsTail } from '#/shared/fileTypes'
import type { AppResult, Call } from '../api'
import type { UploadedFile, UploadTicket } from './types'

export type UploadFailureReason =
  | 'unsupported'
  | 'empty'
  | 'invalidName'
  | 'tooLarge'
  | 'quota'
  | 'limit'
  | 'denied'
  | 'versionType'
  | 'conflict'
  | 'network'
  | 'rejected'
  | 'failed'

export type UploadOutcome =
  | { readonly ok: true; readonly file: UploadedFile }
  | { readonly ok: false; readonly canceled: true }
  | { readonly ok: false; readonly canceled: false; readonly reason: UploadFailureReason }

export type PutRequest = {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: Blob
  readonly signal: AbortSignal
  readonly onProgress: (fraction: number) => void
}

/** Resolves with the HTTP status and the `ETag` response header; rejects on a network error and with an AbortError when canceled. */
export type Put = (request: PutRequest) => Promise<{ readonly status: number; readonly etag: string | null }>

const abortError = () => new DOMException('Upload canceled', 'AbortError')

/** XMLHttpRequest, because `fetch` cannot report upload progress. Sends exactly the signed headers. */
export const xhrPut: Put = ({ url, headers, body, signal, onProgress }) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => resolve({ status: xhr.status, etag: xhr.getResponseHeader('ETag') })
    xhr.onerror = () => reject(new Error('network'))
    xhr.ontimeout = () => reject(new Error('network'))
    xhr.onabort = () => reject(abortError())
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })

const readBytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer())

/**
 * The early rejection of D15: extension first, then the same signature check the server runs (first 64 KiB, and the last
 * 64 KiB for 3MF). A file the browser cannot read is let through; the server has the last word.
 */
export const checkBeforeUpload = async (file: File): Promise<UploadFailureReason | null> => {
  if (!isValidFileName(file.name)) return 'invalidName'
  const type = fileTypeOfExtension(extensionOf(file.name))
  if (type === undefined) return 'unsupported'
  if (file.size === 0) return 'empty'
  try {
    const head = await readBytes(file.slice(0, SIGNATURE_BYTES))
    const tail = signatureNeedsTail(type.id) ? await readBytes(file.slice(Math.max(0, file.size - SIGNATURE_BYTES))) : undefined
    return hasValidSignature(type.id, { size: file.size, head, tail }) ? null : 'unsupported'
  } catch {
    return null
  }
}

/** Maps a failed product call to what the progress card says. */
export const reasonOf = (failure: { error: string; reason?: string }): UploadFailureReason => {
  switch (failure.error) {
    case 'UnsupportedFileType':
      return 'unsupported'
    case 'FileTooLarge':
      return 'tooLarge'
    case 'StorageQuotaExceeded':
      return 'quota'
    case 'UploadLimitReached':
    case 'RateLimitExceeded':
      return 'limit'
    case 'PermissionDenied':
      return 'denied'
    case 'VersionTypeMismatch':
      return 'versionType'
    case 'ValidationError':
      return 'invalidName'
    case 'UploadMismatch':
    case 'UploadIncomplete':
      return 'rejected'
    case 'Network':
      return 'network'
    default:
      return 'failed'
  }
}

export type RunUploadInput = {
  readonly call: Call
  readonly put: Put
  readonly workspaceId: string
  readonly file: File
  readonly projectId?: string
  /** Uploads a new version of this file instead of a new file. */
  readonly targetFileId?: string
  readonly signal: AbortSignal
  readonly onProgress: (fraction: number) => void
}

const failed = (reason: UploadFailureReason): UploadOutcome => ({ ok: false, canceled: false, reason })

export const runUpload = async (input: RunUploadInput): Promise<UploadOutcome> => {
  const { call, put, workspaceId, file, signal } = input
  if (signal.aborted) return { ok: false, canceled: true }
  const local = await checkBeforeUpload(file)
  if (local !== null) return failed(local)

  const requested: AppResult<UploadTicket> = await call<UploadTicket>('requestUpload', {
    workspaceId,
    name: file.name,
    size: file.size,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.targetFileId === undefined ? {} : { targetFileId: input.targetFileId }),
  })
  if (!requested.ok) return failed(reasonOf(requested))
  const ticket = requested.data
  if (signal.aborted) {
    void call('cancelUpload', { uploadId: ticket.uploadId })
    return { ok: false, canceled: true }
  }

  let sent: { readonly status: number; readonly etag: string | null }
  try {
    sent = await put({ url: ticket.url, headers: ticket.headers, body: file, signal, onProgress: input.onProgress })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      void call('cancelUpload', { uploadId: ticket.uploadId })
      return { ok: false, canceled: true }
    }
    void call('cancelUpload', { uploadId: ticket.uploadId })
    return failed('network')
  }
  // 412: the single-write rule of the signed URL (`If-None-Match: *`) refused a second write, so start over.
  if (sent.status === 412) return failed('conflict')
  if (sent.status < 200 || sent.status >= 300 || sent.etag === null || sent.etag === '') {
    void call('cancelUpload', { uploadId: ticket.uploadId })
    return failed('failed')
  }
  input.onProgress(1)

  const completed = await call<UploadedFile>('completeUpload', { uploadId: ticket.uploadId, etag: sent.etag })
  return completed.ok ? { ok: true, file: completed.data } : failed(reasonOf(completed))
}
