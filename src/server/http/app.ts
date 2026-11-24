import { Effect, type Layer, Option, Schema } from 'effect'
import { type Locale, localeFromHeader, locales } from '../emails/auth'
import { type AppError, ResourceUnavailable, Unauthenticated, ValidationError } from '../errors'
import { grantFileAccess, grantProjectAccess, revokeFileAccess, revokeProjectAccess } from '../programs/access'
import { listActivity } from '../programs/activity'
import { getInvitation } from '../programs/invitations'
import { acceptGuestInvitation, inviteGuest, revokeGuestInvitation } from '../programs/guests'
import { acceptInvitation, changeRole, inviteMember, listMembers, removeMember, revokeInvitation, transferOwnership } from '../programs/members'
import { archiveProject, createProject, setProjectAccessMode, updateProject } from '../programs/projects'
import { type Caller, maxUnixSeconds } from '../programs/shared'
import { completeOnboarding, createWorkspace, listMyWorkspaces, needsOnboarding, selectWorkspace, switchWorkspace } from '../programs/workspaces'
import { AppConfig } from '../services/AppConfig'
import { Auth } from '../services/Auth'
import type { Background } from '../services/Background'
import type { Db } from '../services/Db'
import type { Email } from '../services/Email'
import type { Entitlements } from '../services/Entitlements'
import { RateLimit } from '../services/RateLimit'
import { readBody } from './body'
import { checkMutationRequest } from './csrf'
import { handle, type RequestMeta } from './respond'

export type AppServices = Db | Auth | Email | RateLimit | AppConfig | Entitlements | Background

// Boundary schemas (docs/08 §1 "İstek sınırı"): every body is validated before a program runs.
const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))
const OneLine = (max: number) => Schema.String.check(Schema.isMaxLength(max), Schema.isPattern(/^[^\r\n\u2028\u2029]*$/))
const Name = OneLine(80).check(Schema.isPattern(/\S/))
const Description = Schema.NullOr(Schema.String.check(Schema.isMaxLength(2000)))
const EmailAddress = Schema.String.check(Schema.isMaxLength(254), Schema.isPattern(/^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/))
const InternalRole = Schema.Literals(['admin', 'member', 'commenter'])
const Level = Schema.Literals(['view', 'comment', 'download', 'edit'])
const GuestLevel = Schema.Literals(['view', 'comment', 'download'])
const AccessMode = Schema.Literals(['team', 'restricted'])
const Seconds = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maxUnixSeconds }))
const LocaleField = Schema.optional(Schema.Literals(locales))
const Workspace = { workspaceId: Id }
const Grant = { ...Workspace, userId: Id, level: Level, expiresAt: Schema.NullOr(Seconds) }

interface Context {
  readonly caller: Caller
  readonly request: Request
  /** The session's selected workspace (for `currentWorkspace`). */
  readonly activeWorkspaceId: string | null
  /** Accept-Language of the request; a body `locale` overrides it for invitation mail. */
  readonly locale: Locale
}

interface Result {
  readonly data: unknown
  readonly headers?: Headers
}

interface Operation {
  /** Invitation acceptance is throttled per IP and account before the token is hashed or the row is read. */
  readonly limit?: 'inviteAccept' | 'inviteLookup'
  readonly run: (body: unknown, ctx: Context) => Effect.Effect<Result, AppError, AppServices>
}

const decode = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body, { onExcessProperty: 'error' }).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid request body' })))

/** An operation whose body is `fields`; the result is the program's value. */
type Fields = { readonly [key: string]: Schema.Top & { readonly DecodingServices: never } }

const op = <F extends Fields>(
  fields: F,
  run: (input: Schema.Struct<F>['Type'], ctx: Context) => Effect.Effect<unknown, AppError, AppServices>,
  limit?: 'inviteAccept' | 'inviteLookup',
): Operation => ({
  ...(limit === undefined ? {} : { limit }),
  run: (body, ctx) =>
    decode(Schema.Struct(fields), body).pipe(
      Effect.flatMap((input) => run(input, ctx)),
      Effect.map((data) => ({ data })),
    ),
})

