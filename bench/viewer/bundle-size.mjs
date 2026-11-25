// Gzip size of each viewer entry (entry + static imports) and its lazy chunks, from dist/.vite/manifest.json.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))
const gz = (f) => gzipSync(readFileSync(`dist/${f}`), { level: 9 }).length
const raw = (f) => readFileSync(`dist/${f}`).length
const kb = (n) => `${(n / 1024).toFixed(0)} KB`
for (const [key, chunk] of Object.entries(manifest)) {
	if (!chunk.isEntry) continue
	const files = new Set()
	const walk = (k) => {
		const c = manifest[k]
		if (files.has(c.file)) return
		files.add(c.file)
		for (const i of c.imports ?? []) walk(i)
	}
	walk(key)
	const lazy = (chunk.dynamicImports ?? []).map((k) => manifest[k].file)
	const sum = (fs, f) => [...fs].reduce((s, x) => s + f(x), 0)
	console.log(`${key}: initial ${kb(sum(files, raw))} raw / ${kb(sum(files, gz))} gzip; lazy ${lazy.map((f) => `${f} ${kb(gz(f))} gzip`).join(', ') || '-'}`)
}
const wasm = 'node_modules/occt-import-js/dist/occt-import-js.wasm'
console.log(`occt-import-js.wasm (shared by both): ${kb(readFileSync(wasm).length)} raw / ${kb(gzipSync(readFileSync(wasm), { level: 9 }).length)} gzip`)
