/**
 * Scene prep (docs/11 §4.2, wireframe 13 "Sahne hazırlama", "Sahne çakışması", "Yeni sürüm eşleme"): the mode bar,
 * the conflict and version bars, the matching banner and the right panel that edits the selected node (name, 12
 * colours + code, finish, visible). Desktop only (§4.4); the phone sees the result.
 */
import { useEffect, useId, useState } from 'react'
import { CloudCheck, GitCompareArrows, Loader2, Paintbrush, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { cx, fastTransition } from '#/components/ui/cx'
import { Switch } from '#/components/ui/Switch'
import { useI18n, type I18nKey } from '#/i18n'
import type { SceneFinish, SceneNode } from '#/shared/scene'
import type { OutlineNode } from '#/viewer/tree/outline'
import type { SceneEdit } from '#/viewer/tree/scene'
import type { SaveStatus } from './useScene'

/** The 12 colours of the wireframe; a part colour is data (any `#rrggbb`), these are only shortcuts. */
export const PALETTE: ReadonlyArray<readonly [string, I18nKey]> = [
  ['#b23a2e', 'studio.color.red'], ['#d97706', 'studio.color.orange'], ['#c9a227', 'studio.color.yellow'], ['#3f7d4e', 'studio.color.green'],
  ['#3f6ea8', 'studio.color.blue'], ['#5b4b9a', 'studio.color.purple'], ['#1f2937', 'studio.color.anthracite'], ['#5b6470', 'studio.color.darkGray'],
  ['#9aa3ad', 'studio.color.gray'], ['#d6dbe1', 'studio.color.lightGray'], ['#f3f4f6', 'studio.color.white'], ['#8a5a3b', 'studio.color.bronze'],
]

const FINISHES: ReadonlyArray<SceneFinish> = ['matte', 'satin', 'metal']

/** A colour chip drawn as SVG: a part colour is data, never a style. */
export const Chip = ({ color, className }: { color: string; className?: string }) => (
  <svg aria-hidden viewBox="0 0 10 10" className={cx('shrink-0 rounded-sm ring-1 ring-black/20', className)}>
    <rect width="10" height="10" fill={color} />
  </svg>
)

export const SaveState = ({ status }: { status: SaveStatus }) => {
  const { t } = useI18n()
  if (status === 'idle' || status === 'conflict' || status === 'version') return null
  return (
    <span role="status" className={cx('inline-flex items-center gap-1.5 text-sm', status === 'error' ? 'text-danger' : 'text-text-2')}>
      {status === 'saving' ? <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> : status === 'saved' ? <CloudCheck aria-hidden className="size-4 text-success" /> : null}
      {t(status === 'saving' ? 'studio.save.saving' : status === 'saved' ? 'studio.save.saved' : status === 'pending' ? 'studio.save.pending' : 'studio.save.error')}
    </span>
  )
}

const Band = ({ tone, icon, title, lead, children, role }: { tone: 'info' | 'warn'; icon: React.ReactNode; title: string; lead: string; children?: React.ReactNode; role?: 'alert' | 'status' }) => (
  <div role={role} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5', tone === 'warn' ? 'border-warn/40 bg-warn-soft' : 'border-line bg-accent-soft')}>
    <span className={cx('shrink-0 [&>svg]:size-5', tone === 'warn' ? 'text-warn-text' : 'text-accent')}>{icon}</span>
    <p className="min-w-60 flex-1 text-base">
      <b className="font-semibold">{title}</b> <span className="text-text-2">{lead}</span>
    </p>
    {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
  </div>
)

export const EditBar = ({ status, onDone }: { status: SaveStatus; onDone: () => void }) => {
  const { t } = useI18n()
  return (
    <Band tone="info" icon={<Paintbrush aria-hidden />} title={t('studio.edit.banner')} lead={t('studio.edit.bannerLead')}>
      <SaveState status={status} />
      <Button variant="primary" onClick={onDone}>
        {t('studio.edit.done')}
      </Button>
    </Band>
  )
}

export const ConflictBar = ({ kind, onReload }: { kind: 'conflict' | 'version'; onReload: () => void }) => {
  const { t } = useI18n()
  return (
    <Band role="alert" tone="warn" icon={<TriangleAlert aria-hidden />} title={t(kind === 'conflict' ? 'studio.conflict.title' : 'studio.version.title')} lead={t(kind === 'conflict' ? 'studio.conflict.lead' : 'studio.version.lead')}>
      <Button variant="primary" onClick={onReload}>
        <RefreshCw aria-hidden className="size-4.5" />
        {t(kind === 'conflict' ? 'studio.conflict.reload' : 'studio.version.reload')}
      </Button>
    </Band>
  )
}

export const MatchBar = ({ version, matched, unmatched, busy, onApply, onIgnore }: {
  version: number | null
  matched: number
  unmatched: readonly string[]
  busy: boolean
  onApply: () => void
  onIgnore: () => void
}) => {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const listId = useId()
  const number = (n: number) => n.toLocaleString(locale)
  return (
    <div>
      <Band
        tone="info"
        icon={<GitCompareArrows aria-hidden />}
        title={version === null ? t('studio.match.titleEarlier') : t('studio.match.title', { version })}
        lead={t('studio.match.lead', { matched: number(matched), unmatched: number(unmatched.length) })}
      >
        {unmatched.length > 0 ? (
          <Button variant="ghost" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
            {t('studio.match.unmatched')}
          </Button>
        ) : null}
        <Button onClick={onIgnore} disabled={busy}>
          {t('studio.match.ignore')}
        </Button>
        <Button variant="primary" onClick={onApply} loading={busy} {...(matched === 0 ? { disabledReason: t('studio.match.short', { matched: '0', total: number(unmatched.length) }) } : {})}>
          {t('studio.match.apply')}
        </Button>
      </Band>
      {open ? (
        <section id={listId} aria-label={t('studio.match.unmatchedTitle')} className="max-h-40 overflow-y-auto border-b border-line bg-bg px-4 py-2">
          <ul className="grid gap-1 text-sm text-text-2">
            {unmatched.slice(0, 200).map((name) => (
              <li key={name} className="break-words">
                {name.split('/').join(' › ')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** The edit panel's node card. Changes go out at once to the page (which saves after a pause); the name on blur/Enter. */
export const NodeEditor = ({ node, entry, fileColor, onEdit }: {
  node: OutlineNode
  entry: SceneNode | undefined
  /** `#rrggbb` the node shows without the record (its first material), for the code field. */
  fileColor: string | null
  onEdit: (edit: SceneEdit) => void
}) => {
  const { t } = useI18n()
  const [name, setName] = useState(entry?.name ?? node.name)
  const [code, setCode] = useState(entry?.color ?? fileColor ?? '')
  useEffect(() => setName(entry?.name ?? node.name), [node.path, entry?.name, node.name])
  useEffect(() => setCode(entry?.color ?? fileColor ?? ''), [node.path, entry?.color, fileColor])
  const commitName = () => {
    const trimmed = name.trim()
    onEdit({ name: trimmed === '' || trimmed === node.name ? null : trimmed })
  }
  const codeValid = /^#?[0-9a-fA-F]{6}$/.test(code.trim())
  const color = entry?.color ?? null
  const ids = { name: useId(), code: useId(), finish: useId() }

  return (
    <section className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={ids.name} className="text-base font-medium">
          {t('studio.edit.name')}
        </label>
        <input
          id={ids.name}
          value={name}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitName()
          }}
          className="h-11 w-full rounded-md border border-line-strong bg-bg px-3 text-lg app:h-10 app:text-base"
        />
        {entry?.name !== undefined ? <p className="text-sm text-text-3">{t('studio.edit.fileName', { name: node.name })}</p> : null}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-medium">{t('studio.edit.color')}</span>
          {color !== null ? (
            <button type="button" onClick={() => onEdit({ color: null })} className="min-h-11 text-base text-accent hover:underline app:min-h-0">
              {t('studio.edit.colorReset')}
            </button>
          ) : null}
        </div>
        <div role="group" aria-label={t('studio.edit.color')} className="grid grid-cols-6 gap-2">
          {PALETTE.map(([hex, label]) => (
            <button
              key={hex}
              type="button"
              aria-pressed={color === hex}
              aria-label={t(label)}
              onClick={() => onEdit({ color: hex })}
              className={cx('grid aspect-square min-h-11 place-items-center rounded-md app:min-h-8', color === hex && 'outline-2 outline-offset-2 outline-text', fastTransition)}
            >
              <Chip color={hex} className="size-full rounded-md" />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2">
          <Chip color={codeValid ? `#${code.trim().replace('#', '')}` : '#000000'} className={cx('size-9 rounded-md', !codeValid && 'opacity-20')} />
          <input
            id={ids.code}
            aria-label={t('studio.edit.colorCode')}
            value={code}
            maxLength={7}
            spellCheck={false}
            onChange={(event) => setCode(event.target.value)}
            onBlur={() => {
              if (codeValid) onEdit({ color: `#${code.trim().replace('#', '').toLowerCase()}` })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && codeValid) onEdit({ color: `#${code.trim().replace('#', '').toLowerCase()}` })
            }}
            aria-invalid={code !== '' && !codeValid}
            className="h-11 w-full rounded-md border border-line-strong bg-bg px-3 font-mono text-lg uppercase aria-invalid:border-danger app:h-10 app:text-base"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <span id={ids.finish} className="text-base font-medium">
          {t('studio.edit.finish')}
        </span>
        <div role="group" aria-labelledby={ids.finish} className="grid grid-cols-3 gap-0.5 rounded-lg bg-hover p-0.75">
          {FINISHES.map((finish) => (
            <button
              key={finish}
              type="button"
              aria-pressed={(entry?.finish ?? null) === finish}
              onClick={() => onEdit({ finish: entry?.finish === finish ? null : finish })}
              className={cx('h-11 rounded-md border border-transparent text-base font-medium text-text-2 app:h-8.5', 'aria-pressed:border-line aria-pressed:bg-bg aria-pressed:text-text', fastTransition)}
            >
              {t(`studio.edit.finish.${finish}`)}
            </button>
          ))}
        </div>
      </div>

      <label className="flex min-h-14 items-center justify-between gap-4">
        <span className="grid gap-0.5">
          <span className="text-base font-medium">{t('studio.edit.visible')}</span>
          <span className="text-sm text-text-2">{t('studio.edit.visibleLead')}</span>
        </span>
        <Switch checked={entry?.hidden !== true} onCheckedChange={(on) => onEdit({ hidden: !on })} aria-label={t('studio.edit.visible')} />
      </label>
    </section>
  )
}
