import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type Converted, type Engine, type TreeNode, countTree, runBench } from './common'

const W = 1280
const H = 800
const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false })
renderer.setPixelRatio(1)
renderer.setSize(W, H, false)
const gl = renderer.getContext()
const px = new Uint8Array(4)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1b222c)
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2))
const sun = new THREE.DirectionalLight(0xffffff, 1.5)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 1e7)
const controls = new OrbitControls(camera, canvas) // mouse + touch (one finger rotate, pinch zoom, two finger pan)
const model = new THREE.Group()
scene.add(model)
let tree: TreeNode | null = null
let triangles = 0
const raycaster = new THREE.Raycaster()
const section = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)

const materials = new Map<string, THREE.MeshStandardMaterial>()
const material = (c: [number, number, number] | null) => {
	const key = c ? c.join(',') : 'default'
	let m = materials.get(key)
	if (!m) {
		m = new THREE.MeshStandardMaterial({ color: c ? new THREE.Color(...c) : 0xb8c4d0, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide })
		materials.set(key, m)
	}
	return m
}

const geometryOf = (m: Converted['meshes'][number]) => {
	const g = new THREE.BufferGeometry()
	g.setAttribute('position', new THREE.BufferAttribute(m.position, 3))
	if (m.normal) g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3))
	else g.computeVertexNormals()
	g.setIndex(new THREE.BufferAttribute(m.index, 1))
	return g
}

const frame = () => {
	model.updateMatrixWorld(true)
	const box = new THREE.Box3().setFromObject(model)
	const sphere = box.getBoundingSphere(new THREE.Sphere())
	const d = sphere.radius / Math.sin((camera.fov * Math.PI) / 360)
	camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.8, 1.2).normalize().multiplyScalar(d))
	camera.near = d / 100
	camera.far = d * 10
	camera.updateProjectionMatrix()
	controls.target.copy(sphere.center)
	controls.update()
	sun.position.copy(camera.position)
	section.constant = sphere.center.x
}

const engine: Engine = {
	name: 'three',
	buildCad(data, mode) {
		tree = data.root
		if (mode === 'merged') {
			// One draw call per colour: what a "fast" mode would look like (loses per-part picking unless ids are kept).
			const byColor = new Map<string, THREE.BufferGeometry[]>()
			data.meshes.forEach((m) => {
				const key = m.color ? m.color.join(',') : 'default'
				byColor.set(key, [...(byColor.get(key) ?? []), geometryOf(m)])
				triangles += m.index.length / 3
			})
			for (const [key, gs] of byColor) {
				const c = key === 'default' ? null : (key.split(',').map(Number) as [number, number, number])
				model.add(new THREE.Mesh(mergeGeometries(gs), material(c)))
			}
		} else {
			// One Object3D per tree node, one Mesh per part: names, colours and hierarchy kept.
			const build = (n: TreeNode, parent: THREE.Object3D) => {
				const g = new THREE.Group()
				g.name = n.name
				parent.add(g)
				for (const i of n.meshes) {
					const m = data.meshes[i]
					const geo = geometryOf(m)
					if (m.faceColors.length) {
						// Per b-rep face colours become geometry groups + material array.
						const mats = [material(m.color)]
						for (const [first, last, r, gg, b] of m.faceColors) {
							mats.push(material([r, gg, b]))
							geo.addGroup(first * 3, (last - first + 1) * 3, mats.length - 1)
						}
						g.add(Object.assign(new THREE.Mesh(geo, mats), { name: m.name }))
					} else g.add(Object.assign(new THREE.Mesh(geo, material(m.color)), { name: m.name }))
					triangles += m.index.length / 3
				}
				n.children.forEach((c) => build(c, g))
			}
			build(data.root, model)
		}
		frame()
	},
	buildStl(buf) {
		const geo = new STLLoader().parse(buf)
		triangles = geo.attributes.position.count / 3
		model.add(new THREE.Mesh(geo, material(null)))
		frame()
	},
	renderSync() {
		renderer.render(scene, camera)
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
	},
	orbitStep(rad) {
		const off = camera.position.clone().sub(controls.target)
		off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad)
		camera.position.copy(controls.target).add(off)
		camera.lookAt(controls.target)
		sun.position.copy(camera.position)
	},
	pick(x, y) {
		raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
		return raycaster.intersectObject(model, true).length > 0
	},
	setSection(on) {
		renderer.localClippingEnabled = on
		for (const m of materials.values()) {
			m.clippingPlanes = on ? [section] : null
			m.needsUpdate = true
		}
	},
	async thumbnail(size) {
		// Separate offscreen renderer: same scene graph, no DOM. Runs in a Worker too (OffscreenCanvas).
		const oc = new OffscreenCanvas(size, size)
		const r = new THREE.WebGLRenderer({ canvas: oc, antialias: true })
		r.setSize(size, size, false)
		const cam = camera.clone()
		cam.aspect = 1
		cam.updateProjectionMatrix()
		r.render(scene, cam)
		const blob = await oc.convertToBlob({ type: 'image/webp', quality: 0.85 })
		r.dispose()
		return blob
	},
	stats() {
		let drawables = 0
		model.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) drawables++
		})
		return { drawables, triangles }
	},
	treeNodes: () => (tree ? countTree(tree) : 1),
}

// three-mesh-bvh is an optional extra (lazy chunk): accelerates raycasting on big meshes.
const bvhMod = await import('three-mesh-bvh')
engine.prepareFastPick = () => {
	THREE.Mesh.prototype.raycast = bvhMod.acceleratedRaycast
	model.traverse((o) => {
		const m = o as THREE.Mesh
		if (m.isMesh) (m.geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree = new bvhMod.MeshBVH(m.geometry)
	})
	raycaster.firstHitOnly = true
}

runBench(engine)
