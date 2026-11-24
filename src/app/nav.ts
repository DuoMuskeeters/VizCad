/** Where to go after signing in. Only same-site paths count; anything else is dropped (no open redirects). */
export const safeNext = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > 300) return undefined
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return undefined
  return value
}

const NEXT_KEY = 'vizcad_next'
const ONBOARDING_KEY = 'vizcad_onboarding_pending'
const SUGGESTION_KEY = 'vizcad_team_suggestion_dismissed'

const store = (): Storage | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

/** Keeps the page to return to across sign-up and e-mail verification (another tab may finish the flow). */
export const rememberNext = (path: string) => {
  const safe = safeNext(path)
  if (safe) store()?.setItem(NEXT_KEY, safe)
}

export const takeNext = (): string | undefined => {
  const storage = store()
  const value = safeNext(storage?.getItem(NEXT_KEY))
  storage?.removeItem(NEXT_KEY)
  return value
}

/** D20: onboarding is for new sign-ups only. The sign-up form marks the address; returning users never match. */
export const markOnboardingPending = (email: string) => store()?.setItem(ONBOARDING_KEY, email.trim().toLowerCase())

export const onboardingPendingFor = (email: string): boolean => store()?.getItem(ONBOARDING_KEY) === email.trim().toLowerCase()

export const clearOnboardingPending = () => store()?.removeItem(ONBOARDING_KEY)

export const teamSuggestionDismissed = (): boolean => store()?.getItem(SUGGESTION_KEY) === '1'

export const dismissTeamSuggestion = () => store()?.setItem(SUGGESTION_KEY, '1')
