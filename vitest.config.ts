import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC, not esbuild, so the tests see the decorator metadata GOAT's `@Tool` needs.
  plugins: [swc.vite({ jsc: { target: 'es2022' } })],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
