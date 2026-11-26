import { Data } from 'effect'

/** Input failed Schema validation at the boundary (request body, query, env). */
export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly message: string
}> {}

/** Required configuration is missing or malformed. */
export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly message: string
}> {}

/** D1 query failed. */
export class DbError extends Data.TaggedError('DbError')<{
  readonly cause: unknown
}> {}

/** R2 operation (or presigning) failed. */
export class StorageError extends Data.TaggedError('StorageError')<{
  readonly operation: 'head' | 'get' | 'put' | 'delete' | 'presign'
  readonly key: string
  readonly cause: unknown
}> {}

/** Outgoing email could not be sent. */
export class EmailError extends Data.TaggedError('EmailError')<{
  readonly cause: unknown
}> {}

/** A request body exceeded the endpoint's size cap (413). */
export class PayloadTooLarge extends Data.TaggedError('PayloadTooLarge')<{}> {}

/** Turnstile rejected the token or could not be reached. */
export class CaptchaFailed extends Data.TaggedError('CaptchaFailed')<{
  readonly reason: string
}> {}

/** Edge cache purge failed (reads and writes never fail; they degrade to a miss). */
export class CacheError extends Data.TaggedError('CacheError')<{
  readonly reason: string
}> {}

/** better-auth (or the identity layer around it) failed unexpectedly. `operation` is a fixed name, never user input. */
export class AuthError extends Data.TaggedError('AuthError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** No valid session. */
export class Unauthenticated extends Data.TaggedError('Unauthenticated')<{}> {}

/** The workspace does not exist for this actor (not found, no membership, archived or expired). One answer for all. */
export class WorkspaceUnavailable extends Data.TaggedError('WorkspaceUnavailable')<{}> {}

/** The resource (or endpoint) is not visible to the caller; the same answer whether or not it exists. */
export class ResourceUnavailable extends Data.TaggedError('ResourceUnavailable')<{}> {}

/** A state-changing request failed the Origin / Sec-Fetch-Site / content-type check. `reason` is for tests and logs only. */
export class CsrfRejected extends Data.TaggedError('CsrfRejected')<{
  readonly reason: 'method' | 'origin' | 'fetch-site' | 'content-type'
}> {}

/** A rate limit was exceeded; the protected operation did not run. */
export class RateLimitExceeded extends Data.TaggedError('RateLimitExceeded')<{
  readonly retryAfterSeconds: number
}> {}

/** The rate-limit counters could not be reached. Protected operations fail closed (they do not run). */
export class RateLimitError extends Data.TaggedError('RateLimitError')<{
  readonly cause: unknown
}> {}

/** The account's email is not verified; the operation needs a verified address (docs/08 §1). */
export class EmailUnverified extends Data.TaggedError('EmailUnverified')<{}> {}

/**
 * permissions.ts denied a visible resource. `reason` is a DenialReason; only the user-safe ones (respond.ts
 * `SAFE_REASONS`) reach the client, the rest are server diagnostics.
 */
export class PermissionDenied extends Data.TaggedError('PermissionDenied')<{
  readonly reason: string
}> {}

/** The invitation does not exist, is not addressed to this account, was canceled or its inviter lost the right. */
export class InvitationUnavailable extends Data.TaggedError('InvitationUnavailable')<{}> {}

/** The invitation was addressed to this account but its acceptance window has passed (410). */
export class InvitationExpired extends Data.TaggedError('InvitationExpired')<{}> {}

/** The invitation cannot apply: the recipient is already an internal member, or it was already used by someone else. */
export class InvitationConflict extends Data.TaggedError('InvitationConflict')<{}> {}

/** The workspace has no free seat (Entitlements). */
export class SeatLimitReached extends Data.TaggedError('SeatLimitReached')<{}> {}

/** The workspace has reached its guest limit (Entitlements). */
export class GuestLimitReached extends Data.TaggedError('GuestLimitReached')<{}> {}

/** The workspace has reached its project limit (Entitlements). */
export class ProjectLimitReached extends Data.TaggedError('ProjectLimitReached')<{}> {}

/** The target membership does not exist in this workspace. */
export class MemberUnavailable extends Data.TaggedError('MemberUnavailable')<{}> {}

/** The recipient's role does not fit the operation (e.g. a guest invitation for an internal member). */
export class RoleConflict extends Data.TaggedError('RoleConflict')<{}> {}

/** The operation would leave the workspace without its single owner. */
export class LastOwner extends Data.TaggedError('LastOwner')<{}> {}

/** The workspace slug is taken. */
export class SlugTaken extends Data.TaggedError('SlugTaken')<{}> {}

/** The access level is not one the recipient's role may hold. */
export class InvalidAccessLevel extends Data.TaggedError('InvalidAccessLevel')<{}> {}

/** The access expiry is missing (guest), in the past or beyond the Entitlements ceiling. */
export class AccessExpiryInvalid extends Data.TaggedError('AccessExpiryInvalid')<{}> {}

/** The user already owns as many company workspaces as the plan allows. */
export class WorkspaceLimitReached extends Data.TaggedError('WorkspaceLimitReached')<{}> {}

/** The recipient already holds this file through ownership (the uploader row); a grant would change nothing. */
export class AlreadyHasAccess extends Data.TaggedError('AlreadyHasAccess')<{}> {}

/** A batch precondition (actor role, previous state, quota) changed between read and write; nothing was written. */
export class WriteConflict extends Data.TaggedError('WriteConflict')<{}> {}

/** The file's extension is not a supported CAD type, or its bytes do not match it (docs/09 §2.2). */
export class UnsupportedFileType extends Data.TaggedError('UnsupportedFileType')<{}> {}

/** The file is larger than the plan's per-file limit (Entitlements.maxFileBytes). */
export class FileTooLarge extends Data.TaggedError('FileTooLarge')<{}> {}

/** The upload would take the workspace over its storage quota. */
export class StorageQuotaExceeded extends Data.TaggedError('StorageQuotaExceeded')<{}> {}

/** The user already holds the maximum number of open upload sessions. */
export class UploadLimitReached extends Data.TaggedError('UploadLimitReached')<{}> {}

/** The upload session does not exist for this user, is not open, or has expired. */
export class UploadUnavailable extends Data.TaggedError('UploadUnavailable')<{}> {}

/** The browser reported completion but R2 holds no object under the session's key yet. */
export class UploadIncomplete extends Data.TaggedError('UploadIncomplete')<{}> {}

/** The stored object's size or ETag differs from what was declared and reported; the object is queued for deletion. */
export class UploadMismatch extends Data.TaggedError('UploadMismatch')<{}> {}

/** A new version must have the same extension as the file. */
export class VersionTypeMismatch extends Data.TaggedError('VersionTypeMismatch')<{}> {}

/** The version does not exist on this file (or belongs to another file). */
export class VersionUnavailable extends Data.TaggedError('VersionUnavailable')<{}> {}

/** The file has no thumbnail, or the stored one is not a verified image (docs/09 §3.1). */
export class PreviewUnavailable extends Data.TaggedError('PreviewUnavailable')<{}> {}

/** The stored object no longer matches what D1 recorded (size or ETag); nothing was delivered. */
export class ContentIntegrity extends Data.TaggedError('ContentIntegrity')<{}> {}

/** The uploaded thumbnail is not a well-formed PNG or WebP within the limits (docs/09 §3.1). */
export class InvalidThumbnail extends Data.TaggedError('InvalidThumbnail')<{}> {}

/** The workspace has reached its active share link limit (Entitlements). */
export class ShareLinkLimitReached extends Data.TaggedError('ShareLinkLimitReached')<{}> {}

/** The file already has an active link (or only a legacy one, which cannot be edited); revoke or create a new one. */
export class LinkConflict extends Data.TaggedError('LinkConflict')<{}> {}

/** The share link does not exist, was revoked, or its file is gone: one answer for all (docs/09 §4.3). */
export class LinkUnavailable extends Data.TaggedError('LinkUnavailable')<{}> {}

/** The share link has expired. `sharer` is the sharer's display name (the token holder may know it), or null. */
export class LinkExpired extends Data.TaggedError('LinkExpired')<{
  readonly sharer: string | null
}> {}

/** The link needs a password and the request carries no valid proof cookie. */
export class LinkPasswordRequired extends Data.TaggedError('LinkPasswordRequired')<{}> {}

/** Wrong link password. `captchaRequired`: the next attempt must carry a Turnstile token (after three failures). */
export class LinkPasswordInvalid extends Data.TaggedError('LinkPasswordInvalid')<{
  readonly captchaRequired: boolean
}> {}
/** The comment does not exist on this file, is deleted, or is not visible to the caller (one answer for all). */
export class CommentUnavailable extends Data.TaggedError('CommentUnavailable')<{}> {}

/**
 * The file's current version is no longer the one the request was made for (a new version or a restore landed in
 * between): a derivative or thumbnail of the old bytes must not be stored on the new one (docs/11 §2.3).
 */
export class VersionChanged extends Data.TaggedError('VersionChanged')<{}> {}

/** The uploaded GLB failed the header check (magic, version 2, length, first chunk JSON), docs/11 §2.3. */
export class InvalidDerivative extends Data.TaggedError('InvalidDerivative')<{}> {}

/** Every error a route handler may have to map to a response. */
export type AppError =
  | ValidationError
  | PayloadTooLarge
  | ConfigError
  | DbError
  | StorageError
  | EmailError
  | CaptchaFailed
  | CacheError
  | AuthError
  | Unauthenticated
  | WorkspaceUnavailable
  | ResourceUnavailable
  | CsrfRejected
  | RateLimitExceeded
  | RateLimitError
  | EmailUnverified
  | PermissionDenied
  | InvitationUnavailable
  | InvitationExpired
  | InvitationConflict
  | SeatLimitReached
  | GuestLimitReached
  | ProjectLimitReached
  | MemberUnavailable
  | RoleConflict
  | LastOwner
  | SlugTaken
  | InvalidAccessLevel
  | AccessExpiryInvalid
  | WorkspaceLimitReached
  | AlreadyHasAccess
  | WriteConflict
  | UnsupportedFileType
  | FileTooLarge
  | StorageQuotaExceeded
  | UploadLimitReached
  | UploadUnavailable
  | UploadIncomplete
  | UploadMismatch
  | VersionTypeMismatch
  | VersionUnavailable
  | PreviewUnavailable
  | ContentIntegrity
  | InvalidThumbnail
  | ShareLinkLimitReached
  | LinkConflict
  | LinkUnavailable
  | LinkExpired
  | LinkPasswordRequired
  | LinkPasswordInvalid
  | CommentUnavailable
  | VersionChanged
  | InvalidDerivative
