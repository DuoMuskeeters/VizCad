/**
 * Saved views (docs/11 §3.1, §4.4): a camera, the parts hidden on the screen and the cut, stored in the scene record.
 * Everyone who sees the model may apply one; on a desktop an editor saves and deletes them. On a phone: apply only.
 */
import { useState } from 'react'
import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { Input } from '#/components/ui/Input'
import { useI18n } from '#/i18n'
import { SCENE_VIEW_NAME_MAX, type SceneView } from '#/shared/scene'

export type ViewSaving = {
  /** Why saving is not possible (no permission, at the limit, phone…); null when it is. */
  readonly reason: string | null
  readonly onSave: (name: string) => void
  readonly onDelete: (id: string) => void
}

export const SavedViews = ({ views, onApply, saving }: { views: readonly SceneView[]; onApply: (view: SceneView) => void; saving?: ViewSaving | undefined }) => {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const fallback = t('views.default', { number: views.length + 1 })
  return (
    <section aria-label={t('views.title')} className="mb-5 grid gap-2">
      <h3 className="flex items-baseline gap-2 text-base font-semibold">
        {t('views.title')}
        {views.length > 0 ? <span className="text-sm font-normal text-text-3">{views.length}</span> : null}
      </h3>
      {views.length === 0 ? (
        <p className="text-sm text-text-2">{saving ? t('views.emptySave') : t('views.empty')}</p>
      ) : (
        <ul className="grid gap-0.5">
          {views.map((view) => (
            <li key={view.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onApply(view)}
                aria-label={t('views.applyNamed', { name: view.name })}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-base hover:bg-hover app:min-h-9"
              >
                <Bookmark aria-hidden className="size-4 shrink-0 text-text-3" />
                <span className="min-w-0 truncate">{view.name}</span>
              </button>
              {saving && saving.reason === null ? (
                <IconButton label={t('views.delete', { name: view.name })} size="sm" onClick={() => saving.onDelete(view.id)}>
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {saving ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (saving.reason !== null) return
            saving.onSave(name.trim() === '' ? fallback : name.trim())
            setName('')
          }}
        >
          <label className="grid min-w-0 flex-1 gap-1">
            <span className="sr-only">{t('views.name')}</span>
            <Input value={name} maxLength={SCENE_VIEW_NAME_MAX} placeholder={fallback} onChange={(event) => setName(event.target.value)} disabled={saving.reason !== null} />
          </label>
          <Button type="submit" {...(saving.reason === null ? {} : { disabledReason: saving.reason })}>
            <BookmarkPlus aria-hidden className="size-4.5" />
            {t('views.save')}
          </Button>
        </form>
      ) : null}
      <p className="text-sm text-text-3">{t('views.note')}</p>
    </section>
  )
}
