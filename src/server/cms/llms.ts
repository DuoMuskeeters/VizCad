/**
 * `/llms.txt` (docs/12 §6.6, llmstxt.org). Pure, English. Lists only pages that exist (03 §6: never promise what the
 * product does not do): 6b has the landing and the blog; pricing, FAQ, contact and legal pages join the Product
 * section when their phases ship (6d, 6e). Markdown link text and descriptions are kept on one line.
 */
export interface LlmsLink {
  readonly title: string
  /** Absolute URL. */
  readonly url: string
  readonly description?: string
}

export interface LlmsInput {
  readonly summary: string
  readonly product: ReadonlyArray<LlmsLink>
  readonly blog: ReadonlyArray<LlmsLink>
  readonly languages: ReadonlyArray<LlmsLink>
}

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim()
/** `[`, `]` would end the link text early; `(`/`)` in URLs are percent-encoded. */
const linkText = (value: string) => oneLine(value).replace(/[[\]]/g, (ch) => `\\${ch}`)
const linkUrl = (value: string) => value.replace(/[()\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)

const line = (link: LlmsLink) => `- [${linkText(link.title)}](${linkUrl(link.url)})${link.description ? `: ${oneLine(link.description)}` : ''}`

const section = (title: string, links: ReadonlyArray<LlmsLink>) => (links.length === 0 ? [] : ['', `## ${title}`, '', ...links.map(line)])

export const buildLlmsTxt = (input: LlmsInput): string =>
  [
    '# VizCad',
    '',
    `> ${oneLine(input.summary)}`,
    ...section('Product', input.product),
    ...section('Blog', input.blog),
    ...section('Languages', input.languages),
    '',
  ].join('\n')
