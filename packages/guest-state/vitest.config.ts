import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // ports.ts is type-only; barrels + tests are scaffolding; the
      // DynamoDB adapter is a reserved throw-only skeleton (no real code
      // to cover until the table ships).
      exclude: [
        'src/index.ts',
        'src/server/index.ts',
        'src/testing/index.ts',
        'src/ports.ts',
        'src/adapters/dynamodb.ts',
        'src/__tests__/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 90,
      },
    },
  },
});
