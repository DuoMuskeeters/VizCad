/**
 * In-memory stand-in for the file operations of `/api/app/*`, used by tests and (dev only) by `?fixture=<scenario>`.
 * Mirrors the shapes of src/shared/fileViews.ts and the programs' answers; never imported by production code paths.
 */
import type { CommentView, FileActivityItem, VersionEntry } from '#/shared/fileViews'
import type { AnyFileView, FileView, ShareLinkSummary } from './types'

export type FilesScenario = 'normal' | 'empty' | 'error' | 'slow' | 'one-version'
type Role = 'owner' | 'admin' | 'member' | 'commenter' | 'guest'

const day = 86_400
const now = () => Math.floor(Date.now() / 1000)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ok = (data: unknown) => json(200, { ok: true, data })
const fail = (status: number, error: string, reason?: string) => json(status, { ok: false, error, ...(reason ? { reason } : {}) })

type Stored = {
  id: string
  name: string
  extension: string
  size: number
  project: string | null
  createdAt: number
  updatedAt: number
  starred: boolean
  uploader: string
  version: number
  trashed: boolean
  mine: boolean
  recent: boolean
}

const seed = (): Stored[] => {
  const t = now()
  const row = (id: string, name: string, size: number, uploader: string, ago: number, extra: Partial<Stored> = {}): Stored => ({
    id, name, extension: name.split('.').pop() ?? '', size, project: null, createdAt: t - ago - 5 * day, updatedAt: t - ago, starred: false,
    uploader, version: 1, trashed: false, mine: uploader === 'Ayşe Yılmaz', recent: false, ...extra,
  })
  return [
    row('f1', 'Flanş_DN100_rev3.step', 12_400_000, 'Ayşe Yılmaz', 3_600, { starred: true, project: 'Pompa revizyonu', version: 3, recent: true }),
    row('f2', 'Pompa_gövdesi_montaj.step', 86_200_000, 'Mehmet Kaya', 9 * 3_600, { project: 'Pompa revizyonu', recent: true }),
    row('f3', 'Konveyör_şase.iges', 41_000_000, 'Ayşe Yılmaz', day + 3_600, { recent: true }),
    row('f4', 'Rulman_yuvası_6205.stl', 3_800_000, 'Zeynep Arslan', 6 * day),
    row('f5', 'Mil_Ø25x300.step', 1_200_000, 'Mehmet Kaya', 7 * day, { starred: true }),
    row('f6', 'Kapak_plakası_t5.obj', 640_000, 'Ayşe Yılmaz', 11 * day),
    row('f7', 'Braket_sol_v2.3mf', 2_100_000, 'Zeynep Arslan', 15 * day),
    row('f8', 'Dişli_z32_m2.stl', 5_600_000, 'Can Demir', 23 * day),
  ]
}

const viewOf = (file: Stored, role: Role): AnyFileView => {
  if (role === 'guest')
    return {
      id: file.id, name: file.name, extension: file.extension, size: file.size, updatedAt: file.updatedAt, currentVersion: { number: file.version },
      thumbnailAvailable: false, can: { download: true, comment: true }, sharedBy: { displayName: 'Hakan Demir' },
    }
  const edits = role === 'owner' || role === 'admin' || role === 'member'
  const view: FileView = {
    id: file.id, name: file.name, extension: file.extension, size: file.size, projectId: file.project === null ? null : `p-${file.project}`, projectName: file.project,
    createdAt: file.createdAt, updatedAt: file.updatedAt, starred: file.starred, thumbnailAvailable: false,
    currentVersion: { number: file.version, uploadedBy: { displayName: file.uploader } },
    can: { edit: edits, comment: true, download: true, viewHistory: true, trash: edits, share: edits },
  }
  return view
}

export type FilesFixture = {
  /** The response for a file operation, or `undefined` when the operation is not one of them. */
  readonly handle: (operation: string, body: Record<string, unknown>) => Promise<Response | undefined>
}

