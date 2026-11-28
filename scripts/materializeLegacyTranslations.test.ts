import type { DatabaseSync } from 'node:sqlite'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPublicPost, listPublicPosts } from '../src/server/programs/cms/blog'
import { Db, make } from '../src/server/services/Db'
import { type MemoryD1, openMemoryD1 } from '../src/server/testing/memoryD1'
import { fixtureStatements } from './fixtures/blogLegacySample'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHUNK_BYTES, chunks, EXPORT_QUERIES, failedChecks, type LegacyExport, materializeVia, planMaterialize, rowsOf, sqlString, VERIFY_QUERIES, WRITING } from './materializeLegacyTranslations'

const T = 1_700_000_000

/** Legacy-shaped rows, written with raw SQL and only the legacy columns (as the legacy Worker writes them). */
const seedLegacy = (db: DatabaseSync, extra: ReadonlyArray<{ id: string; slug: string; status: string; content: string; title?: string; updatedAt?: number }> = []) => {
  db.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('ada', 'Ada', 'ada@example.com', 1, ?, ?)").run(T, T)
  db.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('bob', 'Bob', 'bob@example.com', 1, ?, ?)").run(T, T)
  db.prepare("INSERT INTO author_profiles (id, userId, name, bio, role, createdAt, updatedAt) VALUES ('a1', 'ada', 'Ada Lovelace', 'Bio', 'Editor', ?, ?)").run(T, T)
  db.prepare("INSERT INTO author_profiles (id, userId, name, createdAt, updatedAt) VALUES ('a2', 'bob', 'Ada Lovelace', ?, ?)").run(T + 1, T + 1)
  const post = db.prepare(`INSERT INTO posts (id, slug, title, excerpt, content, coverImage, keywords, tableOfContents, publishedAt, status, category, tags, readTime, featured, views, authorId, createdAt, updatedAt)
    VALUES (?, ?, ?, 'An excerpt', ?, '/api/blog/image/blog%2Fhello%2Fcover.png', '["cad"]', 1, ?, ?, 'guides', '["step"]', 4, 0, 12, 'ada', ?, ?)`)
  const rows = [
    { id: 'p1', slug: 'hello-world', status: 'published', content: '# Hello\n\nSee ![x](/api/blog/image/blog%2Fhello%2Fa.png) and <b>raw</b>.' },
    { id: 'p2', slug: 'Odd_Slug', status: 'published', content: '[bad](javascript:alert(1)) ![ext](https://cdn.other.test/x.png)' },
    { id: 'p3', slug: 'draft-one', status: 'draft', content: 'Draft body' },
    { id: 'p4', slug: 'old', status: 'archived', content: 'Archived body' },
    ...extra,
  ]
  for (const r of rows) post.run(r.id, r.slug, r.title ?? `Title ${r.slug}`, r.content, r.status === 'draft' ? null : T, r.status, T - 10, r.updatedAt ?? T)
}

const exportOf = (db: DatabaseSync): LegacyExport =>
  Object.fromEntries(Object.entries(EXPORT_QUERIES).map(([key, query]) => [key, db.prepare(query).all()])) as unknown as LegacyExport

const runPlan = (db: DatabaseSync, options: { sourceWins?: boolean } = {}) => {
  const plan = planMaterialize(exportOf(db), options)
  db.exec(plan.statements.join('\n'))
  return plan
}

const count = (db: DatabaseSync, query: string) => Number(db.prepare(query).get()?.['n'])

let d1: MemoryD1
beforeEach(() => {
  d1 = openMemoryD1()
})
afterEach(() => d1.close())

const program = <A, E>(effect: Effect.Effect<A, E, Db>) => Effect.runPromise(effect.pipe(Effect.provide(Layer.succeed(Db, make(d1.binding)))))
const tagOf = <A, E extends { _tag: string }>(effect: Effect.Effect<A, E, Db>) => program(effect.pipe(Effect.flip, Effect.map((e) => e._tag)))

