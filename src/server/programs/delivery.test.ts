import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { MemoryStorageControl, Storage } from '../services/Storage'
import { png, webpX } from '../testing/images'
import { caller, programLayer, rows, seedFile, seedFileGrant, seedMember, seedStoredFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { deliverContent, deliverThumbnail, type Delivery, putThumbnail } from './delivery'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) => TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(defaultPlan)))

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedWorkspace('beta', 'zed')
})

const bytesOf = (delivery: Delivery) => Effect.promise(async () => new Uint8Array(await new Response(delivery.body as BodyInit | null).arrayBuffer()))
const text = (delivery: Delivery) => bytesOf(delivery).pipe(Effect.map((b) => new TextDecoder().decode(b)))
const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.flip(effect)
const updateFile = (id: string, set: Partial<typeof schema.files.$inferInsert>) =>
  Db.use((db) => db.use((d) => d.update(schema.files).set(set).where(eq(schema.files.id, id))))

const CONTENT = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const content = (as: string, fileId: string, extra: { version?: string; range?: string | null } = {}, overrides = {}) =>
  deliverContent(caller(as, overrides), { fileId, version: extra.version ?? 'current', range: extra.range ?? null })

describe('deliverContent', () => {
  it.effect('streams the object with the safe headers, after an audit row without IP', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT, { name: 'Bracket çizim.step' })
      const delivery = yield* content('max', 'f1', {}, { ip: '203.0.113.9', userAgent: 'Mozilla/5.0 test' })
      assert.strictEqual(delivery.status, 200)
      assert.deepStrictEqual(delivery.headers, {
        'x-content-type-options': 'nosniff',
        'content-security-policy': 'sandbox',
        'cache-control': 'private, no-store',
        'cross-origin-resource-policy': 'same-origin',
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="Bracket _izim.step"; filename*=UTF-8''Bracket%20%C3%A7izim.step`,
        'accept-ranges': 'bytes',
        'content-length': String(CONTENT.length),
      })
      assert.strictEqual(yield* text(delivery), CONTENT)

      const [access] = yield* rows('accessLog')
      assert.strictEqual(rowsOf(yield* rows('accessLog')), 1)
      assert.match(access?.id ?? '', /^[0-9a-f]{64}$/)
      assert.deepStrictEqual(
        { ...access, id: '<hmac>', createdAt: access?.createdAt.getTime() },
        { id: '<hmac>', workspaceId: 'acme', actorKind: 'user', actorUserId: 'max', linkId: null, targetKind: 'file', targetId: 'f1', action: 'file.downloaded', outcome: 'allowed', requestId: 'ray-test', createdAt: T0 * 1000, reason: null },
      )
      const [security] = yield* rows('securityLog')
      assert.deepStrictEqual(
        { ...security, id: '<hmac>', createdAt: security?.createdAt.getTime() },
        { id: '<hmac>', createdAt: T0 * 1000, event: 'file_downloaded', userId: 'max', workspaceId: 'acme', targetId: 'f1', ip: '203.0.113.9', userAgent: 'Mozilla/5.0 test', requestId: 'ray-test' },
      )
      assert.notInclude(JSON.stringify(yield* rows('accessLog')), '203.0.113.9')
    })),
  )

  it.effect('truncates the user agent to 256 characters before it is stored', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* content('bob', 'f1', {}, { userAgent: `${'ç'.repeat(300)}` })
      const [security] = yield* rows('securityLog')
      assert.strictEqual(Array.from(security?.userAgent ?? '').length, 256)
    })),
  )

  it.effect('one audit pair per ten minutes however many requests and ranges; a new window writes again', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* content('max', 'f1')
      yield* content('max', 'f1', { range: 'bytes=0-9' })
      yield* content('max', 'f1', { range: 'bytes=10-' })
      yield* content('ada', 'f1')
      assert.strictEqual(rowsOf(yield* rows('accessLog')), 2, 'max once, ada once')
      assert.strictEqual(rowsOf(yield* rows('securityLog')), 2)
      yield* TestClock.adjust('11 minutes')
      yield* content('max', 'f1')
      assert.strictEqual(rowsOf(yield* rows('accessLog')), 3)
    })),
  )

  it.effect('Range answers 206 with Content-Range and the slice; an unsatisfiable range 416; a bad header the whole file', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      const part = yield* content('max', 'f1', { range: 'bytes=4-9' })
      assert.strictEqual(part.status, 206)
      assert.strictEqual(part.headers['content-range'], `bytes 4-9/${CONTENT.length}`)
      assert.strictEqual(part.headers['content-length'], '6')
      assert.strictEqual(part.headers['content-security-policy'], 'sandbox')
      assert.strictEqual(part.headers['x-content-type-options'], 'nosniff')
      assert.strictEqual(yield* text(part), CONTENT.slice(4, 10))
      const tail = yield* content('max', 'f1', { range: 'bytes=-5' })
      assert.strictEqual(yield* text(tail), CONTENT.slice(-5))
      const past = yield* content('max', 'f1', { range: `bytes=${CONTENT.length}-` })
      assert.strictEqual(past.status, 416)
      assert.strictEqual(past.headers['content-range'], `bytes */${CONTENT.length}`)
      assert.isNull(past.body)
      const ignored = yield* content('max', 'f1', { range: 'bytes=0-1,4-5' })
      assert.strictEqual(ignored.status, 200)
      assert.strictEqual(yield* text(ignored), CONTENT)
    })),
  )

  it.effect('refuses delivery when the object changed: ETag, size, or gone; the refusal is audited, the object is not sent', () =>
    run(Effect.gen(function* () {
      yield* world
      const stored = yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      const storage = yield* Storage
      yield* storage.put(stored.key, 'tampered bytes of another length')
      assert.strictEqual((yield* failure(content('max', 'f1')))._tag, 'ContentIntegrity')
      yield* storage.put(stored.key, 'x'.repeat(CONTENT.length))
      assert.strictEqual((yield* failure(content('max', 'f1', { range: 'bytes=0-3' })))._tag, 'ContentIntegrity', 'same size, other ETag')
      yield* storage.delete([stored.key])
      assert.strictEqual((yield* failure(content('max', 'f1')))._tag, 'ContentIntegrity')
      const denied = (yield* rows('accessLog')).filter((r) => r.outcome === 'denied')
      assert.strictEqual(denied.length, 3)
      assert.deepStrictEqual([...new Set(denied.map((r) => `${r.action}:${r.reason}:${r.actorUserId}`))], ['file.downloaded:integrity:max'])
    })),
  )

  it.effect('a legacy object (no recorded ETag) is checked by size alone', () =>
    run(Effect.gen(function* () {
      yield* world
      const stored = yield* seedStoredFile('f1', 'bob', 'acme', CONTENT, { legacy: true })
      assert.strictEqual(yield* text(yield* content('max', 'f1')), CONTENT)
      yield* (yield* Storage).put(stored.key, 'swapped but same?'.padEnd(CONTENT.length, '.'))
      assert.strictEqual(yield* text(yield* content('max', 'f1')), 'swapped but same?'.padEnd(CONTENT.length, '.'), 'same size passes without an ETag')
      yield* (yield* Storage).put(stored.key, 'short')
      assert.strictEqual((yield* failure(content('max', 'f1')))._tag, 'ContentIntegrity')
    })),
  )

  it.effect('who may download: members and download guests; never commenters, view guests, outsiders, the trashed or the pending', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedUser('out')
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      for (const who of ['bob', 'ada', 'max']) assert.strictEqual((yield* content(who, 'f1')).status, 200, who)
      assert.strictEqual((yield* failure(content('cat', 'f1')))._tag, 'PermissionDenied')
      assert.strictEqual((yield* failure(content('eve', 'f1')))._tag, 'ResourceUnavailable', 'a guest without a grant sees nothing')
      yield* seedFileGrant('f1', 'eve', 'acme', 'view')
      const viewOnly = yield* failure(content('eve', 'f1'))
      assert.deepStrictEqual([viewOnly._tag, 'reason' in viewOnly ? viewOnly.reason : ''], ['PermissionDenied', 'INSUFFICIENT_LEVEL'])
      yield* Db.use((db) => db.use((d) => d.update(schema.fileAccess).set({ level: 'download' }).where(eq(schema.fileAccess.userId, 'eve'))))
      assert.strictEqual((yield* content('eve', 'f1')).status, 200)
      assert.strictEqual((yield* failure(content('out', 'f1')))._tag, 'WorkspaceUnavailable')
      assert.strictEqual((yield* failure(content('zed', 'f1')))._tag, 'WorkspaceUnavailable', 'another workspace owner')
      assert.strictEqual((yield* failure(content('bob', 'nope')))._tag, 'ResourceUnavailable')
      yield* updateFile('f1', { isDeleted: true })
      assert.strictEqual((yield* failure(content('bob', 'f1')))._tag, 'ResourceUnavailable')
      yield* updateFile('f1', { isDeleted: false, status: 'pending' })
      assert.strictEqual((yield* failure(content('bob', 'f1')))._tag, 'ResourceUnavailable')
    })),
  )

  it.effect('a guest grant that expired no longer downloads', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* seedFileGrant('f1', 'eve', 'acme', 'download', T0 + 3600)
      assert.strictEqual((yield* content('eve', 'f1')).status, 200)
      yield* TestClock.adjust('2 hours')
      assert.isTrue(['PermissionDenied', 'ResourceUnavailable'].includes((yield* failure(content('eve', 'f1')))._tag))
    })),
  )

  it.effect('older versions: members with history access get them, guests never; a foreign version id is unavailable', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* seedStoredFile('f2', 'bob', 'acme', 'other file')
      const old = yield* (yield* Storage).put('w/acme/f/f1/old-version', 'old bytes')
      const insert = (id: string, fileId: string, key: string, size: number, etag: string | null) =>
        Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values({
          id, fileId, versionNumber: 1, r2Key: key, size, uploadedByUserId: 'bob', createdAt: new Date(T0 * 1000), contentEtag: etag,
        })))
      yield* insert('v1', 'f1', old.key, old.size, old.etag)
      yield* insert('vx', 'f2', old.key, old.size, old.etag)
      assert.strictEqual(yield* text(yield* content('max', 'f1', { version: 'v1' })), 'old bytes')
      assert.strictEqual((yield* failure(content('max', 'f1', { version: 'vx' })))._tag, 'VersionUnavailable')
      assert.strictEqual((yield* failure(content('max', 'f1', { version: 'missing' })))._tag, 'VersionUnavailable')
      yield* seedFileGrant('f1', 'eve', 'acme', 'download')
      assert.strictEqual((yield* content('eve', 'f1')).status, 200)
      assert.isTrue(['PermissionDenied', 'ResourceUnavailable'].includes((yield* failure(content('eve', 'f1', { version: 'v1' })))._tag))
    })),
  )

  it.effect('never asks storage for a presigned download', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* content('max', 'f1')
      assert.notInclude(yield* (yield* MemoryStorageControl).calls, 'presignDownload')
    })),
  )
})

const rowsOf = (list: ReadonlyArray<unknown>) => list.length

const thumbnailFor = (fileId: string, bytes: Uint8Array | string, key = `w/acme/f/${fileId}/thumb-${fileId}.thumb`) =>
  Effect.gen(function* () {
    yield* (yield* Storage).put(key, bytes, { contentType: 'text/html' })
    yield* updateFile(fileId, { thumbnailR2Key: key })
    return key
  })

describe('deliverThumbnail', () => {
  const thumb = (as: string, fileId: string, version = 'current') => deliverThumbnail(caller(as), { fileId, version })

  it.effect('serves a PNG or WebP with a fixed image type and the safe headers, whatever the stored content type says', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* thumbnailFor('f1', png())
      const delivery = yield* thumb('max', 'f1')
      assert.deepStrictEqual(delivery.headers, {
        'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox', 'cache-control': 'private, no-store',
        'cross-origin-resource-policy': 'same-origin', 'content-type': 'image/png', 'content-length': String(png().length),
      })
      assert.deepStrictEqual([...(yield* bytesOf(delivery))], [...png()])
      yield* thumbnailFor('f1', webpX())
      assert.strictEqual((yield* thumb('max', 'f1')).headers['content-type'], 'image/webp')
      assert.strictEqual(rowsOf(yield* rows('accessLog')), 0, 'members thumbnails are not audited')
    })),
  )

  it.effect('refuses anything that is not a PNG or WebP, or is over 1 MiB, or is missing', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      assert.strictEqual((yield* failure(thumb('max', 'f1')))._tag, 'PreviewUnavailable', 'no thumbnail recorded')
      yield* thumbnailFor('f1', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
      assert.strictEqual((yield* failure(thumb('max', 'f1')))._tag, 'PreviewUnavailable')
      yield* thumbnailFor('f1', '<html><script>alert(1)</script></html>')
      assert.strictEqual((yield* failure(thumb('max', 'f1')))._tag, 'PreviewUnavailable')
      yield* thumbnailFor('f1', Uint8Array.from([...png(), ...new Uint8Array(1024 * 1024)]))
      assert.strictEqual((yield* failure(thumb('max', 'f1')))._tag, 'PreviewUnavailable')
      yield* updateFile('f1', { thumbnailR2Key: 'w/acme/f/f1/gone.thumb' })
      assert.strictEqual((yield* failure(thumb('max', 'f1')))._tag, 'PreviewUnavailable')
    })),
  )

  it.effect('a view-level guest gets the thumbnail (audited), not the content; a commenter and an outsider follow permissions', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* thumbnailFor('f1', png())
      assert.strictEqual((yield* failure(thumb('eve', 'f1')))._tag, 'ResourceUnavailable')
      yield* seedFileGrant('f1', 'eve', 'acme', 'view')
      assert.strictEqual((yield* thumb('eve', 'f1')).status, 200)
      assert.strictEqual((yield* failure(content('eve', 'f1')))._tag, 'PermissionDenied')
      const [access] = yield* rows('accessLog')
      assert.deepStrictEqual([access?.action, access?.actorUserId, access?.outcome], ['file.previewed', 'eve', 'allowed'])
      assert.strictEqual(rowsOf(yield* rows('securityLog')), 0, 'previews are not security events')
      assert.strictEqual((yield* thumb('cat', 'f1')).status, 200)
      yield* seedUser('out')
      assert.strictEqual((yield* failure(thumb('out', 'f1')))._tag, 'WorkspaceUnavailable')
    })),
  )

  it.effect('an older version has its own thumbnail and needs history access', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      const key = yield* thumbnailFor('f1', png(), 'w/acme/f/f1/v1.thumb')
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values({
        id: 'v1', fileId: 'f1', versionNumber: 1, r2Key: 'x', size: 1, uploadedByUserId: 'bob', createdAt: new Date(T0 * 1000), thumbnailR2Key: key,
      })))
      yield* updateFile('f1', { thumbnailR2Key: null })
      assert.strictEqual((yield* failure(thumb('max', 'f1')))._tag, 'PreviewUnavailable')
      assert.strictEqual((yield* thumb('max', 'f1', 'v1')).status, 200)
      yield* seedFileGrant('f1', 'eve', 'acme', 'view')
      assert.isTrue(['PermissionDenied', 'ResourceUnavailable'].includes((yield* failure(thumb('eve', 'f1', 'v1')))._tag))
    })),
  )
})

describe('putThumbnail', () => {
  const put = (as: string, fileId: string, bytes: Uint8Array, contentType: string | null = 'image/png', version = 'current') =>
    putThumbnail(caller(as), { fileId, version, contentType, bytes })

  it.effect('stores a valid image under a new server-made key, points the file at it and queues the replaced one', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      const first = yield* put('ada', 'f1', png())
      assert.deepStrictEqual(first, { thumbnailAvailable: true })
      const [file] = yield* rows('files')
      assert.match(file?.thumbnailR2Key ?? '', /^w\/acme\/f\/f1\/[0-9A-Z]{26}\.thumb$/)
      const stored = Option_get(yield* (yield* Storage).head(file?.thumbnailR2Key ?? ''))
      assert.strictEqual(stored.contentType, 'image/png')
      assert.strictEqual(rowsOf(yield* rows('storageDeletions')), 0)

      const firstKey = file?.thumbnailR2Key ?? ''
      yield* put('bob', 'f1', webpX(), 'image/webp')
      const [after] = yield* rows('files')
      assert.notStrictEqual(after?.thumbnailR2Key, firstKey)
      assert.deepStrictEqual((yield* rows('storageDeletions')).map((r) => r.key), [firstKey])
      assert.strictEqual((yield* thumbnailGet('max', 'f1')).headers['content-type'], 'image/webp')
    })),
  )

  it.effect('refuses wrong, broken or oversize images and the wrong people, and stores nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      const before = yield* (yield* MemoryStorageControl).keys
      assert.strictEqual((yield* failure(put('ada', 'f1', png(), 'image/webp')))._tag, 'InvalidThumbnail')
      assert.strictEqual((yield* failure(put('ada', 'f1', png(), null)))._tag, 'InvalidThumbnail')
      assert.strictEqual((yield* failure(put('ada', 'f1', new TextEncoder().encode('<svg/>'), 'image/svg+xml')))._tag, 'InvalidThumbnail')
      assert.strictEqual((yield* failure(put('ada', 'f1', png(2000, 2000))))._tag, 'InvalidThumbnail')
      assert.strictEqual((yield* failure(put('ada', 'f1', new Uint8Array(1024 * 1024 + 1))))._tag, 'InvalidThumbnail')
      assert.strictEqual((yield* failure(put('cat', 'f1', png())))._tag, 'PermissionDenied')
      assert.strictEqual((yield* failure(put('max', 'f1', png())))._tag, 'PermissionDenied', 'a member who is not the uploader cannot edit')
      assert.strictEqual((yield* failure(put('eve', 'f1', png())))._tag, 'ResourceUnavailable')
      assert.strictEqual((yield* failure(put('ada', 'f1', png(), 'image/png', 'v1')))._tag, 'ValidationError')
      assert.strictEqual((yield* failure(put('zed', 'f1', png())))._tag, 'WorkspaceUnavailable')
      assert.deepStrictEqual(yield* (yield* MemoryStorageControl).keys, before)
      const [file] = yield* rows('files')
      assert.isNull(file?.thumbnailR2Key)
    })),
  )

  it.effect('a trashed file takes no thumbnail', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      yield* updateFile('f1', { isDeleted: true })
      assert.strictEqual((yield* failure(put('bob', 'f1', png())))._tag, 'ResourceUnavailable')
    })),
  )

  it.effect('the rate limit stops a flood (fails closed when counters are unreachable is covered by RateLimit)', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT)
      let blocked = 0
      for (let i = 0; i < 125; i++) {
        const result = yield* put('bob', 'f1', png()).pipe(Effect.result)
        if (result._tag === 'Failure' && result.failure._tag === 'RateLimitExceeded') blocked++
      }
      assert.isAbove(blocked, 0)
    })),
  )
})

const thumbnailGet = (as: string, fileId: string) => deliverThumbnail(caller(as), { fileId, version: 'current' })
const Option_get = <A>(o: import('effect').Option.Option<A>) => {
  if (o._tag !== 'Some') throw new Error('expected Some')
  return o.value
}

// Silences the unused import when only some helpers are needed.
void seedFile
