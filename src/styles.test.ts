import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync('design/tokens.css', 'utf8')
const stylesCss = readFileSync('src/styles.css', 'utf8')

/** Custom properties declared in the first `:root { ... }` block (the light theme). */
const rootTokens = () => {
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(tokensCss)?.[1] ?? ''
  return new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
}

/** Every `var(--x)` used in the `@theme inline reference` block of styles.css. */
const referenced = () => {
  const block = /@theme inline reference\s*\{([\s\S]*?)\n\}/.exec(stylesCss)?.[1] ?? ''
  return new Set([...block.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]))
}

// Tokens with no Tailwind utility on purpose: spacing steps come from the 4px `--spacing` multiplier
// (space-1), and durations are used directly as var(--dur-*).
const unmapped = /^--(space-(?!1$)\d+|dur-\w+)$/

describe('design tokens → Tailwind', () => {
  it('every utility points at a token that exists in design/tokens.css', () => {
    const tokens = rootTokens()
    expect(tokens.size).toBeGreaterThan(40)
    expect([...referenced()].filter((name) => !tokens.has(name))).toEqual([])
  })

  it('every token in design/tokens.css is available as a utility (or deliberately unmapped)', () => {
    const used = referenced()
    expect([...rootTokens()].filter((name) => !used.has(name) && !unmapped.test(name ?? ''))).toEqual([])
  })

  it('values live only in tokens.css: the theme block holds no literal colors except white', () => {
    const block = /@theme inline reference\s*\{([\s\S]*?)\n\}/.exec(stylesCss)?.[1] ?? ''
    expect(block.match(/#[0-9a-f]{3,8}\b/gi)).toEqual(['#ffffff'])
  })
})
