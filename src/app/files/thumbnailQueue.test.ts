import { describe, expect, it, vi } from 'vitest'
import { createThumbnailQueue } from './thumbnailQueue'

const blob = (label: string) => new Blob([label], { type: 'image/webp' })

const deferred = () => {
  let resolve: (value: Blob | null) => void = () => {}
  const promise = new Promise<Blob | null>((r) => (resolve = r))
  return { promise, resolve }
}

describe('thumbnail queue', () => {
  it('runs one job at a time in order and counts what was stored', async () => {
    const order: string[] = []
    const store = vi.fn(async (fileId: string) => {
      order.push(`store ${fileId}`)
      return fileId !== 'b'
    })
    const stored = vi.fn()
    const queue = createThumbnailQueue(store, stored)
    void queue.enqueue('a', async () => (order.push('render a'), blob('a')))
    void queue.enqueue('b', async () => (order.push('render b'), blob('b')))
    await queue.enqueue('c', async () => null)
    expect(order).toEqual(['render a', 'store a', 'render b', 'store b'])
    expect(stored).toHaveBeenCalledTimes(1)
  })

  it('a newer job for the same file drops an older one that has not started', async () => {
    const store = vi.fn(async (_fileId: string, _blob: Blob) => true)
    const queue = createThumbnailQueue(store, () => {})
    const gate = deferred()
    void queue.enqueue('other', () => gate.promise)
    const old = vi.fn(async () => blob('v1'))
    void queue.enqueue('f', old)
    const last = queue.enqueue('f', async () => blob('v2'))
    gate.resolve(null)
    await last
    expect(old).not.toHaveBeenCalled()
    expect(store.mock.calls.map(([id, b]) => [id, b.size])).toEqual([['f', 2]])
  })

  it('an old version that is rendering when the new one arrives is not posted', async () => {
    const posted: string[] = []
    const queue = createThumbnailQueue(async (_id, b) => (posted.push(await b.text()), true), () => {})
    const rendering = deferred()
    const first = queue.enqueue('f', () => rendering.promise)
    await Promise.resolve()
    const second = queue.enqueue('f', async () => blob('v2'))
    rendering.resolve(blob('v1'))
    await Promise.all([first, second])
    expect(posted).toEqual(['v2'])
  })

  it('supersede (a new version upload started) drops the running job without a replacement', async () => {
    const store = vi.fn(async (_fileId: string, _blob: Blob) => true)
    const queue = createThumbnailQueue(store, () => {})
    const rendering = deferred()
    const job = queue.enqueue('f', () => rendering.promise)
    await Promise.resolve()
    queue.supersede('f')
    rendering.resolve(blob('v1'))
    await job
    expect(store).not.toHaveBeenCalled()
    // Other files are not affected, and a later job for the file runs.
    await queue.enqueue('g', async () => blob('g'))
    await queue.enqueue('f', async () => blob('v2'))
    expect(store.mock.calls.map(([id]) => id)).toEqual(['g', 'f'])
  })

  it('a failing render or store does not stop the queue', async () => {
    const store = vi.fn(async (_fileId: string, _blob: Blob) => true)
    const queue = createThumbnailQueue(store, () => {})
    void queue.enqueue('a', () => Promise.reject(new Error('worker died')))
    await queue.enqueue('b', async () => blob('b'))
    expect(store).toHaveBeenCalledTimes(1)
  })
})
