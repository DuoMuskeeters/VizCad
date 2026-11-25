import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Option } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { defaultPlan, type WorkspaceLimits } from '../services/Entitlements'
import { tokenDigest, verifyPassword } from '../shareCrypto'
import { caller, programLayer, rows, seedFile, seedLink, seedMember, seedProject, seedUploaderGrant, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { copyShareLink, createShareLink, getShareSettings, revokeShareLink, updateShareLink } from './links'

const runWith = (limits: WorkspaceLimits) => <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits)))
const run = runWith(defaultPlan)

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedWorkspace('beta', 'zed')
  yield* seedFile('f1', 'bob', 'acme')
})

const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.flip(effect)
const ids = { workspaceId: 'acme', fileId: 'f1' }
const tokenOf = (url: string) => url.slice('https://vizcad.test/s/'.length)

describe('createShareLink', () => {
  it.effect('stores a digest and ciphertext, never the token or the password, and returns the URL once', () =>
    run(Effect.gen(function* () {
      yield* world
      const made = yield* createShareLink(caller('bob'), { ...ids, level: 'download', expiresAt: T0 + 86400, password: 'hunter2hunter2' })
      assert.match(made.url, /^https:\/\/vizcad\.test\/s\/[A-Za-z0-9_-]{43}$/)
      assert.deepStrictEqual(Object.keys(made.link).sort(), ['createdAt', 'expired', 'expiresAt', 'hasPassword', 'id', 'legacy', 'level', 'updatedAt'])
      assert.deepStrictEqual(
        { ...made.link, id: '<id>' },
        { id: '<id>', level: 'download', expiresAt: T0 + 86400, hasPassword: true, createdAt: T0, updatedAt: T0, legacy: false, expired: false },
      )
      const token = tokenOf(made.url)
      const [row] = yield* rows('shareLinks')
      assert.strictEqual(row?.tokenDigest, yield* tokenDigest(token))
      assert.strictEqual(row?.tokenKeyVersion, 2)
      assert.strictEqual(row?.publicSharerLabel, 'Workspace acme')
      assert.strictEqual(row?.revision, 1)
      assert.isNull(row?.legacyMaxExpiresAt)
      assert.strictEqual(row?.createdByUserId, 'bob')
      assert.isTrue(yield* verifyPassword(row?.passwordHash ?? '', 'hunter2hunter2'))
      const stored = JSON.stringify(yield* rows('shareLinks'))
      for (const secret of [token, 'hunter2hunter2']) assert.notInclude(stored, secret)
      assert.notInclude(JSON.stringify(made.link), token)
      const [log] = yield* rows('accessLog')
      assert.deepStrictEqual([log?.action, log?.actorKind, log?.actorUserId, log?.targetId, log?.linkId], ['link.created', 'user', 'bob', 'f1', null])
    })),
  )

  it.effect('a personal workspace has no public label; the level is view or download only', () =>
    run(Effect.gen(function* () {
      yield* seedUser('pat')
      yield* seedWorkspace('pat-ws', 'pat', 'personal')
      yield* seedFile('pf', 'pat', 'pat-ws')
      yield* createShareLink(caller('pat'), { workspaceId: 'pat-ws', fileId: 'pf', level: 'view' })
      const [row] = yield* rows('shareLinks')
      assert.isNull(row?.publicSharerLabel)
      assert.isNull(row?.expiresAt)
    })),
  )

  it.effect('only people who may share the file: owner, admin, the uploader; not other members, commenters, guests or outsiders', () =>
    run(Effect.gen(function* () {
      yield* world
      assert.strictEqual((yield* failure(createShareLink(caller('max'), { ...ids, level: 'view' })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* failure(createShareLink(caller('cat'), { ...ids, level: 'view' })))._tag, 'PermissionDenied')
      assert.isTrue(['PermissionDenied', 'ResourceUnavailable'].includes((yield* failure(createShareLink(caller('eve'), { ...ids, level: 'view' })))._tag))
      assert.strictEqual((yield* failure(createShareLink(caller('zed'), { ...ids, level: 'view' })))._tag, 'WorkspaceUnavailable')
      assert.strictEqual((yield* rows('shareLinks')).length, 0)
      yield* createShareLink(caller('ada'), { ...ids, level: 'view' })
      yield* revokeShareLink(caller('ada'), ids)
      yield* seedUploaderGrant('f1', 'max', 'acme')
      yield* createShareLink(caller('max'), { ...ids, level: 'view' })
    })),
  )

  it.effect('a restricted project asks for its manager', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('p1', 'acme', 'bob', 'restricted', 'bob')
      yield* seedFile('f2', 'max', 'acme', 'p1')
      yield* seedUploaderGrant('f2', 'max', 'acme')
      const denied = yield* failure(createShareLink(caller('max'), { workspaceId: 'acme', fileId: 'f2', level: 'view' }))
      assert.deepStrictEqual([denied._tag, 'reason' in denied ? denied.reason : ''], ['PermissionDenied', 'PROJECT_MANAGER_REQUIRED'])
      yield* createShareLink(caller('bob'), { workspaceId: 'acme', fileId: 'f2', level: 'view' })
    })),
  )

  it.effect('one live link per file: a second create conflicts; an expired or legacy one is replaced in the same batch', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* createShareLink(caller('bob'), { ...ids, level: 'view', expiresAt: T0 + 600 })
      assert.strictEqual((yield* failure(createShareLink(caller('bob'), { ...ids, level: 'download' })))._tag, 'LinkConflict')
      yield* TestClock.adjust('11 minutes')
      yield* createShareLink(caller('bob'), { ...ids, level: 'download' })
      const links = yield* rows('shareLinks')
      assert.deepStrictEqual(links.map((l) => [l.level, l.revokedAt !== null, l.revision]), [['view', true, 2], ['download', false, 1]])

      yield* revokeShareLink(caller('bob'), ids)
      yield* seedLink('legacy', 'f1', 'acme', { expiresAt: T0 + 1000, legacyMaxExpiresAt: T0 + 2000 })
      yield* createShareLink(caller('bob'), { ...ids, level: 'view' })
      const after = yield* rows('shareLinks')
      assert.deepStrictEqual(after.filter((l) => l.revokedAt === null).map((l) => l.id === 'legacy'), [false])
    })),
  )

  it.effect('two simultaneous creates: one wins, the other is a conflict', () =>
    run(Effect.gen(function* () {
      yield* world
      const results = yield* Effect.all([
        createShareLink(caller('bob'), { ...ids, level: 'view' }).pipe(Effect.result),
        createShareLink(caller('ada'), { ...ids, level: 'download' }).pipe(Effect.result),
      ], { concurrency: 'unbounded' })
      assert.strictEqual(results.filter((r) => r._tag === 'Success').length, 1)
      assert.strictEqual((yield* rows('shareLinks')).filter((l) => l.revokedAt === null).length, 1)
    })),
  )

  it.effect('the plan caps live links and link lifetime', () =>
    runWith({ ...defaultPlan, activeShareLinks: 1, linkMaxLifetimeSeconds: 86400 })(Effect.gen(function* () {
      yield* world
      yield* seedFile('f2', 'bob', 'acme')
      assert.strictEqual((yield* failure(createShareLink(caller('bob'), { ...ids, level: 'view' })))._tag, 'AccessExpiryInvalid', 'no expiry under a ceiling')
      assert.strictEqual((yield* failure(createShareLink(caller('bob'), { ...ids, level: 'view', expiresAt: T0 + 86401 })))._tag, 'AccessExpiryInvalid')
      assert.strictEqual((yield* failure(createShareLink(caller('bob'), { ...ids, level: 'view', expiresAt: T0 })))._tag, 'AccessExpiryInvalid', 'not in the future')
      yield* createShareLink(caller('bob'), { ...ids, level: 'view', expiresAt: T0 + 86400 })
      assert.strictEqual((yield* failure(createShareLink(caller('bob'), { workspaceId: 'acme', fileId: 'f2', level: 'view', expiresAt: T0 + 60 })))._tag, 'ShareLinkLimitReached')
    })),
  )

  it.effect('extending an expired link revives it, so the plan cap applies again', () =>
    runWith({ ...defaultPlan, activeShareLinks: 1, linkMaxLifetimeSeconds: 86400 })(Effect.gen(function* () {
      yield* world
      yield* seedFile('f2', 'bob', 'acme')
      yield* createShareLink(caller('bob'), { ...ids, level: 'view', expiresAt: T0 + 60 })
      yield* TestClock.adjust('2 minutes')
      yield* createShareLink(caller('bob'), { workspaceId: 'acme', fileId: 'f2', level: 'view', expiresAt: T0 + 3600 })
      const before = yield* rows('shareLinks')
      assert.strictEqual((yield* failure(updateShareLink(caller('bob'), { ...ids, expiresAt: T0 + 600 })))._tag, 'ShareLinkLimitReached')
      assert.deepStrictEqual(yield* rows('shareLinks'), before, 'nothing written')
      // Still expired links can change other things, and a free slot lets the extension through.
      yield* revokeShareLink(caller('bob'), { workspaceId: 'acme', fileId: 'f2' })
      assert.strictEqual((yield* updateShareLink(caller('bob'), { ...ids, expiresAt: T0 + 600 })).links[0]?.expired, false)
    })),
  )

  it.effect('refuses short, long or control-character passwords and a trashed file', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const password of ['short', 'x'.repeat(129), 'bad\npassword!']) {
        assert.strictEqual((yield* failure(createShareLink(caller('bob'), { ...ids, level: 'view', password })))._tag, 'ValidationError', password)
      }
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ isDeleted: true }).where(eq(schema.files.id, 'f1'))))
      assert.strictEqual((yield* failure(createShareLink(caller('bob'), { ...ids, level: 'view' })))._tag, 'ResourceUnavailable')
      assert.strictEqual((yield* rows('shareLinks')).length, 0)
    })),
  )

  it.effect('fails with ConfigError when the share keys are not configured, and writes nothing', () =>
    TestClock.setTime(T0 * 1000).pipe(
      Effect.andThen(Effect.gen(function* () {
        yield* world
        assert.strictEqual((yield* failure(createShareLink(caller('bob'), { ...ids, level: 'view' })))._tag, 'ConfigError')
        assert.strictEqual((yield* rows('shareLinks')).length, 0)
      })),
      Effect.provide(programLayer(defaultPlan, { shareTokenKeys: Option.none() })),
    ),
  )
})

