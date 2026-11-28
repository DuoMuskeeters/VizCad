import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
// No Copy/Trash2 icons here: importing them into the admin chunk reshuffled the shared chunks and grew the public
// marketing JS by 1.8 kB gzip (measured, docs/12 6c-2 notes). Text buttons say the same.
import { ImagePlus } from 'lucide-react'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { EmptyState } from '#/components/ui/EmptyState'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import { type AdminAsset, type AdminAssetList, ASSET_UPLOAD, type AssetUsage, type UploadResult } from '#/shared/cmsTypes'
import { cmsCall, type CmsFailure, cmsUpload } from './api'
import { failureText } from './failures'
import { type AdminText, useAdminText } from './text'

type Prepared = { readonly ok: true; readonly blob: Blob } | { readonly ok: false; readonly message: (text: AdminText) => string }

const encode = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86))

/**
 * Client side before upload (docs/12 §7.3): SVG and other types are refused here with the reason; an image larger than
 * 1600 px on its longest side (or over 5 MB) is scaled down and re-encoded as WebP, or JPEG where the browser cannot
 * encode WebP (Safari). The server checks everything again.
 */
export const prepareImage = async (file: File): Promise<Prepared> => {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) return { ok: false, message: (t) => t.assets.svgRefused }
  if (!(ASSET_UPLOAD.types as ReadonlyArray<string>).includes(file.type)) return { ok: false, message: (t) => t.assets.typeRefused }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, message: (t) => t.assets.dimensions }
  }
  const side = Math.max(bitmap.width, bitmap.height)
  if (side <= ASSET_UPLOAD.scaleTo && file.size <= ASSET_UPLOAD.bytes) {
    bitmap.close()
    return { ok: true, blob: file }
  }
  const scale = Math.min(1, ASSET_UPLOAD.scaleTo / side)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const webp = await encode(canvas, 'image/webp')
  // A browser without a WebP encoder returns PNG instead: JPEG is smaller then.
  const blob = webp !== null && webp.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg')
  if (blob === null) return { ok: false, message: (t) => t.assets.dimensions }
  if (blob.size > ASSET_UPLOAD.bytes) return { ok: false, message: (t) => t.assets.tooLarge }
  return { ok: true, blob }
}

/** A file input behind a button; uploads one image and reports the stored asset. */
const UploadButton = ({ onUploaded }: { onUploaded: (asset: AdminAsset) => void }) => {
  const { text } = useAdminText()
  const { toast } = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (file === undefined) return
    setBusy(true)
    const prepared = await prepareImage(file)
    if (!prepared.ok) {
      setBusy(false)
      return toast({ title: prepared.message(text), tone: 'danger' })
    }
    const result = await cmsUpload<UploadResult>(prepared.blob)
    setBusy(false)
    if (!result.ok) return toast({ title: failureText(text, result), tone: 'danger' })
    toast({ title: result.data.duplicate ? text.assets.duplicate : text.assets.uploaded, tone: 'success' })
    onUploaded(result.data.asset)
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ASSET_UPLOAD.types.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <Button variant="primary" loading={busy} onClick={() => input.current?.click()}>
        <ImagePlus aria-hidden className="size-4" />
        {busy ? text.assets.uploading : text.assets.upload}
      </Button>
    </>
  )
}

type Library = { readonly status: 'loading' } | { readonly status: 'error'; readonly failure: CmsFailure } | { readonly status: 'ready'; readonly rows: ReadonlyArray<AdminAsset>; readonly next: string | null }

/** The image list with paging and a prepend for fresh uploads; shared by the screen and the picker. */
const useLibrary = () => {
  const [library, setLibrary] = useState<Library>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLibrary({ status: 'loading' })
    void cmsCall<AdminAssetList>('listAssets').then((result) => {
      if (!cancelled) setLibrary(result.ok ? { status: 'ready', rows: result.data.rows, next: result.data.next } : { status: 'error', failure: result })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])
  const more = useCallback(async () => {
    if (library.status !== 'ready' || library.next === null) return
    const result = await cmsCall<AdminAssetList>('listAssets', { cursor: library.next })
    if (result.ok) setLibrary({ status: 'ready', rows: [...library.rows, ...result.data.rows], next: result.data.next })
  }, [library])
  const add = (asset: AdminAsset) => setLibrary((l) => (l.status === 'ready' ? { ...l, rows: [asset, ...l.rows.filter((r) => r.id !== asset.id)] } : l))
  const replace = (asset: AdminAsset | null, id: string) =>
    setLibrary((l) => (l.status === 'ready' ? { ...l, rows: asset === null ? l.rows.filter((r) => r.id !== id) : l.rows.map((r) => (r.id === id ? asset : r)) } : l))
  return { library, more, add, replace, retry: () => setAttempt((n) => n + 1) }
}

const kb = (bytes: number) => Math.max(1, Math.round(bytes / 1024))

