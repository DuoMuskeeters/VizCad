import type { I18nKey } from '#/i18n'

export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 128
export const MAX_NAME = 64
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Same rules as the server's DisplayName: at most 64 chars, one line, no link-like text. */
export const validateName = (value: string): I18nKey | null => {
  const name = value.trim()
  if (name === '') return 'auth.signUp.nameRequired'
  if (name.length > MAX_NAME) return 'auth.signUp.nameTooLong'
  if (/[\r\n\u2028\u2029]/.test(value) || /:\/\/|www\./i.test(name)) return 'auth.signUp.nameInvalid'
  return null
}

export const validateEmail = (value: string): I18nKey | null => {
  const email = value.trim()
  return email.length > 0 && email.length <= 254 && EMAIL.test(email) ? null : 'auth.signUp.emailInvalid'
}

export const validateNewPassword = (value: string): I18nKey | null => {
  if (value.length < MIN_PASSWORD) return 'auth.signUp.passwordTooShort'
  if (value.length > MAX_PASSWORD) return 'common.passwordTooLong'
  return null
}

export const validateCurrentPassword = (value: string): I18nKey | null => (value === '' ? 'auth.signIn.passwordRequired' : null)

export const normalizeEmail = (value: string) => value.trim().toLowerCase()
