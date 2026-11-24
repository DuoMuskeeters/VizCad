import { Context, Effect, Layer, Option, Ref } from 'effect'
import { EmailError } from '../errors'

export interface OutgoingEmail {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html?: string
  readonly replyTo?: string
}

export interface SentEmail extends OutgoingEmail {
  readonly messageId: string
}

/**
 * Transactional email (verification, password reset, invites). The sender comes from AppConfig.
 * Live layer: Email.live.ts (Cloudflare Email Service `send_email` binding). Test layer: `memory`.
 */
export class Email extends Context.Service<
  Email,
  {
    readonly send: (message: OutgoingEmail) => Effect.Effect<{ readonly messageId: string }, EmailError>
  }
>()('vizcad/Email') {}

/** Header fields must be single-line; a CR/LF in them would allow header injection. */
export const checkHeaders = (message: OutgoingEmail) =>
  [message.to, message.subject, message.replyTo ?? ''].some((v) => /[\r\n]/.test(v))
    ? Effect.fail(new EmailError({ cause: 'header fields must not contain line breaks' }))
    : Effect.void

/** True when `to` is on the allowlist (exact address, or an `@domain` entry), case-insensitive. */
export const isAllowed = (allowlist: ReadonlySet<string>, to: string) => {
  const address = to.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  return allowlist.has(address) || (at >= 0 && allowlist.has(address.slice(at)))
}

/**
 * Staging guard: sends only to allowlisted recipients; anything else is logged (without the address) and
 * skipped, and the caller sees a normal success with `messageId: 'skipped'`. With no allowlist (production)
 * it is the identity.
 */
export const withAllowlist = (
  send: Email['Service']['send'],
  allowlist: Option.Option<ReadonlySet<string>>,
): Email['Service']['send'] =>
  Option.isNone(allowlist)
    ? send
    : (message) =>
        isAllowed(allowlist.value, message.to)
          ? send(message)
          : Effect.logInfo('email skipped: recipient not on the staging allowlist').pipe(Effect.as({ messageId: 'skipped' }))

/** What the in-memory layer has "sent", in order. */
export class EmailOutbox extends Context.Service<EmailOutbox, Ref.Ref<ReadonlyArray<SentEmail>>>()('vizcad/test/EmailOutbox') {}

/**
 * In-memory Email for tests; also provides EmailOutbox for assertions.
 * Any recipient at `@fail.test` fails with EmailError, to exercise error paths.
 */
export const memory = Layer.effect(
  Email,
  Effect.gen(function* () {
    const outbox = yield* EmailOutbox
    return Email.of({
      send: (message) =>
        Effect.gen(function* () {
          yield* checkHeaders(message)
          if (message.to.endsWith('@fail.test')) return yield* new EmailError({ cause: 'test-rejected' })
          const sent = yield* Ref.updateAndGet(outbox, (all) => [...all, { ...message, messageId: `msg-${all.length + 1}` }])
          return { messageId: `msg-${sent.length}` }
        }),
    })
  }),
).pipe(Layer.provideMerge(Layer.effect(EmailOutbox, Ref.make<ReadonlyArray<SentEmail>>([]))))
