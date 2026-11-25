/**
 * Links of the old app lived at `/shared/<token>` (docs/09 §1.5 step 7, D15). They keep working: a plain redirect to
 * `/s/<token>`, answered by the Worker itself (no router, no database). The token is copied as a path segment, nothing else
 * from the request; a path that is not exactly one segment is a 404. Never cached and never sent on as a referrer, because
 * the token is in the URL.
 */
export const legacySharedRedirect = (request: Request) => {
  const match = /^\/shared\/([A-Za-z0-9_-]{1,64})\/?$/.exec(new URL(request.url).pathname)
  const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }
  if (match === null) return new Response(null, { status: 404, headers })
  return new Response(null, { status: 302, headers: { ...headers, location: `/s/${match[1]}` } })
}
