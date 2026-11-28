/**
 * RSS 2.0 (docs/12 §6.7). Pure. The newest posts of one locale; `description` is the excerpt (no full content).
 * Dates are RFC 822 (`toUTCString`), links absolute, every text through the sitemap's XML escape.
 */
import type { Locale } from '#/i18n/locales'
import { escapeXml } from './sitemap'

export interface RssItem {
  readonly title: string
  /** Absolute post URL; also the permalink guid. */
  readonly url: string
  readonly excerpt: string
  readonly category: string
  /** Unix seconds. */
  readonly publishedAt: number
  readonly updatedAt: number
}

export interface RssChannel {
  readonly title: string
  readonly description: string
  /** Absolute blog list URL. */
  readonly link: string
  /** Absolute feed URL (`atom:link rel="self"`). */
  readonly self: string
  readonly locale: Locale
  readonly items: ReadonlyArray<RssItem>
}

const rfc822 = (seconds: number) => new Date(seconds * 1000).toUTCString()

export const buildRss = (channel: RssChannel): string => {
  const newest = channel.items.reduce((max, item) => Math.max(max, item.updatedAt, item.publishedAt), 0)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${channel.locale}</language>`,
    `    <atom:link href="${escapeXml(channel.self)}" rel="self" type="application/rss+xml"/>`,
    ...(newest > 0 ? [`    <lastBuildDate>${rfc822(newest)}</lastBuildDate>`] : []),
    ...channel.items.flatMap((item) => [
      '    <item>',
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(item.url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(item.url)}</guid>`,
      `      <pubDate>${rfc822(item.publishedAt)}</pubDate>`,
      `      <category>${escapeXml(item.category)}</category>`,
      `      <description>${escapeXml(item.excerpt)}</description>`,
      '    </item>',
    ]),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
