import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { POST_LIMITS } from '#/shared/cmsTypes'
import * as schema from '../../db/schema'
import { CacheError } from '../../errors'
import * as AppConfig from '../../services/AppConfig'
import { CachePurges, memoryWith, type MemoryOptions } from '../../services/Cache'
import { Db } from '../../services/Db'
import * as DbMemory from '../../services/Db.memory'
import { seedAuthor, seedPost } from '../../testing/blog'
import { rows, seedUser, T0 } from '../../testing/fixtures'
import { fromUnixSeconds } from '../../time'
import { drainCachePurges } from '../cachePurges'
import { getPublicPost, listPublicPosts } from './blog'
import {
  archivePost,
  createPost,
  type DraftInput,
  deletePost,
  getPostAdmin,
  listPostsAdmin,
  previewDraft,
  publishTranslation,
  restorePost,
  saveDraft,
  unpublishTranslation,
  updatePostMeta,
} from './posts'

const SITE = 'https://vizcad.test'
const actor = { userId: 'ada' }

const layer = (cache: MemoryOptions) => Layer.mergeAll(DbMemory.memory, memoryWith(cache)).pipe(Layer.provideMerge(AppConfig.test()))

const run = <A, E, R extends Db | CachePurges | AppConfig.AppConfig | import('../../services/Cache').Cache>(body: Effect.Effect<A, E, R>, cache: MemoryOptions = {}) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(seedAuthor('ada')), Effect.andThen(body), Effect.provide(layer(cache)))

const tagOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.flip, Effect.map((e) => e._tag))
const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.flip)

const draft = (overrides: Partial<DraftInput> = {}): DraftInput => ({
  slug: 'hello-world',
  title: 'Hello world',
  excerpt: 'A first post.',
  contentMd: '# Intro\n\nSome **bold** text.\n\n## Part two\n\nMore.',
  metaTitle: null,
  metaDescription: null,
  keywords: [],
  coverAlt: null,
  ogAssetId: null,
  ...overrides,
})

/** Creates a post and saves an `en` draft; returns the id and the draft's revision. */
const drafted = (overrides: Partial<DraftInput> = {}) =>
  Effect.gen(function* () {
    const { postId, revision } = yield* createPost({ title: overrides.title ?? 'Hello world' }, actor)
    const saved = yield* saveDraft({ postId, locale: 'en', fields: draft(overrides), revision }, actor)
    return { postId, revision: saved.revision }
  })

const published = (overrides: Partial<DraftInput> = {}) =>
  Effect.gen(function* () {
    const { postId, revision } = yield* drafted(overrides)
    const result = yield* publishTranslation({ postId, locale: 'en', revision }, actor)
    return { postId, result }
  })

const purgeCalls = CachePurges.use(Ref.get)
const queuedUrls = rows('cachePurges').pipe(Effect.map((r) => [...new Set(r.map((x) => x.target))].sort()))