describe('getShareSettings, updateShareLink, revokeShareLink', () => {
  it.effect('settings list the active links; others cannot read them', () =>
    run(Effect.gen(function* () {
      yield* world
      assert.deepStrictEqual((yield* getShareSettings(caller('bob'), ids)).links, [])
      const made = yield* createShareLink(caller('bob'), { ...ids, level: 'view' })
      assert.deepStrictEqual((yield* getShareSettings(caller('ada'), ids)).links, [made.link])
      assert.strictEqual((yield* failure(getShareSettings(caller('cat'), ids)))._tag, 'PermissionDenied')
      assert.strictEqual((yield* failure(getShareSettings(caller('zed'), ids)))._tag, 'WorkspaceUnavailable')
    })),
  )

  it.effect('every change moves the revision (so old password proofs die); the password can be set and removed', () =>
    run(Effect.gen(function* () {
      yield* world
      const { link } = yield* createShareLink(caller('bob'), { ...ids, level: 'view' })
      const revision = () => rows('shareLinks').pipe(Effect.map((r) => r[0]?.revision))
      assert.strictEqual(yield* revision(), 1)
      yield* updateShareLink(caller('bob'), { ...ids, level: 'download' })
      assert.strictEqual(yield* revision(), 2)
      const withPassword = yield* updateShareLink(caller('ada'), { ...ids, password: 'correct horse' })
      assert.isTrue(withPassword.links[0]?.hasPassword)
      assert.strictEqual(yield* revision(), 3)
      const later = yield* updateShareLink(caller('bob'), { ...ids, expiresAt: T0 + 7200, password: null })
      assert.deepStrictEqual([later.links[0]?.hasPassword, later.links[0]?.expiresAt, later.links[0]?.level, later.links[0]?.id], [false, T0 + 7200, 'download', link.id])
      assert.strictEqual(yield* revision(), 4)
      const never = yield* updateShareLink(caller('bob'), { ...ids, expiresAt: null })
      assert.isNull(never.links[0]?.expiresAt)
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['link.created', 'link.updated', 'link.updated', 'link.updated', 'link.updated'])
    })),
  )

  it.effect('refuses an empty update, a bad password, a past expiry, an old-app link, no link and the wrong people', () =>
    run(Effect.gen(function* () {
      yield* world
      assert.strictEqual((yield* failure(updateShareLink(caller('bob'), { ...ids, level: 'view' })))._tag, 'ResourceUnavailable', 'no link yet')
      yield* seedLink('legacy', 'f1', 'acme', { expiresAt: T0 + 1000, legacyMaxExpiresAt: T0 + 2000 })
      assert.strictEqual((yield* failure(updateShareLink(caller('bob'), { ...ids, level: 'view' })))._tag, 'LinkConflict', 'legacy links are not editable')
      yield* revokeShareLink(caller('bob'), ids)
      yield* createShareLink(caller('bob'), { ...ids, level: 'view' })
      assert.strictEqual((yield* failure(updateShareLink(caller('bob'), ids)))._tag, 'ValidationError')
      assert.strictEqual((yield* failure(updateShareLink(caller('bob'), { ...ids, password: 'short' })))._tag, 'ValidationError')
      assert.strictEqual((yield* failure(updateShareLink(caller('bob'), { ...ids, expiresAt: T0 - 1 })))._tag, 'AccessExpiryInvalid')
      assert.strictEqual((yield* failure(updateShareLink(caller('max'), { ...ids, level: 'download' })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* rows('shareLinks')).find((l) => l.revokedAt === null)?.revision, 1)
    })),
  )

  it.effect('revoking marks the link, moves the revision and frees the file for a new link', () =>
    run(Effect.gen(function* () {
      yield* world
      const { link } = yield* createShareLink(caller('bob'), { ...ids, level: 'view' })
      assert.strictEqual((yield* failure(revokeShareLink(caller('cat'), ids)))._tag, 'PermissionDenied')
      const after = yield* revokeShareLink(caller('ada'), ids)
      assert.deepStrictEqual(after.links, [])
      const [row] = yield* rows('shareLinks')
      assert.deepStrictEqual([row?.id, row?.revokedAt?.getTime(), row?.revision], [link.id, T0 * 1000, 2])
      assert.strictEqual((yield* failure(revokeShareLink(caller('bob'), ids)))._tag, 'ResourceUnavailable')
      yield* createShareLink(caller('bob'), { ...ids, level: 'download' })
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['link.created', 'link.revoked', 'link.created'])
    })),
  )

  it.effect('revoking one link by id leaves the others; without an id it revokes all active ones', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedLink('l1', 'f1', 'acme', { token: 'a'.repeat(32), expiresAt: T0 + 1000, legacyMaxExpiresAt: T0 + 2000 })
      yield* seedLink('l2', 'f1', 'acme', { token: 'b'.repeat(32), expiresAt: T0 + 1000, legacyMaxExpiresAt: T0 + 2000 })
      yield* revokeShareLink(caller('bob'), { ...ids, linkId: 'l1' })
      assert.deepStrictEqual((yield* rows('shareLinks')).map((l) => [l.id, l.revokedAt !== null]), [['l1', true], ['l2', false]])
      yield* revokeShareLink(caller('bob'), ids)
      assert.isTrue((yield* rows('shareLinks')).every((l) => l.revokedAt !== null))
    })),
  )
})

