import { useEffect, useState } from 'react'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { RadioCard, RadioCardGroup } from '#/components/ui/RadioCard'
import { Skeleton } from '#/components/ui/Skeleton'
import { isValidFileName } from '#/shared/fileTypes'
import type { ProjectList, ProjectView } from '#/shared/fileViews'
import { useI18n } from '#/i18n'
import { failureKey } from '../errors'
import { useSession } from '../session'
import { isFullView, type AnyFileView, type MoveEffects } from './types'

/** Rename: the server keeps the file's extension (typing `v1.2` becomes `v1.2.step`). */
export const RenameDialog = ({
  file,
  workspaceId,
  onClose,
  onRenamed,
}: {
  file: AnyFileView | null
  workspaceId: string
  onClose: () => void
  onRenamed: (name: string) => void
}) => {
  const { t } = useI18n()
  const { call } = useSession()
  const [name, setName] = useState(() => file?.name.replace(/\.[^.]+$/, '') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!file) return null
  const submit = async () => {
    const typed = name.trim()
    if (!isValidFileName(`${typed}.${file.extension}`)) return setError(t('files.rename.invalid'))
    setBusy(true)
    setError(null)
    const result = await call<{ fileId: string; name: string }>('renameFile', { workspaceId, fileId: file.id, name: typed })
    setBusy(false)
    if (result.ok) onRenamed(result.data.name)
    else setError(t(failureKey(result)))
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('files.rename.title')}
        footer={
          <DialogFooter>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              {t('files.rename.save')}
            </Button>
          </DialogFooter>
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label={t('files.rename.label')} hint={t('files.rename.hint', { extension: file.extension })} {...(error ? { error } : {})}>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={255} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type Preview = { readonly fileId: string; readonly effects: MoveEffects }

const sumEffects = (previews: readonly Preview[]): MoveEffects =>
  previews.reduce<MoveEffects>(
    (sum, { effects }) => ({
      links: sum.links + effects.links,
      invitations: sum.invitations + effects.invitations,
      guestGrants: sum.guestGrants + effects.guestGrants,
      memberGrants: sum.memberGrants + effects.memberGrants,
    }),
    { links: 0, invitations: 0, guestGrants: 0, memberGrants: 0 },
  )

const NONE = '__none__'

/**
 * Moves files to a project or out of every project (docs/09 §5.4). The projects come from `listProjects`; each file is
 * checked with `previewMoveFile` first. Moving into an invited-only project takes links and access away: the window shows
 * those numbers and needs a second, explicit press before `moveFile` runs with them as `expected` (a changed answer stops it).
 */
export const MoveDialog = ({
  files,
  workspaceId,
  onClose,
  onMoved,
}: {
  files: readonly AnyFileView[]
  workspaceId: string
  onClose: () => void
  onMoved: (ids: ReadonlySet<string>) => void
}) => {
  const { t } = useI18n()
  const { call } = useSession()
  const [projects, setProjects] = useState<ProjectView[] | 'loading' | 'error'>('loading')
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<readonly Preview[] | null>(null)
  const open = files.length > 0

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void call<ProjectList>('listProjects', { workspaceId }).then((result) => {
      if (!cancelled) setProjects(result.ok ? [...result.data.items] : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [call, workspaceId, open])

  if (!open) return null
  const first = files[0]
  const currentIds = new Set(files.map((file) => (isFullView(file) ? file.projectId : null)))
  const single = files.length === 1
  const currentOf = (id: string | null) => single && currentIds.has(id)
  const chosen = target === null ? undefined : target === NONE ? null : target
  const targetProject = typeof chosen === 'string' && Array.isArray(projects) ? projects.find((p) => p.id === chosen) : undefined
  const restricted = targetProject?.accessMode === 'restricted'

  const submit = async () => {
    if (chosen === undefined) return
    setBusy(true)
    setError(null)
    let previews: readonly Preview[] = pending ?? []
    if (pending === null) {
      const gathered: Preview[] = []
      for (const file of files) {
        const preview = await call<Preview>('previewMoveFile', { workspaceId, fileId: file.id, targetProjectId: chosen })
        if (!preview.ok) {
          setBusy(false)
          return setError(t(failureKey(preview)))
        }
        gathered.push({ fileId: file.id, effects: preview.data.effects })
      }
      const total = sumEffects(gathered)
      if (total.links + total.invitations + total.guestGrants + total.memberGrants > 0) {
        setPending(gathered)
        setBusy(false)
        return
      }
      previews = gathered
    }
    const moved = new Set<string>()
    for (const file of files) {
      const expected = previews.find((p) => p.fileId === file.id)?.effects
      const result = await call('moveFile', { workspaceId, fileId: file.id, targetProjectId: chosen, ...(expected ? { expected } : {}) })
      if (!result.ok) {
        setBusy(false)
        setPending(null)
        if (moved.size > 0) onMoved(moved)
        return setError(t(failureKey(result)))
      }
      moved.add(file.id)
    }
    setBusy(false)
    onMoved(moved)
  }

  const total = pending === null ? null : sumEffects(pending)
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        title={t('files.move.title')}
        description={t('files.move.lead', { name: single && first ? first.name : String(files.length) })}
        footer={
          <DialogFooter>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} disabled={chosen === undefined} onClick={() => void submit()}>
              {pending === null ? t('files.move.confirm') : t('move.confirmAnyway')}
            </Button>
          </DialogFooter>
        }
      >
        {projects === 'loading' ? (
          <div role="status" aria-busy="true" aria-label={t('access.loading')} className="grid gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : null}
        {projects === 'error' ? (
          <InlineAlert title={t('move.loadError')} action={<Button onClick={() => { setProjects('loading'); void call<ProjectList>('listProjects', { workspaceId }).then((result) => setProjects(result.ok ? [...result.data.items] : 'error')) }}>{t('common.retry')}</Button>}>
            {t('files.error.lead')}
          </InlineAlert>
        ) : null}
        {Array.isArray(projects) ? (
          <RadioCardGroup aria-label={t('move.targets')} value={target ?? ''} onValueChange={(value) => { setTarget(value); setPending(null); setError(null) }}>
            <RadioCard value={NONE} disabled={currentOf(null)} title={t('move.noProject')} description={currentOf(null) ? t('move.current') : t('move.noProjectLead')} />
            {projects.map((project) => (
              <RadioCard
                key={project.id}
                value={project.id}
                disabled={currentOf(project.id) || !project.can.upload}
                title={
                  <>
                    <span className="truncate">{project.name}</span>
                    {project.accessMode === 'restricted' ? <Badge tone="warn">{t('move.restrictedBadge')}</Badge> : null}
                  </>
                }
                description={currentOf(project.id) ? t('move.current') : !project.can.upload ? t('move.cannot') : project.fileCount === 1 ? t('projects.filesOne') : t('projects.files', { count: project.fileCount })}
              />
            ))}
          </RadioCardGroup>
        ) : null}
        {!single ? <p className="text-sm text-text-3">{t('move.mixed')}</p> : null}
        {restricted ? (
          <Notice tone="warn">
            <strong className="block font-medium">{t('move.restrictedTitle')}</strong>
            {t('move.restrictedWarning')}
          </Notice>
        ) : null}
        {total ? <Notice tone="warn">{t('move.effects', { links: total.links, invitations: total.invitations, guests: total.guestGrants, members: total.memberGrants })}</Notice> : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
