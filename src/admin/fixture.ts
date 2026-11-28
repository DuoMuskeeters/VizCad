/**
 * In-memory stand-in for `/api/cms/*`: used by the admin screen tests and, in development only, by `?fixture=admin`
 * (or `?fixture=admin-empty`, `admin-denied`, `admin-anon`, `admin-nopurge`) on /admin (api.ts). Never imported in
 * production builds. It imitates the answers the editor needs, not the server's rules (programs/cms/posts.ts has those).
 */
import { LOCALES, type Locale } from '#/i18n/locales'
import type { AdminPost, AdminPostRow, LocaleState, PreviewResult, TranslationFields } from '#/shared/cmsTypes'

export type AdminScenario = 'admin' | 'admin-empty' | 'admin-denied' | 'admin-anon' | 'admin-nopurge'

const T = 1_795_514_400
const empty = (): LocaleState => ({ live: null, draft: null, revision: 0 })

const fields = (overrides: Partial<TranslationFields>): TranslationFields => ({
  slug: 'step-vs-iges',
  title: 'STEP vs IGES: which neutral CAD format to send',
  excerpt: 'What each format keeps, what it loses, and how to open both in the browser.',
  contentMd: '## What a STEP file keeps\n\nExact geometry as B-rep solids and the assembly tree.\n\n## What an IGES file keeps\n\nSurfaces first.',
  metaTitle: null,
  metaDescription: null,
  keywords: ['step', 'iges'],
  coverAlt: null,
  ogAssetId: null,
  ...overrides,
})

const seedPosts = (): Map<string, AdminPost> => {
  const live: AdminPost = {
    id: 'post-1',
    status: 'published',
    category: 'guides',
    tags: ['formats'],
    authorId: 'ada',
    cover: null,
    featured: true,
    tableOfContents: true,
    revision: 3,
    views: 1284,
    createdAt: T - 90 * 86_400,
    updatedAt: T - 2 * 86_400,
    locales: {
      ...(Object.fromEntries(LOCALES.map((l) => [l, empty()])) as Record<Locale, LocaleState>),
      en: { live: { ...fields({}), publishedAt: T - 60 * 86_400, updatedAt: T - 2 * 86_400 }, draft: null, revision: T - 2 * 86_400 },
      tr: { live: null, draft: { ...fields({ slug: 'step-ve-iges', title: 'STEP mi IGES mi?' }), updatedAt: T - 86_400 }, revision: 4 },
    },
    authors: [
      { userId: 'ada', name: 'Ada Lovelace' },
      { userId: 'deniz', name: 'Deniz Yılmaz' },
    ],
    publishable: ['en'],
  }
  const draft: AdminPost = {
    ...live,
    id: 'post-2',
    status: 'draft',
    featured: false,
    revision: 0,
    views: 0,
    locales: { ...(Object.fromEntries(LOCALES.map((l) => [l, empty()])) as Record<Locale, LocaleState>), en: { live: null, draft: { ...fields({ slug: 'measuring-in-the-browser', title: 'Measuring parts in the browser', excerpt: '' }), updatedAt: T }, revision: 2 } },
  }
  return new Map([
    [live.id, live],
    [draft.id, draft],
  ])
}

const row = (post: AdminPost): AdminPostRow => ({
  id: post.id,
  title: post.locales.en.draft?.title ?? post.locales.en.live?.title ?? '',
  status: post.status,
  coverage: Object.fromEntries(LOCALES.map((l) => {
    const s = post.locales[l]
    return [l, s.live !== null ? (s.draft !== null ? 'live-draft' : 'live') : s.draft !== null ? 'draft' : 'none']
  })) as AdminPostRow['coverage'],
  authorName: post.authors.find((a) => a.userId === post.authorId)?.name ?? null,
  lastPublishedAt: post.locales.en.live?.updatedAt ?? null,
  views: post.views,
  updatedAt: post.updatedAt,
})

const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: false, error, ...extra }), { status, headers: { 'content-type': 'application/json' } })

