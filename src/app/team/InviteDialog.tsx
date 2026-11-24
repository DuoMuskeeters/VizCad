import { useState, type FormEvent } from 'react'
import { Button } from '#/components/ui/Button'
import { ChipsInput } from '#/components/ui/ChipsInput'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { Field } from '#/components/ui/Field'
import { RadioCard, RadioCardGroup } from '#/components/ui/RadioCard'
import { useToast } from '#/components/ui/Toast'
import { useI18n } from '#/i18n'
import type { Call, Role } from '../api'
import { failureKey } from '../errors'
import { assignableRoles, roleHintKey, roleKey, type InternalRole } from '../roles'

const MAX_PER_BATCH = 10

type Outcome = { email: string; message: string }

/** Invite by e-mail with a role. One request per address; the ones that fail stay in the field with the reason. */
export const InviteDialog = ({
  open,
  onOpenChange,
  call,
  workspaceId,
  actorRole,
  initialEmails = [],
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  call: Call
  workspaceId: string
  actorRole: Role
  initialEmails?: readonly string[]
  onDone: () => void
}) => {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const roles = assignableRoles(actorRole)
  const [emails, setEmails] = useState<string[]>([...initialEmails])
  const [role, setRole] = useState<InternalRole>('member')
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failures, setFailures] = useState<Outcome[]>([])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (emails.length === 0) return setFieldError(t('app.team.invite.emailsRequired'))
    if (emails.length > MAX_PER_BATCH) return setFieldError(t('app.team.invite.tooMany', { max: MAX_PER_BATCH }))
    setBusy(true)
    setFieldError(null)
    const failed: Outcome[] = []
    const left: string[] = []
    let sent = 0
    let stop = false
    for (const email of emails) {
      if (stop) {
        left.push(email)
        continue
      }
      const result = await call('inviteMember', { workspaceId, email, role, locale })
      if (result.ok) sent += 1
      else {
        failed.push({ email, message: t(failureKey(result)) })
        left.push(email)
        // Limits and rate limits apply to every address: stop instead of repeating the same refusal.
        stop = ['SeatLimitReached', 'RateLimitExceeded', 'PermissionDenied', 'Unauthenticated'].includes(result.error)
      }
    }
    setBusy(false)
    if (sent > 0) {
      toast({ title: t('app.team.invite.sent', { count: sent }), tone: 'success' })
      onDone()
    }
    if (left.length === 0) {
      setEmails([])
      return onOpenChange(false)
    }
    setEmails(left)
    setFailures(failed)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFailures([])
        onOpenChange(next)
      }}
    >
      <DialogContent
        title={t('app.team.invite.title')}
        description={t('app.team.invite.lead')}
        closeLabel={t('common.close')}
        footer={
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" type="submit" form="invite-members" loading={busy}>
              {t('app.team.invite.send')}
            </Button>
          </DialogFooter>
        }
      >
        <form id="invite-members" onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
          <Field label={t('app.team.invite.emails')} error={fieldError} hint={t('app.team.invite.emailsHint')}>
            <ChipsInput value={emails} onValueChange={setEmails} placeholder={t('app.team.invite.emailPlaceholder')} removeLabel={(item) => t('app.team.invite.remove', { email: item })} />
          </Field>
          <div className="grid gap-1.5">
            <span id="invite-role-label" className="text-md font-medium app:text-base">
              {t('app.team.invite.role')}
            </span>
            <RadioCardGroup aria-labelledby="invite-role-label" value={role} onValueChange={(v) => setRole(v as InternalRole)}>
              {roles.map((r) => (
                <RadioCard key={r} value={r} title={t(roleKey(r))} description={t(roleHintKey(r))} />
              ))}
            </RadioCardGroup>
          </div>
          {failures.length > 0 ? (
            <ul role="alert" className="grid gap-1 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-3 text-sm">
              {failures.map((f) => (
                <li key={f.email}>
                  <b className="font-medium">{f.email}</b>: {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  )
}
