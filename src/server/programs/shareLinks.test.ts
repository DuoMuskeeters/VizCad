import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { MemoryStorageControl, Storage } from '../services/Storage'
import { cookieValue } from '../shareCrypto'
import { glb } from '../testing/glb'
import { png } from '../testing/images'
import { caller, programLayer, rows, seedDerivative, seedLink, seedMember, seedStoredFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { createShareLink, revokeShareLink, updateShareLink } from './links'
import {
  deliverLinkContent, deliverLinkModel, deliverLinkThumbnail, type LinkRequest, resolveShareLink, verifyLinkPassword,
} from './shareLinks'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) => TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(defaultPlan)))

const CONTENT = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const ids = { workspaceId: 'acme', fileId: 'f1' }

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedWorkspace('beta', 'zed')
  yield* seedStoredFile('f1', 'bob', 'acme', CONTENT, { name: 'Bracket.step' })
})

const visitor = (cookie: string | null = null, ip: string | null = '198.51.100.5'): LinkRequest => ({
  requestId: 'ray-link', ip, userAgent: 'Mozilla/5.0 (iPhone)', cookie,
})
const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.flip(effect)
const tokenOf = (url: string) => url.slice('https://vizcad.test/s/'.length)
const bodyText = (delivery: { readonly body: ReadableStream<Uint8Array> | Uint8Array | null }) =>
  Effect.promise(async () => new TextDecoder().decode(await new Response(delivery.body as BodyInit | null).arrayBuffer()))

/** `name=value` of a Set-Cookie header, as a browser would send it back. */
const cookieOf = (setCookie: string | null) => (setCookie ?? '').split(';')[0] ?? ''

const share = (options: { level?: 'view' | 'download'; password?: string; expiresAt?: number | null } = {}) =>
  createShareLink(caller('bob'), { ...ids, level: options.level ?? 'download', ...(options.password === undefined ? {} : { password: options.password }), ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }) })
    .pipe(Effect.map((made) => ({ token: tokenOf(made.url), linkId: made.link.id })))

/** What visitors caused: the sharing owner's own management rows (`link.created` ...) are left out. */
const accessRows = rows('accessLog').pipe(Effect.map((all) => all.filter((l) => !['link.created', 'link.updated', 'link.revoked', 'link.copied'].includes(l.action))))
const linkRows = (table: 'securityLog') => rows(table)

