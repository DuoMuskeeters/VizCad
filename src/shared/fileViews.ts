/**
 * Shapes the file API returns (docs/09 §3.5). Plain types (and pure rules on them), no Effect: the browser imports them too.
 * The projections are allow-lists built field by field in `src/server/programs/fileContext.ts`; a contract test pins the
 * exact key sets. Neither shape ever carries an R2 key, a user id, an e-mail address or a token.
 */

export interface PersonName {
  readonly displayName: string
}

/** A STEP/IGES/3MF file's GLB derivative (docs/11 §2.2): stored, failed (an edit user may retry), or never tried because too large. */
export type DerivativeState = 'ready' | 'failed' | 'too_large'

/**
 * What the 3D viewer may read for the current version (docs/11 §2.4, D23), for this caller. `kind` is what
 * `GET …/model` answers: the GLB derivative, the source object (STL/OBJ/PLY at every level; STEP/IGES/3MF without a
 * derivative only for callers who may download, so the viewer converts in place), or nothing (404).
 */
export interface ModelPreview {
  readonly kind: 'derivative' | 'source' | 'none'
  /** Bytes `model` sends ("3B'yi aç · 6 MB"); null when `kind` is none. */
  readonly bytes: number | null
  /** STEP/IGES/3MF only: null for other formats and for a file nobody converted yet. */
  readonly derivative: {
    readonly state: DerivativeState
    /** The Worker's code of a failed conversion (`corrupt`, `timeout`, …). */
    readonly code: string | null
    /** Parts of a ready derivative (5c: "Montaj · N parça"). */
    readonly parts: number | null
  } | null
  /** `Entitlements.maxConvertBytes`: the largest STEP/IGES/3MF the browser converts. */
  readonly maxConvertBytes: number
}

/**
 * A stored `too_large` that still holds: the source is over the current `maxConvertBytes`. One recorded under a lower
 * limit, or for a GLB over the plan's cap (`glb_too_large`, the source within the limit), is not about the source
 * size: the file page converts in place again, and every page says "the 3D copy is too large", not "over N MB".
 */
export const sourceTooLarge = (file: { readonly size: number; readonly model: ModelPreview }) =>
  file.model.derivative?.state === 'too_large' && file.size > file.model.maxConvertBytes

/** What an internal member (owner, admin, member, commenter) sees about a file. */
export interface FileView {
  readonly id: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly projectId: string | null
  readonly projectName: string | null
  /** Unix seconds. */
  readonly createdAt: number
  readonly updatedAt: number
  readonly starred: boolean
  readonly thumbnailAvailable: boolean
  readonly model: ModelPreview
  readonly currentVersion: { readonly number: number; readonly uploadedBy: PersonName | null }
  /** Light access summary for the list's "Erişim" column: people holding a live grant (not the uploader) and the link's state. */
  readonly access: { readonly people: number; readonly link: 'none' | 'active' | 'expired' }
  /** Per-action answers from permissions.ts, for "disabled + why" in the UI. */
  readonly can: {
    readonly edit: boolean
    readonly comment: boolean
    readonly download: boolean
    readonly viewHistory: boolean
    readonly trash: boolean
    readonly share: boolean
  }
}

/** What a guest sees: no project, version list, activity, access list, key or user id (docs/09 §3.5). */
export interface GuestFileView {
  readonly id: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly updatedAt: number
  readonly currentVersion: { readonly number: number }
  readonly thumbnailAvailable: boolean
  readonly model: ModelPreview
  readonly can: { readonly download: boolean; readonly comment: boolean }
  readonly sharedBy: PersonName
}

export type AnyFileView = FileView | GuestFileView

export interface FilePage {
  readonly items: ReadonlyArray<AnyFileView>
  readonly nextCursor: string | null
}

export interface TrashItem {
  readonly id: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly projectId: string | null
  readonly projectName: string | null
  readonly deletedAt: number
  readonly deletedBy: PersonName | null
  /** When the daily job purges the file for good. */
  readonly purgeAt: number
  readonly can: { readonly restore: boolean; readonly purge: boolean }
}

export interface VersionEntry {
  /** `current` for the file's current version, the `file_versions` id for an older one. */
  readonly id: string
  readonly number: number
  readonly size: number
  readonly uploadedBy: PersonName | null
  readonly createdAt: number
  readonly thumbnailAvailable: boolean
}

/**
 * What a share link's page shows (docs/09 §3.5). Built field by field from an allow-list: no file id, project, version
 * list, activity, key or user id. `sharer` is who shared it (D18: the sharing company on top).
 */
