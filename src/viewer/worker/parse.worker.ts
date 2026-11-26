/// <reference lib="webworker" />
/**
 * The single parse Worker (docs/11 §1.2): one job per request, handled by `handle.ts`. The occt-import-js glue and its
 * WASM load only for STEP/IGES, inside this Worker.
 */
import { renderThumbnail } from '../scene/thumbnail'
import type { Occt } from './formats/step'
import { handleMessage, occtLoader } from './handle'
import type { WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const loadOcct = occtLoader(() =>
  Promise.all([import('occt-import-js'), import('occt-import-js/dist/occt-import-js.wasm?url')]).then(([module, wasm]) => {
    // Never modified, only located: the WASM is a separate asset next to the Worker chunk (LGPL-2.1).
    return module.default({ locateFile: () => wasm.default }) as Promise<Occt>
  }),
)

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.onmessage = (event: MessageEvent<unknown>) => {
  void handleMessage(event.data, { post, loadOcct, renderThumbnail })
}
