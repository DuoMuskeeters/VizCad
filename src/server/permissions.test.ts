import { describe, expect, it } from 'vitest'
import {
  decidePermission,
  type AccessLevel,
  type PermissionAction,
  type PermissionActor,
  type PermissionInput,
  type PermissionLink,
  type ProjectGrant,
} from './permissions'

const now = 100
const workspace = { id: 'a', kind: 'company', archived: false } as const
const file = { id: 'f', workspaceId: 'a', projectId: null, trashed: false, currentReadyVersionId: 'v2' } as const
const project = { id: 'p', workspaceId: 'a', createdByUserId: 'u', creatorManagerUserId: null, archived: false } as const
const link: PermissionLink = {
  id: 'l', workspaceId: 'a', fileId: 'f', level: 'download', expiresAt: null,
  legacyMaxExpiresAt: null, revokedAt: null, revision: 1, requiresPassword: false,
}
const asMember = (role: string, workspaceId = 'a'): Extract<PermissionActor, { kind: 'member' }> => ({
  kind: 'member', workspaceId, role, userId: 'u', emailVerified: true,
})
const asLink = (patch: Partial<PermissionLink> = {}): PermissionActor => ({ kind: 'link', link: { ...link, ...patch } })
const fileGrant = { fileId: 'f', workspaceId: 'a', userId: 'u', source: 'grant', level: 'edit', expiresAt: null } as const
const projectGrant = { projectId: 'p', workspaceId: 'a', userId: 'u', level: 'edit', expiresAt: null } as const
const defaultInput = {
  actor: asMember('member'), workspace, file, now, action: { kind: 'view' },
} satisfies PermissionInput

const modes = ['standalone', 'team', 'restricted'] as const
type Mode = (typeof modes)[number]
const levels = [null, 'view', 'comment', 'download', 'edit'] as const
type Level = AccessLevel | null
const contentActions = [{ kind: 'view' }, { kind: 'comment' }, { kind: 'download' }, { kind: 'edit' }] as const

function resource(mode: Mode): Pick<PermissionInput, 'project' | 'file'> {
  return mode === 'standalone' ? { file } : {
    project: { ...project, accessMode: mode },
    file: { ...file, projectId: project.id },
  }
}

const none = ['0000', '0000', '0000', '0000', '0000']
const all = ['1111', '1111', '1111', '1111', '1111']
const acrossModes = (actor: string, vectors: string[]) => modes.map((mode) => ({ actor, mode, vectors }))

// §4, in ascending order from no matching grant to edit.
const rows = [
  ...acrossModes('owner', all),
  ...acrossModes('admin', all),
  { actor: 'member', mode: 'standalone', vectors: ['1110', '1110', '1110', '1110', '1111'] },
  { actor: 'member', mode: 'team', vectors: ['1110', '1110', '1110', '1110', '1111'] },
  { actor: 'member', mode: 'restricted', vectors: ['0000', '1000', '1100', '1110', '1111'] },
  ...acrossModes('uploader', all),
  { actor: 'creator', mode: 'restricted', vectors: all },
  { actor: 'commenter', mode: 'standalone', vectors: ['1100', '1100', '1100', '1100', '1100'] },
  { actor: 'commenter', mode: 'team', vectors: ['1100', '1100', '1100', '1100', '1100'] },
  { actor: 'commenter', mode: 'restricted', vectors: ['0000', '1000', '1100', '1100', '1100'] },
  ...acrossModes('guest', ['0000', '1000', '1100', '1110', '1110']),
  ...acrossModes('link', ['0000', '1000', '0000', '1010', '0000']),
  ...acrossModes('anonymous', none),
  ...acrossModes('removed', none),
] satisfies Array<{ actor: string; mode: Mode; vectors: string[] }>

function cellInput(actor: string, mode: Mode, p: Level, f: Level): PermissionInput {
  const result = { ...defaultInput, ...resource(mode) }
  if (actor === 'link') return { ...result, actor: { kind: 'link', link: f ? { ...link, level: f } : null } }
  if (actor === 'anonymous' || actor === 'removed') return { ...result, actor: { kind: actor } }

  const input: PermissionInput = {
    ...result, actor: asMember(actor === 'uploader' || actor === 'creator' ? 'member' : actor),
  }
  const expiresAt = actor === 'guest' ? now + 1 : null
  if (p) input.projectGrant = { ...projectGrant, level: p, expiresAt }
  if (f) input.fileGrant = { ...fileGrant, level: f, expiresAt }
  if (actor === 'uploader') input.fileGrant = { ...fileGrant, source: 'uploader' }
  if (actor === 'creator' && input.project) {
    input.project = { ...input.project, creatorManagerUserId: 'u' }
    input.projectGrant = projectGrant
  }
  return input
}

const fileCells = rows.flatMap(({ actor, mode, vectors }) =>
  (mode === 'standalone' || actor === 'link' ? [null] : levels).flatMap((p) => levels.map((f) => ({
    name: `${actor}, ${mode}, project=${p}, file/link=${f}`,
    input: cellInput(actor, mode, p, f),
    actor, mode, p,
    vector: vectors[Math.max(levels.indexOf(p), levels.indexOf(f))],
  }))),
)

