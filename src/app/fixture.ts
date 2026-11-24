/**
 * In-memory stand-in for `/api/app/*` and `/api/auth/get-session`: used by tests and, in development only,
 * by `?fixture=<scenario>` on /app, /onboarding and /invite/* (session.tsx). Never imported in production builds.
 */
import type { InvitationView, MemberView, Role, WorkspaceSummary } from './api'

export type Scenario =
  | 'owner'
  | 'admin'
  | 'commenter'
  | 'guest'
  | 'personal'
  | 'empty-team'
  | 'anon'
  | 'invite-ok'
  | 'invite-expired'
  | 'invite-other'
  | 'invite-full'
  | 'invite-canceled'
  | 'invite-guest-other'

const day = 86_400
const now = () => Math.floor(Date.now() / 1000)

const people = (): MemberView[] => [
  { userId: 'u-hakan', name: 'Hakan Demir', email: 'hakan@demirmakina.com', role: 'owner', joinedAt: now() - 400 * day },
  { userId: 'u-me', name: 'Ayşe Yılmaz', email: 'ayse@demirmakina.com', role: 'admin', joinedAt: now() - 300 * day },
  { userId: 'u-mehmet', name: 'Mehmet Kaya', email: 'mehmet@demirmakina.com', role: 'member', joinedAt: now() - 120 * day },
  { userId: 'u-zeynep', name: 'Zeynep Arslan', email: 'zeynep@demirmakina.com', role: 'member', joinedAt: now() - 90 * day },
  { userId: 'u-selin', name: 'Selin Er', email: 'selin@demirmakina.com', role: 'commenter', joinedAt: now() - 30 * day },
  { userId: 'u-omer', name: 'Ömer Koç', email: 'omer@koc-kalip.com.tr', role: 'guest', joinedAt: now() - 9 * day },
  { userId: 'u-derya', name: 'Derya Kaya', email: 'derya@kayahidrolik.com', role: 'guest', joinedAt: now() - 4 * day },
]

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fail = (status: number, error: string, reason?: string) => json(status, { ok: false, error, ...(reason ? { reason } : {}) })

