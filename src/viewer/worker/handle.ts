/**
 * What the parse Worker does with one message (docs/11 §1.2), apart from `self`: `parse.worker.ts` wires it to the
 * Worker scope, tests call it with a fake `post`. Answers per `protocol.ts`; geometry buffers are transferred.
 */
import { buildModel } from '../scene/build'
import { disposeObject } from '../scene/dispose'
import { parseSource } from './formats'
import type { Occt } from './formats/step'
import { classifyError, isWorkerRequest, ParseFailure, transferablesOf, type WorkerResponse } from './protocol'

export type HandleDeps = {
  readonly post: (message: WorkerResponse, transfer?: Transferable[]) => void
  readonly loadOcct: () => Promise<Occt>
  /** Renders and consumes a three.js root; null when this Worker cannot draw (no OffscreenCanvas WebGL). */
  readonly renderThumbnail: (root: ReturnType<typeof buildModel>) => Promise<Blob | null>
  /** Writes the GLB derivative of a root without consuming it (`scene/glb.ts`). */
  readonly exportGlb: (root: ReturnType<typeof buildModel>) => Promise<ArrayBuffer>
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
    const { model, stats } = await parseSource(format, bytes, name, { loadOcct: deps.loadOcct, maxConvertBytes: data.maxConvertBytes })
    if (data.kind === 'thumbnail') {
      post({ kind: 'progress', id, stage: 'thumbnail', ratio: null })
      const blob = await deps.renderThumbnail(buildModel(model))
      post(blob === null ? { kind: 'failed', id, code: 'unsupported' } : { kind: 'thumbnail', id, blob })
      return
    }
    const derive = data.kind === 'derive' || data.derive === true
    const wantsThumbnail = data.kind === 'derive' || data.thumbnail
    // One three.js tree serves the GLB and the thumbnail (the thumbnail consumes it, so the GLB is written first).
    const root = derive || wantsThumbnail ? buildModel(model) : null
    let glb: ArrayBuffer | null = null
    if (derive && root !== null) {
      post({ kind: 'progress', id, stage: 'derive', ratio: null })
      // The GLB is a stored copy, not the view: an export that fails leaves the model and the thumbnail as they are and
      // answers `glb: null`, which nobody records as a failed conversion (the next desktop open tries again).
      glb = await deps.exportGlb(root).catch(() => null)
    }
    let thumbnail: Blob | null = null
    if (wantsThumbnail && root !== null) {
      post({ kind: 'progress', id, stage: 'thumbnail', ratio: null })
      // Rendered before the buffers move to the main thread; the geometry views are copied by WebGL, not kept.
      thumbnail = await deps.renderThumbnail(root)
    } else if (root !== null) disposeObject(root)
    if (data.kind === 'derive') {
      post({ kind: 'derived', id, glb, thumbnail, tree: model.tree, stats }, glb === null ? [] : [glb])
      return
    }
    post({ kind: 'parsed', id, model, stats, thumbnail, glb }, glb === null ? transferablesOf(model) : [...transferablesOf(model), glb])
  } catch (error) {
    post({ kind: 'failed', id, code: classifyError(error) })
  }
}
