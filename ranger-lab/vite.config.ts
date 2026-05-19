import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const projectRoot = path.resolve(__dirname, '..');
const reactRoot = path.resolve(projectRoot, 'node_modules/react');
const reactDomRoot = path.resolve(projectRoot, 'node_modules/react-dom');

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@root', replacement: projectRoot },
      { find: 'react/jsx-dev-runtime', replacement: path.resolve(reactRoot, 'jsx-dev-runtime.js') },
      { find: 'react/jsx-runtime', replacement: path.resolve(reactRoot, 'jsx-runtime.js') },
      { find: 'react', replacement: path.resolve(reactRoot, 'index.js') },
      { find: 'react-dom/client', replacement: path.resolve(reactDomRoot, 'client.js') },
      { find: 'react-dom', replacement: path.resolve(reactDomRoot, 'index.js') },
    ],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client'],
  },
  build: {
    outDir: '../dist-ranger-lab',
    emptyOutDir: true,
  },
  server: {
    host: 'localhost',
    port: 4321,
    strictPort: true,
    fs: {
      allow: [projectRoot],
    },
  },
});
