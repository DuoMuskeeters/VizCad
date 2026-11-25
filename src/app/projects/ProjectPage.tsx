import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { Archive, EllipsisVertical, FolderX, Upload } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { EmptyState } from '#/components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '#/components/ui/Menu'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { RadioCard, RadioCardGroup } from '#/components/ui/RadioCard'
import { Skeleton } from '#/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/Tabs'
import { useToast } from '#/components/ui/Toast'
import { useI18n } from '#/i18n'
import type { ProjectList, ProjectView } from '#/shared/fileViews'
import { AccessPanel } from '../access/AccessPanel'
import { ActivityList, type ActivityItem } from '../activity/ActivityList'
import { ConfirmDialog } from '../team/ConfirmDialog'
import { failureKey } from '../errors'
import { FilesPage } from '../files/FilesPage'
import { useUploadProject, useUploads } from '../files/UploadProvider'
import { useSession } from '../session'
import { useLoad } from '../useLoad'
import { useWorkspace } from '../workspace'
import { ArchiveProjectDialog, ModeBadge } from './ProjectsPage'

type Mode = ProjectView['accessMode']

const AccessTab = ({ project, workspaceId, onModeChanged }: { project: ProjectView; workspaceId: string; onModeChanged: (mode: Mode) => void }) => {
  const { t } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canManage = project.can.manageAccess

  const apply = async (mode: Mode) => {
    setBusy(true)
    setError(null)
    const result = await call('setProjectAccessMode', { workspaceId, projectId: project.id, accessMode: mode })
    setBusy(false)
    if (!result.ok) return setError(t(failureKey(result)))
    setConfirming(false)
    onModeChanged(mode)
    toast({ title: mode === 'restricted' ? t('project.access.restrictedDone', { name: project.name }) : t('project.access.teamDone', { name: project.name }), tone: 'success' })
  }

  return (
    <div className="grid max-w-160 gap-8">
      <section aria-labelledby="project-mode" className="grid gap-3">
        <div>
          <h3 id="project-mode" className="text-lg font-heading tracking-heading">
            {t('project.access.modeTitle')}
          </h3>
          <p className="text-sm text-text-3">{t('project.access.modeLead')}</p>
        </div>
        <RadioCardGroup
          aria-labelledby="project-mode"
          value={project.accessMode}
          disabled={!canManage || busy}
          onValueChange={(value) => {
            if (value === project.accessMode) return
            if (value === 'restricted') setConfirming(true)
            else void apply('team')
          }}
        >
          <RadioCard value="team" title={t('project.access.team')} description={t('project.access.teamLead')} />
          <RadioCard value="restricted" title={t('project.access.restricted')} description={t('project.access.restrictedLead')} />
        </RadioCardGroup>
        {canManage ? null : <Notice>{t('project.access.modeReason')}</Notice>}
        {error && !confirming ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </section>
      <AccessPanel workspaceId={workspaceId} target={{ kind: 'project', projectId: project.id }} />
      {confirming ? (
        <ConfirmDialog
          open
          title={t('project.access.restrictedTitle', { name: project.name })}
          warning={t('project.access.restrictedWarning')}
          confirmLabel={t('project.access.restrictedConfirm')}
          busy={busy}
          error={error}
          onCancel={() => {
            setConfirming(false)
            setError(null)
          }}
          onConfirm={() => void apply('restricted')}
        />
      ) : null}
    </div>
  )
}

const ProjectActivityLog = ({ project, workspaceId }: { project: ProjectView; workspaceId: string }) => {
  const { t } = useI18n()
  const log = useLoad<{ items: ActivityItem[]; nextCursor: string | null }>('listActivity', { workspaceId, limit: 100 })
  if (log.state.status === 'loading') return <Skeleton className="h-40 w-full" />
  if (log.state.status === 'error')
    return (
      <InlineAlert title={t('activity.error.title')} action={<Button onClick={() => void log.retry()}>{t('common.retry')}</Button>}>
        {t('activity.error.lead')}
      </InlineAlert>
    )
  const items = log.state.data.items.filter((item) => item.targetKind === 'project' && item.targetId === project.id)
  if (items.length === 0) return <EmptyState icon={<Archive />} title={t('project.activity.empty')} description={t('project.activity.emptyLead')} />
  return <ActivityList items={items} />
}

/** Project events from the workspace log (owners and admins only; everybody else gets the reason and no request). */
const ProjectActivity = ({ project, workspaceId }: { project: ProjectView; workspaceId: string }) => {
  const { t } = useI18n()
  const { active } = useWorkspace()
  if (active.role !== 'owner' && active.role !== 'admin') return <Notice>{t('project.activity.reason')}</Notice>
  return <ProjectActivityLog project={project} workspaceId={workspaceId} />
}

export const ProjectPage = () => {
  const { t } = useI18n()
  const { id } = useParams({ strict: false }) as { id: string }
  const navigate = useNavigate()
  const { active } = useWorkspace()
  const uploads = useUploads()
  const list = useLoad<ProjectList>('listProjects', { workspaceId: active.id })
  const [tab, setTab] = useState('files')
  const [archiving, setArchiving] = useState(false)
  const [mode, setMode] = useState<Mode | null>(null)
  useUploadProject(id)
  useEffect(() => setMode(null), [id])

  if (list.state.status === 'loading')
    return (
      <div role="status" aria-busy="true" className="grid gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  if (list.state.status === 'error')
    return (
      <div className="py-8">
        <InlineAlert title={t('projects.error.title')} action={<Button onClick={() => void list.retry()}>{t('common.retry')}</Button>}>
          {t('projects.error.lead')}
        </InlineAlert>
      </div>
    )
  const found = list.state.data.items.find((p) => p.id === id)
  if (!found)
    return (
      <EmptyState
        icon={<FolderX />}
        title={t('project.notFound.title')}
        description={t('project.notFound.lead')}
        actions={
          <Button asChild>
            <Link to="/app/projects">{t('project.notFound.back')}</Link>
          </Button>
        }
      />
    )
  const project: ProjectView = mode === null ? found : { ...found, accessMode: mode }
  const guest = active.role === 'guest'

  return (
    <>
      <PageHeader
        breadcrumbLabel={t('project.crumb')}
        breadcrumb={[{ label: t('project.crumb'), href: '/app/projects' }, { label: project.name }]}
        linkAs={({ href, className, children }) => (
          <Link to={href} className={className}>
            {children}
          </Link>
        )}
        title={project.name}
        badge={<ModeBadge mode={project.accessMode} />}
        subtitle={[project.description, active.kind === 'personal' ? t('app.workspace.personal') : active.name].filter(Boolean).join(' · ')}
        actions={
          <>
            <div className="hidden app:block">
              <Button variant="primary" onClick={() => uploads.pick()} {...(uploads.allowed && project.can.upload ? {} : { disabledReason: t('files.uploadDenied') })}>
                <Upload aria-hidden className="size-4.5" />
                {t('project.upload')}
              </Button>
            </div>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label={t('projects.menu', { name: project.name })}>
                  <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Archive />} onSelect={() => setArchiving(true)} {...(project.can.update ? {} : { disabledReason: t('projects.archive.reason') })}>
                  {t('projects.archive')}
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />
      {guest ? (
        <div className="mb-4">
          <Notice>{t('project.guestNote')}</Notice>
        </div>
      ) : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={t('project.tabs')}>
          <TabsTrigger value="files" count={project.fileCount}>
            {t('project.tab.files')}
          </TabsTrigger>
          <TabsTrigger value="access">{t('project.tab.access')}</TabsTrigger>
          <TabsTrigger value="activity">{t('project.tab.activity')}</TabsTrigger>
        </TabsList>
        <div className="pt-4">
          <TabsContent value="files">
            <FilesPage project={{ id: project.id }} />
          </TabsContent>
          <TabsContent value="access">
            <AccessTab project={project} workspaceId={active.id} onModeChanged={setMode} />
          </TabsContent>
          <TabsContent value="activity">
            <ProjectActivity project={project} workspaceId={active.id} />
          </TabsContent>
        </div>
      </Tabs>
      {archiving ? (
        <ArchiveProjectDialog
          project={project}
          workspaceId={active.id}
          onClose={() => setArchiving(false)}
          onArchived={() => void navigate({ to: '/app/projects' })}
        />
      ) : null}
    </>
  )
}
