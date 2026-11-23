export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'commenter' | 'guest'
export type AccessLevel = 'view' | 'comment' | 'download' | 'edit'

interface Workspace {
  id: string
  kind: 'personal' | 'company'
  archived: boolean
}

interface Project {
  id: string
  workspaceId: string
  accessMode: 'team' | 'restricted'
  archived: boolean
  createdByUserId: string
  creatorManagerUserId: string | null
}

interface File {
  id: string
  workspaceId: string
  projectId: string | null
  trashed: boolean
  currentReadyVersionId: string | null
}

interface Version {
  id: string
  fileId: string
  ready: boolean
}

export interface PermissionLink {
  id: string
  workspaceId: string
  fileId: string
  level: string
  expiresAt: number | null
  legacyMaxExpiresAt: number | null
  revokedAt: number | null
  revision: number
  requiresPassword: boolean
}

export type PermissionActor =
  | { kind: 'anonymous' | 'removed' }
  | { kind: 'member'; userId: string; workspaceId: string; role: string; emailVerified: boolean }
  | {
    kind: 'link'
    /** The current row resolved by token digest, or null for an unknown token. */
    link: PermissionLink | null
    /** Claims supplied only after the program has verified the MAC. */
    passwordProof?: { linkId: string; revision: number; expiresAt: number }
  }

interface ScopedGrant {
  workspaceId: string
  userId: string
  level: string
  expiresAt: number | null
}

export interface ProjectGrant extends ScopedGrant {
  projectId: string
}

export interface FileGrant extends ScopedGrant {
  fileId: string
  source: 'grant' | 'uploader'
}

interface MembershipTarget {
  workspaceId: string
  userId: string
  role: string
}

interface GrantTarget {
  workspaceId: string
  resourceId: string
  role: string
  grantedByUserId: string | null
}

export type PermissionAction =
  | {
    kind: 'view' | 'preview' | 'comment' | 'download' | 'edit' | 'viewHistory'
      | 'shareFile' | 'trashFile' | 'restoreFile' | 'purgeFile' | 'uploadVersion' | 'moveFile'
      | 'createProject' | 'uploadFile' | 'uploadProjectFile' | 'updateProject'
      | 'manageMembers' | 'updateWorkspace' | 'listActivity' | 'listLinks'
      | 'archiveWorkspace' | 'selectWorkspace'
  }
  | { kind: 'viewComment'; authorUserId: string; authorScopeAtWrite: 'internal' | 'guest' | null; authorRole: WorkspaceRole | null }
  | { kind: 'grantProjectAccess' | 'grantFileAccess'; recipient: MembershipTarget; level: string }
  | { kind: 'revokeProjectAccess' | 'revokeFileAccess'; target: GrantTarget }
  | { kind: 'inviteMember'; role: string }
  | { kind: 'changeRole'; target: MembershipTarget; role: string }
  | { kind: 'removeMember'; target: MembershipTarget }
  | { kind: 'transferOwnership'; target: MembershipTarget }
  | { kind: 'billing'; available: boolean }

export interface PermissionInput {
  actor: PermissionActor
  workspace: Workspace
  project?: Project
  file?: File
  version?: Version
  projectGrant?: ProjectGrant
  fileGrant?: FileGrant
  action: PermissionAction
  /** UTC Unix seconds, including all expiry and password-proof claims. */
  now: number
}

export type DenialReason =
  | 'RESOURCE_UNAVAILABLE'
  | 'TENANT_MISMATCH'
  | 'NO_MEMBERSHIP'
  | 'ROLE_LIMIT'
  | 'INSUFFICIENT_LEVEL'
  | 'GRANT_EXPIRED'
  | 'VERSION_UNAVAILABLE'
  | 'PROJECT_MANAGER_REQUIRED'
  | 'LAST_OWNER'
  | 'FEATURE_UNAVAILABLE'
  | 'LINK_NO_COMMENTS'
  | 'LINK_EXPIRED'
  | 'LINK_REVOKED'
  | 'LINK_PROOF_REQUIRED'

