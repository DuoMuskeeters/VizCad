import { afterEach, describe, expect, it, vi } from 'vitest'
import { deriveInWorker, download, parseInWorker, thumbnailInWorker, type WorkerLike } from './pipeline'
import type { ParsedModel, Stats, WorkerRequest, WorkerResponse } from './worker/protocol'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null
  onerror: WorkerLike['onerror'] = null
  onmessageerror: WorkerLike['onmessageerror'] = null
  sent: { message: WorkerRequest; transfer: Transferable[] }[] = []
  terminated = 0
  postMessage(message: WorkerRequest, transfer: Transferable[]) {
    this.sent.push({ message, transfer })
  }
  terminate() {
    this.terminated++
  }
  reply(message: DistributiveOmit<WorkerResponse, 'id'> & { id?: number }) {
    this.onmessage?.({ data: { id: this.sent[0]!.message.id, ...message } } as MessageEvent<unknown>)
  }
}

const stats: Stats = { triangles: 1, nodes: 1, parts: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 1 }
const model: ParsedModel = { meshes: [], tree: { name: 'x', path: '0', mesh: null, matrix: null, children: [] }, up: 'z' }

afterEach(() => vi.useRealTimers())

describe('parse pipeline', () => {
  it('transfers the bytes, forwards progress and resolves with the parsed model', async () => {
    const worker = new FakeWorker()
    const progress: unknown[] = []
    const bytes = new ArrayBuffer(8)
    const job = parseInWorker({ format: 'stl', name: 'a.stl', bytes, thumbnail: true, spawn: () => worker, onProgress: (stage, ratio) => progress.push([stage, ratio]) })
    expect(worker.sent[0]!.message).toMatchObject({ kind: 'parse', format: 'stl', name: 'a.stl', thumbnail: true })
    expect(worker.sent[0]!.transfer).toEqual([bytes])
    worker.reply({ kind: 'progress', stage: 'parse', ratio: null })
    // An answer for another job id is ignored.
    worker.reply({ kind: 'failed', code: 'corrupt', id: 999_999 })
    worker.reply({ kind: 'parsed', model, stats, thumbnail: null, glb: null })
    expect(await job.result).toEqual({ ok: true, model, stats, thumbnail: null, glb: null })
    expect(progress).toEqual([['parse', null]])
    expect(worker.terminated).toBe(1)
  })

  it('derive: asks for the GLB with the workspace limit and resolves with GLB, thumbnail, tree and stats; parse may derive too', async () => {
    const worker = new FakeWorker()
    const job = deriveInWorker({ format: 'step', name: 'a.stp', bytes: new ArrayBuffer(4), maxConvertBytes: 1234, spawn: () => worker })
    expect(worker.sent[0]!.message).toEqual({ kind: 'derive', id: worker.sent[0]!.message.id, format: 'step', name: 'a.stp', bytes: expect.any(ArrayBuffer), maxConvertBytes: 1234 })
    const glb = new ArrayBuffer(20)
    const thumbnail = new Blob(['t'], { type: 'image/webp' })
    worker.reply({ kind: 'derived', glb, thumbnail, tree: model.tree, stats })
    expect(await job.result).toEqual({ ok: true, glb, thumbnail, tree: model.tree, stats })

    const second = new FakeWorker()
    void parseInWorker({ format: 'step', name: 'a.stp', bytes: new ArrayBuffer(1), thumbnail: false, derive: true, spawn: () => second })
    expect(second.sent[0]!.message).toMatchObject({ kind: 'parse', derive: true })
    const third = new FakeWorker()
    void parseInWorker({ format: 'stl', name: 'a.stl', bytes: new ArrayBuffer(1), thumbnail: false, spawn: () => third })
    expect(third.sent[0]!.message).not.toHaveProperty('derive')
  })

  it('passes failure codes through', async () => {
    const worker = new FakeWorker()
    const job = parseInWorker({ format: 'step', name: 'a.stp', bytes: new ArrayBuffer(1), thumbnail: false, spawn: () => worker })
    worker.reply({ kind: 'failed', code: 'empty' })
    expect(await job.result).toEqual({ ok: false, code: 'empty' })
  })

  it('a dying Worker is out_of_memory when it says so, corrupt otherwise; one that never loaded is network', async () => {
    for (const [message, spoke, code] of [['Out of memory', true, 'out_of_memory'], ['boom', true, 'corrupt'], ['', false, 'network'], ['Out of memory', false, 'out_of_memory']] as const) {
      const worker = new FakeWorker()
      const job = parseInWorker({ format: 'step', name: 'a.stp', bytes: new ArrayBuffer(1), thumbnail: false, spawn: () => worker })
      if (spoke) worker.reply({ kind: 'progress', stage: 'convert', ratio: null })
      worker.onerror?.({ message, preventDefault: () => {} } as ErrorEvent)
      expect(await job.result, `${message}/${spoke}`).toEqual({ ok: false, code })
      expect(worker.terminated).toBe(1)
    }
  })

  it('times out after the limit and terminates the Worker', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const job = parseInWorker({ format: 'step', name: 'a.stp', bytes: new ArrayBuffer(1), thumbnail: false, spawn: () => worker })
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(await job.result).toEqual({ ok: false, code: 'timeout' })
    expect(worker.terminated).toBe(1)
  })

  it('cancel terminates once and ignores later answers', async () => {
    const worker = new FakeWorker()
    const job = thumbnailInWorker({ format: 'obj', name: 'a.obj', bytes: new ArrayBuffer(1), spawn: () => worker })
    expect(worker.sent[0]!.message.kind).toBe('thumbnail')
    job.cancel()
    worker.reply({ kind: 'thumbnail', blob: new Blob() })
    job.cancel()
    expect(await job.result).toEqual({ ok: false, code: 'canceled' })
    expect(worker.terminated).toBe(1)
  })

  it('thumbnail jobs resolve with the blob', async () => {
    const worker = new FakeWorker()
    const job = thumbnailInWorker({ format: 'ply', name: 'a.ply', bytes: new ArrayBuffer(1), spawn: () => worker })
    const blob = new Blob(['x'], { type: 'image/webp' })
    worker.reply({ kind: 'parsed', model, stats, thumbnail: null, glb: null })
    worker.reply({ kind: 'thumbnail', blob })
    expect(await job.result).toEqual({ ok: true, blob })
  })
})

