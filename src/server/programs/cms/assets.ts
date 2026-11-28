/**
 * CMS images behind `/api/cms` (docs/12 §3.2 "Görseller", §7.3): upload, list, alt text, usage and delete. Callers are
 * platform admins (http/cms.ts and http/cmsAssets.ts check `canManageContent` first).
 *
 * - **Upload.** The magic bytes decide the type: PNG, JPEG or WebP only (SVG and the rest `UnsupportedFileType`); the
 *   size comes from the header and is capped (`ASSET_LIMITS`). The same bytes (SHA-256) are stored once: a second
 *   upload returns the first image. R2 gets the right `contentType`, so `/api/blog/image` (and the legacy Worker, which
 *   reads the same metadata) serves it with its own type.
 * - **URLs** keep the legacy shape `/api/blog/image/{encodeURIComponent(r2Key)}` with keys under `blog/a/`, the prefix
 *   the deletion worker never touches: a rollback to the old Worker keeps every new image working.
 * - **Delete** is refused while the image is used anywhere (`AssetInUse`): drafts, live translations, legal texts, page
 *   SEO, settings, author avatars, and the legacy `posts.content` / `posts.coverImage` text. Text columns are searched
 *   for both the raw and the URL-encoded key, variants included.
 */
import { desc, eq, lt, sql, type SQL } from 'drizzle-orm'
import { Effect } from 'effect'
import type { AdminAsset, AdminAssetList, AssetUsage, UploadResult } from '#/shared/cmsTypes'
import { ASSET_EXTENSION, ASSET_LIMITS, readImageInfo } from '../../cms/imageInfo'
import { blogImageUrl } from '../../cms/markdown'
import * as schema from '../../db/schema'
import { AssetInUse, AssetUnavailable, InvalidAsset, PayloadTooLarge, TextTooLong, UnsupportedFileType, WriteConflict } from '../../errors'
import { Db } from '../../services/Db'
import { Storage } from '../../services/Storage'
import { fromUnixSeconds, toUnixSeconds } from '../../time'
import { newUlid, nowSeconds, runBatch } from '../shared'
import type { Actor } from './posts'

const ca = schema.cmsAssets
type AssetRow = typeof schema.cmsAssets.$inferSelect

export const ASSET_ALT_MAX = 200
export const ASSET_PAGE_SIZE = 60

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
const sha256 = (bytes: Uint8Array) => Effect.promise(() => crypto.subtle.digest('SHA-256', bytes.slice())).pipe(Effect.map(hex))

const toAdmin = (row: AssetRow, inUse: boolean): AdminAsset => ({
  id: row.id,
  url: blogImageUrl(row.r2Key),
  mime: row.mime,
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  alt: row.alt,
  createdAt: toUnixSeconds(row.createdAt),
  inUse,
})

// ---------------------------------------------------------------------------------------------------------------------
// Usage

/** `instr(column, needle) > 0` for any needle (no LIKE: legacy keys may hold `_` or `%`). NULL columns never match. */
const contains = (column: string, needles: ReadonlyArray<SQL>) => sql.join(needles.map((n) => sql`instr(${sql.raw(column)}, ${n}) > 0`), sql` OR `)

/**
 * One SQL condition per place for an asset given as SQL (`id`, and the text needles: raw and encoded keys). Used both
 * per row of the list (correlated to the asset row) and for one asset before delete.
 */
const usageConditions = (id: SQL, needles: ReadonlyArray<SQL>): ReadonlyArray<readonly [string, SQL]> => [
  ['post', sql`EXISTS (SELECT 1 FROM "posts" x WHERE x."coverAssetId" = ${id} OR ${contains('x."content"', needles)} OR ${contains('x."coverImage"', needles)})`],
  ['translation', sql`EXISTS (SELECT 1 FROM "post_translations" x WHERE x."ogAssetId" = ${id} OR ${contains('x."contentMd"', needles)})`],
  ['draft', sql`EXISTS (SELECT 1 FROM "post_drafts" x WHERE x."ogAssetId" = ${id} OR ${contains('x."contentMd"', needles)})`],
  ['legal', sql`EXISTS (SELECT 1 FROM "legal_documents" x WHERE ${contains('x."contentMd"', needles)})`],
  ['pageSeo', sql`EXISTS (SELECT 1 FROM "page_seo" x WHERE x."ogAssetId" = ${id} OR x."draftOgAssetId" = ${id})`],
  ['author', sql`EXISTS (SELECT 1 FROM "author_profiles" x WHERE x."avatarAssetId" = ${id} OR ${contains('x."avatarUrl"', needles)})`],
  // Settings hold asset ids (`organization.logoAssetId`, `defaultOg.*`) or URLs inside a JSON value.
  ['setting', sql`EXISTS (SELECT 1 FROM "site_settings" x WHERE instr(x."value", ${id}) > 0 OR ${contains('x."value"', needles)})`],
]

