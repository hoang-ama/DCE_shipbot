import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: { main: path.resolve(import.meta.dirname, "index.html"), playground: path.resolve(import.meta.dirname, "playground.html"), dichung: path.resolve(import.meta.dirname, "dichung.html") } } },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: true,
    },
  };
});
