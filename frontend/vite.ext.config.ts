import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath, URL } from 'node:url';

// Browser add-on: everything is bundled (MV3 forbids remote code). Per-browser
// manifests are written by scripts/package-extension.mjs.
export default defineConfig({
  root: 'src/extension',
  base: './',
  publicDir: 'public',
  plugins: [preact()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL('./build/extension', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: {
        newtab: fileURLToPath(new URL('./src/extension/newtab.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/extension/background.ts', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
