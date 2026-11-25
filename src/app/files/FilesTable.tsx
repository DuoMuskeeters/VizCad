import { Star } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Checkbox } from '#/components/ui/Checkbox'
import { DataList, DataListBody, DataListCell, DataListHead, DataListHeader, DataListPrimary, DataListRow, DataListSelectCell, FileTile } from '#/components/ui/DataList'
import { TextLink } from '#/components/ui/Link'
import { Link } from '@tanstack/react-router'
import { useI18n } from '#/i18n'
import { FileMenu, type FileMenuHandlers } from './FileMenu'
import { formatBytes, formatWhen, tileText } from './format'
import { isFullView, type AnyFileView } from './types'

const columns = 'app:grid-cols-[28px_minmax(0,1fr)_150px_150px_110px_76px_36px]'

export const ownerOf = (file: AnyFileView): string | null => (isFullView(file) ? (file.currentVersion.uploadedBy?.displayName ?? null) : file.sharedBy.displayName)

export type FilesTableProps = {
  readonly files: readonly AnyFileView[]
  readonly selected: ReadonlySet<string>
  readonly onSelectedChange: (id: string, selected: boolean) => void
  readonly onSelectAll: (all: boolean) => void
  readonly handlersFor: (file: AnyFileView) => FileMenuHandlers
}

/** The "Tüm dosyalar" list of the approved mockup (docs/03 §2.1): checkbox, name, project, uploader, date, size, menu. */
export const FilesTable = ({ files, selected, onSelectedChange, onSelectAll, handlersFor }: FilesTableProps) => {
  const { t, locale } = useI18n()
  const all = files.length > 0 && files.every((file) => selected.has(file.id))
  const selecting = selected.size > 0
  return (
    <DataList columns={columns} selecting={selecting} aria-label={t('files.listLabel')}>
      <DataListHeader>
        <DataListHead>
          <Checkbox aria-label={t('files.selectAll')} checked={all ? true : selecting ? 'indeterminate' : false} onCheckedChange={(value) => onSelectAll(value === true)} />
        </DataListHead>
        <DataListHead>{t('files.col.name')}</DataListHead>
        <DataListHead>{t('files.col.project')}</DataListHead>
        <DataListHead>{t('files.col.owner')}</DataListHead>
        <DataListHead>{t('files.col.modified')}</DataListHead>
        <DataListHead align="end">{t('files.col.size')}</DataListHead>
        <DataListHead>
          <span className="sr-only">{t('files.col.actions')}</span>
        </DataListHead>
      </DataListHeader>
      <DataListBody>
        {files.map((file) => {
          const owner = ownerOf(file)
          const project = isFullView(file) ? file.projectName : null
          const starred = isFullView(file) && file.starred
          return (
            <DataListRow key={file.id} selected={selected.has(file.id)}>
              <DataListSelectCell label={t('files.selectOne', { name: file.name })} checked={selected.has(file.id)} onCheckedChange={(value) => onSelectedChange(file.id, value)} />
              <DataListPrimary
                leading={<FileTile ext={tileText(file.extension)} />}
                meta={[owner, formatWhen(file.updatedAt, locale), formatBytes(file.size, locale)].filter(Boolean).join(' · ')}
                trailing={starred ? <Star aria-label={t('files.starred')} className="size-3.5 fill-warn text-warn" /> : null}
              >
                <TextLink asChild className="font-medium text-text no-underline hover:text-text hover:underline">
                  <Link to="/app/files/$id" params={{ id: file.id }}>
                    {file.name}
                  </Link>
                </TextLink>
              </DataListPrimary>
              <DataListCell desktopOnly className="truncate">
                {project ?? <span className="text-text-3">{t('files.noProject')}</span>}
              </DataListCell>
              <DataListCell desktopOnly>
                {owner ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={owner} size="xs" decorative />
                    <span className="truncate">{owner}</span>
                  </span>
                ) : null}
              </DataListCell>
              <DataListCell desktopOnly>{formatWhen(file.updatedAt, locale)}</DataListCell>
              <DataListCell desktopOnly align="end">
                {formatBytes(file.size, locale)}
              </DataListCell>
              <DataListCell className="flex justify-end">
                <FileMenu file={file} handlers={handlersFor(file)} />
              </DataListCell>
            </DataListRow>
          )
        })}
      </DataListBody>
    </DataList>
  )
}
