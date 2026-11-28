import { describe, expect, it } from 'vitest'
import { adminPaths, localeOfSearch, parseAdminPath } from './routes'

describe('admin splat routing', () => {
  it('maps paths to screens and refuses the rest', () => {
    expect(parseAdminPath('')).toEqual({ screen: 'home' })
    expect(parseAdminPath('cms/posts')).toEqual({ screen: 'posts' })
    expect(parseAdminPath('cms/posts/')).toEqual({ screen: 'posts' })
    expect(parseAdminPath('cms/posts/a%2Fb')).toEqual({ screen: 'post', postId: 'a/b' })
    expect(parseAdminPath('cms/preview/post/p1/tr')).toEqual({ screen: 'preview', postId: 'p1', locale: 'tr' })
    expect(parseAdminPath('cms/preview/post/p1/xx')).toEqual({ screen: 'missing' })
    expect(parseAdminPath('cms/posts/%E0%A4%A')).toEqual({ screen: 'missing' })
    expect(parseAdminPath('cms/posts/a/b')).toEqual({ screen: 'missing' })
    expect(parseAdminPath('users')).toEqual({ screen: 'missing' })
  })

  it('builds the paths it parses', () => {
    expect(parseAdminPath(adminPaths.post('a b').slice('/admin/'.length))).toEqual({ screen: 'post', postId: 'a b' })
    expect(adminPaths.post('p', 'tr')).toBe('/admin/cms/posts/p?locale=tr')
    expect(adminPaths.post('p', 'en')).toBe('/admin/cms/posts/p')
    expect(localeOfSearch('?locale=de')).toBe('de')
    expect(localeOfSearch('?locale=xx')).toBe('en')
  })
})
