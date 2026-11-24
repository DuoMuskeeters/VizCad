import { useState, type FormEvent } from 'react'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { useToast } from '#/components/ui/Toast'
import { useI18n } from '#/i18n'
import type { WorkspaceSummary } from './api'
import { failureKey } from './errors'
import { useSession } from './session'
import { validateCompanyName } from './validation'
import { useWorkspaceState } from './workspace'

/** "Create company workspace" from the switcher and the personal-workspace suggestion. */
export const CreateWorkspaceDialog = ({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (workspace: WorkspaceSummary) => void }) => {
  const { t } = useI18n()
  const { call } = useSession()
  const { adopt } = useWorkspaceState()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const invalid = validateCompanyName(name)
    if (invalid) return setError(t(invalid))
    setBusy(true)
    setError(null)
    const result = await call<WorkspaceSummary>('createWorkspace', { name: name.trim() })
    if (!result.ok) {
      setBusy(false)
      return setError(t(failureKey(result)))
    }
    await adopt(result.data)
    setBusy(false)
    setName('')
    onOpenChange(false)
    toast({ title: t('app.workspace.created', { name: result.data.name }), tone: 'success' })
    onCreated?.(result.data)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('app.workspace.createTitle')}
        description={t('app.workspace.createLead')}
        closeLabel={t('common.close')}
        footer={
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" type="submit" form="create-workspace" loading={busy}>
              {t('app.workspace.createBtn')}
            </Button>
          </DialogFooter>
        }
      >
        <form id="create-workspace" onSubmit={(e) => void submit(e)} noValidate>
          <Field label={t('app.workspace.nameLabel')} hint={t('app.workspace.nameHint')} error={error}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" maxLength={80} placeholder={t('app.workspace.namePlaceholder')} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
