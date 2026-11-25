// Runs every engine x file case in Chromium via Playwright against `vite preview` (production build).
// Usage: node run-bench.mjs [--throttle 4] [--runs 3] [--only three,vtk] [--files a.step,b.stl] [--headed] [--out name]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const arg = (name, def) => {
	const i = process.argv.indexOf(`--${name}`)
	return i > -1 ? process.argv[i + 1] : def
}
const throttle = Number(arg('throttle', 1))
const runs = Number(arg('runs', 1))
const engines = arg('only', 'vtk,three').split(',')
const modes = arg('modes', 'parts,merged').split(',')
const files = arg('files', 'as1-oc-214.stp,nist_ftc_10_asme1_ap242-e2.stp,MiniSB_Bowden.step,Stealthburner_CW2.5_Assembly.step,dragon.stl,stealthburner.stl').split(',')
const out = arg('out', throttle > 1 ? `results-throttle${throttle}` : 'results-desktop')
const headed = process.argv.includes('--headed')
const PORT = 5199

const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
process.on('exit', () => server.kill())
process.on('uncaughtException', (e) => {
	console.error(e)
	server.kill()
	process.exit(1)
})
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()))

const browser = await chromium.launch({
	headless: !headed,
	channel: 'chromium', // full Chromium in new headless mode (real GPU), not headless-shell
	args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096'],
})
mkdirSync('results', { recursive: true })
const results = []
for (const file of files)
	for (const engine of engines)
		for (const mode of file.endsWith('.stl') ? ['parts'] : modes)
			for (let run = 0; run < runs; run++) {
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
				const page = await ctx.newPage()
				const cdp = await ctx.newCDPSession(page)
				if (throttle > 1) {
					await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
					// Note: this throttles the page's main thread. Whether the worker is throttled is checked in the results (readMs ratio).
				}
				const label = `${engine}/${mode} ${file} #${run + 1}`
				process.stdout.write(`${label} ... `)
				const t = Date.now()
				let r
				try {
					await page.goto(`http://localhost:${PORT}/${engine}.html?file=${file}&mode=${mode}`)
					await page.waitForFunction(() => window.__bench, null, { timeout: 15 * 60_000, polling: 500 })
					r = await page.evaluate(() => window.__bench)
					if (r.ok && run === 0) {
						const b64 = await page.evaluate(async () => {
							const buf = new Uint8Array(await window.__thumb.arrayBuffer())
							let s = ''
							for (const x of buf) s += String.fromCharCode(x)
							return btoa(s)
						})
						writeFileSync(`results/${engine}-${mode}-${file}.webp`, Buffer.from(b64, 'base64'))
					}
				} catch (e) {
					r = { engine, file, mode, ok: false, error: String(e).slice(0, 300) }
				}
				r.run = run + 1
				r.throttle = throttle
				r.wallMs = Date.now() - t
				results.push(r)
				console.log(r.ok ? `ttff ${r.ttffMs} ms, orbit ${r.orbitMsPerFrame} ms/frame` : `FAIL ${r.error}`)
				writeFileSync(`results/${out}.json`, JSON.stringify(results, null, 1))
				await ctx.close()
			}
await browser.close()
server.kill()
