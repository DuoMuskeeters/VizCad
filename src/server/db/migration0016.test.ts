import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Option } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkMigration } from '../../../scripts/check-migrations'
import * as AppConfig from '../services/AppConfig'
import { createAuth } from '../services/authOptions'
import { applyMigrations, openMemoryD1, type MemoryD1 } from '../testing/memoryD1'
import { toUnixSeconds } from '../time'
import * as schema from './schema'

const sql0016 = readFileSync(new URL('../../../drizzle/0016_cms.sql', import.meta.url), 'utf8')

/** 2026-11-01T00:00:00Z in Unix seconds: what legacy wrote through Drizzle `mode: "timestamp"`. */
const NOV_1 = 1793491200

/** The legacy app's own statements: it names only the columns it knows (POST /api/blog spreads its body into these). */
const legacyPost = (d1: MemoryD1, id: string, authorId: string, slug = id) =>
  d1.sqlite.exec(`INSERT INTO posts (id, slug, title, excerpt, content, coverImage, metaTitle, metaDescription, keywords, tableOfContents, publishedAt, status, category, tags, readTime, featured, views, authorId, createdAt, updatedAt)
    VALUES ('${id}', '${slug}', 'Title', 'Excerpt', '# Hello', '/api/blog/image/blog%2Fgeneral%2Fa.png', NULL, NULL, '["cad"]', 1, ${NOV_1}, 'published', 'guides', '["step"]', 4, 0, 0, '${authorId}', ${NOV_1}, ${NOV_1})`)

