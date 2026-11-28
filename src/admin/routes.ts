import { LOCALES, type Locale } from '#/i18n/locales'

/** Screens inside the `/admin/$` splat route. */
export type AdminRoute =
  | { readonly screen: 'posts' }
  | { readonly screen: 'post'; readonly postId: string }
  | { readonly screen: 'preview'; readonly postId: string; readonly locale: Locale }
  | { readonly screen: 'home' }
  | { readonly screen: 'missing' }

const isLocale = (value: string | undefined): value is Locale => value !== undefined && (LOCALES as ReadonlyArray<string>).includes(value)

const decode = (part: string) => {
  try {
    return decodeURIComponent(part)
  } catch {
    return null
  }
}

/** The screen for the splat (`cms/posts/abc`). Unknown paths are `missing` (the 404 screen). */
export const parseAdminPath = (splat: string): AdminRoute => {
  const parts = splat.split('/').filter((p) => p !== '')
  if (parts.length === 0) return { screen: 'home' }
  if (parts[0] !== 'cms') return { screen: 'missing' }
  const [, section, ...rest] = parts
  if (section === 'posts' && rest.length === 0) return { screen: 'posts' }
  if (section === 'posts' && rest.length === 1) {
    const postId = decode(rest[0] ?? '')
    return postId === null || postId === '' ? { screen: 'missing' } : { screen: 'post', postId }
  }
  if (section === 'preview' && rest[0] === 'post' && rest.length === 3 && isLocale(rest[2])) {
    const postId = decode(rest[1] ?? '')
    return postId === null || postId === '' ? { screen: 'missing' } : { screen: 'preview', postId, locale: rest[2] }
  }
  return { screen: 'missing' }
}

export const adminPaths = {
  posts: () => '/admin/cms/posts',
  post: (postId: string, locale?: Locale) => `/admin/cms/posts/${encodeURIComponent(postId)}${locale === undefined || locale === 'en' ? '' : `?locale=${locale}`}`,
  preview: (postId: string, locale: Locale) => `/admin/cms/preview/post/${encodeURIComponent(postId)}/${locale}`,
}

/** `?locale=` of the editor URL (default `en`). */
export const localeOfSearch = (search: string): Locale => {
  const value = new URLSearchParams(search).get('locale') ?? undefined
  return isLocale(value) ? value : 'en'
}