describe('createPost and drafts', () => {
  it.effect('createPost writes a draft post whose legacy columns are filled and whose slug is a placeholder', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* createPost({ title: '  Çok güzel bir başlık ' }, actor)
      assert.strictEqual(revision, 1)
      const [post] = yield* rows('posts')
      assert.strictEqual(post?.status, 'draft')
      assert.strictEqual(post?.slug, `draft-${postId}`)
      assert.strictEqual(post?.category, 'general')
      assert.strictEqual(post?.authorId, 'ada')
      const admin = yield* getPostAdmin(postId)
      assert.strictEqual(admin.locales.en.draft?.slug, 'cok-guzel-bir-baslik')
      assert.strictEqual(admin.locales.en.revision, 1)
      assert.isNull(admin.locales.en.live)
      assert.deepStrictEqual(admin.publishable, ['en'])
      assert.deepStrictEqual(admin.authors, [{ userId: 'ada', name: 'ADA Writer' }])
    })))

  it.effect('saveDraft bumps the revision; a stale revision is ContentConflict and changes nothing', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted()
      assert.strictEqual(revision, 2)
      const next = yield* saveDraft({ postId, locale: 'en', fields: draft({ title: 'Second' }), revision }, actor)
      assert.strictEqual(next.revision, 3)
      assert.strictEqual(yield* tagOf(saveDraft({ postId, locale: 'en', fields: draft({ title: 'Stale' }), revision }, actor)), 'ContentConflict')
      assert.strictEqual((yield* getPostAdmin(postId)).locales.en.draft?.title, 'Second')
    })))

  it.effect('any locale saves a draft (D9: closed blog locales too), starting at revision 0', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* drafted()
      const saved = yield* saveDraft({ postId, locale: 'tr', fields: draft({ slug: 'merhaba', title: 'Merhaba' }), revision: 0 }, actor)
      assert.strictEqual(saved.revision, 1)
      assert.strictEqual((yield* getPostAdmin(postId)).locales.tr.draft?.title, 'Merhaba')
    })))

  it.effect('limits: TextTooLong names the field and its limit; markdown is capped in bytes', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted()
      const save = (fields: Partial<DraftInput>) => failure(saveDraft({ postId, locale: 'en', fields: draft(fields), revision }, actor))
      const title = yield* save({ title: 'x'.repeat(POST_LIMITS.title + 1) })
      assert.deepInclude(title, { _tag: 'TextTooLong', field: 'title', max: POST_LIMITS.title })
      assert.deepInclude(yield* save({ excerpt: 'x'.repeat(301) }), { field: 'excerpt' })
      // Multi-byte characters count in bytes: 'ş' is 2 bytes in UTF-8.
      const long = 'ş'.repeat(POST_LIMITS.contentMd / 2 + 1)
      assert.deepInclude(yield* save({ contentMd: long }), { _tag: 'TextTooLong', field: 'contentMd', max: POST_LIMITS.contentMd })
      assert.deepInclude(yield* save({ keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) }), { field: 'keywords' })
      // Exactly at the limit passes.
      const ok = yield* saveDraft({ postId, locale: 'en', fields: draft({ contentMd: 'a'.repeat(POST_LIMITS.contentMd) }), revision }, actor)
      assert.strictEqual(ok.revision, revision + 1)
    })))

  it.effect('saveDraft hints: an invalid slug and a slug another post holds', () =>
    run(Effect.gen(function* () {
      yield* published({ slug: 'taken' })
      const { postId, revision } = yield* drafted({ slug: 'mine', title: 'Mine' })
      const invalid = yield* saveDraft({ postId, locale: 'en', fields: draft({ slug: 'Bad Slug' }), revision }, actor)
      assert.isTrue(invalid.slugInvalid)
      const taken = yield* saveDraft({ postId, locale: 'en', fields: draft({ slug: 'taken' }), revision: invalid.revision }, actor)
      assert.deepInclude(taken, { slugInvalid: false, slugTaken: true })
    })))

  it.effect('an unknown OG asset is AssetUnavailable', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted()
      assert.strictEqual(yield* tagOf(saveDraft({ postId, locale: 'en', fields: draft({ ogAssetId: 'nope' }), revision }, actor)), 'AssetUnavailable')
    })))
})

