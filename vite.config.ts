import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/');
            if (normalizedId.includes('/@firebase/') || normalizedId.includes('/firebase/')) return 'firebase';
            if (normalizedId.includes('/browser-image-compression/')) return 'image-tools';
            if (normalizedId.includes('/motion/')) return 'motion';
            if (normalizedId.includes('/lucide-react/') || normalizedId.includes('/date-fns/')) return 'ui-vendor';
            return undefined;
          },
        },
      },
    },
    server: {
       host: '0.0.0.0',
       allowedHosts: true,

      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
