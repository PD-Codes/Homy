import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath, URL } from 'node:url';

// Web app: built into the Flask package (homy/static/app). Hashed file names give
// cache versioning for free; index.html itself is served with no-cache.
export default defineConfig({
  root: 'src/web',
  base: '/static/app/',
  plugins: [preact()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL('../homy/static/app', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./src/web/index.html', import.meta.url)),
        embed: fileURLToPath(new URL('./src/web/embed.html', import.meta.url)),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/modules': 'http://localhost:8080',
      '/integrations': 'http://localhost:8080',
      '/themes': 'http://localhost:8080',
      '/lang': 'http://localhost:8080',
      '/static/js': 'http://localhost:8080',
      '/static/vendor': 'http://localhost:8080',
      '/embed': 'http://localhost:8080',
    },
  },
});