describe('publishTranslation', () => {
  it.effect('draft → publish → live: stored safe HTML, toc, read time, the draft removed, the URL public', () =>
    run(Effect.gen(function* () {
      const { postId, result } = yield* published({ contentMd: '# Intro\n\n<script>alert(1)</script>\n\nReact marker $RX("B:0") here.\n\n## Part two\n\n[x](javascript:alert(1))' })
      assert.deepStrictEqual(result.urls, ['/blog/hello-world'])
      assert.deepStrictEqual(result.warnings?.rawHtmlTags, ['script'])
      assert.deepStrictEqual(result.warnings?.droppedLinks, ['javascript:alert(1)'])
      const [translation] = yield* rows('postTranslations')
      assert.notInclude(translation?.contentHtml ?? '', '<script')
      assert.notInclude(translation?.contentHtml ?? '', '$RX(', 'render markers are neutralised before storage')
      assert.include(translation?.contentHtml ?? '', '&#36;RX(')
      assert.deepStrictEqual(translation?.toc.map((e) => e.id), ['intro', 'part-two'])
      assert.isAbove(translation?.readTimeMin ?? 0, 0)
      assert.deepStrictEqual(yield* rows('postDrafts'), [])
      const view = yield* getPublicPost('en', 'hello-world')
      assert.strictEqual(view.kind, 'post')
      const admin = yield* getPostAdmin(postId)
      assert.strictEqual(admin.status, 'published')
      assert.strictEqual(admin.locales.en.revision, T0, 'without a draft the lock is the live row’s updatedAt')
    })))

  it.effect('the en publish mirrors the legacy posts columns in the same batch; a legacy reader sees the post', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published({ keywords: ['cad', 'step'], metaTitle: 'Meta', contentMd: 'Body with ![img](/api/blog/image/blog%2Fa%2Fx.webp).' })
      // The legacy Worker's read (legacy/src/lib/blog.server.ts): posts by slug, status published.
      const db = yield* Db
      const [legacy] = yield* db.use((d) => d.select().from(schema.posts).where(eq(schema.posts.slug, 'hello-world')))
      assert.strictEqual(legacy?.id, postId)
      assert.strictEqual(legacy?.status, 'published')
      assert.strictEqual(legacy?.title, 'Hello world')
      assert.strictEqual(legacy?.excerpt, 'A first post.')
      assert.strictEqual(legacy?.content, 'Body with ![img](/api/blog/image/blog%2Fa%2Fx.webp).', 'content images keep the legacy URL shape')
      assert.deepStrictEqual(legacy?.keywords, ['cad', 'step'])
      assert.strictEqual(legacy?.metaTitle, 'Meta')
      assert.strictEqual(legacy?.publishedAt?.getTime(), T0 * 1000)
      assert.isAbove(legacy?.readTime ?? 0, 0)
    })))

  it.effect('editing a published post does not change the live page until the next publish', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published()
      const admin = yield* getPostAdmin(postId)
      yield* saveDraft({ postId, locale: 'en', fields: draft({ title: 'Changed title' }), revision: admin.locales.en.revision }, actor)
      const live = yield* getPublicPost('en', 'hello-world')
      assert.strictEqual(live.kind === 'post' ? live.post.title : '', 'Hello world')
      const [legacy] = yield* rows('posts')
      assert.strictEqual(legacy?.title, 'Hello world', 'the mirror moves only on publish')
    })))

  it.effect('a slug change writes a 301 redirect; the old slug is released when another post takes it', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published({ slug: 'old-slug' })
      yield* TestClock.adjust('10 seconds')
      const rev = (yield* getPostAdmin(postId)).locales.en.revision
      const saved = yield* saveDraft({ postId, locale: 'en', fields: draft({ slug: 'new-slug' }), revision: rev }, actor)
      const result = yield* publishTranslation({ postId, locale: 'en', revision: saved.revision }, actor)
      assert.deepStrictEqual(result.urls, ['/blog/new-slug'])
      assert.deepStrictEqual(yield* getPublicPost('en', 'old-slug'), { kind: 'redirect', path: '/blog/new-slug' })
      assert.include(yield* queuedUrls, `${SITE}/blog/old-slug`, 'the old URL is purged too')
      // Another post takes the old slug: the redirect row goes, the old URL now shows the new post.
      const other = yield* published({ slug: 'old-slug', title: 'Other' })
      const view = yield* getPublicPost('en', 'old-slug')
      assert.strictEqual(view.kind === 'post' ? view.post.title : '', 'Other')
      assert.deepStrictEqual((yield* rows('postSlugRedirects')).map((r) => r.slug), [])
      assert.notStrictEqual(other.postId, postId)
    })))

  it.effect('slug conflicts: another post’s translation, or another post’s legacy posts.slug (a legacy post without en row)', () =>
    run(Effect.gen(function* () {
      yield* published({ slug: 'taken' })
      const second = yield* drafted({ slug: 'taken', title: 'Two' })
      assert.strictEqual(yield* tagOf(publishTranslation({ postId: second.postId, locale: 'en', revision: second.revision }, actor)), 'SlugConflict')
      yield* seedPost({ id: 'legacy', slug: 'legacy-slug', translated: false })
      const third = yield* drafted({ slug: 'legacy-slug', title: 'Three' })
      assert.strictEqual(yield* tagOf(publishTranslation({ postId: third.postId, locale: 'en', revision: third.revision }, actor)), 'SlugConflict')
      assert.strictEqual((yield* rows('postTranslations')).length, 1, 'nothing was written')
    })))

  it.effect('a stale revision is ContentConflict; without a draft it is PublishBlocked no-draft', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted()
      assert.strictEqual(yield* tagOf(publishTranslation({ postId, locale: 'en', revision: revision - 1 }, actor)), 'ContentConflict')
      yield* publishTranslation({ postId, locale: 'en', revision }, actor)
      assert.deepInclude(yield* failure(publishTranslation({ postId, locale: 'en', revision }, actor)), { _tag: 'PublishBlocked', reason: 'no-draft' })
    })))

  it.effect('missing or invalid fields are PublishBlocked invalid-fields with the field list', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted({ slug: 'Not Valid', excerpt: '', contentMd: '  ' })
      assert.deepInclude(yield* failure(publishTranslation({ postId, locale: 'en', revision }, actor)), {
        _tag: 'PublishBlocked',
        reason: 'invalid-fields',
        fields: ['slug', 'excerpt', 'contentMd'],
      })
    })))

  it.effect('a legacy slug that breaks the rule is kept on republish', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'odd', slug: 'Legacy_Odd_Slug' })
      const admin = yield* getPostAdmin('odd')
      assert.strictEqual(admin.locales.en.live?.slug, 'Legacy_Odd_Slug')
      const saved = yield* saveDraft({ postId: 'odd', locale: 'en', fields: draft({ slug: 'Legacy_Odd_Slug', title: 'Odd' }), revision: admin.locales.en.revision }, actor)
      assert.isFalse(saved.slugInvalid)
      const result = yield* publishTranslation({ postId: 'odd', locale: 'en', revision: saved.revision }, actor)
      assert.deepStrictEqual(result.urls, ['/blog/Legacy_Odd_Slug'])
      const [legacy] = yield* rows('posts')
      assert.strictEqual(legacy?.publishedAt?.getTime(), 1_700_000_000 * 1000, 'a legacy post keeps its first publish date')
    })))

  it.effect('D9: a closed blog locale cannot be published (its draft stays)', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published()
      const saved = yield* saveDraft({ postId, locale: 'tr', fields: draft({ slug: 'merhaba-dunya', title: 'Merhaba' }), revision: 0 }, actor)
      assert.deepInclude(yield* failure(publishTranslation({ postId, locale: 'tr', revision: saved.revision }, actor)), { _tag: 'PublishBlocked', reason: 'locale-closed' })
      assert.strictEqual((yield* getPostAdmin(postId)).locales.tr.draft?.title, 'Merhaba')
    })))

  it.effect('an archived post cannot be published', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted()
      yield* archivePost({ postId }, actor)
      assert.deepInclude(yield* failure(publishTranslation({ postId, locale: 'en', revision }, actor)), { reason: 'archived' })
    })))

  it.effect('the publish queues the affected URLs (now and +60 s) and purges the due ones in the same request', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'related', slug: 'related-post', category: 'guides' })
      yield* seedPost({ id: 'unrelated', slug: 'unrelated-post', category: 'news' })
      const { postId, revision } = yield* drafted()
      yield* updatePostMeta({ postId, category: 'guides', tags: [], authorId: 'ada', coverAssetId: null, featured: false, tableOfContents: true, revision: 0 }, actor)
      const result = yield* publishTranslation({ postId, locale: 'en', revision }, actor)
      const expected = [
        `${SITE}/authors/ada`,
        `${SITE}/blog`,
        `${SITE}/blog/hello-world`,
        `${SITE}/blog/related-post`,
        `${SITE}/blog/rss.xml`,
        `${SITE}/llms.txt`,
        `${SITE}/sitemap.xml`,
        `${SITE}/sitemaps/en.xml`,
      ]
      assert.strictEqual(result.purgeTargets, expected.length)
      assert.deepStrictEqual(result.purge, { done: expected.length, failed: 0, dropped: 0, queued: expected.length, calls: 1 })
      const calls = yield* purgeCalls
      assert.deepStrictEqual(calls.length, 1)
      assert.deepStrictEqual(calls[0]?.kind === 'url' ? [...calls[0].urls].sort() : [], expected)
      // Only the +60 s rows are left; the drain empties them.
      assert.deepStrictEqual(yield* queuedUrls, expected)
      yield* TestClock.adjust('61 seconds')
      yield* drainCachePurges({ maxCalls: 3 })
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
    })))

  it.effect('a failed purge never rolls the content back: the post is live and the URLs stay queued for the drain', () =>
    run(Effect.gen(function* () {
      const { result } = yield* published()
      assert.strictEqual(result.purge?.failed, result.purgeTargets)
      assert.strictEqual(result.purge?.done, 0)
      assert.strictEqual((yield* getPublicPost('en', 'hello-world')).kind, 'post')
      assert.isAbove((yield* rows('cachePurges')).length, 0)
    }), { fail: () => new CacheError({ reason: 'api-error' }) }))

  it.effect('without purge config the publish is CacheError and nothing is written (rule 2)', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted()
      assert.strictEqual(yield* tagOf(publishTranslation({ postId, locale: 'en', revision }, actor)), 'CacheError')
      assert.deepStrictEqual(yield* rows('postTranslations'), [])
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
      assert.strictEqual((yield* rows('posts'))[0]?.status, 'draft')
    }), { configured: false }))
})

