import { assert, describe, it, vi } from 'vitest'

// The Durable Object base class only exists in workerd; a minimal stand-in lets the counting logic run in Node.
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}))

const { RateLimiter } = await import('./RateLimiter')

const fakeStorage = () => {
  const data = new Map<string, unknown>()
  const state = { alarm: undefined as number | undefined }
  return {
    data,
    state,
    storage: {
      get: (key: string) => Promise.resolve(data.get(key)),
      put: (key: string, value: unknown) => (data.set(key, value), Promise.resolve()),
      setAlarm: (at: number) => ((state.alarm = at), Promise.resolve()),
      deleteAll: () => (data.clear(), Promise.resolve()),
    },
  }
}

const make = () => {
  const fake = fakeStorage()
  const limiter = new RateLimiter({ storage: fake.storage } as never, {} as never)
  return { fake, limiter }
}

describe('RateLimiter Durable Object', () => {
  it('counts hits, denies over the limit and schedules cleanup', async () => {
    const { fake, limiter } = make()
    const rule = { limit: 2, windowSeconds: 60 }
    assert.isTrue((await limiter.hit(rule)).allowed)
    assert.isTrue((await limiter.hit(rule)).allowed)
    const denied = await limiter.hit(rule)
    assert.isFalse(denied.allowed)
    assert.isAbove(denied.retryAfterSeconds, 0)
    assert.isDefined(fake.state.alarm)
    assert.strictEqual((fake.data.get('window') as { count: number }).count, 2)
  })

  it('alarm clears the stored window', async () => {
    const { fake, limiter } = make()
    await limiter.hit({ limit: 1, windowSeconds: 60 })
    await limiter.alarm()
    assert.strictEqual(fake.data.size, 0)
  })

  it('refuses invalid rules without storing anything', async () => {
    const { fake, limiter } = make()
    assert.isFalse((await limiter.hit({ limit: 1, windowSeconds: 0 })).allowed)
    assert.strictEqual(fake.data.size, 0)
  })
})
