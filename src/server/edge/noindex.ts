/**
 * Staging must never be indexed (docs/12 §6.5): every response of a non-production Worker carries
 * `X-Robots-Tag: noindex, nofollow`. Effect-free, like the edge cache path in src/server.ts.
 */
export const NOINDEX = 'noindex, nofollow'

export const withNoindex = (appEnv: string | undefined, response: Response): Response => {
  if (appEnv === 'production') return response
  const copy = new Response(response.body, response)
  copy.headers.set('X-Robots-Tag', NOINDEX)
  return copy
}
