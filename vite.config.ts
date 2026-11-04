import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const backend = 'http://localhost:3000';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(__dirname, 'web/index.html'), overlay: resolve(__dirname, 'web/overlay.html') } },
  },
  server: {
    host: true,
    proxy: { '/api': backend, '/events': backend, '/uploads': backend, '/overlay': { target: backend, rewrite: () => '/overlay.html' } },
  },
});