const operations: Readonly<Record<string, Operation>> = {
  // Workspaces
  createWorkspace: op({ name: Name }, (input, { caller }) => createWorkspace(caller, { name: input.name.trim() })),
  listMyWorkspaces: op({}, (_, { caller }) => listMyWorkspaces(caller)),
  currentWorkspace: op({}, (_, { caller, activeWorkspaceId }) =>
    Effect.gen(function* () {
      const workspaceId = yield* selectWorkspace(caller, activeWorkspaceId)
      return { workspaceId, needsOnboarding: yield* needsOnboarding(caller) }
    })),
  completeOnboarding: op({}, (_, { caller }) => completeOnboarding(caller)),
  switchWorkspace: {
    run: (body, { caller, request }) =>
      decode(Schema.Struct(Workspace), body).pipe(
        Effect.flatMap((input) => switchWorkspace(caller, request.headers, input.workspaceId)),
        Effect.map(({ workspaceId, headers }) => ({ data: { workspaceId }, headers })),
      ),
  },
  // Members and invitations
  listMembers: op(Workspace, (input, { caller }) => listMembers(caller, input)),
  inviteMember: op({ ...Workspace, email: EmailAddress, role: InternalRole, locale: LocaleField }, (input, { caller, locale }) =>
    inviteMember(caller, { workspaceId: input.workspaceId, email: input.email, role: input.role, locale: input.locale ?? locale })),
  acceptInvitation: op({ invitationId: Id }, (input, { caller }) => acceptInvitation(caller, input), 'inviteAccept'),
  revokeInvitation: op({ ...Workspace, invitationId: Id }, (input, { caller }) => revokeInvitation(caller, input)),
  changeRole: op({ ...Workspace, userId: Id, role: InternalRole }, (input, { caller }) => changeRole(caller, input)),
  removeMember: op({ ...Workspace, userId: Id }, (input, { caller }) => removeMember(caller, input)),
  transferOwnership: op({ ...Workspace, userId: Id }, (input, { caller }) => transferOwnership(caller, input)),
  // Guests
  inviteGuest: op(
    { ...Workspace, fileId: Schema.optional(Id), projectId: Schema.optional(Id), email: EmailAddress, level: Schema.optional(GuestLevel), accessExpiresAt: Seconds, locale: LocaleField },
    (input, { caller, locale }) =>
      Effect.gen(function* () {
        const target = input.fileId !== undefined && input.projectId === undefined ? { fileId: input.fileId }
          : input.projectId !== undefined && input.fileId === undefined ? { projectId: input.projectId }
          : yield* new ValidationError({ message: 'exactly one of fileId, projectId' })
        return yield* inviteGuest(caller, {
          workspaceId: input.workspaceId, target, email: input.email, level: input.level ?? 'comment',
          accessExpiresAt: input.accessExpiresAt, locale: input.locale ?? locale,
        })
      }),
  ),
  acceptGuestInvitation: op({ token: Schema.String.check(Schema.isMinLength(16), Schema.isMaxLength(128)) }, (input, { caller }) => acceptGuestInvitation(caller, input), 'inviteAccept'),
  getInvitation: op(
    { invitationId: Schema.optional(Id), token: Schema.optional(Schema.String.check(Schema.isMinLength(16), Schema.isMaxLength(128))) },
    (input, { caller }) =>
      input.invitationId !== undefined && input.token === undefined ? getInvitation(caller, { kind: 'member', invitationId: input.invitationId })
      : input.token !== undefined && input.invitationId === undefined ? getInvitation(caller, { kind: 'guest', token: input.token })
      : Effect.fail(new ValidationError({ message: 'exactly one of invitationId, token' })),
    'inviteLookup',
  ),
  revokeGuestInvitation: op({ ...Workspace, invitationId: Id }, (input, { caller }) => revokeGuestInvitation(caller, input)),
  // Projects and access
  createProject: op({ ...Workspace, name: Name, description: Schema.optional(Description), accessMode: Schema.optional(AccessMode) }, (input, { caller }) =>
    createProject(caller, { workspaceId: input.workspaceId, name: input.name.trim(), description: input.description ?? null, accessMode: input.accessMode ?? 'team' })),
  updateProject: op({ ...Workspace, projectId: Id, name: Schema.optional(Name), description: Schema.optional(Description) }, (input, { caller }) =>
    updateProject(caller, {
      workspaceId: input.workspaceId, projectId: input.projectId,
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.description === undefined ? {} : { description: input.description }),
    })),
  archiveProject: op({ ...Workspace, projectId: Id }, (input, { caller }) => archiveProject(caller, input)),
  setProjectAccessMode: op({ ...Workspace, projectId: Id, accessMode: AccessMode }, (input, { caller }) => setProjectAccessMode(caller, input)),
  grantProjectAccess: op({ ...Grant, projectId: Id }, (input, { caller }) => grantProjectAccess(caller, input)),
  revokeProjectAccess: op({ ...Workspace, projectId: Id, userId: Id }, (input, { caller }) => revokeProjectAccess(caller, input)),
  grantFileAccess: op({ ...Grant, fileId: Id }, (input, { caller }) => grantFileAccess(caller, input)),
  revokeFileAccess: op({ ...Workspace, fileId: Id, userId: Id }, (input, { caller }) => revokeFileAccess(caller, input)),
  listActivity: op({ ...Workspace, limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))), cursor: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(200)))) }, (input, { caller }) =>
    listActivity(caller, { workspaceId: input.workspaceId, limit: input.limit ?? 50, cursor: input.cursor ?? null })),
}

