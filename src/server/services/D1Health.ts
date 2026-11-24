/**
 * `GET /api/health`: 200 `{"ok":true}` when D1 answers `select 1`. Any failure is a fixed 503 `{"ok":false}`, so monitors
 * see "unavailable", not a server bug; the log line carries the request id only. Deliberately dependency-free (no Effect,
 * no layers, no config): the cheapest request the Worker serves.
 */
const headers = { 'cache-control': 'no-store' }

export const healthResponse = (d1: D1Database, requestId: string | null): Promise<Response> =>
  d1
    .prepare('select 1 as ok')
    .first<{ ok: number }>()
    .then(
      (row) => (row?.ok === 1 ? Response.json({ ok: true }, { status: 200, headers }) : Response.json({ ok: false }, { status: 503, headers })),
      () => {
        console.error(`health: D1 unavailable (request ${requestId ?? 'none'})`)
        return Response.json({ ok: false }, { status: 503, headers })
      },
    )
