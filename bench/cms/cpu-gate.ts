/**
 * CPU gate (docs/12 §7.5 item 1), measured locally in Node (V8, like workerd):
 *   node bench/cms/cpu-gate.ts
 * 1. `renderMarkdown` (+ the render-marker pass the publish adds) on the longest fixture post and on synthetic posts
 *    of growing size (tables, many headings, links and images: the §7.5 worst case shape).
 * 2. The image upload's per-request work on a 5 MB body: magic bytes, header dimensions, SHA-256 (WebCrypto).
 * Prints the median and p95 of warm runs (the first runs JIT-compile and are dropped). Results go in docs/12 §7.5.
 */
import { performance } from 'node:perf_hooks'
import { renderMarkdown } from '../../src/server/cms/markdown.ts'
import { STEP_POST } from '../../scripts/fixtures/blogLegacySample.ts'

const WARMUP = 20
const RUNS = 60

const stats = (samples: Array<number>) => {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  return { median: at(0.5), p95: at(0.95) }
}

const time = async (fn: () => unknown | Promise<unknown>) => {
  for (let i = 0; i < WARMUP; i++) await fn()
  const samples: Array<number> = []
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now()
    await fn()
    samples.push(performance.now() - start)
  }
  return stats(samples)
}

const img = (n: number) => `/api/blog/image/${encodeURIComponent(`blog/a/01J${String(n).padStart(23, '0')}.webp`)}`

/** One ~1.1 KB block of the worst-case shape: headings, a table, links, an image, a list, code, emphasis. */
const block = (i: number) => `## Section ${i}: tolerances and fits

A **STEP** file keeps exact geometry; an _IGES_ file keeps surfaces. See [the ISO page](https://www.iso.org/standard/${i}.html), [our guide](/blog/step-vs-iges) and [mail us](mailto:hello@viz-cad.com).

![Assembly tree ${i}](${img(i)})

### Checklist ${i}

- [x] Solids and surfaces with exact curvature
- [ ] The assembly structure, with part names
- Colours and ~~layers~~ when the exporter writes them

| Need | STEP | IGES | Mesh |
|---|---|---|---|
| Solids | Yes | Often no | No |
| Assembly tree | Yes | No | No |
| Old CAM software | Sometimes | Yes | Yes |

\`\`\`text
part-${i}.step -> upload -> open -> tree
\`\`\`

`

const synthetic = (bytes: number) => {
  let out = ''
  for (let i = 0; out.length < bytes; i++) out += block(i)
  return out.slice(0, bytes)
}

const neutralise = (html: string) => html.replaceAll('$RX(', '&#36;RX(').replaceAll('<!--$!-->', '&#x3C;!--$!-->')
const publishWork = (md: string) => () => neutralise(renderMarkdown(md, { locale: 'en' }).html)

const kb = (n: number) => `${Math.round(n / 1024)} KB`
const ms = (n: number) => n.toFixed(2)

console.log(`renderMarkdown (warm, ${RUNS} runs, median / p95 ms)`)
const fixture = await time(publishWork(STEP_POST))
console.log(`  longest fixture post (${STEP_POST.length} B): ${ms(fixture.median)} / ${ms(fixture.p95)}`)
for (const size of [8, 16, 24, 32, 48, 64, 100, 200]) {
  const md = synthetic(size * 1024)
  const r = await time(publishWork(md))
  console.log(`  synthetic ${kb(md.length)}: ${ms(r.median)} / ${ms(r.p95)}`)
}

console.log(`image upload checks (warm, ${RUNS} runs, median / p95 ms)`)
for (const mb of [1, 2, 3, 5]) {
  const body = new Uint8Array(mb * 1024 * 1024)
  for (let i = 0; i < body.length; i += 4096) body[i] = i & 255
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const r = await time(async () => {
    const isPng = body[0] === 0x89 && body[1] === 0x50
    const view = new DataView(body.buffer)
    void (isPng && view.getUint32(16) + view.getUint32(20))
    await crypto.subtle.digest('SHA-256', body)
  })
  console.log(`  ${mb} MB: ${ms(r.median)} / ${ms(r.p95)}`)
}
