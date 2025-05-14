import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { tempo } from 'tempo-devtools/dist/vite';

export default defineConfig({
  base:
    process.env.NODE_ENV === 'development'
      ? '/'
      : process.env.VITE_BASE_PATH || '/',
  optimizeDeps: {
    entries: ['src/main.tsx', 'src/tempobook/**/*'],
  },
  plugins: [react(), tempo()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // @ts-ignore
    allowedHosts: true,
    proxy: {
      // REST API proxy (no WebSocket)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Ошибка прокси:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Проксирование запроса:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log(
              'Получен ответ от прокси:',
              proxyRes.statusCode,
              req.url
            );
          });
        },
      },
      // Socket.IO WebSocket proxy
      '/socket.io': {
        target: 'ws://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Socket.IO proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Socket.IO proxyReq:', req.url);
          });
        },
      },
      // If your Socket.IO server is mounted under /api/socket.io, uncomment:
      // '/api/socket.io': {
      //   target: 'ws://localhost:3001',
      //   changeOrigin: true,
      //   secure: false,
      //   ws: true,
      // },
    },
  },
});