describe('resolveShareLink', () => {
  it.effect('shows the file card from an allow-list and records one opening, with the IP only in the security log', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token, linkId } = yield* share({ expiresAt: T0 + 86400 })
      const resolved = yield* resolveShareLink(visitor(), token)
      assert.deepStrictEqual(resolved, {
        kind: 'file',
        file: {
          name: 'Bracket.step', extension: 'step', size: CONTENT.length, updatedAt: T0 - 3600, currentVersion: { number: 1 }, thumbnailAvailable: false,
          model: { kind: 'source', bytes: CONTENT.length, derivative: null, maxConvertBytes: 50 * 1024 * 1024 },
          can: { download: true, comment: false }, sharer: { displayName: 'BOB', workspaceLabel: 'Workspace acme' }, expiresAt: T0 + 86400,
        },
      })
      const serialized = JSON.stringify(resolved)
      for (const secret of ['f1', 'w/acme', 'bob@example.com', 'r2Key', 'contentEtag', '"bob"']) assert.notInclude(serialized, secret)

      const [access] = yield* accessRows
      assert.deepStrictEqual(
        { ...access, id: '<hmac>', createdAt: access?.createdAt.getTime() },
        { id: '<hmac>', workspaceId: 'acme', actorKind: 'link', actorUserId: null, linkId, targetKind: 'file', targetId: 'f1', action: 'link.opened', outcome: 'allowed', requestId: 'ray-link', createdAt: T0 * 1000, reason: null },
      )
      const [security] = yield* linkRows('securityLog')
      assert.deepStrictEqual(
        { ...security, id: '<hmac>', createdAt: security?.createdAt.getTime() },
        { id: '<hmac>', createdAt: T0 * 1000, event: 'link_opened', userId: null, workspaceId: 'acme', targetId: linkId, ip: '198.51.100.5', userAgent: 'Mozilla/5.0 (iPhone)', requestId: 'ray-link' },
      )
      assert.notInclude(JSON.stringify(yield* accessRows), '198.51.100.5')
      assert.notInclude(JSON.stringify([...(yield* accessRows), ...(yield* linkRows('securityLog'))]), token)

      yield* resolveShareLink(visitor(), token)
      yield* resolveShareLink(visitor(null, '203.0.113.1'), token)
      assert.strictEqual((yield* accessRows).length, 1, 'ten minute window, per link')
      yield* TestClock.adjust('11 minutes')
      yield* resolveShareLink(visitor(), token)
      assert.strictEqual((yield* accessRows).length, 2)
    })),
  )

  it.effect('a view link cannot download; a legacy-format token resolves too', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ level: 'view' })
      const resolved = yield* resolveShareLink(visitor(), token)
      assert.deepStrictEqual(resolved.kind === 'file' ? resolved.file.can : null, { download: false, comment: false })
      yield* revokeShareLink(caller('bob'), ids)
      const legacy = yield* seedLink('legacy', 'f1', 'acme', { expiresAt: T0 + 1000, legacyMaxExpiresAt: T0 + 2000 })
      assert.strictEqual(legacy.length, 32)
      assert.strictEqual((yield* resolveShareLink(visitor(), legacy)).kind, 'file')
    })),
  )

  it.effect('one answer for unknown, malformed, revoked, trashed and archived-workspace links', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share()
      for (const bad of ['', 'short', 'a'.repeat(43), `${token}x`, token.slice(1), '../../etc/passwd']) {
        assert.strictEqual((yield* failure(resolveShareLink(visitor(), bad)))._tag, 'LinkUnavailable', bad)
      }
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ isDeleted: true }).where(eq(schema.files.id, 'f1'))))
      assert.strictEqual((yield* failure(resolveShareLink(visitor(), token)))._tag, 'LinkUnavailable')
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ isDeleted: false }).where(eq(schema.files.id, 'f1'))))
      assert.strictEqual((yield* resolveShareLink(visitor(), token)).kind, 'file')
      yield* Db.use((db) => db.use((d) => d.update(schema.organization).set({ archivedAt: new Date(T0 * 1000) }).where(eq(schema.organization.id, 'acme'))))
      assert.strictEqual((yield* failure(resolveShareLink(visitor(), token)))._tag, 'LinkUnavailable')
      yield* Db.use((db) => db.use((d) => d.update(schema.organization).set({ archivedAt: null }).where(eq(schema.organization.id, 'acme'))))
      yield* revokeShareLink(caller('bob'), ids)
      assert.strictEqual((yield* failure(resolveShareLink(visitor(), token)))._tag, 'LinkUnavailable')
      assert.strictEqual((yield* accessRows).filter((l) => l.action === 'link.opened').length, 1, 'refusals open nothing')
    })),
  )

  it.effect('an expired link answers LinkExpired with the sharer; a legacy link ends at its ceiling', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ expiresAt: T0 + 60 })
      assert.strictEqual((yield* resolveShareLink(visitor(), token)).kind, 'file')
      yield* TestClock.adjust('61 seconds')
      const expired = yield* failure(resolveShareLink(visitor(), token))
      assert.deepStrictEqual(expired, new (expired.constructor as new (a: { sharer: string | null }) => typeof expired)({ sharer: 'BOB' }))
      assert.strictEqual(expired._tag, 'LinkExpired')
      yield* revokeShareLink(caller('bob'), ids)

      const legacy = yield* seedLink('legacy', 'f1', 'acme', { expiresAt: T0 + 100, legacyMaxExpiresAt: T0 + 100, createdBy: null, label: 'Old Co' })
      yield* TestClock.setTime((T0 + 99) * 1000)
      assert.strictEqual((yield* resolveShareLink(visitor(), legacy)).kind, 'file')
      yield* TestClock.setTime((T0 + 100) * 1000)
      const ended = yield* failure(resolveShareLink(visitor(), legacy))
      assert.deepStrictEqual([ended._tag, 'sharer' in ended ? ended.sharer : ''], ['LinkExpired', 'Old Co'])
    })),
  )

  it.effect('rate limits per IP before anything is read', () =>
    run(Effect.gen(function* () {
      yield* world
      const stranger = 'Z'.repeat(43)
      let blocked = 0
      for (let i = 0; i < 125; i++) {
        const result = yield* resolveShareLink(visitor(), stranger).pipe(Effect.result)
        if (result._tag === 'Failure' && result.failure._tag === 'RateLimitExceeded') blocked++
      }
      assert.isAbove(blocked, 0)
      assert.strictEqual((yield* failure(resolveShareLink(visitor(null, '203.0.113.99'), stranger)))._tag, 'LinkUnavailable', 'other visitors are not affected')
    })),
  )
})

