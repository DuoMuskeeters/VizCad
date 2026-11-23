import { cx } from './cx'

/*
 * The real asset (public/vizcad-logo-512.png) is a square image with the logo in the middle on opaque white.
 * The box crops to the artwork using em units, so one font-size class sets the height (`text-[28px]`) and
 * nothing is inline. Measured on the 512px file: art x 53–457, y 205–311 (404 × 106).
 *
 * Light theme: multiply makes the white disappear on the grey sidebar.
 * Dark theme: invert + hue-rotate keeps the cyan, and screen makes the (now black) background transparent.
 */
const art =
  'absolute -left-[0.5em] -top-[1.934em] max-w-none size-[4.83em] select-none mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180'

export type LogoProps = {
  /** `full` = cube + wordmark, `mark` = cube only. */
  variant?: 'full' | 'mark'
  /** Alt text. Pass "" when the name is written next to it. */
  alt?: string
  /** Sets the height via font-size; default 28px. */
  className?: string
}

export const Logo = ({ variant = 'full', alt = 'VizCad', className }: LogoProps) => (
  <span
    className={cx('relative inline-block h-[1em] shrink-0 overflow-hidden text-[28px]', variant === 'full' ? 'w-[3.811em]' : 'w-[0.849em]', className)}
  >
    <img src="/vizcad-logo-512.png" alt={alt} width={512} height={512} draggable={false} className={art} />
  </span>
)
