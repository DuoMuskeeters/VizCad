import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { Checkbox } from '#/components/ui/Checkbox'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { EmptyState } from '#/components/ui/EmptyState'
import { Field } from '#/components/ui/Field'
import { Textarea } from '#/components/ui/Input'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import type { PurgeSummary } from '#/shared/cmsTypes'
import { useAdminInfo } from './AdminLayout'
import { cmsCall, type CmsFailure } from './api'
import { failureText } from './failures'
import { useAdminText } from './text'

interface PurgeRow {
  readonly id: number
  readonly kind: 'url' | 'host'
  readonly target: string
  readonly reason: string
  readonly attempts: number
  readonly lastError: string | null
  readonly notBefore: number
  readonly failed: boolean
}

interface Queue {
  readonly configured: boolean
  readonly total: number
  readonly failed: number
  readonly rows: ReadonlyArray<PurgeRow>
}

type Load = { readonly status: 'loading' } | { readonly status: 'error'; readonly failure: CmsFailure } | { readonly status: 'ready'; readonly queue: Queue }

const time = (seconds: number, locale: string) => new Date(seconds * 1000).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })

/**
 * `/admin/cms/cache` (docs/12 §9 "Önbellek", §7.4): the purge queue with its failures, a drain, retry or clear for rows
 * out of retries, a manual URL purge (site pages only) and a host purge. Every action goes through `/api/cms`.
 */