describe('§4 content matrix', () => {
  it.each(fileCells)('$name', ({ input, vector }) => {
    const bits = contentActions.map((action) => Number(decidePermission({ ...input, action }).allowed)).join('')
    expect(bits).toBe(vector)
  })

  const projectCells = rows.filter(({ mode }) => mode !== 'standalone').flatMap(({ actor, mode, vectors }) =>
    levels.map((p, index) => ({
      name: `${actor}, ${mode}, project=${p}, file=edit`,
      input: cellInput(actor, mode, p, 'edit'),
      expected: actor === 'uploader'
        ? mode === 'team' || p !== null
        : actor !== 'link' && vectors[index]?.[0] === '1',
    })),
  )

  it.each(projectCells)('project view: $name', ({ input, expected }) => {
    const { file: _file, ...scope } = input
    expect(decidePermission(scope).allowed).toBe(expected)
  })
})

const targetMember = { workspaceId: 'a', userId: 'target', role: 'member' } as const
const targetGuest = { ...targetMember, role: 'guest' } as const
const managementCases = fileCells.flatMap(({ actor, mode, input, name, p, vector }) => {
  const manager = actor === 'owner' || actor === 'admin'
  const isOwner = actor === 'owner'
  const creator = actor === 'creator'
  const hasProject = mode !== 'standalone'
  const writer = manager || actor === 'member' || actor === 'uploader' || creator
  const canShareFile = vector?.[3] === '1' && (mode !== 'restricted' || manager || creator)
  const canGrantProject = hasProject && (manager || creator)
  const actions = [
    [{ kind: 'shareFile' }, canShareFile],
    [{ kind: 'grantFileAccess', recipient: targetGuest, level: 'download', expiresAt: now + 1 }, canShareFile],
    [{ kind: 'createProject' }, writer],
    [{ kind: 'uploadProjectFile' }, hasProject && writer && (mode === 'team' || manager || creator || p === 'edit')],
    [{ kind: 'updateProject' }, hasProject && manager],
    [{ kind: 'grantProjectAccess', recipient: targetGuest, level: 'download', expiresAt: now + 1 }, canGrantProject],
    [{ kind: 'manageMembers' }, manager],
    [{ kind: 'viewTeam' }, writer || actor === 'commenter'],
    [{ kind: 'updateWorkspace' }, manager],
    [{ kind: 'listActivity' }, manager],
    [{ kind: 'listLinks' }, manager],
    [{ kind: 'transferOwnership', target: targetMember }, isOwner],
    [{ kind: 'archiveWorkspace' }, isOwner],
    [{ kind: 'billing', available: true }, isOwner],
    [{ kind: 'billing', available: false }, false],
  ] as const satisfies readonly [PermissionAction, boolean][]
  return actions.map(([action, expected]) => ({
    name: `${name}, ${action.kind}${action.kind === 'billing' ? ` available=${action.available}` : ''}`,
    input: { ...input, action }, expected,
  }))
})

describe('§4 management matrix', () => {
  it.each(managementCases)('$name', ({ input, expected }) => {
    expect(decidePermission(input).allowed).toBe(expected)
  })
})