export const createFilesFixture = (role: Role, scenario: FilesScenario = 'normal', me = 'Ayşe Yılmaz'): FilesFixture => {
  let files = scenario === 'empty' ? [] : seed()
  let counter = 0
  const uploads = new Map<string, { name: string; size: number; target: string | null }>()
  let comments: (CommentView & { fileId: string })[] = [
    { fileId: 'f1', id: 'c1', parentId: null, author: { displayName: 'Mehmet Kaya' }, content: 'Cıvata dairesi çapını kontrol eder misin? EN 1092-1 tablosunda 180 mm yazıyor.', deleted: false, createdAt: now() - 2 * day, versionNumber: 2, mine: false, canDelete: role === 'owner' || role === 'admin' },
    { fileId: 'f1', id: 'c2', parentId: 'c1', author: { displayName: me }, content: 'Kontrol ettim, 3. sürümde düzelttim.', deleted: false, createdAt: now() - day, versionNumber: 3, mine: true, canDelete: true },
    { fileId: 'f1', id: 'c3', parentId: null, author: null, content: '', deleted: true, createdAt: now() - 3 * day, versionNumber: 1, mine: false, canDelete: false },
  ]
  let grants: { userId: string; level: string; expiresAt: number | null }[] = []
  let link: ShareLinkSummary | null = null
  let versionSeq = 0

  const find = (id: unknown) => files.find((f) => f.id === id)
  const edits = role === 'owner' || role === 'admin' || role === 'member'

  const handle: FilesFixture['handle'] = async (operation, body) => {
    switch (operation) {
      case 'listFiles': {
        if (scenario === 'error') return fail(500, 'RateLimitError')
        if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 60_000))
        const filter = String(body['filter'] ?? 'all')
        const query = typeof body['query'] === 'string' ? body['query'].toLowerCase() : ''
        const sort = String(body['sort'] ?? 'updated')
        const direction = body['direction'] === 'asc' ? 1 : -1
        let rows = files.filter((f) => !f.trashed)
        if (filter === 'starred') rows = rows.filter((f) => f.starred)
        if (filter === 'mine') rows = rows.filter((f) => f.mine)
        if (filter === 'recent') rows = rows.filter((f) => f.recent)
        if (query) rows = rows.filter((f) => f.name.toLowerCase().includes(query))
        rows = [...rows].sort((a, b) => {
          const key = sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? a.size - b.size : sort === 'created' ? a.createdAt - b.createdAt : a.updatedAt - b.updatedAt
          return key * direction
        })
        const limit = typeof body['limit'] === 'number' ? body['limit'] : 30
        const start = typeof body['cursor'] === 'string' ? Number(body['cursor']) : 0
        const page = rows.slice(start, start + limit)
        return ok({ items: page.map((f) => viewOf(f, role)), nextCursor: start + limit < rows.length ? String(start + limit) : null })
      }
      case 'getFile': {
        const file = find(body['fileId'])
        return file && !file.trashed ? ok(viewOf(file, role)) : fail(404, 'ResourceUnavailable')
      }
      case 'renameFile': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const typed = String(body['name']).trim()
        file.name = typed.toLowerCase().endsWith(`.${file.extension.toLowerCase()}`) ? typed : `${typed}.${file.extension}`
        file.updatedAt = now()
        return ok({ fileId: file.id, name: file.name })
      }
      case 'starFile':
      case 'unstarFile': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        file.starred = operation === 'starFile'
        return ok({ fileId: file.id, starred: file.starred })
      }
      case 'trashFile': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        file.trashed = true
        return ok({ fileId: file.id })
      }
      case 'restoreFile': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        file.trashed = false
        return ok({ fileId: file.id, name: file.name })
      }
      case 'previewMoveFile':
        return ok({ fileId: body['fileId'], targetProjectId: null, effects: { links: 0, invitations: 0, guestGrants: 0, memberGrants: 0 } })
      case 'moveFile': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        file.project = null
        return ok({ fileId: file.id, projectId: null, moved: true, effects: { links: 0, invitations: 0, guestGrants: 0, memberGrants: 0 } })
      }
      case 'requestUpload': {
        const name = String(body['name'])
        const size = Number(body['size'])
        if (name.toLowerCase().startsWith('big')) return fail(413, 'FileTooLarge')
        if (name.toLowerCase().startsWith('quota')) return fail(409, 'StorageQuotaExceeded')
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const uploadId = `up-${++counter}`
        uploads.set(uploadId, { name, size, target: typeof body['targetFileId'] === 'string' ? body['targetFileId'] : null })
        return ok({ uploadId, url: `/__fixture/put/${uploadId}`, headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' }, expiresAt: now() + 600 })
      }
      case 'completeUpload': {
        const session = uploads.get(String(body['uploadId']))
        if (!session) return fail(404, 'UploadUnavailable')
        uploads.delete(String(body['uploadId']))
        const target = session.target === null ? undefined : find(session.target)
        if (target) {
          target.version += 1
          target.size = session.size
          target.updatedAt = now()
          return ok({ fileId: target.id, name: target.name, extension: target.extension, size: target.size, versionNumber: target.version, isNewVersion: true })
        }
        const extension = session.name.split('.').pop() ?? ''
        const created: Stored = { id: `f-new-${++counter}`, name: session.name, extension, size: session.size, project: null, createdAt: now(), updatedAt: now(), starred: false, uploader: me, version: 1, trashed: false, mine: true, recent: true }
        files = [created, ...files]
        return ok({ fileId: created.id, name: created.name, extension, size: created.size, versionNumber: 1, isNewVersion: false })
      }
      case 'cancelUpload':
        uploads.delete(String(body['uploadId']))
        return ok({ canceled: true })
      case 'listVersions': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        if (role === 'guest') return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const single = scenario === 'one-version' || file.version === 1
        const current: VersionEntry = { id: 'current', number: file.version, size: file.size, uploadedBy: { displayName: file.uploader }, createdAt: file.updatedAt, thumbnailAvailable: false }
        const older: VersionEntry[] = single
          ? []
          : Array.from({ length: file.version - 1 }, (_, i) => ({
              id: `v-${file.id}-${file.version - 1 - i}`, number: file.version - 1 - i, size: Math.round(file.size * 0.96), uploadedBy: { displayName: i % 2 === 0 ? 'Mehmet Kaya' : file.uploader },
              createdAt: file.updatedAt - (i + 1) * 4 * day, thumbnailAvailable: false,
            }))
        return ok({ current, versions: older })
      }
      case 'restoreVersion': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        file.version += 1 + versionSeq++ * 0
        file.updatedAt = now()
        return ok({ fileId: file.id, versionNumber: file.version })
      }
      case 'listComments': {
        const rows = comments.filter((c) => c.fileId === body['fileId'])
        return ok({ items: rows.map(({ fileId: _file, ...comment }) => comment), nextCursor: null })
      }
      case 'addComment': {
        const content = String(body['content']).trim()
        const created = { fileId: String(body['fileId']), id: `c-new-${++counter}`, parentId: typeof body['parentId'] === 'string' ? body['parentId'] : null, author: { displayName: me }, content, deleted: false, createdAt: now(), versionNumber: 1, mine: true, canDelete: true }
        comments = [...comments, created]
        const { fileId: _file, ...view } = created
        return ok(view)
      }
      case 'deleteComment':
        comments = comments.map((c) => (c.id === body['commentId'] ? { ...c, content: '', deleted: true } : c))
        return ok({ deleted: true })
      case 'listFileActivity': {
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const t = now()
        const items: FileActivityItem[] = [
          { id: 'a1', action: 'comment.created', outcome: 'allowed', actor: { kind: 'user', displayName: me }, createdAt: t - day },
          { id: 'a2', action: 'file.version_uploaded', outcome: 'allowed', actor: { kind: 'user', displayName: me }, createdAt: t - 2 * day },
          { id: 'a3', action: 'link.opened', outcome: 'allowed', actor: { kind: 'link', displayName: null }, createdAt: t - 2 * day - 3_600 },
          { id: 'a4', action: 'file.access_granted', outcome: 'allowed', actor: { kind: 'user', displayName: 'Mehmet Kaya' }, createdAt: t - 5 * day },
          { id: 'a5', action: 'file.uploaded', outcome: 'allowed', actor: { kind: 'user', displayName: me }, createdAt: t - 9 * day },
        ]
        return ok({ items, nextCursor: null })
      }
      case 'getShareSettings':
        return edits ? ok({ links: link ? [link] : [] }) : fail(403, 'PermissionDenied', 'ROLE_LIMIT')
      case 'createShareLink': {
        if (link && !link.expired) return fail(409, 'LinkConflict')
        const expiresAt = typeof body['expiresAt'] === 'number' ? body['expiresAt'] : null
        link = { id: 'l1', level: body['level'] === 'download' ? 'download' : 'view', expiresAt, hasPassword: typeof body['password'] === 'string', legacy: false, expired: false }
        return ok({ link, url: 'https://viz-cad.com/s/k8F2mQ-example-token' })
      }
      case 'updateShareLink': {
        if (!link) return fail(404, 'ResourceUnavailable')
        link = {
          ...link,
          ...(body['level'] === 'view' || body['level'] === 'download' ? { level: body['level'] } : {}),
          ...('expiresAt' in body ? { expiresAt: typeof body['expiresAt'] === 'number' ? body['expiresAt'] : null } : {}),
          ...('password' in body ? { hasPassword: typeof body['password'] === 'string' } : {}),
        }
        return ok({ link })
      }
      case 'revokeShareLink':
        link = null
        return ok({ revoked: 1 })
      case 'copyShareLink':
        return link ? ok({ link, url: 'https://viz-cad.com/s/k8F2mQ-example-token' }) : fail(404, 'ResourceUnavailable')
      case 'grantFileAccess': {
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const grant = { userId: String(body['userId']), level: String(body['level']), expiresAt: typeof body['expiresAt'] === 'number' ? body['expiresAt'] : null }
        grants = [...grants.filter((g) => g.userId !== grant.userId), grant]
        return ok({ fileId: body['fileId'], ...grant })
      }
      case 'revokeFileAccess':
        grants = grants.filter((g) => g.userId !== body['userId'])
        return ok({ revoked: true })
      case 'inviteGuest': {
        const email = String(body['email']).toLowerCase()
        if (email.startsWith('full')) return fail(409, 'GuestLimitReached')
        if (typeof body['accessExpiresAt'] !== 'number') return fail(400, 'ValidationError')
        return ok({ email, invited: true })
      }
      default:
        return undefined
    }
  }
  return { handle }
}
