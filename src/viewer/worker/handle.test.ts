import { describe, expect, it, vi } from 'vitest'
import type { Occt } from './formats/step'
import { handleMessage, occtLoader, type HandleDeps } from './handle'
import { ParseFailure, type WorkerResponse } from './protocol'

/** Binary STL with one triangle. */
const stl = () => {
  const bytes = new Uint8Array(84 + 50)
  const view = new DataView(bytes.buffer)
  view.setUint32(80, 1, true)
  ;[0, 0, 0, 10, 0, 0, 0, 10, 0].forEach((v, k) => view.setFloat32(84 + 12 + k * 4, v, true))
  return bytes.buffer
}

const harness = (overrides: Partial<HandleDeps> = {}) => {
  const sent: Array<{ message: WorkerResponse; transfer: Transferable[] }> = []
  const deps: HandleDeps = {
    post: (message, transfer = []) => sent.push({ message, transfer }),
    loadOcct: () => Promise.reject(new Error('not in this test')),
    renderThumbnail: vi.fn(async () => new Blob(['img'], { type: 'image/webp' })),
    exportGlb: vi.fn(async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer),
    ...overrides,
  }
  return { sent, deps, kinds: () => sent.map((s) => s.message.kind) }
}

describe('parse Worker messages', () => {
  it('ignores anything that is not a request', async () => {
    const { sent, deps } = harness()
    for (const data of [null, 'parse', { kind: 'parse', id: 1, format: 'stl' }, { kind: 'other', id: 1, format: 'stl', bytes: stl() }]) await handleMessage(data, deps)
    expect(sent).toEqual([])
  })

  it('parse: progress, then the model with its buffers transferred; no thumbnail unless asked', async () => {
    const { sent, deps, kinds } = harness()
    await handleMessage({ kind: 'parse', id: 7, format: 'stl', name: 'a.stl', bytes: stl(), thumbnail: false }, deps)
    expect(kinds()).toEqual(['progress', 'parsed'])
    expect(sent[0]!.message).toEqual({ kind: 'progress', id: 7, stage: 'parse', ratio: null })
    const parsed = sent[1]!
    if (parsed.message.kind !== 'parsed') throw new Error('expected parsed')
    expect(parsed.message.stats.triangles).toBe(1)
    expect(parsed.message.thumbnail).toBeNull()
    expect(parsed.transfer).toContain(parsed.message.model.meshes[0]!.position.buffer)
    expect(deps.renderThumbnail).not.toHaveBeenCalled()
  })

  it('parse with thumbnail renders before handing the geometry over', async () => {
    const { sent, deps, kinds } = harness()
    await handleMessage({ kind: 'parse', id: 8, format: 'stl', name: 'a.stl', bytes: stl(), thumbnail: true }, deps)
    expect(kinds()).toEqual(['progress', 'progress', 'parsed'])
    const parsed = sent[2]!.message
    expect(parsed.kind === 'parsed' && parsed.thumbnail?.type).toBe('image/webp')
  })

  it('thumbnail: the blob, or unsupported when this Worker cannot draw', async () => {
    const ok = harness()
    await handleMessage({ kind: 'thumbnail', id: 9, format: 'stl', name: 'a.stl', bytes: stl() }, ok.deps)
    expect(ok.kinds()).toEqual(['progress', 'progress', 'thumbnail'])
    const blind = harness({ renderThumbnail: async () => null })
    await handleMessage({ kind: 'thumbnail', id: 10, format: 'stl', name: 'a.stl', bytes: stl() }, blind.deps)
    expect(blind.sent.at(-1)!.message).toEqual({ kind: 'failed', id: 10, code: 'unsupported' })
  })

  it('failures answer with their code', async () => {
    const { sent, deps } = harness()
    await handleMessage({ kind: 'parse', id: 11, format: 'stl', name: 'a.stl', bytes: new ArrayBuffer(0), thumbnail: false }, deps)
    expect(sent.at(-1)!.message).toEqual({ kind: 'failed', id: 11, code: 'empty' })
    await handleMessage({ kind: 'parse', id: 12, format: 'step', name: 'a.stp', bytes: new ArrayBuffer(4), thumbnail: false }, { ...deps, loadOcct: occtLoader(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))) })
    expect(sent[sent.length - 2]!.message).toEqual({ kind: 'progress', id: 12, stage: 'convert', ratio: null })
    expect(sent.at(-1)!.message).toEqual({ kind: 'failed', id: 12, code: 'network' })
  })
})

describe('occtLoader', () => {
  it('caches a loaded module, and retries after a failed load', async () => {
    const module = { ReadFile: () => ({ success: false, root: {}, meshes: [] }) } as unknown as Occt
    const load = vi.fn<() => Promise<Occt>>().mockRejectedValueOnce(new Error('NetworkError')).mockResolvedValue(module)
    const occt = occtLoader(load)
    await expect(occt()).rejects.toMatchObject({ code: 'network' })
    expect(await occt()).toBe(module)
    expect(await occt()).toBe(module)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a WASM that ran out of memory is not a network problem', async () => {
    const occt = occtLoader(() => Promise.reject(new RangeError('WebAssembly.instantiate(): Out of memory')))
    const error = await occt().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ParseFailure)
    expect((error as ParseFailure).code).toBe('out_of_memory')
  })
})
