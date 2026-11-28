import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../../db/schema'
import * as AppConfig from '../../services/AppConfig'
import { type Cache, CachePurges, memoryWith, type MemoryOptions } from '../../services/Cache'
import { Db } from '../../services/Db'
import * as DbMemory from '../../services/Db.memory'
import * as Storage from '../../services/Storage'
import { seedAuthor, seedPost } from '../../testing/blog'
import { pngBytes } from '../../testing/cmsImages'
import { rows, seedUser, T0 } from '../../testing/fixtures'
import { uploadAsset } from './assets'
import { type AuthorInput, deleteAuthor, listAuthors, saveAuthor } from './authors'

const SITE = 'https://vizcad.test'
const layer = (cache: MemoryOptions) => Layer.mergeAll(DbMemory.memory, memoryWith(cache), Storage.memory).pipe(Layer.provideMerge(AppConfig.test()))

const run = <A, E, R extends Db | CachePurges | Cache | Storage.Storage | Storage.MemoryStorageControl | AppConfig.AppConfig>(body: Effect.Effect<A, E, R>, cache: MemoryOptions = {}) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(seedAuthor('ada')), Effect.andThen(body), Effect.provide(layer(cache)))

const tagOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.flip, Effect.map((e) => e._tag))
const exec = (statement: (d: Parameters<Parameters<Db['Service']['use']>[0]>[0]) => Promise<unknown>) => Db.use((db) => db.use(statement))
const queued = rows('cachePurges').pipe(Effect.map((r) => [...new Set(r.map((x) => x.target))].sort()))

const ada = Effect.gen(function* () {
  const list = yield* listAuthors()
  const row = list.rows.find((r) => r.userId === 'ada')
  if (row === undefined) return yield* Effect.die('no ada')
  return row
})

const input = (overrides: Partial<AuthorInput> = {}): AuthorInput => ({
  userId: 'ada',
  name: 'Ada Writer',
  slug: 'ada',
  avatarAssetId: null,
  sameAs: [],
  translations: {},
  revision: 0,
  ...overrides,
})

describe('listAuthors', () => {
  it.effect('lists profiles with the legacy bio/role as en, post counts, and admins without a profile as candidates', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'p1', slug: 'one' })
      yield* seedUser('bob')
      yield* seedUser('cem')
      yield* exec((d) => d.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, 'bob')))
      const list = yield* listAuthors()
      assert.strictEqual(list.rows.length, 1)
      const row = list.rows[0]
      assert.strictEqual(row?.userEmail, 'ada@example.com')
      assert.deepStrictEqual(row?.translations, { en: { bio: 'Writes about CAD.', jobTitle: 'Engineer' } })
      assert.strictEqual(row?.posts, 1)
      assert.strictEqual(row?.revision, 1_600_000_000)
      // cem is not a platform admin; ada already has a profile.
      assert.deepStrictEqual(list.candidates.map((c) => c.userId), ['bob'])
    })))
})

