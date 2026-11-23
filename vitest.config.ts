import { defineConfig } from 'vitest/config'

// Unit tests run in Node with in-memory Effect layers; they never touch D1/R2. legacy/ is not tested.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Component tests (*.test.tsx) opt into jsdom with a `// @vitest-environment jsdom` docblock.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