describe('unpublish, archive, restore, delete', () => {
  it.effect('unpublishing en makes the post a draft: every URL 404, the text back as a draft, the pages purged', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published()
      yield* Ref.set(yield* CachePurges, [])
      const result = yield* unpublishTranslation({ postId, locale: 'en', confirm: false }, actor)
      assert.deepStrictEqual(result.urls, [])
      assert.include(yield* queuedUrls, `${SITE}/blog/hello-world`)
      assert.strictEqual(yield* tagOf(getPublicPost('en', 'hello-world')), 'PostUnavailable')
      assert.strictEqual((yield* listPublicPosts('en', 1)).total, 0)
      const admin = yield* getPostAdmin(postId)
      assert.strictEqual(admin.status, 'draft')
      assert.strictEqual(admin.locales.en.draft?.title, 'Hello world')
      assert.isNull(admin.locales.en.live)
      assert.strictEqual((yield* rows('posts'))[0]?.status, 'draft', 'the legacy mirror hides it too')
      // And it can go live again from that draft.
      yield* publishTranslation({ postId, locale: 'en', revision: admin.locales.en.revision }, actor)
      assert.strictEqual((yield* getPublicPost('en', 'hello-world')).kind, 'post')
    })))

  it.effect('unpublishing en while another locale is live needs the confirm flag', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published()
      // A live tr row (as a future open locale would have it).
      const db = yield* Db
      yield* db.use((d) =>
        d.insert(schema.postTranslations).values({ postId, locale: 'tr', slug: 'merhaba', title: 'Merhaba', excerpt: 'x', contentMd: 'x', contentHtml: '<p>x</p>', toc: [], readTimeMin: 1, publishedAt: fromUnixSeconds(T0), updatedAt: fromUnixSeconds(T0) }),
      )
      assert.deepInclude(yield* failure(unpublishTranslation({ postId, locale: 'en', confirm: false }, actor)), { _tag: 'PublishBlocked', reason: 'other-locales-live', fields: ['tr'] })
      yield* unpublishTranslation({ postId, locale: 'en', confirm: true }, actor)
      assert.strictEqual((yield* getPostAdmin(postId)).status, 'draft')
    })))

  it.effect('an archived post cannot be unpublished: the archive (410) stays', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published()
      yield* archivePost({ postId }, actor)
      assert.deepInclude(yield* failure(unpublishTranslation({ postId, locale: 'en', confirm: true }, actor)), { _tag: 'PublishBlocked', reason: 'archived' })
      assert.strictEqual((yield* getPostAdmin(postId)).status, 'archived')
      assert.strictEqual(yield* tagOf(getPublicPost('en', 'hello-world')), 'PostGone')
    })))

  it.effect('unpublish, then republish under a new slug: the old en URL still redirects (from the legacy posts.slug)', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published({ slug: 'old-slug' })
      yield* unpublishTranslation({ postId, locale: 'en', confirm: false }, actor)
      yield* TestClock.adjust('10 seconds')
      const rev = (yield* getPostAdmin(postId)).locales.en.revision
      const saved = yield* saveDraft({ postId, locale: 'en', fields: draft({ slug: 'new-slug' }), revision: rev }, actor)
      yield* Ref.set(yield* CachePurges, [])
      yield* publishTranslation({ postId, locale: 'en', revision: saved.revision }, actor)
      assert.deepStrictEqual(yield* getPublicPost('en', 'old-slug'), { kind: 'redirect', path: '/blog/new-slug' })
      assert.include(yield* queuedUrls, `${SITE}/blog/old-slug`)
    })))

  it.effect('a never-published post keeps no redirect from its draft placeholder slug', () =>
    run(Effect.gen(function* () {
      yield* published({ slug: 'first' })
      assert.deepStrictEqual((yield* rows('postSlugRedirects')).map((r) => r.slug), [])
    })))

  it.effect('markdown over the render caps cannot be previewed or published (PublishBlocked render-limit)', () =>
    run(Effect.gen(function* () {
      const { postId, revision } = yield* drafted({ contentMd: `${'> '.repeat(40)}deep` })
      assert.deepInclude(yield* failure(previewDraft({ postId, locale: 'en' })), { _tag: 'PublishBlocked', reason: 'render-limit', fields: ['depth'] })
      assert.deepInclude(yield* failure(publishTranslation({ postId, locale: 'en', revision }, actor)), { reason: 'render-limit' })
      assert.deepStrictEqual(yield* rows('postTranslations'), [])
      // So deep that the parser itself overflows its stack: the same refusal, not a defect.
      const deep = yield* drafted({ slug: 'deep', contentMd: `${'- '.repeat(5000)}x` })
      assert.deepInclude(yield* failure(previewDraft({ postId: deep.postId, locale: 'en' })), { _tag: 'PublishBlocked', reason: 'render-limit' })
    })))

  it.effect('unpublishing what is not live is PublishBlocked not-live', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* drafted()
      assert.deepInclude(yield* failure(unpublishTranslation({ postId, locale: 'en', confirm: false }, actor)), { reason: 'not-live' })
    })))

  it.effect('archive answers 410 on every URL and leaves the lists; restore brings it back', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published({ slug: 'keep' })
      const archived = yield* archivePost({ postId }, actor)
      assert.strictEqual(archived.status, 'archived')
      assert.include(yield* queuedUrls, `${SITE}/blog/keep`)
      assert.strictEqual(yield* tagOf(getPublicPost('en', 'keep')), 'PostGone')
      assert.strictEqual((yield* listPublicPosts('en', 1)).total, 0)
      assert.strictEqual((yield* rows('posts'))[0]?.status, 'archived')
      const restored = yield* restorePost({ postId }, actor)
      assert.strictEqual(restored.status, 'published')
      assert.strictEqual((yield* getPublicPost('en', 'keep')).kind, 'post')
    })))

  it.effect('restoring a never-published post makes it a draft again', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* drafted()
      yield* archivePost({ postId }, actor)
      assert.strictEqual((yield* restorePost({ postId }, actor)).status, 'draft')
    })))

  it.effect('deletePost removes a never-published post with its drafts; a published one is PublishBlocked', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* drafted()
      yield* deletePost({ postId })
      assert.deepStrictEqual(yield* rows('posts'), [])
      assert.deepStrictEqual(yield* rows('postDrafts'), [])
      const live = yield* published({ slug: 'live' })
      assert.deepInclude(yield* failure(deletePost({ postId: live.postId })), { reason: 'published-before' })
      yield* unpublishTranslation({ postId: live.postId, locale: 'en', confirm: false }, actor)
      assert.deepInclude(yield* failure(deletePost({ postId: live.postId })), { reason: 'published-before' }, 'once published, archive instead')
      assert.strictEqual(yield* tagOf(deletePost({ postId: 'missing' })), 'PostUnavailable')
    })))
})

