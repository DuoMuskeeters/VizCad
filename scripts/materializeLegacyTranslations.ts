/**
 * Copies legacy posts into the `en` translation tables (docs/12 §1.5 step 2, step 4, step 5). Runs in Node, never in
 * the Worker: a long post's markdown is rendered here (renderMarkdown), so a public request never renders markdown.
 *
 * Input: a read-only export of `posts`, the existing `en` rows, authors and assets (EXPORT_QUERIES). Output: SQL.
 * - Published and archived posts → `post_translations(en)`; draft posts → `post_drafts(en)` (revision 0), so they stay
 *   invisible and the editor (6c) shows them as drafts.
 * - Idempotent: `INSERT … ON CONFLICT (postId, locale) DO NOTHING`. Re-running changes nothing.
 * - `--source-wins` (after a rollback to the legacy Worker): only `en` rows with `posts.updatedAt > translation.updatedAt`
 *   are rewritten. Equal seconds count as equal: not updated, listed in the report.
 * - D1 accepts at most 100 KB per statement. A long post is written in parts: the row starts with `readTimeMin = -1`
 *   (a sentinel no public read accepts), the content is appended in ≤ 60 KB pieces guarded by that sentinel, the last
 *   statement sets the real read time. A row that already existed never matches the guard, so nothing is appended to
 *   it. A run that stopped half-way leaves a sentinel row, which the next run deletes first.
 * - Authors without a slug get one from their name (§4.2, `-2` on a clash). Only `slug IS NULL` rows are touched.
 * - Posts whose title (> 120) or excerpt (> 300) break the table checks are not copied and are listed as `rejected`.
 *
 * Every bound value is a literal escaped here (`sqlString`); timestamps are Unix seconds (§1.3).
 *
 *   node scripts/materializeLegacyTranslations.ts <export.json> <out.sql> [--source-wins] [--report <report.json>]
 *   node scripts/materializeLegacyTranslations.ts --local [--source-wins]     local D1 (`pnpm db:materialize:local`)
 * Staging: `pnpm db:materialize:staging` (scripts/staging.ts materialize). Production: at cutover only, with approval.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { type KnownAsset, renderMarkdown } from '../src/server/cms/markdown.ts'
import { isValidSlug, slugify, uniqueSlug } from '../src/server/cms/slug.ts'

export interface LegacyPost {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly content: string
  readonly metaTitle: string | null
  readonly metaDescription: string | null
  /** JSON text, as stored. */
  readonly keywords: string | null
  readonly status: string
  readonly publishedAt: number | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface ExistingTranslation {
  readonly postId: string
  readonly updatedAt: number
  readonly readTimeMin: number
  /** Cheap fingerprint for `--source-wins` ties (no hash function in D1 SQL). */
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly contentLength: number
}

export interface LegacyExport {
  readonly posts: ReadonlyArray<LegacyPost>
  readonly translations: ReadonlyArray<ExistingTranslation>
  readonly drafts: ReadonlyArray<{ readonly postId: string; readonly revision: number }>
  readonly authors: ReadonlyArray<{ readonly id: string; readonly name: string; readonly slug: string | null }>
  readonly assets: ReadonlyArray<{ readonly r2Key: string; readonly width: number; readonly height: number; readonly variants: string | null }>
}

/** Read-only queries whose `--json` results form a LegacyExport (one query per key). */
export const EXPORT_QUERIES: Readonly<Record<keyof LegacyExport, string>> = {
  posts: 'SELECT id, slug, title, excerpt, content, metaTitle, metaDescription, keywords, status, publishedAt, createdAt, updatedAt FROM posts ORDER BY id',
  translations: "SELECT postId, updatedAt, readTimeMin, slug, title, excerpt, length(contentMd) AS contentLength FROM post_translations WHERE locale = 'en' ORDER BY postId",
  drafts: "SELECT postId, revision FROM post_drafts WHERE locale = 'en' ORDER BY postId",
  authors: 'SELECT id, name, slug FROM author_profiles ORDER BY createdAt, id',
  assets: 'SELECT r2Key, width, height, variants FROM cms_assets ORDER BY r2Key',
}

