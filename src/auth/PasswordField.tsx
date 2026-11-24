import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { useI18n } from '#/i18n'
import type { ReactNode } from 'react'

type Props = {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  error?: string | undefined
  hint?: string | undefined
  /** Extra element on the label row (e.g. "Forgot password?"). */
  labelAside?: ReactNode
}

export const PasswordField = ({ label, value, onChange, autoComplete, error, hint, labelAside }: Props) => {
  const { t } = useI18n()
  const [shown, setShown] = useState(false)
  const toggleLabel = shown ? t('common.hidePassword') : t('common.showPassword')
  return (
    <Field
      label={
        labelAside ? (
          <span className="flex items-baseline justify-between gap-3">
            <span>{label}</span>
            {labelAside}
          </span>
        ) : (
          label
        )
      }
      error={error}
      hint={hint}
      required
    >
      <span className="relative block">
        <Input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 pr-12"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={toggleLabel}
          aria-pressed={shown}
          className="absolute right-0.5 top-0.5 grid size-11 place-items-center rounded-sm text-text-3 hover:text-text"
        >
          {shown ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
        </button>
      </span>
    </Field>
  )
}
