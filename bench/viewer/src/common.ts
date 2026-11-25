// Shared harness for both engine pages. Each page implements `Engine`; this file loads the file,
// measures phases and writes the result to `window.__bench` for the Playwright runner.

export type MeshData = {
	name: string
	color: [number, number, number] | null
	faceColors: number[][]
	position: Float32Array
	normal: Float32Array | null
	index: Uint32Array
}
export type TreeNode = { name: string; meshes: number[]; children: TreeNode[] }
export type Converted = { root: TreeNode; meshes: MeshData[] }

export type Engine = {
	name: string
	/** Build the scene from converted CAD data (per-part or merged, depending on `mode`). */
	buildCad(data: Converted, mode: string): void
	/** Parse an STL buffer on the main thread with the engine's own loader and add it. */
	buildStl(buf: ArrayBuffer): void
	/** Render one frame synchronously and wait for the GPU (readPixels of 1px). */
	renderSync(): void
	/** Rotate the camera a little around the model. */
	orbitStep(rad: number): void
	/** Pick at normalised device coords; returns true on hit. */
	pick(x: number, y: number): boolean
	prepareFastPick?(): void
	setSection(on: boolean): void
	/** Render a thumbnail off screen and encode it. */
	thumbnail(size: number): Promise<Blob>
	stats(): { drawables: number; triangles: number }
	treeNodes(): number
}

type LongTask = { start: number; duration: number }
const longTasks: LongTask[] = []
new PerformanceObserver((list) => {
	for (const e of list.getEntries()) longTasks.push({ start: e.startTime, duration: e.duration })
}).observe({ type: 'longtask', buffered: true })

export const blocking = (from: number, to: number) => {
	const inWindow = longTasks.filter((t) => t.start >= from && t.start <= to)
	return {
		tbtMs: Math.round(inWindow.reduce((s, t) => s + Math.max(0, t.duration - 50), 0)),
		maxLongTaskMs: Math.round(inWindow.reduce((m, t) => Math.max(m, t.duration), 0)),
	}
}

export const raf = () => new Promise<number>((r) => requestAnimationFrame(r))
const heapMB = () => {
	const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
	return m ? Math.round(m.usedJSHeapSize / 1e6) : null
}

export const convert = (url: string, format: string, deflection: number) =>
	new Promise<Converted & { timings: Record<string, number>; wasmHeapBytes: number; inputBytes: number }>((resolve, reject) => {
		const w = new Worker('/occt-worker.js')
		w.onmessage = (ev) => {
			w.terminate()
			if (ev.data.ok) resolve(ev.data)
			else reject(new Error(ev.data.error))
		}
		w.onerror = (e) => reject(new Error(e.message || 'worker error (likely out of memory)'))
		w.postMessage({
			url,
			format,
			params: { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: deflection, angularDeflection: 0.5 },
		})
	})

