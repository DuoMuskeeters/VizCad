/**
 * In-memory stand-in for the file operations of `/api/app/*`, used by tests and (dev only) by `?fixture=<scenario>`.
 * Mirrors the shapes of src/shared/fileViews.ts and the programs' answers; never imported by production code paths.
 */
import { fileTypeOfExtension, hasDerivative } from '#/shared/fileTypes'
import type { CommentView, FileAccessEntry, FileAccessInvitation, FileActivityItem, ModelPreview, ProjectView, SharedByMeItem, SharedWithMeItem, TrashItem, VersionEntry } from '#/shared/fileViews'
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
  /** Project id, or null. */
  project: string | null
  createdAt: number
  updatedAt: number
  starred: boolean
  uploader: string
  version: number
  trashed: boolean
  deletedAt?: number
  deletedBy?: string
  mine: boolean
  recent: boolean
  /** A link on the file: none, live, or expired. */
  link: 'none' | 'active' | 'expired'
  /** Bytes of a stored GLB derivative (STEP/IGES/3MF), or absent. */
  glb?: number
}

type Person = { readonly userId: string; readonly name: string; readonly email: string; readonly role: Role }
const roster: readonly Person[] = [
  { userId: 'u-hakan', name: 'Hakan Demir', email: 'hakan@demirmakina.com', role: 'owner' },
  { userId: 'u-me', name: 'Ayşe Yılmaz', email: 'ayse@demirmakina.com', role: 'admin' },
  { userId: 'u-mehmet', name: 'Mehmet Kaya', email: 'mehmet@demirmakina.com', role: 'member' },
  { userId: 'u-zeynep', name: 'Zeynep Arslan', email: 'zeynep@demirmakina.com', role: 'member' },
  { userId: 'u-selin', name: 'Selin Er', email: 'selin@demirmakina.com', role: 'commenter' },
  { userId: 'u-omer', name: 'Ömer Koç', email: 'omer@koc-kalip.com.tr', role: 'guest' },
  { userId: 'u-derya', name: 'Derya Kaya', email: 'derya@kayahidrolik.com', role: 'guest' },
]

type Grant = { userId: string; level: FileAccessEntry['level']; expiresAt: number | null; grantedBy: string }
type Project = { id: string; name: string; description: string | null; accessMode: 'team' | 'restricted'; createdBy: string; createdAt: number; updatedAt: number; archived: boolean }

const seed = (): Stored[] => {
  const t = now()
  const row = (id: string, name: string, size: number, uploader: string, ago: number, extra: Partial<Stored> = {}): Stored => ({
    id, name, extension: name.split('.').pop() ?? '', size, project: null, createdAt: t - ago - 5 * day, updatedAt: t - ago, starred: false,
    uploader, version: 1, trashed: false, mine: uploader === 'Ayşe Yılmaz', recent: false, link: 'none', ...extra,
  })
  return [
    row('f1', 'Flanş_DN100_rev3.step', 12_400_000, 'Ayşe Yılmaz', 3_600, { starred: true, project: 'p-pompa', version: 3, recent: true }),
    row('f2', 'Pompa_gövdesi_montaj.step', 86_200_000, 'Mehmet Kaya', 9 * 3_600, { project: 'p-pompa', recent: true, glb: 14_900_000 }),
    row('f3', 'Konveyör_şase.iges', 41_000_000, 'Ayşe Yılmaz', day + 3_600, { recent: true }),
    row('f4', 'Rulman_yuvası_6205.stl', 3_800_000, 'Zeynep Arslan', 6 * day),
    row('f5', 'Mil_Ø25x300.step', 1_200_000, 'Mehmet Kaya', 7 * day, { starred: true }),
    row('f6', 'Kapak_plakası_t5.obj', 640_000, 'Ayşe Yılmaz', 11 * day, { link: 'active' }),
    row('f7', 'Braket_sol_v2.3mf', 2_100_000, 'Zeynep Arslan', 15 * day),
    row('f8', 'Dişli_z32_m2.stl', 5_600_000, 'Can Demir', 23 * day, { project: 'p-konveyor', link: 'expired' }),
    row('f9', 'Konveyör_taşıyıcı.step', 22_000_000, 'Mehmet Kaya', 4 * day, { project: 'p-konveyor' }),
    row('f10', 'Flanş_DN50.step', 3_200_000, 'Zeynep Arslan', 5 * day, { project: 'p-flans' }),
    row('t1', 'Eski_braket_v1.step', 4_100_000, 'Ayşe Yılmaz', 40 * day, { trashed: true, deletedAt: t - 2 * day, deletedBy: 'Ayşe Yılmaz' }),
    row('t2', 'Kapak_taslak.stl', 8_900_000, 'Mehmet Kaya', 30 * day, { trashed: true, deletedAt: t - 9 * day, deletedBy: 'Mehmet Kaya', project: 'p-pompa' }),
    row('t3', 'Test_parça_3.obj', 1_300_000, 'Zeynep Arslan', 28 * day, { trashed: true, deletedAt: t - 27 * day, deletedBy: 'Hakan Demir' }),
  ]
}

