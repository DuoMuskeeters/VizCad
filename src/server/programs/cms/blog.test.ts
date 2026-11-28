import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as schema from '../../db/schema'
import { Db } from '../../services/Db'
import { seedAuthor, seedPost } from '../../testing/blog'
import { programLayer } from '../../testing/fixtures'
import { getPublicAuthor, getPublicPost, latestPosts, listPublicPosts, pickRelated, POSTS_PER_PAGE, safeImageUrl, sitemapPosts } from './blog'

const run = <A, E>(effect: Effect.Effect<A, E, Db>) => effect.pipe(Effect.provide(programLayer()))
const tagOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((e) => e._tag),
  )

describe('no read fallback (docs/12 §1.5)', () => {
  it.effect('a legacy post without its en row is 404 and absent from lists, RSS and sitemaps', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        yield* seedPost({ id: 'p1', slug: 'legacy-only', translated: false })
        assert.strictEqual(yield* tagOf(getPublicPost('en', 'legacy-only')), 'PostUnavailable')
        assert.strictEqual((yield* listPublicPosts('en', 1)).total, 0)
        assert.deepStrictEqual(yield* latestPosts('en', 20), [])
        assert.deepStrictEqual(yield* sitemapPosts(['en']), [])
      }),
    ),
  )

  it.effect('a half-written row (cutover sentinel readTimeMin = -1) is not public', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        yield* seedPost({ id: 'p1', slug: 'half', readTimeMin: -1 })
        assert.strictEqual(yield* tagOf(getPublicPost('en', 'half')), 'PostUnavailable')
        assert.strictEqual((yield* listPublicPosts('en', 1)).total, 0)
      }),
    ),
  )
})

describe('listPublicPosts', () => {
  it.effect('featured first, then newest; 12 per page; out of range and other locales 404', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        for (let i = 0; i < 14; i++) yield* seedPost({ id: `p${i}`, slug: `post-${i}`, publishedAt: 1_700_000_000 + i * 100 })
        yield* seedPost({ id: 'old-featured', slug: 'old-featured', featured: true, publishedAt: 1_600_000_000 })
        yield* seedPost({ id: 'draft', slug: 'draft', status: 'draft' })
        yield* seedPost({ id: 'archived', slug: 'archived', status: 'archived' })

        const first = yield* listPublicPosts('en', 1)
        assert.strictEqual(first.total, 15)
        assert.strictEqual(first.pages, 2)
        assert.strictEqual(first.cards.length, POSTS_PER_PAGE)
        assert.deepStrictEqual(first.cards.slice(0, 3).map((c) => c.slug), ['old-featured', 'post-13', 'post-12'])
        const second = yield* listPublicPosts('en', 2)
        assert.deepStrictEqual(second.cards.map((c) => c.slug), ['post-2', 'post-1', 'post-0'])
        assert.strictEqual(yield* tagOf(listPublicPosts('en', 3)), 'PageUnavailable')
        assert.strictEqual(yield* tagOf(listPublicPosts('en', 0)), 'PageUnavailable')
        // D9/K14: blog pages exist only in blogLocales.
        assert.strictEqual(yield* tagOf(listPublicPosts('tr', 1)), 'PageUnavailable')
      }),
    ),
  )

  it.effect('an empty blog is one empty page, not a 404', () =>
    run(
      Effect.gen(function* () {
        assert.deepStrictEqual(yield* listPublicPosts('en', 1), { page: 1, pages: 1, total: 0, cards: [] })
      }),
    ),
  )
})

