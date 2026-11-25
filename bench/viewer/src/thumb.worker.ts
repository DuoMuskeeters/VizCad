// Thumbnail entirely off the main thread: GLB in, WebP out (three.js + OffscreenCanvas in a Worker).
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

self.onmessage = async (ev: MessageEvent<{ glb: ArrayBuffer; size: number }>) => {
	const t0 = performance.now()
	const { glb, size } = ev.data
	const gltf = await new GLTFLoader().parseAsync(glb, '')
	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0x1b222c)
	scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2))
	scene.add(gltf.scene)
	const sphere = new THREE.Box3().setFromObject(gltf.scene).getBoundingSphere(new THREE.Sphere())
	const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1e7)
	const d = sphere.radius / Math.sin((35 * Math.PI) / 360)
	camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.8, 1.2).normalize().multiplyScalar(d))
	camera.near = d / 100
	camera.far = d * 10
	camera.lookAt(sphere.center)
	camera.updateProjectionMatrix()
	const light = new THREE.DirectionalLight(0xffffff, 1.5)
	light.position.copy(camera.position)
	scene.add(light)
	const canvas = new OffscreenCanvas(size, size)
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setSize(size, size, false)
	renderer.render(scene, camera)
	const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
	renderer.dispose()
	self.postMessage({ ms: performance.now() - t0, bytes: blob.size, blob })
}
