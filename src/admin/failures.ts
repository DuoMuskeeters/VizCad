import type { CmsFailure } from './api'
import type { AdminText } from './text'

/** One sentence for a failed CMS call (field-level errors are shown under their field by the editor). */
export const failureText = (text: AdminText, failure: CmsFailure): string => {
  switch (failure.error) {
    case 'Network':
      return text.errors.network
    case 'ContentConflict':
      return text.editor.conflict
    case 'SlugConflict':
      return text.errors.slugConflict
    case 'PublishBlocked':
      return text.blocked[failure.reason ?? ''] ?? text.errors.generic
    case 'TextTooLong':
      return `${text.fields[failure.field ?? ''] ?? ''} · ${failure.field === 'contentMd' ? text.errors.tooLongBytes(Math.round((failure.max ?? 0) / 1024)) : text.errors.tooLong(failure.max ?? 0)}`
    case 'CacheError':
      return text.errors.cache
    case 'RateLimitExceeded':
      return text.errors.rateLimited
    case 'PostUnavailable':
      return text.errors.missing
    case 'AuthorUnavailable':
      return text.errors.authorUnavailable
    case 'AssetUnavailable':
      return text.errors.assetUnavailable
    default:
      return text.errors.generic
  }
}
