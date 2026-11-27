/**
 * The scene record on the file page (docs/11 §3): read once per model, applied for everyone, written by an editor in
 * scene prep mode. Saves 1.5 s after the last change, one request at a time; a stale revision stops saving and asks
 * for a reload (`conflict`). No `effect`: browser code.
 *
 * Each model (file, version, stored model, read) has its own session: revision, latest body, dirty, in flight and
 * stopped. A session left behind (another version, the GLB stored, a reload) still finishes its own queue, but its
 * answers no longer reach the page's state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_SCENE, SCENE_MAX_BODY, type SceneAnswer, type SceneBody } from '#/shared/scene'
import { fitsLimits } from '#/viewer/tree/scene'

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
  input: { readonly fileId: string; readonly version: number; readonly revision: number; readonly body: SceneBody; readonly keepalive?: boolean },
  fetcher: Fetch = (...args) => fetch(...args),
): Promise<SaveResult> => {
  try {
    const response = await fetcher(url(input.fileId), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: input.version, revision: input.revision, body: input.body }),
      ...(input.keepalive ? { keepalive: true } : {}),
    })
    if (response.ok) return { ok: true, revision: ((await response.json()) as { data: { revision: number } }).data.revision }
    const error = ((await response.json().catch(() => ({}))) as { error?: string }).error
    return { ok: false, error: error === 'SceneConflict' ? 'conflict' : error === 'VersionChanged' ? 'version' : 'error' }
  } catch {
    return { ok: false, error: 'error' }
  }
}

/** A `keepalive` request may carry at most 64 KiB (all of them together, per page). */
export const KEEPALIVE_MAX_BYTES = 64 * 1024

/** `tooLarge`: more entries than §3.1 allows, or a body over the stored size: refused here, never sent. */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'version' | 'error' | 'tooLarge'

/** A body the server would refuse for its size: too many entries, or a stored text over the limit. */
export const overLimits = (body: SceneBody) => !fitsLimits(body) || JSON.stringify(body).length > SCENE_MAX_BODY

export type SceneState = {
  /** The answer as read (null while loading or when it could not be read: the model shows as in the file). */
  readonly answer: SceneAnswer | null
  /** What is applied: the record, with this editor's unsaved changes. */
  readonly body: SceneBody
  readonly status: SaveStatus
  readonly savedAt: number | null
  /** Replace the body and save after the delay (edit mode, matching, ignoring). */
  readonly change: (body: SceneBody, immediately?: boolean) => void
  /** Send a change that failed again, now. */
  readonly retry: () => void
  /** Read the record again, dropping unsaved changes (after a conflict). */
  readonly reload: () => void
}

type Session = {
  readonly fileId: string
  readonly version: number
  readonly fetcher: Fetch | undefined
  /** Its answers reach the page only while it is the current session. */
  live: boolean
  revision: number
  latest: SceneBody
  dirty: boolean
  inFlight: boolean
  stopped: boolean
  failed: boolean
  timer: ReturnType<typeof setTimeout> | null
}

/** Sessions with work left (this page's and the ones left behind): leaving the page warns while any has some. */
const busy = (session: Session) => !session.stopped && (session.dirty || session.inFlight)

/**
 * `model` names the stored model the record belongs to (kind and size): when the GLB is stored, the record is read
 * again for it. `enabled` is false while no model is open (Preparing, no 3D).
 */
