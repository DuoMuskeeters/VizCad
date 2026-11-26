/**
 * The GLB derivative's stored metadata and the rule for what `GET …/model` serves (docs/11 §2.2–2.4, D23). Server only:
 * `derivativeMeta` is JSON text the server writes; the client's part of it (`DerivativeStats`) is validated with Schema
 * at the HTTP boundary and is for display only, never permission.
 */
import { Option, Schema } from 'effect'
import { derivativeStates } from './db/schema'
import type { DerivativeState, ModelPreview } from '../shared/fileViews'
import { fileTypeOfExtension, hasDerivative } from '../shared/fileTypes'

/** The viewer refuses models above these (docs/11 §2.3 "Güven"); a derivative claiming more is not plausible. */
export const MAX_DERIVATIVE_TRIANGLES = 20_000_000
export const MAX_DERIVATIVE_NODES = 20_000

const Count = (max: number) => Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: max }))
const Coordinate = Schema.Finite.check(Schema.isBetween({ minimum: -1e12, maximum: 1e12 }))
const Point = Schema.Tuple([Coordinate, Coordinate, Coordinate])

/** What the browser reports about the GLB it wrote (`stats` of the Worker's `derive`). */
export const DerivativeStats = Schema.Struct({
  converter: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64), Schema.isPattern(/^[\x20-\x7e]+$/)),
  triangles: Count(MAX_DERIVATIVE_TRIANGLES),
  nodes: Count(MAX_DERIVATIVE_NODES),
  parts: Count(MAX_DERIVATIVE_NODES),
  bbox: Schema.Struct({ min: Point, max: Point }),
})
export type DerivativeStats = typeof DerivativeStats.Type

/**
 * Failure codes the browser may record (the Worker's codes that say something about the file). `network` and a
 * cancel say nothing about it and are never stored; `too_large` becomes the `too_large` state.
 */
export const derivativeFailureCodes = ['empty', 'unsupported', 'too_large', 'too_complex', 'out_of_memory', 'corrupt', 'timeout'] as const
export type DerivativeFailureCode = (typeof derivativeFailureCodes)[number]

/** `ready`: the client's stats plus what the server measured (size and ETag from HEAD). `failed`: the code. */
const ReadyMeta = Schema.Struct({ v: Schema.Literal(1), ...DerivativeStats.fields, bytes: Schema.Int.check(Schema.isGreaterThan(0)), etag: Schema.String })
const FailedMeta = Schema.Struct({ v: Schema.Literal(1), code: Schema.Literals(derivativeFailureCodes) })
const StoredMeta = Schema.Union([ReadyMeta, FailedMeta])
const StoredMetaJson = Schema.fromJsonString(StoredMeta)

export type ReadyMeta = typeof ReadyMeta.Type

export const readyMetaText = (stats: DerivativeStats, bytes: number, etag: string) =>
  JSON.stringify({ v: 1, ...stats, bytes, etag } satisfies ReadyMeta)

export const failedMetaText = (code: DerivativeFailureCode) => JSON.stringify({ v: 1, code } satisfies typeof FailedMeta.Type)

/** The stored meta, or none when it is missing or unreadable (the row is then treated as having no meta). */
export const parseMeta = (text: string | null) =>
  text === null ? Option.none() : Schema.decodeUnknownOption(StoredMetaJson)(text)

const stateOf = (value: string | null): DerivativeState | null =>
  (derivativeStates as ReadonlyArray<string>).includes(value ?? '') ? (value as DerivativeState) : null

export interface DerivativeColumns {
  readonly extension: string
  readonly derivativeR2Key: string | null
  readonly derivativeState: string | null
  readonly derivativeMeta: string | null
  /** The source object's size. */
  readonly size: number
}

type StoredMetaValue = typeof StoredMeta.Type

/** The GLB `model` can serve: key, size and ETag, only for a `ready` derivative with readable meta. `meta` is parsed once by the caller when it has it. */
export const readyDerivative = (row: DerivativeColumns, meta: Option.Option<StoredMetaValue> = parseMeta(row.derivativeMeta)) => {
  if (row.derivativeR2Key === null || stateOf(row.derivativeState) !== 'ready') return undefined
  if (Option.isNone(meta) || !('bytes' in meta.value)) return undefined
  return { key: row.derivativeR2Key, size: meta.value.bytes, etag: meta.value.etag, meta: meta.value }
}

/**
 * What `GET …/model` sends a caller who may `preview` the file (D23): STEP/IGES/3MF the GLB derivative when it is
 * ready, otherwise the source but only to a caller who may download it (so the viewer can convert in place), otherwise
 * nothing (404). STL/OBJ/PLY the source itself, at every level. `ready` is `readyDerivative(row)`, passed when known.
 */
export const modelKind = (row: DerivativeColumns, canDownload: boolean, ready: ReturnType<typeof readyDerivative> = readyDerivative(row)): ModelPreview['kind'] => {
  const type = fileTypeOfExtension(row.extension)
  if (type === undefined) return 'none'
  if (!hasDerivative(type.id)) return 'source'
  if (ready !== undefined) return 'derivative'
  return canDownload ? 'source' : 'none'
}

/** The `model` block of a file view (no key, no ETag). The stored meta is parsed once per row. */
export const modelPreview = (row: DerivativeColumns, canDownload: boolean, maxConvertBytes: number): ModelPreview => {
  const type = fileTypeOfExtension(row.extension)
  const meta = parseMeta(row.derivativeMeta)
  const ready = readyDerivative(row, meta)
  const kind = modelKind(row, canDownload, ready)
  const state = type !== undefined && hasDerivative(type.id) ? stateOf(row.derivativeState) : null
  return {
    kind,
    bytes: kind === 'derivative' ? (ready?.size ?? null) : kind === 'source' ? row.size : null,
    derivative: state === null ? null : {
      state: state === 'ready' && ready === undefined ? 'failed' : state,
      code: Option.isSome(meta) && 'code' in meta.value ? meta.value.code : null,
      parts: ready?.meta.parts ?? null,
    },
    maxConvertBytes,
  }
}
