import { Effect } from 'effect'
import { PayloadTooLarge, ValidationError } from '../errors'

const MAX_BODY_BYTES = 16 * 1024

/**
 * Reads the JSON body of a clone (the SDK still gets the original), with a hard size cap (16 KiB unless given): a declared
 * content-length over the cap is refused outright, and without one (chunked) the stream is cut as soon as
 * it passes the cap, so an oversized body is never buffered.
 */
export const readBody = (request: Request, maxBytes: number = MAX_BODY_BYTES) =>
  Effect.gen(function* () {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > maxBytes) return yield* new PayloadTooLarge()
    const stream = request.clone().body
    const text = yield* Effect.tryPromise({
      try: async () => {
        if (stream === null) return ''
        const reader = stream.getReader()
        const chunks: Array<Uint8Array> = []
        let size = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) {
            void reader.cancel().catch(() => undefined)
            return null
          }
          chunks.push(value)
        }
        const all = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          all.set(chunk, offset)
          offset += chunk.byteLength
        }
        return new TextDecoder().decode(all)
      },
      catch: () => new ValidationError({ message: 'unreadable body' }),
    })
    if (text === null) return yield* new PayloadTooLarge()
    return yield* Effect.try({ try: (): unknown => JSON.parse(text), catch: () => new ValidationError({ message: 'invalid JSON' }) })
  })


/**
 * Reads a binary body (a thumbnail) with a hard size cap, like `readBody`: a declared length over the cap is refused
 * outright, and a chunked stream is cut as soon as it passes the cap.
 */
export const readBinaryBody = (request: Request, maxBytes: number) =>
  Effect.gen(function* () {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > maxBytes) return yield* new PayloadTooLarge()
    const stream = request.clone().body
    const bytes = yield* Effect.tryPromise({
      try: async () => {
        if (stream === null) return new Uint8Array(0)
        const reader = stream.getReader()
        const chunks: Array<Uint8Array> = []
        let size = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) {
            void reader.cancel().catch(() => undefined)
            return null
          }
          chunks.push(value)
        }
        const all = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          all.set(chunk, offset)
          offset += chunk.byteLength
        }
        return all
      },
      catch: () => new ValidationError({ message: 'unreadable body' }),
    })
    if (bytes === null) return yield* new PayloadTooLarge()
    return bytes
  })
