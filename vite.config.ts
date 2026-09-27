import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Builds the browser app into dist/client, which wrangler.jsonc serves as static assets.
// The Worker (src/worker) is bundled by Wrangler, not Vite.
export default defineConfig({
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // Everything, fonts included, is a same-origin file under /assets/.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
});
