import { Effect } from 'effect'
import { CsrfRejected } from '../errors'

/**
 * Request boundary for every state-changing endpoint (docs/08 §1 "İstek sınırı", review 2.6): POST only,
 * a trusted `Origin` is required, `Sec-Fetch-Site` must be `same-origin` when the browser sends it, and the
 * body must be JSON (a cross-site form cannot send that without a preflight). GET never mutates product
 * state, so opening an invitation link never accepts it. `trustedOrigins` comes from AppConfig.
 */
export const checkMutationRequest = (request: Request, trustedOrigins: ReadonlySet<string>) =>
  Effect.gen(function* () {
    if (request.method !== 'POST') return yield* new CsrfRejected({ reason: 'method' })
    const origin = request.headers.get('origin')
    if (origin === null || !trustedOrigins.has(origin)) return yield* new CsrfRejected({ reason: 'origin' })
    const site = request.headers.get('sec-fetch-site')
    if (site !== null && site !== 'same-origin') return yield* new CsrfRejected({ reason: 'fetch-site' })
    const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
    if (type !== 'application/json') return yield* new CsrfRejected({ reason: 'content-type' })
  })
