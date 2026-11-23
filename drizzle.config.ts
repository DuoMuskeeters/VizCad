import { defineConfig } from 'drizzle-kit'

// Generates SQL into drizzle/ only. Apply with `pnpm db:migrate:local` (Wrangler); never push to
// production from here. The migration history in drizzle/ is the production history: keep it intact.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
})
