import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['client/src/**/*.test.js', 'server/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