describe('copyShareLink', () => {
  it.effect('returns the same URL for those who may share, and records it; nobody else gets it', () =>
    run(Effect.gen(function* () {
      yield* world
      const made = yield* createShareLink(caller('bob'), { ...ids, level: 'download' })
      const copied = yield* copyShareLink(caller('ada'), ids)
      assert.strictEqual(copied.url, made.url)
      assert.deepStrictEqual(copied.link, made.link)
      for (const who of ['max', 'cat']) assert.strictEqual((yield* failure(copyShareLink(caller(who), ids)))._tag, 'PermissionDenied', who)
      assert.isTrue(['PermissionDenied', 'ResourceUnavailable'].includes((yield* failure(copyShareLink(caller('eve'), ids)))._tag))
      assert.strictEqual((yield* failure(copyShareLink(caller('zed'), ids)))._tag, 'WorkspaceUnavailable')
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => [l.action, l.actorUserId]), [['link.created', 'bob'], ['link.copied', 'ada']])
    })),
  )

  it.effect('decrypts with the key version the link was written with (rotation)', () =>
    run(Effect.gen(function* () {
      yield* world
      const token = yield* seedLink('old', 'f1', 'acme', { token: 'k'.repeat(43), keyVersion: 1, legacyMaxExpiresAt: null })
      const copied = yield* copyShareLink(caller('bob'), ids)
      assert.strictEqual(copied.url, `https://vizcad.test/s/${token}`)
    })),
  )

  it.effect('also works for a link mapped from the old app', () =>
    run(Effect.gen(function* () {
      yield* world
      const token = yield* seedLink('legacy', 'f1', 'acme', { expiresAt: T0 + 1000, legacyMaxExpiresAt: T0 + 2000 })
      const copied = yield* copyShareLink(caller('bob'), ids)
      assert.strictEqual(copied.url, `https://vizcad.test/s/${token}`)
      assert.isTrue(copied.link.legacy)
    })),
  )

  it.effect('does not hand out a revoked, expired or missing link', () =>
    run(Effect.gen(function* () {
      yield* world
      assert.strictEqual((yield* failure(copyShareLink(caller('bob'), ids)))._tag, 'ResourceUnavailable')
      yield* createShareLink(caller('bob'), { ...ids, level: 'view', expiresAt: T0 + 60 })
      yield* TestClock.adjust('2 minutes')
      assert.strictEqual((yield* failure(copyShareLink(caller('bob'), ids)))._tag, 'LinkExpired')
      yield* revokeShareLink(caller('bob'), ids)
      assert.strictEqual((yield* failure(copyShareLink(caller('bob'), ids)))._tag, 'ResourceUnavailable')
    })),
  )

  it.effect('a key version missing from the ring is a ConfigError, not a leak', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedLink('old', 'f1', 'acme', { keyVersion: 1 })
      yield* Db.use((db) => db.use((d) => d.update(schema.shareLinks).set({ tokenKeyVersion: 9 })))
      assert.strictEqual((yield* failure(copyShareLink(caller('bob'), ids)))._tag, 'ConfigError')
    })),
  )
})
