import { Avatar as A } from 'radix-ui'
import { cx } from './cx'

export type AvatarTone = 'accent' | 'ink' | 'warn' | 'success' | 'slate'

// Five tones from existing tokens. The initials use the page background colour, which is
// white on the light tones and near-black on the dark theme's light tones (both ≥ 4.5:1).
export const avatarTones: Record<AvatarTone, string> = {
  accent: 'bg-accent',
  ink: 'bg-text',
  warn: 'bg-warn',
  success: 'bg-success',
  slate: 'bg-text-2',
}
const toneOrder: readonly AvatarTone[] = ['accent', 'ink', 'warn', 'success', 'slate']

/** Stable tone per name, so a person keeps their colour everywhere. */
export const toneFor = (name: string): AvatarTone => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return toneOrder[hash % toneOrder.length] ?? 'accent'
}

export const initials = (name: string): string => {
  const words = name.trim().split(/[\s@._-]+/).filter(Boolean)
  const first = words[0]?.[0] ?? '?'
  const second = words.length > 1 ? words[words.length - 1]?.[0] : undefined
  return `${first}${second ?? ''}`.toLocaleUpperCase('tr')
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'
const sizes: Record<AvatarSize, string> = {
  xs: 'size-5.5 text-[10px]',
  sm: 'size-6.5 text-[10px]',
  md: 'size-7 text-xs',
  lg: 'size-8.5 text-xs',
}

export type AvatarProps = {
  name: string
  src?: string
  size?: AvatarSize
  tone?: AvatarTone
  /** Hide from screen readers when the name is written right next to it. */
  decorative?: boolean
  className?: string
}

export const Avatar = ({ name, src, size = 'md', tone, decorative = false, className }: AvatarProps) => (
  <A.Root
    {...(decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': name })}
    className={cx('inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-bg', sizes[size], avatarTones[tone ?? toneFor(name)], className)}
  >
    {src ? <A.Image src={src} alt="" className="size-full object-cover" /> : null}
    <A.Fallback delayMs={src ? 300 : 0}>{initials(name)}</A.Fallback>
  </A.Root>
)

export type AvatarStackProps = {
  people: readonly { name: string; src?: string }[]
  /** How many avatars show before "+n". */
  max?: number
  size?: AvatarSize
  /** Names the overflow bubble for screen readers, e.g. (n) => `${n} kişi daha`. */
  overflowLabel?: (hidden: number) => string
  className?: string
}

export const AvatarStack = ({ people, max = 3, size = 'sm', overflowLabel = (n) => `${n} kişi daha`, className }: AvatarStackProps) => {
  const shown = people.slice(0, max)
  const hidden = people.length - shown.length
  return (
    <span role="group" className={cx('inline-flex', className)}>
      {shown.map((person, index) => (
        <Avatar
          key={person.name}
          {...person}
          size={size}
          className={cx('border-2 border-bg', index > 0 && '-ml-1.5')}
        />
      ))}
      {hidden > 0 ? (
        <span
          role="img"
          aria-label={overflowLabel(hidden)}
          className={cx('-ml-1.5 inline-grid shrink-0 place-items-center rounded-full border-2 border-bg bg-hover font-semibold text-text-2', sizes[size])}
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  )
}
