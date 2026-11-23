export type ClassValue = string | false | null | undefined

/** Joins class names, skipping falsy values. Variants are explicit maps, so no conflict resolution is needed. */
export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(' ')

/** 44px tap target below 900px, the compact desktop size above (D14). */
export const controlHeight = 'h-11 app:h-9.5'

/** Hover/press feedback timing (tokens.css --dur-fast). */
export const fastTransition = 'transition-colors duration-(--dur-fast) ease-out motion-reduce:transition-none'
