import { defineConfig } from 'tsup';

/**
 * ESM + CJS with types. GOAT's `@Tool` decorator reads `design:paramtypes`, which esbuild does
 * not emit; with `emitDecoratorMetadata` in tsconfig.json tsup compiles through SWC instead
 * (`@swc/core`, a dev dependency), the same route GOAT's own plugins are built on.
 * The SDK, zod and @goat-sdk/core stay external.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  target: 'es2022',
  platform: 'neutral',
  dts: true,
  sourcemap: false,
  clean: true,
  splitting: false,
  external: ['@goat-sdk/core', '@hey-research-lab/sdk', 'zod'],
});
