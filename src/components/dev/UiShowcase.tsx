import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Calendar,
  Download,
  EllipsisVertical,
  Eye,
  FolderOpen,
  Link2,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Send,
  Share2,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { TextLink } from '#/components/ui/Link'
import { Input, Textarea } from '#/components/ui/Input'
import { Field } from '#/components/ui/Field'
import { Select } from '#/components/ui/Select'
import { Checkbox, CheckboxField } from '#/components/ui/Checkbox'
import { RadioCard, RadioCardGroup } from '#/components/ui/RadioCard'
import { SwitchRow } from '#/components/ui/Switch'
import { SegmentedControl } from '#/components/ui/SegmentedControl'
import { ChipsInput } from '#/components/ui/ChipsInput'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '#/components/ui/Menu'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '#/components/ui/Dialog'
import { Tooltip } from '#/components/ui/Tooltip'
import { useToast } from '#/components/ui/Toast'
import { TabNav, TabNavLink, Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/Tabs'
import { Badge } from '#/components/ui/Badge'
import { Avatar, AvatarStack } from '#/components/ui/Avatar'
import { Meter } from '#/components/ui/Meter'
import { Skeleton } from '#/components/ui/Skeleton'
import { EmptyState } from '#/components/ui/EmptyState'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { Logo } from '#/components/ui/Logo'
import { WorkspaceMark, WorkspaceSwitcher } from '#/components/ui/WorkspaceSwitcher'
import { FileTile } from '#/components/ui/DataList'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/Table'
import { FilesTable } from './FilesTable'
import { ThemeSwitch } from './ThemeSwitch'
import { files, people, workspaces } from './sample'

const Section = ({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-line py-8">
    <h2 id={`${id}-h`} className="text-xl font-heading tracking-heading">
      {title}
    </h2>
    {note ? <p className="mt-1 max-w-2xl text-md text-text-2">{note}</p> : null}
    <div className="mt-5 grid gap-6">{children}</div>
  </section>
)

const Group = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div className="grid gap-2.5">
    <h3 className="text-sm font-medium text-text-3">{label}</h3>
    <div className={className ?? 'flex flex-wrap items-center gap-3'}>{children}</div>
  </div>
)

const sections = [
  ['buttons', 'Düğmeler'],
  ['forms', 'Form'],
  ['choices', 'Seçimler'],
  ['menus', 'Menüler'],
  ['dialogs', 'Pencereler'],
  ['feedback', 'Geri bildirim'],
  ['navigation', 'Gezinme'],
  ['display', 'Gösterim'],
  ['lists', 'Tablo ve liste'],
] as const

const accessOptions = [
  { value: 'view', label: 'Görüntüleyebilir', description: 'Modeli açar ve inceler' },
  { value: 'comment', label: 'Yorum yapabilir', description: 'Ayrıca yorum yazar' },
  { value: 'download', label: 'İndirebilir', description: 'Ayrıca dosyayı indirir' },
  { value: 'edit', label: 'Düzenleyebilir', description: 'Misafirlere verilemez', disabled: true },
]

export const UiShowcase = () => {
  const { toast } = useToast()
  const [emails, setEmails] = useState<string[]>(['can@demirmakina.com', 'teklif@ozdokum.com.tr'])
  const [emailError, setEmailError] = useState<string | undefined>()
  const [access, setAccess] = useState('comment')
  const [level, setLevel] = useState('download')
  const [seg, setSeg] = useState('list')
  const [notify, setNotify] = useState(true)
  const [checked, setChecked] = useState(true)
  const [workspace, setWorkspace] = useState('dm')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['f1']))
  const [selectValue, setSelectValue] = useState('comment')
  const [saving, setSaving] = useState(false)

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Logo className="text-[24px]" />
          <span className="text-md font-semibold">UI kit</span>
          <Link to="/dev/ui/shell" className="rounded-sm py-2 text-md font-medium text-accent underline underline-offset-2">
            Kabuk örneği
          </Link>
          <div className="w-full app:ml-auto app:w-auto">
            <ThemeSwitch />
          </div>
        </div>
        <nav aria-label="Bölümler" className="mx-auto max-w-5xl overflow-x-auto px-4 [scrollbar-width:none]">
          <ul className="flex gap-4">
            {sections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex h-11 items-center whitespace-nowrap text-base text-text-2 hover:text-text">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24">
        <Section id="buttons" title="Düğmeler" note="Devre dışı düğme nedenini söyler: dokununca ya da odaklanınca görünür, ekran okuyucu açıklama olarak okur.">
          <Group label="Türler">
            <Button variant="primary">
              <Upload aria-hidden className="size-4.5" />
              Yükle
            </Button>
            <Button>Vazgeç</Button>
            <Button variant="ghost">Daha sonra</Button>
            <Button variant="danger">
              <Trash2 aria-hidden className="size-4.5" />
              Workspace&apos;i sil
            </Button>
            <Button variant="danger-quiet">Workspace&apos;i sil</Button>
          </Group>
          <Group label="Durumlar">
            <Button
              variant="primary"
              loading={saving}
              onClick={() => {
                setSaving(true)
                window.setTimeout(() => setSaving(false), 1600)
              }}
            >
              {saving ? 'Kaydediliyor' : 'Kaydet (dene)'}
            </Button>
            <Button variant="primary" loading>
              Gönderiliyor
            </Button>
            <Button disabled>Devre dışı</Button>
            <Button variant="primary" disabledReason="Koltuk kalmadı: yöneticiden plan yükseltmesini iste">
              <UserPlus aria-hidden className="size-4.5" />
              Üye davet et
            </Button>
            <Button disabledReason="İndirme izni yok, sahibinden iste">
              <Download aria-hidden className="size-4.5" />
              İndir
            </Button>
            <Button asChild>
              <a href="#buttons">Bağlantı olarak düğme</a>
            </Button>
          </Group>
          <Group label="Odak görünürlüğü">
            <Button>Tab ile odaklan</Button>
            <IconButton label="Odaklanabilir simge">
              <Share2 aria-hidden className="size-4.5" />
            </IconButton>
          </Group>
          <Group label="Simge düğmeleri (etiket zorunlu; ipucu olarak da görünür)">
            <IconButton label="Diğer eylemler">
              <EllipsisVertical aria-hidden className="size-4.5" />
            </IconButton>
            <IconButton label="Yeniden dene" variant="secondary">
              <RotateCw aria-hidden className="size-4.5" />
            </IconButton>
            <IconButton label="Paylaş" variant="primary">
              <Share2 aria-hidden className="size-4.5" />
            </IconButton>
            <IconButton label="Sil" size="sm" disabledReason="Çöp kutusu boş">
              <Trash2 aria-hidden className="size-4.5" />
            </IconButton>
          </Group>
          <Group label="Bağlantı">
            <p className="text-md">
              Bu proje yalnızca davetlilere açık.{' '}
              <TextLink href="#buttons">Tüm ekibe aç</TextLink>
            </p>
          </Group>
        </Section>

        <Section id="forms" title="Form alanları" note="Alan etiketi, yardım ve hata metni `aria-describedby` ile kontrole bağlanır. Mobilde yazı 16 px, yükseklik 44 px.">
          <div className="grid gap-5 app:grid-cols-2">
            <Field label="Workspace adı" hint="Ekip üyeleri bu adı görür.">
              <Input defaultValue="Demir Makina" />
            </Field>
            <Field label="E-posta" error="Bu adres geçerli görünmüyor." required>
              <Input defaultValue="ayse@demirmakina" type="email" />
            </Field>
            <Field label="Parola" hint="En az 10 karakter.">
              <Input type="password" placeholder="Parolan" autoComplete="new-password" />
            </Field>
            <Field label="Kilitli alan">
              <Input disabled defaultValue="Yalnızca sahibi değiştirir" />
            </Field>
            <Field label="Yükleniyor (iskelet)">
              <Skeleton className="h-11 w-full rounded-md app:h-10" />
            </Field>
            <Field label="Mesaj" optionalLabel="isteğe bağlı" className="app:col-span-2">
              <Textarea defaultValue="Merhaba, flanşın son sürümü burada. Teklifinizi 28 Kasım Cuma'ya kadar bekliyoruz." />
            </Field>
          </div>
          <Group label="E-posta ekleme (Enter, virgül, boşluk ya da odak kaybı ekler; Backspace sonuncuyu siler)" className="max-w-xl">
            <div className="w-full">
              <Field label="Kime" {...(emailError ? { error: emailError } : { hint: 'Birden fazla adresi yapıştırabilirsin.' })}>
                <ChipsInput
                  value={emails}
                  onValueChange={(next) => {
                    setEmails(next)
                    setEmailError(undefined)
                  }}
                  onReject={() => setEmailError('Bu adres geçerli görünmüyor.')}
                />
              </Field>
            </div>
          </Group>
        </Section>

        <Section id="choices" title="Seçimler">
          <div className="grid gap-6 app:grid-cols-2">
            <Group label="Açılır liste: form" className="grid gap-5">
              <Field label="Erişim">
                <Select value={selectValue} onValueChange={setSelectValue} options={accessOptions} placeholder="Seç" />
              </Field>
              <Field label="Bildirim">
                <Select
                  defaultValue="mail"
                  options={[
                    { value: 'mail', label: 'E-posta gönder' },
                    { value: 'none', label: 'Gönderme' },
                  ]}
                />
              </Field>
              <Field label="Rol (hata durumu)" error="Bir erişim düzeyi seçmelisin.">
                <Select placeholder="Rol seç" options={accessOptions} />
              </Field>
              <Field label="Kilitli seçim">
                <Select disabled defaultValue="download" options={accessOptions} />
              </Field>
            </Group>
            <Group label="Açılır liste: satır içi" className="flex flex-wrap items-center gap-2">
              <Select variant="inline" aria-label="Erişim düzeyi" value={selectValue} onValueChange={setSelectValue} options={accessOptions} />
              <Select variant="inline" aria-label="Sırala" defaultValue="mod" options={[{ value: 'mod', label: 'Son değişiklik' }, { value: 'name', label: 'Ad' }]} />
            </Group>
          </div>

          <Group label="Kart seçimi (yön tuşlarıyla gezilir)" className="grid gap-2">
            <RadioCardGroup aria-label="Erişim" columns={2} value={access} onValueChange={setAccess}>
              <RadioCard value="view" title="Görüntüleyebilir" description="Modeli açar ve inceler" />
              <RadioCard value="comment" title="Yorum yapabilir" description="Ayrıca yorum yazar" />
              <RadioCard value="download" title="İndirebilir" description="Ayrıca dosyayı indirir" />
              <RadioCard value="edit" title="Düzenleyebilir" description="Misafirlere verilemez" disabled />
            </RadioCardGroup>
          </Group>

          <div className="grid gap-6 app:grid-cols-2">
            <Group label="Onay kutusu" className="grid">
              <CheckboxField label="Misafir olarak ekle" description="Koltuk kullanmaz, yalnızca bu dosyayı görür." checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
              <CheckboxField label="Devre dışı seçenek" disabled />
              <CheckboxField label="Kilitli seçenek (seçili)" disabled defaultChecked />
              <div className="flex items-center gap-3 text-md">
                <Checkbox aria-label="Satır seç" defaultChecked="indeterminate" /> Kısmi seçim
              </div>
            </Group>
            <Group label="Anahtar" className="grid divide-y divide-line">
              <SwitchRow label="Yeni yorum bildirimi" description="Dosyana yorum yazıldığında e-posta al." checked={notify} onCheckedChange={setNotify} />
              <SwitchRow label="Haftalık özet" description="Pazartesi sabahı gönderilir." />
              <SwitchRow label="İki adımlı doğrulama" description="Yalnızca şirket yöneticisi değiştirebilir." disabled checked={false} />
            </Group>
          </div>

          <Group label="Segment">
            <SegmentedControl
              aria-label="Görünüm"
              value={seg}
              onValueChange={setSeg}
              options={[
                { value: 'list', label: 'Liste' },
                { value: 'grid', label: 'Izgara' },
                { value: 'tree', label: 'Ağaç' },
              ]}
            />
            <div className="w-full max-w-sm">
              <SegmentedControl fullWidth aria-label="Tema" defaultValue="system" options={[{ value: 'light', label: 'Açık' }, { value: 'dark', label: 'Koyu' }, { value: 'system', label: 'Sistem' }]} />
            </div>
          </Group>
        </Section>

        <Section id="menus" title="Menüler" note="Yön tuşları gezer, Enter seçer, Escape kapatır. Devre dışı öğe nedenini ikinci satırda yazar ve odaklanabilir kalır.">
          <Group label="Erişim düzeyi menüsü">
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" className="border-line-strong">
                  {accessOptions.find((o) => o.value === level)?.label}
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuRadioGroup value={level} onValueChange={setLevel}>
                  <MenuRadioItem value="view" description="Modeli açar ve inceler">Görüntüleyebilir</MenuRadioItem>
                  <MenuRadioItem value="comment" description="Ayrıca yorum yazar">Yorum yapabilir</MenuRadioItem>
                  <MenuRadioItem value="download" description="Ayrıca dosyayı indirir">İndirebilir</MenuRadioItem>
                  <MenuRadioItem value="edit" disabledReason="Misafirler yükleyemez ve düzenleyemez">Düzenleyebilir</MenuRadioItem>
                </MenuRadioGroup>
                <MenuSeparator />
                <MenuItem icon={<Calendar />}>Erişim süresini değiştir</MenuItem>
                <MenuItem tone="danger" icon={<UserMinus />}>Projeden çıkar</MenuItem>
              </MenuContent>
            </Menu>
          </Group>
          <Group label="Eylem menüsü">
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="Diğer eylemler" variant="secondary">
                  <EllipsisVertical aria-hidden className="size-4.5" />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Dosya</MenuLabel>
                <MenuItem icon={<FolderOpen />}>Aç</MenuItem>
                <MenuItem icon={<Pencil />}>Adını değiştir</MenuItem>
                <MenuItem icon={<Link2 />} disabledReason="Paylaşım izni yok">Link oluştur</MenuItem>
                <MenuSeparator />
                <MenuItem tone="danger" icon={<Trash2 />}>Çöpe taşı</MenuItem>
              </MenuContent>
            </Menu>
          </Group>
          <Group label="Workspace değiştirici (statik veri)" className="grid gap-4 app:grid-cols-[var(--sidebar-w)_var(--sidebar-w)]">
            <div className="rounded-lg border border-line bg-surface p-3">
              <WorkspaceSwitcher
                workspaces={workspaces}
                value={workspace}
                onValueChange={setWorkspace}
                footer={
                  <>
                    <MenuItem icon={<Plus />}>Yeni workspace oluştur</MenuItem>
                  </>
                }
              />
            </div>
            <div className="flex items-center rounded-lg border border-line bg-bg p-1">
              <WorkspaceSwitcher variant="bar" workspaces={workspaces} value={workspace} onValueChange={setWorkspace} />
            </div>
          </Group>
        </Section>

        <Section id="dialogs" title="Pencereler" note="900 px üstünde ortada, altında alttan sayfa. Odak içeride kalır, Escape ve dışarı tıklama kapatır, odak tetikleyiciye döner.">
          <Group label="Paylaşım penceresi">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="primary">
                  <Share2 aria-hidden className="size-4.5" />
                  Paylaş
                </Button>
              </DialogTrigger>
              <DialogContent
                title="Kişi ekle"
                description="Flanş_DN100_rev3.step"
                footer={
                  <DialogFooter note="Misafir yalnızca bu dosyayı görür, koltuk kullanmaz.">
                    <DialogClose asChild>
                      <Button>Vazgeç</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button variant="primary" onClick={() => toast({ title: 'Davet gönderildi', tone: 'success' })}>
                        <Send aria-hidden className="size-4.5" />
                        Davet gönder
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                }
              >
                <Field label="Kime">
                  <ChipsInput value={emails} onValueChange={setEmails} />
                </Field>
                <div className="grid gap-1.5">
                  <span id="access-l" className="text-md font-medium app:text-base">Erişim</span>
                  <RadioCardGroup aria-labelledby="access-l" columns={2} value={access} onValueChange={setAccess}>
                    <RadioCard value="view" title="Görüntüleyebilir" description="Modeli açar ve inceler" />
                    <RadioCard value="comment" title="Yorum yapabilir" description="Ayrıca yorum yazar" />
                    <RadioCard value="download" title="İndirebilir" description="Ayrıca dosyayı indirir" />
                    <RadioCard value="edit" title="Düzenleyebilir" description="Misafirlere verilemez" disabled />
                  </RadioCardGroup>
                </div>
                <Field label="Mesaj" optionalLabel="isteğe bağlı">
                  <Textarea defaultValue="Merhaba, flanşın son sürümü burada." />
                </Field>
                <Notice tone="warn">2 kişi davet ediyorsun ama 1 boş koltuk var. Birini yorumcu olarak davet et ya da <TextLink href="#dialogs">planı yükselt</TextLink>.</Notice>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="danger-quiet">
                  <Trash2 aria-hidden className="size-4.5" />
                  Workspace&apos;i sil
                </Button>
              </DialogTrigger>
              <DialogContent
                title="Workspace silinsin mi?"
                description="Demir Makina, projeleri, dosyaları ve yorumları kalıcı olarak silinir. Bu işlem geri alınamaz."
                footer={
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button>Vazgeç</Button>
                    </DialogClose>
                    <Button variant="danger" disabledReason="Onay için workspace adını yaz">
                      <Trash2 aria-hidden className="size-4.5" />
                      Workspace&apos;i sil
                    </Button>
                  </DialogFooter>
                }
              >
                <Field label="Onay için workspace adını yaz" hint="Demir Makina">
                  <Input autoComplete="off" />
                </Field>
              </DialogContent>
            </Dialog>
          </Group>
        </Section>

        <Section id="feedback" title="Geri bildirim">
          <Group label="İpucu (odak ya da üzerine gelince)">
            <Tooltip content="Bağlantıyı kopyala">
              <Button>
                <Link2 aria-hidden className="size-4.5" />
                Kopyala
              </Button>
            </Tooltip>
          </Group>
          <Group label="Bildirim (toast): F8 ile odaklanır, kaydırarak kapanır">
            <Button onClick={() => toast({ title: 'Dosya yüklendi', description: 'Flanş_DN100_rev3.step · 12,4 MB', tone: 'success' })}>Başarı</Button>
            <Button onClick={() => toast({ title: '2 dosya çöpe taşındı', action: { label: 'Geri al', onClick: () => undefined } })}>Geri alınabilir</Button>
            <Button onClick={() => toast({ title: 'Yüklenemedi', description: 'Bu dosya türü desteklenmiyor.', tone: 'danger' })}>Hata</Button>
          </Group>
          <Group label="Satır içi not" className="grid max-w-2xl gap-3">
            <Notice>Dışarıdan biriyle yalnızca bir projeyi paylaşacaksan onu projeye misafir olarak ekle.</Notice>
            <Notice tone="warn">Bu projeyi tüm ekibe açarsan 12 kişi görür.</Notice>
            <Notice tone="success">Davet gönderildi.</Notice>
          </Group>
          <Group label="Hata kartı" className="grid">
            <InlineAlert
              title="Dosyalar yüklenemedi"
              action={
                <Button>
                  <RotateCw aria-hidden className="size-4.5" />
                  Yeniden dene
                </Button>
              }
            >
              Sunucuya ulaşılamadı. Bağlantını kontrol edip yeniden dene.
            </InlineAlert>
          </Group>
          <Group label="Boş durum (ilk dosya yükleme)" className="grid">
            <EmptyState
              icon={<Upload aria-hidden />}
              title="İlk dosyanı yükle"
              description="Bir CAD dosyasını bu sayfaya sürükle ya da seç. Ekibindeki herkes burada görecek."
              actions={
                <>
                  <Button variant="primary">
                    <Upload aria-hidden className="size-4.5" />
                    Dosya seç
                  </Button>
                  <Button>Örnek modeli aç</Button>
                </>
              }
              note="STEP, IGES, STL, OBJ, PLY ve 3MF · dosya başına 100 MB'a kadar"
            />
          </Group>
          <Group label="Arama ve filtre boş durumları" className="grid gap-4 app:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface p-4">
              <EmptyState
                icon={<Search aria-hidden />}
                title="'flanş' ile eşleşen dosya yok"
                description="Arama kriterlerini kontrol edip tekrar deneyin veya filtreleri temizleyin."
                actions={<Button onClick={() => undefined}>Aramayı temizle</Button>}
              />
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <EmptyState
                icon={<Eye aria-hidden />}
                title="Yıldızlı dosya yok"
                description="Bir dosyanın yanındaki yıldıza tıklayarak buraya ekleyebilirsiniz."
              />
            </div>
          </Group>
        </Section>

        <Section id="navigation" title="Gezinme">
          <Group label="Sekmeler (sayaçlı, panelli)" className="grid">
            <Tabs defaultValue="files">
              <TabsList aria-label="Proje">
                <TabsTrigger value="files" count={6}>Dosyalar</TabsTrigger>
                <TabsTrigger value="access" count={6}>Erişim</TabsTrigger>
                <TabsTrigger value="activity">Aktivite</TabsTrigger>
                <TabsTrigger value="settings" disabled>Ayarlar</TabsTrigger>
              </TabsList>
              <TabsContent value="files" className="py-4 text-md text-text-2">Proje dosyaları burada listelenir.</TabsContent>
              <TabsContent value="access" className="py-4 text-md text-text-2">Üyeler ve misafirler burada.</TabsContent>
              <TabsContent value="activity" className="py-4 text-md text-text-2">Son hareketler burada.</TabsContent>
              <TabsContent value="settings" className="py-4 text-md text-text-2">Ayarlar paneli.</TabsContent>
            </Tabs>
          </Group>
          <Group label="Sekmeler (sayfa bağlantısı)" className="grid">
            <TabNav aria-label="Filtre">
              <TabNavLink href="#navigation" current>Tümü</TabNavLink>
              <TabNavLink href="#navigation">Son açılanlar</TabNavLink>
              <TabNavLink href="#navigation">Yıldızlı</TabNavLink>
              <TabNavLink href="#navigation">Benim yüklediklerim</TabNavLink>
            </TabNav>
          </Group>
        </Section>

        <Section id="display" title="Gösterim">
          <Group label="Rozet">
            <Badge>Üye</Badge>
            <Badge tone="accent">güncel</Badge>
            <Badge tone="guest">Misafir</Badge>
            <Badge tone="warn">Koltuk kullanmaz</Badge>
            <Badge>
              <Eye aria-hidden />
              Yalnızca davetliler
            </Badge>
          </Group>
          <Group label="Avatar, yığın, workspace işareti">
            {people.slice(0, 5).map((p) => <Avatar key={p.name} name={p.name} size="lg" />)}
            <AvatarStack people={people} max={3} />
            <AvatarStack people={people} max={5} size="md" />
            <WorkspaceMark name="Demir Makina" />
            <WorkspaceMark name="Kaya Hidrolik" tone="warn" />
            <FileTile ext="STEP" />
          </Group>
          <Group label="Ölçü: depolama, koltuk (%90'dan uyarı, %100'de hata rengi)" className="grid max-w-md gap-4">
            <Meter value={153} max={5120} label="Depolama" valueText="153 MB / 5 GB" />
            <Meter value={4700} max={5120} label="Depolama" valueText="4,6 GB / 5 GB" />
            <Meter value={12} max={12} label="Koltuk" valueText="12 / 12 koltuk" />
          </Group>
          <Group label="İskelet (hareket azaltma açıksa durağan)" className="grid max-w-xl gap-3" >
            {['w-1/2', 'w-2/5', 'w-3/5'].map((w) => (
              <div key={w} className="flex items-center gap-3" aria-busy="true">
                <Skeleton className="size-10" />
                <Skeleton className={`h-2.5 ${w}`} />
                <Skeleton className="ml-auto h-2.5 w-16" />
              </div>
            ))}
          </Group>
          <Group label="Logo">
            <div className="flex items-center gap-6 rounded-lg bg-surface px-5 py-4">
              <Logo className="text-[36px]" />
              <Logo variant="mark" className="text-[36px]" />
            </div>
          </Group>
        </Section>

        <Section id="lists" title="Tablo ve liste" note="Semantik <table> ve CSS grid DataList. Masaüstünde tam sütunlar, 900 px altında duyarlı görünüm. Tüm durumlar: varsayılan dolu, yükleniyor (iskelet), boş, hata.">
          <Group label="Semantik tablo (varsayılan dolu durum)" className="grid">
            <div className="rounded-lg border border-line bg-bg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Üye</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Son etkinlik</TableHead>
                    <TableHead className="text-right">Eylemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <Avatar name="Ayşe Yılmaz" size="sm" decorative />
                        <span>Ayşe Yılmaz</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge tone="accent">Yönetici</Badge>
                    </TableCell>
                    <TableCell>ayse@demirmakina.com</TableCell>
                    <TableCell className="text-text-3">Aktif</TableCell>
                    <TableCell className="text-right">
                      <IconButton label="Ayşe Yılmaz: eylemler" size="sm">
                        <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <Avatar name="Mehmet Kaya" size="sm" decorative />
                        <span>Mehmet Kaya</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge>Üye</Badge>
                    </TableCell>
                    <TableCell>mehmet@demirmakina.com</TableCell>
                    <TableCell className="text-text-3">Bugün 09:05</TableCell>
                    <TableCell className="text-right">
                      <IconButton label="Mehmet Kaya: eylemler" size="sm">
                        <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <Avatar name="Can Demir" size="sm" decorative />
                        <span>Can Demir</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge tone="guest">Misafir</Badge>
                    </TableCell>
                    <TableCell>can@ozdokum.com.tr</TableCell>
                    <TableCell className="text-warn-text">Davet bekliyor</TableCell>
                    <TableCell className="text-right">
                      <IconButton label="Can Demir: eylemler" size="sm">
                        <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Group>

          <Group label="Tablo: yükleniyor durumu (iskelet)" className="grid">
            <div className="rounded-lg border border-line bg-bg" aria-busy="true">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Üye</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Son etkinlik</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3].map((i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="size-6.5 rounded-full" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Group>

          <Group label="Tablo: boş durum" className="grid">
            <div className="rounded-lg border border-line bg-bg p-8 text-center">
              <EmptyState
                icon={<UserMinus aria-hidden />}
                title="Henüz ekip üyesi yok"
                description="Ekip arkadaşlarınızı davet ederek CAD modelleri üzerinde birlikte çalışabilirsiniz."
                actions={
                  <Button variant="primary">
                    <UserPlus aria-hidden className="size-4.5" />
                    Üye davet et
                  </Button>
                }
              />
            </div>
          </Group>

          <Group label="Tablo: hata durumu" className="grid">
            <InlineAlert
              title="Üye listesi yüklenemedi"
              action={
                <Button>
                  <RotateCw aria-hidden className="size-4.5" />
                  Yeniden dene
                </Button>
              }
            >
              Sunucuya bağlanılamadı. Lütfen bağlantınızı kontrol edip tekrar deneyin.
            </InlineAlert>
          </Group>

          <Group label="Dosya listesi (DataList: masaüstü ızgara, mobil 2 satır)">
            <div className="w-full">
              <FilesTable
                files={files.slice(0, 4)}
                selected={selected}
                onSelectedChange={(id, on) =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (on) next.add(id)
                    else next.delete(id)
                    return next
                  })
                }
                onSelectAll={(all) => setSelected(all ? new Set(files.slice(0, 4).map((f) => f.id)) : new Set())}
              />
            </div>
          </Group>
        </Section>
      </main>
    </div>
  )
}
