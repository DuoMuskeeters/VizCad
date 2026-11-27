/**
 * "Download the part as STL" (docs/11 §4.3, B7, wireframe 13 "STL indir"): triangles and estimated size, position
 * (in place by default, B7), the honest note, then the viewer writes the file. Desktop only, download permission only.
 */
import { useEffect, useState } from 'react'
import { Download, Info } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { RadioCard, RadioCardGroup } from '#/components/ui/RadioCard'
import { useI18n } from '#/i18n'
import { STL_MAX_BYTES, stlBytes } from '#/shared/stl'
import { formatBytes } from '../format'

export type StlSource = {
  readonly triangles: (path: string) => Promise<number>
  readonly write: (path: string, centered: boolean, name: string) => Promise<Blob | null>
}

export const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A file name from a part name: no path separators or control characters, `.stl` added. */
export const stlName = (name: string) => `${name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || 'part'}.stl`

export const StlDialog = ({ path, name, where, source, onClose, onFailed }: {
  path: string
  name: string
  /** `Pump › Pump unit`, under the title. */
  where: string
  source: StlSource
  onClose: () => void
  onFailed: () => void
}) => {
  const { t, locale } = useI18n()
  const [triangles, setTriangles] = useState<number | null>(null)
  const [position, setPosition] = useState<'place' | 'center'>('place')
  const [busy, setBusy] = useState(false)
  const tooLarge = triangles !== null && stlBytes(triangles) > STL_MAX_BYTES
  useEffect(() => {
    let live = true
    void source.triangles(path).then((n) => {
      if (live) setTriangles(n)
    })
    return () => {
      live = false
    }
  }, [path, source])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t('studio.stl.title')}
        description={where}
        closeLabel={t('studio.stl.cancel')}
        footer={
          <DialogFooter>
            <Button onClick={onClose}>{t('studio.stl.cancel')}</Button>
            <Button
              variant="primary"
              loading={busy}
              {...(tooLarge ? { disabledReason: t('studio.stl.tooLarge', { size: formatBytes(STL_MAX_BYTES, locale) }) } : {})}
              onClick={() => {
                setBusy(true)
                // A failed write (out of memory, the model gone) never leaves the button spinning.
                void source.write(path, position === 'center', name).then(
                  (blob) => {
                    setBusy(false)
                    if (blob === null) return onFailed()
                    saveBlob(blob, stlName(name))
                    onClose()
                  },
                  () => {
                    setBusy(false)
                    onFailed()
                  },
                )
              }}
            >
              <Download aria-hidden className="size-4.5" />
              {t('studio.stl.download')}
            </Button>
          </DialogFooter>
        }
      >
        <dl className="grid grid-cols-3 gap-3 rounded-lg border border-line p-3">
          {[
            [t('studio.stl.triangles'), triangles === null ? '…' : triangles.toLocaleString(locale)],
            [t('studio.stl.size'), triangles === null ? '…' : formatBytes(stlBytes(triangles), locale)],
            [t('studio.stl.unit'), 'mm'],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-0.5">
              <dt className="text-sm text-text-3">{label}</dt>
              <dd className="text-md font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-2">
          <span className="text-base font-medium">{t('studio.stl.position')}</span>
          <RadioCardGroup value={position} onValueChange={(value) => setPosition(value === 'center' ? 'center' : 'place')} aria-label={t('studio.stl.position')}>
            <RadioCard value="place" title={t('studio.stl.inPlace')} description={t('studio.stl.inPlaceLead')} />
            <RadioCard value="center" title={t('studio.stl.centered')} description={t('studio.stl.centeredLead')} />
          </RadioCardGroup>
        </div>
        <p className="flex gap-2 text-sm text-text-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-text-3" />
          <span>{t('studio.stl.notice')}</span>
        </p>
      </DialogContent>
    </Dialog>
  )
}