describe('scope, role and lifecycle boundaries', () => {
  const guest = asMember('guest')
  const expiringGrant = { ...fileGrant, level: 'download', expiresAt: now }
  const scoped = cellInput('member', 'restricted', null, 'edit')

  it.each([
    ['one second before expiry', now - 1, 'ALLOWED'],
    ['at expiry', now, 'GRANT_EXPIRED'],
    ['one second after expiry', now + 1, 'GRANT_EXPIRED'],
  ])('guest download %s', (_name, time, reason) => {
    expect(decidePermission({
      ...defaultInput, actor: guest, fileGrant: expiringGrant, now: time, action: { kind: 'download' },
    }).reason).toBe(reason)
  })

  const boundaryCases = [
    ['a live project grant remains after the higher file grant expires', {
      ...scoped, actor: guest, fileGrant: expiringGrant,
      projectGrant: { ...projectGrant, level: 'comment', expiresAt: now + 1 }, action: { kind: 'comment' },
    }, 'ALLOWED'],
    ['an expired file grant never raises a live project grant', {
      ...scoped, actor: guest, fileGrant: expiringGrant,
      projectGrant: { ...projectGrant, level: 'comment', expiresAt: now + 1 }, action: { kind: 'download' },
    }, 'GRANT_EXPIRED'],
    ['the guest falls out of the workspace selector when the last grant ends', {
      actor: guest, fileGrant: expiringGrant, action: { kind: 'selectWorkspace' },
    }, 'GRANT_EXPIRED'],
    ['a guest with a live scope appears in the selector', {
      actor: guest, fileGrant: { ...expiringGrant, expiresAt: now + 1 }, action: { kind: 'selectWorkspace' },
    }, 'ALLOWED'],
    ['a guest grant requires a finite expiry', { actor: guest, fileGrant }, 'INSUFFICIENT_LEVEL'],
    ['malformed expiry never grants access', {
      actor: guest, fileGrant: { ...expiringGrant, expiresAt: Number.POSITIVE_INFINITY },
    }, 'INSUFFICIENT_LEVEL'],
    ['the guest identity must be verified', {
      actor: { ...asMember('guest'), emailVerified: false },
      fileGrant: { ...expiringGrant, expiresAt: now + 1 },
    }, 'ROLE_LIMIT'],
    ['the guest cannot use an uploader grant', {
      actor: guest, fileGrant: { ...expiringGrant, source: 'uploader', expiresAt: now + 1 },
    }, 'INSUFFICIENT_LEVEL'],
    ['no membership after removal even with a stale grant and file URL', {
      ...scoped, actor: { kind: 'removed' },
    }, 'NO_MEMBERSHIP'],
    ['no permission after returning to a restricted workspace without grants', {
      ...cellInput('member', 'restricted', null, null),
    }, 'INSUFFICIENT_LEVEL'],
    ['a creator loses project access management after removal', {
      ...cellInput('creator', 'restricted', 'edit', null),
      actor: { kind: 'removed' }, action: { kind: 'grantProjectAccess', recipient: targetGuest, level: 'comment', expiresAt: now + 1 },
    }, 'NO_MEMBERSHIP'],
    ['a creator loses project access management after downgrade to commenter', {
      ...cellInput('creator', 'restricted', 'edit', null),
      actor: asMember('commenter'), action: { kind: 'grantProjectAccess', recipient: targetGuest, level: 'comment', expiresAt: now + 1 },
    }, 'PROJECT_MANAGER_REQUIRED'],
    ['a creator who rejoins without the creator marker cannot share', {
      ...scoped, action: { kind: 'shareFile' },
    }, 'PROJECT_MANAGER_REQUIRED'],
    ['an admin in workspace B has no authority in workspace A', { actor: asMember('admin', 'b') }, 'TENANT_MISMATCH'],
    ['the same user can download via a live guest grant in A', {
      actor: guest, fileGrant: { ...expiringGrant, expiresAt: now + 1 }, action: { kind: 'download' },
    }, 'ALLOWED'],
    ['the same user can edit as an admin in B', {
      actor: asMember('admin', 'b'), workspace: { ...workspace, id: 'b' },
      file: { ...file, workspaceId: 'b' }, action: { kind: 'edit' },
    }, 'ALLOWED'],
    ['the same user can edit as owner of their personal workspace', {
      actor: asMember('owner', 'personal'), workspace: { ...workspace, id: 'personal', kind: 'personal' },
      file: { ...file, workspaceId: 'personal' }, action: { kind: 'edit' },
    }, 'ALLOWED'],
    ['a platform admin without membership has no content access', { actor: { kind: 'anonymous' } }, 'NO_MEMBERSHIP'],
    ['a comma-separated role never grants access', { actor: asMember('admin,owner'), fileGrant }, 'ROLE_LIMIT'],
    ['a prototype property is not a role', { actor: asMember('constructor'), fileGrant }, 'ROLE_LIMIT'],
    ['an unknown grant level yields no access', {
      ...scoped, fileGrant: { ...fileGrant, level: 'download,edit' },
    }, 'INSUFFICIENT_LEVEL'],
    ['a grant for a different user yields no access', {
      ...scoped, fileGrant: { ...fileGrant, userId: 'someone-else' },
    }, 'INSUFFICIENT_LEVEL'],
    ['a cross-workspace grant yields no access', {
      ...scoped, fileGrant: { ...fileGrant, workspaceId: 'b' },
    }, 'INSUFFICIENT_LEVEL'],
    ['a file grant never propagates to a sibling', {
      ...scoped, file: { ...file, id: 'other-file', projectId: 'p' },
    }, 'INSUFFICIENT_LEVEL'],
    ['a project grant for an old project does not survive a move', {
      ...scoped, project: { ...project, id: 'new-project', accessMode: 'restricted' },
      file: { ...file, projectId: 'new-project' }, projectGrant, fileGrant: { ...fileGrant, level: 'invalid' },
    }, 'INSUFFICIENT_LEVEL'],
    ['a file grant cannot open a project for uploading', {
      ...scoped, action: { kind: 'uploadProjectFile' },
    }, 'INSUFFICIENT_LEVEL'],
    ['uploader edit does not confer restricted file sharing', {
      ...cellInput('uploader', 'restricted', null, null), action: { kind: 'shareFile' },
    }, 'PROJECT_MANAGER_REQUIRED'],
    ['the uploader can still edit the same restricted file', {
      ...cellInput('uploader', 'restricted', null, null), action: { kind: 'edit' },
    }, 'ALLOWED'],
    ['raw uploader identity grants no edit after deletion of the uploader grant', {
      ...cellInput('member', 'team', null, null), action: { kind: 'edit' },
    }, 'INSUFFICIENT_LEVEL'],
    ['the team baseline allows download before restriction', {
      ...cellInput('member', 'team', null, null), action: { kind: 'download' },
    }, 'ALLOWED'],
    ['the team baseline is gone immediately after restriction', {
      ...cellInput('member', 'restricted', null, null), action: { kind: 'download' },
    }, 'INSUFFICIENT_LEVEL'],
    ['a team link revoked during restriction cannot be reused', {
      ...cellInput('link', 'restricted', null, 'download'), actor: asLink({ revokedAt: now }),
    }, 'LINK_REVOKED'],
    ['a guest with a direct grant can see the team file before restriction', {
      ...cellInput('guest', 'team', null, 'view'),
    }, 'ALLOWED'],
    ['the former guest scope is gone once the restriction batch removes its grant', {
      ...cellInput('guest', 'restricted', null, null),
    }, 'INSUFFICIENT_LEVEL'],
    ['the uploader grant is preserved when team access becomes restricted', {
      ...cellInput('uploader', 'restricted', null, null), action: { kind: 'edit' },
    }, 'ALLOWED'],
    ['a revoked link is still denied after returning to team', {
      ...cellInput('link', 'team', null, 'download'), actor: asLink({ revokedAt: now }),
    }, 'LINK_REVOKED'],
    ['an archived workspace is unavailable even to the owner', {
      actor: asMember('owner'), workspace: { ...workspace, archived: true },
    }, 'RESOURCE_UNAVAILABLE'],
    ['an archived project is unavailable even to the owner', {
      ...scoped, actor: asMember('owner'), project: { ...project, accessMode: 'team', archived: true },
    }, 'RESOURCE_UNAVAILABLE'],
    ['a projected file without its project context is denied', {
      file: { ...file, projectId: 'p' }, actor: asMember('owner'),
    }, 'TENANT_MISMATCH'],
    ['a foreign project attached to a local file is denied', {
      ...scoped, project: { ...project, workspaceId: 'b', accessMode: 'team' },
    }, 'TENANT_MISMATCH'],
    ['a file in another workspace is denied', {
      ...scoped, file: { ...file, workspaceId: 'b', projectId: 'p' },
    }, 'TENANT_MISMATCH'],
    ['an unrelated version ID is denied', {
      version: { fileId: 'other-file', id: 'v3', ready: true }, action: { kind: 'download' },
    }, 'TENANT_MISMATCH'],
    ['preview denies a pending upload', {
      file: { ...file, currentReadyVersionId: null }, action: { kind: 'preview' },
    }, 'VERSION_UNAVAILABLE'],
    ['download denies a pending upload', {
      version: { fileId: 'f', id: 'v3', ready: false }, action: { kind: 'download' },
    }, 'VERSION_UNAVAILABLE'],
    ['guest cannot request a previous ready version', {
      actor: guest, fileGrant: { ...expiringGrant, expiresAt: now + 1 },
      version: { fileId: 'f', id: 'v1', ready: true }, action: { kind: 'download' },
    }, 'VERSION_UNAVAILABLE'],
    ['an internal user can download a previous ready version', {
      version: { fileId: 'f', id: 'v1', ready: true }, action: { kind: 'download' },
    }, 'ALLOWED'],
    ['trashed content is hidden from the owner', { actor: asMember('owner'), file: { ...file, trashed: true } },
      'RESOURCE_UNAVAILABLE'],
    ['an editor can restore a trashed file', {
      ...scoped, file: { ...file, projectId: 'p', trashed: true }, action: { kind: 'restoreFile' },
    }, 'ALLOWED'],
    ['an ordinary editor cannot permanently delete a trashed file', {
      ...scoped, file: { ...file, projectId: 'p', trashed: true }, action: { kind: 'purgeFile' },
    }, 'ROLE_LIMIT'],
    ['an admin can permanently delete a trashed file', {
      ...scoped, actor: asMember('admin'), file: { ...file, projectId: 'p', trashed: true }, action: { kind: 'purgeFile' },
    }, 'ALLOWED'],
    ['upload authorization targets the workspace when no project is selected', {
      action: { kind: 'uploadFile' },
    }, 'RESOURCE_UNAVAILABLE'],
    ['the member baseline cannot trash a file', { action: { kind: 'trashFile' } }, 'INSUFFICIENT_LEVEL'],
    ['the member baseline cannot upload a version', { action: { kind: 'uploadVersion' } }, 'INSUFFICIENT_LEVEL'],
    ['file edit is sufficient to upload a version even in a restricted project', {
      ...scoped, action: { kind: 'uploadVersion' },
    }, 'ALLOWED'],
    ['the owner sees that billing is unavailable in Phase 3', {
      actor: asMember('owner'), action: { kind: 'billing', available: false },
    }, 'FEATURE_UNAVAILABLE'],
  ] satisfies Array<[string, Partial<PermissionInput>, string]>

  it.each(boundaryCases)('%s', (_name, patch, reason) => {
    expect(decidePermission({ ...defaultInput, ...patch }).reason).toBe(reason)
  })

  it.each([
    ['owner', true], ['admin', true], ['member', true], ['commenter', false], ['guest', false],
  ])('standalone upload for %s', (role, expected) => {
    expect(decidePermission({ actor: asMember(role), workspace, now, action: { kind: 'uploadFile' } }).allowed)
      .toBe(expected)
  })
})

