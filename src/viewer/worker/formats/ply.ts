/**
 * PLY (ASCII, binary little and big endian) with three's PLYLoader. Whether there are faces is read from the header's
 * `element face N`: PLYLoader returns unindexed geometry when faces carry colours or texture coordinates, so the
 * geometry's index says nothing. A point cloud (no faces) has nothing to draw.
 */
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ParseFailure, type ParsedModel } from '../protocol'
import { normaliseTree } from '../../tree/tree'
import { meshOfGeometry } from './geometry'

/** Headers are short; a file without `end_header` in its first 64 KiB is not a PLY we read. */
const MAX_HEADER_BYTES = 64 * 1024

/** The face count the header declares (0 without a face element); null when there is no complete header. */
export const plyFaceCount = (buffer: ArrayBuffer): number | null => {
  const head = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, MAX_HEADER_BYTES)))
  if (!/^ply\r?\n/.test(head)) return null
  const end = head.search(/^end_header\s*$/m)
  if (end < 0) return null
  const face = /^element\s+face\s+(\d+)\s*$/m.exec(head.slice(0, end))
  return face === null ? 0 : Number(face[1])
}

export const parsePly = (buffer: ArrayBuffer, name: string): ParsedModel => {
  const faces = plyFaceCount(buffer)
  if (faces === null) throw new ParseFailure('corrupt', 'not a PLY file')
  if (faces === 0) throw new ParseFailure('empty', 'PLY without faces')
  const geometry = new PLYLoader().parse(buffer)
  const mesh = meshOfGeometry(geometry, name)
  geometry.dispose()
  return { meshes: [mesh], tree: normaliseTree({ name, meshes: [0], children: [] }, [mesh]), up: 'z' }
}
