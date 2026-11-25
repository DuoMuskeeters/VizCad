import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Archive, EllipsisVertical, FolderKanban, FolderOpen, FolderSearch, Lock, Plus, RefreshCw, Search, Users } from 'lucide-react'
import { Badge } from '#/components/ui/Badge'
import { Button, IconButton } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { EmptyState } from '#/components/ui/EmptyState'
import { Field } from '#/components/ui/Field'
import { Input, Textarea } from '#/components/ui/Input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '#/components/ui/Menu'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { RadioCard, RadioCardGroup } from '#/components/ui/RadioCard'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import { useI18n } from '#/i18n'
import type { ProjectList, ProjectView } from '#/shared/fileViews'
import { ConfirmDialog } from '../team/ConfirmDialog'
import { failureKey } from '../errors'
import { formatWhen } from '../files/format'
import { useSession } from '../session'
import { useLoad } from '../useLoad'
import { useWorkspace } from '../workspace'

const SkeletonRows = () => (
  <div role="status" aria-busy="true" className="grid gap-3 pt-2">
    {Array.from({ length: 4 }, (_, i) => (
      <Skeleton key={i} className="h-24 w-full rounded-lg" />
    ))}
  </div>
)

export const ModeBadge = ({ mode }: { mode: ProjectView['accessMode'] }) => {
  const { t } = useI18n()
  return mode === 'restricted' ? (
    <Badge tone="warn">
      <Lock aria-hidden />
      {t('projects.mode.restricted')}
    </Badge>
  ) : (
    <Badge>
      <Users aria-hidden />
      {t('projects.mode.team')}
    </Badge>
  )
}

const CreateProjectDialog = ({ workspaceId, onClose, onCreated }: { workspaceId: string; onClose: () => void; onCreated: (project: { id: string; name: string }) => void }) => {
  const { t } = useI18n()
  const { call } = useSession()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<'team' | 'restricted'>('team')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const submit = async () => {
    const trimmed = name.trim()
    if (trimmed === '') return setNameError(t('projects.create.nameRequired'))
    setNameError(null)
    setBusy(true)
    setError(null)
    const result = await call<{ id: string; name: string }>('createProject', {
      workspaceId, name: trimmed, accessMode: mode, ...(description.trim() === '' ? {} : { description: description.trim() }),
    })
    setBusy(false)
    if (result.ok) onCreated(result.data)
    else setError(t(failureKey(result)))
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('projects.create.title')}
        description={t('projects.create.lead')}
        closeLabel={t('common.close')}
        footer={
          <DialogFooter>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              {t('projects.create.submit')}
            </Button>
          </DialogFooter>
        }
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label={t('projects.create.name')} {...(nameError ? { error: nameError } : {})}>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} autoComplete="off" />
          </Field>
          <Field label={t('projects.create.description')} optionalLabel={t('projects.create.optional')}>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
          </Field>
          <div className="grid gap-2">
            <p id="project-access-label" className="text-md font-medium">
              {t('projects.create.access')}
            </p>
            <RadioCardGroup aria-labelledby="project-access-label" value={mode} onValueChange={(value) => setMode(value === 'restricted' ? 'restricted' : 'team')}>
              <RadioCard value="team" title={t('projects.create.team')} description={t('projects.create.teamLead')} />
              <RadioCard value="restricted" title={t('projects.create.restricted')} description={t('projects.create.restrictedLead')} />
            </RadioCardGroup>
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Archives a project after a confirmation; used by the list and by the project page. */
export const ArchiveProjectDialog = ({ project, workspaceId, onClose, onArchived }: { project: ProjectView; workspaceId: string; onClose: () => void; onArchived: () => void }) => {
  const { t } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <ConfirmDialog
      open
      title={t('projects.archive.title', { name: project.name })}
      warning={t('projects.archive.warning')}
      confirmLabel={t('projects.archive.confirm')}
      confirmVariant="primary"
      warningTone="info"
      busy={busy}
      error={error}
      onCancel={onClose}
      onConfirm={() => {
        setBusy(true)
        setError(null)
        void call('archiveProject', { workspaceId, projectId: project.id }).then((result) => {
          setBusy(false)
          if (!result.ok) return setError(t(failureKey(result)))
          toast({ title: t('projects.archive.done', { name: project.name }), tone: 'success' })
          onArchived()
        })
      }}
    />
  )
}

