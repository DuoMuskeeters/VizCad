/**
 * Validation of scene bodies (docs/11 §3.1): every field bounded, unknown properties refused at the HTTP boundary.
 * Limits come from `shared/scene.ts`; the saved-view count from `Entitlements.savedViewsPerScene` in the program.
 */
import { Schema } from 'effect'
import { finishes, SCENE_MAX_NODES, SCENE_NAME_MAX, SCENE_NAME_PATH_MAX, SCENE_VIEW_NAME_MAX } from '../shared/scene'

/** `0.3.2`: the node path of docs/11 §1.3 (same rule as the browser's `isNodePath`). */
export const NodePath = Schema.String.check(Schema.isMaxLength(448), Schema.isPattern(/^0(\.(0|[1-9]\d{0,5}))*$/))

const Text = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max))
const Coordinate = Schema.Finite.check(Schema.isBetween({ minimum: -1e12, maximum: 1e12 }))
const Vec3 = Schema.Tuple([Coordinate, Coordinate, Coordinate])

/**
 * A comment pin (docs/11 §4.3, B3): the node it is on and the point in that node's own coordinates, so it stays on the
 * part whatever the root's turn. Stored as JSON in `file_comments.anchor` (≤ 1024 characters).
 */
export const CommentAnchor = Schema.Struct({ v: Schema.Literal(1), path: NodePath, point: Vec3 })
export type CommentAnchor = typeof CommentAnchor.Type
/** A stored anchor; unreadable text reads as no pin. */
export const StoredAnchor = Schema.fromJsonString(CommentAnchor)

export const SceneNode = Schema.Struct({
  name: Schema.optionalKey(Text(SCENE_NAME_MAX)),
  color: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/))),
  finish: Schema.optionalKey(Schema.Literals(finishes)),
  hidden: Schema.optionalKey(Schema.Literal(true)),
  at: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(SCENE_NAME_PATH_MAX))),
})

export const SceneView = Schema.Struct({
  id: Text(64),
  name: Text(SCENE_VIEW_NAME_MAX),
  camera: Schema.Struct({ position: Vec3, target: Vec3, up: Vec3, fov: Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 179 })) }),
  hidden: Schema.optionalKey(Schema.Array(NodePath).check(Schema.isMaxLength(SCENE_MAX_NODES))),
  section: Schema.optionalKey(Schema.Struct({ normal: Vec3, constant: Coordinate })),
  isolated: Schema.optionalKey(NodePath),
})

export const SceneBody = Schema.Struct({
  v: Schema.Literal(1),
  nodes: Schema.Record(NodePath, SceneNode).check(Schema.isMaxProperties(SCENE_MAX_NODES)),
  views: Schema.Array(SceneView).check(Schema.isMaxLength(200)),
})
export type SceneBody = typeof SceneBody.Type

/** A stored body (written by the server after the checks above); unreadable text is treated as an empty scene. */
export const StoredScene = Schema.fromJsonString(SceneBody)
