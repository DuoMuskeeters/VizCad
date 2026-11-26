/** OBJ with three's OBJLoader (no MTL: material libraries are separate files). Usually Y-up. */
import { Mesh } from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ParseFailure, type MeshData, type ParsedModel } from '../protocol'
import { normaliseTree } from '../../tree/tree'
import { meshOfGeometry } from './geometry'

export const parseObj = (buffer: ArrayBuffer, name: string): ParsedModel => {
  const text = new TextDecoder().decode(buffer)
  if (text.includes('\u0000')) throw new ParseFailure('corrupt', 'binary data in OBJ')
  const group = new OBJLoader().parse(text)
  const meshes: MeshData[] = []
  for (const child of group.children)
    if (child instanceof Mesh) {
      const mesh = meshOfGeometry(child.geometry, child.name || name)
      if (mesh.position.length >= 9) meshes.push(mesh)
      child.geometry.dispose()
    }
  return { meshes, tree: normaliseTree({ name, meshes: meshes.map((_, i) => i), children: [] }, meshes), up: 'y' }
}