describe('materializeLegacyTranslations', () => {
  it('before the script the public side shows nothing; after it the legacy posts open at their old URLs', async () => {
    seedLegacy(d1.sqlite)
    expect(await tagOf(getPublicPost('en', 'hello-world'))).toBe('PostUnavailable')
    expect(count(d1.sqlite, VERIFY_QUERIES.publishedWithoutEn ?? '')).toBe(2)

    const plan = runPlan(d1.sqlite)
    expect(plan.report.translationsInserted).toEqual(['p1', 'p2', 'p4'])
    expect(plan.report.draftsInserted).toEqual(['p3'])
    expect(plan.report.rawHtml).toEqual([{ postId: 'p1', slug: 'hello-world', tags: ['b'] }])
    expect(plan.report.nonconformingSlugs).toEqual([{ postId: 'p2', slug: 'Odd_Slug' }])
    expect(plan.report.droppedLinks).toEqual([{ postId: 'p2', urls: ['javascript:alert(1)'] }])
    expect(plan.report.externalImages).toEqual([{ postId: 'p2', urls: ['https://cdn.other.test/x.png'] }])
    // Two authors named the same: the second gets -2 (§4.2).
    expect(plan.report.authorSlugs).toEqual([{ authorId: 'a1', slug: 'ada-lovelace' }, { authorId: 'a2', slug: 'ada-lovelace-2' }])
    for (const query of Object.values(VERIFY_QUERIES)) expect(count(d1.sqlite, query)).toBe(0)

    const result = await program(getPublicPost('en', 'hello-world'))
    expect(result.kind).toBe('post')
    if (result.kind !== 'post') return
    expect(result.post.contentHtml).toContain('<h2 id="hello">Hello</h2>')
    expect(result.post.contentHtml).toContain('src="/api/blog/image/blog%2Fhello%2Fa.png"')
    expect(result.post.contentHtml).toContain('&#x3C;b>raw&#x3C;/b>')
    expect(result.post.cover?.url).toBe('/api/blog/image/blog%2Fhello%2Fcover.png')
    expect(result.post.publishedAt).toBe(T)
    expect(result.post.authorDetail?.slug).toBe('ada-lovelace')
    expect(result.post.keywords).toEqual(['cad'])
    // A nonconforming legacy slug still opens at its old URL; drafts stay invisible; archived is 410.
    expect((await program(getPublicPost('en', 'Odd_Slug'))).kind).toBe('post')
    expect(await tagOf(getPublicPost('en', 'draft-one'))).toBe('PostUnavailable')
    expect(await tagOf(getPublicPost('en', 'old'))).toBe('PostGone')
    expect((await program(listPublicPosts('en', 1))).total).toBe(2)
    // The legacy reader still sees the untouched posts row (rollback, §1.5).
    expect(d1.sqlite.prepare("SELECT content, views FROM posts WHERE id = 'p1'").get()).toEqual({ content: '# Hello\n\nSee ![x](/api/blog/image/blog%2Fhello%2Fa.png) and <b>raw</b>.', views: 12 })
  })

  it('is idempotent: a second run inserts nothing and changes nothing', async () => {
    seedLegacy(d1.sqlite)
    runPlan(d1.sqlite)
    const before = d1.sqlite.prepare('SELECT * FROM post_translations ORDER BY postId').all()
    const second = runPlan(d1.sqlite)
    expect(second.report.translationsInserted).toEqual([])
    expect(second.report.draftsInserted).toEqual([])
    expect(second.report.alreadyPresent).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(second.report.authorSlugs).toEqual([])
    expect(d1.sqlite.prepare('SELECT * FROM post_translations ORDER BY postId').all()).toEqual(before)
  })

  it('--source-wins updates only en rows older than the post, by whole seconds; equal seconds are listed', async () => {
    seedLegacy(d1.sqlite, [{ id: 'p5', slug: 'same-second', status: 'published', content: 'v1' }])
    runPlan(d1.sqlite)
    // Legacy edits after a rollback: p1 one second later, p5 in the same second.
    d1.sqlite.prepare("UPDATE posts SET content = '# Changed', title = 'Changed title', updatedAt = ? WHERE id = 'p1'").run(T + 1)
    d1.sqlite.prepare("UPDATE posts SET content = 'v2, longer' WHERE id = 'p5'").run()
    const plain = runPlan(d1.sqlite)
    expect(plain.report.sourceWinsUpdated).toEqual([])
    const plan = runPlan(d1.sqlite, { sourceWins: true })
    expect(plan.report.sourceWinsUpdated).toEqual(['p1'])
    // p2 and p4 are unchanged (same second, same text): not listed. p5 changed within the same second: listed.
    expect(plan.report.sourceWinsEqual).toEqual(['p5'])
    const row = d1.sqlite.prepare("SELECT title, contentHtml, updatedAt, publishedAt FROM post_translations WHERE postId = 'p1'").get()
    expect(row).toEqual({ title: 'Changed title', contentHtml: '<h2 id="changed">Changed</h2>', updatedAt: T + 1, publishedAt: T })
    expect(d1.sqlite.prepare("SELECT contentMd FROM post_translations WHERE postId = 'p5'").get()).toEqual({ contentMd: 'v1' })
  })

  it('writes a post longer than one D1 statement in parts behind the sentinel', async () => {
    const big = `# Big\n\n${"word 'quoted' ünïcödé ".repeat(9000)}`
    seedLegacy(d1.sqlite, [{ id: 'p9', slug: 'big', status: 'published', content: big }])
    const plan = runPlan(d1.sqlite)
    for (const statement of plan.statements) expect(Buffer.byteLength(statement)).toBeLessThan(100_000)
    const row = d1.sqlite.prepare("SELECT contentMd, readTimeMin FROM post_translations WHERE postId = 'p9'").get()
    expect(row?.['contentMd']).toBe(big)
    expect(Number(row?.['readTimeMin'])).toBeGreaterThan(0)
    expect((await program(getPublicPost('en', 'big'))).kind).toBe('post')
  })

  it('a quote-heavy post is measured escaped: no statement reaches the D1 limit', async () => {
    // 28 000 quotes: 56 KB raw for contentMd and contentHtml together, but each doubles when escaped.
    const quotes = "'".repeat(28_000)
    seedLegacy(d1.sqlite, [{ id: 'p7', slug: 'quotes', status: 'published', content: quotes }])
    const plan = runPlan(d1.sqlite)
    for (const statement of plan.statements) expect(Buffer.byteLength(statement)).toBeLessThan(100_000)
    expect(d1.sqlite.prepare("SELECT contentMd FROM post_translations WHERE postId = 'p7'").get()?.['contentMd']).toBe(quotes)
    expect((await program(getPublicPost('en', 'quotes'))).kind).toBe('post')
  })

  it('a run that stopped half-way is finished by the next run; the half row is never public', async () => {
    const big = `# Big\n\n${'word '.repeat(40_000)}`
    seedLegacy(d1.sqlite, [{ id: 'p9', slug: 'big', status: 'published', content: big }])
    const plan = planMaterialize(exportOf(d1.sqlite))
    // Stop right after the insert (the sentinel row exists, content is partial).
    const insertAt = plan.statements.findIndex((s) => s.includes('INSERT INTO "post_translations"') && s.includes("'p9'"))
    d1.sqlite.exec(plan.statements.slice(0, insertAt + 2).join('\n'))
    expect(Number(d1.sqlite.prepare("SELECT readTimeMin FROM post_translations WHERE postId = 'p9'").get()?.['readTimeMin'])).toBe(WRITING)
    expect(await tagOf(getPublicPost('en', 'big'))).toBe('PostUnavailable')
    expect(count(d1.sqlite, VERIFY_QUERIES.halfWritten ?? '')).toBe(1)
    const again = runPlan(d1.sqlite)
    expect(again.report.halfWrittenRepaired).toEqual(['p9'])
    expect(d1.sqlite.prepare("SELECT contentMd FROM post_translations WHERE postId = 'p9'").get()?.['contentMd']).toBe(big)
    expect(count(d1.sqlite, VERIFY_QUERIES.halfWritten ?? '')).toBe(0)
  })

  it('an interrupted --source-wins is repaired in place: publishedAt, coverAlt and ogAssetId survive', async () => {
    const big = `# Big\n\n${'word '.repeat(40_000)}`
    seedLegacy(d1.sqlite, [{ id: 'p9', slug: 'big', status: 'published', content: 'v1' }])
    runPlan(d1.sqlite)
    // Set after the first copy by the editor (6c): not in the legacy posts row, so only the translation row holds them.
    d1.sqlite.exec(`INSERT INTO cms_assets (id, r2Key, mime, bytes, width, height, sha256, createdAt) VALUES ('og1', 'blog/a/og1.png', 'image/png', 1, 1200, 630, 'h', ${T})`)
    d1.sqlite.exec(`UPDATE post_translations SET coverAlt = 'Cover alt', ogAssetId = 'og1', publishedAt = ${T - 500} WHERE postId = 'p9'`)
    d1.sqlite.prepare("UPDATE posts SET content = ?, updatedAt = ? WHERE id = 'p9'").run(big, T + 1)
    const plan = planMaterialize(exportOf(d1.sqlite), { sourceWins: true })
    const headAt = plan.statements.findIndex((s) => s.startsWith('UPDATE "post_translations"') && s.includes("'p9'"))
    d1.sqlite.exec(plan.statements.slice(0, headAt + 2).join('\n'))
    expect(count(d1.sqlite, VERIFY_QUERIES.halfWritten ?? '')).toBe(1)

    const again = runPlan(d1.sqlite, { sourceWins: true })
    expect(again.report.halfWrittenRepaired).toEqual(['p9'])
    expect(again.report.translationsInserted).toEqual([])
    const row = d1.sqlite.prepare("SELECT contentMd, coverAlt, ogAssetId, publishedAt, updatedAt, readTimeMin FROM post_translations WHERE postId = 'p9'").get()
    expect(row?.['contentMd']).toBe(big)
    expect([row?.['coverAlt'], row?.['ogAssetId'], row?.['publishedAt'], row?.['updatedAt']]).toEqual(['Cover alt', 'og1', T - 500, T + 1])
    expect(Number(row?.['readTimeMin'])).toBeGreaterThan(0)
    expect(count(d1.sqlite, VERIFY_QUERIES.halfWritten ?? '')).toBe(0)
  })

  it('a draft that the legacy site published later: the copied draft goes, an edited one is kept and listed', () => {
    seedLegacy(d1.sqlite, [{ id: 'p6', slug: 'draft-two', status: 'draft', content: 'Draft two' }])
    runPlan(d1.sqlite)
    expect(count(d1.sqlite, "SELECT count(*) AS n FROM post_drafts WHERE postId IN ('p3', 'p6')")).toBe(2)
    // An editor touched p6's draft; then the legacy site (after a rollback) published both.
    d1.sqlite.exec("UPDATE post_drafts SET revision = 1, updatedByUserId = 'ada' WHERE postId = 'p6'")
    d1.sqlite.prepare("UPDATE posts SET status = 'published', publishedAt = ?, updatedAt = ? WHERE id IN ('p3', 'p6')").run(T + 5, T + 5)
    const plan = runPlan(d1.sqlite)
    expect(plan.report.translationsInserted).toEqual(['p3', 'p6'])
    expect(plan.report.supersededDraftsRemoved).toEqual(['p3'])
    expect(plan.report.supersededDraftsKept).toEqual(['p6'])
    expect(d1.sqlite.prepare("SELECT postId FROM post_drafts WHERE locale = 'en' ORDER BY postId").all()).toEqual([{ postId: 'p6' }])
    // A further run has nothing left to remove.
    expect(runPlan(d1.sqlite).report.supersededDraftsRemoved).toEqual([])
  })

  it('rejects a post whose title breaks the table check, and reports it', () => {
    seedLegacy(d1.sqlite, [{ id: 'p8', slug: 'long', status: 'published', content: 'x', title: 'T'.repeat(121) }])
    const plan = runPlan(d1.sqlite)
    expect(plan.report.rejected).toEqual([{ postId: 'p8', reason: 'title longer than 120' }])
    expect(count(d1.sqlite, VERIFY_QUERIES.publishedWithoutEn ?? '')).toBe(1)
  })
})

