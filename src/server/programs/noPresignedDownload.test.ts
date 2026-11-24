import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// docs/09 §3.2: user content is never handed out through a presigned GET; delivery goes through the Worker.
describe('presigned downloads', () => {
  it('no program or http handler calls presignDownload', () => {
    const roots = [new URL('./', import.meta.url), new URL('../http/', import.meta.url)]
    const offenders = roots.flatMap((root) =>
      readdirSync(root).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
        .filter((name) => readFileSync(new URL(name, root), 'utf8').includes('presignDownload')))
    expect(offenders).toEqual([])
  })
})
