import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    host: true,
  },
  optimizeDeps: {
    // Exclude mind-ar from pre-bundling so Vite handles the worker imports correctly
    exclude: ['mind-ar'],
  },
  worker: {
    format: 'es',
  },
});
