import { Layer } from 'effect'
import { Db, make } from './Db'

/** Db backed by the Worker's D1 binding (`vizcad_auth`). */
export const layer = (binding: D1Database) => Layer.succeed(Db, make(binding))