/** Every key of the asset (the original and its variants), raw and as the legacy URL encodes it. */
const needlesOf = (row: AssetRow) => {
  const keys = [row.r2Key, ...Object.values(row.variants ?? {})]
  return [...new Set(keys.flatMap((key) => [key, encodeURIComponent(key)]))].map((value) => sql`${value}`)
}

/** Correlated to the list's asset row: our keys are `blog/a/{ulid}.{ext}`, so encoding only turns `/` into `%2F`. */
const listNeedles = [sql`${ca.r2Key}`, sql`replace(${ca.r2Key}, '/', '%2F')`]
const inUseSql = sql<number>`(${sql.join(usageConditions(sql`${ca.id}`, listNeedles).map(([, condition]) => sql`(${condition})`), sql` OR `)})`

const requireRow = Effect.fnUntraced(function* (assetId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) => d.select().from(ca).where(eq(ca.id, assetId)).limit(1))
  const row = rows[0]
  if (row === undefined) return yield* new AssetUnavailable()
  return row
})

const usageOf = Effect.fnUntraced(function* (row: AssetRow) {
  const db = yield* Db
  const id = sql`${row.id}`
  const needles = needlesOf(row)
  const conditions = usageConditions(id, needles)
  const p = schema.posts
  const [flags, posts] = yield* db.use((d) =>
    d.batch([
      d.select(Object.fromEntries(conditions.map(([place, condition]) => [place, sql<number>`${condition}`.as(place)]))).from(sql`(SELECT 1)`),
      d
        .select({ id: p.id, title: p.title })
        .from(p)
        .where(
          sql`${p.coverAssetId} = ${id} OR ${contains('"posts"."content"', needles)} OR ${contains('"posts"."coverImage"', needles)}
            OR EXISTS (SELECT 1 FROM "post_translations" x WHERE x."postId" = ${p.id} AND (x."ogAssetId" = ${id} OR ${contains('x."contentMd"', needles)}))
            OR EXISTS (SELECT 1 FROM "post_drafts" x WHERE x."postId" = ${p.id} AND (x."ogAssetId" = ${id} OR ${contains('x."contentMd"', needles)}))`,
        )
        .orderBy(desc(p.updatedAt))
        .limit(20),
    ]),
  )
  const flagRow = (flags[0] ?? {}) as Record<string, number>
  return { places: conditions.map(([place]) => place).filter((place) => Number(flagRow[place] ?? 0) > 0), posts } satisfies AssetUsage
})

/** `assetUsage(assetId)`: where the image is used (the grid's "used in" list). */
export const assetUsage = Effect.fn('assetUsage')(function* (input: { readonly assetId: string }) {
  return yield* usageOf(yield* requireRow(input.assetId))
})

// ---------------------------------------------------------------------------------------------------------------------
// Reads and writes

/** `listAssets`: newest first (ULID ids sort by creation), 60 per page, each with whether it is used. */
export const listAssets = Effect.fn('listAssets')(function* (input: { readonly cursor?: string | undefined }) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d
      .select({ asset: ca, inUse: inUseSql.as('inUse') })
      .from(ca)
      .where(input.cursor === undefined ? undefined : lt(ca.id, input.cursor))
      .orderBy(desc(ca.id))
      .limit(ASSET_PAGE_SIZE + 1),
  )
  const page = rows.slice(0, ASSET_PAGE_SIZE)
  return {
    rows: page.map((r) => toAdmin(r.asset, Number(r.inUse) > 0)),
    next: rows.length > ASSET_PAGE_SIZE ? (page.at(-1)?.asset.id ?? null) : null,
  } satisfies AdminAssetList
})

