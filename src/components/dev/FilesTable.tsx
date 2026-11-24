import { Download, EllipsisVertical, Link2, Link2Off, Lock, Pencil, Share2, Star, Trash2, UserRound, Users, type LucideIcon } from 'lucide-react'
import { DataList, DataListBody, DataListCell, DataListHead, DataListHeader, DataListPrimary, DataListRow, DataListSelectCell, FileTile } from '#/components/ui/DataList'
import { Checkbox } from '#/components/ui/Checkbox'
import { Avatar } from '#/components/ui/Avatar'
import { IconButton } from '#/components/ui/Button'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '#/components/ui/Menu'
import { TextLink } from '#/components/ui/Link'
import { cx } from '#/components/ui/cx'
import type { SampleFile } from './sample'

const accessIcon: Record<SampleFile['access']['kind'], LucideIcon> = {
  team: Lock,
  link: Link2,
  people: UserRound,
  expired: Link2Off,
}

const columns = 'app:grid-cols-[28px_minmax(0,1fr)_150px_110px_76px_168px_36px]'

export type FilesTableProps = {
  files: readonly SampleFile[]
  selected: ReadonlySet<string>
  onSelectedChange: (id: string, selected: boolean) => void
  onSelectAll: (all: boolean) => void
}

/** The "Tüm dosyalar" list from the approved mockup. Static data; nothing is opened or saved. */
export const FilesTable = ({ files, selected, onSelectedChange, onSelectAll }: FilesTableProps) => {
  const all = files.length > 0 && selected.size === files.length
  const selecting = selected.size > 0
  return (
    <DataList columns={columns} selecting={selecting} aria-label="Dosyalar">
      <DataListHeader>
        <DataListHead>
          <Checkbox
            aria-label="Tümünü seç"
            checked={all ? true : selecting ? 'indeterminate' : false}
            onCheckedChange={(value) => onSelectAll(value === true)}
          />
        </DataListHead>
        <DataListHead>Ad</DataListHead>
        <DataListHead>Sahip</DataListHead>
        <DataListHead>Değiştirildi</DataListHead>
        <DataListHead align="end">Boyut</DataListHead>
        <DataListHead>Erişim</DataListHead>
        <DataListHead>
          <span className="sr-only">Eylemler</span>
        </DataListHead>
      </DataListHeader>
      <DataListBody>
        {files.map((file) => {
          const Icon = accessIcon[file.access.kind]
          const expired = file.access.kind === 'expired'
          return (
            <DataListRow key={file.id} selected={selected.has(file.id)}>
              <DataListSelectCell
                label={`${file.name} seç`}
                checked={selected.has(file.id)}
                onCheckedChange={(value) => onSelectedChange(file.id, value)}
              />
              <DataListPrimary
                leading={<FileTile ext={file.ext} />}
                meta={`${file.owner} · ${file.modified} · ${file.size}`}
                trailing={file.starred ? <Star aria-label="Yıldızlı" className="size-3.5 fill-warn text-warn" /> : null}
              >
                <TextLink href="#" onClick={(e) => e.preventDefault()} className="font-medium text-text no-underline hover:text-text hover:underline">
                  {file.name}
                </TextLink>
              </DataListPrimary>
              <DataListCell desktopOnly className="flex items-center gap-2">
                <Avatar name={file.owner} size="xs" decorative />
                <span className="truncate">{file.owner}</span>
              </DataListCell>
              <DataListCell desktopOnly>{file.modified}</DataListCell>
              <DataListCell desktopOnly align="end">
                {file.size}
              </DataListCell>
              <DataListCell desktopOnly>
                <span className={cx('inline-flex items-center gap-1.5', expired && 'text-warn')}>
                  <Icon aria-hidden className={cx('size-3.75', expired ? 'text-warn' : 'text-text-3')} />
                  {file.access.text}
                </span>
              </DataListCell>
              <DataListCell className="flex justify-end">
                <Menu>
                  <MenuTrigger asChild>
                    <IconButton label={`${file.name}: diğer eylemler`} size="sm">
                      <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem icon={<Share2 />}>Paylaş</MenuItem>
                    <MenuItem icon={<Download />}>İndir</MenuItem>
                    <MenuItem icon={<Pencil />}>Adını değiştir</MenuItem>
                    <MenuItem icon={<Users />} onSelect={() => onSelectedChange(file.id, true)}>
                      Seç
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem tone="danger" icon={<Trash2 />}>
                      Çöpe taşı
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </DataListCell>
            </DataListRow>
          )
        })}
      </DataListBody>
    </DataList>
  )
}