describe('getPublicPost', () => {
  it.effect('returns the stored HTML, author, alternates and dates in seconds', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada', { socialLinks: { x: 'https://x.com/ada', bad: 'javascript:alert(1)' } })
        yield* seedPost({ id: 'p1', slug: 'hello', coverImage: '/api/blog/image/blog%2Fhello%2Fc.png', tags: ['cad'] })
        const result = yield* getPublicPost('en', 'hello')
        assert.strictEqual(result.kind, 'post')
        if (result.kind !== 'post') return
        const post = result.post
        assert.strictEqual(post.contentHtml, '<h2 id="x">Title hello</h2><p>Body.</p>')
        assert.strictEqual(post.publishedAt, 1_700_000_000)
        assert.strictEqual(post.updatedAt, 1_700_000_005)
        assert.deepStrictEqual(post.cover, { url: '/api/blog/image/blog%2Fhello%2Fc.png', width: null, height: null, alt: '' })
        assert.deepStrictEqual(post.ogImage, post.cover)
        assert.deepStrictEqual(post.alternates, { en: '/blog/hello' })
        assert.strictEqual(post.authorDetail?.slug, 'ada')
        assert.strictEqual(post.authorDetail?.jobTitle, 'Engineer')
        assert.deepStrictEqual(post.authorDetail?.sameAs, ['https://x.com/ada'])
        // Contract (§11): no email, user id, R2 key outside an image URL, or draft field.
        const json = JSON.stringify(post)
        assert.notInclude(json, '@example.com')
        assert.notInclude(json, 'authorId')
        assert.notInclude(json, 'contentMd')
        assert.notInclude(json, 'userId')
      }),
    ),
  )

  it.effect('archived is 410, draft and unknown are 404, other locales 404', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        yield* seedPost({ id: 'a', slug: 'gone', status: 'archived' })
        yield* seedPost({ id: 'd', slug: 'draft', status: 'draft' })
        assert.strictEqual(yield* tagOf(getPublicPost('en', 'gone')), 'PostGone')
        assert.strictEqual(yield* tagOf(getPublicPost('en', 'draft')), 'PostUnavailable')
        assert.strictEqual(yield* tagOf(getPublicPost('en', 'nope')), 'PostUnavailable')
        assert.strictEqual(yield* tagOf(getPublicPost('tr', 'gone')), 'PostUnavailable')
      }),
    ),
  )

  it.effect('an old slug answers a redirect to the current URL; a redirect to an unpublished post is 404', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        yield* seedPost({ id: 'p1', slug: 'new-name' })
        yield* seedPost({ id: 'p2', slug: 'archived-now', status: 'archived' })
        const db = yield* Db
        yield* db.use((d) =>
          d.insert(schema.postSlugRedirects).values([
            { locale: 'en', slug: 'old-name', postId: 'p1', createdAt: new Date(1_700_000_000_000) },
            { locale: 'en', slug: 'old-archived', postId: 'p2', createdAt: new Date(1_700_000_000_000) },
          ]),
        )
        assert.deepStrictEqual(yield* getPublicPost('en', 'old-name'), { kind: 'redirect', path: '/blog/new-name' })
        assert.strictEqual(yield* tagOf(getPublicPost('en', 'old-archived')), 'PostUnavailable')
      }),
    ),
  )

  it.effect('related posts: category +2, shared tag +1, newest first on ties, at most 3, never itself', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        yield* seedPost({ id: 'me', slug: 'me', category: 'cad', tags: ['step', 'iges'] })
        yield* seedPost({ id: 'a', slug: 'same-cat', category: 'cad', publishedAt: 1_700_000_100 })
        yield* seedPost({ id: 'b', slug: 'two-tags', category: 'other', tags: ['step', 'iges'], publishedAt: 1_700_000_200 })
        yield* seedPost({ id: 'c', slug: 'cat-and-tag', category: 'cad', tags: ['step'], publishedAt: 1_700_000_050 })
        yield* seedPost({ id: 'd', slug: 'nothing', category: 'other', publishedAt: 1_700_000_900 })
        const result = yield* getPublicPost('en', 'me')
        assert.strictEqual(result.kind, 'post')
        if (result.kind !== 'post') return
        assert.deepStrictEqual(result.post.related.map((r) => r.slug), ['cat-and-tag', 'two-tags', 'same-cat'])
      }),
    ),
  )
})

