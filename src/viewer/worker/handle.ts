/**
 * What the parse Worker does with one message (docs/11 §1.2), apart from `self`: `parse.worker.ts` wires it to the
 * Worker scope, tests call it with a fake `post`. Answers per `protocol.ts`; geometry buffers are transferred.
 */
import { buildModel } from '../scene/build'
import { parseSource } from './formats'
import type { Occt } from './formats/step'
import { classifyError, isWorkerRequest, ParseFailure, transferablesOf, type WorkerResponse } from './protocol'

export type HandleDeps = {
  readonly post: (message: WorkerResponse, transfer?: Transferable[]) => void
  readonly loadOcct: () => Promise<Occt>
  /** Renders and consumes a three.js root; null when this Worker cannot draw (no OffscreenCanvas WebGL). */
  readonly renderThumbnail: (root: ReturnType<typeof buildModel>) => Promise<Blob | null>
}

/**
 * Caches the OCCT module per Worker. A failed load is `network` (the glue chunk or the WASM did not arrive) unless it
 * ran out of memory, and is not cached: the next job tries again.
 */
export const occtLoader = (load: () => Promise<Occt>) => {
  let pending: Promise<Occt> | null = null
  return (): Promise<Occt> =>
    (pending ??= load().catch((error: unknown) => {
      pending = null
      throw classifyError(error) === 'out_of_memory' ? new ParseFailure('out_of_memory') : new ParseFailure('network', 'OCCT could not be loaded')
    }))
}

export const handleMessage = async (data: unknown, deps: HandleDeps): Promise<void> => {
  if (!isWorkerRequest(data)) return
  const { id, format, name, bytes } = data
  const { post } = deps
  try {
    const convert = format === 'step' || format === 'iges'
    post({ kind: 'progress', id, stage: convert ? 'convert' : 'parse', ratio: null })
    const { model, stats } = await parseSource(format, bytes, name, { loadOcct: deps.loadOcct })
    if (data.kind === 'thumbnail') {
      post({ kind: 'progress', id, stage: 'thumbnail', ratio: null })
      const blob = await deps.renderThumbnail(buildModel(model))
      post(blob === null ? { kind: 'failed', id, code: 'unsupported' } : { kind: 'thumbnail', id, blob })
      return
    }
    let thumbnail: Blob | null = null
    if (data.thumbnail) {
      post({ kind: 'progress', id, stage: 'thumbnail', ratio: null })
      // Rendered before the buffers move to the main thread; the geometry views are copied by WebGL, not kept.
      thumbnail = await deps.renderThumbnail(buildModel(model))
    }
    post({ kind: 'parsed', id, model, stats, thumbnail }, transferablesOf(model))
  } catch (error) {
    post({ kind: 'failed', id, code: classifyError(error) })
  }
}