describe('password gate and proof cookie', () => {
  it.effect('a password link shows only the gate until the right password is posted; the cookie is __Host-, HttpOnly and bounded', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token, linkId } = yield* share({ password: 'correct horse', expiresAt: T0 + 3600 })
      assert.deepStrictEqual(yield* resolveShareLink(visitor(), token), { kind: 'password' })
      assert.strictEqual((yield* accessRows).length, 0, 'the gate opens nothing')

      const ok = yield* verifyLinkPassword(visitor(), { token, password: 'correct horse' })
      assert.strictEqual(ok.expiresAt, T0 + 3600, 'never past the link end')
      assert.match(ok.setCookie ?? '', new RegExp(`^__Host-vizcad-share-${linkId}=v1\\.${T0 + 3600}\\.[A-Za-z0-9_-]{43}; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax$`))
      assert.notInclude(ok.setCookie ?? '', 'Domain')
      const cookie = cookieOf(ok.setCookie)
      assert.strictEqual((yield* resolveShareLink(visitor(cookie), token)).kind, 'file')
      assert.strictEqual(cookieValue(cookie, `__Host-vizcad-share-${linkId}`)?.startsWith('v1.'), true)
    })),
  )

  it.effect('the proof lives at most 12 hours', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ password: 'correct horse' })
      const ok = yield* verifyLinkPassword(visitor(), { token, password: 'correct horse' })
      assert.strictEqual(ok.expiresAt, T0 + 12 * 3600)
      const cookie = cookieOf(ok.setCookie)
      yield* TestClock.setTime((T0 + 12 * 3600 - 1) * 1000)
      assert.strictEqual((yield* resolveShareLink(visitor(cookie), token)).kind, 'file')
      yield* TestClock.setTime((T0 + 12 * 3600) * 1000)
      assert.deepStrictEqual(yield* resolveShareLink(visitor(cookie), token), { kind: 'password' })
    })),
  )

  it.effect('the proof dies with a revision change or a revoke, and is no use for another link or a forged value', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f2', 'bob', 'acme', CONTENT)
      const first = yield* share({ password: 'correct horse' })
      const other = yield* createShareLink(caller('bob'), { workspaceId: 'acme', fileId: 'f2', level: 'download', password: 'other pass 123' })
      const cookie = cookieOf((yield* verifyLinkPassword(visitor(), { token: first.token, password: 'correct horse' })).setCookie)
      assert.strictEqual((yield* resolveShareLink(visitor(cookie), first.token)).kind, 'file')
      assert.deepStrictEqual(yield* resolveShareLink(visitor(cookie), tokenOf(other.url)), { kind: 'password' })
      const [name, value] = cookie.split('=')
      const forged = `${name}=${(value ?? '').replace(/\.[^.]+$/, '.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')}`
      assert.deepStrictEqual(yield* resolveShareLink(visitor(forged), first.token), { kind: 'password' })

      yield* updateShareLink(caller('bob'), { ...ids, level: 'view' })
      assert.deepStrictEqual(yield* resolveShareLink(visitor(cookie), first.token), { kind: 'password' }, 'revision moved on')
      const fresh = cookieOf((yield* verifyLinkPassword(visitor(), { token: first.token, password: 'correct horse' })).setCookie)
      assert.strictEqual((yield* resolveShareLink(visitor(fresh), first.token)).kind, 'file')
      yield* updateShareLink(caller('bob'), { ...ids, password: 'a brand new pass' })
      assert.deepStrictEqual(yield* resolveShareLink(visitor(fresh), first.token), { kind: 'password' }, 'password change')
      yield* revokeShareLink(caller('bob'), ids)
      assert.strictEqual((yield* failure(resolveShareLink(visitor(fresh), first.token)))._tag, 'LinkUnavailable')
      assert.strictEqual((yield* failure(verifyLinkPassword(visitor(), { token: first.token, password: 'a brand new pass' })))._tag, 'LinkUnavailable')
    })),
  )

  it.effect('a link without a password needs no cookie', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share()
      assert.deepStrictEqual(yield* verifyLinkPassword(visitor(), { token, password: 'anything' }), { setCookie: null, expiresAt: null })
    })),
  )

  it.effect('a wrong password is audited with the IP in the security log only, then Turnstile joins after three failures', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token, linkId } = yield* share({ password: 'correct horse' })
      const wrong = (turnstileToken?: string, ip = '198.51.100.5') =>
        verifyLinkPassword(visitor(null, ip), { token, password: 'nope nope nope', ...(turnstileToken === undefined ? {} : { turnstileToken }) }).pipe(Effect.flip)
      const first = yield* wrong()
      assert.deepStrictEqual([first._tag, 'captchaRequired' in first ? first.captchaRequired : null], ['LinkPasswordInvalid', false])
      const second = yield* wrong()
      assert.strictEqual('captchaRequired' in second && second.captchaRequired, false)
      const third = yield* wrong()
      assert.strictEqual('captchaRequired' in third && third.captchaRequired, true, 'the next try needs Turnstile')

      const denied = (yield* accessRows).filter((l) => l.outcome === 'denied')
      assert.strictEqual(denied.length, 3)
      assert.deepStrictEqual([denied[0]?.action, denied[0]?.actorKind, denied[0]?.linkId, denied[0]?.actorUserId, denied[0]?.reason], ['link.password_failed', 'link', linkId, null, 'password'])
      assert.notInclude(JSON.stringify(yield* accessRows), '198.51.100.5')
      const failed = (yield* linkRows('securityLog')).filter((l) => l.event === 'link_password_failed')
      assert.deepStrictEqual(failed.map((l) => [l.ip, l.targetId, l.userAgent]), Array(3).fill(['198.51.100.5', linkId, 'Mozilla/5.0 (iPhone)']))

      // The fourth try without a Turnstile token is refused before any hashing; a rejected token too.
      const noToken = yield* wrong()
      assert.deepStrictEqual([noToken._tag, 'reason' in noToken ? noToken.reason : ''], ['CaptchaFailed', 'required'])
      const rejected = yield* wrong('fail')
      assert.deepStrictEqual([rejected._tag, 'reason' in rejected ? rejected.reason : ''], ['CaptchaFailed', 'test-rejected'])
      assert.strictEqual((yield* accessRows).filter((l) => l.outcome === 'denied').length, 3, 'refused tries are not password failures')
      // With a token the password is checked again, and the right one gets in.
      const again = yield* wrong('ok')
      assert.strictEqual(again._tag, 'LinkPasswordInvalid')
      const ok = yield* verifyLinkPassword(visitor(), { token, password: 'correct horse', turnstileToken: 'ok' })
      assert.isNotNull(ok.setCookie)
    })),
  )

  it.effect('failures from other visitors count towards the link: ten of them put Turnstile in front of everyone', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ password: 'correct horse' })
      for (let i = 0; i < 10; i++) {
        const error = yield* verifyLinkPassword(visitor(null, `192.0.2.${i + 1}`), { token, password: 'guess guess guess' }).pipe(Effect.flip)
        assert.strictEqual(error._tag, 'LinkPasswordInvalid')
      }
      const latecomer = yield* verifyLinkPassword(visitor(null, '192.0.2.200'), { token, password: 'correct horse' }).pipe(Effect.flip)
      assert.deepStrictEqual([latecomer._tag, 'reason' in latecomer ? latecomer.reason : ''], ['CaptchaFailed', 'required'])
    })),
  )

  it.effect('failures older than 15 minutes no longer count', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ password: 'correct horse' })
      for (let i = 0; i < 3; i++) yield* verifyLinkPassword(visitor(), { token, password: 'guess guess guess' }).pipe(Effect.flip)
      yield* TestClock.adjust('16 minutes')
      assert.isNotNull((yield* verifyLinkPassword(visitor(), { token, password: 'correct horse' })).setCookie)
    })),
  )

  it.effect('the password rate limit is per visitor and link, so a stranger cannot lock the recipient out', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ password: 'correct horse' })
      let blocked = false
      for (let i = 0; i < 14 && !blocked; i++) {
        const error = yield* verifyLinkPassword(visitor(), { token, password: 'guess guess guess', turnstileToken: 'ok' }).pipe(Effect.flip)
        blocked = error._tag === 'RateLimitExceeded'
      }
      assert.isTrue(blocked)
      assert.isNotNull((yield* verifyLinkPassword(visitor(null, '203.0.113.77'), { token, password: 'correct horse', turnstileToken: 'ok' })).setCookie)
    })),
  )

  it.effect('a per-link counter bounds guesses from many addresses, before any hashing', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ password: 'correct horse' })
      for (let i = 0; i < 30; i++) {
        const error = yield* verifyLinkPassword(visitor(null, `192.0.2.${i + 1}`), { token, password: 'guess guess guess', turnstileToken: 'ok' }).pipe(Effect.flip)
        assert.strictEqual(error._tag, 'LinkPasswordInvalid', `try ${i + 1}`)
      }
      const denied = (yield* accessRows).length
      const over = yield* verifyLinkPassword(visitor(null, '203.0.113.200'), { token, password: 'correct horse', turnstileToken: 'ok' }).pipe(Effect.flip)
      assert.strictEqual(over._tag, 'RateLimitExceeded')
      assert.strictEqual((yield* accessRows).length, denied, 'nothing was hashed or audited')
      yield* TestClock.adjust('16 minutes')
      assert.isNotNull((yield* verifyLinkPassword(visitor(null, '203.0.113.200'), { token, password: 'correct horse', turnstileToken: 'ok' })).setCookie)
    })),
  )

  it.effect('refuses malformed input before any lookup', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ password: 'correct horse' })
      assert.strictEqual((yield* failure(verifyLinkPassword(visitor(), { token: 'nope', password: 'x' })))._tag, 'LinkUnavailable')
      assert.strictEqual((yield* failure(verifyLinkPassword(visitor(), { token, password: '' })))._tag, 'ValidationError')
      assert.strictEqual((yield* failure(verifyLinkPassword(visitor(), { token, password: 'x'.repeat(129) })))._tag, 'ValidationError')
    })),
  )
})