const ProjectRow = ({ project, onArchive }: { project: ProjectView; onArchive: () => void }) => {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  return (
    <li className="flex items-start gap-3 rounded-lg border border-line bg-bg p-4 hover:bg-surface">
      <span aria-hidden className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
        <FolderOpen className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="min-w-0 text-lg font-medium leading-snug [overflow-wrap:anywhere]">
            <Link to="/app/projects/$id" params={{ id: project.id }} className="rounded-sm hover:underline">
              {project.name}
            </Link>
          </h2>
          <ModeBadge mode={project.accessMode} />
        </div>
        {project.description ? <p className="mt-0.5 text-base text-text-2 [overflow-wrap:anywhere]">{project.description}</p> : null}
        <p className="mt-1.5 text-sm text-text-3">
          {[
            project.fileCount === 1 ? t('projects.filesOne') : t('projects.files', { count: project.fileCount }),
            t('projects.updated', { when: formatWhen(project.updatedAt, locale) }),
            project.createdBy ? t('projects.createdBy', { name: project.createdBy.displayName }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Menu>
        <MenuTrigger asChild>
          <IconButton label={t('projects.menu', { name: project.name })} size="sm">
            <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<FolderOpen />} onSelect={() => void navigate({ to: '/app/projects/$id', params: { id: project.id } })}>
            {t('projects.open')}
          </MenuItem>
          <MenuItem icon={<Archive />} onSelect={onArchive} {...(project.can.update ? {} : { disabledReason: t('projects.archive.reason') })}>
            {t('projects.archive')}
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  )
}

export const ProjectsPage = () => {
  const { t } = useI18n()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { active } = useWorkspace()
  const list = useLoad<ProjectList>('listProjects', { workspaceId: active.id })
  const [text, setText] = useState('')
  const [creating, setCreating] = useState(false)
  const [archiving, setArchiving] = useState<ProjectView | null>(null)
  const canCreate = active.role === 'owner' || active.role === 'admin' || active.role === 'member'

  const items = useMemo(() => {
    if (list.state.status !== 'ready') return []
    const query = text.trim().toLowerCase()
    return [...list.state.data.items]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((p) => query === '' || p.name.toLowerCase().includes(query) || (p.description ?? '').toLowerCase().includes(query))
  }, [list.state, text])
  const total = list.state.status === 'ready' ? list.state.data.items.length : 0
  const subtitle = list.state.status === 'ready' ? `${active.kind === 'personal' ? t('app.workspace.personal') : active.name} · ${total === 1 ? t('projects.countOne') : t('projects.count', { count: total })}` : active.kind === 'personal' ? t('app.workspace.personal') : active.name

  return (
    <>
      <PageHeader
        title={t('projects.title')}
        subtitle={subtitle}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} {...(canCreate ? {} : { disabledReason: t('projects.newDenied') })}>
            <Plus aria-hidden className="size-4.5" />
            {t('projects.new')}
          </Button>
        }
      />
      {total > 0 ? (
        <div className="relative pb-4">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-[calc(50%-8px)] size-4.5 -translate-y-1/2 text-text-3" />
          <Input type="search" aria-label={t('projects.search.label')} placeholder={t('projects.search.placeholder')} value={text} onChange={(event) => setText(event.target.value)} className="pl-10 app:max-w-90" />
        </div>
      ) : null}
      {list.state.status === 'loading' ? <SkeletonRows /> : null}
      {list.state.status === 'error' ? (
        <div className="py-8">
          <InlineAlert title={t('projects.error.title')} action={<Button onClick={() => void list.retry()}><RefreshCw aria-hidden className="size-4" />{t('common.retry')}</Button>}>
            {t('projects.error.lead')}
          </InlineAlert>
        </div>
      ) : null}
      {list.state.status === 'ready' && total === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title={t('projects.empty.title')}
          description={canCreate ? t('projects.empty.lead') : t('projects.empty.noCreate')}
          {...(canCreate ? { actions: <Button variant="primary" onClick={() => setCreating(true)}><Plus aria-hidden className="size-4.5" />{t('projects.new')}</Button> } : {})}
        />
      ) : null}
      {list.state.status === 'ready' && total > 0 && items.length === 0 ? (
        <EmptyState icon={<FolderSearch />} title={t('projects.empty.search', { query: text.trim() })} description={t('projects.empty.searchLead')} actions={<Button onClick={() => setText('')}>{t('files.empty.search.clear')}</Button>} />
      ) : null}
      {items.length > 0 ? (
        <ul aria-label={t('projects.listLabel')} className="grid gap-3 app:grid-cols-2">
          {items.map((project) => (
            <ProjectRow key={project.id} project={project} onArchive={() => setArchiving(project)} />
          ))}
        </ul>
      ) : null}
      {creating ? (
        <CreateProjectDialog
          workspaceId={active.id}
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false)
            toast({ title: t('projects.create.done', { name: project.name }), tone: 'success' })
            void navigate({ to: '/app/projects/$id', params: { id: project.id } })
          }}
        />
      ) : null}
      {archiving ? (
        <ArchiveProjectDialog
          project={archiving}
          workspaceId={active.id}
          onClose={() => setArchiving(null)}
          onArchived={() => {
            setArchiving(null)
            void list.reload()
          }}
        />
      ) : null}
    </>
  )
}
