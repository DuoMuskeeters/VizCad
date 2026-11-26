import { describe, expect, it, vi } from 'vitest'
import { thumbnailPostUrl, uploadThumbnail } from './thumbnail'

describe('uploadThumbnail', () => {
  it('posts PNG or WebP to the current version with its content type', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })
    expect(await uploadThumbnail('f 1', 3, blob, fetcher as unknown as typeof fetch)).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('/api/files/f%201/thumbnail?v=current&expect=3', expect.objectContaining({ method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/webp' }, body: blob }))
    expect(thumbnailPostUrl('a', 1)).toBe('/api/files/a/thumbnail?v=current&expect=1')
  })

  it('refuses other types and sizes without a request, and reports server or network failures', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 422 }))
    expect(await uploadThumbnail('f', 1, new Blob(['x'], { type: 'image/jpeg' }), fetcher as unknown as typeof fetch)).toBe(false)
    expect(await uploadThumbnail('f', 1, new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'image/png' }), fetcher as unknown as typeof fetch)).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await uploadThumbnail('f', 1, new Blob(['x'], { type: 'image/png' }), fetcher as unknown as typeof fetch)).toBe(false)
    const offline = vi.fn(async () => Promise.reject(new Error('offline')))
    expect(await uploadThumbnail('f', 1, new Blob(['x'], { type: 'image/png' }), offline as unknown as typeof fetch)).toBe(false)
  })
})
