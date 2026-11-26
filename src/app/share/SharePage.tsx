import { type FormEvent, lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createClientOnlyFn } from '@tanstack/react-start'
import { CircleAlert, Clock, Download, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Turnstile, turnstileSiteKey } from '#/auth/Turnstile'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { FileTile } from '#/components/ui/DataList'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { Logo } from '#/components/ui/Logo'
import { Notice } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { fileTypeOfExtension } from '#/shared/fileTypes'
import { type I18nKey, useI18n } from '#/i18n'
import { deferOpen, isPhone, readDeviceHints } from '#/viewer/device'
import type { ViewerStart } from '#/viewer/state'
import { ERROR_CODES, formatOfExtension, isConvertFormat } from '#/viewer/worker/protocol'
import { tileText } from '../files/format'

/** The viewer chunk (three.js) loads only on the client, only when the link has something to show in 3D. */
const loadViewer = createClientOnlyFn(() => import('#/viewer/Viewer.client'))
const Viewer = lazy(loadViewer)

const ViewerFallback = ({ src }: { src: string | null }) => (
  <div className="grid min-w-0 gap-2">
    <div className="relative h-[min(62dvh,600px)] min-h-72 overflow-hidden rounded-lg bg-canvas">
      {src ? <img src={src} alt="" className="absolute inset-0 size-full object-contain" /> : null}
    </div>
    <div className="h-11 app:h-9.5" />
  </div>
)
import { formatSize, type LinkFileView, resolveLink, type ShareFailure, sendPassword } from './api'

/** Public page of a share link (docs/09 §4.3): a file card for a live link, the password gate, or one plain explanation. */
type State =
  | { readonly status: 'loading' }
  | { readonly status: 'file'; readonly file: LinkFileView }
  | { readonly status: 'password' }
  | { readonly status: 'failed'; readonly failure: ShareFailure }

const Frame = ({ company, children }: { company?: string | null; children: ReactNode }) => {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          {company ? (
            <p className="flex min-w-0 items-center gap-2.5">
              <Avatar name={company} size="sm" decorative />
              <span className="truncate text-md font-medium">{company}</span>
            </p>
          ) : (
            <span className="sr-only">{t('sp.header')}</span>
          )}
          <Logo alt="VizCad" className="ml-auto shrink-0 text-[24px]" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-5 app:pt-8">{children}</main>
      <footer className="border-t border-line">
        <p className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-text-3">
          {t('sp.footer')}
          <a href="/" className="inline-flex min-h-11 items-center rounded-sm font-medium text-accent hover:underline">
            {t('sp.footerLink')}
          </a>
        </p>
      </footer>
    </div>
  )
}

/** A narrow, single-purpose card for the gate and the refusals. */
const Shell = ({ children }: { children: ReactNode }) => (
  <Frame>
    <div className="mx-auto grid w-full max-w-110 min-w-0 gap-5 [&>*]:min-w-0">{children}</div>
  </Frame>
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

const PasswordGate = ({ token, fetcher, onOpened }: { token: string; fetcher?: typeof fetch; onOpened: () => void }) => {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<I18nKey | null>(null)
  const [captcha, setCaptcha] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [widgetKey, setWidgetKey] = useState(0)
  const [shown, setShown] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || password === '') return
    setBusy(true)
    setMessage(null)
    const result = await sendPassword({ token, password, turnstileToken }, fetcher)
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
          <div className="flex gap-2">
            <Input type={shown ? 'text' : 'password'} autoComplete="off" value={password} maxLength={128} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1" />
            <Button type="button" variant="secondary" aria-pressed={shown} onClick={() => setShown((value) => !value)} className="shrink-0">
              {shown ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
              {shown ? t('common.hidePassword') : t('common.showPassword')}
            </Button>
          </div>
        </Field>
        {captcha && turnstileSiteKey() !== null ? (
          <Turnstile key={widgetKey} action="share-password" onToken={setTurnstileToken} onError={() => setMessage('share.password.captchaFailed')} />
        ) : null}
        <Button type="submit" variant="primary" disabled={busy || password === ''} className="h-12 app:h-11">
          {busy ? t('share.password.checking') : t('share.password.submit')}
        </Button>
        <p className="text-sm text-text-3">{t('sp.password.help')}</p>
      </form>
    </Shell>
  )
}

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="text-base text-text-3">{label}</dt>
    <dd className="min-w-0 text-base [overflow-wrap:anywhere]">{children}</dd>
  </>
)

