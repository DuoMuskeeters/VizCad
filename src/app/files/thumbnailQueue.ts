/**
 * The upload flow's thumbnail jobs (docs/11 §9 5a): one at a time, newest per file wins. `POST …/thumbnail?v=current`
 * stores on whatever version is current when it lands, so a job made from an older version's bytes must never post
 * after a newer version exists: a new job for the file, or `supersede` (a new version upload starting), drops every
 * older job for it, before it renders and again before it posts. No `effect`, no three.js.
 */
export type ThumbnailQueue = {
  /** Renders (`render`, null = nothing to store) and stores a thumbnail for `fileId` after the jobs before it. */
  readonly enqueue: (fileId: string, render: () => Promise<Blob | null>) => Promise<void>
  /** Drops queued and running jobs for `fileId` (their result is not posted). */
  readonly supersede: (fileId: string) => void
}

export const createThumbnailQueue = (store: (fileId: string, blob: Blob) => Promise<boolean>, onStored: () => void): ThumbnailQueue => {
  const latest = new Map<string, number>()
  let ticket = 0
  let chain: Promise<void> = Promise.resolve()
  return {
    supersede: (fileId) => {
      latest.set(fileId, ++ticket)
    },
    enqueue: (fileId, render) => {
      const mine = ++ticket
      latest.set(fileId, mine)
      const current = () => latest.get(fileId) === mine
      chain = chain
        .then(async () => {
          if (!current()) return
          const blob = await render()
          if (blob === null || !current()) return
          if (await store(fileId, blob)) onStored()
        })
        .catch(() => undefined)
        .finally(() => {
          if (current()) latest.delete(fileId)
        })
      return chain
    },
  }
}
