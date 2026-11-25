import '@kitware/vtk.js/Rendering/Profiles/Geometry'
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData'
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray'
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray'
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader'
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker'
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane'
import { FieldAssociations } from '@kitware/vtk.js/Common/DataModel/DataSet/Constants'
import { type Converted, type Engine, type MeshData, bounds, countTree, runBench } from './common'

// vtk.js has few useful types for these objects; the bench keeps them loose on purpose.
type Any = ReturnType<typeof JSON.parse>

const W = 1280
const H = 800
const host = document.getElementById('host') as HTMLDivElement
host.style.width = `${W}px`
host.style.height = `${H}px`
const grw = vtkGenericRenderWindow.newInstance({ background: [0x1b / 255, 0x22 / 255, 0x2c / 255] })
grw.setContainer(host)
grw.resize()
const renderer = grw.getRenderer()
const renderWindow = grw.getRenderWindow()
const api: Any = grw.getApiSpecificRenderWindow()
const gl: WebGL2RenderingContext = api.getContext()
const px = new Uint8Array(4)
const actors: Any[] = []
let triangles = 0
let treeCount = 1
const picker = vtkCellPicker.newInstance()
picker.setPickFromList(false)
let selector: Any = null
let sectionPlane: Any = null

const polyDataOf = (meshes: MeshData[]) => {
	// Legacy approach when given every mesh; per-part when given one.
	let nPts = 0
	let nTris = 0
	for (const m of meshes) {
		nPts += m.position.length / 3
		nTris += m.index.length / 3
	}
	const pts = new Float32Array(nPts * 3)
	const nrm = new Float32Array(nPts * 3)
	const polys = new Uint32Array(nTris * 4)
	let po = 0
	let to = 0
	for (const m of meshes) {
		pts.set(m.position, po * 3)
		if (m.normal) nrm.set(m.normal, po * 3)
		for (let i = 0; i < m.index.length; i += 3) {
			polys[to++] = 3
			polys[to++] = m.index[i] + po
			polys[to++] = m.index[i + 1] + po
			polys[to++] = m.index[i + 2] + po
		}
		po += m.position.length / 3
	}
	const pd = vtkPolyData.newInstance()
	pd.getPoints().setData(pts, 3)
	pd.setPolys(vtkCellArray.newInstance({ values: polys }))
	pd.getPointData().setNormals(vtkDataArray.newInstance({ name: 'Normals', values: nrm, numberOfComponents: 3 }))
	triangles += nTris
	return pd
}

const addActor = (pd: Any, color: [number, number, number] | null) => {
	const mapper = vtkMapper.newInstance({ scalarVisibility: false })
	mapper.setInputData(pd)
	const actor = vtkActor.newInstance()
	actor.setMapper(mapper)
	actor.getProperty().setColor(...(color ?? [0.72, 0.77, 0.82]))
	actor.getProperty().setSpecular(0.2)
	renderer.addActor(actor)
	actors.push(actor)
	return actor
}

const frame = (b: { min: number[]; max: number[] }) => {
	renderer.resetCamera()
	const cam = renderer.getActiveCamera()
	cam.azimuth(35)
	cam.elevation(25)
	renderer.resetCamera()
	renderer.resetCameraClippingRange()
	sectionPlane = vtkPlane.newInstance({ origin: [(b.min[0] + b.max[0]) / 2, 0, 0], normal: [-1, 0, 0] })
}

const engine: Engine = {
	name: 'vtk',
	buildCad(data: Converted, mode) {
		treeCount = mode === 'merged' ? 1 : countTree(data.root)
		if (mode === 'merged') {
			// Exactly what the live viewer does: everything into one PolyData, one colour, no names.
			addActor(polyDataOf(data.meshes), null)
		} else {
			// Fair variant: one actor per part with its colour. vtk.js has no scene graph,
			// so the tree is kept outside (name -> actor map) by our own code.
			data.meshes.forEach((m) => {
				const a = addActor(polyDataOf([m]), m.color)
				a.set({ partName: m.name }, true)
			})
		}
		frame(bounds(data.meshes))
	},
	buildStl(buf) {
		const reader = vtkSTLReader.newInstance()
		reader.parseAsArrayBuffer(buf)
		const pd = reader.getOutputData()
		triangles = pd.getNumberOfPolys()
		const mapper = vtkMapper.newInstance({ scalarVisibility: false })
		mapper.setInputData(pd)
		const actor = vtkActor.newInstance()
		actor.setMapper(mapper)
		renderer.addActor(actor)
		actors.push(actor)
		const bb = pd.getBounds()
		frame({ min: [bb[0], bb[2], bb[4]], max: [bb[1], bb[3], bb[5]] })
	},
	renderSync() {
		renderWindow.render()
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
	},
	orbitStep(rad) {
		renderer.getActiveCamera().azimuth((rad * 180) / Math.PI)
		renderer.resetCameraClippingRange()
	},
	pick(x, y) {
		const dx = ((x + 1) / 2) * W
		const dy = ((y + 1) / 2) * H
		if (selector) {
			// GPU hardware selector: renders an id buffer for a 1px area.
			selector.setArea(Math.round(dx), Math.round(dy), Math.round(dx), Math.round(dy))
			const sel = selector.select()
			return !!sel && sel.length > 0
		}
		picker.pick([dx, dy, 0], renderer)
		return picker.getActors().length > 0
	},
	prepareFastPick() {
		selector = api.createSelector()
		selector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_CELLS)
		selector.attach(api, renderer)
	},
	setSection(on) {
		for (const a of actors) {
			const m = a.getMapper()
			if (on) m.addClippingPlane(sectionPlane)
			else m.removeAllClippingPlanes()
		}
	},
	async thumbnail(size) {
		// vtk.js needs a DOM container for its render window, so thumbnails run on the main thread.
		const div = document.createElement('div')
		div.style.cssText = `position:absolute;left:-9999px;width:${size}px;height:${size}px`
		document.body.appendChild(div)
		const t = vtkGenericRenderWindow.newInstance({ background: [0x1b / 255, 0x22 / 255, 0x2c / 255] })
		t.setContainer(div)
		t.resize()
		const r = t.getRenderer()
		for (const a of actors) r.addActor(a)
		r.setActiveCamera(renderer.getActiveCamera())
		r.resetCameraClippingRange()
		const [url] = await Promise.all(t.getRenderWindow().captureImages('image/webp', {}))
		const blob = await (await fetch(url as string)).blob()
		t.delete()
		div.remove()
		return blob
	},
	stats: () => ({ drawables: actors.length, triangles }),
	treeNodes: () => treeCount,
}

runBench(engine)