describe('getPublicAuthor', () => {
  it.effect('an author with a slug and public posts; without a slug or posts 404', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        yield* seedAuthor('bob', { slug: null })
        yield* seedAuthor('cat', { slug: 'cat' })
        yield* seedPost({ id: 'p1', slug: 'by-ada', authorId: 'ada' })
        yield* seedPost({ id: 'p2', slug: 'by-bob', authorId: 'bob' })
        yield* seedPost({ id: 'p3', slug: 'cat-draft', authorId: 'cat', status: 'draft' })
        const page = yield* getPublicAuthor('en', 'ada')
        assert.strictEqual(page.author.name, 'ADA Writer')
        assert.deepStrictEqual(page.posts.map((p) => p.slug), ['by-ada'])
        assert.notInclude(JSON.stringify(page), '@example.com')
        assert.strictEqual(yield* tagOf(getPublicAuthor('en', 'cat')), 'AuthorUnavailable')
        assert.strictEqual(yield* tagOf(getPublicAuthor('en', 'nobody')), 'AuthorUnavailable')
        assert.strictEqual(yield* tagOf(getPublicAuthor('tr', 'ada')), 'AuthorUnavailable')
      }),
    ),
  )

  it.effect('a social link that passes the https prefix but does not parse is dropped (the page renders its hostname)', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada', { socialLinks: { web: 'https://exa mple.com', x: 'https://x.com/ada', bad: 'https://[::1' } })
        yield* seedPost({ id: 'p1', slug: 'by-ada', authorId: 'ada' })
        const page = yield* getPublicAuthor('en', 'ada')
        assert.deepStrictEqual(page.author.sameAs, ['https://x.com/ada'])
        // Every kept link renders: the author page calls `new URL(href).hostname` during SSR.
        assert.deepStrictEqual(page.author.sameAs.map((href) => new URL(href).hostname), ['x.com'])
        const post = yield* getPublicPost('en', 'by-ada')
        assert.deepStrictEqual(post.kind === 'post' ? post.post.authorDetail?.sameAs : null, ['https://x.com/ada'])
      }),
    ),
  )
})

describe('sitemapPosts and latestPosts', () => {
  it.effect('only public translations, newest first, with the author slug', () =>
    run(
      Effect.gen(function* () {
        yield* seedAuthor('ada')
        yield* seedPost({ id: 'p1', slug: 'one', publishedAt: 1_700_000_000 })
        yield* seedPost({ id: 'p2', slug: 'two', publishedAt: 1_700_000_500 })
        yield* seedPost({ id: 'p3', slug: 'gone', status: 'archived' })
        assert.deepStrictEqual((yield* sitemapPosts(['en'])).map((p) => [p.slug, p.updatedAt, p.authorSlug]), [
          ['two', 1_700_000_505, 'ada'],
          ['one', 1_700_000_005, 'ada'],
        ])
        assert.deepStrictEqual((yield* latestPosts('en', 1)).map((p) => p.slug), ['two'])
        assert.deepStrictEqual(yield* sitemapPosts(['tr']), [])
      }),
    ),
  )
})

describe('pure helpers', () => {
  it('pickRelated keeps candidate order on ties and never fills with posts that share no topic', () => {
    const post = { category: 'x', tags: ['t'] }
    const c = (slug: string, category: string, tags: ReadonlyArray<string> = []) => ({ slug, category, tags })
    assert.deepStrictEqual(pickRelated(post, [c('a', 'y', ['t']), c('b', 'x'), c('c', 'y', ['t']), c('d', 'y', ['t'])]).map((r) => r.slug), ['b', 'a', 'c'])
    // Score 0 (no shared category or tag) is never shown: the purge only refreshes posts that share a topic.
    assert.deepStrictEqual(pickRelated(post, [c('a', 'y'), c('b', 'x'), c('c', 'y')]).map((r) => r.slug), ['b'])
    assert.deepStrictEqual(pickRelated(post, [c('a', 'y'), c('c', 'z', ['u'])]), [])
  })

  it('safeImageUrl keeps https and site-relative URLs only', () => {
    assert.strictEqual(safeImageUrl('/api/blog/image/x'), '/api/blog/image/x')
    assert.strictEqual(safeImageUrl('https://cdn.test/a.png'), 'https://cdn.test/a.png')
    assert.isNull(safeImageUrl('javascript:alert(1)'))
    assert.isNull(safeImageUrl('//evil.test/a.png'))
    assert.isNull(safeImageUrl('http://plain.test/a.png'))
    assert.isNull(safeImageUrl(null))
  })
})
