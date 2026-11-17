import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// CALORÍA — PWA local-first. Rutas relativas (base './') + HashRouter para servirse en
// cualquier subruta de un hosting estático.
export default defineConfig({
  base: './',
  // exceljs (solo en Respaldo) es grande por naturaleza; se carga bajo demanda.
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'CALORÍA',
        short_name: 'CALORÍA',
        description: 'Registra tus comidas en segundos y lleva el control de calorías, macros y peso. Tus datos se quedan en tu dispositivo.',
        lang: 'es-MX',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        theme_color: '#2340B8',
        background_color: '#F5F7FA',
        categories: ['health', 'food', 'lifestyle'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Registrar comida', short_name: 'Registrar', url: './#/?registrar=1', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Registrar peso', short_name: 'Peso', url: './#/peso?nuevo=1', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Solo el "shell" de la app se precachea; el catálogo (cientos de MB) va por caché en tiempo de ejecución.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['catalogo/**', '**/catalogo/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/catalogo\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/catalogo/base/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'caloria-catalogo-base',
              expiration: { maxEntries: 400, purgeOnQuotaError: false },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/catalogo/marcas/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'caloria-catalogo-marcas',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 90, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/catalogo/manifiesto.json'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'caloria-catalogo-manifiesto',
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