describe('link lifecycle and version scope', () => {
  const protectedLink = { ...link, requiresPassword: true, revision: 2 }
  const proof = { linkId: link.id, revision: 2, expiresAt: now + 1 }

  it.each([
    ['one second before expiry', now - 1, 'ALLOWED'],
    ['at expiry', now, 'LINK_EXPIRED'],
    ['one second after expiry', now + 1, 'LINK_EXPIRED'],
  ])('link download %s', (_name, time, reason) => {
    expect(decidePermission({
      ...defaultInput, actor: asLink({ expiresAt: now }), now: time, action: { kind: 'download' },
    }).reason).toBe(reason)
  })

  it.each([
    ['valid link and password proof', { actor: { kind: 'link', link: protectedLink, passwordProof: proof } }, 'ALLOWED'],
    ['missing link row for unknown token', { actor: { kind: 'link', link: null } }, 'RESOURCE_UNAVAILABLE'],
    ['revoked link even with recent proof', {
      actor: { kind: 'link', link: { ...protectedLink, revokedAt: now }, passwordProof: proof },
    }, 'LINK_REVOKED'],
    ['wrong file', { actor: asLink({ fileId: 'other' }) }, 'RESOURCE_UNAVAILABLE'],
    ['wrong workspace', { actor: asLink({ workspaceId: 'other' }) }, 'TENANT_MISMATCH'],
    ['invalid revision', { actor: asLink({ revision: 0 }) }, 'RESOURCE_UNAVAILABLE'],
    ['wrong password or invalid MAC yields no proof', { actor: asLink(protectedLink) }, 'LINK_PROOF_REQUIRED'],
    ['proof for a different link', {
      actor: { kind: 'link', link: protectedLink, passwordProof: { ...proof, linkId: 'other' } },
    }, 'LINK_PROOF_REQUIRED'],
    ['proof from before a password or permission change', {
      actor: { kind: 'link', link: protectedLink, passwordProof: { ...proof, revision: 1 } },
    }, 'LINK_PROOF_REQUIRED'],
    ['proof at expiry', {
      actor: { kind: 'link', link: protectedLink, passwordProof: { ...proof, expiresAt: now } },
    }, 'LINK_PROOF_REQUIRED'],
    ['legacy expiry ceiling is enforced on reads', { actor: asLink({ legacyMaxExpiresAt: now }) }, 'LINK_EXPIRED'],
    ['a valid view link cannot comment', { actor: asLink({ level: 'view' }), action: { kind: 'comment' } }, 'LINK_NO_COMMENTS'],
    ['a download link cannot read comments', {
      actor: asLink(), action: { kind: 'viewComment', authorUserId: 'u', authorScopeAtWrite: 'internal', authorRole: 'owner' },
    }, 'LINK_NO_COMMENTS'],
    ['a download link cannot see version history', { actor: asLink(), action: { kind: 'viewHistory' } }, 'ROLE_LIMIT'],
    ['a link cannot request a previous ready version', {
      actor: asLink(), version: { fileId: 'f', id: 'v1', ready: true }, action: { kind: 'download' },
    }, 'VERSION_UNAVAILABLE'],
    ['a link can download the latest ready version', {
      actor: asLink(), version: { fileId: 'f', id: 'v2', ready: true }, action: { kind: 'download' },
    }, 'ALLOWED'],
    ['a link cannot open a pending upload', {
      actor: asLink(), file: { ...file, currentReadyVersionId: null },
    }, 'VERSION_UNAVAILABLE'],
  ] satisfies Array<[string, Partial<PermissionInput>, string]>)('%s', (_name, patch, expected) => {
    expect(decidePermission({ ...defaultInput, ...patch }).reason).toBe(expected)
  })
})

