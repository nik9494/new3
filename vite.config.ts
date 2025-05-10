import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { tempo } from 'tempo-devtools/dist/vite';

// https://vitejs.dev/config/
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
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
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
    },
  },
});