describe('staging sample fixture (scripts/fixtures/blogLegacySample.ts)', () => {
  it('loads on a migrated database, is idempotent, and gives the script every case', async () => {
    for (let i = 0; i < 2; i++) d1.sqlite.exec(fixtureStatements().join('\n'))
    expect(count(d1.sqlite, "SELECT count(*) AS n FROM posts WHERE id LIKE 'fixture-%'")).toBe(17)
    expect(await tagOf(getPublicPost('en', 'step-vs-iges'))).toBe('PostUnavailable')
    const plan = runPlan(d1.sqlite)
    expect(plan.report.rawHtml.map((r) => r.slug)).toEqual(['legacy-raw-html'])
    expect(plan.report.nonconformingSlugs.map((r) => r.slug)).toEqual(['Legacy_Odd_Slug'])
    expect(plan.report.draftsInserted).toEqual(['fixture-draft'])
    expect(plan.report.authorSlugs).toEqual([{ authorId: 'fixture-author-profile', slug: 'deniz-fixture' }])
    expect((await program(listPublicPosts('en', 1))).pages).toBe(2)
    expect(await tagOf(getPublicPost('en', 'fixture-archived'))).toBe('PostGone')
  })
})

describe('materializeVia verification', () => {
  /** A wrangler stand-in on the memory D1: `--json` queries and the SQL file run against it. */
  const via = (verify?: (query: string) => unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'materialize-'))
    const verifyQueries = new Set(Object.values(VERIFY_QUERIES))
    const result = materializeVia({
      execJson: (query) => (verify !== undefined && verifyQueries.has(query) ? verify(query) : [{ results: d1.sqlite.prepare(query).all() }]),
      execFile: () => d1.sqlite.exec(planMaterialize(exportOf(d1.sqlite)).statements.join('\n')),
      sqlFile: join(dir, 'out.sql'),
      sourceWins: false,
    })
    rmSync(dir, { recursive: true, force: true })
    return result
  }

  it('a clean run has no failed check', () => {
    seedLegacy(d1.sqlite)
    const result = via()
    expect(result.counts).toEqual({ publishedWithoutEn: 0, halfWritten: 0 })
    expect(result.failed).toEqual([])
  })

  it('a count above 0, or one that cannot be read (NaN), fails the run (the CLI exits 1)', () => {
    seedLegacy(d1.sqlite, [{ id: 'p8', slug: 'long', status: 'published', content: 'x', title: 'T'.repeat(121) }])
    expect(via().failed).toEqual(['publishedWithoutEn'])
    d1.close()
    d1 = openMemoryD1()
    seedLegacy(d1.sqlite)
    expect(via(() => [{ results: [{ n: 'oops' }] }]).failed).toEqual(['publishedWithoutEn', 'halfWritten'])
    expect(failedChecks({ a: 0, b: Number.NaN, c: 2 })).toEqual(['b', 'c'])
  })
})

describe('helpers', () => {
  it('sqlString doubles quotes; chunks keep pieces under the limit and rejoin exactly', () => {
    expect(sqlString("it's")).toBe("'it''s'")
    const text = `${"a'é😀".repeat(30_000)}`
    const parts = chunks(text)
    expect(parts.join('')).toBe(text)
    for (const part of parts) expect(Buffer.byteLength(sqlString(part))).toBeLessThanOrEqual(CHUNK_BYTES)
    expect(chunks('')).toEqual([''])
  })

  it('rowsOf reads wrangler --json output and plain arrays', () => {
    expect(rowsOf([{ results: [{ a: 1 }], success: true }])).toEqual([{ a: 1 }])
    expect(rowsOf([{ a: 1 }])).toEqual([{ a: 1 }])
    expect(rowsOf(null)).toEqual([])
  })
})
