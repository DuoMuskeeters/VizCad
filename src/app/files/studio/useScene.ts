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
  /** The read has answered for this model (with a record, none, or a failure): false while it is on its way. */
  readonly read: boolean
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
  /** Counts changes lost on a model left behind (its save failed after the page moved on): the page tells it once each. */
  readonly lost: number
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
  /** The last change was refused for its size: the notice stays until a change is accepted (an error still shows). */
  tooLarge: boolean
  /** Left behind with a newer change waiting when its request failed: that change gets one try before it is dropped. */
  lastTry: boolean
  timer: ReturnType<typeof setTimeout> | null
}

/** Sessions with work left (this page's and the ones left behind): leaving the page warns while any has some. */
const busy = (session: Session) => !session.stopped && (session.dirty || session.inFlight)

/**
 * `model` names the stored model the record belongs to (kind and size): when the GLB is stored, the record is read
 * again for it. `enabled` is false while no model is open (Preparing, no 3D).
 */
export const useScene = (
  fileId: string,
  version: number,
  model: string,
  enabled: boolean,
  fetcher?: Fetch,
  /**
   * A change was lost on a model left behind. Called even after the page is gone (the person left the file page while
   * the save was on its way): the caller passes something held above the page (the app's toast), never page state.
   */
  onLost?: () => void,
): SceneState => {
  const lostSink = useRef(onLost)
  lostSink.current = onLost
  const [answer, setAnswer] = useState<SceneAnswer | null>(null)
  const [read, setRead] = useState(false)
  const [body, setBody] = useState<SceneBody>(EMPTY_SCENE)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [readKey, setReadKey] = useState(0)
  const [lost, setLost] = useState(0)
  const current = useRef<Session | null>(null)
  const sessions = useRef(new Set<Session>())

  // `keepalive`: sent from pagehide, so it outlives the page; back from the bfcache, its answer updates the state as usual.
  const flush = useCallback(async (session: Session, keepalive = false): Promise<void> => {
    session.timer = null
    if (session.inFlight || !session.dirty || session.stopped) return
    // The page's save state: a size refusal stays shown over saving and saved until the next accepted change; an
    // error replaces it, so Retry shows for the change that did not save.
    const show = (next: SaveStatus) => {
      if (session.live) setStatus(session.tooLarge && next !== 'error' ? 'tooLarge' : next)
    }
    session.inFlight = true
    session.dirty = false
    show('saving')
    const sent = session.latest
    const result = await saveScene({ fileId: session.fileId, version: session.version, revision: session.revision, body: sent, keepalive }, session.fetcher)
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
      show('saved')
      if (!session.live) sessions.current.delete(session)
      return
    }
    if (result.error === 'conflict' || result.error === 'version') {
      session.stopped = true
      sessions.current.delete(session)
      if (session.live) setStatus(result.error)
      // Left behind, the change is lost all the same: the page (or, once it is gone, the app) says so.
      else {
        setLost((n) => n + 1)
        lostSink.current?.()
      }
      return
    }
    // A model left behind has no next edit and no Retry: a newer change waiting behind the failed one is tried once;
    // then the change is dropped (leaving stops warning) and the page says so.
    if (!session.live) {
      if (session.dirty && !session.lastTry) {
        session.lastTry = true
        return flush(session)
      }
      session.stopped = true
      sessions.current.delete(session)
      setLost((n) => n + 1)
      lostSink.current?.()
      return
    }
    // A network or server error: keep the change and try again on the next edit (or Retry).
    session.dirty = true
    session.failed = true
    show('error')
  }, [])

  useEffect(() => {
    if (!enabled) return
    const session: Session = { fileId, version, fetcher, live: true, revision: 0, latest: EMPTY_SCENE, dirty: false, inFlight: false, stopped: false, failed: false, tooLarge: false, lastTry: false, timer: null }
    current.current = session
    sessions.current.add(session)
    setAnswer(null)
    setRead(false)
    setBody(EMPTY_SCENE)
    setStatus('idle')
    void fetchScene(fileId, fetcher).then((found) => {
      if (!session.live) return
      setAnswer(found)
      setRead(true)
      const next = found?.scene?.body ?? EMPTY_SCENE
      session.revision = found?.scene?.revision ?? 0
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
        void flush(session, true)
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [flush])

  const change = useCallback(
    (next: SceneBody, immediately = false) => {
      const session = current.current
      if (session === null || session.stopped) return
      // Over the limits: shown, never sent (the server would refuse it and every later change with it).
      if (overLimits(next)) {
        session.tooLarge = true
        // A change that already failed keeps its Retry: the refusal does not hide it.
        setStatus(session.failed && session.dirty ? 'error' : 'tooLarge')
        return
      }
      session.tooLarge = false
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

  return { answer, read, body, status, savedAt, change, retry, reload, lost }
}
