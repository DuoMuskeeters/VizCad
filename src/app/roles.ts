import type { I18nKey } from '#/i18n'
import type { Role, WorkspaceSummary } from './api'

export const roleKey = (role: string): I18nKey => {
  switch (role) {
    case 'owner':
      return 'app.role.owner'
    case 'admin':
      return 'app.role.admin'
    case 'member':
      return 'app.role.member'
    case 'commenter':
      return 'app.role.commenter'
    default:
      return 'app.role.guest'
  }
}

export const roleHintKey = (role: string): I18nKey => {
  switch (role) {
    case 'admin':
      return 'app.role.adminHint'
    case 'member':
      return 'app.role.memberHint'
    default:
      return 'app.role.commenterHint'
  }
}

export type InternalRole = 'admin' | 'member' | 'commenter'

/** Client-side mirror of src/server/permissions.ts for "disabled + why" only; the server stays the authority. */
export type Ability = { readonly allowed: true } | { readonly allowed: false; readonly reason: I18nKey }

const yes: Ability = { allowed: true }
const no = (reason: I18nKey): Ability => ({ allowed: false, reason })

export const canManageMembers = (workspace: Pick<WorkspaceSummary, 'kind' | 'role'>): Ability => {
  if (workspace.kind === 'personal') return no('app.team.reason.personal')
  return workspace.role === 'owner' || workspace.role === 'admin' ? yes : no('app.team.reason.notManager')
}

/** Roles the actor may hand out: admins can promote to admin only if they are owners. */
export const assignableRoles = (actor: Role): readonly InternalRole[] => (actor === 'owner' ? ['admin', 'member', 'commenter'] : ['member', 'commenter'])

/** May `actor` change or remove a person who currently holds `target`? */
export const canManageTarget = (workspace: Pick<WorkspaceSummary, 'kind' | 'role'>, target: Role, isSelf: boolean): Ability => {
  const manage = canManageMembers(workspace)
  if (!manage.allowed) return manage
  if (isSelf) return no('app.team.reason.self')
  if (target === 'owner') return no('app.team.reason.owner')
  if (target === 'guest') return yes
  if (target === 'admin' && workspace.role !== 'owner') return no('app.team.reason.adminByOwner')
  return yes
}

const order: Readonly<Record<InternalRole, number>> = { admin: 3, member: 2, commenter: 1 }

/** Moving to a lower role (or removing) cannot be undone by the person; the dialog says so. */
export const isDemotion = (from: Role, to: InternalRole): boolean => from !== 'guest' && from !== 'owner' && order[to] < order[from]
