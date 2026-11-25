// Classic worker shared by both engines. Fetches the file itself so the main thread never holds the STEP bytes.
// Returns typed arrays (transferred, zero copy) plus timings and the WASM heap size (the heap never shrinks, so it is the peak).
importScripts('occt-import-js.js')

let occtPromise = null
const init = () => (occtPromise ??= occtimportjs({ locateFile: (p) => p }))

onmessage = async (ev) => {
	const { url, format, params } = ev.data
	const t0 = performance.now()
	const res = await fetch(url)
	const bytes = new Uint8Array(await res.arrayBuffer())
	const t1 = performance.now()
	const occt = await init()
	const t2 = performance.now()
	const r = occt.ReadFile(format, bytes, params)
	const t3 = performance.now()
	if (!r.success) {
		postMessage({ ok: false, error: 'occt failed' })
		return
	}
	const transfer = []
	const meshes = r.meshes.map((m) => {
		const position = new Float32Array(m.attributes.position.array)
		const normal = m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null
		const index = new Uint32Array(m.index.array)
		transfer.push(position.buffer, index.buffer)
		if (normal) transfer.push(normal.buffer)
		// Face colours (b-rep faces with their own colour) as [firstTri, lastTri, r, g, b] runs.
		const faceColors = []
		for (const f of m.brep_faces) if (f.color) faceColors.push([f.first, f.last, ...f.color])
		return { name: m.name, color: m.color ?? null, faceColors, position, normal, index }
	})
	const strip = (n) => ({ name: n.name, meshes: n.meshes, children: n.children.map(strip) })
	const t4 = performance.now()
	postMessage(
		{
			ok: true,
			root: strip(r.root),
			meshes,
			timings: { fetchMs: t1 - t0, wasmInitMs: t2 - t1, readMs: t3 - t2, packMs: t4 - t3 },
			wasmHeapBytes: occt.HEAPU8.buffer.byteLength,
			inputBytes: bytes.byteLength,
		},
		transfer,
	)
}