export const useScene = (fileId: string, version: number, model: string, enabled: boolean, fetcher?: Fetch): SceneState => {
  const [answer, setAnswer] = useState<SceneAnswer | null>(null)
  const [body, setBody] = useState<SceneBody>(EMPTY_SCENE)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [readKey, setReadKey] = useState(0)
  const current = useRef<Session | null>(null)
  const sessions = useRef(new Set<Session>())

  const flush = useCallback(async (session: Session): Promise<void> => {
    session.timer = null
    if (session.inFlight || !session.dirty || session.stopped) return
    session.inFlight = true
    session.dirty = false
    if (session.live) setStatus('saving')
    const sent = session.latest
    const result = await saveScene({ fileId: session.fileId, version: session.version, revision: session.revision, body: sent }, session.fetcher)
    session.inFlight = false
    if (result.ok) {
      session.revision = result.revision
      session.failed = false
      if (session.live) {
        setAnswer((read) => (read === null ? read : { ...read, scene: { revision: result.revision, body: sent, updatedAt: Math.floor(Date.now() / 1000), updatedBy: null }, previous: null }))
        setSavedAt(Date.now())
      }
      // A change made while this one was on its way goes next (also for a session left behind: its own queue).
      if (session.dirty) return flush(session)
      if (session.live) setStatus('saved')
      else sessions.current.delete(session)
      return
    }
    if (result.error === 'conflict' || result.error === 'version') {
      session.stopped = true
      sessions.current.delete(session)
      if (session.live) setStatus(result.error)
      return
    }
    // A network or server error: keep the change and try again on the next edit (or Retry).
    session.dirty = true
    session.failed = true
    if (session.live) setStatus('error')
  }, [])

  useEffect(() => {
    if (!enabled) return
    const session: Session = { fileId, version, fetcher, live: true, revision: 0, latest: EMPTY_SCENE, dirty: false, inFlight: false, stopped: false, failed: false, timer: null }
    current.current = session
    sessions.current.add(session)
    setAnswer(null)
    setBody(EMPTY_SCENE)
    setStatus('idle')
    void fetchScene(fileId, fetcher).then((read) => {
      if (!session.live) return
      setAnswer(read)
      const next = read?.scene?.body ?? EMPTY_SCENE
      session.revision = read?.scene?.revision ?? 0
      session.latest = next
      setBody(next)
    })
    return () => {
      session.live = false
      if (current.current === session) current.current = null
      // Leaving the model (or the page) with a change still waiting: send it now, best effort, for the version it was
      // made on; after a new version the server refuses it (`VersionChanged`): the paths belong to the old model.
      if (session.timer !== null) {
        clearTimeout(session.timer)
        session.timer = null
      }
      if (busy(session)) void flush(session)
      else sessions.current.delete(session)
    }
    // `fetcher` is a test seam, fixed per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, version, model, enabled, readKey, flush])

  // Leaving the page: warn while a change is pending, on its way or failed; on pagehide send what waits (keepalive).
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (![...sessions.current].some(busy)) return
      event.preventDefault()
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = ''
    }
    const onPageHide = () => {
      let budget = KEEPALIVE_MAX_BYTES
      for (const session of sessions.current) {
        if (!session.dirty || session.inFlight || session.stopped) continue
        const size = new TextEncoder().encode(JSON.stringify({ version: session.version, revision: session.revision, body: session.latest })).length
        if (size > budget) continue
        budget -= size
        if (session.timer !== null) clearTimeout(session.timer)
        session.timer = null
        session.dirty = false
        void saveScene({ fileId: session.fileId, version: session.version, revision: session.revision, body: session.latest, keepalive: true }, session.fetcher)
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  const change = useCallback(
    (next: SceneBody, immediately = false) => {
      const session = current.current
      if (session === null || session.stopped) return
      // Over the limits: shown, never sent (the server would refuse it and every later change with it).
      if (overLimits(next)) {
        setStatus('tooLarge')
        return
      }
      session.latest = next
      setBody(next)
      session.dirty = true
      sessions.current.add(session)
      setStatus((state) => (state === 'saving' ? state : 'pending'))
      if (session.timer !== null) clearTimeout(session.timer)
      session.timer = immediately ? null : setTimeout(() => void flush(session), SAVE_DELAY_MS)
      if (immediately) void flush(session)
    },
    [flush],
  )

  const retry = useCallback(() => {
    const session = current.current
    if (session !== null && session.timer === null) void flush(session)
  }, [flush])
  const reload = useCallback(() => setReadKey((n) => n + 1), [])

  return { answer, body, status, savedAt, change, retry, reload }
}
