/**
 * The scene record on the file page (docs/11 §3): read once per model, applied for everyone, written by an editor in
 * scene prep mode. Saves 1.5 s after the last change, one request at a time; a stale revision stops saving and asks
 * for a reload (`conflict`). No `effect`: browser code.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_SCENE, type SceneAnswer, type SceneBody } from '#/shared/scene'

export const SAVE_DELAY_MS = 1500

type Fetch = typeof fetch

const url = (fileId: string) => `/api/files/${encodeURIComponent(fileId)}/scene`

export type SaveResult = { readonly ok: true; readonly revision: number } | { readonly ok: false; readonly error: 'conflict' | 'version' | 'error' }

export const fetchScene = async (fileId: string, fetcher: Fetch = (...args) => fetch(...args)): Promise<SceneAnswer | null> => {
  try {
    const response = await fetcher(url(fileId), { credentials: 'same-origin' })
    if (!response.ok) return null
    return ((await response.json()) as { data: SceneAnswer }).data
  } catch {
    return null
  }
}

export const saveScene = async (
  input: { readonly fileId: string; readonly version: number; readonly revision: number; readonly body: SceneBody },
  fetcher: Fetch = (...args) => fetch(...args),
): Promise<SaveResult> => {
  try {
    const response = await fetcher(url(input.fileId), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: input.version, revision: input.revision, body: input.body }),
    })
    if (response.ok) return { ok: true, revision: ((await response.json()) as { data: { revision: number } }).data.revision }
    const error = ((await response.json().catch(() => ({}))) as { error?: string }).error
    return { ok: false, error: error === 'SceneConflict' ? 'conflict' : error === 'VersionChanged' ? 'version' : 'error' }
  } catch {
    return { ok: false, error: 'error' }
  }
}

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'version' | 'error'

export type SceneState = {
  /** The answer as read (null while loading or when it could not be read: the model shows as in the file). */
  readonly answer: SceneAnswer | null
  /** What is applied: the record, with this editor's unsaved changes. */
  readonly body: SceneBody
  readonly status: SaveStatus
  readonly savedAt: number | null
  /** Replace the body and save after the delay (edit mode, matching, ignoring). */
  readonly change: (body: SceneBody, immediately?: boolean) => void
  /** Read the record again, dropping unsaved changes (after a conflict). */
  readonly reload: () => void
}

/** `key` changes with the model (file id + version): the record is read again and the editor's state starts over. */
export const useScene = (fileId: string, version: number, enabled: boolean, fetcher?: Fetch): SceneState => {
  const [answer, setAnswer] = useState<SceneAnswer | null>(null)
  const [body, setBody] = useState<SceneBody>(EMPTY_SCENE)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [readKey, setReadKey] = useState(0)
  const revision = useRef(0)
  const latest = useRef<SceneBody>(EMPTY_SCENE)
  const dirty = useRef(false)
  const inFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = useRef(false)
  const target = useRef({ fileId, version, fetcher })
  target.current = { fileId, version, fetcher }

  useEffect(() => {
    if (!enabled) return
    let live = true
    stopped.current = false
    dirty.current = false
    setStatus('idle')
    void fetchScene(fileId, fetcher).then((read) => {
      if (!live) return
      setAnswer(read)
      const next = read?.scene?.body ?? EMPTY_SCENE
      revision.current = read?.scene?.revision ?? 0
      latest.current = next
      setBody(next)
    })
    return () => {
      live = false
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
    // `fetcher` is a test seam, fixed per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, version, enabled, readKey])

  const flush = useCallback(async () => {
    timer.current = null
    if (inFlight.current || !dirty.current || stopped.current) return
    inFlight.current = true
    dirty.current = false
    setStatus('saving')
    const sent = latest.current
    const result = await saveScene({ fileId: target.current.fileId, version: target.current.version, revision: revision.current, body: sent }, target.current.fetcher)
    inFlight.current = false
    if (result.ok) {
      revision.current = result.revision
      setAnswer((current) => (current === null ? current : { ...current, scene: { revision: result.revision, body: sent, updatedAt: Math.floor(Date.now() / 1000), updatedBy: null }, previous: null }))
      setSavedAt(Date.now())
      // A change made while this one was on its way goes next.
      if (dirty.current) void flush()
      else setStatus('saved')
      return
    }
    if (result.error === 'conflict' || result.error === 'version') {
      stopped.current = true
      setStatus(result.error)
      return
    }
    // A network or server error: keep the change and try again on the next edit (or now, once).
    dirty.current = true
    setStatus('error')
  }, [])

  const change = useCallback(
    (next: SceneBody, immediately = false) => {
      if (stopped.current) return
      latest.current = next
      setBody(next)
      dirty.current = true
      setStatus((current) => (current === 'saving' ? current : 'pending'))
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = immediately ? null : setTimeout(() => void flush(), SAVE_DELAY_MS)
      if (immediately) void flush()
    },
    [flush],
  )

  const reload = useCallback(() => setReadKey((n) => n + 1), [])

  // Leaving the page with a change still waiting: send it now (best effort).
  useEffect(
    () => () => {
      if (timer.current !== null && dirty.current && !stopped.current) void flush()
    },
    [flush],
  )

  return { answer, body, status, savedAt, change, reload }
}
