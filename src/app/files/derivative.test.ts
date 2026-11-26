import { describe, expect, it, vi } from 'vitest'
import { reportDerivativeFailure, uploadDerivative } from './derivative'

const stats = { triangles: 4, nodes: 2, parts: 1, bbox: { min: [0, 0, 0], max: [1, 2, 3] }, ms: 9 } as const
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('uploadDerivative', () => {
  it('start → PUT with exactly the signed headers → complete with the ETag and the stats the server keeps', async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      if (url.endsWith('/start')) return json(200, { ok: true, data: { sessionId: 's1', url: 'https://r2.test/k', headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' } } })
      if (url === 'https://r2.test/k') return new Response(null, { status: 200, headers: { etag: '"abc"' } })
      return json(200, { ok: true, data: { state: 'ready' } })
    }) as unknown as typeof fetch
    const glb = new ArrayBuffer(48)
    expect(await uploadDerivative({ fileId: 'f 1', version: 2, glb, stats, converter: 'occt-import-js 0.0.23', fetcher })).toBe('ready')
    expect(calls.map(([url]) => url)).toEqual(['/api/files/f%201/derivative/start', 'https://r2.test/k', '/api/files/f%201/derivative/complete'])
    expect(JSON.parse(String(calls[0]![1]?.body))).toEqual({ version: 2, size: 48 })
    expect(calls[1]![1]).toEqual({ method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' }, body: glb })
    expect(JSON.parse(String(calls[2]![1]?.body))).toEqual({ sessionId: 's1', etag: '"abc"', stats: { converter: 'occt-import-js 0.0.23', triangles: 4, nodes: 2, parts: 1, bbox: { min: [0, 0, 0], max: [1, 2, 3] } } })
  })

  it('a moved version is version_changed; a refused PUT, a missing ETag or the network is error', async () => {
    const changed = vi.fn(async () => json(409, { ok: false, error: 'VersionChanged' })) as unknown as typeof fetch
    expect(await uploadDerivative({ fileId: 'f', version: 1, glb: new ArrayBuffer(4), stats, converter: 'x', fetcher: changed })).toBe('version_changed')
    const noEtag = vi.fn(async (url: string) => (url.endsWith('/start') ? json(200, { ok: true, data: { sessionId: 's', url: 'https://r2.test/k', headers: {} } }) : new Response(null, { status: 200 }))) as unknown as typeof fetch
    expect(await uploadDerivative({ fileId: 'f', version: 1, glb: new ArrayBuffer(4), stats, converter: 'x', fetcher: noEtag })).toBe('error')
    const offline = vi.fn(async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    expect(await uploadDerivative({ fileId: 'f', version: 1, glb: new ArrayBuffer(4), stats, converter: 'x', fetcher: offline })).toBe('error')
  })
})

describe('reportDerivativeFailure', () => {
  it('records codes about the file, never network or a cancel', async () => {
    const fetcher = vi.fn(async () => json(200, { ok: true, data: { state: 'failed' } })) as unknown as typeof fetch
    expect(await reportDerivativeFailure({ fileId: 'f', version: 3, code: 'corrupt', fetcher })).toBe('failed')
    expect(vi.mocked(fetcher)).toHaveBeenCalledWith('/api/files/f/derivative/failed', expect.objectContaining({ method: 'POST', body: JSON.stringify({ version: 3, code: 'corrupt' }) }))
    expect(await reportDerivativeFailure({ fileId: 'f', version: 3, code: 'network', fetcher })).toBe('error')
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(1)
  })
})
