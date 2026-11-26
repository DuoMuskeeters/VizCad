/**
 * The phone rule of docs/11 §2.5: no STEP/IGES conversion and no STEP/IGES/3MF thumbnail on phones (memory, battery).
 * Detection: `navigator.deviceMemory < 4`, or a coarse pointer on a narrow screen. A wrong guess only delays a result.
 */
import { isConvertFormat, MAX_CONVERT_BYTES, type SourceFormat } from './worker/protocol'

export type DeviceHints = { readonly deviceMemory?: number | undefined; readonly coarsePointer: boolean; readonly shortSide: number }

export const readDeviceHints = (): DeviceHints => ({
  deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  shortSide: Math.min(window.screen.width, window.screen.height),
})

export const isPhone = (hints: DeviceHints) => (hints.deviceMemory !== undefined && hints.deviceMemory < 4) || (hints.coarsePointer && hints.shortSide < 600)

/** Opening STEP/IGES runs the 7 MB OCCT WASM and can need gigabytes: on a phone the person starts it. */
export const deferOpen = (format: SourceFormat, phone: boolean) => phone && (format === 'step' || format === 'iges')

/**
 * Whether this device should render a thumbnail for the file (upload and lazy-on-open paths). `maxConvertBytes` is the
 * workspace's conversion limit (file view or upload answer); STL/OBJ/PLY may be twice as large (no WASM heap involved).
 */
export const canMakeThumbnail = (format: SourceFormat, size: number, phone: boolean, maxConvertBytes: number = MAX_CONVERT_BYTES) => {
  if (isConvertFormat(format)) return !phone && size <= maxConvertBytes
  return size <= 2 * maxConvertBytes
}