describe('deliverLinkModel', () => {
  it.effect('same bytes and headers as content, audited as a preview with no security event', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token, linkId } = yield* share()
      const delivery = yield* deliverLinkModel(visitor(), token, null)
      assert.strictEqual(delivery.status, 200)
      assert.deepStrictEqual(delivery.headers, (yield* deliverLinkContent(visitor(), token, null)).headers)
      assert.strictEqual(yield* bodyText(delivery), CONTENT)
      const access = yield* accessRows
      assert.deepStrictEqual(access.map((r) => [r.action, r.linkId]).sort(), [['file.downloaded', linkId], ['file.previewed', linkId]])
      assert.deepStrictEqual((yield* linkRows('securityLog')).map((r) => r.event), ['file_downloaded'], 'only the content request')
      assert.strictEqual((yield* deliverLinkModel(visitor(), token, 'bytes=4-9')).status, 206)
    })),
  )

  it.effect('D23: a view link previews the GLB of a STEP (never its source) and an STL itself; a password link needs its proof', () =>
    run(Effect.gen(function* () {
      yield* world
      const view = yield* share({ level: 'view' })
      assert.strictEqual((yield* failure(deliverLinkModel(visitor(), view.token, null)))._tag, 'PreviewUnavailable', 'no derivative: nothing for a view link')
      const card = yield* resolveShareLink(visitor(), view.token)
      assert.deepStrictEqual(card.kind === 'file' ? card.file.model : null, { kind: 'none', bytes: null, derivative: null, maxConvertBytes: 50 * 1024 * 1024 })

      const bytes = glb()
      const key = yield* seedDerivative('f1', 'acme', bytes)
      const delivery = yield* deliverLinkModel(visitor(), view.token, null)
      assert.strictEqual(delivery.status, 200)
      assert.strictEqual(delivery.headers['content-type'], 'model/gltf-binary')
      assert.strictEqual(delivery.headers['referrer-policy'], 'no-referrer')
      assert.deepStrictEqual(new Uint8Array(yield* Effect.promise(() => new Response(delivery.body as BodyInit).arrayBuffer())), bytes)
      const opened = yield* resolveShareLink(visitor(), view.token)
      assert.deepStrictEqual(opened.kind === 'file' ? opened.file.model : null, { kind: 'derivative', bytes: bytes.byteLength, derivative: { state: 'ready', code: null, parts: 1 }, maxConvertBytes: 50 * 1024 * 1024 })
      assert.notInclude(JSON.stringify(opened), key)
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), view.token, null)))._tag, 'PermissionDenied', 'content still needs download')
      const previews = (yield* accessRows).filter((r) => r.action === 'file.previewed')
      assert.deepStrictEqual(previews.map((r) => [r.actorKind, r.outcome]), [['link', 'allowed']])
      assert.strictEqual((yield* linkRows('securityLog')).filter((r) => r.event === 'file_downloaded').length, 0)

      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ extension: 'stl', name: 'Bracket.stl' }).where(eq(schema.files.id, 'f1'))))
      const mesh = yield* deliverLinkModel(visitor(), view.token, null)
      assert.deepStrictEqual([mesh.status, mesh.headers['content-type']], [200, 'application/octet-stream'])

      yield* revokeShareLink(caller('bob'), ids)
      const secret = yield* share({ password: 'correct horse' })
      assert.strictEqual((yield* failure(deliverLinkModel(visitor(), secret.token, null)))._tag, 'LinkPasswordRequired')
    })),
  )

  it.effect('a download link without a derivative gets the STEP source (the page converts in place)', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ level: 'download' })
      const delivery = yield* deliverLinkModel(visitor(), token, null)
      assert.deepStrictEqual([delivery.status, delivery.headers['content-type']], [200, 'application/octet-stream'])
      assert.strictEqual(yield* bodyText(delivery), CONTENT)
    })),
  )
})

