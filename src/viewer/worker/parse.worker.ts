/// <reference lib="webworker" />
/**
 * The single parse Worker (docs/11 §1.2): one job per request, answers per `protocol.ts`. Geometry buffers are
 * transferred. The occt-import-js glue and its WASM load only for STEP/IGES, inside this Worker.
 */
import { buildModel } from '../scene/build'
import { renderThumbnail } from '../scene/thumbnail'
import { parseSource } from './formats'
import type { Occt } from './formats/step'
import { classifyError, isWorkerRequest, transferablesOf, type WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

let occt: Promise<Occt> | null = null
const loadOcct = () =>
  (occt ??= Promise.all([import('occt-import-js'), import('occt-import-js/dist/occt-import-js.wasm?url')]).then(([module, wasm]) => {
    // Never modified, only located: the WASM is a separate asset next to the Worker chunk (LGPL-2.1).
    return module.default({ locateFile: () => wasm.default }) as Promise<Occt>
  }))

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.onmessage = async (event: MessageEvent<unknown>) => {
  const request = event.data
  if (!isWorkerRequest(request)) return
  const { id, format, name, bytes } = request
  try {
    const convert = format === 'step' || format === 'iges'
    post({ kind: 'progress', id, stage: convert ? 'convert' : 'parse', ratio: null })
    const { model, stats } = await parseSource(format, bytes, name, { loadOcct })
    if (request.kind === 'thumbnail') {
      post({ kind: 'progress', id, stage: 'thumbnail', ratio: null })
      const blob = await renderThumbnail(buildModel(model))
      post(blob === null ? { kind: 'failed', id, code: 'unsupported' } : { kind: 'thumbnail', id, blob })
      return
    }
    let thumbnail: Blob | null = null
    if (request.thumbnail) {
      post({ kind: 'progress', id, stage: 'thumbnail', ratio: null })
      // Rendered before the buffers move to the main thread; the geometry views are copied by WebGL, not kept.
      thumbnail = await renderThumbnail(buildModel(model))
    }
    post({ kind: 'parsed', id, model, stats, thumbnail }, transferablesOf(model))
  } catch (error) {
    post({ kind: 'failed', id, code: classifyError(error) })
  }
}
