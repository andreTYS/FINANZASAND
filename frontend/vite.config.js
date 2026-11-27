import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // usamos public/manifest.webmanifest
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // La API nunca se sirve desde caché (datos financieros siempre frescos)
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fuentes' },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
