import { cx } from './cx'

export type MeterTone = 'auto' | 'brand' | 'warn' | 'danger'

export type MeterProps = {
  value: number
  max: number
  /** Accessible name, e.g. "Depolama". */
  label: string
  /** Spoken value, e.g. "153 MB / 5 GB". */
  valueText: string
  /** `auto`: brand, warn from 90 %, danger from 100 %. */
  tone?: MeterTone
  className?: string
}

const resolve = (tone: MeterTone, ratio: number): Exclude<MeterTone, 'auto'> => {
  if (tone !== 'auto') return tone
  if (ratio >= 1) return 'danger'
  return ratio >= 0.9 ? 'warn' : 'brand'
}

/**
 * Native <meter> (storage, seats). The width comes from the element's own value, so no inline style is needed;
 * the look is in styles.css (`meter[data-ui='meter']`).
 */
export const Meter = ({ value, max, label, valueText, tone = 'auto', className }: MeterProps) => (
  <meter
    data-ui="meter"
    data-tone={resolve(tone, max > 0 ? value / max : 0)}
    value={Math.min(Math.max(value, 0), max)}
    min={0}
    max={max}
    aria-label={label}
    aria-valuetext={valueText}
    className={cx('block h-1 w-full', className)}
  />
)
