import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import type { FilePage } from '../../shared/fileViews'
import { decidePermission, type WorkspaceRole } from '../permissions'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, rows, seedFile, seedMember, seedUploaderGrant, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { pruneAccessLog } from './accessLogCleanup'
import { listFileActivity } from './activity'
import { addComment, deleteComment, listComments } from './comments'
import { openFile } from './fileContext'
import { listFiles, renameFile } from './files'
import { listSharedByMe, listSharedWithMe } from './sharedFiles'
import { trashFile } from './trash'

const DAY = 86400
const at = (seconds: number) => new Date(seconds * 1000)
const run = <A, E, R>(body: Effect.Effect<A, E, R>, limits = defaultPlan) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits)))
const tag = <A, E extends { _tag: string }, R>(e: Effect.Effect<A, E, R>) => e.pipe(Effect.map(() => 'ok'), Effect.catch((error) => Effect.succeed(error._tag)))
const denied = <A, E extends { _tag: string; reason?: string }, R>(e: Effect.Effect<A, E, R>) =>
  e.pipe(Effect.map(() => 'ok'), Effect.catch((error) => Effect.succeed(error.reason === undefined ? error._tag : `${error._tag}:${error.reason}`)))

/** bob owner, ada admin, max member, cat commenter, eve/fay/dan guests (dan was an internal member before), rem was removed. */
const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'fay', 'dan', 'rem', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedMember('acme', 'fay', 'guest')
  yield* seedMember('acme', 'dan', 'guest')
  yield* seedWorkspace('beta', 'zed')
  yield* seedFile('f1', 'max', 'acme')
  yield* seedUploaderGrant('f1', 'max', 'acme')
  yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ currentVersionNumber: 3 }).where(eq(schema.files.id, 'f1'))))
  yield* grant('f1', 'eve', 'comment')
  yield* grant('f1', 'fay', 'comment')
  yield* grant('f1', 'dan', 'comment')
})

const grant = (fileId: string, userId: string, level: 'view' | 'comment' | 'download' | 'edit', expiresAt = T0 + 30 * DAY, grantedBy = 'bob') =>
  Db.use((x) => x.use((d) => d.insert(schema.fileAccess).values({
    workspaceId: 'acme', fileId, userId, level, expiresAt: at(expiresAt), grantedByUserId: grantedBy, source: 'grant', createdAt: at(T0 - DAY), updatedAt: at(T0 - DAY),
  })))

const seedComment = (id: string, userId: string, scope: 'internal' | 'guest' | null, n: number, parentId: string | null = null, fileId = 'f1') =>
  Db.use((x) => x.use((d) => d.insert(schema.fileComments).values({
    id, fileId, userId, parentId, content: `text ${id}`, createdAt: at(T0 - 1000 + n), updatedAt: at(T0 - 1000 + n), authorScopeAtWrite: scope, versionNumber: 1,
  })))

/** The five visibility states for a guest (docs/09 §6) plus a removed author. */
const comments = Effect.gen(function* () {
  yield* seedComment('c1-own', 'eve', 'guest', 1)
  yield* seedComment('c2-internal', 'bob', 'internal', 2)
  yield* seedComment('c3-other-guest', 'fay', 'guest', 3)
  yield* seedComment('c4-legacy', 'max', null, 4)
  yield* seedComment('c5-demoted', 'dan', 'internal', 5)
  yield* seedComment('c6-removed', 'rem', 'internal', 6)
  yield* seedComment('c7-member', 'max', 'internal', 7)
})

const ids = (page: { items: ReadonlyArray<{ id: string }> }) => page.items.map((i) => i.id)
const list = (who: string, fileId = 'f1', cursor: string | null = null, limit = 50) => listComments(caller(who), { workspaceId: 'acme', fileId, limit, cursor })

