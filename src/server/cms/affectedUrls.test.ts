import { describe, expect, it } from 'vitest'
import { isMarketingPath } from '#/shared/marketingRoutes'
import { affectedUrls, type PostSnapshot, type RelatedCandidate } from './affectedUrls'

const site = new URL('https://viz-cad.com')
const abs = (...paths: ReadonlyArray<string>) => paths.map((p) => `https://viz-cad.com${p}`)

const post: PostSnapshot = { slugs: { en: 'step-files' }, category: 'guides', tags: ['step', 'cad'], authorSlug: 'ada' }
const sameCategory: RelatedCandidate = { slugs: { en: 'iges-files' }, category: 'guides', tags: [] }
const sameTag: RelatedCandidate = { slugs: { en: 'stl-vs-step' }, category: 'news', tags: ['step'] }
const unrelated: RelatedCandidate = { slugs: { en: 'release-notes' }, category: 'news', tags: ['release'] }
const oldTopic: RelatedCandidate = { slugs: { en: 'old-topic' }, category: 'tutorials', tags: ['legacy'] }

const context = { post, candidates: [sameCategory, sameTag, unrelated, oldTopic], blogPages: { en: { before: 3, after: 3 } }, landingShowsRecentPosts: false }

describe('affectedUrls', () => {
  it('post translation (en): post, related posts, every list page, RSS, author, sitemaps, index, llms.txt', () => {
    const { urls, host } = affectedUrls(site, { kind: 'postTranslation', locale: 'en', ...context })
    expect(host).toBe(false)
    expect(urls).toEqual(abs(
      '/blog/step-files', '/sitemaps/en.xml', '/sitemap.xml',
      '/blog/iges-files', '/blog/stl-vs-step',
      '/blog', '/blog/page/2', '/blog/page/3', '/blog/rss.xml', '/authors/ada', '/llms.txt',
    ))
    expect(urls).not.toContain('https://viz-cad.com/blog/release-notes')
  })

  it('unpublish: the post URL it had, the list pages, RSS, author, sitemaps; a shrinking list purges the page that goes away', () => {
    // The post is no longer published, but the snapshot keeps the slug it had (PostSnapshot.slugs) and the list drops a page.
    const { urls } = affectedUrls(site, { kind: 'postTranslation', locale: 'en', ...context, blogPages: { en: { before: 3, after: 2 } } })
    expect(urls).toEqual(expect.arrayContaining(abs('/blog/step-files', '/blog/page/3', '/blog/rss.xml', '/authors/ada', '/sitemaps/en.xml', '/sitemap.xml', '/llms.txt')))
    // A growing list purges up to the new count; no count means one page.
    expect(affectedUrls(site, { kind: 'postTranslation', locale: 'en', ...context, blogPages: { en: { before: 1, after: 2 } } }).urls).toContain('https://viz-cad.com/blog/page/2')
    const single = affectedUrls(site, { kind: 'postTranslation', locale: 'en', ...context, blogPages: {} }).urls
    expect(single.filter((u) => u.includes('/blog/page/'))).toEqual([])
  })

  it('a changed slug purges the old URL too; the landing joins once it shows recent posts', () => {
    const { urls } = affectedUrls(site, { kind: 'postTranslation', locale: 'en', previousSlug: 'step', ...context, landingShowsRecentPosts: true })
    expect(urls).toContain('https://viz-cad.com/blog/step')
    expect(urls).toContain('https://viz-cad.com/')
  })

  it('every locale the post is in: post URLs (blog locales only) and every sitemap; blog lists only in blog locales (D9)', () => {
    const multi = { ...context, post: { ...post, slugs: { en: 'step-files', tr: 'step-dosyalari' } } }
    const { urls } = affectedUrls(site, { kind: 'postTranslation', locale: 'tr', ...multi })
    // tr is not a blog locale yet: /tr/blog/** answers 404 and is never cached, so it is not listed.
    expect(urls).toEqual(abs('/blog/step-files', '/sitemaps/en.xml', '/sitemaps/tr.xml', '/sitemap.xml'))
  })

  it('post fields: union over locales; related posts matched on the old and the new category and tags; old and new author', () => {
    const { urls } = affectedUrls(site, {
      kind: 'postFields',
      ...context,
      previous: { category: 'tutorials', tags: ['legacy'] },
      previousAuthorSlug: 'lin',
    })
    expect(urls).toEqual(expect.arrayContaining(abs('/blog/old-topic', '/blog/iges-files', '/blog/stl-vs-step', '/authors/ada', '/authors/lin')))
    expect(urls).not.toContain('https://viz-cad.com/blog/release-notes')
  })

  it('page texts: the page in that locale; a live change adds every locale (hreflang) and every sitemap; landing adds llms.txt', () => {
    expect(affectedUrls(site, { kind: 'pageTexts', pageKey: 'pricing', locale: 'tr', liveChanged: false })).toEqual({ urls: abs('/tr/pricing'), host: false })
    expect(affectedUrls(site, { kind: 'pageTexts', pageKey: 'landing', locale: 'en', liveChanged: false }).urls).toEqual(abs('/', '/llms.txt'))
    const live = affectedUrls(site, { kind: 'pageTexts', pageKey: 'landing', locale: 'de', liveChanged: true })
    expect(live.urls).toEqual(abs(
      '/', '/tr', '/de', '/es', '/fr',
      '/sitemaps/en.xml', '/sitemaps/tr.xml', '/sitemaps/de.xml', '/sitemaps/es.xml', '/sitemaps/fr.xml', '/sitemap.xml', '/llms.txt',
    ))
    expect(affectedUrls(site, { kind: 'pageTexts', pageKey: 'faq', locale: 'fr', liveChanged: true }).urls).not.toContain('https://viz-cad.com/llms.txt')
  })

  it('shared texts, settings and page shells (blog, legal) are one host purge, not a URL list', () => {
    for (const change of [{ kind: 'sharedTexts' }, { kind: 'settings' }, { kind: 'pageTexts', pageKey: 'blog', locale: 'en', liveChanged: false }] as const) {
      expect(affectedUrls(site, change)).toEqual({ urls: [], host: true })
    }
  })

  it('author: author page (old and new slug), every post of the author, sitemaps when the slug changed', () => {
    const { urls } = affectedUrls(site, { kind: 'author', authorSlug: 'ada-l', previousSlug: 'ada', posts: [{ slugs: { en: 'a' } }, { slugs: { en: 'b', tr: 'b-tr' } }] })
    expect(urls).toEqual(abs('/authors/ada-l', '/authors/ada', '/blog/a', '/blog/b', '/sitemaps/en.xml', '/sitemap.xml'))
    expect(affectedUrls(site, { kind: 'author', authorSlug: null, posts: [] }).urls).toEqual([])
  })

  it('legal version: the document URL, that locale sitemap, the index and llms.txt', () => {
    expect(affectedUrls(site, { kind: 'legal', legalKind: 'kvkk', locale: 'tr' }).urls).toEqual(abs('/tr/legal/kvkk', '/sitemaps/tr.xml', '/sitemap.xml', '/llms.txt'))
  })

  it('several changes merge without duplicates; every URL is on the site host and in the cached URL space', () => {
    const { urls, host } = affectedUrls(site, [
      { kind: 'postTranslation', locale: 'en', ...context },
      { kind: 'postTranslation', locale: 'en', ...context },
      { kind: 'legal', legalKind: 'terms', locale: 'en' },
    ])
    expect(host).toBe(false)
    expect(new Set(urls).size).toBe(urls.length)
    for (const url of urls) {
      const parsed = new URL(url)
      expect(parsed.host).toBe('viz-cad.com')
      expect(parsed.search).toBe('')
      expect(isMarketingPath(parsed.pathname), url).toBe(true)
    }
  })
})
