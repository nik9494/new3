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
    // Разрешаем обращаться с любых хостов (нужно для туннеля)
    allowedHosts: true,
    proxy: {
      // Прокси для REST API (без WS)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Ошибка прокси API:', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Проксирование HTTP:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(
              'Ответ от API-прокси:',
              proxyRes.statusCode,
              req.url
            );
          });
        },
      },
      // Прокси для Socket.IO WebSocket
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Ошибка прокси Socket.IO:', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Проксирование WS:', req.url);
          });
        },
      },
    },
  },
});
