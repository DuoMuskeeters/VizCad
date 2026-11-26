/** Frees GPU-side resources of an object tree (every close of the viewer; docs/11 §6 "Dispose"). Shared ones once. */
import type { BufferGeometry, Material, Object3D } from 'three'

type Drawable = Object3D & { geometry?: BufferGeometry; material?: Material | Material[] }

export const disposeObject = (root: Object3D) => {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  root.traverse((object) => {
    const drawable = object as Drawable
    if (drawable.geometry) geometries.add(drawable.geometry)
    const material = drawable.material
    if (Array.isArray(material)) material.forEach((m) => materials.add(m))
    else if (material) materials.add(material)
  })
  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => m.dispose())
  root.removeFromParent()
  return { geometries: geometries.size, materials: materials.size }
}