describe('listComments visibility', () => {
  it.effect('a guest sees own and internal comments only: not another guest, legacy NULL scope, a since-demoted author or a removed one', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* comments
      assert.deepStrictEqual(ids(yield* list('eve')), ['c1-own', 'c2-internal', 'c7-member'])
      assert.deepStrictEqual(ids(yield* list('fay')), ['c2-internal', 'c3-other-guest', 'c7-member'])
      assert.deepStrictEqual(ids(yield* list('dan')), ['c2-internal', 'c5-demoted', 'c7-member'])
    })))

  it.effect('internal roles see every comment, with author names and no e-mail or user id', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* comments
      for (const who of ['bob', 'ada', 'max', 'cat']) {
        assert.deepStrictEqual(ids(yield* list(who)), ['c1-own', 'c2-internal', 'c3-other-guest', 'c4-legacy', 'c5-demoted', 'c6-removed', 'c7-member'])
      }
      const page = yield* list('cat')
      assert.deepStrictEqual(Object.keys(page.items[0] ?? {}).sort(), ['author', 'canDelete', 'content', 'createdAt', 'deleted', 'id', 'mine', 'parentId', 'versionNumber'])
      assert.deepStrictEqual(page.items[0]?.author, { displayName: 'EVE' })
      assert.deepStrictEqual(page.items[5]?.author, { displayName: 'REM' })
      assert.notInclude(JSON.stringify(page), 'example.com')
    })))

  it.effect('the SQL filter equals permissions.ts viewComment for every comment and every viewer (equivalence)', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* comments
      const all = yield* rows('fileComments')
      const members = yield* rows('member')
      for (const viewer of ['eve', 'fay', 'dan', 'bob', 'max', 'cat']) {
        const { base } = yield* openFile(caller(viewer), 'acme', 'f1')
        const expected = all
          .filter((c) => decidePermission({
            ...base,
            action: {
              kind: 'viewComment', authorUserId: c.userId, authorScopeAtWrite: c.authorScopeAtWrite,
              authorRole: (members.find((m) => m.userId === c.userId && m.organizationId === 'acme')?.role ?? null) as WorkspaceRole | null,
            },
          }).allowed)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((c) => c.id)
        assert.deepStrictEqual(ids(yield* list(viewer)), expected, viewer)
      }
    })))

  it.effect('paging counts only visible comments: a hidden one never shifts or leaks through a cursor', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* comments
      const first = yield* list('eve', 'f1', null, 2)
      assert.deepStrictEqual(ids(first), ['c1-own', 'c2-internal'])
      assert.isNotNull(first.nextCursor)
      const second = yield* list('eve', 'f1', first.nextCursor, 2)
      assert.deepStrictEqual(ids(second), ['c7-member'])
      assert.isNull(second.nextCursor)
      assert.strictEqual(yield* tag(list('eve', 'f1', 'garbage')), 'ValidationError')
    })))

  it.effect('no access: a guest without a grant, with an expired grant, another workspace and an unknown file are all unavailable', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('f2', 'max', 'acme')
      yield* seedUser('ned')
      yield* seedMember('acme', 'ned', 'guest')
      yield* grant('f1', 'ned', 'comment', T0 - 10)
      assert.notStrictEqual(yield* tag(list('eve', 'f2')), 'ok')
      assert.notStrictEqual(yield* tag(list('ned')), 'ok')
      assert.strictEqual(yield* tag(listComments(caller('zed'), { workspaceId: 'acme', fileId: 'f1', limit: 5, cursor: null })), 'WorkspaceUnavailable')
      assert.strictEqual(yield* tag(list('bob', 'nope')), 'ResourceUnavailable')
    })))
})

