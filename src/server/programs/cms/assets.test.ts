import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { ASSET_LIMITS } from '../../cms/imageInfo'
import * as schema from '../../db/schema'
import * as AppConfig from '../../services/AppConfig'
import { memoryWith } from '../../services/Cache'
import { Db } from '../../services/Db'
import * as DbMemory from '../../services/Db.memory'
import * as Storage from '../../services/Storage'
import { seedAuthor, seedPost } from '../../testing/blog'
import { jpegBytes, pngBytes, svgBytes, webpBytes } from '../../testing/cmsImages'
import { rows, T0 } from '../../testing/fixtures'
import { assetUsage, deleteAsset, listAssets, updateAssetAlt, uploadAsset } from './assets'

const actor = { userId: 'ada' }
const layer = Layer.mergeAll(DbMemory.memory, memoryWith({}), Storage.memory).pipe(Layer.provideMerge(AppConfig.test()))

const run = <A, E, R extends Db | Storage.Storage | Storage.MemoryStorageControl | AppConfig.AppConfig>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(seedAuthor('ada')), Effect.andThen(body), Effect.provide(layer))

const tagOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.flip, Effect.map((e) => e._tag))
const keys = Storage.MemoryStorageControl.use((c) => c.keys)
const exec = (statement: (d: Parameters<Parameters<Db['Service']['use']>[0]>[0]) => Promise<unknown>) => Db.use((db) => db.use(statement))

describe('uploadAsset', () => {
  it.effect('stores PNG, JPEG and WebP under blog/a/ with their content type and returns the legacy URL', () =>
    run(Effect.gen(function* () {
      const png = yield* uploadAsset({ bytes: pngBytes(1600, 900) }, actor)
      const jpg = yield* uploadAsset({ bytes: jpegBytes(800, 600) }, actor)
      const webp = yield* uploadAsset({ bytes: webpBytes(1200, 630) }, actor)
      assert.isFalse(png.duplicate)
      const [pngRow] = (yield* rows('cmsAssets')).filter((r) => r.id === png.asset.id)
      assert.match(pngRow?.r2Key ?? '', /^blog\/a\/[0-9A-HJKMNP-TV-Z]{26}\.png$/)
      assert.strictEqual(png.asset.url, `/api/blog/image/${encodeURIComponent(pngRow?.r2Key ?? '')}`)
      assert.deepStrictEqual([png.asset.width, png.asset.height, png.asset.mime], [1600, 900, 'image/png'])
      assert.strictEqual(jpg.asset.mime, 'image/jpeg')
      assert.match(jpg.asset.url, /\.jpg$/)
      assert.strictEqual(webp.asset.mime, 'image/webp')
      const storage = yield* Storage.Storage
      const head = yield* storage.head(pngRow?.r2Key ?? '')
      assert.strictEqual(head._tag === 'Some' ? head.value.contentType : null, 'image/png')
      assert.strictEqual((yield* keys).length, 3)
      assert.strictEqual(pngRow?.createdByUserId, 'ada')
    })))

  it.effect('dedupes by SHA-256: the same bytes return the first image and store nothing new', () =>
    run(Effect.gen(function* () {
      const first = yield* uploadAsset({ bytes: pngBytes(100, 100, 1) }, actor)
      const again = yield* uploadAsset({ bytes: pngBytes(100, 100, 1) }, actor)
      const other = yield* uploadAsset({ bytes: pngBytes(100, 100, 2) }, actor)
      assert.isTrue(again.duplicate)
      assert.strictEqual(again.asset.id, first.asset.id)
      assert.notStrictEqual(other.asset.id, first.asset.id)
      assert.strictEqual((yield* rows('cmsAssets')).length, 2)
      assert.strictEqual((yield* keys).length, 2)
    })))

  it.effect('refuses SVG and other types (415), oversized or unreadable images (422), empty and over-cap bodies', () =>
    run(Effect.gen(function* () {
      assert.strictEqual(yield* tagOf(uploadAsset({ bytes: svgBytes }, actor)), 'UnsupportedFileType')
      assert.strictEqual(yield* tagOf(uploadAsset({ bytes: new TextEncoder().encode('<html>') }, actor)), 'UnsupportedFileType')
      assert.strictEqual(yield* tagOf(uploadAsset({ bytes: pngBytes(5000, 10) }, actor)), 'InvalidAsset')
      assert.strictEqual(yield* tagOf(uploadAsset({ bytes: pngBytes(4096, 4096) }, actor)), 'InvalidAsset')
      assert.strictEqual(yield* tagOf(uploadAsset({ bytes: new Uint8Array(0) }, actor)), 'InvalidAsset')
      const big = new Uint8Array(ASSET_LIMITS.bytes + 1)
      big.set(pngBytes(10, 10))
      assert.strictEqual(yield* tagOf(uploadAsset({ bytes: big }, actor)), 'PayloadTooLarge')
      assert.strictEqual(yield* tagOf(uploadAsset({ bytes: pngBytes(10, 10), alt: 'x'.repeat(201) }, actor)), 'TextTooLong')
      assert.strictEqual((yield* rows('cmsAssets')).length, 0)
      assert.strictEqual((yield* keys).length, 0)
    })))
})

