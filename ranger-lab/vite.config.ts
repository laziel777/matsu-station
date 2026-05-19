import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@root': path.resolve(__dirname, '..'),
    },
  },
  build: {
    outDir: '../dist-ranger-lab',
    emptyOutDir: true,
  },
  server: {
    host: 'localhost',
    port: 4321,
    strictPort: true,
  },
});
