import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Plain Vitest config — unit tests cover framework-agnostic TS (lib/, utils).
// Component/page rendering is covered by Playwright e2e against the built site.
export default defineConfig({
  resolve: {
    // Mirror the `@/*` path alias from tsconfig so lib modules (and their
    // image-asset imports) resolve under plain Vitest.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
