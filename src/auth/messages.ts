import type { I18nKey } from '#/i18n'
import type { AuthFailure } from './api'

/** Which message a failed request shows, per screen. Sign-in uses one wording for unknown account and wrong password. */
export const signInMessage = (failure: AuthFailure): I18nKey => {
  switch (failure) {
    case 'rate-limit':
      return 'auth.signIn.rateLimitError'
    case 'email-not-verified':
      return 'auth.signIn.emailNotVerified'
    case 'network':
      return 'auth.signIn.networkError'
    case 'invalid-credentials':
    case 'captcha':
    case 'email-exists':
    case 'invalid-token':
    case 'generic':
      return 'auth.signIn.genericError'
  }
}

export const signUpMessage = (failure: AuthFailure): I18nKey => {
  switch (failure) {
    case 'rate-limit':
      return 'auth.signUp.rateLimitError'
    case 'captcha':
      return 'auth.signUp.captchaFailed'
    case 'email-exists':
      return 'auth.signUp.emailExistsError'
    case 'network':
      return 'auth.signIn.networkError'
    case 'invalid-credentials':
    case 'email-not-verified':
    case 'invalid-token':
    case 'generic':
      return 'common.genericError'
  }
}

export const requestMessage = (failure: AuthFailure, rateKey: I18nKey): I18nKey | null => {
  if (failure === 'rate-limit') return rateKey
  if (failure === 'network') return 'auth.signIn.networkError'
  return null
}
