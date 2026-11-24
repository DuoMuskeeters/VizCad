import { describe, expect, it } from 'vitest'
import { failureKey } from './errors'
import { problemFor } from './invite/InvitePage'
import { safeNext } from './nav'
import { assignableRoles, canManageMembers, canManageTarget, isDemotion } from './roles'
import { validateCompanyName } from './validation'
import { en, tr } from '#/i18n'

describe('error mapping', () => {
  it.each([
    ['WriteConflict', 'app.error.writeConflict'],
    ['SeatLimitReached', 'app.error.seatLimit'],
    ['GuestLimitReached', 'app.error.guestLimit'],
    ['WorkspaceLimitReached', 'app.error.workspaceLimit'],
    ['ProjectLimitReached', 'app.error.projectLimit'],
    ['RateLimitExceeded', 'app.error.rateLimit'],
    ['LastOwner', 'app.error.lastOwner'],
    ['EmailUnverified', 'app.error.emailUnverified'],
    ['Network', 'app.error.network'],
    ['SomethingNew', 'app.error.generic'],
  ])('%s -> %s', (error, key) => {
    expect(failureKey({ error })).toBe(key)
  })

  it('uses the safe permission reason the server sends', () => {
    expect(failureKey({ error: 'PermissionDenied', reason: 'LAST_OWNER' })).toBe('app.error.lastOwner')
    expect(failureKey({ error: 'PermissionDenied', reason: 'ROLE_LIMIT' })).toBe('app.error.roleLimit')
    expect(failureKey({ error: 'PermissionDenied' })).toBe('app.error.roleLimit')
  })

  it('has an English and a Turkish sentence for every mapped key', () => {
    for (const tag of ['WriteConflict', 'SeatLimitReached', 'GuestLimitReached', 'WorkspaceLimitReached', 'RateLimitExceeded', 'InvitationExpired']) {
      const key = failureKey({ error: tag })
      expect(en[key]).toBeTruthy()
      expect(tr[key]).toBeTruthy()
    }
  })
})

describe('invitation problems', () => {
  it('tells expired, other-account, already-member and full apart', () => {
    expect(problemFor({ error: 'InvitationExpired' }).title).toBe('app.invite.expired.title')
    const other = problemFor({ error: 'InvitationUnavailable' })
    expect(other.title).toBe('app.invite.unavailable.title')
    expect(other.otherAccount).toBe(true)
    expect(problemFor({ error: 'InvitationConflict' }).title).toBe('app.invite.conflict.title')
    expect(problemFor({ error: 'SeatLimitReached' })).toMatchObject({ title: 'app.invite.full.title', lead: 'app.error.seatLimit' })
    expect(problemFor({ error: 'EmailUnverified' }).title).toBe('app.invite.unverified.title')
  })
})

describe('role abilities (mirror of permissions.ts)', () => {
  const company = (role: 'owner' | 'admin' | 'member' | 'commenter' | 'guest') => ({ kind: 'company' as const, role })
  it('only owners and admins of a company workspace manage members', () => {
    expect(canManageMembers(company('owner')).allowed).toBe(true)
    expect(canManageMembers(company('admin')).allowed).toBe(true)
    for (const role of ['member', 'commenter', 'guest'] as const) expect(canManageMembers(company(role))).toEqual({ allowed: false, reason: 'app.team.reason.notManager' })
    expect(canManageMembers({ kind: 'personal', role: 'owner' })).toEqual({ allowed: false, reason: 'app.team.reason.personal' })
  })

  it('protects the owner, yourself and (for admins) other admins', () => {
    expect(canManageTarget(company('admin'), 'owner', false)).toEqual({ allowed: false, reason: 'app.team.reason.owner' })
    expect(canManageTarget(company('owner'), 'admin', true)).toEqual({ allowed: false, reason: 'app.team.reason.self' })
    expect(canManageTarget(company('admin'), 'admin', false)).toEqual({ allowed: false, reason: 'app.team.reason.adminByOwner' })
    expect(canManageTarget(company('owner'), 'admin', false).allowed).toBe(true)
    expect(canManageTarget(company('admin'), 'guest', false).allowed).toBe(true)
  })

  it('hands out admin only as owner', () => {
    expect(assignableRoles('owner')).toEqual(['admin', 'member', 'commenter'])
    expect(assignableRoles('admin')).toEqual(['member', 'commenter'])
  })

  it('recognises a demotion', () => {
    expect(isDemotion('admin', 'member')).toBe(true)
    expect(isDemotion('member', 'commenter')).toBe(true)
    expect(isDemotion('commenter', 'member')).toBe(false)
    expect(isDemotion('guest', 'commenter')).toBe(false)
  })
})

describe('safeNext', () => {
  it('keeps same-site paths and drops everything else', () => {
    expect(safeNext('/invite/abc')).toBe('/invite/abc')
    expect(safeNext('/guest-invite/x?y=1')).toBe('/guest-invite/x?y=1')
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil', 'javascript:alert(1)', '', undefined, 5, '/a\nb']) expect(safeNext(bad)).toBeUndefined()
  })
})

describe('company name', () => {
  it('needs 2 to 80 characters on one line', () => {
    expect(validateCompanyName(' a ')).toBe('app.workspace.nameTooShort')
    expect(validateCompanyName('x'.repeat(81))).toBe('app.workspace.nameInvalid')
    expect(validateCompanyName('Demir\nMakina')).toBe('app.workspace.nameInvalid')
    expect(validateCompanyName('Demir Makina')).toBeNull()
  })
})
