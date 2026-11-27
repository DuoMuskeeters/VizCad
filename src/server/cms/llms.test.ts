import { describe, expect, it } from 'vitest'
import { buildLlmsTxt } from './llms'

describe('buildLlmsTxt', () => {
  it('follows llmstxt.org: title, one summary quote, sections of links', () => {
    const txt = buildLlmsTxt({
      summary: 'VizCad opens\n3D CAD files in the browser.',
      product: [{ title: 'Home', url: 'https://viz-cad.com/', description: 'What VizCad is' }],
      blog: [{ title: 'STEP [vs] IGES', url: 'https://viz-cad.com/blog/step (x)', description: 'A\nB' }],
      languages: [],
    })
    expect(txt.split('\n').slice(0, 3)).toEqual(['# VizCad', '', '> VizCad opens 3D CAD files in the browser.'])
    expect(txt).toContain('## Product\n\n- [Home](https://viz-cad.com/): What VizCad is')
    expect(txt).toContain('- [STEP \\[vs\\] IGES](https://viz-cad.com/blog/step%20%28x%29): A B')
    expect(txt).not.toContain('## Languages')
  })
})
