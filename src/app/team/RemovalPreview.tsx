import { useEffect, useState } from 'react'
import { Skeleton } from '#/components/ui/Skeleton'
import { useI18n, type I18nKey } from '#/i18n'
import type { Call } from '../api'

export type RemovalPreview = {
  readonly role: string
  readonly uploadedFiles: number
  readonly guestGrants: number
  readonly activeLinks: number
  readonly pendingInvitations: number
  readonly managedProjects: number
}

type State = { readonly status: 'loading' } | { readonly status: 'failed' } | { readonly status: 'ready'; readonly preview: RemovalPreview }

const rows: ReadonlyArray<readonly [keyof Omit<RemovalPreview, 'role'>, I18nKey]> = [
  ['uploadedFiles', 'app.team.preview.files'],
  ['guestGrants', 'app.team.preview.guestGrants'],
  ['activeLinks', 'app.team.preview.links'],
  ['pendingInvitations', 'app.team.preview.invitations'],
  ['managedProjects', 'app.team.preview.projects'],
]

/** What removing someone touches, as counts from `previewMemberRemoval`. Only rows with something in them show. */
export const RemovalPreviewList = ({ call, workspaceId, userId }: { call: Call; workspaceId: string; userId: string }) => {
  const { t } = useI18n()
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void call<RemovalPreview>('previewMemberRemoval', { workspaceId, userId }).then((result) => {
      if (!cancelled) setState(result.ok ? { status: 'ready', preview: result.data } : { status: 'failed' })
    })
    return () => {
      cancelled = true
    }
  }, [call, workspaceId, userId])

  if (state.status === 'loading') return <Skeleton aria-busy="true" className="h-16 w-full" />
  // Removal itself does not depend on the preview: when it cannot load, say so and let the person decide.
  if (state.status === 'failed') return <p className="text-sm text-text-2">{t('app.team.preview.failed')}</p>
  const shown = rows.filter(([key]) => state.preview[key] > 0)
  return (
    <section aria-label={t('app.team.preview.title')} className="grid gap-2">
      <h3 className="text-sm font-medium text-text-2">{t('app.team.preview.title')}</h3>
      {shown.length === 0 ? (
        <p className="text-sm text-text-2">{t('app.team.preview.none')}</p>
      ) : (
        <dl className="divide-y divide-line rounded-lg border border-line px-3.5 text-sm">
          {shown.map(([key, label]) => (
            <div key={key} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="min-w-0 text-text-2">{t(label)}</dt>
              <dd className="shrink-0 font-semibold tabular-nums">{state.preview[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