const seed = (d1: MemoryD1) =>
  d1.sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES
      ('author', 'Ada', 'ada@example.test', 1, ${NOV_1}, ${NOV_1}, 'admin'),
      ('reader', 'Lin', 'lin@example.test', 1, ${NOV_1}, ${NOV_1}, 'user');
    INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES
      ('a-author', 'author', 'credential', 'author', 'hash', ${NOV_1}, ${NOV_1}),
      ('a-author-google', 'g-1', 'google', 'author', NULL, ${NOV_1}, ${NOV_1}),
      ('a-reader', 'reader', 'credential', 'reader', 'hash', ${NOV_1}, ${NOV_1});
    INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES
      ('s-author', 9999999999, 'tok-author', ${NOV_1}, ${NOV_1}, 'author'),
      ('s-reader', 9999999999, 'tok-reader', ${NOV_1}, ${NOV_1}, 'reader');
    INSERT INTO author_profiles (id, userId, name, bio, role, avatarUrl, socialLinks, createdAt, updatedAt)
      VALUES ('ap1', 'author', 'Ada Lovelace', 'Writes about CAD', 'Engineer', NULL, '{"x":"https://x.com/ada"}', ${NOV_1}, ${NOV_1});
  `)

/** Messages along an error's `cause` chain. */
const causes = (error: unknown): Array<string> =>
  error instanceof Error ? [error.message, ...causes(error.cause)] : []

const count = (d1: MemoryD1, table: string, where = '1 = 1') =>
  d1.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get()?.['n']

describe('0016_cms', () => {
  let d1: MemoryD1

  beforeEach(() => {
    d1 = openMemoryD1({ migrate: false })
    applyMigrations(d1.sqlite, { to: 16 })
    seed(d1)
    legacyPost(d1, 'p-before', 'author')
  })
  afterEach(() => d1.close())

  it('is additive: it passes the migration allowlist and only adds nullable legacy columns', () => {
    expect(checkMigration('0016_cms.sql', sql0016)).toEqual([])
    expect(sql0016).not.toMatch(/\bDROP\b|\bRENAME\b|__new_|^\s*(UPDATE|DELETE|INSERT)\b/im)
    const legacyAlters = sql0016.match(/ALTER TABLE `(posts|author_profiles)` ADD [^;]+/g) ?? []
    expect(legacyAlters).toHaveLength(5)
    for (const alter of legacyAlters) expect(alter).not.toMatch(/NOT NULL/i)
    // Every new reference from a legacy table is SET NULL, so deleting an asset or a user never cascades into posts.
    for (const alter of legacyAlters.filter((a) => a.includes('REFERENCES'))) expect(alter).toMatch(/ON DELETE SET NULL$/)
  })

  it('keeps legacy rows as they are; the new columns start NULL; legacy writes still work afterwards', () => {
    const before = d1.sqlite.prepare('SELECT id, slug, title, content, coverImage, status, authorId, publishedAt FROM posts').all()
    applyMigrations(d1.sqlite, { from: 16 })
    expect(d1.sqlite.prepare('SELECT id, slug, title, content, coverImage, status, authorId, publishedAt FROM posts').all()).toEqual(before)
    expect(d1.sqlite.prepare('SELECT revision, coverAssetId, updatedByUserId FROM posts').all()).toEqual([{ revision: null, coverAssetId: null, updatedByUserId: null }])
    expect(d1.sqlite.prepare('SELECT slug, avatarAssetId FROM author_profiles').all()).toEqual([{ slug: null, avatarAssetId: null }])

    // Legacy shapes after 0016: insert without the new columns, update, view counter, author profile edits, delete.
    legacyPost(d1, 'p-after', 'author')
    d1.sqlite.exec(`UPDATE posts SET title = 'New', status = 'archived', updatedAt = ${NOV_1 + 1} WHERE id = 'p-after'`)
    d1.sqlite.exec(`UPDATE posts SET views = views + 1 WHERE slug = 'p-after'`)
    d1.sqlite.exec(`UPDATE author_profiles SET bio = 'Edited', updatedAt = ${NOV_1 + 1} WHERE userId = 'author'`)
    d1.sqlite.exec(`INSERT INTO author_profiles (id, userId, name, createdAt, updatedAt) VALUES ('ap2', 'reader', 'Lin', ${NOV_1}, ${NOV_1})`)
    d1.sqlite.exec(`DELETE FROM posts WHERE id = 'p-after'`)
    expect(count(d1, 'posts')).toBe(1)
    // Two author profiles without a slug: the new unique index allows any number of NULLs.
    expect(count(d1, 'author_profiles', 'slug IS NULL')).toBe(2)
    expect(d1.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('reads legacy timestamps as seconds (not 1970, not 57 000 AD) through Drizzle', async () => {
    applyMigrations(d1.sqlite, { from: 16 })
    const db = drizzle(d1.binding, { schema })
    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, 'p-before'))
    expect(post?.publishedAt?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(toUnixSeconds(post?.publishedAt ?? new Date(0))).toBe(NOV_1)
    // New tables use the same unit: a row written through Drizzle stores seconds.
    await db.insert(schema.cachePurges).values({ kind: 'url', target: 'https://vizcad.test/blog', reason: 'test', createdAt: new Date(NOV_1 * 1000), notBefore: new Date(NOV_1 * 1000) })
    expect(d1.sqlite.prepare('SELECT createdAt, notBefore FROM cache_purges').get()).toEqual({ createdAt: NOV_1, notBefore: NOV_1 })
  })

  it('creates the expected indexes and triggers', () => {
    applyMigrations(d1.sqlite, { from: 16 })
    const names = (type: string) =>
      d1.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = ? ORDER BY name`).all(type).map((r) => r['name'])
    expect(names('trigger')).toEqual(expect.arrayContaining([
      'user_delete_guard_author', 'account_delete_guard_author', 'legal_documents_published_immutable', 'legal_documents_published_undeletable',
    ]))
    expect(names('index')).toEqual(expect.arrayContaining([
      'author_profiles_slug_uq', 'posts_status_published_idx', 'post_translations_locale_slug_uq', 'post_translations_locale_published_idx',
      'cache_purges_target_uq', 'cache_purges_not_before_idx', 'legal_documents_kind_locale_version_uq',
    ]))
    expect(names('table')).toEqual(expect.arrayContaining([
      'cms_assets', 'post_translations', 'post_drafts', 'post_slug_redirects', 'author_translations', 'site_texts', 'page_seo',
      'legal_documents', 'legal_acceptances', 'cache_purges', 'contact_messages', 'site_settings',
    ]))
  })

  it('locale CHECKs, slug uniqueness per locale, cache_purges dedupe on (kind, target, notBefore)', () => {
    applyMigrations(d1.sqlite, { from: 16 })
    const translation = (locale: string, slug: string, postId = 'p-before') =>
      d1.sqlite.exec(`INSERT INTO post_translations (postId, locale, slug, title, excerpt, contentMd, contentHtml, toc, readTimeMin, publishedAt, updatedAt)
        VALUES ('${postId}', '${locale}', '${slug}', 'T', 'E', '# x', '<h1>x</h1>', '[]', 1, ${NOV_1}, ${NOV_1})`)
    translation('en', 'hello')
    translation('tr', 'hello') // the same slug in another locale is fine
    expect(() => translation('xx', 'other')).toThrow(/CHECK/)
    legacyPost(d1, 'p2', 'author')
    expect(() => translation('en', 'hello', 'p2')).toThrow(/UNIQUE/)

    const purge = (notBefore: number) =>
      d1.sqlite.exec(`INSERT INTO cache_purges (kind, target, reason, createdAt, notBefore) VALUES ('url', 'https://vizcad.test/', 'r', ${NOV_1}, ${notBefore}) ON CONFLICT DO NOTHING`)
    purge(NOV_1)
    purge(NOV_1)
    purge(NOV_1 + 60)
    expect(count(d1, 'cache_purges')).toBe(2)
    expect(() => d1.sqlite.exec(`INSERT INTO cache_purges (kind, target, reason, createdAt, notBefore) VALUES ('zone', 'x', 'r', 1, 1)`)).toThrow(/CHECK/)
  })

  it('a published legal version can be neither updated nor deleted; a draft can', () => {
    applyMigrations(d1.sqlite, { from: 16 })
    const legal = (id: string, version: number, publishedAt: number | null) =>
      d1.sqlite.exec(`INSERT INTO legal_documents (id, kind, locale, version, title, contentMd, contentHtml, effectiveAt, publishedAt, createdAt)
        VALUES ('${id}', 'terms', 'en', ${version}, 'Terms', 'x', '<p>x</p>', ${NOV_1}, ${publishedAt ?? 'NULL'}, ${NOV_1})`)
    legal('l1', 1, NOV_1)
    legal('l2', 2, null)
    expect(() => d1.sqlite.exec(`UPDATE legal_documents SET title = 'Changed' WHERE id = 'l1'`)).toThrow(/legal_document_published/)
    expect(() => d1.sqlite.exec(`DELETE FROM legal_documents WHERE id = 'l1'`)).toThrow(/legal_document_published/)
    d1.sqlite.exec(`UPDATE legal_documents SET title = 'Draft edit' WHERE id = 'l2'`)
    d1.sqlite.exec(`DELETE FROM legal_documents WHERE id = 'l2'`)
    expect(count(d1, 'legal_documents')).toBe(1)
  })

  it('the immutability trigger guards every legal_documents column except createdByUserId (its ON DELETE SET NULL)', () => {
    applyMigrations(d1.sqlite, { from: 16 })
    const columns = d1.sqlite.prepare(`PRAGMA table_info(legal_documents)`).all().map((r) => String(r['name']))
    const trigger = String(d1.sqlite.prepare(`SELECT sql FROM sqlite_master WHERE name = 'legal_documents_published_immutable'`).get()?.['sql'])
    const guarded = (/UPDATE OF ([^]*?) ON/.exec(trigger)?.[1] ?? '').split(',').map((c) => c.trim().replace(/`/g, ''))
    expect(guarded.sort()).toEqual(columns.filter((c) => c !== 'createdByUserId').sort())
  })

  describe('author delete guards (docs/12 §1.4), with the real better-auth delete sequence', () => {
    // better-auth 1.4.7 internalAdapter.deleteUser: DELETE session, DELETE account, DELETE user, no transaction.
    const deleteUser = async (userId: string) => {
      const auth = createAuth({
        db: drizzle(d1.binding, { schema }),
        settings: Option.getOrThrow(AppConfig.testConfig.auth),
        siteUrl: AppConfig.testConfig.siteUrl,
        trustedOrigins: AppConfig.testConfig.trustedOrigins,
        mailer: { verification: () => Promise.resolve(), passwordReset: () => Promise.resolve() },
        googleUserInfo: () => Promise.resolve(null),
      })
      const context = await auth.$context
      return context.internalAdapter.deleteUser(userId)
    }

    beforeEach(() => applyMigrations(d1.sqlite, { from: 16 }))

    it('an author cannot be deleted: user and accounts stay, posts stay (only sessions are gone)', async () => {
      // Drizzle wraps the driver error ("Failed query: delete from account …"); the trigger's message is its cause.
      const error: unknown = await deleteUser('author').then(() => undefined, (e: unknown) => e)
      expect(causes(error).join(' | ')).toMatch(/delete from "account"[\s\S]*author_has_posts/)
      expect(count(d1, 'user', "id = 'author'")).toBe(1)
      expect(count(d1, 'account', "userId = 'author'")).toBe(2)
      expect(count(d1, 'posts', "authorId = 'author'")).toBe(1)
      expect(count(d1, 'author_profiles', "userId = 'author'")).toBe(1)
      expect(count(d1, 'session', "userId = 'author'")).toBe(0)
    })

    it('a user without posts is deleted from all three tables', async () => {
      await deleteUser('reader')
      expect(count(d1, 'user', "id = 'reader'")).toBe(0)
      expect(count(d1, 'account', "userId = 'reader'")).toBe(0)
      expect(count(d1, 'session', "userId = 'reader'")).toBe(0)
      expect(count(d1, 'user', "id = 'author'")).toBe(1)
    })

    it('deleting a single account row of an author is refused; a plain user delete (legacy admin) too', () => {
      expect(() => d1.sqlite.exec(`DELETE FROM account WHERE id = 'a-author-google'`)).toThrow(/author_has_posts/)
      expect(() => d1.sqlite.exec(`DELETE FROM user WHERE id = 'author'`)).toThrow(/author_has_posts/)
      expect(count(d1, 'posts')).toBe(1)
    })

    it('the creator of a published legal version is deleted (better-auth sequence); the version stays as it was', async () => {
      d1.sqlite.exec(`INSERT INTO legal_documents (id, kind, locale, version, title, contentMd, contentHtml, effectiveAt, publishedAt, createdAt, createdByUserId)
        VALUES ('l1', 'privacy', 'en', 1, 'Privacy', 'x', '<p>x</p>', ${NOV_1}, ${NOV_1}, ${NOV_1}, 'reader')`)
      const columns = 'id, kind, locale, version, title, contentMd, contentHtml, effectiveAt, publishedAt, createdAt'
      const before = d1.sqlite.prepare(`SELECT ${columns} FROM legal_documents`).all()
      await deleteUser('reader')
      expect(count(d1, 'user', "id = 'reader'")).toBe(0)
      expect(count(d1, 'account', "userId = 'reader'")).toBe(0)
      expect(d1.sqlite.prepare(`SELECT ${columns} FROM legal_documents`).all()).toEqual(before)
      expect(count(d1, 'legal_documents', 'createdByUserId IS NULL')).toBe(1)
      expect(() => d1.sqlite.exec(`UPDATE legal_documents SET title = 'Changed' WHERE id = 'l1'`)).toThrow(/legal_document_published/)
    })

    it('once the posts are handed to another author, the guard lets the delete through', async () => {
      d1.sqlite.exec(`UPDATE posts SET authorId = 'reader' WHERE authorId = 'author'`)
      d1.sqlite.exec(`DELETE FROM author_profiles WHERE userId = 'author'`)
      await deleteUser('author')
      expect(count(d1, 'user', "id = 'author'")).toBe(0)
      expect(count(d1, 'posts', "authorId = 'reader'")).toBe(1)
    })
  })
})
