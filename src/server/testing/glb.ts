/** GLB bytes for the derivative tests (docs/11 §7): a valid binary glTF 2.0 and the ways it can be wrong. */

const le32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true)

/**
 * A structurally valid GLB: 12-byte header, a JSON chunk (padded with spaces to 4 bytes) and a BIN chunk of `binBytes`
 * zero bytes. Only the container matters to the server; the scene is a single empty node.
 */
export const glb = (options: { readonly json?: string; readonly binBytes?: number } = {}) => {
  const text = new TextEncoder().encode(options.json ?? '{"asset":{"version":"2.0"},"scenes":[{"nodes":[0]}],"nodes":[{"name":"root"}]}')
  const jsonLength = Math.ceil(text.byteLength / 4) * 4
  const binLength = Math.ceil((options.binBytes ?? 8) / 4) * 4
  const total = 12 + 8 + jsonLength + (binLength > 0 ? 8 + binLength : 0)
  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  le32(view, 0, 0x46546c67)
  le32(view, 4, 2)
  le32(view, 8, total)
  le32(view, 12, jsonLength)
  le32(view, 16, 0x4e4f534a)
  bytes.fill(0x20, 20, 20 + jsonLength)
  bytes.set(text, 20)
  if (binLength > 0) {
    le32(view, 20 + jsonLength, binLength)
    le32(view, 24 + jsonLength, 0x004e4942)
  }
  return bytes
}

/** `glb()` with one 32-bit header field replaced: 0 magic, 4 version, 8 total length, 12 chunk length, 16 chunk type. */
export const glbWith = (offset: 0 | 4 | 8 | 12 | 16, value: number, base: Uint8Array = glb()) => {
  const bytes = base.slice()
  new DataView(bytes.buffer).setUint32(offset, value, true)
  return bytes
}