export type PermissionDecision =
  | { readonly allowed: true; readonly reason: 'ALLOWED' }
  | { readonly allowed: false; readonly reason: DenialReason }

const allow: PermissionDecision = Object.freeze({ allowed: true, reason: 'ALLOWED' })
const deny = (reason: DenialReason): PermissionDecision => ({ allowed: false, reason })
const roleAllows = (condition: boolean) => condition ? allow : deny('ROLE_LIMIT')

function rank(level: string): number {
  switch (level) {
    case 'view': return 1
    case 'comment': return 2
    case 'download': return 3
    case 'edit': return 4
    default: return 0
  }
}

function roleCap(role: string): number {
  switch (role) {
    case 'guest': return rank('download')
    case 'commenter': return rank('comment')
    case 'owner':
    case 'admin':
    case 'member': return rank('edit')
    default: return 0
  }
}

function isLive(expiry: number | null, now: number) {
  return expiry === null || (Number.isSafeInteger(expiry) && now < expiry)
}

function grantRank(grant: ScopedGrant | undefined, guest: boolean, now: number): number {
  if (!grant || (guest && grant.expiresAt === null)) return 0
  return isLive(grant.expiresAt, now) ? rank(grant.level) : 0
}

function decideLink(input: PermissionInput, actor: Extract<PermissionActor, { kind: 'link' }>): PermissionDecision {
  const { action, file, version, now } = input
  const { link, passwordProof } = actor
  if (!file || !link || link.fileId !== file.id || !Number.isSafeInteger(link.revision) || link.revision < 1) {
    return deny('RESOURCE_UNAVAILABLE')
  }
  if (link.workspaceId !== input.workspace.id) return deny('TENANT_MISMATCH')
  if (link.revokedAt !== null) return deny('LINK_REVOKED')
  if (!isLive(link.expiresAt, now) || !isLive(link.legacyMaxExpiresAt, now)) return deny('LINK_EXPIRED')
  if (link.level !== 'view' && link.level !== 'download') return deny('RESOURCE_UNAVAILABLE')
  if (link.requiresPassword && (!passwordProof || passwordProof.linkId !== link.id
    || passwordProof.revision !== link.revision || !Number.isSafeInteger(passwordProof.expiresAt)
    || now >= passwordProof.expiresAt)) {
    return deny('LINK_PROOF_REQUIRED')
  }

  switch (action.kind) {
    case 'comment':
    case 'viewComment':
      return deny('LINK_NO_COMMENTS')
    case 'view':
    case 'preview':
    case 'download':
      if (!file.currentReadyVersionId || (version && (!version.ready || version.id !== file.currentReadyVersionId))) {
        return deny('VERSION_UNAVAILABLE')
      }
      return action.kind === 'download' && link.level !== 'download' ? deny('INSUFFICIENT_LEVEL') : allow
    default:
      return deny('ROLE_LIMIT')
  }
}

function canManageRole(role: string, targetRole: string) {
  return targetRole === 'member' || targetRole === 'commenter' || (role === 'owner' && targetRole === 'admin')
}

/**
 * Decides against the current, server-resolved resource and membership rows.
 * Programs re-read that state per request and guard any dependent writes in the same batch.
 */