describe('addComment', () => {
  it.effect('records the author scope at write time (guest for a guest, internal for every other role) and the current version number', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const who of ['bob', 'ada', 'max', 'cat', 'eve']) yield* addComment(caller(who), { workspaceId: 'acme', fileId: 'f1', content: `hi from ${who}` })
      const written = (yield* rows('fileComments')).sort((a, b) => a.content.localeCompare(b.content))
      assert.deepStrictEqual(written.map((c) => [c.userId, c.authorScopeAtWrite, c.versionNumber]).sort(), [
        ['ada', 'internal', 3], ['bob', 'internal', 3], ['cat', 'internal', 3], ['eve', 'guest', 3], ['max', 'internal', 3],
      ])
      assert.isTrue(written.every((c) => c.deletedAt === null && c.parentId === null))
    })))

  it.effect('legacy file without a version number: the count of snapshots plus one', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('legacy', 'max', 'acme')
      yield* seedUploaderGrant('legacy', 'max', 'acme')
      yield* Db.use((x) => x.use((d) => d.insert(schema.fileVersions).values({ id: 'v1', fileId: 'legacy', versionNumber: 1, r2Key: 'k1', size: 1, uploadedByUserId: 'max', createdAt: at(T0 - DAY) })))
      const c = yield* addComment(caller('max'), { workspaceId: 'acme', fileId: 'legacy', content: 'x' })
      assert.strictEqual(c.versionNumber, 2)
    })))

  it.effect('who may comment: level matters for guests; a view-only guest, an expired guest and other workspaces are refused', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedUser('vic')
      yield* seedMember('acme', 'vic', 'guest')
      yield* grant('f1', 'vic', 'view')
      const input = { workspaceId: 'acme', fileId: 'f1', content: 'hello' }
      assert.strictEqual(yield* denied(addComment(caller('vic'), input)), 'PermissionDenied:INSUFFICIENT_LEVEL')
      assert.strictEqual(yield* tag(addComment(caller('zed'), input)), 'WorkspaceUnavailable')
      assert.strictEqual(yield* tag(addComment(caller('eve'), input)), 'ok')
      assert.strictEqual((yield* rows('fileComments')).length, 1)
    })))

  it.effect('content rules: trimmed, 1 to 4000 characters, stored as plain text', () =>
    run(Effect.gen(function* () {
      yield* world
      const add = (content: string) => addComment(caller('max'), { workspaceId: 'acme', fileId: 'f1', content })
      assert.strictEqual(yield* tag(add('   ')), 'ValidationError')
      assert.strictEqual(yield* tag(add('x'.repeat(4001))), 'ValidationError')
      assert.strictEqual(yield* tag(add('x'.repeat(4000))), 'ok')
      const html = yield* add('  <b>bold</b> & <script>1</script>  ')
      assert.strictEqual(html.content, '<b>bold</b> & <script>1</script>')
    })))

  it.effect('replies: one level; the parent must be visible to the writer, undeleted and on the same file', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* comments
      yield* seedFile('f2', 'max', 'acme')
      yield* seedComment('other-file', 'bob', 'internal', 9, null, 'f2')
      const reply = (who: string, parentId: string, fileId = 'f1') => addComment(caller(who), { workspaceId: 'acme', fileId, content: 'r', parentId })
      assert.strictEqual(yield* tag(reply('eve', 'c2-internal')), 'ok')
      assert.strictEqual(yield* tag(reply('eve', 'c3-other-guest')), 'CommentUnavailable')
      assert.strictEqual(yield* tag(reply('eve', 'c4-legacy')), 'CommentUnavailable')
      assert.strictEqual(yield* tag(reply('eve', 'c5-demoted')), 'CommentUnavailable')
      assert.strictEqual(yield* tag(reply('max', 'c3-other-guest')), 'ok')
      assert.strictEqual(yield* tag(reply('eve', 'nope')), 'CommentUnavailable')
      assert.strictEqual(yield* tag(reply('max', 'other-file')), 'CommentUnavailable')
      const replies = (yield* rows('fileComments')).filter((c) => c.parentId === 'c2-internal')
      assert.strictEqual(yield* tag(reply('max', replies[0]?.id ?? 'x')), 'CommentUnavailable')
      yield* deleteComment(caller('bob'), { workspaceId: 'acme', commentId: 'c7-member' })
      assert.strictEqual(yield* tag(reply('max', 'c7-member')), 'CommentUnavailable')
    })))

  it.effect('a trashed file takes no comments', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* trashFile(caller('bob'), { workspaceId: 'acme', fileId: 'f1' })
      assert.notStrictEqual(yield* tag(addComment(caller('max'), { workspaceId: 'acme', fileId: 'f1', content: 'late' })), 'ok')
      assert.strictEqual((yield* rows('fileComments')).length, 0)
    })))
})

