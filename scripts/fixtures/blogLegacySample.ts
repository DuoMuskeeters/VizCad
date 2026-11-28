/**
 * Legacy-shaped sample blog data for staging and local runs (docs/12 §10.2): fake content written exactly as the
 * legacy Worker writes it (only the legacy `posts` / `author_profiles` columns, timestamps in seconds), so the cutover
 * script (`materializeLegacyTranslations`) has every case to handle:
 * - a normal post with legacy `/api/blog/image/...` images and a cover,
 * - a post with raw HTML (escaped by the script and listed in its report),
 * - a post with a slug that breaks the new slug rule (still opens at its old URL),
 * - a draft (stays invisible) and an archived post (410),
 * - enough extra posts for a second list page.
 * Ids and the author user are prefixed `fixture-` so they are easy to find and remove. Idempotent (`INSERT OR IGNORE`).
 *
 *   node scripts/fixtures/blogLegacySample.ts <out.sql>
 * The matching images go to R2 under `blog/fixture/` (IMAGES below; any PNG works, the content is not checked).
 */
import { writeFileSync } from 'node:fs'

const T = 1_764_000_000 // 2025-11-24
const q = (value: string | null) => (value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`)
const img = (name: string) => `/api/blog/image/${encodeURIComponent(`blog/fixture/${name}`)}`

export const IMAGES = ['cover-step.png', 'step-tree.png'] as const

export const STEP_POST = `STEP and IGES are the two neutral formats most CAD tools can write. This guide shows what each keeps, what each loses and how to open both in the browser.

## What a STEP file keeps

A STEP file (ISO 10303) stores exact geometry as B-rep solids, the assembly tree and, in AP242, product data such as names and colours.

![The assembly tree of a STEP file](${img('step-tree.png')})

- Solids and surfaces with exact curvature
- The assembly structure, with part names
- Colours and layers when the exporter writes them

## What an IGES file keeps

IGES is older. It is surface first: many exporters write trimmed surfaces only, so a viewer may show gaps where a solid had faces.

### When to use which

| Need | STEP | IGES |
|---|---|---|
| Solids | Yes | Often no |
| Assembly tree | Yes | No |
| Old CAM software | Sometimes | Yes |

## Opening them in VizCad

Upload the file, open it and use the tree to hide parts. Measurements use the exact geometry, not the mesh.

\`\`\`text
part.step -> upload -> open -> tree
\`\`\`

> Tip: keep the original file. A mesh export (STL) cannot be turned back into a solid.

Read more on [the ISO page](https://www.iso.org/standard/63141.html) or [contact us](mailto:hello@viz-cad.com).`

const RAW_HTML_POST = `Some legacy posts contain raw HTML.

<div class="callout" onclick="alert(1)">This box was raw HTML.</div>

<script>alert('never runs')</script>

The cutover script escapes it to text and lists the tags in its report.`

const ODD_SLUG_POST = `This post has a legacy slug with capitals and an underscore. It still opens at its old URL.

[A bad link](javascript:alert(1)) and an ![external image](https://example.com/x.png).`

interface FixturePost {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly content: string
  readonly status: 'published' | 'draft' | 'archived'
  readonly category: string
  readonly tags: ReadonlyArray<string>
  readonly cover: string | null
  readonly featured: boolean
  readonly at: number
}

const posts: ReadonlyArray<FixturePost> = [
  {
    id: 'fixture-step-vs-iges',
    slug: 'step-vs-iges',
    title: 'STEP vs IGES: what each format keeps',
    excerpt: 'Two neutral CAD formats, compared: geometry, assembly tree and what to send to whom.',
    content: STEP_POST,
    status: 'published',
    category: 'Guides',
    tags: ['step', 'iges', 'formats'],
    cover: img('cover-step.png'),
    featured: true,
    at: T,
  },
  {
    id: 'fixture-raw-html',
    slug: 'legacy-raw-html',
    title: 'A legacy post with raw HTML',
    excerpt: 'Raw HTML in old posts is shown as text after the cutover.',
    content: RAW_HTML_POST,
    status: 'published',
    category: 'Notes',
    tags: ['legacy'],
    cover: null,
    featured: false,
    at: T - 86_400,
  },
  {
    id: 'fixture-odd-slug',
    slug: 'Legacy_Odd_Slug',
    title: 'A legacy post with an odd slug',
    excerpt: 'Old slugs that break the new rule keep working until they are changed.',
    content: ODD_SLUG_POST,
    status: 'published',
    category: 'Notes',
    tags: ['legacy', 'formats'],
    cover: null,
    featured: false,
    at: T - 2 * 86_400,
  },
  {
    id: 'fixture-draft',
    slug: 'fixture-draft',
    title: 'A draft that must stay hidden',
    excerpt: 'Never public.',
    content: 'Draft body.',
    status: 'draft',
    category: 'Notes',
    tags: [],
    cover: null,
    featured: false,
    at: T - 3 * 86_400,
  },
  {
    id: 'fixture-archived',
    slug: 'fixture-archived',
    title: 'An archived post',
    excerpt: 'Answers 410.',
    content: 'Archived body.',
    status: 'archived',
    category: 'Notes',
    tags: [],
    cover: null,
    featured: false,
    at: T - 4 * 86_400,
  },
  ...Array.from({ length: 12 }, (_, i): FixturePost => ({
    id: `fixture-list-${i + 1}`,
    slug: `sample-post-${i + 1}`,
    title: `Sample post ${i + 1}: sharing a model with a supplier`,
    excerpt: 'A short sample post so the blog list has a second page.',
    content: `## Step ${i + 1}\n\nShare a link with view-only access, set an expiry and ask for comments on the model.`,
    status: 'published',
    category: i % 2 === 0 ? 'Guides' : 'Product',
    tags: i % 3 === 0 ? ['sharing'] : ['formats'],
    cover: null,
    featured: false,
    at: T - (10 + i) * 86_400,
  })),
]

export const fixtureStatements = (): ReadonlyArray<string> => [
  `INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('fixture-author', 'Deniz Fixture', 'fixture-author@example.invalid', 1, ${T - 400 * 86_400}, ${T - 400 * 86_400});`,
  `INSERT OR IGNORE INTO author_profiles (id, userId, name, bio, role, avatarUrl, socialLinks, createdAt, updatedAt) VALUES ('fixture-author-profile', 'fixture-author', 'Deniz Fixture', ${q('Mechanical engineer. Writes about CAD formats and design reviews.')}, 'Product engineer', NULL, ${q(JSON.stringify({ linkedin: 'https://www.linkedin.com/in/example' }))}, ${T - 400 * 86_400}, ${T - 400 * 86_400});`,
  ...posts.map(
    (p) =>
      `INSERT OR IGNORE INTO posts (id, slug, title, excerpt, content, coverImage, metaTitle, metaDescription, keywords, tableOfContents, publishedAt, status, category, tags, readTime, featured, views, authorId, createdAt, updatedAt) VALUES (${q(p.id)}, ${q(p.slug)}, ${q(p.title)}, ${q(p.excerpt)}, ${q(p.content)}, ${q(p.cover)}, NULL, NULL, ${q(JSON.stringify(p.tags))}, 1, ${p.status === 'draft' ? 'NULL' : p.at}, ${q(p.status)}, ${q(p.category)}, ${q(JSON.stringify(p.tags))}, 3, ${p.featured ? 1 : 0}, 0, 'fixture-author', ${p.at - 3600}, ${p.at});`,
  ),
]

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2]
  if (out === undefined) {
    console.error('usage: node scripts/fixtures/blogLegacySample.ts <out.sql>')
    process.exit(1)
  }
  writeFileSync(out, `${fixtureStatements().join('\n')}\n`)
  console.log(`wrote ${out}; images to upload under blog/fixture/: ${IMAGES.join(', ')}`)
}
