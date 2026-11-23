import { Effect, Layer } from 'effect'
import { EmailError } from '../errors'
import { AppConfig } from './AppConfig'
import { checkHeaders, Email } from './Email'

/** Email through the Cloudflare Email Service binding (`EMAIL`). Locally, Wrangler simulates delivery. */
export const layer = (binding: SendEmail) =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const { email } = yield* AppConfig
      return Email.of({
        send: (message) =>
          checkHeaders(message).pipe(
            Effect.andThen(
              Effect.tryPromise({
                try: () =>
                  binding.send({
                    from: { name: email.fromName, email: email.from },
                    to: message.to,
                    subject: message.subject,
                    text: message.text,
                    ...(message.html === undefined ? {} : { html: message.html }),
                    ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
                  }),
                catch: (cause) => new EmailError({ cause }),
              }),
            ),
            Effect.map(({ messageId }) => ({ messageId })),
          ),
      })
    }),
  )