const LibraryState = ({ library, retry, children }: { library: Library; retry: () => void; children: (rows: ReadonlyArray<AdminAsset>) => ReactNode }) => {
  const { text } = useAdminText()
  if (library.status === 'loading')
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 app:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full" />
        ))}
      </div>
    )
  if (library.status === 'error') return <InlineAlert title={failureText(text, library.failure)} action={<Button onClick={retry}>{text.gate.retry}</Button>} />
  if (library.rows.length === 0) return <EmptyState icon={<ImagePlus />} title={text.assets.empty} />
  return <>{children(library.rows)}</>
}

/** `/admin/cms/assets` (docs/12 §9 "Görseller"): preview, size, alt text, where used, copy URL, delete when unused. */
export const AssetsPage = () => {
  const { text } = useAdminText()
  const { library, more, add, replace, retry } = useLibrary()
  const [open, setOpen] = useState<AdminAsset | null>(null)
  return (
    <>
      <PageHeader title={text.assets.title} actions={<UploadButton onUploaded={add} />} />
      <LibraryState library={library} retry={retry}>
        {(rows) => (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 app:grid-cols-4">
            {rows.map((asset) => (
              <li key={asset.id}>
                <button type="button" onClick={() => setOpen(asset)} className="grid w-full gap-1.5 rounded-md border border-line p-2 text-left hover:border-line-strong focus-visible:border-accent">
                  <img src={asset.url} alt={asset.alt ?? ''} loading="lazy" className="aspect-[4/3] w-full rounded-sm bg-surface object-contain" />
                  <span className="flex flex-wrap items-center justify-between gap-1 text-sm text-text-2">
                    <span>{text.assets.size(asset.width, asset.height, kb(asset.bytes))}</span>
                    <Badge tone={asset.inUse ? 'accent' : 'neutral'}>{asset.inUse ? text.assets.inUse : text.assets.unused}</Badge>
                  </span>
                  <span className="truncate text-sm text-text">{asset.alt ?? '–'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </LibraryState>
      {library.status === 'ready' && library.next !== null ? (
        <Button className="mt-4" onClick={() => void more()}>
          {text.assets.more}
        </Button>
      ) : null}
      {open === null ? null : (
        <AssetDetail
          key={open.id}
          asset={open}
          onClose={() => setOpen(null)}
          onChanged={(asset) => {
            replace(asset, open.id)
            setOpen(asset)
          }}
          onDeleted={() => {
            replace(null, open.id)
            setOpen(null)
          }}
        />
      )}
    </>
  )
}

/** One image: alt text, where it is used, copy URL, delete (disabled with the reason while used). */
const AssetDetail = ({ asset, onClose, onChanged, onDeleted }: { asset: AdminAsset; onClose: () => void; onChanged: (asset: AdminAsset) => void; onDeleted: () => void }) => {
  const { text } = useAdminText()
  const { toast } = useToast()
  const [alt, setAlt] = useState(asset.alt ?? '')
  const [usage, setUsage] = useState<AssetUsage | null>(null)
  const [busy, setBusy] = useState<'alt' | 'delete' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let cancelled = false
    void cmsCall<AssetUsage>('assetUsage', { assetId: asset.id }).then((result) => {
      if (!cancelled && result.ok) setUsage(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [asset.id])

  const saveAlt = async () => {
    setBusy('alt')
    const result = await cmsCall<{ alt: string | null }>('updateAssetAlt', { assetId: asset.id, alt })
    setBusy(null)
    if (!result.ok) return toast({ title: failureText(text, result), tone: 'danger' })
    toast({ title: text.assets.altSaved, tone: 'success' })
    onChanged({ ...asset, alt: result.data.alt })
  }

  const remove = async () => {
    setBusy('delete')
    const result = await cmsCall<unknown>('deleteAsset', { assetId: asset.id })
    setBusy(null)
    setConfirmDelete(false)
    if (!result.ok) return toast({ title: failureText(text, result), tone: 'danger' })
    toast({ title: text.assets.deleted, tone: 'success' })
    onDeleted()
  }

  const copy = async () => {
    const url = new URL(asset.url, window.location.origin).href
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: text.assets.copied, tone: 'success' })
    } catch {
      toast({ title: url, tone: 'neutral' })
    }
  }

  const used = usage === null ? asset.inUse : usage.places.length > 0
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent title={asset.alt ?? text.assets.title} closeLabel={text.picker.close} className="app:max-w-160">
        <div className="grid gap-4 pb-4">
          <img src={asset.url} alt={asset.alt ?? ''} className="max-h-80 w-full rounded-md border border-line bg-surface object-contain" />
          <p className="text-sm text-text-2">{`${text.assets.size(asset.width, asset.height, kb(asset.bytes))} · ${asset.mime}`}</p>
          <Field label={text.assets.alt} hint={text.assets.altHint}>
            <Input value={alt} maxLength={ASSET_UPLOAD.alt} onChange={(e) => setAlt(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveAlt()} loading={busy === 'alt'} {...(alt === (asset.alt ?? '') ? { disabledReason: text.editor.saved } : {})}>
              {text.assets.saveAlt}
            </Button>
            <Button onClick={() => void copy()}>
              {text.assets.copy}
            </Button>
            <Button variant="danger-quiet" onClick={() => setConfirmDelete(true)} {...(used ? { disabledReason: text.assets.inUseReason } : {})}>
              {text.assets.delete}
            </Button>
          </div>
          {usage !== null && usage.places.length > 0 ? (
            <div className="grid gap-1 text-sm">
              <p className="font-medium text-text">{text.assets.usedIn}</p>
              <ul className="list-disc pl-5 text-text-2">
                {usage.places.map((place) => (
                  <li key={place}>{text.assets.places[place] ?? place}</li>
                ))}
                {usage.posts.map((post) => (
                  <li key={post.id}>
                    <a className="underline" href={`/admin/cms/posts/${encodeURIComponent(post.id)}`}>
                      {post.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <Dialog open={confirmDelete} onOpenChange={(o) => (o ? null : setConfirmDelete(false))}>
          <DialogContent
            title={text.assets.delete}
            closeLabel={text.picker.close}
            footer={
              <DialogFooter>
                <Button onClick={() => setConfirmDelete(false)}>{text.list.cancel}</Button>
                <Button variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>
                  {text.editor.confirm}
                </Button>
              </DialogFooter>
            }
          >
            <p>{text.assets.deleteConfirm}</p>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The image picker (cover, OG image, avatar, inline images): the library with upload; picking returns the asset. With
 * `askAlt`, picking asks the alt text first (inline images need one, docs/12 §7.3).
 */
export const AssetPicker = ({ open, onClose, onPick, askAlt = false }: { open: boolean; onClose: () => void; onPick: (asset: AdminAsset, alt: string) => void; askAlt?: boolean }) => {
  const { text } = useAdminText()
  const { library, more, retry } = useLibrary()
  const [chosen, setChosen] = useState<AdminAsset | null>(null)
  const [alt, setAlt] = useState('')
  const choose = (asset: AdminAsset) => {
    if (!askAlt) return onPick(asset, asset.alt ?? '')
    setChosen(asset)
    setAlt(asset.alt ?? '')
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent
        title={text.assets.pickTitle}
        closeLabel={text.picker.close}
        className="app:max-w-200"
        footer={
          chosen === null ? undefined : (
            <DialogFooter>
              <Button onClick={() => setChosen(null)}>{text.list.cancel}</Button>
              <Button variant="primary" onClick={() => onPick(chosen, alt.trim())} {...(alt.trim() === '' ? { disabledReason: text.errors.required } : {})}>
                {text.assets.insert}
              </Button>
            </DialogFooter>
          )
        }
      >
        {chosen === null ? (
          <div className="grid gap-4 pb-4">
            <div>
              <UploadButton onUploaded={choose} />
            </div>
            <LibraryState library={library} retry={retry}>
              {(rows) => (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {rows.map((asset) => (
                    <li key={asset.id}>
                      <button type="button" onClick={() => choose(asset)} className="grid w-full gap-1 rounded-md border border-line p-1.5 text-left hover:border-line-strong focus-visible:border-accent">
                        <img src={asset.url} alt={asset.alt ?? ''} loading="lazy" className="aspect-[4/3] w-full rounded-sm bg-surface object-contain" />
                        <span className="truncate text-sm text-text-2">{asset.alt ?? text.assets.size(asset.width, asset.height, kb(asset.bytes))}</span>
                        <span className="sr-only">{text.assets.use}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </LibraryState>
            {library.status === 'ready' && library.next !== null ? <Button onClick={() => void more()}>{text.assets.more}</Button> : null}
          </div>
        ) : (
          <div className="grid gap-4 pb-4">
            <img src={chosen.url} alt="" className="max-h-60 w-full rounded-md border border-line bg-surface object-contain" />
            <Field label={text.assets.insertAlt} hint={text.assets.altHint}>
              <Input value={alt} maxLength={ASSET_UPLOAD.alt} onChange={(e) => setAlt(e.target.value)} autoFocus />
            </Field>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A small "choose / remove" control with the chosen image's preview (cover, OG, avatar). */
export const ImageField = ({
  label,
  hint,
  image,
  chooseLabel,
  removeLabel,
  emptyLabel,
  onPick,
  onRemove,
  aspect = 'aspect-[1200/630]',
}: {
  label: string
  hint?: string
  image: { readonly url: string } | null
  chooseLabel: string
  removeLabel: string
  emptyLabel: string
  onPick: (asset: AdminAsset) => void
  onRemove: () => void
  aspect?: string
}) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-1.5">
      <span className="text-md font-medium app:text-base">{label}</span>
      {image === null ? <p className="text-sm text-text-3">{emptyLabel}</p> : <img src={image.url} alt="" loading="lazy" className={`${aspect} w-full rounded-md border border-line bg-surface object-cover`} />}
      {hint === undefined ? null : <p className="text-sm text-text-3">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen(true)}>{chooseLabel}</Button>
        {image === null ? null : (
          <Button variant="ghost" onClick={onRemove}>
            {removeLabel}
          </Button>
        )}
      </div>
      <AssetPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={(asset) => {
          setOpen(false)
          onPick(asset)
        }}
      />
    </div>
  )
}

