import { Effect, type Layer, Schema } from 'effect'
import { type Locale, localeFromHeader, locales } from '../emails/auth'
import { type AppError, ResourceUnavailable, ValidationError } from '../errors'
import { grantFileAccess, grantProjectAccess, listFileAccess, listProjectAccess, revokeFileAccess, revokeProjectAccess } from '../programs/access'
import { listActivity, listFileActivity } from '../programs/activity'
import { addComment, deleteComment, listComments, MAX_COMMENT_LENGTH } from '../programs/comments'
import { CommentAnchor } from '../scene'
import { listSharedByMe, listSharedWithMe } from '../programs/sharedFiles'
import { getFile, listFiles, renameFile, starFile, unstarFile } from '../programs/files'
import { moveFile, previewMoveFile } from '../programs/move'
import { emptyTrash, listTrash, purgeFile, restoreFile, trashFile } from '../programs/trash'
import { cancelUpload, completeUpload, requestUpload } from '../programs/uploads'
import { copyShareLink, createShareLink, getShareSettings, revokeShareLink, updateShareLink } from '../programs/links'
import { listVersions, restoreVersion } from '../programs/versions'
import { getInvitation } from '../programs/invitations'
import { acceptGuestInvitation, inviteGuest, revokeGuestInvitation } from '../programs/guests'
import { acceptInvitation, changeRole, inviteMember, listMembers, previewMemberRemoval, removeMember, revokeInvitation, transferOwnership } from '../programs/members'
import { archiveProject, createProject, listProjects, setProjectAccessMode, updateProject } from '../programs/projects'
import { type Caller, maxUnixSeconds } from '../programs/shared'
import { completeOnboarding, createWorkspace, listMyWorkspaces, needsOnboarding, selectWorkspace, switchWorkspace } from '../programs/workspaces'
import { AppConfig, type RateLimitAction } from '../services/AppConfig'
import type { Auth } from '../services/Auth'
import type { Background } from '../services/Background'
import type { Db } from '../services/Db'
import type { Email } from '../services/Email'
import type { Entitlements } from '../services/Entitlements'
import type { Storage } from '../services/Storage'
import { RateLimit } from '../services/RateLimit'
import { readBody } from './body'
import { checkMutationRequest } from './csrf'
import { handle, type RequestMeta } from './respond'
import { readCaller } from './session'

export type AppServices = Db | Auth | Email | RateLimit | AppConfig | Entitlements | Background | Storage

// Boundary schemas (docs/08 §1 "İstek sınırı"): every body is validated before a program runs.
const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))
const OneLine = (max: number) => Schema.String.check(Schema.isMaxLength(max), Schema.isPattern(/^[^\r\n\u2028\u2029]*$/))
const Name = OneLine(80).check(Schema.isPattern(/\S/))
const Description = Schema.NullOr(Schema.String.check(Schema.isMaxLength(2000)))
const EmailAddress = Schema.String.check(Schema.isMaxLength(254), Schema.isPattern(/^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/))
const InternalRole = Schema.Literals(['admin', 'member', 'commenter'])
const Level = Schema.Literals(['view', 'comment', 'download', 'edit'])
const GuestLevel = Schema.Literals(['view', 'comment', 'download'])
const LinkLevel = Schema.Literals(['view', 'download'])
const LinkPassword = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(128))
const AccessMode = Schema.Literals(['team', 'restricted'])
const Seconds = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maxUnixSeconds }))
const LocaleField = Schema.optional(Schema.Literals(locales))
const FileSize = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100000 }))
const MoveEffects = Schema.Struct({ links: Count, invitations: Count, guestGrants: Count, memberGrants: Count })
const Workspace = { workspaceId: Id }
/** `limit` and `cursor` of a paged list. */
const Page = (max: number) => ({
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: max }))),
  cursor: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(200)))),
})
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
  /** Throttled per IP and account before the body is read (invitation acceptance, upload requests). */
  readonly limit?: Extract<RateLimitAction, 'inviteAccept' | 'inviteLookup' | 'upload' | 'comment'>
  readonly run: (body: unknown, ctx: Context) => Effect.Effect<Result, AppError, AppServices>
}

const decode = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body, { onExcessProperty: 'error' }).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid request body' })))

/** An operation whose body is `fields`; the result is the program's value. */
type Fields = { readonly [key: string]: Schema.Top & { readonly DecodingServices: never } }