describe('updatePostMeta', () => {
  const seedAsset = (id: string, r2Key: string) =>
    Db.use((db) =>
      db.use((d) => d.insert(schema.cmsAssets).values({ id, r2Key, mime: 'image/webp', bytes: 10, width: 1200, height: 630, sha256: `sha-${id}`, createdAt: fromUnixSeconds(T0) })),
    )

  it.effect('writes the fields, mirrors the cover as a legacy /api/blog/image URL, and purges old and new topics', () =>
    run(Effect.gen(function* () {
      yield* seedAsset('a1', 'blog/a/a1.webp')
      yield* seedPost({ id: 'news-post', slug: 'news-post', category: 'news' })
      yield* seedPost({ id: 'guide-post', slug: 'guide-post', category: 'guides' })
      const { postId } = yield* published()
      yield* updatePostMeta({ postId, category: 'news', tags: [], authorId: 'ada', coverAssetId: null, featured: false, tableOfContents: true, revision: 0 }, actor)
      yield* Effect.flatMap(CachePurges, (ref) => Ref.set(ref, []))
      yield* Db.use((db) => db.use((d) => d.delete(schema.cachePurges)))
      const result = yield* updatePostMeta({ postId, category: 'guides', tags: [' cad ', 'cad', ''], authorId: 'ada', coverAssetId: 'a1', featured: true, tableOfContents: false, revision: 1 }, actor)
      assert.strictEqual(result.revision, 2)
      const post = (yield* rows('posts')).find((r) => r.id === postId)
      assert.strictEqual(post?.coverImage, '/api/blog/image/blog%2Fa%2Fa1.webp')
      assert.deepStrictEqual(post?.tags, ['cad'])
      assert.strictEqual(post?.category, 'guides')
      const urls = yield* queuedUrls
      assert.include(urls, `${SITE}/blog/news-post`, 'the old category’s posts listed this one as related')
      assert.include(urls, `${SITE}/blog/guide-post`)
      assert.include(urls, `${SITE}/blog/hello-world`)
      const view = yield* getPublicPost('en', 'hello-world')
      assert.strictEqual(view.kind === 'post' ? view.post.cover?.url : '', '/api/blog/image/blog%2Fa%2Fa1.webp')
      // Removing the cover clears the legacy URL.
      yield* updatePostMeta({ postId, category: 'guides', tags: [], authorId: 'ada', coverAssetId: null, featured: true, tableOfContents: false, revision: 2 }, actor)
      assert.isNull((yield* rows('posts')).find((r) => r.id === postId)?.coverImage)
    })))

  it.effect('a legacy URL-only cover survives saving other fields; removeCover clears it', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'legacy', slug: 'legacy', coverImage: '/api/blog/image/blog%2Fold%2Fcover.png' })
      const meta = { postId: 'legacy', category: 'news', tags: [], authorId: 'ada', coverAssetId: null, featured: false, tableOfContents: true, revision: 0 }
      yield* updatePostMeta(meta, actor)
      assert.strictEqual((yield* rows('posts'))[0]?.coverImage, '/api/blog/image/blog%2Fold%2Fcover.png')
      yield* updatePostMeta({ ...meta, revision: 1, removeCover: true }, actor)
      assert.isNull((yield* rows('posts'))[0]?.coverImage)
    })))

  it.effect('conflicts, unknown author (a user without an author profile) and unknown cover', () =>
    run(Effect.gen(function* () {
      yield* seedUser('nobody')
      const { postId } = yield* drafted()
      const meta = { postId, category: 'x', tags: [], authorId: 'ada', coverAssetId: null, featured: false, tableOfContents: true, revision: 0 }
      assert.strictEqual(yield* tagOf(updatePostMeta({ ...meta, revision: 5 }, actor)), 'ContentConflict')
      assert.strictEqual(yield* tagOf(updatePostMeta({ ...meta, authorId: 'nobody' }, actor)), 'AuthorUnavailable')
      assert.strictEqual(yield* tagOf(updatePostMeta({ ...meta, coverAssetId: 'nope' }, actor)), 'AssetUnavailable')
      assert.deepInclude(yield* failure(updatePostMeta({ ...meta, tags: ['x'.repeat(41)] }, actor)), { _tag: 'TextTooLong', field: 'tags' })
      assert.strictEqual(yield* tagOf(updatePostMeta({ ...meta, category: '  ' }, actor)), 'ValidationError')
      // A draft post's fields change without purge config: nothing public moves.
      assert.strictEqual((yield* updatePostMeta(meta, actor)).purgeTargets, 0)
    }), { configured: false }))
})

