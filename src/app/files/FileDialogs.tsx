import { useState } from 'react'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { InlineAlert } from '#/components/ui/Notice'
import { isValidFileName } from '#/shared/fileTypes'
import { useI18n } from '#/i18n'
import { failureKey } from '../errors'
import { useSession } from '../session'
import type { AnyFileView, MoveEffects } from './types'

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

/** Moves files out of their projects (the Projects screen with project targets arrives in 4e-2). Asks `previewMoveFile` first and stops on a changed answer. */
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (files.length === 0) return null
  const submit = async () => {
    setBusy(true)
    setError(null)
    const moved = new Set<string>()
    for (const file of files) {
      const preview = await call<{ effects: MoveEffects }>('previewMoveFile', { workspaceId, fileId: file.id, targetProjectId: null })
      const result = preview.ok ? await call('moveFile', { workspaceId, fileId: file.id, targetProjectId: null, expected: preview.data.effects }) : preview
      if (!result.ok) {
        setBusy(false)
        if (moved.size > 0) onMoved(moved)
        return setError(t(failureKey(result)))
      }
      moved.add(file.id)
    }
    setBusy(false)
    onMoved(moved)
  }
  const first = files[0]
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('files.move.title')}
        description={t('files.move.lead', { name: files.length === 1 && first ? first.name : String(files.length) })}
        footer={
          <DialogFooter>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              {t('files.move.confirm')}
            </Button>
          </DialogFooter>
        }
      >
        {error ? <InlineAlert title={t('app.error.loadTitle')}>{error}</InlineAlert> : null}
      </DialogContent>
    </Dialog>
  )
}
