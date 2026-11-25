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
