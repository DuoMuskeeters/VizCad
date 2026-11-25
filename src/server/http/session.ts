import { Effect, Option } from 'effect'
import { Unauthenticated } from '../errors'
import type { Caller } from '../programs/shared'
import { Auth } from '../services/Auth'

/**
 * The signed-in caller of a request: 401 for no session or a suspended account. The session read never loads the
 * better-auth SDK (Auth.live). `ip` and `userAgent` feed rate limits and the security log only.
 */
export const readCaller = (request: Request) =>
  Effect.gen(function* () {
    const session = yield* Auth.use((auth) => auth.readSession(request.headers))
    if (Option.isNone(session) || session.value.accountStatus !== 'active') return yield* new Unauthenticated()
    const caller: Caller = {
      userId: session.value.userId,
      email: session.value.email,
      emailVerified: session.value.emailVerified,
      requestId: request.headers.get('cf-ray') ?? 'none',
      ip: request.headers.get('cf-connecting-ip'),
      userAgent: request.headers.get('user-agent'),
    }
    return { caller, session: session.value }
  })
