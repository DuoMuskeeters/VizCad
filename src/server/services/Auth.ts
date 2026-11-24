import { Context, Effect, Layer, Option, Ref } from 'effect'
import { AuthError, Unauthenticated, WorkspaceUnavailable } from '../errors'

/** What the rest of the app learns about a session. No session token, no product permission (those come from permissions.ts). */
export interface SessionSummary {
  readonly sessionId: string
  readonly userId: string
  readonly email: string
  readonly emailVerified: boolean
  /** `suspended` when the platform has banned the account (user.banned, unexpired). */
  readonly accountStatus: 'active' | 'suspended'
  /** The session's selected workspace, or null (the caller then falls back to the personal workspace). */
  readonly activeWorkspaceId: string | null
}

/**
 * The only door to better-auth (docs/08 §1 "Effect sınırı"). Everything else in the app talks to this service,
 * never to the SDK. Sign-up, e-mail/password sign-in, verification, password reset, Google sign-in and
 * sign-out are all driven through `handleIdentityRequest`: they set cookies and redirect, so they are
 * HTTP-shaped. The HTTP layer (http/auth.ts) allowlists, rate-limits and CSRF-checks before it gets here.
 * Live layer: Auth.live.ts. Test layer: `memory`.
 */
export class Auth extends Context.Service<
  Auth,
  {
    /** Runs an allowlisted identity request through the SDK; the Response carries cookies and redirects. */
    readonly handleIdentityRequest: (request: Request) => Effect.Effect<Response, AuthError>
    /** Resolves the session from request headers (cookie). None for no, expired or invalid session. */
    readonly readSession: (headers: Headers) => Effect.Effect<Option.Option<SessionSummary>, AuthError>
    /**
     * Stores the active workspace on the session. The caller (switchWorkspace) has already decided the actor may
     * use it; this only checks that the workspace exists and is not archived. `null` clears the selection.
     */
    readonly setActiveWorkspace: (
      headers: Headers,
      workspaceId: string | null,
    ) => Effect.Effect<{ readonly headers: Headers }, Unauthenticated | WorkspaceUnavailable | AuthError>
  }
>()('vizcad/Auth') {}

/** State of the in-memory layer, exposed for assertions and setup. */
export interface MemoryAuthState {
  /** Cookie value (`session=<token>`) to session. */
  readonly sessions: ReadonlyMap<string, SessionSummary>
  /** Workspace ids that exist and are not archived. */
  readonly workspaces: ReadonlySet<string>
  /** Requests handed to `handleIdentityRequest`, as `METHOD pathname`. */
  readonly handled: ReadonlyArray<string>
}

export class MemoryAuth extends Context.Service<MemoryAuth, Ref.Ref<MemoryAuthState>>()('vizcad/test/MemoryAuth') {}

const tokenOf = (headers: Headers) => /(?:^|;\s*)session=([^;]+)/.exec(headers.get('cookie') ?? '')?.[1]

/**
 * In-memory Auth for tests: sessions are seeded through MemoryAuth (`session=<token>` cookie). Identity
 * requests answer `{ ok: true }` and are recorded; a path ending in `/crash` fails with AuthError.
 */
export const memory = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const state = yield* MemoryAuth
    return Auth.of({
      handleIdentityRequest: (request) =>
        Effect.gen(function* () {
          const url = new URL(request.url)
          if (url.pathname.endsWith('/crash')) return yield* new AuthError({ operation: 'handler', cause: 'test-crash' })
          yield* Ref.update(state, (s) => ({ ...s, handled: [...s.handled, `${request.method} ${url.pathname}`] }))
          return Response.json({ ok: true })
        }),
      readSession: (headers) =>
        Ref.get(state).pipe(
          Effect.map((s) => {
            const token = tokenOf(headers)
            return Option.fromNullishOr(token === undefined ? undefined : s.sessions.get(token))
          }),
        ),
      setActiveWorkspace: (headers, workspaceId) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state)
          const token = tokenOf(headers)
          const session = token === undefined ? undefined : current.sessions.get(token)
          if (token === undefined || session === undefined) return yield* new Unauthenticated()
          if (workspaceId !== null && !current.workspaces.has(workspaceId)) return yield* new WorkspaceUnavailable()
          yield* Ref.set(state, { ...current, sessions: new Map(current.sessions).set(token, { ...session, activeWorkspaceId: workspaceId }) })
          return { headers: new Headers() }
        }),
    })
  }),
).pipe(
  Layer.provideMerge(
    Layer.effect(MemoryAuth, Ref.make<MemoryAuthState>({ sessions: new Map(), workspaces: new Set(), handled: [] })),
  ),
)
