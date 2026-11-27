import { Effect, type Layer, Option } from 'effect'
import { ResourceUnavailable, type AppError } from '../errors'
import { Storage } from '../services/Storage'
import { handle, type RequestMeta } from './respond'

/**
 * `GET /api/blog/image/{encodeURIComponent(r2Key)}` (docs/12 rule 5, §1.1): the legacy blog image URL, kept as is so
 * every image link in posts and `posts.coverImage` keeps working (and so do links written by the new admin, §7.3).
 *
 * - Only keys under `blog/` (the prefix the deletion worker never touches). Anything else, a malformed escape or a
 *   `..` segment is 404, the same answer as a missing object, so nothing outside `blog/` can be probed.
 * - The key is read from the raw path and decoded once (`%2F` → `/`), exactly like the legacy handler.
 * - `immutable` for a year (a new upload gets a new key), the R2 ETag, `nosniff`. SVG and any type that is not a
 *   raster image get `Content-Security-Policy: sandbox`: a stored SVG or HTML file can never run script on our origin.
 */
export const BLOG_IMAGE_PATH = '/api/blog/image/'
const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

/** The R2 key of a blog image request path, or null (not under `blog/`, malformed, traversal). */
export const blogImageKeyOf = (pathname: string): string | null => {
  if (!pathname.startsWith(BLOG_IMAGE_PATH)) return null
  const encoded = pathname.slice(BLOG_IMAGE_PATH.length)
  if (encoded === '' || encoded.includes('/') || /%(?![0-9a-fA-F]{2})/.test(encoded)) return null
  const key = decodeURIComponent(encoded)
  if (!key.startsWith('blog/') || key.split('/').some((part) => part === '..' || part === '.' || part === '') || key.includes('\\')) return null
  return key
}

export const blogImage = (request: Request) =>
  Effect.gen(function* () {
    const key = blogImageKeyOf(new URL(request.url).pathname)
    if (key === null) return yield* new ResourceUnavailable()
    const storage = yield* Storage
    const object = yield* storage.get(key)
    if (Option.isNone(object)) return yield* new ResourceUnavailable()
    const { body, contentType, etag, size } = object.value
    // Legacy default: objects stored without a type were served as JPEG.
    const type = (contentType ?? 'image/jpeg').toLowerCase()
    const headers: Record<string, string> = {
      'content-type': type,
      'content-length': String(size),
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${etag.replace(/^W\//, '').replace(/"/g, '')}"`,
      'x-content-type-options': 'nosniff',
      ...(RASTER.has(type.split(';')[0]?.trim() ?? '') ? {} : { 'content-security-policy': 'sandbox' }),
    }
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers })
  })

export const blogImageResponse = (request: Request, layer: Layer.Layer<Storage, AppError>, meta: RequestMeta) =>
  handle(blogImage(request), layer, meta)