describe('deliverLinkContent', () => {
  it.effect('serves the current bytes with the safe headers, no referrer, and audits the download', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token, linkId } = yield* share()
      const delivery = yield* deliverLinkContent(visitor(), token, null)
      assert.strictEqual(delivery.status, 200)
      assert.deepStrictEqual(delivery.headers, {
        'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox', 'cache-control': 'private, no-store',
        'cross-origin-resource-policy': 'same-origin', 'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="Bracket.step"; filename*=UTF-8''Bracket.step`, 'accept-ranges': 'bytes',
        'content-length': String(CONTENT.length), 'referrer-policy': 'no-referrer',
      })
      assert.strictEqual(yield* bodyText(delivery), CONTENT)
      const [access] = yield* accessRows
      assert.deepStrictEqual([access?.action, access?.actorKind, access?.linkId, access?.actorUserId, access?.outcome], ['file.downloaded', 'link', linkId, null, 'allowed'])
      const [security] = yield* linkRows('securityLog')
      assert.deepStrictEqual([security?.event, security?.userId, security?.ip, security?.targetId], ['file_downloaded', null, '198.51.100.5', 'f1'])
      yield* deliverLinkContent(visitor(), token, 'bytes=0-9')
      assert.strictEqual((yield* accessRows).length, 1)
    })),
  )

  it.effect('two addresses in one window: one access row, two security rows (one per IP)', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share()
      yield* deliverLinkContent(visitor(), token, null)
      yield* deliverLinkContent(visitor(null, '203.0.113.9'), token, null)
      yield* deliverLinkContent(visitor(), token, 'bytes=0-9')
      assert.strictEqual((yield* accessRows).length, 1)
      const security = yield* linkRows('securityLog')
      assert.deepStrictEqual(security.map((r) => r.ip).sort(), ['198.51.100.5', '203.0.113.9'])
    })),
  )

  it.effect('Range answers 206 with the same headers', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share()
      const part = yield* deliverLinkContent(visitor(), token, 'bytes=4-9')
      assert.strictEqual(part.status, 206)
      assert.strictEqual(part.headers['content-range'], `bytes 4-9/${CONTENT.length}`)
      assert.strictEqual(part.headers['referrer-policy'], 'no-referrer')
      assert.strictEqual(part.headers['content-security-policy'], 'sandbox')
      assert.strictEqual(yield* bodyText(part), CONTENT.slice(4, 10))
      assert.strictEqual((yield* deliverLinkContent(visitor(), token, `bytes=${CONTENT.length}-`)).status, 416)
    })),
  )

  it.effect('a view link opens no content (403) and a download link needs its password proof (401)', () =>
    run(Effect.gen(function* () {
      yield* world
      const view = yield* share({ level: 'view' })
      const denied = yield* failure(deliverLinkContent(visitor(), view.token, null))
      assert.deepStrictEqual([denied._tag, 'reason' in denied ? denied.reason : ''], ['PermissionDenied', 'INSUFFICIENT_LEVEL'])
      assert.strictEqual((yield* accessRows).length, 0)
      yield* revokeShareLink(caller('bob'), ids)

      const secret = yield* share({ password: 'correct horse' })
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), secret.token, null)))._tag, 'LinkPasswordRequired')
      assert.strictEqual((yield* accessRows).length, 0)
      const cookie = cookieOf((yield* verifyLinkPassword(visitor(), { token: secret.token, password: 'correct horse' })).setCookie)
      assert.strictEqual((yield* deliverLinkContent(visitor(cookie), secret.token, null)).status, 200)
      yield* updateShareLink(caller('bob'), { ...ids, expiresAt: T0 + 7200 })
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(cookie), secret.token, null)))._tag, 'LinkPasswordRequired')
    })),
  )

  it.effect('revoked, expired, trashed and unknown links deliver nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ expiresAt: T0 + 60 })
      yield* TestClock.adjust('2 minutes')
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), token, null)))._tag, 'LinkExpired')
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), 'q'.repeat(43), null)))._tag, 'LinkUnavailable')
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), 'short', null)))._tag, 'LinkUnavailable')
      yield* revokeShareLink(caller('bob'), ids)
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), token, null)))._tag, 'LinkUnavailable')
      const fresh = yield* share()
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ isDeleted: true }).where(eq(schema.files.id, 'f1'))))
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), fresh.token, null)))._tag, 'LinkUnavailable')
    })),
  )

  it.effect('a changed object is refused and audited as an integrity failure', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token, linkId } = yield* share()
      const key = (yield* rows('files'))[0]?.r2Key ?? ''
      yield* (yield* Storage).put(key, 'x'.repeat(CONTENT.length))
      assert.strictEqual((yield* failure(deliverLinkContent(visitor(), token, null)))._tag, 'ContentIntegrity')
      const denied = (yield* accessRows).filter((l) => l.outcome === 'denied')
      assert.deepStrictEqual(denied.map((l) => [l.action, l.reason, l.linkId]), [['file.downloaded', 'integrity', linkId]])
    })),
  )

  it.effect('never uses a presigned download', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share()
      yield* deliverLinkContent(visitor(), token, null)
      assert.notInclude(yield* (yield* MemoryStorageControl).calls, 'presignDownload')
    })),
  )
})

