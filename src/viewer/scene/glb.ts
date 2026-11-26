/**
 * Writes the GLB derivative (docs/11 §2.2) from the three.js tree `buildModel` made, in the parse Worker. glTF is Y-up
 * and the viewer's world is Z-up (5a note 5): the conversion is one explicit root node, `vizcad`, turned -90° about X,
 * so a reader that knows nothing about us still sees the model upright, and `loadGlb` undoes exactly that node. Every
 * object keeps its node path in `userData.vizcadPath`, which GLTFExporter writes as `extras.vizcadPath` (§1.3).
 */
import { Group, type Object3D } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

/** The name and marker of the Y-up root the derivative carries. */
export const GLB_ROOT_NAME = 'vizcad'
export const GLB_ROOT_MARKER = { vizcadUp: 'z' } as const

/**
 * The GLB bytes of `model` (left untouched: it is moved under the Y-up root only for the export and put back). No
 * textures, no animations; materials are the viewer's (colour, metalness, roughness, double-sided).
 */
export const exportGlb = async (model: Object3D): Promise<ArrayBuffer> => {
  const parent = model.parent
  const root = new Group()
  root.name = GLB_ROOT_NAME
  root.userData = { ...GLB_ROOT_MARKER }
  root.rotation.x = -Math.PI / 2
  root.add(model)
  root.updateMatrixWorld(true)
  try {
    const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, trs: false })
    if (!(result instanceof ArrayBuffer)) throw new Error('GLTFExporter did not return a GLB')
    return result
  } finally {
    root.remove(model)
    if (parent !== null) parent.add(model)
    model.updateMatrixWorld(true)
  }
}
