import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { CircleAlert, Clock, Download, FileBox, LockKeyhole } from 'lucide-react'
import { Turnstile, turnstileSiteKey } from '#/auth/Turnstile'
import { Button } from '#/components/ui/Button'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { Logo } from '#/components/ui/Logo'
import { Notice } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { type I18nKey, useI18n } from '#/i18n'
import { formatSize, type LinkFileView, resolveLink, type ShareFailure, sendPassword } from './api'

/** Public page of a share link (docs/09 §4.3): a file card for a live link, the password gate, or one plain explanation. */
type State =
  | { readonly status: 'loading' }
  | { readonly status: 'file'; readonly file: LinkFileView }
  | { readonly status: 'password' }
  | { readonly status: 'failed'; readonly failure: ShareFailure }

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-dvh bg-bg">
    <header className="flex h-16 items-center px-4">
      <Logo alt="VizCad" className="text-[26px]" />
    </header>
    <main className="mx-auto w-full max-w-120 px-4 pb-16 pt-4">
      <div className="grid min-w-0 gap-5 rounded-xl border border-line bg-bg p-5 [&>*]:min-w-0">{children}</div>
    </main>
  </div>
)

const Heading = ({ icon, title, lead }: { icon: ReactNode; title: string; lead?: string }) => (
  <div className="grid gap-3">
    <span aria-hidden className="grid size-13 place-items-center rounded-full bg-accent-soft text-accent [&_svg]:size-6">
      {icon}
    </span>
    <h1 className="text-2xl font-heading tracking-heading [overflow-wrap:anywhere]">{title}</h1>
    {lead ? <p className="text-text-2">{lead}</p> : null}
  </div>
)

const PasswordGate = ({ token, onOpened }: { token: string; onOpened: () => void }) => {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<I18nKey | null>(null)
  const [captcha, setCaptcha] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [widgetKey, setWidgetKey] = useState(0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || password === '') return
    setBusy(true)
    setMessage(null)
    const result = await sendPassword({ token, password, turnstileToken })
    setBusy(false)
    if (result.ok) {
      onOpened()
      return
    }
    // A Turnstile token is single use: ask for a fresh one for the next try.
    setTurnstileToken(null)
    setWidgetKey((key) => key + 1)
    if (result.error === 'LinkPasswordInvalid') {
      setCaptcha(result.captchaRequired === true)
      setMessage(result.captchaRequired === true ? 'share.password.captcha' : 'share.password.invalid')
    } else if (result.error === 'CaptchaFailed') {
      setCaptcha(true)
      setMessage(turnstileToken === null ? 'share.password.captcha' : 'share.password.captchaFailed')
    } else if (result.error === 'RateLimitExceeded') {
      setMessage('share.password.tooMany')
    } else if (result.error === 'LinkUnavailable' || result.error === 'LinkExpired') {
      onOpened() // the next resolve shows the right explanation
    } else {
      setMessage('share.error.lead')
    }
  }

  return (
    <Shell>
      <Heading icon={<LockKeyhole />} title={t('share.password.title')} lead={t('share.password.lead')} />
      <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <Field label={t('share.password.label')} error={message === null ? undefined : t(message)}>
          <Input type="password" autoComplete="off" value={password} maxLength={128} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        {captcha && turnstileSiteKey() !== null ? (
          <Turnstile key={widgetKey} action="share-password" onToken={setTurnstileToken} onError={() => setMessage('share.password.captchaFailed')} />
        ) : null}
        <Button type="submit" variant="primary" disabled={busy || password === ''}>
          {busy ? t('share.password.checking') : t('share.password.submit')}
        </Button>
      </form>
    </Shell>
  )
}

const FileCard = ({ token, file }: { token: string; file: LinkFileView }) => {
  const { t, locale } = useI18n()
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const company = file.sharer.workspaceLabel
  const sharedBy = company === null ? t('share.sharedBy', { name: file.sharer.displayName }) : t('share.sharedByCompany', { name: file.sharer.displayName, company })
  return (
    <Shell>
      <Heading icon={<FileBox />} title={file.name} lead={sharedBy} />
      <p className="text-sm text-text-3">{t('share.fileMeta', { type: file.extension.toUpperCase(), size: formatSize(file.size) })}</p>
      {file.thumbnailAvailable && !thumbnailFailed ? (
        <img
          src={`/s/${encodeURIComponent(token)}/thumbnail`}
          alt={t('share.thumbnailAlt', { name: file.name })}
          className="max-h-80 w-full rounded-md border border-line bg-surface object-contain"
          onError={() => setThumbnailFailed(true)}
        />
      ) : null}
      {file.can.download ? (
        <Button variant="primary" asChild>
          <a href={`/s/${encodeURIComponent(token)}/content`} download>
            <Download aria-hidden /> {t('share.download')}
          </a>
        </Button>
      ) : (
        <Notice>{t('share.viewOnly')}</Notice>
      )}
      {file.expiresAt === null ? null : (
        <p className="flex items-center gap-2 text-sm text-text-3">
          <Clock aria-hidden className="size-4" />
          {t('share.expires', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(file.expiresAt * 1000)) })}
        </p>
      )}
    </Shell>
  )
}

const Problem = ({ failure, onRetry }: { failure: ShareFailure; onRetry: () => void }) => {
  const { t } = useI18n()
  if (failure.error === 'LinkExpired') {
    return (
      <Shell>
        <Heading
          icon={<Clock />}
          title={t('share.expired.title')}
          lead={failure.sharer ? t('share.expired.lead', { name: failure.sharer }) : t('share.expired.leadNoName')}
        />
      </Shell>
    )
  }
  if (failure.error === 'LinkUnavailable') {
    return (
      <Shell>
        <Heading icon={<CircleAlert />} title={t('share.unavailable.title')} lead={t('share.unavailable.lead')} />
      </Shell>
    )
  }
  return (
    <Shell>
      <Heading icon={<CircleAlert />} title={failure.error === 'RateLimitExceeded' ? t('share.password.tooMany') : t('share.error.title')} lead={t('share.error.lead')} />
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </Shell>
  )
}

export const SharePage = ({ token }: { token: string }) => {
  const { t } = useI18n()
  const [state, setState] = useState<State>({ status: 'loading' })
  const load = useCallback(async () => {
    const result = await resolveLink(token)
    if (!result.ok) setState({ status: 'failed', failure: result })
    else setState(result.data.kind === 'file' ? { status: 'file', file: result.data.file } : { status: 'password' })
  }, [token])
  useEffect(() => {
    void load()
  }, [load])

  if (state.status === 'loading') {
    return (
      <Shell>
        <div role="status" aria-label={t('share.loading')} className="grid gap-3">
          <Skeleton className="size-13 rounded-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </Shell>
    )
  }
  if (state.status === 'password') return <PasswordGate token={token} onOpened={() => void load()} />
  if (state.status === 'file') return <FileCard token={token} file={state.file} />
  return <Problem failure={state.failure} onRetry={() => { setState({ status: 'loading' }); void load() }} />
}