const op = <F extends Fields>(
  fields: F,
  run: (input: Schema.Struct<F>['Type'], ctx: Context) => Effect.Effect<unknown, AppError, AppServices>,
  limit?: Operation['limit'],
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
  previewMemberRemoval: op({ ...Workspace, userId: Id }, (input, { caller }) => previewMemberRemoval(caller, input)),
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
  listProjects: op(Workspace, (input, { caller }) => listProjects(caller, input)),
  listProjectAccess: op({ ...Workspace, projectId: Id }, (input, { caller }) => listProjectAccess(caller, input)),
  listFileAccess: op({ ...Workspace, fileId: Id }, (input, { caller }) => listFileAccess(caller, input)),
  grantFileAccess: op({ ...Grant, fileId: Id }, (input, { caller }) => grantFileAccess(caller, input)),
  revokeFileAccess: op({ ...Workspace, fileId: Id, userId: Id }, (input, { caller }) => revokeFileAccess(caller, input)),
  // Files: uploads (docs/09 §2). Unknown properties fail the schema, so a client cannot offer a key, MIME type or etag-less completion.
  requestUpload: op(
    { ...Workspace, projectId: Schema.optional(Id), targetFileId: Schema.optional(Id), name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)), size: FileSize },
    (input, { caller }) =>
      requestUpload(caller, {
        workspaceId: input.workspaceId, name: input.name, size: input.size,
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
        ...(input.targetFileId === undefined ? {} : { targetFileId: input.targetFileId }),
      }),
    'upload',
  ),
  completeUpload: op({ uploadId: Id, etag: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)) }, (input, { caller }) => completeUpload(caller, input)),
  cancelUpload: op({ uploadId: Id }, (input, { caller }) => cancelUpload(caller, input)),
  // Files: list, detail, rename, stars, trash, versions, move (docs/09 §5).
  listFiles: op(
    {
      ...Workspace, projectId: Schema.optional(Id), filter: Schema.optional(Schema.Literals(['all', 'recent', 'starred', 'mine'])),
      query: Schema.optional(Schema.String.check(Schema.isMaxLength(200))), sort: Schema.optional(Schema.Literals(['updated', 'created', 'name', 'size'])),
      direction: Schema.optional(Schema.Literals(['asc', 'desc'])), limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
      cursor: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(600)))),
    },
    (input, { caller }) =>
      listFiles(caller, {
        workspaceId: input.workspaceId, filter: input.filter ?? 'all', sort: input.sort ?? 'updated', limit: input.limit ?? 30, cursor: input.cursor ?? null,
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
        ...(input.query === undefined ? {} : { query: input.query }),
        ...(input.direction === undefined ? {} : { direction: input.direction }),
      }),
  ),
  getFile: op({ ...Workspace, fileId: Id }, (input, { caller }) => getFile(caller, input)),
  renameFile: op({ ...Workspace, fileId: Id, name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)) }, (input, { caller }) => renameFile(caller, input)),
  starFile: op({ ...Workspace, fileId: Id }, (input, { caller }) => starFile(caller, input)),
  unstarFile: op({ ...Workspace, fileId: Id }, (input, { caller }) => unstarFile(caller, input)),
  trashFile: op({ ...Workspace, fileId: Id }, (input, { caller }) => trashFile(caller, input)),
  restoreFile: op({ ...Workspace, fileId: Id }, (input, { caller }) => restoreFile(caller, input)),
  purgeFile: op({ ...Workspace, fileId: Id }, (input, { caller }) => purgeFile(caller, input)),
  emptyTrash: op(Workspace, (input, { caller }) => emptyTrash(caller, input)),
  listTrash: op(
    { ...Workspace, limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))), cursor: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(200)))) },
    (input, { caller }) => listTrash(caller, { workspaceId: input.workspaceId, limit: input.limit ?? 30, cursor: input.cursor ?? null }),
  ),
  listVersions: op({ ...Workspace, fileId: Id }, (input, { caller }) => listVersions(caller, input)),
  restoreVersion: op({ ...Workspace, fileId: Id, versionId: Id }, (input, { caller }) => restoreVersion(caller, input)),
  previewMoveFile: op({ ...Workspace, fileId: Id, targetProjectId: Schema.NullOr(Id) }, (input, { caller }) => previewMoveFile(caller, input)),
  moveFile: op(
    { ...Workspace, fileId: Id, targetProjectId: Schema.NullOr(Id), expected: Schema.optional(MoveEffects) },
    (input, { caller }) => moveFile(caller, {
      workspaceId: input.workspaceId, fileId: input.fileId, targetProjectId: input.targetProjectId,
      ...(input.expected === undefined ? {} : { expected: input.expected }),
    }),
  ),
  // Link sharing (docs/09 §4). Passwords travel only in these POST bodies.
  getShareSettings: op({ ...Workspace, fileId: Id }, (input, { caller }) => getShareSettings(caller, input)),
  createShareLink: op(
    { ...Workspace, fileId: Id, level: LinkLevel, expiresAt: Schema.optional(Schema.NullOr(Seconds)), password: Schema.optional(LinkPassword) },
    (input, { caller }) => createShareLink(caller, {
      workspaceId: input.workspaceId, fileId: input.fileId, level: input.level,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      ...(input.password === undefined ? {} : { password: input.password }),
    }),
  ),
  updateShareLink: op(
    { ...Workspace, fileId: Id, level: Schema.optional(LinkLevel), expiresAt: Schema.optional(Schema.NullOr(Seconds)), password: Schema.optional(Schema.NullOr(LinkPassword)) },
    (input, { caller }) => updateShareLink(caller, {
      workspaceId: input.workspaceId, fileId: input.fileId,
      ...(input.level === undefined ? {} : { level: input.level }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      ...(input.password === undefined ? {} : { password: input.password }),
    }),
  ),
  revokeShareLink: op({ ...Workspace, fileId: Id, linkId: Schema.optional(Id) }, (input, { caller }) =>
    revokeShareLink(caller, { workspaceId: input.workspaceId, fileId: input.fileId, ...(input.linkId === undefined ? {} : { linkId: input.linkId }) })),
  copyShareLink: op({ ...Workspace, fileId: Id, linkId: Schema.optional(Id) }, (input, { caller }) =>
    copyShareLink(caller, { workspaceId: input.workspaceId, fileId: input.fileId, ...(input.linkId === undefined ? {} : { linkId: input.linkId }) })),
  // Comments, file activity and the shared lists (docs/09 §6, §7.4, §5.1).
  listComments: op({ ...Workspace, fileId: Id, ...Page(100) }, (input, { caller }) =>
    listComments(caller, { workspaceId: input.workspaceId, fileId: input.fileId, limit: input.limit ?? 50, cursor: input.cursor ?? null })),
  addComment: op(
    {
      ...Workspace, fileId: Id, content: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_COMMENT_LENGTH * 2)), parentId: Schema.optional(Id),
      // A pin and the version it was placed on (the one open on the screen).
      anchor: Schema.optional(Schema.Struct({ ...CommentAnchor.fields, version: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })) })),
    },
    (input, { caller }) => addComment(caller, {
      workspaceId: input.workspaceId, fileId: input.fileId, content: input.content,
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      ...(input.anchor === undefined ? {} : { anchor: input.anchor }),
    }),
    'comment',
  ),
  deleteComment: op({ ...Workspace, commentId: Id }, (input, { caller }) => deleteComment(caller, input)),
  listFileActivity: op({ ...Workspace, fileId: Id, ...Page(100) }, (input, { caller }) =>
    listFileActivity(caller, { workspaceId: input.workspaceId, fileId: input.fileId, limit: input.limit ?? 50, cursor: input.cursor ?? null })),
  listSharedWithMe: op({ ...Workspace, ...Page(50) }, (input, { caller }) =>
    listSharedWithMe(caller, { workspaceId: input.workspaceId, limit: input.limit ?? 30, cursor: input.cursor ?? null })),
  listSharedByMe: op({ ...Workspace, ...Page(50) }, (input, { caller }) =>
    listSharedByMe(caller, { workspaceId: input.workspaceId, limit: input.limit ?? 30, cursor: input.cursor ?? null })),
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
 * `POST /api/app/<operation>`: product API for workspaces, members, invitations, projects, access, activity and uploads.
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
    const { caller, session } = yield* readCaller(request)
    if (operation.limit !== undefined) {
      const limiter = yield* RateLimit
      yield* limiter.hit({ action: operation.limit, ip: caller.ip })
      yield* limiter.hit({ action: operation.limit, target: caller.userId })
    }
    const body = yield* readBody(request)
    const result = yield* operation.run(body, {
      caller,
      request,
      activeWorkspaceId: session.activeWorkspaceId,
      locale: localeFromHeader(request.headers.get('accept-language')),
    })
    return sealed(result.data, result.headers)
  })

export const appResponse = (request: Request, layer: Layer.Layer<AppServices, AppError>, meta: RequestMeta) =>
  handle(appProgram(request), layer, meta)
