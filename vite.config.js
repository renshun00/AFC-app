import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'offline.html', 'icons/*.svg'],
      devOptions: {
        enabled: true,
        type: 'module',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https?:\/\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'afc-runtime',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'AFC Management System',
        short_name: 'AFC Mgmt',
        description: 'Along Fried Chicken – Operations Management PWA',
        theme_color: '#e8624a',
        background_color: '#f4f4f5',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-72x72.svg',   sizes: '72x72',   type: 'image/svg+xml' },
          { src: '/icons/icon-96x96.svg',   sizes: '96x96',   type: 'image/svg+xml' },
          { src: '/icons/icon-128x128.svg', sizes: '128x128', type: 'image/svg+xml' },
          { src: '/icons/icon-144x144.svg', sizes: '144x144', type: 'image/svg+xml' },
          { src: '/icons/icon-152x152.svg', sizes: '152x152', type: 'image/svg+xml' },
          { src: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-384x384.svg', sizes: '384x384', type: 'image/svg+xml' },
          { src: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/maskable-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: "View today's overview",
            url: '/?page=dashboard',
            icons: [{ src: '/icons/icon-96x96.svg', sizes: '96x96' }],
          },
          {
            name: 'Point of Sale',
            short_name: 'POS',
            description: 'Open the POS terminal',
            url: '/?page=pos',
            icons: [{ src: '/icons/icon-96x96.svg', sizes: '96x96' }],
          },
          {
            name: 'Daily Report',
            short_name: 'Daily',
            description: 'End-of-day reconciliation',
            url: '/?page=daily',
            icons: [{ src: '/icons/icon-96x96.svg', sizes: '96x96' }],
          },
        ],
      },
    }),
  ],
})
