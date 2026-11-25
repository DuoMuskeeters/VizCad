import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { Checkbox } from '#/components/ui/Checkbox'
import { cx } from '#/components/ui/cx'
import { useI18n } from '#/i18n'
import { FileMenu, type FileMenuHandlers } from './FileMenu'
import { formatBytes, formatWhen, tileText } from './format'
import { thumbnailUrl, isFullView, type AnyFileView } from './types'

/** Thumbnail when the server has one; otherwise (or when it fails to load, which shows no error) the format tile. */
export const Thumbnail = ({ file, className }: { file: AnyFileView; className?: string }) => {
  const [failed, setFailed] = useState(false)
  if (!file.thumbnailAvailable || failed)
    return (
      <span aria-hidden className={cx('grid place-items-center bg-surface text-lg font-bold tracking-wide text-text-3', className)}>
        {tileText(file.extension)}
      </span>
    )
  return <img src={thumbnailUrl(file.id, file.currentVersion.number)} alt="" loading="lazy" onError={() => setFailed(true)} className={cx('bg-surface object-cover', className)} />
}

export type FilesGridProps = {
  readonly files: readonly AnyFileView[]
  readonly selected: ReadonlySet<string>
  readonly onSelectedChange: (id: string, selected: boolean) => void
  readonly handlersFor: (file: AnyFileView) => FileMenuHandlers
}

export const FilesGrid = ({ files, selected, onSelectedChange, handlersFor }: FilesGridProps) => {
  const { t, locale } = useI18n()
  return (
    <ul aria-label={t('files.listLabel')} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3 pt-4">
      {files.map((file) => {
        const isSelected = selected.has(file.id)
        const starred = isFullView(file) && file.starred
        return (
          <li key={file.id} data-selected={isSelected ? '' : undefined} className="group/card relative overflow-hidden rounded-lg border border-line bg-bg data-selected:border-accent data-selected:bg-accent-soft">
            <Link to="/app/files/$id" params={{ id: file.id }} className="block">
              <Thumbnail file={file} className="aspect-4/3 w-full" />
              <div className="px-3 pb-3 pt-2.5 pr-12">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-md font-medium">{file.name}</span>
                  {starred ? <Star aria-label={t('files.starred')} className="size-3.5 shrink-0 fill-warn text-warn" /> : null}
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-text-3">
                  <span className="truncate">
                    {formatWhen(file.updatedAt, locale)} · {formatBytes(file.size, locale)}
                  </span>
                </p>
              </div>
            </Link>
            <div className={cx('absolute left-2 top-2 rounded-md bg-bg/90 p-1 pointer-coarse:opacity-100 group-hover/card:opacity-100 group-focus-within/card:opacity-100', isSelected || selected.size > 0 ? 'opacity-100' : 'opacity-0')}>
              <Checkbox aria-label={t('files.selectOne', { name: file.name })} checked={isSelected} onCheckedChange={(value) => onSelectedChange(file.id, value === true)} />
            </div>
            <div className="absolute bottom-2 right-1.5">
              <FileMenu file={file} handlers={handlersFor(file)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