export interface Report {
  readonly posts: number
  readonly translationsInserted: ReadonlyArray<string>
  readonly draftsInserted: ReadonlyArray<string>
  readonly alreadyPresent: ReadonlyArray<string>
  readonly sourceWinsUpdated: ReadonlyArray<string>
  /** `--source-wins`: same second on both sides but different text: left as is, check by hand. */
  readonly sourceWinsEqual: ReadonlyArray<string>
  readonly rejected: ReadonlyArray<{ readonly postId: string; readonly reason: string }>
  readonly rawHtml: ReadonlyArray<{ readonly postId: string; readonly slug: string; readonly tags: ReadonlyArray<string> }>
  readonly nonconformingSlugs: ReadonlyArray<{ readonly postId: string; readonly slug: string }>
  readonly droppedLinks: ReadonlyArray<{ readonly postId: string; readonly urls: ReadonlyArray<string> }>
  readonly externalImages: ReadonlyArray<{ readonly postId: string; readonly urls: ReadonlyArray<string> }>
  readonly authorSlugs: ReadonlyArray<{ readonly authorId: string; readonly slug: string }>
  readonly statements: number
}

export interface Plan {
  readonly statements: ReadonlyArray<string>
  readonly report: Report
}

/** Largest content piece per statement (bytes of the escaped literal). D1's limit is 100 KB per statement. */
export const CHUNK_BYTES = 60_000
/** Placeholder read time of a row still being written; public reads require `readTimeMin > 0`. */
export const WRITING = -1
/** The same for a draft row (`revision >= 0` is checked, so the sentinel is a revision no editor reaches). */
export const WRITING_REVISION = 2_147_483_647

export const sqlString = (value: string): string => `'${value.replace(/'/g, "''")}'`
const sqlValue = (value: string | number | null): string =>
  value === null ? 'NULL' : typeof value === 'number' ? String(Math.trunc(value)) : sqlString(value)

/** Splits text into pieces whose escaped literal stays under `CHUNK_BYTES`, never inside a UTF-16 surrogate pair. */
export const chunks = (value: string): ReadonlyArray<string> => {
  const out: Array<string> = []
  let current = ''
  let bytes = 2
  for (const ch of value) {
    const size = Buffer.byteLength(ch === "'" ? "''" : ch)
    if (bytes + size > CHUNK_BYTES && current !== '') {
      out.push(current)
      current = ''
      bytes = 2
    }
    current += ch
    bytes += size
  }
  if (current !== '' || out.length === 0) out.push(current)
  return out
}