export interface LinkFileView {
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly updatedAt: number
  readonly currentVersion: { readonly number: number }
  readonly thumbnailAvailable: boolean
  readonly model: ModelPreview
  /** `download` follows the link's level; a link never comments. */
  readonly can: { readonly download: boolean; readonly comment: false }
  readonly sharer: { readonly displayName: string; readonly workspaceLabel: string | null }
  /** Unix seconds, or null when the link does not expire. */
  readonly expiresAt: number | null
}

/** The answer of `resolveShareLink`: the file card, or the password gate (no name, no size, nothing about the file). */
export type ResolvedLink =
  | { readonly kind: 'file'; readonly file: LinkFileView }
  | { readonly kind: 'password' }

/** One comment of a file (docs/09 §6). No e-mail and no user id: the author is a display name only. */
export interface CommentView {
  readonly id: string
  /** The top-level comment this replies to (one level only); null for a top-level comment. */
  readonly parentId: string | null
  /** `null` when the author's account is gone. */
  readonly author: PersonName | null
  /** Empty for a deleted comment (a tombstone: the UI shows "Yorum silindi"). */
  readonly content: string
  readonly deleted: boolean
  /** Unix seconds. */
  readonly createdAt: number
  /** The file's version number when the comment was written; null for legacy comments. */
  readonly versionNumber: number | null
  /** The caller wrote it. */
  readonly mine: boolean
  /** The caller may delete it: its author, or an owner or admin. */
  readonly canDelete: boolean
}

export interface CommentPage {
  readonly items: ReadonlyArray<CommentView>
  readonly nextCursor: string | null
}

/** One event of a file's activity tab (docs/09 §7.4). Names are resolved at read time; nothing personal is stored in the log. */
export interface FileActivityItem {
  readonly id: string
  /** A fixed event name such as `file.renamed` or `comment.created`. */
  readonly action: string
  readonly outcome: 'allowed' | 'denied'
  /** `link` actors carry no name (anyone with the link); `system` is the cron. */
  readonly actor: { readonly kind: 'user' | 'link' | 'system'; readonly displayName: string | null }
  readonly createdAt: number
}

export interface FileActivityPage {
  readonly items: ReadonlyArray<FileActivityItem>
  readonly nextCursor: string | null
}

/** A file somebody shared with the caller (a live file grant). Deliberately without project or version details: a guest sees it too. */
export interface SharedWithMeItem {
  readonly id: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly updatedAt: number
  readonly thumbnailAvailable: boolean
  readonly level: 'view' | 'comment' | 'download' | 'edit'
  /** Unix seconds; null for a grant that does not expire. */
  readonly expiresAt: number | null
  readonly sharedAt: number
  readonly sharedBy: PersonName | null
}

/** A file the caller shared: how many live grants it gave and whether its own link is active. */
export interface SharedByMeItem {
  readonly id: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly updatedAt: number
  readonly thumbnailAvailable: boolean
  readonly grants: number
  readonly linkActive: boolean
  /** Unix seconds of the caller's latest share of this file. */
  readonly sharedAt: number
}

export interface SharedPage<T> {
  readonly items: ReadonlyArray<T>
  readonly nextCursor: string | null
}

/** One project of the list (docs/09 §5.1, docs/08 §4). Only projects the caller can open are listed. */
export interface ProjectView {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly accessMode: 'team' | 'restricted'
  readonly fileCount: number
  readonly createdBy: PersonName | null
  /** Unix seconds. */
  readonly createdAt: number
  readonly updatedAt: number
  readonly can: { readonly update: boolean; readonly manageAccess: boolean; readonly upload: boolean }
}

export interface ProjectList {
  readonly items: ReadonlyArray<ProjectView>
}

/** A person holding access to a file (docs/09 §5.1, D20). */
export interface FileAccessEntry {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly role: 'owner' | 'admin' | 'member' | 'commenter' | 'guest'
  readonly level: 'view' | 'comment' | 'download' | 'edit'
  /** `uploader` is ownership of the file, not a grant: it cannot be removed here. */
  readonly source: 'grant' | 'uploader'
  /** Unix seconds; null when the access does not end. */
  readonly expiresAt: number | null
  readonly expired: boolean
  readonly grantedBy: PersonName | null
  readonly self: boolean
  readonly canRevoke: boolean
}

/** A guest invitation that has not been accepted yet. */
export interface FileAccessInvitation {
  readonly id: string
  readonly email: string
  readonly level: 'view' | 'comment' | 'download'
  readonly accessExpiresAt: number
}

/**
 * Who can open a file. `canManage` is the answer of `shareFile`: without it the caller sees only their own row (a guest
 * only themself, D20), never the other people or invitations.
 */
export interface FileAccessList {
  readonly canManage: boolean
  readonly people: ReadonlyArray<FileAccessEntry>
  readonly invitations: ReadonlyArray<FileAccessInvitation>
}