describe('previewDraft', () => {
  it.effect('renders the draft with the publish renderer and writes nothing', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published()
      const admin = yield* getPostAdmin(postId)
      yield* saveDraft({ postId, locale: 'en', fields: draft({ title: 'Draft title', contentMd: '## New\n\n<b>raw</b>' }), revision: admin.locales.en.revision }, actor)
      const before = yield* rows('postTranslations')
      const preview = yield* previewDraft({ postId, locale: 'en' })
      assert.strictEqual(preview.source, 'draft')
      assert.strictEqual(preview.post.title, 'Draft title')
      assert.include(preview.post.contentHtml, '&#x3C;b>raw')
      assert.deepStrictEqual(preview.warnings.rawHtmlTags, ['b'])
      assert.strictEqual(preview.post.authorDetail?.name, 'ADA Writer')
      assert.deepStrictEqual(yield* rows('postTranslations'), before)
    })))

  it.effect('without a draft it shows the live text; with neither it is PostUnavailable', () =>
    run(Effect.gen(function* () {
      const { postId } = yield* published()
      assert.strictEqual((yield* previewDraft({ postId, locale: 'en' })).source, 'live')
      assert.strictEqual(yield* tagOf(previewDraft({ postId, locale: 'de' })), 'PostUnavailable')
    })))
})