const parseVariants = (raw: string | null): Readonly<Record<string, string>> | null => {
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

const where = (postId: string) => `"postId" = ${sqlString(postId)} AND "locale" = 'en'`

/** The column writes of one `en` row: short columns in the first statement, long ones appended under the sentinel. */
const writeRow = (
  table: 'post_translations' | 'post_drafts',
  columns: ReadonlyArray<readonly [string, string | number | null]>,
  long: ReadonlyArray<readonly [string, string]>,
  mode: { readonly kind: 'insert' } | { readonly kind: 'update'; readonly olderThan: number },
  finish: readonly [string, number],
): ReadonlyArray<string> => {
  const sentinel = table === 'post_drafts' ? WRITING_REVISION : WRITING
  const pieces = long.map(([name, value]) => [name, chunks(value)] as const)
  const fitsInOne = pieces.every(([, parts]) => parts.length === 1) && long.reduce((n, [, v]) => n + Buffer.byteLength(v), 0) < CHUNK_BYTES
  const first: ReadonlyArray<readonly [string, string | number | null]> = [
    ...columns,
    ...pieces.map(([name, parts]) => [name, fitsInOne ? (parts[0] ?? '') : ''] as const),
    [finish[0], fitsInOne ? finish[1] : sentinel],
  ]
  const head =
    mode.kind === 'insert'
      ? `INSERT INTO "${table}" (${first.map(([n]) => `"${n}"`).join(', ')}) VALUES (${first.map(([, v]) => sqlValue(v)).join(', ')}) ON CONFLICT ("postId", "locale") DO NOTHING;`
      : `UPDATE "${table}" SET ${first.filter(([n]) => n !== 'postId' && n !== 'locale').map(([n, v]) => `"${n}" = ${sqlValue(v)}`).join(', ')} WHERE ${where(String(columns.find(([n]) => n === 'postId')?.[1]))} AND "updatedAt" < ${mode.olderThan};`
  if (fitsInOne) return [head]
  const postId = String(columns.find(([n]) => n === 'postId')?.[1])
  const guard = `${where(postId)} AND "${finish[0]}" = ${sentinel}`
  return [
    head,
    ...pieces.flatMap(([name, parts]) => parts.map((part) => `UPDATE "${table}" SET "${name}" = "${name}" || ${sqlString(part)} WHERE ${guard};`)),
    `UPDATE "${table}" SET "${finish[0]}" = ${finish[1]} WHERE ${guard};`,
  ]
}

export const planMaterialize = (data: LegacyExport, options: { readonly sourceWins?: boolean } = {}): Plan => {
  const assets = new Map<string, KnownAsset>(data.assets.map((a) => [a.r2Key, { width: a.width, height: a.height, variants: parseVariants(a.variants) }]))
  const existing = new Map(data.translations.map((t) => [t.postId, t]))
  // Half-written rows (sentinel) are deleted by the first statements below, so they do not count as present.
  const drafts = new Set(data.drafts.filter((d) => d.revision !== WRITING_REVISION).map((d) => d.postId))
  const report = {
    translationsInserted: [] as Array<string>,
    draftsInserted: [] as Array<string>,
    alreadyPresent: [] as Array<string>,
    sourceWinsUpdated: [] as Array<string>,
    sourceWinsEqual: [] as Array<string>,
    rejected: [] as Array<{ postId: string; reason: string }>,
    rawHtml: [] as Array<{ postId: string; slug: string; tags: ReadonlyArray<string> }>,
    nonconformingSlugs: [] as Array<{ postId: string; slug: string }>,
    droppedLinks: [] as Array<{ postId: string; urls: ReadonlyArray<string> }>,
    externalImages: [] as Array<{ postId: string; urls: ReadonlyArray<string> }>,
    authorSlugs: [] as Array<{ authorId: string; slug: string }>,
  }
  // A run that stopped half-way: its sentinel rows are rewritten from scratch.
  const statements: Array<string> = [
    `DELETE FROM "post_translations" WHERE "locale" = 'en' AND "readTimeMin" = ${WRITING};`,
    `DELETE FROM "post_drafts" WHERE "locale" = 'en' AND "revision" = ${WRITING_REVISION};`,
  ]

  for (const post of data.posts) {
    if (!isValidSlug(post.slug)) report.nonconformingSlugs.push({ postId: post.id, slug: post.slug })
    const isDraft = post.status === 'draft'
    const present = isDraft ? drafts.has(post.id) || existing.has(post.id) : existing.has(post.id) && (existing.get(post.id)?.readTimeMin ?? 0) > 0
    const found = existing.get(post.id)
    const update = !isDraft && options.sourceWins === true && found !== undefined && found.readTimeMin > 0
    if (present && !update) {
      report.alreadyPresent.push(post.id)
      continue
    }
    if (update && found !== undefined && post.updatedAt <= found.updatedAt) {
      const differs =
        found.slug !== post.slug || found.title !== post.title || found.excerpt !== post.excerpt || found.contentLength !== [...post.content].length
      if (post.updatedAt === found.updatedAt && differs) report.sourceWinsEqual.push(post.id)
      else report.alreadyPresent.push(post.id)
      continue
    }
    if (!isDraft && ([...post.title].length > 120 || [...post.excerpt].length > 300)) {
      report.rejected.push({ postId: post.id, reason: [...post.title].length > 120 ? 'title longer than 120' : 'excerpt longer than 300' })
      continue
    }

    const keywords = post.keywords
    const base: ReadonlyArray<readonly [string, string | number | null]> = [
      ['postId', post.id],
      ['locale', 'en'],
      ['slug', post.slug],
      ['title', post.title],
      ['excerpt', post.excerpt],
      ['metaTitle', post.metaTitle],
      ['metaDescription', post.metaDescription],
      ['keywords', keywords],
      ['updatedAt', post.updatedAt],
    ]
    if (isDraft) {
      statements.push(...writeRow('post_drafts', base, [['contentMd', post.content]], { kind: 'insert' }, ['revision', 0]))
      report.draftsInserted.push(post.id)
      continue
    }
    const rendered = renderMarkdown(post.content, { locale: 'en', assets })
    if (rendered.warnings.rawHtmlTags.length > 0) report.rawHtml.push({ postId: post.id, slug: post.slug, tags: rendered.warnings.rawHtmlTags })
    if (rendered.warnings.droppedLinks.length > 0) report.droppedLinks.push({ postId: post.id, urls: rendered.warnings.droppedLinks })
    if (rendered.warnings.externalImages.length > 0) report.externalImages.push({ postId: post.id, urls: rendered.warnings.externalImages })
    const columns = [...base, ['publishedAt', post.publishedAt ?? post.updatedAt] as const]
    const long: ReadonlyArray<readonly [string, string]> = [
      ['contentMd', post.content],
      ['contentHtml', rendered.html],
      ['toc', JSON.stringify(rendered.toc)],
    ]
    if (update && found !== undefined) {
      // publishedAt stays the first publish of this locale (§1.3): the update leaves it alone.
      statements.push(...writeRow('post_translations', base, long, { kind: 'update', olderThan: post.updatedAt }, ['readTimeMin', rendered.readTimeMin]))
      report.sourceWinsUpdated.push(post.id)
    } else {
      statements.push(...writeRow('post_translations', columns, long, { kind: 'insert' }, ['readTimeMin', rendered.readTimeMin]))
      report.translationsInserted.push(post.id)
    }
  }

  const taken = new Set(data.authors.flatMap((a) => (a.slug === null ? [] : [a.slug])))
  for (const author of data.authors) {
    if (author.slug !== null) continue
    const slug = uniqueSlug(slugify(author.name) || 'author', (s) => taken.has(s))
    taken.add(slug)
    statements.push(`UPDATE "author_profiles" SET "slug" = ${sqlString(slug)} WHERE "id" = ${sqlString(author.id)} AND "slug" IS NULL;`)
    report.authorSlugs.push({ authorId: author.id, slug })
  }

  return { statements, report: { posts: data.posts.length, ...report, statements: statements.length } }
}

/** Read-only checks after the run. Both counts must be 0 (cutover gate: published posts = `en` rows). */
export const VERIFY_QUERIES: Readonly<Record<string, string>> = {
  publishedWithoutEn: `SELECT count(*) AS n FROM posts p WHERE p.status = 'published' AND NOT EXISTS (SELECT 1 FROM post_translations t WHERE t.postId = p.id AND t.locale = 'en' AND t.readTimeMin > 0)`,
  halfWritten: `SELECT (SELECT count(*) FROM post_translations WHERE readTimeMin = ${WRITING}) + (SELECT count(*) FROM post_drafts WHERE revision = ${WRITING_REVISION}) AS n`,
}

/** Rows of a `wrangler d1 execute --json` result (an array of `{ results }`), or the rows themselves. */
export const rowsOf = (json: unknown): ReadonlyArray<unknown> => {
  if (!Array.isArray(json)) return []
  const first: unknown = json[0]
  if (typeof first === 'object' && first !== null && 'results' in first && Array.isArray(first.results)) return first.results
  return json
}

/** The verification counts that fail the run: anything but exactly 0 (a missing or unreadable count is NaN, a failure). */
export const failedChecks = (counts: Readonly<Record<string, number>>): ReadonlyArray<string> =>
  Object.entries(counts).flatMap(([name, n]) => (n === 0 ? [] : [name]))

export interface MaterializeResult {
  readonly report: Report
  readonly counts: Readonly<Record<string, number>>
  /** Names of the VERIFY_QUERIES whose count is not 0. The CLI exits non-zero when this is not empty. */
  readonly failed: ReadonlyArray<string>
}

/**
 * Export → plan → SQL file → execute → verify, through a `wrangler d1 execute` runner (staging.ts passes the staging
 * database with `--remote`; `--local` below uses the local one). `execJson` returns the parsed `--json` output.
 */
export const materializeVia = (deps: {
  readonly execJson: (command: string) => unknown
  readonly execFile: (file: string) => void
  readonly sqlFile: string
  readonly sourceWins: boolean
}): MaterializeResult => {
  const data = Object.fromEntries(
    Object.entries(EXPORT_QUERIES).map(([key, query]) => [key, rowsOf(deps.execJson(query))]),
  ) as unknown as LegacyExport
  const plan = planMaterialize(data, { sourceWins: deps.sourceWins })
  writeFileSync(deps.sqlFile, `${plan.statements.join('\n')}\n`)
  deps.execFile(deps.sqlFile)
  const counts: Record<string, number> = {}
  for (const [name, query] of Object.entries(VERIFY_QUERIES)) {
    const n = Number((rowsOf(deps.execJson(query))[0] as { n?: unknown } | undefined)?.n)
    counts[name] = n
    console.log(`verify ${name}: ${n}${n === 0 ? '' : '  <-- must be 0'}`)
  }
  return { report: plan.report, counts, failed: failedChecks(counts) }
}

/** Prints the report and ends the process: exit 1 when a verification count is not 0. */
export const finish = (result: MaterializeResult): never => {
  console.log(JSON.stringify(result.report, null, 2))
  if (result.failed.length > 0) {
    console.error(`verification failed: ${result.failed.join(', ')}`)
    process.exit(1)
  }
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const sourceWins = args.includes('--source-wins')
  if (args.includes('--local')) {
    // Local D1 only (`wrangler dev` / Lighthouse runs). Never remote from here: staging goes through scripts/staging.ts.
    const { spawnSync } = await import('node:child_process')
    const { mkdirSync } = await import('node:fs')
    const wrangler = (extra: ReadonlyArray<string>) => {
      const result = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'vizcad_auth', '--local', ...extra], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      if (result.status !== 0) {
        console.error(result.stderr)
        process.exit(result.status ?? 1)
      }
      return result.stdout
    }
    mkdirSync('.wrangler', { recursive: true })
    finish(
      materializeVia({
        execJson: (command) => JSON.parse(wrangler(['--json', `--command=${command}`])),
        execFile: (file) => void wrangler([`--file=${file}`, '--yes']),
        sqlFile: '.wrangler/materialize-legacy-translations.sql',
        sourceWins,
      }),
    )
  } else {
    const reportAt = args.indexOf('--report')
    const reportFile = reportAt >= 0 ? args[reportAt + 1] : undefined
    const positional = args.filter((a, i) => !a.startsWith('--') && (reportAt < 0 || i !== reportAt + 1))
    const [input, out] = positional
    if (input === undefined || out === undefined) {
      console.error('usage: node scripts/materializeLegacyTranslations.ts <export.json> <out.sql> [--source-wins] [--report <report.json>] | --local [--source-wins]')
      process.exit(1)
    }
    const data = JSON.parse(readFileSync(input, 'utf8')) as LegacyExport
    const plan = planMaterialize(data, { sourceWins })
    writeFileSync(out, `${plan.statements.join('\n')}\n`)
    const report = JSON.stringify(plan.report, null, 2)
    if (reportFile !== undefined) writeFileSync(reportFile, `${report}\n`)
    console.log(report)
  }
}
