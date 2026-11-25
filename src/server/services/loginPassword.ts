import { verifyPassword as verifyScrypt } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { AuthError } from '../errors'
import { hashPassword, verifyPassword } from '../shareCrypto'

/**
 * Login passwords for better-auth's `emailAndPassword.password.{hash,verify}` (docs/08, "Giriş parolaları").
 *
 * - New hashes (sign-up, reset, change) are `p1$10000$<salt>$<hash>` (PBKDF2-SHA-256, shareCrypto.ts): about 3 to 4 ms of
 *   CPU, which fits the Workers Free plan (10 ms per request). The SDK's own scrypt costs more than that on every sign-in.
 * - `verify` reads `p1$` hashes with PBKDF2 (constant time, at most 100 000 iterations) and anything else with the SDK's
 *   scrypt, so legacy accounts and staging accounts made before this change keep working.
 * - When `rehash` is on, a successful scrypt check rewrites that account's hash as `p1$` once. Legacy code cannot read
 *   `p1$`, so production keeps the flag off until the cutover (`PASSWORD_REHASH`).
 *
 * The password is NFKC-normalised first, as the SDK does, so a hash made from one keyboard form still matches the other.
 * Nothing here logs the password, the hash or the address; a failed rehash logs a fixed message with the error tag only.
 */

const normalized = (password: string) => password.normalize('NFKC')

export const hashLoginPassword = (password: string) => hashPassword(normalized(password))

/** True for a stored hash in the PBKDF2 format (what `verify` routes to PBKDF2 instead of scrypt). */
export const isPbkdf2Hash = (stored: string) => stored.startsWith('p1$')

/** The SDK's scrypt check; a malformed stored value (the SDK throws) is simply a failed check. */
const checkScrypt = (hash: string, password: string) =>
  Effect.tryPromise({ try: () => verifyScrypt({ hash, password }), catch: (cause) => new AuthError({ operation: 'verify', cause }) }).pipe(
    Effect.orElseSucceed(() => false),
  )

/**
 * Rewrites the credential account whose stored value is still `oldHash` to a PBKDF2 hash. The scrypt value carries a random
 * 16-byte salt, so it names exactly one account, and `WHERE password = <old>` makes the write a compare-and-swap: a second
 * concurrent sign-in, a reset or a change that landed in between all leave the row alone (0 rows updated).
 */
const rehash = (db: DrizzleD1Database<typeof schema>, oldHash: string, password: string) =>
  Effect.gen(function* () {
    const next = yield* hashLoginPassword(password)
    yield* Effect.tryPromise({
      try: () =>
        db
          .update(schema.account)
          .set({ password: next })
          .where(and(eq(schema.account.providerId, 'credential'), eq(schema.account.password, oldHash))),
      catch: (cause) => new AuthError({ operation: 'rehash', cause }),
    })
  }).pipe(
    // Never fails the sign-in: the next successful scrypt sign-in tries again.
    Effect.catch((error) => Effect.logError('password rehash failed').pipe(Effect.annotateLogs({ error: error._tag }))),
  )

export const verifyLoginPassword = (db: DrizzleD1Database<typeof schema>, rehashEnabled: boolean, stored: string, password: string) =>
  Effect.gen(function* () {
    if (isPbkdf2Hash(stored)) return yield* verifyPassword(stored, normalized(password))
    const ok = yield* checkScrypt(stored, password)
    if (ok && rehashEnabled) yield* rehash(db, stored, password)
    return ok
  })

/** The `emailAndPassword.password` option. The SDK wants Promises, so the programs run here at its boundary. */
export const loginPasswordOptions = (db: DrizzleD1Database<typeof schema>, rehashEnabled: boolean) => ({
  hash: (password: string) => Effect.runPromise(hashLoginPassword(password)),
  verify: ({ hash, password }: { hash: string; password: string }) =>
    Effect.runPromise(verifyLoginPassword(db, rehashEnabled, hash, password)),
})
