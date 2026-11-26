/** One entry for every source format: bytes in, a normalised model with statistics out (or a ParseFailure). */
import { isConvertFormat, MAX_CONVERT_BYTES, ParseFailure, type ParsedModel, type SourceFormat, type Stats } from '../protocol'
import { modelStats } from '../../tree/tree'
import { parse3mf } from './threemf'
import { parseObj } from './obj'
import { parsePly } from './ply'
import { parseCad, type Occt } from './step'
import { parseStl } from './stl'

export type ParseDeps = { readonly loadOcct: () => Promise<Occt>; readonly now?: () => number; readonly maxConvertBytes?: number | undefined }

export const parseSource = async (format: SourceFormat, buffer: ArrayBuffer, name: string, deps: ParseDeps): Promise<{ model: ParsedModel; stats: Stats }> => {
  const now = deps.now ?? (() => performance.now())
  const started = now()
  if (buffer.byteLength === 0) throw new ParseFailure('empty')
  if (isConvertFormat(format) && buffer.byteLength > (deps.maxConvertBytes ?? MAX_CONVERT_BYTES)) throw new ParseFailure('too_large')
  let model: ParsedModel
  switch (format) {
    case 'step':
    case 'iges':
      model = parseCad(await deps.loadOcct(), format, buffer, name)
      break
    case 'stl':
      model = parseStl(buffer, name)
      break
    case 'obj':
      model = parseObj(buffer, name)
      break
    case 'ply':
      model = parsePly(buffer, name)
      break
    case '3mf':
      model = parse3mf(buffer, name)
      break
    default:
      throw new ParseFailure('unsupported')
  }
  return { model, stats: modelStats(model, now() - started) }
}