export function decidePermission(input: PermissionInput): PermissionDecision {
  const { actor, workspace, project, file, version, action, now } = input
  if (!Number.isSafeInteger(now)) return deny('RESOURCE_UNAVAILABLE')
  if ((project && project.workspaceId !== workspace.id)
    || (file && (file.workspaceId !== workspace.id || file.projectId !== (project?.id ?? null)))
    || (version && version.fileId !== file?.id)) {
    return deny('TENANT_MISMATCH')
  }
  if (workspace.archived || (project && (project.archived
    || (project.accessMode !== 'team' && project.accessMode !== 'restricted')))
    || (file?.trashed && action.kind !== 'restoreFile' && action.kind !== 'purgeFile')) {
    return deny('RESOURCE_UNAVAILABLE')
  }
  if (actor.kind === 'link') return decideLink(input, actor)
  if (actor.kind !== 'member') return deny('NO_MEMBERSHIP')
  if (actor.workspaceId !== workspace.id) return deny('TENANT_MISMATCH')

  const { role, userId } = actor
  const cap = roleCap(role)
  const guest = role === 'guest'
  if (cap === 0 || (guest && !actor.emailVerified)) return deny('ROLE_LIMIT')
  const workspaceManager = role === 'owner' || role === 'admin'
  const writer = workspaceManager || role === 'member'
  const restricted = project?.accessMode === 'restricted'
  const projectManager = workspaceManager || (role === 'member'
    && project?.creatorManagerUserId === userId && project.createdByUserId === userId)

  const scopedProjectGrant = project && input.projectGrant?.projectId === project.id
    && input.projectGrant.workspaceId === workspace.id && input.projectGrant.userId === userId
    ? input.projectGrant : undefined
  const scopedFileGrant = file && input.fileGrant?.fileId === file.id
    && input.fileGrant.workspaceId === workspace.id && input.fileGrant.userId === userId
    && (input.fileGrant.source === 'grant' || (input.fileGrant.source === 'uploader' && !guest))
    ? input.fileGrant : undefined
  const baseline = workspaceManager ? rank('edit')
    : restricted || guest ? 0
    : role === 'member' ? rank('download') : rank('comment')
  const projectLevel = Math.min(cap, Math.max(baseline, grantRank(scopedProjectGrant, guest, now)))
  const level = Math.min(cap, Math.max(projectLevel, grantRank(scopedFileGrant, guest, now)))

  function requireLevel(required: AccessLevel): PermissionDecision {
    if (level >= rank(required)) return allow
    if (cap < rank(required)) return deny('ROLE_LIMIT')
    const expired = [scopedProjectGrant, scopedFileGrant].some((grant) =>
      grant && rank(grant.level) >= rank(required) && grant.expiresAt !== null
      && Number.isSafeInteger(grant.expiresAt) && now >= grant.expiresAt)
    return deny(expired ? 'GRANT_EXPIRED' : 'INSUFFICIENT_LEVEL')
  }

  function fileWrite(): PermissionDecision {
    if (!file) return deny('RESOURCE_UNAVAILABLE')
    return writer ? requireLevel('edit') : deny('ROLE_LIMIT')
  }

  function fileSharing(): PermissionDecision {
    const write = fileWrite()
    if (!write.allowed) return write
    return restricted && !projectManager ? deny('PROJECT_MANAGER_REQUIRED') : allow
  }

  function projectSharing(): PermissionDecision {
    if (!project) return deny('RESOURCE_UNAVAILABLE')
    return workspaceManager || (restricted && projectManager) ? allow : deny('PROJECT_MANAGER_REQUIRED')
  }

  switch (action.kind) {
    case 'view':
    case 'preview':
    case 'download': {
      if (action.kind === 'view' && !file) {
        return project ? requireLevel('view') : deny('RESOURCE_UNAVAILABLE')
      }
      if (!file) return deny('RESOURCE_UNAVAILABLE')
      if (guest || action.kind !== 'view' || version) {
        const ready = version ? version.ready : file.currentReadyVersionId !== null
        if (!ready || (guest && version && version.id !== file.currentReadyVersionId)) {
          return deny('VERSION_UNAVAILABLE')
        }
      }
      return requireLevel(action.kind === 'download' ? 'download' : 'view')
    }
    case 'comment':
      return file ? requireLevel('comment') : deny('RESOURCE_UNAVAILABLE')
    case 'viewComment': {
      if (!file) return deny('RESOURCE_UNAVAILABLE')
      const view = requireLevel('view')
      if (!view.allowed || !guest || action.authorUserId === userId) return view
      return roleAllows(action.authorScopeAtWrite === 'internal'
        && action.authorRole !== null && action.authorRole !== 'guest' && roleCap(action.authorRole) > 0)
    }
    case 'viewHistory':
      if (!file) return deny('RESOURCE_UNAVAILABLE')
      return guest ? deny('ROLE_LIMIT') : requireLevel('view')
    case 'edit':
    case 'trashFile':
    case 'uploadVersion':
    case 'moveFile':
      return fileWrite()
    case 'restoreFile':
    case 'purgeFile':
      if (!file?.trashed) return deny('RESOURCE_UNAVAILABLE')
      return action.kind === 'purgeFile' ? roleAllows(workspaceManager) : fileWrite()
    case 'shareFile':
      return fileSharing()
    case 'grantFileAccess':
    case 'grantProjectAccess': {
      if (action.recipient.workspaceId !== workspace.id) return deny('TENANT_MISMATCH')
      const sharing = action.kind === 'grantFileAccess' ? fileSharing() : projectSharing()
      if (!sharing.allowed) return sharing
      const requested = rank(action.level)
      return roleAllows(requested > 0 && requested <= roleCap(action.recipient.role))
    }
    case 'revokeFileAccess':
    case 'revokeProjectAccess': {
      if (action.target.workspaceId !== workspace.id) return deny('TENANT_MISMATCH')
      if (action.kind === 'revokeProjectAccess') {
        return project && action.target.resourceId === project.id ? projectSharing() : deny('RESOURCE_UNAVAILABLE')
      }
      if (!file || action.target.resourceId !== file.id) return deny('RESOURCE_UNAVAILABLE')
      const sharing = fileSharing()
      if (!sharing.allowed) return sharing
      return roleAllows(workspaceManager || (restricted && projectManager)
        || (action.target.role === 'guest' && action.target.grantedByUserId === userId))
    }
    case 'createProject':
      return roleAllows(writer)
    case 'uploadFile':
      return !project && !file ? roleAllows(writer) : deny('RESOURCE_UNAVAILABLE')
    case 'uploadProjectFile':
      if (!project) return deny('RESOURCE_UNAVAILABLE')
      if (!writer) return deny('ROLE_LIMIT')
      return !restricted || projectLevel >= rank('edit') ? allow : deny('INSUFFICIENT_LEVEL')
    case 'updateProject':
      return project ? roleAllows(workspaceManager) : deny('RESOURCE_UNAVAILABLE')
    case 'manageMembers':
      return roleAllows(workspace.kind === 'company' && workspaceManager)
    case 'inviteMember':
    case 'changeRole':
    case 'removeMember': {
      if (workspace.kind !== 'company' || !workspaceManager) return deny('ROLE_LIMIT')
      if (action.kind === 'inviteMember') return roleAllows(canManageRole(role, action.role))
      if (action.target.workspaceId !== workspace.id) return deny('TENANT_MISMATCH')
      if (action.target.role === 'owner') return deny('LAST_OWNER')
      return roleAllows(canManageRole(role, action.target.role)
        && (action.kind === 'removeMember' || canManageRole(role, action.role)))
    }
    case 'transferOwnership':
      if (action.target.workspaceId !== workspace.id) return deny('TENANT_MISMATCH')
      return roleAllows(role === 'owner' && workspace.kind === 'company' && action.target.userId !== userId
        && (action.target.role === 'admin' || action.target.role === 'member'))
    case 'updateWorkspace':
    case 'listActivity':
    case 'listLinks':
      return roleAllows(workspaceManager)
    case 'archiveWorkspace':
      return roleAllows(role === 'owner' && workspace.kind === 'company')
    case 'billing':
      if (role !== 'owner') return deny('ROLE_LIMIT')
      return action.available ? allow : deny('FEATURE_UNAVAILABLE')
    case 'selectWorkspace':
      // For guests, the caller evaluates each candidate scope until one live grant is found.
      return guest ? requireLevel('view') : allow
    default:
      return deny('RESOURCE_UNAVAILABLE')
  }
}
