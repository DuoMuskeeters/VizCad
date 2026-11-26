/** Camera fitting and standard views in the Z-up world (docs/11 §4.3). Shared by the viewer and the Worker thumbnail. */
import { Box3, Sphere, Vector3, type Object3D, type PerspectiveCamera } from 'three'

export type ViewName = 'front' | 'top' | 'right' | 'iso'

export const VIEW_NAMES: ReadonlyArray<ViewName> = ['iso', 'front', 'top', 'right']

/** Direction from the target to the camera. Top looks down with +Y up on screen; front looks along +Y. */
export const viewDirection = (name: ViewName): Vector3 => {
  switch (name) {
    case 'front':
      return new Vector3(0, -1, 0)
    case 'top':
      return new Vector3(0, -1e-4, 1).normalize()
    case 'right':
      return new Vector3(1, 0, 0)
    case 'iso':
      return new Vector3(1, -1, 0.8).normalize()
  }
}

export const worldBox = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true)
  return new Box3().setFromObject(object)
}

/**
 * Places the camera on `direction` so the box's eight corners fit the view with a small margin (tighter than the
 * bounding sphere, which leaves long thin parts small). Returns the distance from the box centre.
 */
export const fitCamera = (camera: PerspectiveCamera, box: Box3, direction: Vector3, margin = 1.08): number => {
  const sphere = box.isEmpty() ? new Sphere(new Vector3(), 1) : box.getBoundingSphere(new Sphere())
  if (!(sphere.radius > 0)) sphere.radius = 1
  const forward = direction.clone().normalize()
  const right = new Vector3().crossVectors(camera.up, forward)
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  right.normalize()
  const up = new Vector3().crossVectors(forward, right).normalize()
  const tanV = Math.tan((camera.fov * Math.PI) / 360)
  const tanH = tanV * camera.aspect
  let distance = 0
  for (let corner = 0; corner < 8; corner++) {
    const p = new Vector3(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z).sub(sphere.center)
    const toward = p.dot(forward)
    distance = Math.max(distance, toward + (Math.abs(p.dot(right)) * margin) / tanH, toward + (Math.abs(p.dot(up)) * margin) / tanV)
  }
  if (!(distance > 0)) distance = sphere.radius / Math.sin(Math.atan(Math.min(tanV, tanH)))
  camera.position.copy(sphere.center).addScaledVector(forward, distance)
  camera.near = Math.max(distance / 1000, sphere.radius / 1e4)
  camera.far = distance + sphere.radius * 20
  camera.lookAt(sphere.center)
  camera.updateProjectionMatrix()
  return distance
}
