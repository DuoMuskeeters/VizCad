/** Lengths for the measure tool and the section tag (docs/11 §4.3): model units are read as millimetres. */
export type LengthUnit = 'mm' | 'in'

const MM_PER_INCH = 25.4

const formats = new Map<string, Intl.NumberFormat>()
const numberFormat = (locale: string, digits: number) => {
  const key = `${locale}:${digits}`
  let format = formats.get(key)
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    formats.set(key, format)
  }
  return format
}
/** A value that rounds to zero is shown as 0, never "-0". */
const formatted = (value: number, locale: string, digits: number) => {
  const step = 10 ** -digits / 2
  return numberFormat(locale, digits).format(Math.abs(value) < step ? 0 : value)
}

/** "1.000,0 mm" / "39.37 in": one decimal in millimetres, two in inches. */
export const formatLength = (mm: number, unit: LengthUnit, locale: string) =>
  unit === 'mm' ? `${formatted(mm, locale, 1)} mm` : `${formatted(mm / MM_PER_INCH, locale, 2)} in`

/** A place along an axis (the section): whole millimetres, or inches with one decimal. */
export const formatPlace = (mm: number, unit: LengthUnit, locale: string) =>
  unit === 'mm' ? `${formatted(mm, locale, 0)} mm` : `${formatted(mm / MM_PER_INCH, locale, 1)} in`