export const fixtureFetch = (scenario: string): typeof fetch => {
  const name = scenario as Scenario
  const inviteScenario = name.startsWith('invite-')
  const myRole: Role = name === 'owner' ? 'owner' : name === 'commenter' ? 'commenter' : name === 'guest' ? 'guest' : 'admin'
  const user = { id: 'u-me', name: 'Ayşe Yılmaz', email: 'ayse@demirmakina.com' }
  const personal: WorkspaceSummary = { id: 'ws-personal', name: 'Personal', kind: 'personal', role: 'owner' }
  const company: WorkspaceSummary = { id: 'ws-dm', name: 'Demir Makina', kind: 'company', role: myRole }
  const guestOf: WorkspaceSummary = { id: 'ws-kaya', name: 'Kaya Hidrolik', kind: 'company', role: 'guest' }
  let workspaces: WorkspaceSummary[] =
    name === 'personal' || name === 'empty-team' || inviteScenario ? [personal] : name === 'guest' ? [personal, guestOf] : [personal, company, guestOf]
  let active = name === 'personal' || name === 'empty-team' || inviteScenario ? personal.id : name === 'guest' ? guestOf.id : company.id
  let members = people()
  if (name === 'guest') members = [{ userId: 'u-me', name: user.name, email: user.email, role: 'guest', joinedAt: now() - 4 * day }]
  if (myRole !== 'admin') members = members.map((m) => (m.userId === 'u-me' && name !== 'guest' ? { ...m, role: myRole } : m))
  if (name === 'owner') members = members.map((m) => (m.userId === 'u-hakan' ? { ...m, role: 'admin' as const } : m))
  let invitations: InvitationView[] = [
    { id: 'inv-1', email: 'elif@demirmakina.com', role: 'member', expiresAt: now() + 5 * day },
    { id: 'inv-2', email: 'kerem@demirmakina.com', role: 'commenter', expiresAt: now() + 2 * day },
  ]
  let n = 0

  const app = (operation: string, body: Record<string, unknown>): Response => {
    switch (operation) {
      case 'listMyWorkspaces':
        return json(200, { ok: true, data: workspaces })
      case 'currentWorkspace':
        return json(200, { ok: true, data: { workspaceId: active } })
      case 'switchWorkspace': {
        const id = String(body['workspaceId'])
        if (!workspaces.some((w) => w.id === id)) return fail(404, 'WorkspaceUnavailable')
        active = id
        return json(200, { ok: true, data: { workspaceId: id } })
      }
      case 'createWorkspace': {
        const created: WorkspaceSummary = { id: `ws-new-${++n}`, name: String(body['name']), kind: 'company', role: 'owner' }
        workspaces = [...workspaces, created]
        members = [{ userId: 'u-me', name: user.name, email: user.email, role: 'owner', joinedAt: now() }]
        invitations = []
        return json(200, { ok: true, data: created })
      }
      case 'listMembers': {
        const manager = myRole === 'owner' || myRole === 'admin'
        const visible = (workspaces.find((w) => w.id === body['workspaceId'])?.role ?? myRole) === 'guest' ? members.filter((m) => m.userId === 'u-me') : members
        return json(200, { ok: true, data: { members: visible, invitations: manager ? invitations : [] } })
      }
      case 'inviteMember': {
        const email = String(body['email']).trim().toLowerCase()
        if (email.startsWith('full')) return fail(409, 'SeatLimitReached')
        if (email.startsWith('limit')) return fail(429, 'RateLimitExceeded')
        const found = invitations.find((i) => i.email === email)
        const role = String(body['role'])
        if (found) invitations = invitations.map((i) => (i === found ? { ...i, role, expiresAt: now() + 7 * day } : i))
        else invitations = [...invitations, { id: `inv-${++n + 2}`, email, role, expiresAt: now() + 7 * day }]
        return json(200, { ok: true, data: { email, role, resent: Boolean(found) } })
      }
      case 'revokeInvitation':
        invitations = invitations.filter((i) => i.id !== body['invitationId'])
        return json(200, { ok: true, data: { canceled: true } })
      case 'changeRole': {
        const target = members.find((m) => m.userId === body['userId'])
        if (!target) return fail(404, 'MemberUnavailable')
        if (target.role === 'owner') return fail(403, 'PermissionDenied', 'LAST_OWNER')
        members = members.map((m) => (m === target ? { ...m, role: body['role'] as Role } : m))
        return json(200, { ok: true, data: { userId: target.userId, role: body['role'] } })
      }
      case 'removeMember':
        members = members.filter((m) => m.userId !== body['userId'])
        return json(200, { ok: true, data: { removed: true } })
      case 'getInvitation': {
        const guest = body['token'] !== undefined
        if (name === 'invite-other' && !guest) return json(200, { ok: true, data: { state: 'other_account' } })
        const state = name === 'invite-expired' ? 'expired' : name === 'invite-canceled' ? 'canceled' : 'pending'
        return json(200, {
          ok: true,
          data: {
            state, kind: guest ? 'guest' : 'member', workspaceName: 'Demir Makina', inviterEmail: 'mehmet@demirmakina.com',
            role: guest ? null : 'member', level: guest ? 'download' : null, target: guest ? 'project' : null,
            expiresAt: now() + 5 * day, accessExpiresAt: guest ? now() + 30 * day : null, emailMatches: name !== 'invite-guest-other',
          },
        })
      }
      case 'acceptInvitation':
      case 'acceptGuestInvitation':
        if (name === 'invite-expired') return fail(410, 'InvitationExpired')
        if (name === 'invite-other') return fail(404, 'InvitationUnavailable')
        if (name === 'invite-full') return fail(409, 'SeatLimitReached')
        workspaces = [...workspaces, company]
        return json(200, { ok: true, data: { workspaceId: company.id, role: 'member' } })
      default:
        return fail(404, 'ResourceUnavailable')
    }
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://fixture.local')
    if (url.pathname === '/api/auth/get-session') return json(200, name === 'anon' ? null : { session: { id: 's' }, user: { ...user, emailVerified: true } })
    if (url.pathname === '/api/auth/sign-out') return json(200, { success: true })
    if (url.pathname.startsWith('/api/app/')) {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>
      } catch {
        body = {}
      }
      await Promise.resolve()
      return app(url.pathname.slice('/api/app/'.length), body)
    }
    return json(404, { ok: false, error: 'ResourceUnavailable' })
  }) as typeof fetch
}