export const CachePage = () => {
  const { text, locale } = useAdminText()
  const { toast } = useToast()
  const { purgeConfigured } = useAdminInfo()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [busy, setBusy] = useState<'drain' | 'retry' | 'clear' | 'urls' | 'host' | null>(null)
  const [urls, setUrls] = useState('')
  const [urlError, setUrlError] = useState<string | undefined>(undefined)
  const [confirmHost, setConfirmHost] = useState(false)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    void cmsCall<Queue>('listPurges', { limit: 200 }).then((result) => {
      if (cancelled) return
      setLoad(result.ok ? { status: 'ready', queue: result.data } : { status: 'error', failure: result })
      setSelected(new Set())
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const offReason = purgeConfigured ? {} : { disabledReason: text.gate.purgeOff }

  const run = async <T,>(kind: NonNullable<typeof busy>, operation: string, body: Record<string, unknown>, done: (data: T) => string) => {
    setBusy(kind)
    const result = await cmsCall<T>(operation, body)
    setBusy(null)
    if (!result.ok) {
      if (kind === 'urls' && result.error === 'ValidationError') return setUrlError(text.cache.invalidUrls)
      return toast({ title: failureText(text, result), tone: 'danger' })
    }
    toast({ title: done(result.data), tone: 'success' })
    reload()
  }

  if (load.status === 'loading')
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (load.status === 'error') return <InlineAlert title={failureText(text, load.failure)} action={<Button onClick={reload}>{text.gate.retry}</Button>} />

  const { queue } = load
  const failedIds = queue.rows.filter((r) => r.failed).map((r) => r.id)
  const chosen = [...selected]
  const toggle = (id: number, on: boolean) => setSelected((s) => (on ? new Set([...s, id]) : new Set([...s].filter((x) => x !== id))))

  return (
    <>
      <PageHeader
        title={text.cache.title}
        subtitle={text.cache.total(queue.total, queue.failed)}
        actions={
          <>
            <Button onClick={reload}>
              <RefreshCw aria-hidden className="size-4" />
              {text.cache.refresh}
            </Button>
            <Button
              variant="primary"
              loading={busy === 'drain'}
              onClick={() => void run<{ purge: PurgeSummary }>('drain', 'drainPurges', {}, (d) => text.cache.drained(d.purge.done, d.purge.queued))}
              {...offReason}
            >
              {text.cache.drain}
            </Button>
          </>
        }
      />

      <section aria-labelledby="queue-title" className="grid gap-3">
        <h2 id="queue-title" className="text-lg font-heading text-text">
          {text.cache.queue}
        </h2>
        {queue.rows.length === 0 ? (
          <EmptyState icon={<RefreshCw />} title={text.cache.emptyQueue} />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setSelected(new Set(failedIds))} {...(failedIds.length === 0 ? { disabledReason: text.cache.onlyFailed } : {})}>
                {text.cache.selectFailed}
              </Button>
              <Button
                loading={busy === 'retry'}
                onClick={() => void run<{ retried: number }>('retry', 'retryPurges', { ids: chosen }, (d) => text.cache.retried(d.retried))}
                {...(chosen.length === 0 ? { disabledReason: text.cache.onlyFailed } : offReason)}
              >
                {text.cache.retry}
              </Button>
              <Button
                variant="danger-quiet"
                loading={busy === 'clear'}
                onClick={() => void run<{ cleared: number }>('clear', 'clearPurges', { ids: chosen }, (d) => text.cache.cleared(d.cleared))}
                {...(chosen.length === 0 ? { disabledReason: text.cache.onlyFailed } : {})}
              >
                {text.cache.clear}
              </Button>
            </div>
            <ul className="grid gap-2">
              {queue.rows.map((row) => (
                <li key={row.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-2 rounded-md border border-line p-2.5">
                  {row.failed ? (
                    <label className="grid size-11 place-items-center">
                      <Checkbox checked={selected.has(row.id)} onCheckedChange={(on) => toggle(row.id, on === true)} aria-label={`${text.cache.select}: ${row.target}`} />
                    </label>
                  ) : (
                    <span aria-hidden className="size-11" />
                  )}
                  <div className="grid min-w-0 gap-1 py-1">
                    <span className="font-mono text-sm text-text [overflow-wrap:anywhere]">{row.kind === 'host' ? `host: ${row.target}` : row.target}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-2">
                      <Badge tone={row.failed ? 'warn' : 'neutral'}>{row.failed ? text.cache.failedBadge : text.cache.waiting}</Badge>
                      <span>{`${text.cache.colAttempts}: ${row.attempts}`}</span>
                      <span>{`${text.cache.colDue}: ${time(row.notBefore, locale)}`}</span>
                      {row.lastError === null ? null : <span className="[overflow-wrap:anywhere]">{`${text.cache.colError}: ${row.lastError}`}</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="manual-title" className="mt-8 grid max-w-180 gap-3">
        <h2 id="manual-title" className="text-lg font-heading text-text">
          {text.cache.manual}
        </h2>
        <Field label={text.cache.manual} hint={text.cache.manualHint} error={urlError}>
          <Textarea
            value={urls}
            rows={4}
            autoCapitalize="none"
            spellCheck={false}
            placeholder={`${typeof window === 'undefined' ? '' : window.location.origin}/blog`}
            onChange={(e) => {
              setUrls(e.target.value)
              setUrlError(undefined)
            }}
          />
        </Field>
        <div>
          <Button
            loading={busy === 'urls'}
            onClick={() => {
              const list = urls.split('\n').map((u) => u.trim()).filter((u) => u !== '')
              if (list.length === 0 || list.length > 100) return setUrlError(text.cache.manualHint)
              void run<{ urls: number }>('urls', 'purgeUrls', { urls: list }, (d) => text.cache.manualDone(d.urls)).then(() => setUrls(''))
            }}
            {...offReason}
          >
            {text.cache.manualAction}
          </Button>
        </div>
      </section>

      <section aria-labelledby="host-title" className="mt-8 grid max-w-180 gap-3">
        <h2 id="host-title" className="text-lg font-heading text-text">
          {text.cache.host}
        </h2>
        <p className="text-md text-text-2">{text.cache.hostHint}</p>
        <div>
          <Button variant="danger-quiet" onClick={() => setConfirmHost(true)} {...offReason}>
            {text.cache.hostAction}
          </Button>
        </div>
      </section>

      <Dialog open={confirmHost} onOpenChange={(o) => (o ? null : setConfirmHost(false))}>
        <DialogContent
          title={text.cache.host}
          closeLabel={text.picker.close}
          footer={
            <DialogFooter>
              <Button onClick={() => setConfirmHost(false)}>{text.list.cancel}</Button>
              <Button
                variant="danger"
                loading={busy === 'host'}
                onClick={() =>
                  void run<unknown>('host', 'purgeHost', {}, () => text.cache.hostDone).then(() => setConfirmHost(false))
                }
              >
                {text.cache.hostAction}
              </Button>
            </DialogFooter>
          }
        >
          <p>{text.cache.hostConfirm}</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
