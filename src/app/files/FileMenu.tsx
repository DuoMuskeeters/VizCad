import { Download, EllipsisVertical, FolderInput, Pencil, Share2, SquareCheckBig, Star, Trash2, ExternalLink } from 'lucide-react'
import { IconButton } from '#/components/ui/Button'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '#/components/ui/Menu'
import { useI18n } from '#/i18n'
import { abilitiesOf, isFullView, type AnyFileView } from './types'

export type FileMenuHandlers = {
  readonly onOpen?: () => void
  readonly onRename: () => void
  readonly onStar: () => void
  readonly onMove: () => void
  readonly onShare: () => void
  readonly onDownload: () => void
  readonly onTrash: () => void
  readonly onSelect?: () => void
}

/** The actions of one file with "disabled + why" for what the role or the file's permissions do not allow (docs/03 §1). */
export const FileMenu = ({ file, handlers, triggerClassName }: { file: AnyFileView; handlers: FileMenuHandlers; triggerClassName?: string }) => {
  const { t } = useI18n()
  const can = abilitiesOf(file)
  const full = isFullView(file)
  const reasonProp = (allowed: boolean, key: Parameters<typeof t>[0]) => (allowed ? {} : { disabledReason: t(key) })
  const moveReason = !can.edit ? t('files.reason.edit') : full && file.projectId === null ? t('files.reason.moveNoProject') : !full ? t('files.reason.edit') : undefined
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={t('files.menu.label', { name: file.name })} size="sm" {...(triggerClassName ? { className: triggerClassName } : {})}>
          <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end">
        {handlers.onOpen ? (
          <MenuItem icon={<ExternalLink />} onSelect={handlers.onOpen}>
            {t('files.menu.open')}
          </MenuItem>
        ) : null}
        <MenuItem icon={<Share2 />} onSelect={handlers.onShare} {...reasonProp(can.share, 'files.reason.share')}>
          {t('files.menu.share')}
        </MenuItem>
        <MenuItem icon={<Download />} onSelect={handlers.onDownload} {...reasonProp(can.download, 'files.reason.download')}>
          {t('files.menu.download')}
        </MenuItem>
        <MenuItem icon={<Pencil />} onSelect={handlers.onRename} {...reasonProp(can.edit, 'files.reason.edit')}>
          {t('files.menu.rename')}
        </MenuItem>
        <MenuItem
          icon={<Star />}
          onSelect={handlers.onStar}
          {...reasonProp(full, 'files.reason.star')}
        >
          {full && file.starred ? t('files.menu.unstar') : t('files.menu.star')}
        </MenuItem>
        <MenuItem icon={<FolderInput />} onSelect={handlers.onMove} {...(moveReason ? { disabledReason: moveReason } : {})}>
          {t('files.menu.move')}
        </MenuItem>
        {handlers.onSelect ? (
          <MenuItem icon={<SquareCheckBig />} onSelect={handlers.onSelect}>
            {t('files.menu.select')}
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem tone="danger" icon={<Trash2 />} onSelect={handlers.onTrash} {...reasonProp(can.trash, 'files.reason.trash')}>
          {t('files.menu.trash')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