describe('management targets and guest comment visibility', () => {
  const owner = asMember('owner')
  const admin = asMember('admin')
  const targetOwner = { ...targetMember, userId: 'u', role: 'owner' }
  const targetAdmin = { ...targetMember, role: 'admin' }
  const grantTarget = { resourceId: 'f', workspaceId: 'a', role: 'guest', grantedByUserId: 'u' }
  const teamEditor = cellInput('member', 'team', null, 'edit')
  const restrictedCreator = cellInput('creator', 'restricted', 'edit', null)
  const personal = { ...workspace, kind: 'personal' } as const

  it.each([
    ['cannot remove the last owner', { actor: owner, action: { kind: 'removeMember', target: targetOwner } }, 'LAST_OWNER'],
    ['cannot demote the last owner', { actor: owner, action: { kind: 'changeRole', target: targetOwner, role: 'admin' } }, 'LAST_OWNER'],
    ['an admin cannot promote an ordinary member to admin', { actor: admin, action: { kind: 'changeRole', target: targetMember, role: 'admin' } }, 'ROLE_LIMIT'],
    ['an admin cannot remove another admin', { actor: admin, action: { kind: 'removeMember', target: targetAdmin } }, 'ROLE_LIMIT'],
    ['an admin can remove a member', { actor: admin, action: { kind: 'removeMember', target: targetMember } }, 'ALLOWED'],
    ['an owner can promote an internal member to admin', { actor: owner, action: { kind: 'changeRole', target: targetMember, role: 'admin' } }, 'ALLOWED'],
    ['an owner cannot use role changes to assign ownership', { actor: owner, action: { kind: 'changeRole', target: targetMember, role: 'owner' } }, 'ROLE_LIMIT'],
    ['an admin can invite a commenter', { actor: admin, action: { kind: 'inviteMember', role: 'commenter' } }, 'ALLOWED'],
    ['an admin cannot invite an admin', { actor: admin, action: { kind: 'inviteMember', role: 'admin' } }, 'ROLE_LIMIT'],
    ['an owner can invite an admin', { actor: owner, action: { kind: 'inviteMember', role: 'admin' } }, 'ALLOWED'],
    ['an owner cannot invite a second internal member to a personal workspace', { actor: owner, workspace: personal, action: { kind: 'inviteMember', role: 'member' } }, 'ROLE_LIMIT'],
    ['an owner can transfer to a current admin', { actor: owner, action: { kind: 'transferOwnership', target: targetAdmin } }, 'ALLOWED'],
    ['an owner cannot transfer to a guest', { actor: owner, action: { kind: 'transferOwnership', target: targetGuest } }, 'ROLE_LIMIT'],
    ['an owner cannot transfer to a commenter', { actor: owner, action: { kind: 'transferOwnership', target: { ...targetMember, role: 'commenter' } } }, 'ROLE_LIMIT'],
    ['an owner cannot transfer to a member of another workspace', { actor: owner, action: { kind: 'transferOwnership', target: { ...targetMember, workspaceId: 'b' } } }, 'TENANT_MISMATCH'],
    ['an owner cannot transfer a personal workspace', { actor: owner, workspace: personal, action: { kind: 'transferOwnership', target: targetMember } }, 'ROLE_LIMIT'],
    ['an owner cannot archive a personal workspace', { actor: owner, workspace: personal, action: { kind: 'archiveWorkspace' } }, 'ROLE_LIMIT'],
    ['an owner can share a file in a personal workspace', { actor: owner, workspace: personal, action: { kind: 'grantFileAccess', recipient: targetGuest, level: 'comment', expiresAt: now + 1 } }, 'ALLOWED'],
    ['an owner cannot assign edit to a guest', { actor: owner, action: { kind: 'grantFileAccess', recipient: targetGuest, level: 'edit', expiresAt: now + 1 } }, 'ROLE_LIMIT'],
    ['an owner cannot assign a guest grant without expiry', { actor: owner, action: { kind: 'grantFileAccess', recipient: targetGuest, level: 'download', expiresAt: null } }, 'ROLE_LIMIT'],
    ['an owner cannot assign download to a commenter', { actor: owner, action: { kind: 'grantFileAccess', recipient: { ...targetMember, role: 'commenter' }, level: 'download', expiresAt: null } }, 'ROLE_LIMIT'],
    ['an owner cannot assign a grant across workspaces', { actor: owner, action: { kind: 'grantFileAccess', recipient: { ...targetGuest, workspaceId: 'b' }, level: 'view', expiresAt: now + 1 } }, 'TENANT_MISMATCH'],
    ['a team editor can revoke their own guest grant', { ...teamEditor, action: { kind: 'revokeFileAccess', target: grantTarget } }, 'ALLOWED'],
    ['a team editor cannot revoke another member’s guest grant', { ...teamEditor, action: { kind: 'revokeFileAccess', target: { ...grantTarget, grantedByUserId: 'someone-else' } } }, 'ROLE_LIMIT'],
    ['a team editor cannot revoke an internal grant', { ...teamEditor, action: { kind: 'revokeFileAccess', target: { ...grantTarget, role: 'member' } } }, 'ROLE_LIMIT'],
    ['a restricted creator can revoke a file grant from another grantor', { ...restrictedCreator, action: { kind: 'revokeFileAccess', target: { ...grantTarget, grantedByUserId: 'someone-else' } } }, 'ALLOWED'],
    ['a restricted non-manager cannot revoke even their own guest grant', { ...cellInput('member', 'restricted', null, 'edit'), action: { kind: 'revokeFileAccess', target: grantTarget } }, 'PROJECT_MANAGER_REQUIRED'],
    ['the creator can revoke a grant to their restricted project', { ...restrictedCreator, action: { kind: 'revokeProjectAccess', target: { ...grantTarget, resourceId: 'p' } } }, 'ALLOWED'],
    ['the creator cannot revoke a grant to a different project through this one', { ...restrictedCreator, action: { kind: 'revokeProjectAccess', target: { ...grantTarget, resourceId: 'other' } } }, 'RESOURCE_UNAVAILABLE'],
    // Guest membership management (§4 table, D14 review finding)
    ['an owner can remove a guest member', { actor: owner, action: { kind: 'removeMember', target: targetGuest } }, 'ALLOWED'],
    ['an admin can remove a guest member', { actor: admin, action: { kind: 'removeMember', target: targetGuest } }, 'ALLOWED'],
    ['an owner can promote a guest to member', { actor: owner, action: { kind: 'changeRole', target: targetGuest, role: 'member' } }, 'ALLOWED'],
    ['an owner can promote a guest to commenter', { actor: owner, action: { kind: 'changeRole', target: targetGuest, role: 'commenter' } }, 'ALLOWED'],
    ['an admin can promote a guest to member', { actor: admin, action: { kind: 'changeRole', target: targetGuest, role: 'member' } }, 'ALLOWED'],
    ['an admin can promote a guest to commenter', { actor: admin, action: { kind: 'changeRole', target: targetGuest, role: 'commenter' } }, 'ALLOWED'],
    ['a member cannot remove a guest', { actor: asMember('member'), action: { kind: 'removeMember', target: targetGuest } }, 'ROLE_LIMIT'],
    ['a commenter cannot remove a guest', { actor: asMember('commenter'), action: { kind: 'removeMember', target: targetGuest } }, 'ROLE_LIMIT'],
    ['an owner cannot demote a member to guest', { actor: owner, action: { kind: 'changeRole', target: targetMember, role: 'guest' } }, 'ROLE_LIMIT'],
    ['an owner cannot invite a guest through member invitations', { actor: owner, action: { kind: 'inviteMember', role: 'guest' } }, 'ROLE_LIMIT'],
    ['an owner cannot promote a guest to admin via changeRole', { actor: owner, action: { kind: 'changeRole', target: targetGuest, role: 'admin' } }, 'ROLE_LIMIT'],
    ['an admin cannot promote a guest to admin via changeRole', { actor: admin, action: { kind: 'changeRole', target: targetGuest, role: 'admin' } }, 'ROLE_LIMIT'],
    // Guest grant expiry enforcement
    ['an owner granting download to a guest without expiry is denied', { actor: owner, action: { kind: 'grantFileAccess', recipient: targetGuest, level: 'download', expiresAt: null } }, 'ROLE_LIMIT'],
    ['an owner granting download to a guest with expiry is allowed', { actor: owner, action: { kind: 'grantFileAccess', recipient: targetGuest, level: 'download', expiresAt: now + 1 } }, 'ALLOWED'],
    ['an owner granting download to an internal member without expiry is allowed', { actor: owner, action: { kind: 'grantFileAccess', recipient: targetMember, level: 'download', expiresAt: null } }, 'ALLOWED'],
  ] satisfies Array<[string, Partial<PermissionInput>, string]>)('%s', (_name, patch, expected) => {
    expect(decidePermission({ ...defaultInput, ...patch }).reason).toBe(expected)
  })

  it.each([
    ['own comment', 'u', 'guest', 'guest', true],
    ['current and historical internal author', 'other', 'internal', 'member', true],
    ['a different guest', 'other', 'guest', 'guest', false],
    ['guest author promoted to member', 'other', 'guest', 'member', false],
    ['former internal author removed from workspace', 'other', 'internal', null, false],
    ['former internal author now a guest', 'other', 'internal', 'guest', false],
    ['legacy scope unknown', 'other', null, 'member', false],
  ] as const)('guest comment projection: %s', (_name, authorUserId, authorScopeAtWrite, authorRole, expected) => {
    expect(decidePermission({
      ...defaultInput,
      actor: asMember('guest'),
      fileGrant: { ...fileGrant, level: 'view', expiresAt: now + 1 },
      action: { kind: 'viewComment', authorUserId, authorScopeAtWrite, authorRole },
    }).allowed).toBe(expected)
  })
})

