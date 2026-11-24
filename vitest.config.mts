import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts'],
      exclude: ['server/dev.ts', 'server/devdb.ts', 'server/schema.ts'],
      reporter: ['text', 'html'],
    },
  },
});
