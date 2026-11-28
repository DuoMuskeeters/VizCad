import { describe, expect, it } from 'vitest'
import { isCompleteHtml } from '../../services/EdgeCache'
import { neutraliseRenderMarkers } from './blog'

describe('neutraliseRenderMarkers', () => {
  it("turns React's failed-render markers in post HTML into entities, leaving the rest as it was", () => {
    const html = '<p>React inserts <code>$RX("B:0")</code> and <img alt="<!--$!-->" src="/a.png"> here.</p>'
    const out = neutraliseRenderMarkers(html)
    expect(out).not.toContain('$RX(')
    expect(out).not.toContain('<!--$!-->')
    expect(out).toBe('<p>React inserts <code>&#36;RX("B:0")</code> and <img alt="&#x3C;!--$!-->" src="/a.png"> here.</p>')
    expect(neutraliseRenderMarkers('<p>plain</p>')).toBe('<p>plain</p>')
    // The page with the raw post would be refused by the edge cache (a 500 on every request); with it neutralised, stored.
    expect(isCompleteHtml(`<!doctype html><html><body>${html}</body></html>`)).toBe(false)
    expect(isCompleteHtml(`<!doctype html><html><body>${out}</body></html>`)).toBe(true)
  })
})
