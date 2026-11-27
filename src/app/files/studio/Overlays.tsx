/**
 * What floats on the canvas (wireframe 13): the selection bar at the top and, while a part is isolated, the path bar.
 * Both in the canvas family (dark in both themes, docs/03 §4.2), 44px targets on touch.
 */
import type { ReactNode } from 'react'
import { Box, Boxes, ChevronLeft, ChevronRight, Eye, EyeOff, Focus, Maximize2, X } from 'lucide-react'
import { cx, fastTransition } from '#/components/ui/cx'
import { Tooltip } from '#/components/ui/Tooltip'
import { useI18n } from '#/i18n'
import { isAssembly, type OutlineNode } from '#/viewer/tree/outline'

const tool = cx(
  'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2.5 text-base text-canvas-text hover:bg-white/10 app:h-9 app:min-w-9 pointer-coarse:h-11',
  fastTransition,
)

const CanvasTool = ({ label, onClick, children, showLabel = false, pressed }: { label: string; onClick: () => void; children: ReactNode; showLabel?: boolean; pressed?: boolean }) => (
  <Tooltip content={label}>
    <button type="button" onClick={onClick} aria-label={showLabel ? undefined : label} aria-pressed={pressed} className={tool}>
      {children}
      {showLabel ? <span className="hidden whitespace-nowrap app:inline">{label}</span> : null}
    </button>
  </Tooltip>
)

export const SelectionBar = ({ node, name, hidden, isolated, onIsolate, onToggleHidden, onClear, extra }: {
  node: OutlineNode
  name: string
  hidden: boolean
  isolated: boolean
  onIsolate: () => void
  onToggleHidden: () => void
  onClear: () => void
  /** More tools (STL, 5c-2). */
  extra?: ReactNode
}) => {
  const { t, locale } = useI18n()
  const assembly = isAssembly(node)
  return (
    <div
      role="toolbar"
      aria-label={t('studio.selected', { name })}
      // Clear of the 128 px axes gizmo in the top right corner on a desktop canvas.
      className="absolute inset-x-2 top-2 z-10 mx-auto flex w-fit max-w-[calc(100%-16px)] items-center app:max-w-[calc(100%-288px)] gap-1 rounded-lg border border-white/10 bg-canvas/92 p-1 text-canvas-text shadow-pop app:top-3"
    >
      <span className="flex min-w-0 items-center gap-2 px-2">
        {assembly ? <Boxes aria-hidden className="size-4 shrink-0 text-brand" /> : <Box aria-hidden className="size-4 shrink-0 text-brand" />}
        <span className="truncate text-base font-medium">{name}</span>
        {assembly ? <span className="hidden shrink-0 text-sm opacity-75 app:inline">{t('studio.parts', { count: node.parts.toLocaleString(locale) })}</span> : null}
      </span>
      {isolated ? null : (
        <CanvasTool label={t('studio.isolate')} onClick={onIsolate}>
          <Focus aria-hidden className="size-4.5" />
        </CanvasTool>
      )}
      <CanvasTool label={hidden ? t('studio.show') : t('studio.hide')} onClick={onToggleHidden} pressed={hidden}>
        {hidden ? <Eye aria-hidden className="size-4.5" /> : <EyeOff aria-hidden className="size-4.5" />}
      </CanvasTool>
      {extra}
      <CanvasTool label={t('studio.clearSelection')} onClick={onClear}>
        <X aria-hidden className="size-4.5" />
      </CanvasTool>
    </div>
  )
}

/** `Pump › Pump unit` with each step a link, and "Whole assembly". The browser's back button walks the same way. */
export const PathBar = ({ steps, onGo }: { steps: readonly { path: string; name: string }[]; onGo: (path: string | null) => void }) => {
  const { t } = useI18n()
  const current = steps.at(-1)
  const parent = steps.at(-2)
  if (current === undefined) return null
  return (
    <nav
      aria-label={t('studio.path.label')}
      className={cx(
        // At the bottom: the top holds the selection bar and the axes gizmo.
        'absolute inset-x-2 bottom-2 z-10 mx-auto flex w-fit max-w-[calc(100%-16px)] items-center gap-1 rounded-lg border border-white/10 bg-canvas/92 p-1 text-canvas-text shadow-pop app:bottom-3',
      )}
    >
      {/* Phone: one step back and the current name. Desktop: every step. */}
      <button type="button" onClick={() => onGo(parent && parent.path !== '0' ? parent.path : null)} className={cx(tool, 'app:hidden')}>
        <ChevronLeft aria-hidden className="size-4.5" />
        <span className="max-w-28 truncate">{parent ? parent.name : t('studio.path.top')}</span>
      </button>
      <ol className="hidden min-w-0 items-center gap-0.5 app:flex">
        {steps.slice(0, -1).map((step) => (
          <li key={step.path} className="flex min-w-0 items-center gap-0.5">
            <button type="button" onClick={() => onGo(step.path === '0' ? null : step.path)} className={cx(tool, 'max-w-48 opacity-85')}>
              <span className="truncate">{step.name}</span>
            </button>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-60" />
          </li>
        ))}
      </ol>
      <b aria-current="location" className="min-w-0 truncate px-2 text-base font-semibold">
        {current.name}
      </b>
      <button type="button" onClick={() => onGo(null)} className={cx(tool, 'border border-white/15')}>
        <Maximize2 aria-hidden className="size-4" />
        <span className="sr-only app:not-sr-only">{t('studio.path.whole')}</span>
      </button>
    </nav>
  )
}
