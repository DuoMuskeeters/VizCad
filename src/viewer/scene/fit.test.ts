import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { fitCamera, VIEW_NAMES, viewDirection } from './fit'

const inView = (camera: PerspectiveCamera, box: Box3) => {
  camera.updateMatrixWorld(true)
  for (let corner = 0; corner < 8; corner++) {
    const p = new Vector3(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z).project(camera)
    if (Math.abs(p.x) > 1.0001 || Math.abs(p.y) > 1.0001 || p.z > 1 || p.z < -1) return false
  }
  return true
}

describe('fitCamera', () => {
  it('keeps every corner of the box in view from each standard view and aspect', () => {
    const box = new Box3(new Vector3(-50, -5, 0), new Vector3(150, 5, 20))
    for (const aspect of [0.6, 1, 2.2])
      for (const view of VIEW_NAMES) {
        const camera = new PerspectiveCamera(35, aspect, 0.1, 1e6)
        camera.up.set(0, 0, 1)
        fitCamera(camera, box, viewDirection(view))
        expect([view, aspect, inView(camera, box)]).toEqual([view, aspect, true])
      }
  })

  it('is tighter than the bounding sphere for a long thin part', () => {
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(200, 4, 4))
    const camera = new PerspectiveCamera(35, 1.6, 0.1, 1e6)
    camera.up.set(0, 0, 1)
    const distance = fitCamera(camera, box, viewDirection('front'))
    // The sphere fit would need radius / sin(min fov / 2); the box fit sees the 200 mm length across the wide view.
    const sphereDistance = (Math.hypot(200, 4, 4) / 2) / Math.sin(((35 * Math.PI) / 180) / 2)
    expect(distance).toBeLessThan(sphereDistance * 0.8)
  })
})