/** What `model` would answer in the fixture (D23): a stored GLB for everyone, else STEP/IGES/3MF only for downloaders. */
const fixtureModel = (file: Stored, canDownload: boolean): ModelPreview => {
  const type = fileTypeOfExtension(file.extension)
  const derives = type !== undefined && hasDerivative(type.id)
  const kind = type === undefined ? 'none' : derives && file.glb !== undefined ? 'derivative' : !derives || canDownload ? 'source' : 'none'
  return {
    kind,
    bytes: kind === 'derivative' ? (file.glb ?? null) : kind === 'source' ? file.size : null,
    derivative: derives && file.glb !== undefined ? { state: 'ready', code: null, parts: 455 } : null,
    maxConvertBytes: 50 * 1024 * 1024,
  }
}

const viewOf = (file: Stored, role: Role, projectName: (id: string | null) => string | null, people: number): AnyFileView => {
  if (role === 'guest')
    return {
      id: file.id, name: file.name, extension: file.extension, size: file.size, updatedAt: file.updatedAt, currentVersion: { number: file.version },
      thumbnailAvailable: false, model: fixtureModel(file, true), can: { download: true, comment: true }, sharedBy: { displayName: 'Hakan Demir' },
    }
  const edits = role === 'owner' || role === 'admin' || role === 'member'
  const view: FileView = {
    id: file.id, name: file.name, extension: file.extension, size: file.size, projectId: file.project, projectName: projectName(file.project),
    createdAt: file.createdAt, updatedAt: file.updatedAt, starred: file.starred, thumbnailAvailable: false, model: fixtureModel(file, role !== 'commenter'),
    currentVersion: { number: file.version, uploadedBy: { displayName: file.uploader } }, access: { people, link: file.link },
    can: { edit: edits, comment: true, download: role !== 'commenter', viewHistory: true, trash: edits, share: edits },
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
  const uploads = new Map<string, { name: string; size: number; target: string | null; project: string | null }>()
  let comments: (CommentView & { fileId: string })[] = [
    { fileId: 'f1', id: 'c1', parentId: null, author: { displayName: 'Mehmet Kaya' }, content: 'Cıvata dairesi çapını kontrol eder misin? EN 1092-1 tablosunda 180 mm yazıyor.', deleted: false, createdAt: now() - 2 * day, versionNumber: 2, mine: false, canDelete: role === 'owner' || role === 'admin' },
    { fileId: 'f1', id: 'c2', parentId: 'c1', author: { displayName: me }, content: 'Kontrol ettim, 3. sürümde düzelttim.', deleted: false, createdAt: now() - day, versionNumber: 3, mine: true, canDelete: true },
    { fileId: 'f1', id: 'c3', parentId: null, author: null, content: '', deleted: true, createdAt: now() - 3 * day, versionNumber: 1, mine: false, canDelete: false },
  ]
  const t0 = now()
  // Per file and per project: given access and waiting guest invitations.
  const fileGrants = new Map<string, Grant[]>([
    ['f1', [{ userId: 'u-selin', level: 'comment', expiresAt: null, grantedBy: me }, { userId: 'u-omer', level: 'download', expiresAt: t0 + 9 * day, grantedBy: me }]],
    ['f5', [{ userId: 'u-zeynep', level: 'edit', expiresAt: null, grantedBy: me }]],
  ])
  const fileInvites = new Map<string, FileAccessInvitation[]>([['f1', [{ id: 'ginv-1', email: 'satinalma@kayahidrolik.com', level: 'comment', accessExpiresAt: t0 + 20 * day }]]])
  let projects: Project[] = scenario === 'empty'
    ? []
    : [
        { id: 'p-pompa', name: 'Pompa revizyonu', description: 'Kaya Hidrolik için gövde ve kapak', accessMode: 'restricted', createdBy: me, createdAt: t0 - 40 * day, updatedAt: t0 - 3_600, archived: false },
        { id: 'p-konveyor', name: 'Konveyör hattı yenileme', description: 'Fabrika içi hat, 2027 bahar', accessMode: 'team', createdBy: 'Hakan Demir', createdAt: t0 - 60 * day, updatedAt: t0 - day, archived: false },
        { id: 'p-flans', name: 'Flanş serisi DN50–DN200', description: 'Standart ürün kataloğu', accessMode: 'team', createdBy: 'Zeynep Arslan', createdAt: t0 - 90 * day, updatedAt: t0 - 19 * day, archived: false },
        { id: 'p-teklif', name: 'Teklif: Yıldız Torna', description: 'Mil ve dişli, son gün 28 Kasım', accessMode: 'restricted', createdBy: 'Mehmet Kaya', createdAt: t0 - 20 * day, updatedAt: t0 - 18 * day, archived: false },
        { id: 'p-arsiv', name: 'Arşiv 2025', description: 'Tamamlanan işler', accessMode: 'team', createdBy: 'Hakan Demir', createdAt: t0 - 300 * day, updatedAt: t0 - 60 * day, archived: false },
      ]
  const projectGrants = new Map<string, Grant[]>([
    ['p-pompa', [
      { userId: 'u-mehmet', level: 'edit', expiresAt: null, grantedBy: me }, { userId: 'u-zeynep', level: 'edit', expiresAt: null, grantedBy: me },
      { userId: 'u-selin', level: 'comment', expiresAt: null, grantedBy: me }, { userId: 'u-omer', level: 'download', expiresAt: t0 + 7 * day, grantedBy: me },
    ]],
    ['p-teklif', [{ userId: 'u-mehmet', level: 'edit', expiresAt: null, grantedBy: 'u-mehmet' }]],
  ])
  const projectInvites = new Map<string, FileAccessInvitation[]>([['p-pompa', [{ id: 'pinv-1', email: 'satinalma@kayahidrolik.com', level: 'comment', accessExpiresAt: t0 + 30 * day }]]])
  const projectName = (id: string | null) => (id === null ? null : (projects.find((p) => p.id === id)?.name ?? null))
  const writer = role === 'owner' || role === 'admin' || role === 'member'
  const manager = role === 'owner' || role === 'admin'
  const personOf = (userId: string) => roster.find((x) => x.userId === userId)
  const entryOf = (g: Grant, source: 'grant' | 'uploader', canRevoke: boolean): FileAccessEntry | undefined => {
    const person = personOf(g.userId)
    if (!person) return undefined
    return {
      userId: person.userId, name: person.name, email: person.email, role: person.role, level: g.level, source, expiresAt: g.expiresAt,
      expired: g.expiresAt !== null && g.expiresAt <= now(), grantedBy: { displayName: g.grantedBy === 'u-me' ? me : g.grantedBy }, self: person.userId === 'u-me', canRevoke,
    }
  }
  const peopleCount = (file: Stored) => (fileGrants.get(file.id) ?? []).filter((g) => g.expiresAt === null || g.expiresAt > now()).length
  const sharedWithMe: SharedWithMeItem[] = scenario === 'empty'
    ? []
    : [
        { id: 'sw1', name: 'Pompa_gövdesi_montaj.step', extension: 'step', size: 86_200_000, updatedAt: t0 - 9 * 3_600, thumbnailAvailable: false, level: 'download', expiresAt: t0 + 12 * day, sharedAt: t0 - day, sharedBy: { displayName: 'Mehmet Kaya' } },
        { id: 'sw2', name: 'Rulman_yuvası_6205.stl', extension: 'stl', size: 3_800_000, updatedAt: t0 - 6 * day, thumbnailAvailable: false, level: 'comment', expiresAt: null, sharedAt: t0 - 4 * day, sharedBy: { displayName: 'Zeynep Arslan' } },
        { id: 'sw3', name: 'Mil_Ø25x300.step', extension: 'step', size: 1_200_000, updatedAt: t0 - 7 * day, thumbnailAvailable: false, level: 'view', expiresAt: t0 + 2 * day, sharedAt: t0 - 12 * day, sharedBy: { displayName: 'Hakan Demir' } },
      ]
  const sharedByMe: SharedByMeItem[] = scenario === 'empty' || role === 'guest'
    ? []
    : [
        { id: 'f1', name: 'Flanş_DN100_rev3.step', extension: 'step', size: 12_400_000, updatedAt: t0 - 3_600, thumbnailAvailable: false, grants: 2, linkActive: false, sharedAt: t0 - 2 * day },
        { id: 'f5', name: 'Mil_Ø25x300.step', extension: 'step', size: 1_200_000, updatedAt: t0 - 7 * day, thumbnailAvailable: false, grants: 1, linkActive: false, sharedAt: t0 - 8 * day },
        { id: 'f6', name: 'Kapak_plakası_t5.obj', extension: 'obj', size: 640_000, updatedAt: t0 - 11 * day, thumbnailAvailable: false, grants: 0, linkActive: true, sharedAt: t0 - 15 * day },
      ]
  const activityLog = (): { id: string; actorKind: 'user' | 'link' | 'system'; actorUserId: string | null; actorName: string | null; linkId: string | null; targetKind: string; targetId: string; action: string; outcome: 'allowed' | 'denied'; createdAt: number }[] => {
    const t = now()
    const u = (id: string, name: string, action: string, ago: number, targetKind = 'file', targetId = 'f1') => ({ id, actorKind: 'user' as const, actorUserId: `u-${name.split(' ')[0]?.toLowerCase()}`, actorName: name, linkId: null, targetKind, targetId, action, outcome: 'allowed' as const, createdAt: t - ago })
    return [
      u('l1', 'Ömer Koç', 'file.downloaded', 1_200), u('l2', 'Ömer Koç', 'file.previewed', 1_320), u('l3', 'Ayşe Yılmaz', 'file.version_uploaded', 2_400),
      { id: 'l4', actorKind: 'link', actorUserId: null, actorName: null, linkId: 'lk1', targetKind: 'file', targetId: 'f5', action: 'link.opened', outcome: 'allowed', createdAt: t - 3_000 },
      u('l5', 'Ayşe Yılmaz', 'project.access_granted', 4_000, 'project', 'p-pompa'), u('l6', 'Selin Er', 'comment.created', 5_200, 'file', 'f2'),
      u('l7', 'Ayşe Yılmaz', 'member.invite_canceled', day + 3_000, 'workspace', 'ws-dm'), u('l8', 'Mehmet Kaya', 'comment.created', day + 4_000, 'file', 'f2'),
      u('l9', 'Zeynep Arslan', 'file.uploaded', day + 6_000, 'file', 'f10'), u('l10', 'Mehmet Kaya', 'link.created', day + 8_000, 'file', 'f5'),
      u('l11', 'Derya Kaya', 'file.downloaded', 2 * day + 4_000, 'file', 'f9'), u('l12', 'Ayşe Yılmaz', 'project.access_mode_restricted', 2 * day + 6_000, 'project', 'p-pompa'),
      { ...u('l13', 'Ömer Koç', 'file.downloaded', 3 * day), outcome: 'denied' },
      u('l14', 'Ayşe Yılmaz', 'project.created', 40 * day, 'project', 'p-pompa'),
    ]
  }
  let link: ShareLinkSummary | null = null
  let versionSeq = 0

  const find = (id: unknown) => files.find((f) => f.id === id)
  const edits = writer
  const accessCanRevoke = (g: Grant) => manager || personOf(g.userId)?.role === 'guest'

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
        if (typeof body['projectId'] === 'string') {
          const project = projects.find((p) => p.id === body['projectId'] && !p.archived)
          if (!project) return fail(404, 'ResourceUnavailable')
          rows = rows.filter((f) => f.project === project.id)
        }
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
        return ok({ items: page.map((f) => viewOf(f, role, projectName, peopleCount(f))), nextCursor: start + limit < rows.length ? String(start + limit) : null })
      }
      case 'getFile': {
        const file = find(body['fileId'])
        return file && !file.trashed ? ok(viewOf(file, role, projectName, peopleCount(file))) : fail(404, 'ResourceUnavailable')
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
      case 'previewMoveFile': {
        const target = body['targetProjectId']
        const none = { links: 0, invitations: 0, guestGrants: 0, memberGrants: 0 }
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        const project = typeof target === 'string' ? projects.find((p) => p.id === target && !p.archived) : undefined
        if (typeof target === 'string' && !project) return fail(404, 'ResourceUnavailable')
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const effects = project?.accessMode === 'restricted' ? { links: file.link === 'none' ? 0 : 1, invitations: (fileInvites.get(file.id) ?? []).length, guestGrants: (fileGrants.get(file.id) ?? []).filter((g) => personOf(g.userId)?.role === 'guest').length, memberGrants: (fileGrants.get(file.id) ?? []).filter((g) => personOf(g.userId)?.role !== 'guest').length } : none
        return ok({ fileId: file.id, targetProjectId: typeof target === 'string' ? target : null, effects })
      }
      case 'moveFile': {
        const file = find(body['fileId'])
        if (!file) return fail(404, 'ResourceUnavailable')
        const target = typeof body['targetProjectId'] === 'string' ? body['targetProjectId'] : null
        const project = target === null ? undefined : projects.find((p) => p.id === target)
        if (target !== null && !project) return fail(404, 'ResourceUnavailable')
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        if (project?.accessMode === 'restricted' && !manager) return fail(403, 'PermissionDenied', 'PROJECT_MANAGER_REQUIRED')
        if (project?.accessMode === 'restricted') {
          file.link = 'none'
          fileGrants.delete(file.id)
          fileInvites.delete(file.id)
        }
        file.project = target
        return ok({ fileId: file.id, projectId: target, moved: true, effects: { links: 0, invitations: 0, guestGrants: 0, memberGrants: 0 } })
      }
      case 'requestUpload': {
        const name = String(body['name'])
        const size = Number(body['size'])
        if (name.toLowerCase().startsWith('big')) return fail(413, 'FileTooLarge')
        if (name.toLowerCase().startsWith('quota')) return fail(409, 'StorageQuotaExceeded')
        if (!edits) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const uploadId = `up-${++counter}`
        uploads.set(uploadId, { name, size, target: typeof body['targetFileId'] === 'string' ? body['targetFileId'] : null, project: typeof body['projectId'] === 'string' ? body['projectId'] : null })
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
          return ok({ fileId: target.id, name: target.name, extension: target.extension, size: target.size, versionNumber: target.version, isNewVersion: true, maxConvertBytes: 50 * 1024 * 1024 })
        }
        const extension = session.name.split('.').pop() ?? ''
        const created: Stored = { id: `f-new-${++counter}`, name: session.name, extension, size: session.size, project: session.project, link: 'none', createdAt: now(), updatedAt: now(), starred: false, uploader: me, version: 1, trashed: false, mine: true, recent: true }
        files = [created, ...files]
        return ok({ fileId: created.id, name: created.name, extension, size: created.size, versionNumber: 1, isNewVersion: false, maxConvertBytes: 50 * 1024 * 1024 })
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
        const linked = find(body['fileId'])
        if (linked) linked.link = 'active'
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
        return ok({ links: [link] })
      }
      case 'revokeShareLink': {
        link = null
        const unlinked = find(body['fileId'])
        if (unlinked) unlinked.link = 'none'
        return ok({ links: [] })
      }
      case 'copyShareLink':
        return link ? ok({ link, url: 'https://viz-cad.com/s/k8F2mQ-example-token' }) : fail(404, 'ResourceUnavailable')
      case 'grantFileAccess':
      case 'grantProjectAccess': {
        if (!(operation === 'grantFileAccess' ? edits : manager)) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const userId = String(body['userId'])
        const person = personOf(userId)
        const level = String(body['level']) as Grant['level']
        const expiresAt = typeof body['expiresAt'] === 'number' ? body['expiresAt'] : null
        if (person?.role === 'guest' && expiresAt === null) return fail(422, 'AccessExpiryInvalid')
        const store = operation === 'grantFileAccess' ? fileGrants : projectGrants
        const key = String(body[operation === 'grantFileAccess' ? 'fileId' : 'projectId'])
        store.set(key, [...(store.get(key) ?? []).filter((g) => g.userId !== userId), { userId, level, expiresAt, grantedBy: 'u-me' }])
        return ok({ userId, level, expiresAt })
      }
      case 'revokeGuestInvitation':
        for (const store of [fileInvites, projectInvites]) for (const [key, list] of store) store.set(key, list.filter((i) => i.id !== body['invitationId']))
        return ok({ canceled: true })
      case 'revokeFileAccess':
      case 'revokeProjectAccess': {
        const store = operation === 'revokeFileAccess' ? fileGrants : projectGrants
        const key = String(body[operation === 'revokeFileAccess' ? 'fileId' : 'projectId'])
        store.set(key, (store.get(key) ?? []).filter((g) => g.userId !== body['userId']))
        return ok({ revoked: true })
      }
      case 'inviteGuest': {
        const email = String(body['email']).toLowerCase()
        if (email.startsWith('full')) return fail(409, 'GuestLimitReached')
        if (typeof body['accessExpiresAt'] !== 'number') return fail(400, 'ValidationError')
        const invitation: FileAccessInvitation = { id: `inv-${++counter}`, email, level: (body['level'] as FileAccessInvitation['level'] | undefined) ?? 'comment', accessExpiresAt: body['accessExpiresAt'] }
        const store = typeof body['projectId'] === 'string' ? projectInvites : fileInvites
        const key = String(body['projectId'] ?? body['fileId'])
        store.set(key, [...(store.get(key) ?? []), invitation])
        return ok({ invitationId: invitation.id, email, level: invitation.level, expiresAt: now() + 7 * day, accessExpiresAt: body['accessExpiresAt'], resent: false })
      }
      case 'listFileAccess': {
        const file = find(body['fileId'])
        if (!file || file.trashed) return fail(404, 'ResourceUnavailable')
        const uploader = roster.find((x) => x.name === file.uploader)
        const rows: FileAccessEntry[] = []
        if (uploader) rows.push({ userId: uploader.userId, name: uploader.name, email: uploader.email, role: uploader.role, level: 'edit', source: 'uploader', expiresAt: null, expired: false, grantedBy: null, self: uploader.userId === 'u-me', canRevoke: false })
        for (const g of fileGrants.get(file.id) ?? []) {
          const entry = entryOf(g, 'grant', accessCanRevoke(g))
          if (entry) rows.push(entry)
        }
        if (role === 'guest') return ok({ canManage: false, people: rows.filter((r) => r.self), invitations: [] })
        return ok({ canManage: edits, people: edits ? rows : rows.filter((r) => r.self), invitations: edits ? (fileInvites.get(file.id) ?? []) : [] })
      }
      case 'listProjectAccess': {
        const project = projects.find((p) => p.id === body['projectId'] && !p.archived)
        if (!project) return fail(404, 'ResourceUnavailable')
        const rows = (projectGrants.get(project.id) ?? []).flatMap((g) => entryOf(g, 'grant', manager) ?? [])
        return ok({ canManage: manager, people: manager ? rows : rows.filter((r) => r.self), invitations: manager ? (projectInvites.get(project.id) ?? []) : [] })
      }
      case 'listProjects': {
        if (scenario === 'error') return fail(500, 'RateLimitError')
        if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 60_000))
        const items: ProjectView[] = projects
          .filter((p) => !p.archived && (p.accessMode === 'team' || manager || (projectGrants.get(p.id) ?? []).some((g) => g.userId === 'u-me')))
          .filter((p) => role !== 'guest' || (projectGrants.get(p.id) ?? []).some((g) => g.userId === 'u-me') || p.id === 'p-pompa')
          .map((p) => ({
            id: p.id, name: p.name, description: p.description, accessMode: p.accessMode,
            fileCount: files.filter((f) => f.project === p.id && !f.trashed).length + (p.id === 'p-arsiv' ? 48 : 0),
            createdBy: { displayName: p.createdBy }, createdAt: p.createdAt, updatedAt: p.updatedAt,
            can: { update: manager, manageAccess: manager, upload: writer },
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt)
        return ok({ items })
      }
      case 'createProject': {
        if (!writer) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const name = String(body['name']).trim()
        const created: Project = { id: `p-new-${++counter}`, name, description: typeof body['description'] === 'string' ? body['description'] : null, accessMode: body['accessMode'] === 'restricted' ? 'restricted' : 'team', createdBy: me, createdAt: now(), updatedAt: now(), archived: false }
        projects = [...projects, created]
        return ok({ id: created.id, name, description: created.description, accessMode: created.accessMode })
      }
      case 'archiveProject': {
        if (!manager) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        projects = projects.map((p) => (p.id === body['projectId'] ? { ...p, archived: true } : p))
        return ok({ id: body['projectId'], archived: true })
      }
      case 'setProjectAccessMode': {
        if (!manager) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        const mode = body['accessMode'] === 'restricted' ? 'restricted' : 'team'
        projects = projects.map((p) => (p.id === body['projectId'] ? { ...p, accessMode: mode, updatedAt: now() } : p))
        if (mode === 'restricted') for (const f of files) if (f.project === body['projectId']) f.link = 'none'
        return ok({ id: body['projectId'], accessMode: mode })
      }
      case 'listSharedWithMe':
        if (scenario === 'error') return fail(500, 'RateLimitError')
        return ok({ items: sharedWithMe, nextCursor: null })
      case 'listSharedByMe':
        if (scenario === 'error') return fail(500, 'RateLimitError')
        return ok({ items: sharedByMe, nextCursor: null })
      case 'listTrash': {
        if (scenario === 'error') return fail(500, 'RateLimitError')
        if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 60_000))
        const items: TrashItem[] = files.filter((f) => f.trashed).map((f) => ({
          id: f.id, name: f.name, extension: f.extension, size: f.size, projectId: f.project, projectName: projectName(f.project),
          deletedAt: f.deletedAt ?? now(), deletedBy: { displayName: f.deletedBy ?? me }, purgeAt: (f.deletedAt ?? now()) + 30 * day,
          can: { restore: edits, purge: manager },
        }))
        return ok({ items, nextCursor: null })
      }
      case 'purgeFile': {
        if (!manager) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        files = files.filter((f) => f.id !== body['fileId'])
        return ok({ purged: true })
      }
      case 'emptyTrash': {
        if (!manager) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        // Two files per call, like the server's groups, so the screen's `more` loop is exercised.
        const doomed = files.filter((f) => f.trashed).slice(0, 2)
        files = files.filter((f) => !doomed.includes(f))
        return ok({ purged: doomed.length, more: doomed.length > 0 && files.some((f) => f.trashed) })
      }
      case 'listActivity': {
        if (!manager) return fail(403, 'PermissionDenied', 'ROLE_LIMIT')
        if (scenario === 'error') return fail(500, 'RateLimitError')
        if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 60_000))
        if (scenario === 'empty') return ok({ items: [], nextCursor: null })
        return ok({ items: activityLog(), nextCursor: null })
      }
      default:
        return undefined
    }
  }
  return { handle }
}
