import type { ReactNode } from 'react'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { Notice } from '#/components/ui/Notice'
import { useI18n } from '#/i18n'

/** Confirmation for changes the person cannot undo themselves (remove a member, lower a role). */
export const ConfirmDialog = ({
  open,
  title,
  description,
  warning,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: ReactNode
  warning: string
  confirmLabel: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) => {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent
        title={title}
        closeLabel={t('common.close')}
        {...(description ? { description } : {})}
        footer={
          <DialogFooter>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        }
      >
        <Notice tone="warn">{warning}</Notice>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
