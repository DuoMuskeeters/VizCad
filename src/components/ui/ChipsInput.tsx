import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cx } from './cx'
import { useFieldControl } from './Field'

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/
export const isEmail = (value: string): boolean => EMAIL.test(value)

export type ChipsInputProps = {
  value: readonly string[]
  onValueChange: (value: string[]) => void
  /** Default: e-mail check. */
  validate?: (item: string) => boolean
  /** Called with the text that was refused (invalid). Show your message in the surrounding <Field error>. */
  onReject?: (text: string) => void
  placeholder?: string
  /** Accessible name of each remove button. i18n-ready. */
  removeLabel?: (item: string) => string
  className?: string
}

const splitPasted = (text: string): string[] => text.split(/[\s,;]+/).filter(Boolean)

/** Chip entry for e-mail addresses: Enter, comma, space or blur adds; Backspace on empty input removes the last. */
export const ChipsInput = ({
  value,
  onValueChange,
  validate = isEmail,
  onReject,
  placeholder = 'E-posta ekle',
  removeLabel = (item) => `${item} kaldır`,
  className,
}: ChipsInputProps) => {
  const field = useFieldControl()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [rejected, setRejected] = useState(false)

  /** Adds valid, unseen items; returns the text that stays in the input (the refused rest). */
  const commit = (candidates: string[]): string => {
    const next = [...value]
    const refused: string[] = []
    for (const candidate of candidates) {
      if (!validate(candidate)) refused.push(candidate)
      else if (!next.includes(candidate)) next.push(candidate)
    }
    if (next.length !== value.length) onValueChange(next)
    const remaining = refused.join(' ')
    setRejected(remaining !== '')
    if (remaining) onReject?.(remaining)
    return remaining
  }

  const flush = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText(commit(splitPasted(trimmed)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      if (text.trim()) {
        event.preventDefault()
        flush()
      } else if (event.key === ',' || event.key === ' ') event.preventDefault()
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      onValueChange(value.slice(0, -1))
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = splitPasted(event.clipboardData.getData('text'))
    if (pasted.length < 2) return
    event.preventDefault()
    setText(commit(pasted))
  }

  const describedBy = field['aria-describedby']
  return (
    // The wrapper only forwards pointer focus to the input; the input is the keyboard target.
    <div
      onClick={() => inputRef.current?.focus()}
      className={cx(
        'flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-bg px-2 py-1.5',
        'focus-within:border-transparent focus-within:outline-2 focus-within:outline-offset-[-1px] focus-within:outline-brand',
        field['aria-invalid'] && 'border-danger',
        className,
      )}
    >
      {value.length > 0 ? (
        <ul className="contents">
          {value.map((item) => (
            <li
              key={item}
              className="inline-flex h-9 min-w-0 max-w-full items-center gap-1 rounded-full bg-hover pl-3 pr-1 text-sm app:h-7 app:pr-0.5"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                aria-label={removeLabel(item)}
                onClick={() => onValueChange(value.filter((v) => v !== item))}
                className="relative grid size-8 shrink-0 place-items-center rounded-full text-text-3 after:absolute after:-inset-1 after:content-[''] hover:text-text app:size-6"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        {...field}
        {...(rejected ? { 'aria-invalid': true as const } : {})}
        ref={inputRef}
        value={text}
        type="text"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        onChange={(event) => {
          setText(event.target.value)
          if (rejected) setRejected(false)
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={flush}
        className={cx(
          'h-9 min-w-30 flex-1 bg-transparent text-lg outline-none placeholder:text-text-3 app:h-7 app:text-base',
          rejected && 'text-danger',
        )}
      />
    </div>
  )
}
