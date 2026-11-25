// Writes a binary STL from a STEP file via occt-import-js (used to get a large STL sample). Usage: node make-stl.cjs in.step out.stl
const fs = require('fs')
require('occt-import-js')().then((occt) => {
	const r = occt.ReadStepFile(fs.readFileSync(process.argv[2]), null)
	let n = 0
	for (const m of r.meshes) n += m.index.array.length / 3
	const buf = Buffer.alloc(84 + n * 50)
	buf.writeUInt32LE(n, 80)
	let o = 84
	for (const m of r.meshes) {
		const p = m.attributes.position.array
		const ix = m.index.array
		for (let i = 0; i < ix.length; i += 3) {
			o += 12 // zero normal, readers recompute
			for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++, o += 4) buf.writeFloatLE(p[ix[i + k] * 3 + c], o)
			o += 2
		}
	}
	fs.writeFileSync(process.argv[3], buf)
	console.log(`${n} triangles, ${(buf.length / 1e6).toFixed(1)} MB`)
})