describe('asset usage and delete', () => {
  /** Uploads an image and returns its id, key and URL. */
  const uploaded = (salt: number) =>
    uploadAsset({ bytes: pngBytes(200, 100, salt) }, actor).pipe(
      Effect.map(({ asset }) => ({ id: asset.id, url: asset.url, key: decodeURIComponent(asset.url.slice('/api/blog/image/'.length)) })),
    )

  it.effect('an unused image is deleted with its R2 object; a missing id is AssetUnavailable', () =>
    run(Effect.gen(function* () {
      const a = yield* uploaded(1)
      assert.deepStrictEqual(yield* assetUsage({ assetId: a.id }), { places: [], posts: [] })
      yield* deleteAsset({ assetId: a.id })
      assert.strictEqual((yield* rows('cmsAssets')).length, 0)
      assert.deepStrictEqual(yield* keys, [])
      assert.strictEqual(yield* tagOf(deleteAsset({ assetId: a.id })), 'AssetUnavailable')
    })))

  it.effect('every place counts: drafts, live translations, legal texts, page SEO, settings, avatars, legacy content and cover', () =>
    run(Effect.gen(function* () {
      yield* seedPost({ id: 'p1', slug: 'one' })
      const cases: ReadonlyArray<readonly [string, (img: { id: string; url: string; key: string }) => Effect.Effect<unknown, unknown, Db>]> = [
        ['draft', (img) => exec((d) => d.insert(schema.postDrafts).values({ postId: 'p1', locale: 'tr', slug: 'bir', title: 'T', excerpt: '', contentMd: `![x](${img.url})`, revision: 1, updatedAt: new Date(T0 * 1000) }))],
        ['draft', (img) => exec((d) => d.insert(schema.postDrafts).values({ postId: 'p1', locale: 'de', slug: 'ein', title: 'T', excerpt: '', contentMd: 'no image', ogAssetId: img.id, revision: 1, updatedAt: new Date(T0 * 1000) }))],
        ['translation', (img) => exec((d) => d.update(schema.postTranslations).set({ contentMd: `raw key ${img.key}` }).where(eq(schema.postTranslations.postId, 'p1')))],
        ['translation', (img) => exec((d) => d.update(schema.postTranslations).set({ ogAssetId: img.id }).where(eq(schema.postTranslations.postId, 'p1')))],
        ['post', (img) => exec((d) => d.update(schema.posts).set({ content: `![legacy](https://viz-cad.com${img.url})` }).where(eq(schema.posts.id, 'p1')))],
        ['post', (img) => exec((d) => d.update(schema.posts).set({ coverImage: img.url }).where(eq(schema.posts.id, 'p1')))],
        ['post', (img) => exec((d) => d.update(schema.posts).set({ coverAssetId: img.id }).where(eq(schema.posts.id, 'p1')))],
        ['legal', (img) => exec((d) => d.insert(schema.legalDocuments).values({ id: `l-${img.id}`, kind: 'terms', locale: 'en', version: 1, title: 'Terms', contentMd: `![](${img.url})`, contentHtml: '', effectiveAt: new Date(T0 * 1000), createdAt: new Date(T0 * 1000) }))],
        ['pageSeo', (img) => exec((d) => d.insert(schema.pageSeo).values({ pageKey: 'landing', locale: 'en', draftOgAssetId: img.id, updatedAt: new Date(T0 * 1000) }))],
        ['setting', (img) => exec((d) => d.insert(schema.siteSettings).values({ key: 'organization.logoAssetId', value: img.id, updatedAt: new Date(T0 * 1000) }))],
        ['author', (img) => exec((d) => d.update(schema.authorProfiles).set({ avatarAssetId: img.id }).where(eq(schema.authorProfiles.userId, 'ada')))],
        ['author', (img) => exec((d) => d.update(schema.authorProfiles).set({ avatarAssetId: null, avatarUrl: img.url }).where(eq(schema.authorProfiles.userId, 'ada')))],
      ]
      let salt = 10
      for (const [place, use] of cases) {
        const img = yield* uploaded(salt++)
        yield* use(img)
        const usage = yield* assetUsage({ assetId: img.id })
        assert.include(usage.places, place, place)
        const error = yield* deleteAsset({ assetId: img.id }).pipe(Effect.flip)
        assert.strictEqual(error._tag, 'AssetInUse', place)
        if (error._tag === 'AssetInUse') assert.include(error.places, place)
        const listed = (yield* listAssets({})).rows.find((r) => r.id === img.id)
        assert.isTrue(listed?.inUse, place)
        // Reset the place so the next case starts clean.
        yield* exec((d) =>
          d.batch([
            d.delete(schema.postDrafts),
            d.update(schema.postTranslations).set({ contentMd: '# x', ogAssetId: null }),
            d.update(schema.posts).set({ content: '# x', coverImage: null, coverAssetId: null }),
            d.delete(schema.legalDocuments),
            d.delete(schema.pageSeo),
            d.delete(schema.siteSettings),
            d.update(schema.authorProfiles).set({ avatarAssetId: null, avatarUrl: null }),
          ]),
        )
        assert.isFalse((yield* listAssets({})).rows.find((r) => r.id === img.id)?.inUse, `${place} reset`)
      }
      // The post that uses an image is named in the usage.
      const img = yield* uploaded(99)
      yield* exec((d) => d.update(schema.posts).set({ coverAssetId: img.id }).where(eq(schema.posts.id, 'p1')))
      assert.deepStrictEqual((yield* assetUsage({ assetId: img.id })).posts.map((p) => p.id), ['p1'])
    })))

  it.effect('a variant key in use blocks the delete too, and every variant object is removed with an unused image', () =>
    run(Effect.gen(function* () {
      const img = yield* uploaded(1)
      const storage = yield* Storage.Storage
      const variant = img.key.replace('.png', '-800.webp')
      yield* storage.put(variant, 'v', { contentType: 'image/webp' })
      yield* exec((d) => d.update(schema.cmsAssets).set({ variants: { '800': variant } }).where(eq(schema.cmsAssets.id, img.id)))
      yield* seedPost({ id: 'p1', slug: 'one' })
      yield* exec((d) => d.update(schema.posts).set({ content: `![v](/api/blog/image/${encodeURIComponent(variant)})` }).where(eq(schema.posts.id, 'p1')))
      assert.strictEqual(yield* tagOf(deleteAsset({ assetId: img.id })), 'AssetInUse')
      yield* exec((d) => d.update(schema.posts).set({ content: '# x' }).where(eq(schema.posts.id, 'p1')))
      yield* deleteAsset({ assetId: img.id })
      assert.deepStrictEqual(yield* keys, [])
    })))

  it.effect('alt text is trimmed, capped and cleared with an empty value; listing pages newest first', () =>
    run(Effect.gen(function* () {
      const a = yield* uploaded(1)
      assert.deepStrictEqual(yield* updateAssetAlt({ assetId: a.id, alt: '  A gear  ' }), { alt: 'A gear' })
      assert.strictEqual(yield* tagOf(updateAssetAlt({ assetId: a.id, alt: 'x'.repeat(201) })), 'TextTooLong')
      assert.strictEqual(yield* tagOf(updateAssetAlt({ assetId: 'nope', alt: 'x' })), 'AssetUnavailable')
      assert.strictEqual((yield* listAssets({})).rows[0]?.alt, 'A gear')
      yield* updateAssetAlt({ assetId: a.id, alt: '  ' })
      assert.strictEqual((yield* listAssets({})).rows[0]?.alt, null)
      yield* TestClock.adjust('1 second')
      const b = yield* uploaded(2)
      const list = yield* listAssets({})
      assert.deepStrictEqual(list.rows.map((r) => r.id), [b.id, a.id])
      assert.strictEqual(list.next, null)
      assert.deepStrictEqual((yield* listAssets({ cursor: b.id })).rows.map((r) => r.id), [a.id])
    })))
})