export const operationNames = Object.keys(operations)

const PREFIX = '/api/app/'

const sealed = (data: unknown, extra?: Headers) => {
  const headers = new Headers(extra)
  headers.set('cache-control', 'private, no-store')
  headers.set('x-content-type-options', 'nosniff')
  return Response.json({ ok: true, data }, { status: 200, headers })
}

/**
 * `POST /api/app/<operation>`: product API for workspaces, members, invitations, projects, access and activity.
 * Order: known operation (else 404) -> CSRF (POST, trusted Origin, same-origin fetch, JSON) -> session (401; a
 * suspended account counts as none) -> rate limit where needed -> body schema (400) -> program. Responses are never
 * cached. better-auth's `/organization/*` stays closed; programs write the organization tables themselves.
 */
export const appProgram = (request: Request) =>
  Effect.gen(function* () {
    const { pathname } = new URL(request.url)
    const name = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : ''
    const operation = Object.hasOwn(operations, name) ? operations[name] : undefined
    if (operation === undefined) return yield* new ResourceUnavailable()
    const { trustedOrigins } = yield* AppConfig
    yield* checkMutationRequest(request, trustedOrigins)
    const session = yield* Auth.use((auth) => auth.readSession(request.headers))
    if (Option.isNone(session) || session.value.accountStatus !== 'active') return yield* new Unauthenticated()
    const ip = request.headers.get('cf-connecting-ip')
    const caller: Caller = {
      userId: session.value.userId,
      email: session.value.email,
      emailVerified: session.value.emailVerified,
      requestId: request.headers.get('cf-ray') ?? 'none',
      ip,
    }
    if (operation.limit !== undefined) {
      const limiter = yield* RateLimit
      yield* limiter.hit({ action: operation.limit, ip })
      yield* limiter.hit({ action: operation.limit, target: caller.userId })
    }
    const body = yield* readBody(request)
    const result = yield* operation.run(body, {
      caller,
      request,
      activeWorkspaceId: session.value.activeWorkspaceId,
      locale: localeFromHeader(request.headers.get('accept-language')),
    })
    return sealed(result.data, result.headers)
  })

export const appResponse = (request: Request, layer: Layer.Layer<AppServices, AppError>, meta: RequestMeta) =>
  handle(appProgram(request), layer, meta)
