import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent } from '#/components/ui/Dialog'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { SegmentedControl } from '#/components/ui/SegmentedControl'
import { Skeleton } from '#/components/ui/Skeleton'
import { SwitchRow } from '#/components/ui/Switch'
import { useToast } from '#/components/ui/Toast'
import { useI18n } from '#/i18n'
import { fileTypeOfExtension, hasDerivative } from '#/shared/fileTypes'
import { AccessPanel } from '../access/AccessPanel'
import { failureKey } from '../errors'
import { useSession } from '../session'
import { formatDay, fromDateInput, toDateInput } from './format'
import type { LinkLevel, ShareLinkSummary } from './types'

/** The share window needs only which file it is for. */
export type ShareTarget = { readonly id: string; readonly name: string; readonly extension: string }

const DAY = 86_400
const nowSeconds = () => Math.floor(Date.now() / 1000)
const DEFAULT_LINK_DAYS = 30

/** ---- Link -------------------------------------------------------------------------------------------------- */

type LinkState = { readonly status: 'loading' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly link: ShareLinkSummary | null }

const LinkSection = ({ file, workspaceId }: { file: ShareTarget; workspaceId: string }) => {
  const { t, locale } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const [state, setState] = useState<LinkState>({ status: 'loading' })
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordOn, setPasswordOn] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [ends, setEnds] = useState(() => toDateInput(nowSeconds() + DEFAULT_LINK_DAYS * DAY))
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((link: ShareLinkSummary | null) => {
    setState({ status: 'ready', link })
    setPasswordOn(link?.hasPassword ?? false)
    if (link?.expiresAt) setEnds(toDateInput(link.expiresAt))
  }, [])

  useEffect(() => {
    let cancelled = false
    void call<{ links: ShareLinkSummary[] }>('getShareSettings', { workspaceId, fileId: file.id }).then((result) => {
      if (cancelled) return
      if (result.ok) apply(result.data.links[0] ?? null)
      else setState({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [call, workspaceId, file.id, apply])

  if (state.status === 'loading')
    return (
      <div role="status" aria-busy="true" aria-label={t('share.link.loading')} className="grid gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  if (state.status === 'error') return <InlineAlert title={t('share.link.loadError')}>{t('files.error.lead')}</InlineAlert>

  const link = state.link
  const fail = (failure: Parameters<typeof failureKey>[0]) => setError(t(failureKey(failure)))

  const turnOn = async () => {
    setBusy(true)
    setError(null)
    const result = await call<{ link: ShareLinkSummary; url: string }>('createShareLink', { workspaceId, fileId: file.id, level: 'view', expiresAt: nowSeconds() + DEFAULT_LINK_DAYS * DAY })
    setBusy(false)
    if (!result.ok) return fail(result)
    setUrl(result.data.url)
    apply(result.data.link)
  }

  const turnOff = async () => {
    setBusy(true)
    setError(null)
    const result = await call('revokeShareLink', { workspaceId, fileId: file.id })
    setBusy(false)
    if (!result.ok) return fail(result)
    setUrl(null)
    setPassword('')
    apply(null)
  }

  const update = async (change: { level?: LinkLevel; expiresAt?: number | null; password?: string | null }) => {
    setBusy(true)
    setError(null)
    const result = await call<{ links: ShareLinkSummary[] }>('updateShareLink', { workspaceId, fileId: file.id, ...change })
    setBusy(false)
    if (!result.ok) return fail(result)
    apply(result.data.links[0] ?? null)
    return true
  }

  const copy = async () => {
    setError(null)
    const result = await call<{ url: string }>('copyShareLink', { workspaceId, fileId: file.id })
    if (!result.ok) return fail(result)
    setUrl(result.data.url)
    try {
      await navigator.clipboard.writeText(result.data.url)
      toast({ title: t('share.link.copied'), tone: 'success' })
    } catch {
      setError(t('share.link.copyFailed'))
    }
  }

  const savePassword = async () => {
    if (password.length < 8) return setPasswordError(t('share.link.passwordTooShort'))
    if (password.length > 128) return setPasswordError(t('share.link.passwordTooLong'))
    setPasswordError(null)
    if (await update({ password })) setPassword('')
  }

  const locked = link?.legacy === true
  const levelHint = link?.level === 'download' ? t('share.link.levelDownloadHint') : viewLevelText(t, file.extension)
  return (
    <section aria-labelledby="share-link" className="grid gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Link2 className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="share-link" className="text-lg font-heading tracking-heading">
            {t('share.link.title')}
          </h3>
          <p className="text-sm text-text-3">{t('share.link.lead')}</p>
        </div>
      </div>
      <SwitchRow
        label={t('share.link.switch')}
        description={link ? t(link.expiresAt === null ? 'share.link.summaryOpen' : 'share.link.summary', { level: t(link.level === 'download' ? 'share.link.levelDownload' : 'share.link.levelView'), date: link.expiresAt === null ? '' : formatDay(link.expiresAt, locale) }) : t('share.link.off')}
        checked={link !== null}
        disabled={busy}
        onCheckedChange={(on) => void (on ? turnOn() : turnOff())}
      />
      {link ? (
        <div className="grid gap-4">
          {link.expired ? <Notice tone="warn">{t('share.link.expired')}</Notice> : null}
          {locked ? <Notice tone="warn">{t('share.link.legacy')}</Notice> : null}
          <Field label={t('share.link.level')} hint={levelHint}>
            <SegmentedControl
              fullWidth
              aria-label={t('share.link.level')}
              value={link.level}
              disabled={locked || busy}
              onValueChange={(value) => void update({ level: value === 'download' ? 'download' : 'view' })}
              options={[
                { value: 'view', label: t('share.link.levelView') },
                { value: 'download', label: t('share.link.levelDownload') },
              ]}
            />
          </Field>
          <div className="grid gap-2">
            <Field label={t('share.link.expiry')}>
              <div className="flex flex-wrap gap-2">
                <Input type="date" value={ends} min={toDateInput(nowSeconds() + DAY)} disabled={locked || busy} onChange={(event) => setEnds(event.target.value)} className="w-auto flex-1" />
                <Button
                  disabled={locked || busy}
                  onClick={() => {
                    const expiresAt = fromDateInput(ends)
                    if (expiresAt === null || expiresAt <= nowSeconds()) return setError(t('share.people.pastDate'))
                    void update({ expiresAt })
                  }}
                >
                  {t('share.link.save')}
                </Button>
                {link.expiresAt !== null ? (
                  <Button disabled={locked || busy} onClick={() => void update({ expiresAt: null })}>
                    {t('share.link.noExpiry')}
                  </Button>
                ) : null}
              </div>
            </Field>
          </div>
          <div className="grid gap-2">
            <SwitchRow
              label={t('share.link.password')}
              description={link.hasPassword ? t('share.link.passwordSet') : undefined}
              checked={passwordOn}
              disabled={locked || busy}
              onCheckedChange={(on) => {
                setPasswordOn(on)
                if (!on && link.hasPassword) void update({ password: null })
              }}
            />
            {passwordOn ? (
              <Field label={t('share.link.passwordLabel')} hint={t('share.link.passwordHint')} {...(passwordError ? { error: passwordError } : {})}>
                <div className="flex flex-wrap gap-2">
                  <Input type="password" autoComplete="new-password" value={password} disabled={locked || busy} onChange={(event) => setPassword(event.target.value)} className="w-auto flex-1" />
                  <Button disabled={locked || busy} onClick={() => void savePassword()}>
                    {t('share.link.passwordSave')}
                  </Button>
                </div>
              </Field>
            ) : null}
          </div>
          <div className="grid gap-2">
            {url ? <Input readOnly aria-label={t('share.link.url')} value={url} onFocus={(event) => event.currentTarget.select()} /> : null}
            <Button
              variant="primary"
              onClick={() => void copy()}
              className="justify-self-start"
              {...(link.expired ? { disabledReason: t('share.link.copyExpired') } : {})}
            >
              {url ? <Check aria-hidden className="size-4.5" /> : <Copy aria-hidden className="size-4.5" />}
              {t('share.link.copy')}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/**
 * What the view level opens (D23, docs/11 §5), said honestly: STEP/IGES/3MF show their GLB derivative and keep the
 * source closed, but the shape on screen can be copied; for STL/OBJ/PLY the preview is the file itself.
 */
const viewLevelText = (t: ReturnType<typeof useI18n>['t'], extension: string) => {
  const type = fileTypeOfExtension(extension)
  return type !== undefined && hasDerivative(type.id) ? t('share.view3d.derivative', { format: type.label }) : t('share.view3d.mesh')
}

/** The share window (docs/03 §2.3): people (members or e-mailed guests, with an end date for guests) and the file's one link. */
export const ShareDialog = ({ file, workspaceId, onClose }: { file: ShareTarget; workspaceId: string; onClose: () => void }) => {
  const { t } = useI18n()
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t('share.title')} description={file.name} className="app:max-w-140">
        <AccessPanel workspaceId={workspaceId} target={{ kind: 'file', fileId: file.id }} />
        <p className="text-sm text-text-3">{t('share.view3d.people', { text: viewLevelText(t, file.extension) })}</p>
        <hr className="border-line" />
        <LinkSection file={file} workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  )
}
