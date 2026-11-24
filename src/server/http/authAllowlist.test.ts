import { assert, describe, it } from 'vitest'
import { Option } from 'effect'
import { GET_ROUTES, matchIdentityRoute, POST_ROUTES } from './authAllowlist'

const allowed = (method: string, path: string) => Option.isSome(matchIdentityRoute(method, path))
const url = (path: string) => new URL(`https://vizcad.test${path}`).pathname

describe('identity allowlist', () => {
  it('allows exactly the documented (method, path) pairs', () => {
    assert.deepStrictEqual(Object.keys(POST_ROUTES).sort(), [
      '/request-password-reset',
      '/reset-password',
      '/send-verification-email',
      '/sign-in/email',
      '/sign-in/social',
      '/sign-out',
      '/sign-up/email',
    ])
    assert.deepStrictEqual(Object.keys(GET_ROUTES).sort(), ['/callback/google', '/get-session', '/verify-email'])
    for (const path of Object.keys(POST_ROUTES)) assert.isTrue(allowed('POST', `/api/auth${path}`), path)
    for (const path of Object.keys(GET_ROUTES)) assert.isTrue(allowed('GET', `/api/auth${path}`), path)
    assert.isTrue(allowed('GET', '/api/auth/reset-password/AbC_123-xyz'))
  })

  it('a method is only allowed on its own paths', () => {
    for (const path of Object.keys(POST_ROUTES)) assert.isFalse(allowed('GET', `/api/auth${path}`), `GET ${path}`)
    for (const path of Object.keys(GET_ROUTES)) assert.isFalse(allowed('POST', `/api/auth${path}`), `POST ${path}`)
    assert.isFalse(allowed('POST', '/api/auth/reset-password/sometoken'))
    for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'get', 'post']) assert.isFalse(allowed(method, '/api/auth/get-session'), method)
  })

  it('every /organization/* and /admin/* path is closed, with any method', () => {
    const paths = [
      '/organization/create',
      '/organization/get-full-organization',
      '/organization/list-members',
      '/organization/list-invitations',
      '/organization/get-active-member-role',
      '/organization/set-active',
      '/organization/accept-invitation',
      '/organization/update-member-role',
      '/organization/remove-member',
      '/organization/delete',
      '/organization/',
      '/organization',
      '/admin/list-users',
      '/admin/set-role',
      '/admin/remove-user',
      '/admin/impersonate-user',
      '/admin/',
    ]
    for (const path of paths) for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.isFalse(allowed(method, `/api/auth${path}`), `${method} ${path}`)
  })

  it('other sensitive SDK endpoints are closed', () => {
    for (const path of ['/update-user', '/delete-user', '/delete-user/callback', '/link-social', '/unlink-account', '/get-access-token', '/refresh-token', '/account-info', '/list-accounts', '/list-sessions', '/revoke-session', '/revoke-sessions', '/change-password', '/change-email', '/set-password', '/sign-in/anonymous', '/error', '/ok', '/callback/github', '/callback/credential']) {
      for (const method of ['GET', 'POST']) assert.isFalse(allowed(method, `/api/auth${path}`), `${method} ${path}`)
    }
  })

  it('non-canonical variants are 404: trailing or double slash, encoded separators, dot segments, case', () => {
    for (const path of [
      '/api/auth/sign-in/email/',
      '/api/auth//sign-in/email',
      '/api/auth/sign-in//email',
      '/api/auth/sign-in%2Femail',
      '/api/auth/sign-in%2femail',
      '/api/auth/sign%2Din/email',
      '/api/auth/%73ign-in/email',
      '/api/auth/sign-in/email%2F',
      '/api/auth/Sign-In/Email',
      '/api/auth/SIGN-IN/EMAIL',
      '/api/auth/sign-in/email%00',
      '/api/auth/sign-in\\email',
      '/API/AUTH/sign-in/email',
      '/api/Auth/sign-in/email',
      '/api/auth',
      '/api/auth/',
      '/api/authx/sign-in/email',
      '/sign-in/email',
    ]) {
      assert.isFalse(allowed('POST', path), path)
    }
    for (const path of ['/api/auth/get-session/', '/api/auth/GET-SESSION', '/api/auth/get-session%2F', '/api/auth/reset-password/a%2Fb', '/api/auth/reset-password/a/b', '/api/auth/reset-password/', '/api/auth/reset-password//tok', '/api/auth/reset-password/tok/', '/api/auth/reset-password/to%6Ben', '/api/auth/reset-password/..']) {
      assert.isFalse(allowed('GET', path), path)
    }
  })

  it('dot segments normalised by the URL parser can never reach an allowlisted path under another prefix', () => {
    // The WHATWG parser resolves these before the handler sees them, so they either match a canonical allowed path or none.
    assert.isFalse(allowed('GET', url('/api/auth/../auth/organization/list-members')))
    assert.isFalse(allowed('GET', url('/api/auth/%2e%2e/organization/list-members')))
    assert.isFalse(allowed('POST', url('/api/auth/sign-in/../organization/create')))
    assert.isFalse(allowed('POST', url('/api/auth/sign-in/%2e%2e/admin/remove-user')))
  })

  it('reset token segments must be URL-safe and bounded', () => {
    assert.isFalse(allowed('GET', `/api/auth/reset-password/${'a'.repeat(129)}`))
    assert.isTrue(allowed('GET', `/api/auth/reset-password/${'a'.repeat(128)}`))
    assert.isFalse(allowed('GET', '/api/auth/reset-password/tok en'))
    assert.isFalse(allowed('GET', '/api/auth/reset-password/tok.en'))
  })

  it('inherited object keys are not routes', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.isFalse(allowed('POST', `/api/auth/${key}`), key)
      assert.isFalse(allowed('GET', `/api/auth/${key}`), key)
    }
  })
})
