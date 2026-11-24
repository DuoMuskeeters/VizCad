import { assert, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { vi } from 'vitest'
import { openMemoryD1 } from '../testing/memoryD1'
import * as AppConfig from './AppConfig'
import { Auth } from './Auth'
import * as AuthLive from './Auth.live'
import { memory as emailMemory } from './Email'

const state = vi.hoisted(() => ({ calls: 0 }))
vi.mock('./authOptions', () => ({
  createAuth: () => {
    state.calls += 1
    if (state.calls === 1) throw new Error('chunk did not load')
    return { handler: () => Promise.resolve(new Response('ok')) }
  },
}))

it.effect('a failed SDK setup is not kept: the next identity request tries again', () => {
  const layer = AuthLive.layer(openMemoryD1().binding).pipe(Layer.provideMerge(emailMemory), Layer.provide(AppConfig.test()))
  return Effect.gen(function* () {
    const request = () => new Request('https://vizcad.test/api/auth/sign-in/email', { method: 'POST' })
    const first = yield* Auth.use((a) => a.handleIdentityRequest(request())).pipe(Effect.flip)
    assert.strictEqual(first._tag, 'AuthError')
    const second = yield* Auth.use((a) => a.handleIdentityRequest(request()))
    assert.strictEqual(yield* Effect.promise(() => second.text()), 'ok')
    assert.strictEqual(state.calls, 2)
  }).pipe(Effect.provide(layer))
})
