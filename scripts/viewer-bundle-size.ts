/**
 * Gzip size of the viewer's chunks after `pnpm build` (docs/11 §6: viewer chunk ≤ 160 KB gzip, WASM excluded).
 * Usage: node scripts/viewer-bundle-size.ts. Warns (exit code 1) when the viewer chunk is over budget.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 160
const dir = 'dist/client/assets'
const files = readdirSync(dir)
const kb = (bytes: number) => Math.round(bytes / 1000)
const measure = (name: string) => {
  const bytes = readFileSync(join(dir, name))
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length }
}
const pick = (pattern: RegExp) => files.filter((name) => pattern.test(name))

const rows: Array<[string, string]> = [
  ['viewer chunk (three.js, scene, UI)', '^Viewer\\.client-.*\\.js$'],
  ['parse Worker (three.js, readers, thumbnail)', '^parse\\.worker-.*\\.js$'],
  ['pipeline (main thread, also used by uploads)', '^pipeline-.*\\.js$'],
  ['occt-import-js glue (Worker, STEP/IGES only)', '^occt-import-js-.*\\.js$'],
  ['occt-import-js.wasm (Worker, STEP/IGES only)', '^occt-import-js-.*\\.wasm$'],
]
let viewer = 0
for (const [label, pattern] of rows) {
  const matched = pick(new RegExp(pattern))
  if (matched.length === 0) {
    console.log(`${label}: not found (run pnpm build first)`)
    continue
  }
  const size = matched.map(measure).reduce((a, b) => ({ raw: a.raw + b.raw, gzip: a.gzip + b.gzip }), { raw: 0, gzip: 0 })
  if (label.startsWith('viewer chunk')) viewer = size.gzip
  console.log(`${label}: ${kb(size.raw)} KB raw / ${kb(size.gzip)} KB gzip`)
}
if (kb(viewer) > BUDGET_KB) {
  console.log(`WARNING: viewer chunk ${kb(viewer)} KB gzip is over the ${BUDGET_KB} KB budget`)
  process.exitCode = 1
} else console.log(`viewer chunk within budget (${kb(viewer)} / ${BUDGET_KB} KB gzip)`)