describe('deleteComment', () => {
  it.effect('author or owner/admin; other members and commenters are refused; the text is emptied and replies stay', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* comments
      yield* seedComment('r1', 'cat', 'internal', 8, 'c7-member')
      const del = (who: string, commentId: string) => denied(deleteComment(caller(who), { workspaceId: 'acme', commentId }))
      assert.strictEqual(yield* del('cat', 'c7-member'), 'PermissionDenied:ROLE_LIMIT')
      assert.strictEqual(yield* del('max', 'c2-internal'), 'PermissionDenied:ROLE_LIMIT')
      assert.strictEqual(yield* del('max', 'c7-member'), 'ok')
      assert.strictEqual(yield* del('ada', 'c2-internal'), 'ok')
      assert.strictEqual(yield* del('bob', 'c3-other-guest'), 'ok')
      const after = yield* list('bob')
      const gone = after.items.find((i) => i.id === 'c7-member')
      assert.deepStrictEqual([gone?.content, gone?.deleted, gone?.canDelete], ['', true, false])
      assert.deepStrictEqual(after.items.find((i) => i.id === 'r1')?.parentId, 'c7-member')
      assert.strictEqual((yield* rows('fileComments')).find((c) => c.id === 'c7-member')?.content, '')
    })))

  it.effect('a guest deletes only own comments; comments hidden from them are unavailable, not forbidden; deleting twice is harmless', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* comments
      const del = (who: string, commentId: string) => denied(deleteComment(caller(who), { workspaceId: 'acme', commentId }))
      assert.strictEqual(yield* del('eve', 'c3-other-guest'), 'CommentUnavailable')
      assert.strictEqual(yield* del('eve', 'c4-legacy'), 'CommentUnavailable')
      assert.strictEqual(yield* del('eve', 'c2-internal'), 'PermissionDenied:ROLE_LIMIT')
      assert.strictEqual(yield* del('eve', 'c1-own'), 'ok')
      const before = (yield* rows('accessLog')).length
      assert.strictEqual(yield* del('eve', 'c1-own'), 'ok')
      assert.strictEqual((yield* rows('accessLog')).length, before)
      assert.strictEqual(yield* del('zed', 'c1-own'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* del('bob', 'unknown'), 'CommentUnavailable')
    })))

  it.effect('a comment id from another workspace is unavailable', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('bf', 'zed', 'beta')
      yield* seedComment('bc', 'zed', 'internal', 1, null, 'bf')
      assert.strictEqual(yield* tag(deleteComment(caller('bob'), { workspaceId: 'acme', commentId: 'bc' })), 'CommentUnavailable')
    })))
})

describe('links cannot comment', () => {
  const link = {
    id: 'l1', workspaceId: 'acme', fileId: 'f1', level: 'download' as const, expiresAt: null, legacyMaxExpiresAt: null, revokedAt: null, revision: 1, requiresPassword: false,
  }
  it('a valid download link is refused for writing and for reading comments (LINK_NO_COMMENTS)', () => {
    const input = {
      actor: { kind: 'link', link } as const,
      workspace: { id: 'acme', name: 'Acme', kind: 'company', archived: false } as const,
      file: { id: 'f1', workspaceId: 'acme', projectId: null, trashed: false, currentReadyVersionId: 'f1' },
      now: T0,
    }
    assert.strictEqual(decidePermission({ ...input, action: { kind: 'comment' } }).reason, 'LINK_NO_COMMENTS')
    assert.strictEqual(decidePermission({ ...input, action: { kind: 'viewComment', authorUserId: 'bob', authorScopeAtWrite: 'internal', authorRole: 'owner' } }).reason, 'LINK_NO_COMMENTS')
  })
})

describe('audit trail', () => {
  it.effect('comment and file events carry ids and fixed names only: no e-mail, name, file name, comment text, IP or user agent', () =>
    run(Effect.gen(function* () {
      yield* world
      const secret = 'SECRET-COMMENT-TEXT'
      const made = yield* addComment(caller('eve'), { workspaceId: 'acme', fileId: 'f1', content: secret })
      yield* addComment(caller('max'), { workspaceId: 'acme', fileId: 'f1', content: `${secret} reply`, parentId: made.id })
      yield* deleteComment(caller('eve'), { workspaceId: 'acme', commentId: made.id })
      yield* renameFile(caller('max'), { workspaceId: 'acme', fileId: 'f1', name: 'Confidential-Name' })
      const log = yield* rows('accessLog')
      assert.deepStrictEqual(log.map((r) => r.action).sort(), ['comment.created', 'comment.created', 'comment.deleted', 'file.renamed'])
      assert.deepStrictEqual(Object.keys(log[0] ?? {}).sort(), ['action', 'actorKind', 'actorUserId', 'createdAt', 'id', 'linkId', 'outcome', 'reason', 'requestId', 'targetId', 'targetKind', 'workspaceId'])
      const text = JSON.stringify(log)
      for (const forbidden of ['example.com', 'SECRET', 'Confidential', 'f1.step', '203.0.113.7', 'EVE', 'MAX', 'Workspace acme', 'Mozilla']) {
        assert.notInclude(text, forbidden)
      }
      assert.isTrue(log.every((r) => r.targetKind === 'file' && r.targetId === 'f1' && r.reason === null && r.requestId === 'ray-test'))
    })))
})

