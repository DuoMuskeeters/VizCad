import { describe, expect, it } from 'vitest'
import { AI_CRAWLERS, buildRobotsTxt } from './robots'

/**
 * A small RFC 9309 matcher, independent of the builder: groups start with one or more `User-agent` lines; a crawler
 * uses the group whose token equals its product token (case-insensitive), else `*`; the longest matching rule wins
 * and `Allow` wins a tie; `*` and a trailing `$` are wildcards; no matching rule means allowed.
 */
const parse = (text: string) => {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = []
  const sitemaps: string[] = []
  let current: (typeof groups)[number] | undefined
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (line === '') continue
    const at = line.indexOf(':')
    if (at < 0) continue
    const key = line.slice(0, at).trim().toLowerCase()
    const value = line.slice(at + 1).trim()
    if (key === 'user-agent') {
      if (!lastWasAgent || current === undefined) groups.push((current = { agents: [], rules: [] }))
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else {
      lastWasAgent = false
      if (key === 'sitemap') sitemaps.push(value)
      else if ((key === 'allow' || key === 'disallow') && current !== undefined && value !== '') current.rules.push({ allow: key === 'allow', path: value })
    }
  }
  return { groups, sitemaps }
}

const pattern = (path: string) =>
  new RegExp(`^${path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$')}`)

const allowed = (text: string, agent: string, path: string) => {
  const { groups } = parse(text)
  const group = groups.find((g) => g.agents.includes(agent.toLowerCase())) ?? groups.find((g) => g.agents.includes('*'))
  if (group === undefined) return true
  const matches = group.rules.filter((r) => pattern(r.path).test(path))
  if (matches.length === 0) return true
  const best = Math.max(...matches.map((r) => r.path.length))
  return matches.some((r) => r.path.length === best && r.allow)
}

const site = new URL('https://viz-cad.com')
const production = buildRobotsTxt({ appEnv: 'production', siteUrl: site })
const agents = ['*', 'Googlebot', 'Bingbot', ...AI_CRAWLERS]

const open = [
  '/', '/tr', '/blog', '/blog/my-post', '/tr/blog/benim-yazim', '/blog/rss.xml', '/authors/ada', '/pricing', '/faq', '/contact',
  '/legal/privacy', '/sitemap.xml', '/sitemaps/en.xml', '/llms.txt', '/api/blog/image/blog%2Fx.webp', '/api/blog/image/blog%2Fa%2F1-800.webp',
  '/sign-in', '/sign-up', '/assets/index-abc.js',
]
const closed = [
  '/app', '/app/files/1', '/admin', '/admin/cms/posts', '/api/app/x', '/api/cms/listPurges', '/api/auth/get-session', '/api/health',
  '/api/blog', '/api/files/f1/content', '/s/token', '/s/token/scene', '/dev/cms-probe', '/dev/ui', '/onboarding', '/invite/abc',
  '/guest-invite/abc', '/dashboard', '/file/abc', '/shared/abc',
]

describe('buildRobotsTxt (production)', () => {
  it.each(agents)('%s may crawl marketing pages, the blog and blog images', (agent) => {
    for (const path of open) expect(allowed(production, agent, path), `${agent} ${path}`).toBe(true)
  })

  it.each(agents)('%s may not crawl app, admin, API, token or dev routes', (agent) => {
    for (const path of closed) expect(allowed(production, agent, path), `${agent} ${path}`).toBe(false)
  })

  it('keeps Allow: /api/blog/image/ and gives every AI crawler its own group (K11)', () => {
    expect(production).toContain('Allow: /api/blog/image/\n')
    const { groups } = parse(production)
    expect(groups.map((g) => g.agents)).toEqual([['*'], ...AI_CRAWLERS.map((a) => [a.toLowerCase()])])
    // Every group has the same rules as `*`.
    for (const group of groups) expect(group.rules).toEqual(groups[0]?.rules)
  })

  it('points at the sitemap index on the site origin and has no legacy junk lines', () => {
    expect(parse(production).sitemaps).toEqual(['https://viz-cad.com/sitemap.xml'])
    expect(buildRobotsTxt({ appEnv: 'production', siteUrl: new URL('https://staging.viz-cad.com/x?y') })).toContain('Sitemap: https://staging.viz-cad.com/sitemap.xml\n')
    for (const junk of ['/src/', '/node_modules/', '/_next/', '/.git/', 'package.json']) expect(production).not.toContain(junk)
  })
})

describe('buildRobotsTxt (staging and local development)', () => {
  it.each(['staging', 'development'] as const)('%s disallows everything for everyone and names no sitemap', (appEnv) => {
    const text = buildRobotsTxt({ appEnv, siteUrl: site })
    for (const agent of agents) for (const path of [...open, ...closed]) expect(allowed(text, agent, path), `${agent} ${path}`).toBe(false)
    expect(parse(text).sitemaps).toEqual([])
    expect(text).not.toContain('Allow:')
  })
})

describe('the test parser itself', () => {
  it('longest match wins, Allow wins a tie, a named group replaces *', () => {
    const text = 'User-agent: *\nDisallow: /a\nAllow: /a/b\n\nUser-agent: X\nDisallow: /\n'
    expect(allowed(text, 'Y', '/a/b/c')).toBe(true)
    expect(allowed(text, 'Y', '/a/c')).toBe(false)
    expect(allowed(text, 'x', '/a/b')).toBe(false)
    expect(allowed('User-agent: *\nDisallow: /p\nAllow: /p\n', 'Y', '/p')).toBe(true)
  })
})
