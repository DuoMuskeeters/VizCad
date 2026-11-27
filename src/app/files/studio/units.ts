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

/** "1.000,0 mm" / "39.37 in": one decimal in millimetres, two in inches. */
export const formatLength = (mm: number, unit: LengthUnit, locale: string) =>
  unit === 'mm' ? `${numberFormat(locale, 1).format(mm)} mm` : `${numberFormat(locale, 2).format(mm / MM_PER_INCH)} in`

/** A place along an axis (the section): whole millimetres, or inches with one decimal. */
export const formatPlace = (mm: number, unit: LengthUnit, locale: string) =>
  unit === 'mm' ? `${numberFormat(locale, 0).format(mm)} mm` : `${numberFormat(locale, 1).format(mm / MM_PER_INCH)} in`