describe('listFileActivity', () => {
  it.effect('needs edit on the file: owner, admin and the uploading member see it; commenter, guest and other workspaces do not', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* addComment(caller('eve'), { workspaceId: 'acme', fileId: 'f1', content: 'x' })
      yield* renameFile(caller('max'), { workspaceId: 'acme', fileId: 'f1', name: 'renamed' })
      yield* seedFile('f2', 'max', 'acme')
      yield* addComment(caller('bob'), { workspaceId: 'acme', fileId: 'f2', content: 'other file' })
      const act = (who: string, cursor: string | null = null, limit = 50) => listFileActivity(caller(who), { workspaceId: 'acme', fileId: 'f1', limit, cursor })
      for (const who of ['bob', 'ada', 'max']) {
        const page = yield* act(who)
        assert.deepStrictEqual(page.items.map((i) => i.action).sort(), ['comment.created', 'file.renamed'])
      }
      assert.strictEqual(yield* denied(act('cat')), 'PermissionDenied:ROLE_LIMIT')
      assert.notStrictEqual(yield* tag(act('eve')), 'ok')
      assert.strictEqual(yield* tag(act('zed')), 'WorkspaceUnavailable')
      const page = yield* act('bob')
      assert.deepStrictEqual(Object.keys(page.items[0] ?? {}).sort(), ['action', 'actor', 'createdAt', 'id', 'outcome'])
      assert.deepStrictEqual(page.items.map((i) => i.actor.displayName).sort(), ['EVE', 'MAX'])
    })))

  it.effect('pages newest first with a keyset cursor; link and system actors carry no name', () =>
    run(Effect.gen(function* () {
      yield* world
      const entry = (id: string, n: number, kind: 'user' | 'link' | 'system') =>
        Db.use((x) => x.use((d) => d.insert(schema.accessLog).values({
          id, workspaceId: 'acme', actorKind: kind, actorUserId: kind === 'user' ? 'bob' : null, linkId: kind === 'link' ? 'l1' : null, targetKind: 'file', targetId: 'f1',
          action: 'file.previewed', outcome: 'allowed', requestId: 'r', createdAt: at(T0 - n), reason: null,
        })))
      yield* entry('a1', 1, 'user')
      yield* entry('a2', 2, 'link')
      yield* entry('a3', 3, 'system')
      const first = yield* listFileActivity(caller('bob'), { workspaceId: 'acme', fileId: 'f1', limit: 2, cursor: null })
      assert.deepStrictEqual(first.items.map((i) => [i.id, i.actor.kind, i.actor.displayName]), [['a1', 'user', 'BOB'], ['a2', 'link', null]])
      const second = yield* listFileActivity(caller('bob'), { workspaceId: 'acme', fileId: 'f1', limit: 2, cursor: first.nextCursor })
      assert.deepStrictEqual(second.items.map((i) => [i.id, i.actor.kind, i.actor.displayName]), [['a3', 'system', null]])
      assert.isNull(second.nextCursor)
    })))
})

