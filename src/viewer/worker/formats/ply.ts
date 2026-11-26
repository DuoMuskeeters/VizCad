/** PLY (ASCII, binary little and big endian) with three's PLYLoader. A point cloud without faces has nothing to draw. */
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ParseFailure, type ParsedModel } from '../protocol'
import { normaliseTree } from '../../tree/tree'
import { meshOfGeometry } from './geometry'

export const parsePly = (buffer: ArrayBuffer, name: string): ParsedModel => {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16)))
  if (!/^ply\r?\n/.test(head)) throw new ParseFailure('corrupt', 'not a PLY file')
  const geometry = new PLYLoader().parse(buffer)
  if (geometry.index === null || geometry.index.count === 0) throw new ParseFailure('empty', 'PLY without faces')
  const mesh = meshOfGeometry(geometry, name)
  geometry.dispose()
  return { meshes: [mesh], tree: normaliseTree({ name, meshes: [0], children: [] }, [mesh]), up: 'z' }
}
