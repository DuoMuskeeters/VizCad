/**
 * Safe markdown rendering (docs/12 §4.3). Pure and deterministic: the same input gives the same output.
 *
 * Runs only when content is saved: the admin preview and publish (6c) and the cutover script
 * (`scripts/materializeLegacyTranslations.ts`). A public request never renders markdown; it prints the stored
 * `contentHtml` (Free plan CPU, §7.5). Never import this module from a route or the Worker's public path.
 *
 * Pipeline: markdown → mdast (GFM: tables, task lists, strikethrough, footnotes, autolinks) → post-processing on the
 * tree → hast with raw HTML off → HTML string. Post-processing:
 * - Raw HTML nodes become escaped text (not dropped), and their tag names are reported (cutover report).
 * - Headings get a unique `id` (slug rule); h2–h3 form the table of contents. An h1 in content becomes h2: the page
 *   title is the only h1.
 * - Links: only `https:`, `mailto:` and relative URLs. Anything else (`javascript:`, `data:`, `http:`, `//host`) keeps
 *   its text and loses the link. External links get `rel="noopener"`; no `nofollow` (editorial content).
 * - Images: only `/api/blog/image/...` or an allowed origin (`https://viz-cad.com`). Others become a text link (or plain
 *   text) and a warning. Kept images get `loading="lazy"`, `decoding="async"`, the known width and height from
 *   `cms_assets` (CLS) and a `srcset` when the asset has variants.
 * - Code blocks: `<pre><code class="language-x">`, no highlighting.
 */
