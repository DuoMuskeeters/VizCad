/** Binary STL sizes (docs/11 §4.3, B7), shared by the dialog (app chunk) and the writer (its own lazy chunk). */

/** 80-byte header + count, then 50 bytes per triangle (normal, three corners, attribute count). */
export const stlBytes = (triangles: number) => 84 + 50 * triangles

/** The largest STL the browser writes (about 20 million triangles): past it a tab may run out of memory. */
export const STL_MAX_BYTES = 1024 * 1024 * 1024

/** Triangles per written piece: the file is a Blob of ~5 MB parts, never one huge buffer. */
export const STL_CHUNK_TRIANGLES = 100_000
