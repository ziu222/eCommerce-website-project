import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// e2e tests wipe tables, so they run against TEST_DATABASE_URL (falls back to DATABASE_URL in CI).
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// e2e tests never call OpenAI; AI tests replace the reviewer. E2E_USE_AI=1 keeps the real key.
if (process.env.E2E_USE_AI !== '1') delete process.env.OPENAI_API_KEY;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    hookTimeout: 60000,
    testTimeout: 60000,
    fileParallelism: false,
  },
});
