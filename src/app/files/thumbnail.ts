/**
 * Stores a thumbnail the viewer's Worker rendered (docs/11 §9 5a) through the existing `POST /api/files/{id}/thumbnail`
 * (PNG or WebP, at most 1024×1024 and 1 MiB; the server parses the image and needs `edit`). No `effect`, no three.js.
 */
const TYPES = new Set(['image/png', 'image/webp'])

export const thumbnailPostUrl = (fileId: string) => `/api/files/${encodeURIComponent(fileId)}/thumbnail?v=current`

/** True when the server stored it. Failures are quiet: the file simply keeps its file-type card. */
export const uploadThumbnail = async (fileId: string, blob: Blob, fetcher: typeof fetch = (...args) => fetch(...args)): Promise<boolean> => {
  if (!TYPES.has(blob.type) || blob.size === 0 || blob.size > 1024 * 1024) return false
  try {
    const response = await fetcher(thumbnailPostUrl(fileId), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type }, body: blob })
    return response.ok
  } catch {
    return false
  }
}
