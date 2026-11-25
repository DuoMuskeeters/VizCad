import { contentUrl } from './types'

/** Starts the browser download of the current version. The server answers with `Content-Disposition: attachment`, so the page stays. */
export const startDownload = (fileId: string) => {
  const link = document.createElement('a')
  link.href = contentUrl(fileId)
  link.rel = 'noopener'
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
}
