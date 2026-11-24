/**
 * Shapes the file API returns (docs/09 §3.5). Plain types, no Effect: the browser imports them too.
 * The projections are allow-lists built field by field in `src/server/programs/fileContext.ts`; a contract test pins the
 * exact key sets. Neither shape ever carries an R2 key, a user id, an e-mail address or a token.
 */

export interface PersonName {
  readonly displayName: string
}

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
  readonly currentVersion: { readonly number: number; readonly uploadedBy: PersonName | null }
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