export const fixtureCmsFetch = (scenario: AdminScenario): typeof fetch => {
  const posts = scenario === 'admin-empty' ? new Map<string, AdminPost>() : seedPosts()
  let queued = 0
  let drains = 0
  let created = 0
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const operation = url.split('/api/cms/')[1] ?? ''
    const body = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>
    if (scenario === 'admin-anon') return fail(401, 'Unauthenticated')
    if (scenario === 'admin-denied') return fail(403, 'PermissionDenied')
    const post = typeof body['postId'] === 'string' ? posts.get(body['postId']) : undefined
    const locale = body['locale'] as Locale
    switch (operation) {
      case 'listPurges':
        return ok({ configured: scenario !== 'admin-nopurge', total: queued, failed: 0, rows: [] })
      case 'drainPurges':
        // The late (+60 s) rows are not due at the first drain: the queue answers unchanged, then empties.
        drains += 1
        if (drains % 2 === 1) return ok({ purge: { done: 0, failed: 0, dropped: 0, queued, calls: 0 } })
        queued = 0
        return ok({ purge: { done: 1, failed: 0, dropped: 0, queued: 0, calls: 1 } })
      case 'listPostsAdmin':
        return ok({ rows: [...posts.values()].map(row), next: null })
      case 'createPost': {
        const id = `new-${++created}`
        const base = seedPosts().get('post-2') as AdminPost
        posts.set(id, { ...base, id, locales: { ...base.locales, en: { live: null, draft: { ...fields({ title: String(body['title']), slug: 'new-post', excerpt: '', contentMd: '' }), updatedAt: T }, revision: 1 } } })
        return ok({ postId: id, revision: 1 })
      }
      case 'getPostAdmin':
        return post === undefined ? fail(404, 'PostUnavailable') : ok(post)
      case 'saveDraft': {
        if (post === undefined) return fail(404, 'PostUnavailable')
        const state = post.locales[locale]
        if (body['revision'] !== state.revision) return fail(409, 'ContentConflict')
        const draft = body['fields'] as TranslationFields
        if (draft.title.length > 120) return fail(422, 'TextTooLong', { field: 'title', max: 120 })
        const revision = state.revision + 1
        posts.set(post.id, { ...post, locales: { ...post.locales, [locale]: { ...state, draft: { ...draft, updatedAt: T }, revision } } })
        return ok({ revision, updatedAt: T, slugTaken: draft.slug === 'taken', slugInvalid: !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) })
      }
      case 'publishTranslation': {
        if (post === undefined) return fail(404, 'PostUnavailable')
        if (!post.publishable.includes(locale)) return fail(422, 'PublishBlocked', { reason: 'locale-closed' })
        const state = post.locales[locale]
        if (state.draft === null) return fail(422, 'PublishBlocked', { reason: 'no-draft' })
        if (state.draft.excerpt === '') return fail(422, 'PublishBlocked', { reason: 'invalid-fields', fields: ['excerpt'] })
        posts.set(post.id, { ...post, status: 'published', locales: { ...post.locales, [locale]: { live: { ...state.draft, publishedAt: T, updatedAt: T }, draft: null, revision: T } } })
        queued = 8
        return ok({ urls: [`/blog/${state.draft.slug}`], purgeTargets: 8, purge: { done: 8, failed: 0, dropped: 0, queued: 8, calls: 1 }, warnings: { rawHtmlTags: [], droppedLinks: [], externalImages: [] } })
      }
      case 'unpublishTranslation': {
        if (post === undefined) return fail(404, 'PostUnavailable')
        const state = post.locales[locale]
        posts.set(post.id, { ...post, status: locale === 'en' ? 'draft' : post.status, locales: { ...post.locales, [locale]: { live: null, draft: state.draft ?? (state.live === null ? null : { ...state.live }), revision: state.revision + 1 } } })
        return ok({ urls: [], purgeTargets: 4, purge: { done: 4, failed: 0, dropped: 0, queued: 4, calls: 1 } })
      }
      case 'updatePostMeta': {
        if (post === undefined) return fail(404, 'PostUnavailable')
        if (body['revision'] !== post.revision) return fail(409, 'ContentConflict')
        posts.set(post.id, { ...post, category: String(body['category']), tags: body['tags'] as Array<string>, featured: Boolean(body['featured']), tableOfContents: Boolean(body['tableOfContents']), revision: post.revision + 1 })
        return ok({ revision: post.revision + 1, urls: [], purgeTargets: 0, purge: null })
      }
      case 'previewDraft': {
        if (post === undefined) return fail(404, 'PostUnavailable')
        const source = post.locales[locale].draft ?? post.locales[locale].live
        if (source === null) return fail(404, 'PostUnavailable')
        const preview: PreviewResult = {
          locale,
          source: post.locales[locale].draft === null ? 'live' : 'draft',
          warnings: { rawHtmlTags: [], droppedLinks: [], externalImages: [] },
          post: {
            slug: source.slug,
            title: source.title,
            excerpt: source.excerpt,
            category: post.category,
            publishedAt: T,
            updatedAt: T,
            readTimeMin: 3,
            featured: post.featured,
            cover: null,
            author: { name: 'Ada Lovelace', slug: 'ada', avatar: null },
            contentHtml: '<h2 id="what-a-step-file-keeps">What a STEP file keeps</h2><p>Exact geometry as B-rep solids and the assembly tree.</p><h2 id="what-an-iges-file-keeps">What an IGES file keeps</h2><p>Surfaces first.</p>',
            toc: [
              { depth: 2, id: 'what-a-step-file-keeps', text: 'What a STEP file keeps' },
              { depth: 2, id: 'what-an-iges-file-keeps', text: 'What an IGES file keeps' },
            ],
            showToc: true,
            tags: post.tags,
            metaTitle: null,
            metaDescription: null,
            keywords: [],
            ogImage: null,
            authorDetail: { name: 'Ada Lovelace', slug: 'ada', avatar: null, bio: 'Writes about CAD.', jobTitle: 'Engineer', sameAs: [] },
            related: [],
            alternates: { en: `/blog/${source.slug}` },
          },
        }
        return ok(preview)
      }
      case 'archivePost':
      case 'restorePost':
        if (post === undefined) return fail(404, 'PostUnavailable')
        posts.set(post.id, { ...post, status: operation === 'archivePost' ? 'archived' : 'published' })
        return ok({ status: operation === 'archivePost' ? 'archived' : 'published', urls: [], purgeTargets: 0, purge: null })
      case 'deletePost':
        if (post === undefined) return fail(404, 'PostUnavailable')
        if (post.status !== 'draft') return fail(422, 'PublishBlocked', { reason: 'published-before' })
        posts.delete(post.id)
        return ok({ deleted: true })
      default:
        return fail(404, 'ResourceUnavailable')
    }
  }
}
