/**
 * Thumbnail off the main thread (docs/10 §3.5): three.js + OffscreenCanvas in the Worker. Iso view on the canvas colour,
 * WebP when the browser encodes it (Safari answers with PNG), at most 1024×1024 and 1 MiB (the server's limits, 09 §3.1).
 */
import { Color, PerspectiveCamera, Scene, WebGLRenderer, type Object3D } from 'three'
import { disposeObject } from './dispose'
import { fitCamera, worldBox, viewDirection } from './fit'
import { addLights, CANVAS_COLOR } from './lights'

export const THUMBNAIL_SIZE = 512
export const MAX_THUMBNAIL_BYTES = 1024 * 1024

const encode = async (canvas: OffscreenCanvas): Promise<Blob> => {
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })
  return webp.type === 'image/webp' ? webp : canvas.convertToBlob({ type: 'image/png' })
}

/** Renders `root` (consumed: it is disposed afterwards). Null when OffscreenCanvas WebGL is not available. */
export const renderThumbnail = async (root: Object3D): Promise<Blob | null> => {
  if (typeof OffscreenCanvas === 'undefined') {
    disposeObject(root)
    return null
  }
  const scene = new Scene()
  scene.background = new Color(CANVAS_COLOR)
  const camera = new PerspectiveCamera(35, 1, 0.1, 1e6)
  camera.up.set(0, 0, 1)
  scene.add(camera)
  addLights(scene, camera)
  scene.add(root)
  const box = worldBox(root)
  // Nothing to frame is nothing to store: never a blank image (modelStats refuses such models before this point).
  if (box.isEmpty() || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) {
    disposeObject(root)
    return null
  }
  fitCamera(camera, box, viewDirection('iso'), 1.04)

  let renderer: WebGLRenderer | null = null
  try {
    for (const size of [THUMBNAIL_SIZE, 384, 256]) {
      const canvas = new OffscreenCanvas(size, size)
      renderer?.dispose()
      renderer = new WebGLRenderer({ canvas, antialias: true })
      renderer.setSize(size, size, false)
      renderer.render(scene, camera)
      const blob = await encode(canvas)
      if (blob.size <= MAX_THUMBNAIL_BYTES) return blob
    }
    return null
  } catch {
    return null
  } finally {
    renderer?.dispose()
    renderer?.forceContextLoss()
    disposeObject(root)
  }
}