const FileCard = ({ token, file }: { token: string; file: LinkFileView }) => {
  const { t, locale } = useI18n()
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const company = file.sharer.workspaceLabel
  const label = fileTypeOfExtension(file.extension)?.label ?? file.extension.toUpperCase()
  const size = formatSize(file.size)
  const day = (seconds: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(seconds * 1000))
  const showThumbnail = file.thumbnailAvailable && !thumbnailFailed
  const format = formatOfExtension(file.extension)
  const thumbnail = file.thumbnailAvailable ? `/s/${encodeURIComponent(token)}/thumbnail` : null
  const phone = useMemo(() => isPhone(readDeviceHints()), [])
  // Mobile first (D14): on a phone 3D never opens by itself (docs/11 §6); a STEP/IGES source keeps the 5a phone rule.
  const failedCode = ERROR_CODES.find((code) => code === file.model.derivative?.code) ?? 'corrupt'
  const start: ViewerStart = file.model.derivative?.state === 'failed' && file.model.kind === 'source' ? { failed: failedCode }
    : !phone ? 'auto'
    : file.model.kind === 'source' && format !== null && deferOpen(format, phone) ? 'phone'
    : 'tap'
  const hasDerivativeFormat = format !== null && isConvertFormat(format)
  const noModelText = file.model.derivative?.state === 'too_large'
    ? t('viewer.error.tooLarge', { size: `${Math.round(file.model.maxConvertBytes / (1024 * 1024))} MB` })
    : file.model.derivative?.state === 'failed' ? t('viewer.error.corrupt') : t('viewer.notPrepared')
  return (
    <Frame company={company}>
      <div className="grid gap-5 app:grid-cols-[minmax(0,1fr)_340px] app:gap-x-8 [&>*]:min-w-0">
        <div className="grid gap-4 app:col-start-2 app:row-start-1">
          <p className="flex items-center gap-3">
            <Avatar name={file.sharer.displayName} size="md" decorative />
            <span className="text-md text-text-2">{t('sp.sender', { name: file.sharer.displayName })}</span>
          </p>
          <div className="grid gap-1.5">
            <h1 className="text-2xl font-heading tracking-heading [overflow-wrap:anywhere]">{file.name}</h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-text-3">
              <Badge>{file.extension.toUpperCase()}</Badge>
              <span>{size}</span>
              <span aria-hidden>·</span>
              <span>{t('sp.version')} {file.currentVersion.number}</span>
            </p>
          </div>
        </div>

        {format !== null && file.model.kind !== 'none' ? (
          <section aria-label={t('sp.stage')} className="min-w-0 app:col-start-1 app:row-span-3 app:row-start-1">
            <Suspense fallback={<ViewerFallback src={thumbnail} />}>
              <Viewer
                name={file.name}
                extension={file.extension}
                size={file.size}
                url={`/s/${encodeURIComponent(token)}/model`}
                thumbnailUrl={thumbnail}
                start={start}
                source={file.model.kind}
                modelBytes={file.model.bytes}
                maxConvertBytes={file.model.maxConvertBytes}
                downloadAction={file.can.download ? (
                  <Button asChild>
                    <a href={`/s/${encodeURIComponent(token)}/content`} download>
                      <Download aria-hidden /> {t('sp.downloadSize', { size })}
                    </a>
                  </Button>
                ) : undefined}
              />
            </Suspense>
          </section>
        ) : (
        <section aria-label={t('sp.stage')} className="grid place-items-center overflow-hidden rounded-lg border border-line bg-surface app:col-start-1 app:row-span-3 app:row-start-1 app:min-h-96">
          {showThumbnail ? (
            <img
              src={`/s/${encodeURIComponent(token)}/thumbnail`}
              alt={t('share.thumbnailAlt', { name: file.name })}
              className="max-h-[60dvh] w-full object-contain"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <div className="grid justify-items-center gap-3 px-4 py-12 text-center">
              <FileTile ext={tileText(file.extension)} className="size-20 text-sm" />
              <p className="text-md font-medium [overflow-wrap:anywhere]">{file.name}</p>
              <p className="text-sm text-text-3">{t('sp.previewNone')}</p>
            </div>
          )}
          {format !== null && hasDerivativeFormat ? <p className="px-4 pb-4 text-center text-sm text-text-3">{noModelText}</p> : null}
        </section>
        )}

        <div className="grid gap-3 app:col-start-2 app:row-start-2">
          {file.can.download ? (
            <Button variant="primary" asChild className="h-12 text-lg app:h-11 app:text-base">
              <a href={`/s/${encodeURIComponent(token)}/content`} download>
                <Download aria-hidden /> {t('sp.downloadSize', { size })}
              </a>
            </Button>
          ) : (
            <Notice>
              <strong className="block font-medium">{t('sp.viewOnly')}</strong>
              {file.sharer.displayName ? t('sp.viewOnlyLead', { name: file.sharer.displayName }) : t('sp.viewOnlyLeadNoName')}
            </Notice>
          )}
        </div>

        <section aria-labelledby="sp-details" className="grid gap-3 app:col-start-2 app:row-start-3">
          <h2 id="sp-details" className="text-lg font-heading tracking-heading">
            {t('sp.details')}
          </h2>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2">
            <Detail label={t('sp.format')}>{label}</Detail>
            <Detail label={t('sp.size')}>{size}</Detail>
            <Detail label={t('sp.version')}>{file.currentVersion.number}</Detail>
            <Detail label={t('sp.updated')}>{day(file.updatedAt)}</Detail>
            <Detail label={t('sp.linkUntil')}>{file.expiresAt === null ? t('sp.linkNoEnd') : t('sp.linkOpenUntil', { date: day(file.expiresAt) })}</Detail>
          </dl>
          <p className="text-sm text-text-3">{company ? t('sp.note', { company }) : t('sp.noteGeneric')}</p>
        </section>
      </div>
    </Frame>
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

/** Development only: `?fixture=share-<state>` answers from memory (src/app/share/fixtureShare.ts). Stripped from production builds. */
const useFetcher = (given: typeof fetch | undefined): typeof fetch | null => {
  const [fetcher, setFetcher] = useState<typeof fetch | null>(() => given ?? null)
  useEffect(() => {
    if (given) return
    const fixture = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('fixture') : null
    if (import.meta.env.DEV && fixture) {
      let cancelled = false
      void import('./fixtureShare').then((m) => {
        if (!cancelled) setFetcher(() => m.shareFixtureFetch(fixture))
      })
      return () => {
        cancelled = true
      }
    }
    setFetcher(() => (...args: Parameters<typeof fetch>) => fetch(...args))
  }, [given])
  return fetcher
}

export const SharePage = ({ token, fetcher: given }: { token: string; fetcher?: typeof fetch }) => {
  const { t } = useI18n()
  const fetcher = useFetcher(given)
  const [state, setState] = useState<State>({ status: 'loading' })
  const load = useCallback(async () => {
    if (fetcher === null) return
    const result = await resolveLink(token, fetcher)
    if (!result.ok) setState({ status: 'failed', failure: result })
    else setState(result.data.kind === 'file' ? { status: 'file', file: result.data.file } : { status: 'password' })
  }, [token, fetcher])
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
  if (state.status === 'password') return <PasswordGate token={token} {...(fetcher ? { fetcher } : {})} onOpened={() => void load()} />
  if (state.status === 'file') return <FileCard token={token} file={state.file} />
  return <Problem failure={state.failure} onRetry={() => { setState({ status: 'loading' }); void load() }} />
}
