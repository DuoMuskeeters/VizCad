/** Browser client for `POST /api/app/<operation>` (src/server/http/app.ts). No `effect` here: this code ships to the client. */

export type AppFailure = {
  readonly ok: false
  /** 0 = the request never reached the server. */
  readonly status: number
  /** Tagged error name from the server (`SeatLimitReached`, `WriteConflict` …), or `Network` / `Unknown`. */
  readonly error: string
  /** Only the user-safe permission reasons the server lets through (`LAST_OWNER`, `ROLE_LIMIT` …). */
  readonly reason?: string
}

export type AppResult<T> = { readonly ok: true; readonly data: T } | AppFailure

export type Call = <T>(operation: string, body?: Record<string, unknown>) => Promise<AppResult<T>>

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const makeCall =
  (fetcher: typeof fetch = (...args) => fetch(...args)): Call =>
  async <T>(operation: string, body: Record<string, unknown> = {}): Promise<AppResult<T>> => {
    try {
      const response = await fetcher(`/api/app/${operation}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await readJson(response)
      if (response.ok && json['ok'] === true) return { ok: true, data: json['data'] as T }
      const error = typeof json['error'] === 'string' ? json['error'] : 'Unknown'
      const reason = typeof json['reason'] === 'string' ? json['reason'] : undefined
      return { ok: false, status: response.status, error, ...(reason ? { reason } : {}) }
    } catch {
      return { ok: false, status: 0, error: 'Network' }
    }
  }

export type SessionUser = { readonly id: string; readonly name: string; readonly email: string }

/** The signed-in user from better-auth's `get-session`, or null when there is no session. */
export const readSessionUser = async (fetcher: typeof fetch = (...args) => fetch(...args)): Promise<SessionUser | null | 'error'> => {
  try {
    const response = await fetcher('/api/auth/get-session', { credentials: 'same-origin' })
    if (!response.ok) return response.status === 401 ? null : 'error'
    const body: unknown = await response.json().catch(() => null)
    if (typeof body !== 'object' || body === null) return null
    const user = (body as { user?: unknown }).user
    if (typeof user !== 'object' || user === null) return null
    const { id, name, email } = user as Record<string, unknown>
    if (typeof id !== 'string' || typeof email !== 'string') return null
    return { id, name: typeof name === 'string' && name !== '' ? name : email, email }
  } catch {
    return 'error'
  }
}

export type Role = 'owner' | 'admin' | 'member' | 'commenter' | 'guest'

export type WorkspaceSummary = {
  readonly id: string
  readonly name: string
  readonly kind: 'personal' | 'company'
  readonly role: Role
}

export type MemberView = {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly role: Role
  readonly joinedAt: number
}

export type InvitationView = {
  readonly id: string
  readonly email: string
  readonly role: string
  /** Unix seconds. */
  readonly expiresAt: number
}

export type TeamData = { readonly members: readonly MemberView[]; readonly invitations: readonly InvitationView[] }

/** The card of `getInvitation` (src/server/programs/invitations.ts), or `other_account` with nothing else. */
export type InvitationDetails =
  | { readonly state: 'other_account' }
  | {
      readonly state: 'pending' | 'expired' | 'canceled' | 'accepted'
      readonly kind: 'member' | 'guest'
      readonly workspaceName: string
      readonly inviterEmail: string | null
      readonly role: string | null
      readonly level: string | null
      readonly target: 'file' | 'project' | null
      /** Unix seconds. */
      readonly expiresAt: number
      readonly accessExpiresAt: number | null
      readonly emailMatches: boolean
    }
