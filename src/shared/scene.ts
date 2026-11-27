/**
 * The scene record's shape and limits (docs/11 §3.1), shared by the server (Schema in `server/scene.ts`) and the
 * browser (plain types, no `effect`). A body is sparse: only changed nodes are written.
 */

/** Node entries per body (§3.1). */
export const SCENE_MAX_NODES = 2000
/** The stored JSON text, in bytes of its UTF-16 length check (`length(body)` in D1). */
export const SCENE_MAX_BODY = 128 * 1024
export const SCENE_NAME_MAX = 200
/** Name path of a node when the entry was written (`Pump/Body/Screw M3 [2]`), the key of §3.3 matching. */
export const SCENE_NAME_PATH_MAX = 1024
export const SCENE_VIEW_NAME_MAX = 120

export const finishes = ['matte', 'satin', 'metal'] as const
export type SceneFinish = (typeof finishes)[number]

export type SceneNode = {
  readonly name?: string
  /** `#rrggbb`, lower case. */
  readonly color?: string
  readonly finish?: SceneFinish
  /** Hidden for everyone who opens the file (edit mode; B2's local hide is never written). */
  readonly hidden?: true
  readonly at?: string
}

type Vec3 = readonly [number, number, number]

export type SceneView = {
  readonly id: string
  readonly name: string
  readonly camera: { readonly position: Vec3; readonly target: Vec3; readonly up: Vec3; readonly fov: number }
  readonly hidden?: readonly string[]
  readonly section?: { readonly normal: Vec3; readonly constant: number }
  /** The part opened alone ("Open only this") when the view was saved. */
  readonly isolated?: string
}

export type SceneBody = {
  readonly v: 1
  readonly nodes: Readonly<Record<string, SceneNode>>
  readonly views: readonly SceneView[]
}

export const EMPTY_SCENE: SceneBody = { v: 1, nodes: {}, views: [] }

/** `GET /api/files/{id}/scene`: this model's record, or (none yet) the newest record of an earlier model to match from. */
export type SceneAnswer = {
  readonly scene: { readonly revision: number; readonly body: SceneBody; readonly updatedAt: number; readonly updatedBy: string | null } | null
  /** Only when `scene` is null and the caller may write: the source of the "apply previous colours" banner (§3.3). */
  readonly previous: { readonly body: SceneBody; readonly versionNumber: number | null } | null
  /** Whether this caller may write the scene (edit). */
  readonly canEdit: boolean
  readonly maxViews: number
}
