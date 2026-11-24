import { useState } from 'react'
import { Download, LayoutGrid, List, Share2, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '#/components/ui/PageHeader'
import { Button } from '#/components/ui/Button'
import { TabNav, TabNavLink } from '#/components/ui/Tabs'
import { Select } from '#/components/ui/Select'
import { SegmentedControl } from '#/components/ui/SegmentedControl'
import { SelectionBar, SelectionBarAction } from '#/components/ui/SelectionBar'
import { useToast } from '#/components/ui/Toast'
import { AppFrame } from './AppFrame'
import { FilesTable } from './FilesTable'
import { files } from './sample'

const sortOptions = [
  { value: 'modified', label: 'Son değişiklik' },
  { value: 'name', label: 'Ad' },
  { value: 'size', label: 'Boyut' },
]

/** "Tüm dosyalar" screen, static. */
export const FilesDemo = () => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [view, setView] = useState('list')
  const [sort, setSort] = useState('modified')
  const { toast } = useToast()

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <AppFrame current="files" fab={selected.size === 0}>
      <PageHeader
        title="Tüm dosyalar"
        subtitle="8 dosya · 153 MB"
        actions={
          <div className="hidden app:block">
            <Button variant="primary">
              <Upload aria-hidden className="size-4.5" />
              Yükle
            </Button>
          </div>
        }
      />

      <div className="mb-1 flex items-center gap-3 border-b border-line">
        <TabNav aria-label="Filtre" className="min-w-0 flex-1 border-b-0">
          <TabNavLink href="#" current onClick={(e) => e.preventDefault()}>
            Tümü
          </TabNavLink>
          <TabNavLink href="#" onClick={(e) => e.preventDefault()}>
            Son açılanlar
          </TabNavLink>
          <TabNavLink href="#" onClick={(e) => e.preventDefault()}>
            Yıldızlı
          </TabNavLink>
          <TabNavLink href="#" onClick={(e) => e.preventDefault()}>
            Benim yüklediklerim
          </TabNavLink>
        </TabNav>
        <div className="hidden shrink-0 items-center gap-1 app:flex">
          <Select variant="inline" aria-label="Sırala" value={sort} onValueChange={setSort} options={sortOptions} className="text-text-2" />
          <SegmentedControl
            size="sm"
            aria-label="Görünüm"
            value={view}
            onValueChange={setView}
            options={[
              { value: 'list', label: <><List aria-hidden /><span className="sr-only">Liste</span></> },
              { value: 'grid', label: <><LayoutGrid aria-hidden /><span className="sr-only">Izgara</span></> },
            ]}
          />
        </div>
      </div>

      <FilesTable
        files={files}
        selected={selected}
        onSelectedChange={toggle}
        onSelectAll={(all) => setSelected(all ? new Set(files.map((f) => f.id)) : new Set())}
      />

      {selected.size > 0 ? (
        <SelectionBar
          label={`${selected.size} dosya seçildi`}
          onClear={() => setSelected(new Set())}
        >
          <SelectionBarAction icon={<Share2 />}>Paylaş</SelectionBarAction>
          <SelectionBarAction icon={<Download />}>İndir</SelectionBarAction>
          <SelectionBarAction
            icon={<Trash2 />}
            onClick={() => {
              toast({ title: `${selected.size} dosya çöpe taşındı`, action: { label: 'Geri al', onClick: () => undefined } })
              setSelected(new Set())
            }}
          >
            Çöpe taşı
          </SelectionBarAction>
        </SelectionBar>
      ) : null}
    </AppFrame>
  )
}