describe('listFiles recent', () => {
  it.effect('the caller\'s own opened, downloaded and uploaded files only, not renames and not other people\'s opens', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) { yield* seedFile(id, 'max', 'acme'); yield* seedUploaderGrant(id, 'max', 'acme') }
      const event = (id: string, who: string, fileId: string, action: string, n: number, outcome: 'allowed' | 'denied' = 'allowed') =>
        Db.use((x) => x.use((d) => d.insert(schema.accessLog).values({
          id, workspaceId: 'acme', actorKind: 'user', actorUserId: who, linkId: null, targetKind: 'file', targetId: fileId, action, outcome, requestId: 'r', createdAt: at(T0 - n), reason: null,
        })))
      yield* event('e1', 'max', 'r1', 'file.previewed', 10)
      yield* event('e2', 'max', 'r2', 'file.downloaded', 20)
      yield* event('e3', 'max', 'r3', 'file.renamed', 30)
      yield* event('e4', 'bob', 'r4', 'file.previewed', 40)
      yield* event('e5', 'max', 'r5', 'file.previewed', 50, 'denied')
      yield* event('e6', 'max', 'r1', 'file.previewed', 5)
      const page = yield* listFiles(caller('max'), { workspaceId: 'acme', filter: 'recent', sort: 'name', limit: 30, cursor: null })
      assert.deepStrictEqual(page.items.map((i) => i.id), ['r1', 'r2'])
      const empty = yield* listFiles(caller('cat'), { workspaceId: 'acme', filter: 'recent', sort: 'name', limit: 30, cursor: null })
      assert.strictEqual(empty.items.length, 0)
    })))

  it.effect('only the last 50 distinct files count', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* Db.use((x) => x.use(async (d) => {
        for (let i = 0; i < 52; i++) {
          const id = `p${String(i).padStart(2, '0')}`
          await d.insert(schema.files).values({
            id, name: `${id}.step`, r2Key: `k/${id}`, size: 1, mimeType: 'm', extension: 'step', status: 'uploaded', userId: 'max', createdAt: at(T0 - DAY), updatedAt: at(T0 - DAY), workspaceId: 'acme',
          })
          await d.insert(schema.accessLog).values({
            id: `pe${i}`, workspaceId: 'acme', actorKind: 'user', actorUserId: 'bob', linkId: null, targetKind: 'file', targetId: id, action: 'file.previewed',
            outcome: 'allowed', requestId: 'r', createdAt: at(T0 - 1000 + i), reason: null,
          })
        }
      }))
      const ids: Array<string> = []
      let cursor: string | null = null
      for (let i = 0; i < 5; i++) {
        const page: FilePage = yield* listFiles(caller('bob'), { workspaceId: 'acme', filter: 'recent', sort: 'name', limit: 30, cursor })
        ids.push(...page.items.map((p) => p.id))
        cursor = page.nextCursor
        if (cursor === null) break
      }
      assert.strictEqual(ids.length, 50)
      assert.notInclude(ids, 'p00')
      assert.notInclude(ids, 'p01')
    })))
})

describe('listSharedWithMe / listSharedByMe', () => {
  const link = (id: string, fileId: string, extra: Partial<typeof schema.shareLinks.$inferInsert> = {}) =>
    Db.use((x) => x.use((d) => d.insert(schema.shareLinks).values({
      id, workspaceId: 'acme', fileId, createdByUserId: 'bob', tokenDigest: `dg-${id}`, tokenCiphertext: 'ct', tokenKeyVersion: 1, level: 'view', revision: 1,
      createdAt: at(T0 - 100), updatedAt: at(T0 - 100), ...extra,
    })))

  it.effect('with-me: live grants by others on live files; no expired grant, no trashed file, no own uploader row; no project or key in the item', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const id of ['s2', 's3', 's4']) yield* seedFile(id, 'max', 'acme')
      yield* grant('s2', 'eve', 'download', T0 - 5)
      yield* grant('s3', 'eve', 'view')
      yield* grant('s4', 'eve', 'comment')
      yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ isDeleted: true }).where(eq(schema.files.id, 's4'))))
      const page = yield* listSharedWithMe(caller('eve'), { workspaceId: 'acme', limit: 30, cursor: null })
      assert.deepStrictEqual(page.items.map((i) => [i.id, i.level, i.sharedBy?.displayName]).sort(), [['f1', 'comment', 'BOB'], ['s3', 'view', 'BOB']])
      assert.deepStrictEqual(Object.keys(page.items[0] ?? {}).sort(), ['expiresAt', 'extension', 'id', 'level', 'name', 'sharedAt', 'sharedBy', 'size', 'thumbnailAvailable', 'updatedAt'])
      assert.notInclude(JSON.stringify(page), 'r2Key')
      const maxPage = yield* listSharedWithMe(caller('max'), { workspaceId: 'acme', limit: 30, cursor: null })
      assert.strictEqual(maxPage.items.length, 0)
      const paged = yield* listSharedWithMe(caller('eve'), { workspaceId: 'acme', limit: 1, cursor: null })
      assert.strictEqual(paged.items.length, 1)
      const next = yield* listSharedWithMe(caller('eve'), { workspaceId: 'acme', limit: 1, cursor: paged.nextCursor })
      assert.notStrictEqual(next.items[0]?.id, paged.items[0]?.id)
      assert.strictEqual(yield* tag(listSharedWithMe(caller('zed'), { workspaceId: 'acme', limit: 1, cursor: null })), 'WorkspaceUnavailable')
    })))

  it.effect('by-me: files with a live grant the caller gave or an active link the caller made; revoked, expired and others\' shares do not count', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const id of ['s2', 's3', 's4', 's5']) yield* seedFile(id, 'max', 'acme')
      yield* link('l-live', 's2')
      yield* link('l-revoked', 's3', { revokedAt: at(T0 - 50) })
      yield* link('l-expired', 's4', { expiresAt: at(T0 - 50) })
      yield* link('l-ada', 's5', { createdByUserId: 'ada' })
      yield* grant('s2', 'fay', 'view', T0 + DAY, 'bob')
      const mine = yield* listSharedByMe(caller('bob'), { workspaceId: 'acme', limit: 30, cursor: null })
      assert.deepStrictEqual(mine.items.map((i) => [i.id, i.grants, i.linkActive]).sort(), [['f1', 3, false], ['s2', 1, true]])
      const adas = yield* listSharedByMe(caller('ada'), { workspaceId: 'acme', limit: 30, cursor: null })
      assert.deepStrictEqual(adas.items.map((i) => [i.id, i.grants, i.linkActive]), [['s5', 0, true]])
      const guest = yield* listSharedByMe(caller('eve'), { workspaceId: 'acme', limit: 30, cursor: null })
      assert.strictEqual(guest.items.length, 0)
      const paged = yield* listSharedByMe(caller('bob'), { workspaceId: 'acme', limit: 1, cursor: null })
      const next = yield* listSharedByMe(caller('bob'), { workspaceId: 'acme', limit: 1, cursor: paged.nextCursor })
      assert.deepStrictEqual([paged.items.length, next.items.length, paged.items[0]?.id === next.items[0]?.id], [1, 1, false])
      assert.isNull(next.nextCursor)
    })))
})

