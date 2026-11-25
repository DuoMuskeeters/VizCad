// "Convert once, view many times" experiment: STEP -> (worker) -> three scene -> GLB.
// Then measure how fast each engine opens the GLB, and a thumbnail rendered fully inside a Worker.
import '@kitware/vtk.js/Rendering/Profiles/Geometry'
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow'
import vtkGLTFImporter from '@kitware/vtk.js/IO/Geometry/GLTFImporter'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { type TreeNode, blocking, convert, raf } from './common'

const out: Record<string, unknown> = {}
const status = document.getElementById('status')!
const file = new URLSearchParams(location.search).get('file') ?? 'as1-oc-214.stp'
out.file = file

const gzipSize = async (buf: ArrayBuffer) => {
	const s = new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))
	return (await new Response(s).arrayBuffer()).byteLength
}

try {
	// 1. Convert and build a named, coloured scene graph.
	const data = await convert(`/samples/${file}`, 'step', 0.001)
	let t = performance.now()
	const root = new THREE.Group()
	const mats = new Map<string, THREE.MeshStandardMaterial>()
	const build = (n: TreeNode, parent: THREE.Object3D) => {
		const g = new THREE.Group()
		g.name = n.name
		parent.add(g)
		for (const i of n.meshes) {
			const m = data.meshes[i]
			const geo = new THREE.BufferGeometry()
			geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3))
			if (m.normal) geo.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3))
			geo.setIndex(new THREE.BufferAttribute(m.index, 1))
			const key = m.color?.join(',') ?? 'd'
			if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: m.color ? new THREE.Color(...m.color) : 0xb8c4d0 }))
			g.add(Object.assign(new THREE.Mesh(geo, mats.get(key)), { name: m.name }))
		}
		n.children.forEach((c) => build(c, g))
	}
	build(data.root, root)
	// 2. Export GLB (this is what would be uploaded to R2 as the view derivative).
	const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer
	out.exportMs = Math.round(performance.now() - t)
	out.inputMB = +((data as unknown as { inputBytes: number }).inputBytes / 1e6).toFixed(1)
	out.glbMB = +(glb.byteLength / 1e6).toFixed(1)
	out.glbGzipMB = +((await gzipSize(glb)) / 1e6).toFixed(1)
	Object.assign(out, { exportBlocking: blocking(t, performance.now()) })

	// 3. three.js opens the GLB.
	await raf()
	t = performance.now()
	const canvas = document.getElementById('c') as HTMLCanvasElement
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setSize(1280, 800, false)
	const scene = new THREE.Scene()
	scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2))
	const gltf = await new GLTFLoader().parseAsync(glb.slice(0), '')
	scene.add(gltf.scene)
	const sphere = new THREE.Box3().setFromObject(gltf.scene).getBoundingSphere(new THREE.Sphere())
	const cam = new THREE.PerspectiveCamera(35, 1.6, sphere.radius / 50, sphere.radius * 50)
	cam.position.copy(sphere.center).add(new THREE.Vector3(0, 0, sphere.radius * 3))
	renderer.render(scene, cam)
	const gl = renderer.getContext()
	gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
	out.threeGlbTtffMs = Math.round(performance.now() - t)
	let names = 0
	gltf.scene.traverse((o) => {
		if (o.name) names++
	})
	out.threeGlbNamedNodes = names
	Object.assign(out, { threeGlbBlocking: blocking(t, performance.now()) })

	// 4. vtk.js opens the same GLB.
	await raf()
	t = performance.now()
	const host = document.getElementById('host') as HTMLDivElement
	const grw = vtkGenericRenderWindow.newInstance()
	grw.setContainer(host)
	grw.resize()
	const importer = vtkGLTFImporter.newInstance({ renderer: grw.getRenderer() })
	await new Promise<void>((resolve) => {
		importer.onReady(() => {
			importer.importActors()
			resolve()
		})
		importer.parseAsBinary(glb.slice(0))
	})
	grw.getRenderer().resetCamera()
	grw.getRenderWindow().render()
	const vgl = (grw.getApiSpecificRenderWindow() as unknown as { getContext(): WebGL2RenderingContext }).getContext()
	vgl.readPixels(0, 0, 1, 1, vgl.RGBA, vgl.UNSIGNED_BYTE, new Uint8Array(4))
	out.vtkGlbTtffMs = Math.round(performance.now() - t)
	out.vtkGlbActors = importer.getActors()?.size ?? 0
	Object.assign(out, { vtkGlbBlocking: blocking(t, performance.now()) })

	// 5. Thumbnail fully inside a Worker (three.js + OffscreenCanvas).
	t = performance.now()
	const w = new Worker(new URL('./thumb.worker.ts', import.meta.url), { type: 'module' })
	const res = await new Promise<{ ms: number; bytes: number }>((resolve) => {
		w.onmessage = (ev) => resolve(ev.data)
		const copy = glb.slice(0)
		w.postMessage({ glb: copy, size: 512 }, [copy])
	})
	out.workerThumbMs = Math.round(performance.now() - t)
	out.workerThumbInnerMs = Math.round(res.ms)
	out.workerThumbKB = Math.round(res.bytes / 1024)
	Object.assign(out, { workerThumbBlocking: blocking(t, performance.now()) })
	out.ok = true
} catch (e) {
	out.ok = false
	out.error = String(e)
}
status.textContent = JSON.stringify(out, null, 1)
;(window as unknown as { __bench: unknown }).__bench = out
