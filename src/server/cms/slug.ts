/**
 * Slugs (docs/12 §4.2). Pure. A slug is lowercase ASCII words joined by single dashes, at most 96 characters.
 * Generated from a title with the letters of the five locales mapped to ASCII; `page` and `rss.xml` are reserved
 * (they are route parts under `/blog/`). Legacy slugs that break the rule are still read and kept until changed.
 */
export const SLUG_MAX = 96
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const RESERVED_SLUGS: ReadonlyArray<string> = ['page', 'rss.xml']

const LETTERS: Readonly<Record<string, string>> = {
  ı: 'i',
  İ: 'i',
  ğ: 'g',
  ş: 's',
  ç: 'c',
  ö: 'o',
  ü: 'u',
  ß: 'ss',
  ñ: 'n',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
}

/** Whether `value` is a valid, non-reserved slug. */
export const isValidSlug = (value: string): boolean =>
  value.length <= SLUG_MAX && SLUG_PATTERN.test(value) && !RESERVED_SLUGS.includes(value)

/**
 * A slug from free text. Locale letters map first (`ı→i`, `ğ→g`, `ß→ss`, …), other accents drop (NFKD), every
 * remaining non `[a-z0-9]` run becomes one `-`. Cut at 96 on a word boundary when possible. Empty input gives `''`
 * (the caller picks a fallback); a reserved result gets `-1`.
 */
export const slugify = (text: string): string => {
  const mapped = [...text].map((ch) => LETTERS[ch] ?? LETTERS[ch.toLowerCase()] ?? ch).join('')
  const ascii = mapped
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const cut = ascii.length <= SLUG_MAX ? ascii : cutAtWord(ascii)
  return RESERVED_SLUGS.includes(cut) ? `${cut}-1` : cut
}

const cutAtWord = (slug: string): string => {
  const head = slug.slice(0, SLUG_MAX)
  if (slug[SLUG_MAX] === '-') return head
  const lastDash = head.lastIndexOf('-')
  return (lastDash > 0 ? head.slice(0, lastDash) : head).replace(/-+$/, '')
}

/** `base`, or `base-2`, `base-3`, … the first one `taken` does not hold. */
export const uniqueSlug = (base: string, taken: (slug: string) => boolean): string => {
  if (!taken(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`
    if (!taken(candidate)) return candidate
  }
}
