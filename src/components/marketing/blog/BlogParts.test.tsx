import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BlogMessage } from './BlogParts'

describe('BlogMessage', () => {
  it('links to the blog of the locale, or to the en blog where the locale has none (never to the 404 itself)', () => {
    const href = (locale: 'en' | 'tr' | 'de') => /href="([^"]+)"/.exec(renderToStaticMarkup(<BlogMessage locale={locale} title="t" body="b" />))?.[1]
    expect(href('en')).toBe('/blog')
    expect(href('tr')).toBe('/blog')
    expect(href('de')).toBe('/blog')
  })
})