describe('pruneAccessLog', () => {
  const entry = (id: string, workspaceId: string, daysOld: number) =>
    Db.use((x) => x.use((d) => d.insert(schema.accessLog).values({
      id, workspaceId, actorKind: 'system', actorUserId: null, linkId: null, targetKind: 'file', targetId: 'f', action: 'file.trashed', outcome: 'allowed',
      requestId: 'cron', createdAt: at(T0 - daysOld * DAY), reason: null,
    })))

  it.effect('removes rows older than the plan\'s retention in every workspace and keeps the rest', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* entry('old-a', 'acme', 400)
      yield* entry('new-a', 'acme', 364)
      yield* entry('old-b', 'beta', 366)
      yield* entry('new-b', 'beta', 1)
      const result = yield* pruneAccessLog()
      assert.strictEqual(result.deleted, 2)
      assert.deepStrictEqual((yield* rows('accessLog')).map((r) => r.id).sort(), ['new-a', 'new-b'])
    })))

  it.effect('honours a longer plan; a second run changes nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* entry('mid', 'acme', 400)
      yield* entry('ancient', 'acme', 800)
      assert.strictEqual((yield* pruneAccessLog()).deleted, 1)
      assert.strictEqual((yield* pruneAccessLog()).deleted, 0)
      assert.deepStrictEqual((yield* rows('accessLog')).map((r) => r.id), ['mid'])
    }), { ...defaultPlan, auditRetentionDays: 730 }))

  it.effect('walks past workspaces whose plan keeps the rows and empties large backlogs in groups', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* Db.use((x) => x.use(async (d) => {
        for (let batch = 0; batch < 3; batch++) {
          await d.insert(schema.accessLog).values(Array.from({ length: 30 }, (_, i) => ({
            id: `bulk-${batch}-${i}`, workspaceId: 'acme', actorKind: 'system' as const, actorUserId: null, linkId: null, targetKind: 'file', targetId: 'f',
            action: 'file.trashed', outcome: 'allowed' as const, requestId: 'cron', createdAt: at(T0 - 500 * DAY), reason: null,
          })))
        }
      }))
      assert.strictEqual((yield* pruneAccessLog()).deleted, 90)
      assert.strictEqual((yield* rows('accessLog')).length, 0)
    })))
})
