import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vitest config for the viewer's in-memory unit + component tests.
 *
 * - `tests/` (Playwright E2E) is excluded — those run via `pnpm test:e2e`.
 * - `happy-dom` gives us a DOM for component tests of `src/components/*`
 *   without the cost of jsdom or a real browser.
 * - Path alias `@/*` mirrors the Next.js + tsconfig setup so imports in
 *   tests look identical to imports in app code.
 */
export default defineConfig({
  // React plugin gives us the JSX automatic runtime so tests don't have
  // to `import React`.
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/**', 'node_modules/**'],
    globals: false,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
