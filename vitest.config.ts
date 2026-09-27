import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/unit/**/*.test.ts'],
      // Worker tests run in Node (Web Crypto, fetch, Request, and Response are built in).
      // Client tests opt into jsdom with a `@vitest-environment jsdom` comment.
      environment: 'node',
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: [
          'src/client/main.ts',
          'src/client/env.d.ts',
          'src/client/pages/**',
          'src/client/components/**',
        ],
        reporter: ['text', 'html', 'json-summary'],
        thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
      },
    },
  }),
);
