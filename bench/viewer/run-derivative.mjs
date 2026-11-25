// Runs derivative.html (STEP -> GLB once, then open the GLB in three.js and vtk.js, thumbnail in a Worker).
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const files = (process.argv[2] ?? 'as1-oc-214.stp,nist_ftc_10_asme1_ap242-e2.stp,MiniSB_Bowden.step,Stealthburner_CW2.5_Assembly.step').split(',')
const throttle = Number(process.argv[3] ?? 1)
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', '5199', '--strictPort'], { stdio: 'pipe' })
process.on('exit', () => server.kill())
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('5199') && r()))
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] })
const results = []
for (const file of files) {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	const page = await ctx.newPage()
	const cdp = await ctx.newCDPSession(page)
	await page.goto(`http://localhost:5199/derivative.html?file=${file}`)
	// Throttle only after conversion has started? No: the GLB phases are main-thread work, so throttle the whole page.
	if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
	await page.waitForFunction(() => window.__bench, null, { timeout: 20 * 60_000, polling: 500 })
	const r = await page.evaluate(() => window.__bench)
	r.throttle = throttle
	console.log(JSON.stringify(r))
	results.push(r)
	await ctx.close()
}
writeFileSync(`results/derivative${throttle > 1 ? `-throttle${throttle}` : ''}.json`, JSON.stringify(results, null, 1))
await browser.close()
process.exit(0)
