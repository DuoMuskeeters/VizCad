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

export const boundingSphere = (object: Object3D): Sphere => {
  object.updateMatrixWorld(true)
  const box = new Box3().setFromObject(object)
  const sphere = box.isEmpty() ? new Sphere(new Vector3(), 1) : box.getBoundingSphere(new Sphere())
  if (!(sphere.radius > 0)) sphere.radius = 1
  return sphere
}

/** Places the camera on `direction` so the sphere fills the view with a small margin. Returns the distance. */
export const fitCamera = (camera: PerspectiveCamera, sphere: Sphere, direction: Vector3, margin = 1.08): number => {
  const vertical = (camera.fov * Math.PI) / 180
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect)
  const distance = (sphere.radius * margin) / Math.sin(Math.min(vertical, horizontal) / 2)
  camera.position.copy(sphere.center).addScaledVector(direction.clone().normalize(), distance)
  camera.near = Math.max(distance / 1000, sphere.radius / 1e4)
  camera.far = distance + sphere.radius * 20
  camera.lookAt(sphere.center)
  camera.updateProjectionMatrix()
  return distance
}
