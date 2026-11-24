import type { I18nKey } from '#/i18n'

const LINE_BREAKS = new RegExp(`[${String.fromCharCode(10, 13, 0x2028, 0x2029)}]`)

/** Mirrors the server's `Name` schema (one line, at most 80 characters) plus the mockup's "at least 2 characters". */
export const validateCompanyName = (value: string): I18nKey | null => {
  const name = value.trim()
  if (name.length < 2) return 'app.workspace.nameTooShort'
  if (name.length > 80 || LINE_BREAKS.test(name)) return 'app.workspace.nameInvalid'
  return null
}
