import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 650, rollupOptions: { output: { manualChunks: { three: ['three'] } } } } });
