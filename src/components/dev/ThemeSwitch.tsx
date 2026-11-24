import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { SegmentedControl } from '#/components/ui/SegmentedControl'

type Theme = 'light' | 'dark' | 'system'
const KEY = 'vizcad:dev-theme'

const apply = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark' || value === 'system'

const initial = (): Theme => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('theme')
    if (isTheme(fromUrl)) return fromUrl
    const stored = window.localStorage.getItem(KEY)
    if (isTheme(stored)) return stored
  } catch {
    // Storage can be blocked; the system theme is a fine fallback.
  }
  return 'system'
}

/** Dev-only theme switch: writes `data-theme` on <html> (docs/03-design.md §5). Never part of the product UI. */
export const ThemeSwitch = () => {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const first = initial()
    setTheme(first)
    apply(first)
  }, [])

  return (
    <SegmentedControl
      aria-label="Tema"
      value={theme}
      onValueChange={(value) => {
        if (!isTheme(value)) return
        setTheme(value)
        apply(value)
        try {
          window.localStorage.setItem(KEY, value)
        } catch {
          // ignore
        }
      }}
      options={[
        { value: 'light', label: 'Açık', icon: <Sun aria-hidden /> },
        { value: 'dark', label: 'Koyu', icon: <Moon aria-hidden /> },
        { value: 'system', label: 'Sistem', icon: <Monitor aria-hidden /> },
      ]}
    />
  )
}
