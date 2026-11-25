import type { I18nKey } from '#/i18n'
import type { AppFailure } from './api'

const REASONS: Readonly<Record<string, I18nKey>> = {
  LAST_OWNER: 'app.error.lastOwner',
  ROLE_LIMIT: 'app.error.roleLimit',
  INSUFFICIENT_LEVEL: 'app.error.roleLimit',
  PROJECT_MANAGER_REQUIRED: 'app.error.roleLimit',
  FEATURE_UNAVAILABLE: 'app.error.featureUnavailable',
}

const TAGS: Readonly<Record<string, I18nKey>> = {
  Network: 'app.error.network',
  Unauthenticated: 'app.error.unauthenticated',
  WriteConflict: 'app.error.writeConflict',
  SeatLimitReached: 'app.error.seatLimit',
  GuestLimitReached: 'app.error.guestLimit',
  WorkspaceLimitReached: 'app.error.workspaceLimit',
  ProjectLimitReached: 'app.error.projectLimit',
  RateLimitExceeded: 'app.error.rateLimit',
  RateLimitError: 'app.error.serverBusy',
  LastOwner: 'app.error.lastOwner',
  EmailUnverified: 'app.error.emailUnverified',
  InvitationUnavailable: 'app.error.invitationUnavailable',
  InvitationExpired: 'app.error.invitationExpired',
  InvitationConflict: 'app.error.invitationConflict',
  MemberUnavailable: 'app.error.memberUnavailable',
  RoleConflict: 'app.error.roleConflict',
  WorkspaceUnavailable: 'app.error.workspaceUnavailable',
  ResourceUnavailable: 'app.error.workspaceUnavailable',
  SlugTaken: 'app.error.writeConflict',
  ValidationError: 'app.error.validation',
  CaptchaFailed: 'app.error.generic',
  CsrfRejected: 'app.error.generic',
  PermissionDenied: 'app.error.roleLimit',
  AccessExpiryInvalid: 'app.error.accessExpiry',
  AlreadyHasAccess: 'app.error.alreadyHasAccess',
  ShareLinkLimitReached: 'app.error.linkLimit',
  LinkConflict: 'app.error.linkConflict',
  LinkExpired: 'app.error.linkExpired',
  CommentUnavailable: 'app.error.commentUnavailable',
  VersionUnavailable: 'app.error.versionUnavailable',
  UnsupportedFileType: 'app.error.unsupportedType',
  FileTooLarge: 'app.error.fileTooLarge',
  StorageQuotaExceeded: 'app.error.storageQuota',
}

/** The sentence a failed operation shows. Unknown tags and 5xx fall back to a generic, retryable message. */
export const failureKey = (failure: Pick<AppFailure, 'error' | 'reason'>): I18nKey => {
  if (failure.error === 'PermissionDenied' && failure.reason !== undefined) {
    const byReason = REASONS[failure.reason]
    if (byReason) return byReason
  }
  return TAGS[failure.error] ?? 'app.error.generic'
}