describe('moveFile source and target permissions', () => {
  type Destination = NonNullable<Extract<PermissionAction, { kind: 'moveFile' }>['target']['project']>
  const restrictedMode: Destination = { ...project, accessMode: 'restricted' }
  const teamMode: Destination = { ...project, accessMode: 'team' }
  const otherRestricted: Destination = { ...restrictedMode, id: 'other', creatorManagerUserId: 'u' }
  const otherGrant: ProjectGrant = { ...projectGrant, projectId: 'other' }
  const creatorMode: Destination = { ...restrictedMode, creatorManagerUserId: 'u' }
  const moveTo = (
    target: { workspaceId?: string; project: Destination | null; projectGrant?: ProjectGrant },
  ): PermissionAction => ({ kind: 'moveFile', target: { workspaceId: 'a', ...target } })
  const ownStandalone: Partial<PermissionInput> = { actor: asMember('member'), file, fileGrant }
  const ownTeamFile = cellInput('member', 'team', null, 'edit')

  it.each([
    ['member, no project → no project', { ...ownStandalone, action: moveTo({ project: null }) }, 'ALLOWED'],
    ['member without edit on a standalone file', { actor: asMember('member'), file, action: moveTo({ project: null }) }, 'INSUFFICIENT_LEVEL'],
    ['member, no project → team', { ...ownStandalone, action: moveTo({ project: teamMode }) }, 'ALLOWED'],
    ['member, team → no project', { ...ownTeamFile, action: moveTo({ project: null }) }, 'ALLOWED'],
    ['member, team → team', { ...ownTeamFile, action: moveTo({ project: { ...teamMode, id: 'other' } }) }, 'ALLOWED'],
    ['member, team → restricted', { ...ownTeamFile, action: moveTo({ project: restrictedMode }) }, 'PROJECT_MANAGER_REQUIRED'],
    ['member, no project → restricted', { ...ownStandalone, action: moveTo({ project: restrictedMode }) }, 'PROJECT_MANAGER_REQUIRED'],
    ['member without source edit, team → no project', { ...cellInput('member', 'team', null, 'view'), action: moveTo({ project: null }) }, 'INSUFFICIENT_LEVEL'],
    ['creator, no project → own restricted with edit grant', { ...ownStandalone, action: moveTo({ project: creatorMode, projectGrant }) }, 'ALLOWED'],
    ['creator, no project → own restricted without edit grant', { ...ownStandalone, action: moveTo({ project: creatorMode }) }, 'INSUFFICIENT_LEVEL'],
    ['creator, no project → own restricted with expired grant', { ...ownStandalone, action: moveTo({ project: creatorMode, projectGrant: { ...projectGrant, expiresAt: now } }) }, 'INSUFFICIENT_LEVEL'],
    ['creator, no project → own restricted with a grant on another project', { ...ownStandalone, action: moveTo({ project: creatorMode, projectGrant: otherGrant }) }, 'INSUFFICIENT_LEVEL'],
    ['creator, restricted → team', { ...cellInput('creator', 'restricted', 'edit', null), action: moveTo({ project: { ...teamMode, id: 'other' } }) }, 'ALLOWED'],
    ['creator, restricted → no project', { ...cellInput('creator', 'restricted', 'edit', null), action: moveTo({ project: null }) }, 'ALLOWED'],
    ['member with edit grant, restricted → team', { ...cellInput('member', 'restricted', null, 'edit'), action: moveTo({ project: { ...teamMode, id: 'other' } }) }, 'PROJECT_MANAGER_REQUIRED'],
    ['member with project edit, restricted → no project', { ...cellInput('member', 'restricted', 'edit', null), action: moveTo({ project: null }) }, 'PROJECT_MANAGER_REQUIRED'],
    ['creator, restricted → another restricted they manage with a grant', { ...cellInput('creator', 'restricted', 'edit', null), action: moveTo({ project: otherRestricted, projectGrant: otherGrant }) }, 'ALLOWED'],
    ['creator, restricted → another restricted they do not manage', { ...cellInput('creator', 'restricted', 'edit', null), action: moveTo({ project: { ...otherRestricted, creatorManagerUserId: null, createdByUserId: 'x' }, projectGrant: otherGrant }) }, 'PROJECT_MANAGER_REQUIRED'],
    ['owner, no project → restricted', { actor: asMember('owner'), file, action: moveTo({ project: restrictedMode }) }, 'ALLOWED'],
    ['owner, restricted → restricted', { ...cellInput('owner', 'restricted', null, null), action: moveTo({ project: otherRestricted }) }, 'ALLOWED'],
    ['admin, team → restricted', { ...cellInput('admin', 'team', null, null), action: moveTo({ project: restrictedMode }) }, 'ALLOWED'],
    ['admin, restricted → no project', { ...cellInput('admin', 'restricted', null, null), action: moveTo({ project: null }) }, 'ALLOWED'],
    ['owner, other workspace without project', { actor: asMember('owner'), file, action: moveTo({ workspaceId: 'b', project: null }) }, 'TENANT_MISMATCH'],
    ['owner, destination project belongs to another workspace', { actor: asMember('owner'), file, action: moveTo({ project: { ...teamMode, workspaceId: 'b' } }) }, 'TENANT_MISMATCH'],
    ['owner, archived destination project', { actor: asMember('owner'), file, action: moveTo({ project: { ...teamMode, archived: true } }) }, 'RESOURCE_UNAVAILABLE'],
    ['guest with an edit-capped grant', { actor: asMember('guest'), file, fileGrant: { ...fileGrant, expiresAt: now + 1 }, action: moveTo({ project: null }) }, 'ROLE_LIMIT'],
    ['commenter', { actor: asMember('commenter'), file, fileGrant: { ...fileGrant, level: 'comment' }, action: moveTo({ project: null }) }, 'ROLE_LIMIT'],
    ['member of another workspace', { actor: asMember('owner', 'b'), file, action: moveTo({ project: null }) }, 'TENANT_MISMATCH'],
  ] satisfies Array<[string, Partial<PermissionInput>, string]>)('%s', (_name, patch, expected) => {
    expect(decidePermission({ ...defaultInput, ...patch }).reason).toBe(expected)
  })
})

describe('manageProjectAccess', () => {
  const decide = (role: string, mode: 'team' | 'restricted', creator: boolean) =>
    decidePermission({
      workspace,
      now,
      actor: asMember(role),
      project: { ...project, accessMode: mode, creatorManagerUserId: creator ? 'u' : null },
      action: { kind: 'manageProjectAccess' },
    }).reason

  it.each([
    ['owner', 'team', false, 'ALLOWED'],
    ['admin', 'restricted', false, 'ALLOWED'],
    ['member', 'restricted', true, 'ALLOWED'],
    ['member', 'restricted', false, 'PROJECT_MANAGER_REQUIRED'],
    ['member', 'team', true, 'PROJECT_MANAGER_REQUIRED'],
    ['commenter', 'restricted', true, 'PROJECT_MANAGER_REQUIRED'],
    ['guest', 'restricted', false, 'PROJECT_MANAGER_REQUIRED'],
  ] as const)('%s on a %s project (creator: %s) -> %s', (role, mode, creator, reason) => {
    expect(decide(role, mode, creator)).toBe(reason)
  })
})
