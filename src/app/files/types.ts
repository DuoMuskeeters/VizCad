/** Browser-side shapes of the file API answers (src/shared/fileViews.ts has the file views themselves; programs stay server-only). */
import type { AnyFileView, FileView, GuestFileView } from '#/shared/fileViews'

export type { AnyFileView, FileView, GuestFileView }

export type FileFilter = 'all' | 'recent' | 'starred' | 'mine'
export type FileSort = 'updated' | 'created' | 'name' | 'size'

export type LinkLevel = 'view' | 'download'

export type ShareLinkSummary = {
  readonly id: string
  readonly level: LinkLevel
  /** Unix seconds, or null for a link that does not expire. */
  readonly expiresAt: number | null
  readonly hasPassword: boolean
  readonly legacy: boolean
  readonly expired: boolean
}

export type UploadTicket = {
  readonly uploadId: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt: number
}

export type UploadedFile = {
  readonly fileId: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly versionNumber: number
  readonly isNewVersion: boolean
  /** The largest STEP/IGES/3MF the browser converts to a GLB (`Entitlements.maxConvertBytes`). */
  readonly maxConvertBytes: number
}

export type MoveEffects = { readonly links: number; readonly invitations: number; readonly guestGrants: number; readonly memberGrants: number }

/** A full internal view carries `can.edit`; a guest's view only `download` and `comment`. */
export const isFullView = (file: AnyFileView): file is FileView => 'projectId' in file

export type FileAbilities = {
  readonly edit: boolean
  readonly download: boolean
  readonly comment: boolean
  readonly share: boolean
  readonly trash: boolean
  readonly viewHistory: boolean
}

export const abilitiesOf = (file: AnyFileView): FileAbilities =>
  isFullView(file)
    ? file.can
    : { edit: false, download: file.can.download, comment: file.can.comment, share: false, trash: false, viewHistory: false }

export const contentUrl = (fileId: string, version?: string) =>
  `/api/files/${encodeURIComponent(fileId)}/content${version === undefined ? '' : `?v=${encodeURIComponent(version)}`}`

/** What the 3D viewer reads (docs/11 §2.4): the current version, audited as a preview, not a download. */
export const modelUrl = (fileId: string) => `/api/files/${encodeURIComponent(fileId)}/model`

export const thumbnailUrl = (fileId: string, version: number) => `/api/files/${encodeURIComponent(fileId)}/thumbnail?v=${version}`
