import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'
import { Toast as T } from 'radix-ui'
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { cx } from './cx'

export type ToastTone = 'neutral' | 'success' | 'danger'

export type ToastInput = {
  title: string
  description?: string
  tone?: ToastTone
  /** Optional single action, e.g. "Geri al". */
  action?: { label: string; onClick: () => void }
  /** ms; default 5000. Toasts with an action stay longer. */
  duration?: number
}

type ToastItem = ToastInput & { id: number }

type ToastApi = { toast: (input: ToastInput) => void }
const Ctx = createContext<ToastApi | null>(null)

export const useToast = (): ToastApi => {
  const api = use(Ctx)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

let nextId = 1

export const ToastProvider = ({
  children,
  closeLabel = 'Kapat',
  regionLabel = 'Bildirimler',
}: {
  children: ReactNode
  closeLabel?: string
  regionLabel?: string
}) => {
  const [items, setItems] = useState<ToastItem[]>([])
  const toast = useCallback((input: ToastInput) => setItems((list) => [...list, { ...input, id: nextId++ }]), [])
  const api = useMemo<ToastApi>(() => ({ toast }), [toast])
  const remove = (id: number) => setItems((list) => list.filter((item) => item.id !== id))

  return (
    <Ctx value={api}>
      <T.Provider swipeDirection="right" label={regionLabel}>
        {children}
        {items.map((item) => {
          const tone = item.tone ?? 'neutral'
          return (
            <T.Root
              key={item.id}
              data-motion="toast"
              duration={item.duration ?? (item.action ? 8000 : 5000)}
              onOpenChange={(open) => {
                if (!open) remove(item.id)
              }}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg border border-line bg-bg p-3 shadow-pop"
            >
              <span aria-hidden className={cx('mt-0.5', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger', tone === 'neutral' && 'text-text-3')}>
                {tone === 'danger' ? <CircleAlert className="size-4.5" /> : <CircleCheck className="size-4.5" />}
              </span>
              <div className="min-w-0">
                <T.Title className="text-md font-medium app:text-base">{item.title}</T.Title>
                {item.description ? (
                  <T.Description className="mt-0.5 text-sm text-text-2">{item.description}</T.Description>
                ) : null}
                {item.action ? (
                  <T.Action altText={item.action.label} asChild>
                    <button
                      type="button"
                      onClick={item.action.onClick}
                      className="mt-1 h-11 rounded-sm text-base font-medium text-accent hover:text-accent-hover app:h-8"
                    >
                      {item.action.label}
                    </button>
                  </T.Action>
                ) : null}
              </div>
              <T.Close
                aria-label={closeLabel}
                className="-mr-1.5 -mt-1.5 grid size-11 place-items-center rounded-sm text-text-3 hover:bg-hover hover:text-text app:size-8"
              >
                <X aria-hidden className="size-4" />
              </T.Close>
            </T.Root>
          )
        })}
        <T.Viewport className="fixed inset-x-2 bottom-2 z-70 m-0 flex list-none flex-col gap-2 p-0 outline-none app:inset-x-auto app:bottom-6 app:right-6 app:w-96" />
      </T.Provider>
    </Ctx>
  )
}