import type { Element as HastElement, Root as HastRoot } from 'hast'
import { toHtml } from 'hast-util-to-html'
import type { Definition, Heading, Image, Link, Nodes, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { toHast } from 'mdast-util-to-hast'
import { gfm } from 'micromark-extension-gfm'
import type { Locale } from '#/i18n/locales'
import { decodeComponent } from '../uri.ts'
import { slugify } from './slug.ts'

export interface TocEntry {
  readonly depth: number
  readonly id: string
  readonly text: string
}

/** What `cms_assets` knows about an uploaded image, by R2 key. */
export interface KnownAsset {
  readonly width: number
  readonly height: number
  /** Width → R2 key of a smaller copy, e.g. `{ "800": "blog/a/x-800.webp" }`. */
  readonly variants?: Readonly<Record<string, string>> | null
}

export interface RenderOptions {
  readonly locale: Locale
  /** Images by R2 key (decoded from `/api/blog/image/{key}`). */
  readonly assets?: ReadonlyMap<string, KnownAsset>
  /** Absolute origins whose images are kept as is. Default: `https://viz-cad.com`. */
  readonly imageOrigins?: ReadonlyArray<string>
}

export interface RenderWarnings {
  /** Tag names of raw HTML that was escaped to text, sorted and unique. */
  readonly rawHtmlTags: ReadonlyArray<string>
  /** Link URLs that were not allowed and lost their link. */
  readonly droppedLinks: ReadonlyArray<string>
  /** Image URLs from other hosts, turned into links or text. */
  readonly externalImages: ReadonlyArray<string>
}

export interface Rendered {
  /**
   * Set when the input is over a render cap (`RENDER_LIMITS`): `depth` (nesting, which would recurse the tree walkers
   * without bound) or `output` (HTML larger than a stored row should hold). `html` is then empty: nothing may go live.
   */
  readonly exceeded?: 'depth' | 'output'
  readonly html: string
  readonly toc: ReadonlyArray<TocEntry>
  readonly readTimeMin: number
  readonly warnings: RenderWarnings
}

/** Words per minute per locale (§4.3). */
export const WORDS_PER_MINUTE: Readonly<Record<Locale, number>> = { en: 230, tr: 190, de: 200, es: 220, fr: 210 }

export const BLOG_IMAGE_PREFIX = '/api/blog/image/'
const DEFAULT_IMAGE_ORIGINS = ['https://viz-cad.com']

/** `/api/blog/image/{encodeURIComponent(r2Key)}`: the legacy URL shape, kept for new uploads too (§7.3). */
export const blogImageUrl = (r2Key: string): string => `${BLOG_IMAGE_PREFIX}${encodeURIComponent(r2Key)}`

/** The R2 key of a blog image URL (relative or on an allowed origin), or null. Only `blog/` keys. */
export const blogImageKey = (url: string, origins: ReadonlyArray<string> = DEFAULT_IMAGE_ORIGINS): string | null => {
  const path = origins.reduce((p, origin) => (p.startsWith(`${origin}/`) ? p.slice(origin.length) : p), url)
  if (!path.startsWith(BLOG_IMAGE_PREFIX)) return null
  const encoded = path.slice(BLOG_IMAGE_PREFIX.length).split(/[?#]/)[0] ?? ''
  const key = decodeComponent(encoded)
  return key !== null && key.startsWith('blog/') && !key.includes('..') ? key : null
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

type LinkKind = 'relative' | 'external' | 'mailto' | 'unsafe'

/** Classifies a link target (§4.3): https, mailto and relative are allowed; everything else is unsafe. */
export const classifyLink = (url: string): LinkKind => {
  // Browsers ignore leading control characters and spaces and strip tabs/newlines inside the scheme.
  const trimmed = url.replace(/[\u0000- ]/g, '')
  if (trimmed.startsWith('//') || trimmed.startsWith('\\')) return 'unsafe'
  const scheme = SCHEME.exec(trimmed)?.[1]?.toLowerCase()
  if (scheme === undefined) return 'relative'
  if (scheme === 'https') return 'external'
  if (scheme === 'mailto') return 'mailto'
  return 'unsafe'
}

const BLOCK_PARENTS: ReadonlySet<string> = new Set(['root', 'blockquote', 'list', 'listItem', 'table', 'tableRow', 'footnoteDefinition'])

/** Plain text of a node: inline children join directly, block children with a space (word count, heading text). */
const textOf = (node: Nodes): string => {
  if ('value' in node && typeof node.value === 'string' && node.type !== 'html') return node.value
  if (node.type === 'image') return node.alt ?? ''
  if ('children' in node) return (node.children as ReadonlyArray<Nodes>).map(textOf).join(BLOCK_PARENTS.has(node.type) ? ' ' : '')
  return ''
}

const text = (value: string): Text => ({ type: 'text', value })

interface Context {
  readonly options: RenderOptions
  readonly origins: ReadonlyArray<string>
  readonly definitions: ReadonlyMap<string, Definition>
  readonly ids: Map<string, number>
  readonly toc: Array<TocEntry>
  readonly rawHtmlTags: Set<string>
  readonly droppedLinks: Array<string>
  readonly externalImages: Array<string>
}

const headingId = (ctx: Context, heading: Heading): string => {
  const base = slugify(textOf(heading)) || 'section'
  const seen = ctx.ids.get(base) ?? 0
  ctx.ids.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen + 1}`
}

const linkNode = (ctx: Context, url: string, title: string | null | undefined, children: Array<PhrasingContent>): Array<PhrasingContent> => {
  const kind = classifyLink(url)
  if (kind === 'unsafe') {
    ctx.droppedLinks.push(url)
    return children
  }
  const link: Link = { type: 'link', url, title: title ?? null, children }
  if (kind === 'external') link.data = { hProperties: { rel: ['noopener'] } }
  return [link]
}

const imageNode = (ctx: Context, url: string, alt: string, title: string | null | undefined): Array<PhrasingContent> => {
  const key = blogImageKey(url, ctx.origins)
  const onAllowedOrigin = ctx.origins.some((origin) => url.startsWith(`${origin}/`))
  if (key === null && !onAllowedOrigin) {
    ctx.externalImages.push(url)
    // A safe link to the image keeps the reference without loading a third-party image on our page.
    const label = alt.trim() === '' ? url : alt
    return classifyLink(url) === 'external' ? [{ type: 'link', url, title: null, data: { hProperties: { rel: ['noopener'] } }, children: [text(label)] }] : [text(alt)]
  }
  const asset = key === null ? undefined : ctx.options.assets?.get(key)
  const properties: Record<string, string | number> = { loading: 'lazy', decoding: 'async' }
  if (asset !== undefined) {
    properties.width = asset.width
    properties.height = asset.height
    const variants = Object.entries(asset.variants ?? {})
      .map(([width, variantKey]) => [Number(width), variantKey] as const)
      .filter(([width]) => Number.isInteger(width) && width > 0 && width < asset.width)
      .sort((a, b) => a[0] - b[0])
    if (variants.length > 0) {
      properties.srcSet = [...variants.map(([width, variantKey]) => `${blogImageUrl(variantKey)} ${width}w`), `${url} ${asset.width}w`].join(', ')
      properties.sizes = '(min-width: 48rem) 44rem, 100vw'
    }
  }
  const image: Image = { type: 'image', url, alt, title: title ?? null, data: { hProperties: properties } }
  return [image]
}

const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g

/** Rewrites one node into zero or more nodes (the tree is rebuilt, never mutated in place). */
const transform = (ctx: Context, node: RootContent): Array<RootContent> => {
  switch (node.type) {
    case 'html': {
      for (const match of node.value.matchAll(TAG)) if (match[1] !== undefined) ctx.rawHtmlTags.add(match[1].toLowerCase())
      return [text(node.value)]
    }
    case 'definition':
      // Resolved into the references below; dropping them keeps unsafe URLs out of the tree entirely.
      return []
    case 'link':
      return linkNode(ctx, node.url, node.title, transformChildren(ctx, node.children))
    case 'linkReference': {
      const definition = ctx.definitions.get(node.identifier.toLowerCase())
      const children = transformChildren(ctx, node.children)
      return definition === undefined ? [text(`[`), ...children, text(`]`)] : linkNode(ctx, definition.url, definition.title, children)
    }
    case 'image':
      return imageNode(ctx, node.url, node.alt ?? '', node.title)
    case 'imageReference': {
      const definition = ctx.definitions.get(node.identifier.toLowerCase())
      return definition === undefined ? [text(node.alt ?? '')] : imageNode(ctx, definition.url, node.alt ?? '', definition.title)
    }
    case 'heading': {
      const depth = node.depth === 1 ? 2 : node.depth
      const heading: Heading = { type: 'heading', depth, children: transformChildren(ctx, node.children) }
      const id = headingId(ctx, heading)
      heading.data = { hProperties: { id } }
      if (depth === 2 || depth === 3) ctx.toc.push({ depth, id, text: textOf(heading).trim() })
      return [heading]
    }
    default:
      if ('children' in node) return [{ ...node, children: transformChildren(ctx, (node as Parent).children as Array<RootContent>, BLOCK_CONTAINERS.has(node.type)) } as RootContent]
      return [node]
  }
}

/** Parents whose children are blocks: escaped raw HTML there becomes a paragraph, like any other block of text. */
const BLOCK_CONTAINERS: ReadonlySet<string> = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition'])

const transformChildren = <T extends RootContent>(ctx: Context, children: ReadonlyArray<T>, block = false): Array<T> =>
  children.flatMap((child) => {
    const out = transform(ctx, child)
    return block && child.type === 'html' ? out.map((node): RootContent => (node.type === 'text' ? { type: 'paragraph', children: [node] } : node)) : out
  }) as Array<T>

const collectDefinitions = (node: Nodes, into: Map<string, Definition>) => {
  if (node.type === 'definition') {
    const id = node.identifier.toLowerCase()
    if (!into.has(id)) into.set(id, node)
  }
  if ('children' in node) for (const child of node.children as ReadonlyArray<Nodes>) collectDefinitions(child, into)
}

const countWords = (value: string) => value.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length

/** Footnote back-reference labels and the section heading are English by default; the page language is set here. */
const FOOTNOTE_LABEL: Readonly<Record<Locale, string>> = { en: 'Footnotes', tr: 'Dipnotlar', de: 'Fußnoten', es: 'Notas', fr: 'Notes' }

/**
 * Caps on what a render may produce. Real posts nest a few levels (a list in a quote in a list); 32 leaves room while
 * keeping the recursive walkers (ours, mdast-util-to-hast, hast-util-to-html) far from the stack limit. 512 KiB of
 * HTML is far above any post (reference links can repeat one long URL many times) and well under D1's row limit.
 */
export const RENDER_LIMITS = { depth: 32, htmlBytes: 512 * 1024 } as const

/** The deepest nesting of the tree, walked without recursion (the input may be built to be deep). */
const treeDepth = (root: Nodes) => {
  let max = 0
  const stack: Array<readonly [Nodes, number]> = [[root, 0]]
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const [node, depth] = item
    if (depth > max) max = depth
    if (max > RENDER_LIMITS.depth) return max
    if ('children' in node) for (const child of node.children as ReadonlyArray<Nodes>) stack.push([child, depth + 1])
  }
  return max
}

/**
 * The most container markers (`>`, `-`, `*`, `+`, `1.`, `1)`) one line opens before its text. micromark's nesting cost
 * grows with the square of this run (`- - - … x`: 2000 levels ≈ 0.7 s, 5000 overflow the stack), so an input over
 * the cap is refused before it is parsed. Nesting by indentation needs two spaces per level and stays small.
 */
const markerDepth = (markdown: string) => {
  let max = 0
  for (const line of markdown.split('\n')) {
    let depth = 0
    let i = 0
    for (;;) {
      while (line[i] === ' ' || line[i] === '\t') i++
      const c = line[i]
      if (c === '>') i++
      else if ((c === '-' || c === '*' || c === '+') && (i + 1 >= line.length || line[i + 1] === ' ' || line[i + 1] === '\t')) i++
      else {
        let j = i
        while (j < line.length && j - i < 9 && line[j]! >= '0' && line[j]! <= '9') j++
        if (j === i || (line[j] !== '.' && line[j] !== ')') || (j + 1 < line.length && line[j + 1] !== ' ' && line[j + 1] !== '\t')) break
        i = j + 1
      }
      if (++depth > RENDER_LIMITS.depth) return depth
    }
    if (depth > max) max = depth
  }
  return max
}

const exceeded = (kind: 'depth' | 'output'): Rendered => ({ exceeded: kind, html: '', toc: [], readTimeMin: 1, warnings: { rawHtmlTags: [], droppedLinks: [], externalImages: [] } })

export const renderMarkdown = (markdown: string, options: RenderOptions): Rendered => {
  if (markerDepth(markdown) > RENDER_LIMITS.depth) return exceeded('depth')
  const tree: Root = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  if (treeDepth(tree) > RENDER_LIMITS.depth) return exceeded('depth')
  const definitions = new Map<string, Definition>()
  collectDefinitions(tree, definitions)
  const ctx: Context = {
    options,
    origins: options.imageOrigins ?? DEFAULT_IMAGE_ORIGINS,
    definitions,
    ids: new Map(),
    toc: [],
    rawHtmlTags: new Set(),
    droppedLinks: [],
    externalImages: [],
  }
  const safe: Root = { type: 'root', children: transformChildren(ctx, tree.children, true) }
  const hast = toHast(safe, { allowDangerousHtml: false, footnoteLabel: FOOTNOTE_LABEL[options.locale] }) as HastRoot | HastElement
  const html = toHtml(hast, { allowDangerousHtml: false })
  // Characters × 3 bounds the UTF-8 size; only a long result pays for the exact count.
  if (html.length * 3 > RENDER_LIMITS.htmlBytes && new TextEncoder().encode(html).length > RENDER_LIMITS.htmlBytes) return exceeded('output')
  return {
    html,
    toc: ctx.toc,
    readTimeMin: Math.max(1, Math.round(countWords(textOf(safe)) / WORDS_PER_MINUTE[options.locale])),
    warnings: {
      rawHtmlTags: [...ctx.rawHtmlTags].sort(),
      droppedLinks: ctx.droppedLinks,
      externalImages: ctx.externalImages,
    },
  }
}
