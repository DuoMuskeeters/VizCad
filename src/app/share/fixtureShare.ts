/**
 * Development stand-in for `/api/s/*`, picked by `?fixture=share-<state>` on `/s/<token>` (src/app/share/SharePage.tsx).
 * Never imported in production builds.
 */
import type { LinkFileView } from './api'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const now = () => Math.floor(Date.now() / 1000)

const file = (over: Partial<LinkFileView> = {}): LinkFileView => ({
  name: 'Flanş_DN100_rev3.step', extension: 'step', size: 12_400_000, updatedAt: now() - 3_600, currentVersion: { number: 3 }, thumbnailAvailable: false,
  can: { download: true, comment: false }, sharer: { displayName: 'Ayşe Yılmaz', workspaceLabel: 'Demir Makina' }, expiresAt: now() + 7 * 86_400, ...over,
})

export const shareFixtureFetch = (scenario: string): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === '/api/s/password') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { password?: string }
      return body.password === 'flans2025' ? json(200, { ok: true, data: { verified: true } }) : json(401, { ok: false, error: 'LinkPasswordInvalid', captchaRequired: false })
    }
    if (url !== '/api/s/resolve') return json(404, { ok: false, error: 'LinkUnavailable' })
    switch (scenario) {
      case 'share-view':
        return json(200, { ok: true, data: { kind: 'file', file: file({ can: { download: false, comment: false } }) } })
      case 'share-password':
        return json(200, { ok: true, data: { kind: 'password' } })
      case 'share-expired':
        return json(410, { ok: false, error: 'LinkExpired', sharer: 'Ayşe Yılmaz' })
      case 'share-invalid':
        return json(404, { ok: false, error: 'LinkUnavailable' })
      case 'share-long':
        return json(200, { ok: true, data: { kind: 'file', file: file({ name: 'Çok_uzun_bir_dosya_adı_Pompa_gövdesi_montaj_grubu_son_sürüm_onaylı_rev12_FINAL.step', expiresAt: null, sharer: { displayName: 'Ayşe Yılmaz Aksoy', workspaceLabel: 'Demir Makina Sanayi ve Ticaret Anonim Şirketi' } }) } })
      default:
        return json(200, { ok: true, data: { kind: 'file', file: file() } })
    }
  }) as typeof fetch