describe('deliverLinkThumbnail', () => {
  it.effect('a view link serves the thumbnail as a fixed image type and audits the preview', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ level: 'view' })
      assert.strictEqual((yield* failure(deliverLinkThumbnail(visitor(), token)))._tag, 'PreviewUnavailable')
      yield* (yield* Storage).put('w/acme/f/f1/t.thumb', png(), { contentType: 'text/html' })
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ thumbnailR2Key: 'w/acme/f/f1/t.thumb' }).where(eq(schema.files.id, 'f1'))))
      const delivery = yield* deliverLinkThumbnail(visitor(), token)
      assert.deepStrictEqual([delivery.status, delivery.headers['content-type'], delivery.headers['referrer-policy'], delivery.headers['content-security-policy']], [200, 'image/png', 'no-referrer', 'sandbox'])
      const [access] = yield* accessRows
      assert.deepStrictEqual([access?.action, access?.actorKind], ['file.previewed', 'link'])
      assert.strictEqual((yield* linkRows('securityLog')).length, 0)
    })),
  )

  it.effect('a password link needs its proof for the thumbnail too', () =>
    run(Effect.gen(function* () {
      yield* world
      const { token } = yield* share({ level: 'view', password: 'correct horse' })
      assert.strictEqual((yield* failure(deliverLinkThumbnail(visitor(), token)))._tag, 'LinkPasswordRequired')
    })),
  )
})
