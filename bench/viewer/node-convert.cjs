// Quick sanity check: occt-import-js conversion in Node (no browser). Usage: node node-convert.cjs <file> [linearDeflection]
const fs = require('fs')
const file = process.argv[2]
const defl = Number(process.argv[3] ?? 0.001)
require('occt-import-js')().then((occt) => {
	const buf = fs.readFileSync(file)
	const t0 = performance.now()
	const r = occt.ReadStepFile(buf, { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: defl, angularDeflection: 0.5 })
	const t1 = performance.now()
	let tris = 0, verts = 0, colored = 0, faceColored = 0
	for (const m of r.meshes) { tris += m.index.array.length / 3; verts += m.attributes.position.array.length / 3; if (m.color) colored++; if (m.brep_faces.some((f) => f.color)) faceColored++ }
	let nodes = 0, named = 0
	const walk = (n) => { nodes++; if (n.name) named++; n.children.forEach(walk) }
	walk(r.root)
	console.log(JSON.stringify({ file: file.split('/').pop(), mb: +(buf.length / 1e6).toFixed(1), defl, ok: r.success, ms: Math.round(t1 - t0), meshes: r.meshes.length, tris, verts, colored, faceColored, nodes, named, wasmMB: Math.round(occt.HEAPU8.buffer.byteLength / 1e6), rssMB: Math.round(process.memoryUsage().rss / 1e6) }))
})