describe('listPostsAdmin', () => {
  it.effect('per-locale coverage, filters and the cursor', () =>
    run(Effect.gen(function* () {
      const live = yield* published({ slug: 'live-one', title: 'Live one' })
      yield* TestClock.adjust('5 seconds')
      const admin = yield* getPostAdmin(live.postId)
      yield* saveDraft({ postId: live.postId, locale: 'en', fields: draft({ slug: 'live-one', title: 'Live one edited' }), revision: admin.locales.en.revision }, actor)
      yield* saveDraft({ postId: live.postId, locale: 'tr', fields: draft({ slug: 'bir', title: 'Bir' }), revision: 0 }, actor)
      yield* TestClock.adjust('5 seconds')
      const { postId: draftId } = yield* drafted({ slug: 'draft-one', title: 'Draft one' })
      const all = yield* listPostsAdmin({})
      assert.deepStrictEqual(all.rows.map((r) => r.id), [draftId, live.postId])
      const liveRow = all.rows[1]
      assert.strictEqual(liveRow?.title, 'Live one edited', 'the en draft title first')
      assert.deepInclude(liveRow?.coverage ?? {}, { en: 'live-draft', tr: 'draft', de: 'none' })
      assert.strictEqual(liveRow?.lastPublishedAt, T0)
      assert.strictEqual(all.rows[0]?.coverage.en, 'draft')
      assert.isNull(all.next)
      assert.deepStrictEqual((yield* listPostsAdmin({ status: 'published' })).rows.map((r) => r.id), [live.postId])
      assert.deepStrictEqual((yield* listPostsAdmin({ missingLocale: 'en' })).rows.map((r) => r.id), [draftId])
      assert.deepStrictEqual((yield* listPostsAdmin({ q: 'EDITED' })).rows.map((r) => r.id), [live.postId])
      const first = all.rows[0]
      const after = yield* listPostsAdmin({ cursor: `${first?.updatedAt}:${first?.id}` })
      assert.deepStrictEqual(after.rows.map((r) => r.id), [live.postId])
      assert.strictEqual(yield* tagOf(listPostsAdmin({ cursor: 'garbage' })), 'ValidationError')
    })))
})