describe('download', () => {
  const streamOf = (...chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((n) => controller.enqueue(new Uint8Array(n).fill(7)))
        controller.close()
      },
    })

  it('reports progress against Content-Length and joins the chunks', async () => {
    const ratios: Array<number | null> = []
    const fetcher = vi.fn(async () => new Response(streamOf(3, 5), { headers: { 'content-length': '8' } }))
    const result = await download('/api/files/f/content?v=current', new AbortController().signal, (r) => ratios.push(r), fetcher as unknown as typeof fetch)
    expect(result.ok && result.bytes.byteLength).toBe(8)
    expect(ratios).toEqual([0, 3 / 8, 1])
    expect(fetcher).toHaveBeenCalledWith('/api/files/f/content?v=current', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('has no ratio without a length, and fails on an error status or a network error', async () => {
    const ratios: Array<number | null> = []
    const ok = await download('/x', new AbortController().signal, (r) => ratios.push(r), (async () => new Response(streamOf(2))) as unknown as typeof fetch)
    expect(ok.ok).toBe(true)
    expect(ratios.every((r) => r === null)).toBe(true)
    expect(await download('/x', new AbortController().signal, () => {}, (async () => new Response('no', { status: 404 })) as unknown as typeof fetch)).toEqual({ ok: false, canceled: false })
    const controller = new AbortController()
    controller.abort()
    expect(await download('/x', controller.signal, () => {}, (async () => Promise.reject(new DOMException('aborted', 'AbortError'))) as unknown as typeof fetch)).toEqual({ ok: false, canceled: true })
  })
})
