import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    // En desarrollo, Vite reenvía el WebSocket al servidor de Node.
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
