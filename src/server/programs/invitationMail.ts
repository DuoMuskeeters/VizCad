import { Effect } from 'effect'
import type { Locale } from '../emails/auth'
import { invitationEmail } from '../emails/invitations'
import { AppConfig } from '../services/AppConfig'
import { Background } from '../services/Background'
import { Email } from '../services/Email'
import { Entitlements } from '../services/Entitlements'
import { RateLimit } from '../services/RateLimit'
import type { Caller } from './shared'

const DAY = 24 * 60 * 60

/**
 * Invitation send quota: per IP, and per workspace with the daily limit from Entitlements. Runs before anything is
 * written or sent (docs/08 §1 `RateLimit`).
 */
export const limitInvites = Effect.fnUntraced(function* (caller: Caller, workspaceId: string) {
  const limits = yield* (yield* Entitlements).limits(workspaceId)
  const limiter = yield* RateLimit
  yield* limiter.hit({ action: 'invite', ip: caller.ip })
  yield* limiter.hit({ action: 'invite', target: workspaceId, targetRule: { limit: limits.invitesPerDay, windowSeconds: DAY } })
})

/**
 * Sends an invitation after the response (`Background`). A failed send is logged by tag and swallowed: the invitation
 * row stays, and inviting the same address again resends from that row.
 */
export const sendInvitation = Effect.fnUntraced(function* (input: {
  readonly kind: 'member' | 'guest'
  readonly to: string
  readonly path: string
  readonly locale: Locale
  readonly inviterEmail: string
}) {
  const { siteUrl } = yield* AppConfig
  const email = yield* Email
  const background = yield* Background
  const url = new URL(input.path, siteUrl).toString()
  const message = invitationEmail({ kind: input.kind, locale: input.locale, inviterEmail: input.inviterEmail, url })
  yield* background.run(
    email.send({ to: input.to, ...message }).pipe(
      Effect.catch(() => Effect.logError('invitation email failed').pipe(Effect.annotateLogs({ error: 'EmailError', operation: `${input.kind}Invitation` }))),
      Effect.asVoid,
    ),
  )
})

export const normalizeEmail = (address: string) => address.trim().toLowerCase()
