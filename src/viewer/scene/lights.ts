/** Lights shared by the viewer and the Worker thumbnail: a soft sky/ground fill and a headlight that follows the camera. */
import { DirectionalLight, HemisphereLight, Object3D, type Camera, type Scene } from 'three'

/** Viewer canvas in both themes (D12, docs/03 §5 `--color-canvas`). */
export const CANVAS_COLOR = 0x1b222c

export const addLights = (scene: Scene, camera: Camera) => {
  const sky = new HemisphereLight(0xffffff, 0x3a4250, 1.6)
  sky.position.set(0, 0, 1)
  scene.add(sky)
  const head = new DirectionalLight(0xffffff, 1.8)
  head.position.set(0.4, 0.8, 0.2)
  const target = new Object3D()
  target.position.set(0, 0, -1)
  camera.add(head, target)
  head.target = target
}