describe('saveAuthor', () => {
  it.effect('creates a profile for a user, with translations, links keyed by host and the en mirror', () =>
    run(Effect.gen(function* () {
      yield* seedUser('bob')
      const saved = yield* saveAuthor(input({
        userId: 'bob',
        name: ' Bob Builder ',
        slug: 'bob',
        sameAs: ['https://www.linkedin.com/in/bob', 'https://x.com/bob', 'https://bob.dev', 'https://another.dev'],
        translations: { en: { bio: ' Builds things. ', jobTitle: 'Engineer' }, tr: { bio: 'Bir şeyler yapar.', jobTitle: null } },
      }))
      const [profile] = (yield* rows('authorProfiles')).filter((r) => r.userId === 'bob')
      assert.strictEqual(profile?.id, saved.id)
      assert.strictEqual(profile?.name, 'Bob Builder')
      assert.deepStrictEqual(profile?.socialLinks, { linkedin: 'https://www.linkedin.com/in/bob', x: 'https://x.com/bob', website: 'https://bob.dev', website2: 'https://another.dev' })
      assert.strictEqual(profile?.bio, 'Builds things.')
      assert.strictEqual(profile?.role, 'Engineer')
      const translations = (yield* rows('authorTranslations')).filter((r) => r.authorId === saved.id).map((r) => [r.locale, r.bio, r.jobTitle])
      assert.sameDeepMembers(translations, [['en', 'Builds things.', 'Engineer'], ['tr', 'Bir şeyler yapar.', null]])
      // No public posts: nothing to purge.
      assert.strictEqual(saved.purgeTargets, 0)
      assert.strictEqual(yield* tagOf(saveAuthor(input({ userId: 'bob', slug: 'bob2' }))), 'ContentConflict')
      assert.strictEqual(yield* tagOf(saveAuthor(input({ userId: 'nobody', slug: 'x' }))), 'AuthorUnavailable')
    })))

  it.effect('a new profile for a user who already has public posts purges those posts and the author page', () =>
    run(Effect.gen(function* () {
      yield* seedUser('bob')
      yield* seedPost({ id: 'pb', slug: 'bob-post', authorId: 'bob' })
      const saved = yield* saveAuthor(input({ userId: 'bob', name: 'Bob', slug: 'bob' }))
      assert.isAbove(saved.purgeTargets, 0)
      const targets = yield* queued
      assert.include(targets, `${SITE}/blog/bob-post`)
      assert.include(targets, `${SITE}/authors/bob`)
    })))

  it.effect('updates under the lock; a stale copy is ContentConflict, and two saves in one second still move the lock', () =>
    run(Effect.gen(function* () {
      const row = yield* ada
      const first = yield* saveAuthor(input({ authorId: row.id, revision: row.revision, name: 'Ada L.' }))
      assert.strictEqual(yield* tagOf(saveAuthor(input({ authorId: row.id, revision: row.revision }))), 'ContentConflict')
      const second = yield* saveAuthor(input({ authorId: row.id, revision: first.revision, name: 'Ada Lovelace' }))
      assert.isAbove(second.revision, first.revision)
      assert.strictEqual(yield* tagOf(saveAuthor(input({ authorId: row.id, revision: first.revision }))), 'ContentConflict')
      assert.strictEqual((yield* ada).name, 'Ada Lovelace')
      assert.strictEqual(yield* tagOf(saveAuthor(input({ authorId: row.id, userId: 'bob', revision: second.revision }))), 'ValidationError')
    })))

  it.effect('refuses invalid slugs, a slug another author holds, non-https links, too many links and long text', () =>
    run(Effect.gen(function* () {
      yield* seedAuthor('bob')
      const row = yield* ada
      const save = (overrides: Partial<AuthorInput>) => tagOf(saveAuthor(input({ authorId: row.id, revision: row.revision, ...overrides })))
      assert.strictEqual(yield* save({ slug: 'Not Valid' }), 'ValidationError')
      assert.strictEqual(yield* save({ slug: 'bob' }), 'SlugConflict')
      assert.strictEqual(yield* save({ sameAs: ['javascript:alert(1)'] }), 'ValidationError')
      assert.strictEqual(yield* save({ sameAs: ['http://plain.dev'] }), 'ValidationError')
      assert.strictEqual(yield* save({ sameAs: Array.from({ length: 9 }, (_, i) => `https://s${i}.dev`) }), 'TextTooLong')
      assert.strictEqual(yield* save({ name: '' }), 'ValidationError')
      assert.strictEqual(yield* save({ name: 'x'.repeat(81) }), 'TextTooLong')
      assert.strictEqual(yield* save({ translations: { de: { bio: 'x'.repeat(601), jobTitle: null } } }), 'TextTooLong')
      assert.strictEqual(yield* save({ avatarAssetId: 'missing' }), 'AssetUnavailable')
    })))

  it.effect('keeps a legacy slug until it changes, and an emptied translation removes its row', () =>
    run(Effect.gen(function* () {
      yield* exec((d) => d.update(schema.authorProfiles).set({ slug: 'Legacy_Ada' }).where(eq(schema.authorProfiles.userId, 'ada')))
      const row = yield* ada
      const kept = yield* saveAuthor(input({ authorId: row.id, revision: row.revision, slug: 'Legacy_Ada', translations: { tr: { bio: 'Merhaba', jobTitle: null } } }))
      assert.strictEqual((yield* ada).slug, 'Legacy_Ada')
      yield* saveAuthor(input({ authorId: row.id, revision: kept.revision, slug: 'Legacy_Ada', translations: { tr: { bio: ' ', jobTitle: '' } } }))
      assert.deepStrictEqual((yield* rows('authorTranslations')).filter((r) => r.locale === 'tr'), [])
    })))

  it.effect('an uploaded avatar mirrors to the legacy avatarUrl; saving without one keeps a legacy URL unless removed', () =>
    run(Effect.gen(function* () {
      yield* exec((d) => d.update(schema.authorProfiles).set({ avatarUrl: 'https://cdn.example/ada.png' }).where(eq(schema.authorProfiles.userId, 'ada')))
      let row = yield* ada
      let saved = yield* saveAuthor(input({ authorId: row.id, revision: row.revision }))
      assert.strictEqual((yield* rows('authorProfiles'))[0]?.avatarUrl, 'https://cdn.example/ada.png')
      const { asset } = yield* uploadAsset({ bytes: pngBytes(256, 256) }, { userId: 'ada' })
      saved = yield* saveAuthor(input({ authorId: row.id, revision: saved.revision, avatarAssetId: asset.id }))
      assert.strictEqual((yield* rows('authorProfiles'))[0]?.avatarUrl, asset.url)
      row = yield* ada
      assert.strictEqual(row.avatar?.assetId, asset.id)
      yield* saveAuthor(input({ authorId: row.id, revision: saved.revision, avatarAssetId: null }))
      assert.strictEqual((yield* rows('authorProfiles'))[0]?.avatarUrl, null)
    })))

  it.effect('an author with public posts: the author pages (old and new slug) and the posts are queued and purged', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'p1', slug: 'one' })
      yield* seedPost({ id: 'p2', slug: 'two', status: 'draft' })
      const row = yield* ada
      const saved = yield* saveAuthor(input({ authorId: row.id, revision: row.revision, slug: 'ada-l' }))
      assert.isAbove(saved.purgeTargets, 0)
      assert.isNotNull(saved.purge)
      const calls = yield* CachePurges.use(Ref.get)
      const urls = calls.flatMap((c) => ('urls' in c ? c.urls : []))
      for (const url of [`${SITE}/authors/ada`, `${SITE}/authors/ada-l`, `${SITE}/blog/one`, `${SITE}/sitemap.xml`]) assert.include(urls, url)
      assert.notInclude(urls, `${SITE}/blog/two`)
      // The late (+60 s) rows wait in the queue.
      assert.include(yield* queued, `${SITE}/blog/one`)
    })))

  it.effect('without purge config a change to a public author is CacheError and nothing is written', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'p1', slug: 'one' })
      const row = yield* ada
      assert.strictEqual(yield* tagOf(saveAuthor(input({ authorId: row.id, revision: row.revision, name: 'Changed' }))), 'CacheError')
      assert.strictEqual((yield* ada).name, 'ADA Writer')
    }), { configured: false }))
})

describe('deleteAuthor', () => {
  it.effect('refuses an author with posts (any status) and deletes one without, translations included', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'p1', slug: 'one', status: 'draft', translated: false })
      const row = yield* ada
      assert.strictEqual(yield* tagOf(deleteAuthor({ authorId: row.id })), 'AuthorHasPosts')
      yield* exec((d) => d.delete(schema.posts))
      yield* saveAuthor(input({ authorId: row.id, revision: row.revision, translations: { tr: { bio: 'x', jobTitle: null } } }))
      yield* deleteAuthor({ authorId: row.id })
      assert.deepStrictEqual(yield* rows('authorProfiles'), [])
      assert.deepStrictEqual(yield* rows('authorTranslations'), [])
      assert.strictEqual(yield* tagOf(deleteAuthor({ authorId: row.id })), 'AuthorUnavailable')
    })))

  it.effect('the 0016 guard still stops deleting a user who wrote posts', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'p1', slug: 'one' })
      const error = yield* exec((d) => d.delete(schema.user).where(eq(schema.user.id, 'ada'))).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'DbError')
      assert.strictEqual((yield* rows('posts')).length, 1)
    })))
})