export async function runBench(engine: Engine) {
	const q = new URLSearchParams(location.search)
	const file = q.get('file') ?? 'as1-oc-214.stp'
	const mode = q.get('mode') ?? 'parts'
	const deflection = Number(q.get('defl') ?? 0.001)
	const ext = file.split('.').pop()!.toLowerCase()
	const out: Record<string, unknown> = { engine: engine.name, file, mode, deflection, ua: navigator.userAgent }
	const status = document.getElementById('status')!
	try {
		const gl = document.createElement('canvas').getContext('webgl2')
		const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
		out.gpu = dbg ? gl!.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'

		const t0 = performance.now()
		let tConverted = t0
		if (ext === 'stl') {
			const buf = await (await fetch(`/samples/${file}`)).arrayBuffer()
			tConverted = performance.now()
			out.fetchMs = Math.round(tConverted - t0)
			engine.buildStl(buf)
		} else {
			const r = await convert(`/samples/${file}`, ext === 'igs' || ext === 'iges' ? 'iges' : 'step', deflection)
			tConverted = performance.now()
			out.worker = Object.fromEntries(Object.entries(r.timings).map(([k, v]) => [k, Math.round(v)]))
			out.workerTotalMs = Math.round(tConverted - t0)
			out.wasmHeapMB = Math.round(r.wasmHeapBytes / 1e6)
			out.inputMB = +(r.inputBytes / 1e6).toFixed(1)
			out.meshes = r.meshes.length
			out.coloredMeshes = r.meshes.filter((m) => m.color).length
			out.faceColoredMeshes = r.meshes.filter((m) => m.faceColors.length).length
			out.namedMeshes = r.meshes.filter((m) => m.name).length
			engine.buildCad(r, mode)
		}
		const tBuilt = performance.now()
		engine.renderSync()
		const tFirst = performance.now()
		await raf()
		out.buildMs = Math.round(tBuilt - tConverted)
		out.firstRenderMs = Math.round(tFirst - tBuilt)
		out.ttffMs = Math.round(tFirst - t0)
		Object.assign(out, engine.stats(), { treeNodes: engine.treeNodes() })
		Object.assign(out, blocking(t0, performance.now()))
		out.heapAfterLoadMB = heapMB()

		// Orbit cost: synchronous render + GPU wait, 120 frames. Gives an uncapped ms/frame.
		const frames = Number(q.get('frames') ?? 120)
		const tOrbit = performance.now()
		for (let i = 0; i < frames; i++) {
			engine.orbitStep((2 * Math.PI) / frames)
			engine.renderSync()
		}
		const msPerFrame = (performance.now() - tOrbit) / frames
		out.orbitMsPerFrame = +msPerFrame.toFixed(2)
		out.orbitFps = Math.round(1000 / msPerFrame)

		// rAF-driven orbit for 3 s (what a user sees; capped by vsync unless flags disable it).
		let n = 0
		const tRaf = performance.now()
		while (performance.now() - tRaf < 3000) {
			engine.orbitStep(0.02)
			await raf()
			n++
		}
		out.rafFps = Math.round(n / ((performance.now() - tRaf) / 1000))

		// Picking: 20 random points around the centre.
		const pts = Array.from({ length: 20 }, (_, i) => [Math.sin(i * 1.7) * 0.4, Math.cos(i * 2.3) * 0.4] as const)
		let hits = 0
		let t = performance.now()
		for (const [x, y] of pts) if (engine.pick(x, y)) hits++
		out.pickMs = +((performance.now() - t) / pts.length).toFixed(2)
		out.pickHits = hits
		if (engine.prepareFastPick) {
			t = performance.now()
			engine.prepareFastPick()
			out.fastPickPrepareMs = Math.round(performance.now() - t)
			t = performance.now()
			for (const [x, y] of pts) engine.pick(x, y)
			out.fastPickMs = +((performance.now() - t) / pts.length).toFixed(2)
		}

		// Section plane on: ms/frame.
		engine.setSection(true)
		t = performance.now()
		for (let i = 0; i < 30; i++) {
			engine.orbitStep(0.05)
			engine.renderSync()
		}
		out.sectionMsPerFrame = +((performance.now() - t) / 30).toFixed(2)
		engine.setSection(false)

		// Thumbnail 512 px, WebP.
		t = performance.now()
		const blob = await engine.thumbnail(512)
		out.thumbnailMs = Math.round(performance.now() - t)
		out.thumbnailKB = Math.round(blob.size / 1024)
		;(window as unknown as { __thumb: Blob }).__thumb = blob
		out.heapEndMB = heapMB()
		out.ok = true
	} catch (e) {
		out.ok = false
		out.error = String(e)
	}
	status.textContent = JSON.stringify(out, null, 1)
	;(window as unknown as { __bench: unknown }).__bench = out
}

/** Bounding sphere helper shared by both engines. */
export function bounds(meshes: { position: Float32Array }[]) {
	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	for (const m of meshes)
		for (let i = 0; i < m.position.length; i += 3)
			for (let k = 0; k < 3; k++) {
				const v = m.position[i + k]
				if (v < min[k]) min[k] = v
				if (v > max[k]) max[k] = v
			}
	return { min, max }
}

export function countTree(n: TreeNode): number {
	return 1 + n.children.reduce((s, c) => s + countTree(c), 0)
}