/**
 * `uploadAsset(bytes)`: checks the bytes (type by magic bytes, header size, caps), dedupes by SHA-256, puts the object
 * to R2 under `blog/a/{ulid}.{ext}` with its content type, then writes the `cms_assets` row. A concurrent upload of the
 * same bytes that wins the row keeps its object; ours is removed and the winner returned.
 */
export const uploadAsset = Effect.fn('uploadAsset')(function* (input: { readonly bytes: Uint8Array; readonly alt?: string | null }, actor: Actor) {
  const { bytes } = input
  if (bytes.length === 0) return yield* new InvalidAsset({ reason: 'empty' })
  if (bytes.length > ASSET_LIMITS.bytes) return yield* new PayloadTooLarge()
  const alt = input.alt?.trim() || null
  if (alt !== null && alt.length > ASSET_ALT_MAX) return yield* new TextTooLong({ field: 'alt', max: ASSET_ALT_MAX })
  const info = readImageInfo(bytes)
  if (!info.ok) return yield* info.reason === 'type' ? new UnsupportedFileType() : new InvalidAsset({ reason: 'dimensions' })
  const digest = yield* sha256(bytes)
  const db = yield* Db
  const bySha = (sha: string) => db.use((d) => d.select().from(ca).where(eq(ca.sha256, sha)).limit(1)).pipe(Effect.map((r) => r[0]))
  const existing = yield* bySha(digest)
  if (existing !== undefined) return { asset: toAdmin(existing, false), duplicate: true } satisfies UploadResult

  const id = yield* newUlid
  const r2Key = `blog/a/${id}.${ASSET_EXTENSION[info.mime]}`
  const storage = yield* Storage
  yield* storage.put(r2Key, bytes, { contentType: info.mime })
  const now = fromUnixSeconds(yield* nowSeconds)
  const row: AssetRow = { id, r2Key, mime: info.mime, bytes: bytes.length, width: info.width, height: info.height, sha256: digest, variants: null, alt, createdAt: now, createdByUserId: actor.userId }
  // The only statement has no guard: a WriteConflict here is the sha256 unique key (another upload won).
  const raced = yield* runBatch((d) => [d.insert(ca).values(row)], [['cms_assets.sha256', () => new WriteConflict()]]).pipe(
    Effect.as(false),
    Effect.catchTag('WriteConflict', () => Effect.succeed(true)),
  )
  if (!raced) return { asset: toAdmin(row, false), duplicate: false } satisfies UploadResult
  yield* storage.delete([r2Key]).pipe(Effect.ignore)
  const winner = yield* bySha(digest)
  if (winner === undefined) return yield* new AssetUnavailable()
  return { asset: toAdmin(winner, false), duplicate: true } satisfies UploadResult
})

/** `updateAssetAlt(assetId, alt)`: the default (English) alt text offered when the image is placed. */
export const updateAssetAlt = Effect.fn('updateAssetAlt')(function* (input: { readonly assetId: string; readonly alt: string | null }) {
  const alt = input.alt?.trim() || null
  if (alt !== null && alt.length > ASSET_ALT_MAX) return yield* new TextTooLong({ field: 'alt', max: ASSET_ALT_MAX })
  const row = yield* requireRow(input.assetId)
  yield* runBatch((d) => [d.update(ca).set({ alt }).where(eq(ca.id, row.id))])
  return { alt }
})

/**
 * `deleteAsset(assetId)`: refused while used (`AssetInUse` lists the places). The row goes first, then the R2 objects
 * (original and variants); an R2 failure leaves an unreferenced object under `blog/`, never a broken image.
 */
export const deleteAsset = Effect.fn('deleteAsset')(function* (input: { readonly assetId: string }) {
  const row = yield* requireRow(input.assetId)
  const usage = yield* usageOf(row)
  if (usage.places.length > 0) return yield* new AssetInUse({ places: usage.places })
  yield* runBatch((d) => [d.delete(ca).where(eq(ca.id, row.id))])
  const storage = yield* Storage
  yield* storage.delete([row.r2Key, ...Object.values(row.variants ?? {})]).pipe(
    Effect.catch(() => Effect.logWarning('cms asset object delete failed').pipe(Effect.annotateLogs({ asset: row.id }))),
  )
  return { deleted: true }
})
