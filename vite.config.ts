import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pocket Pin',
        short_name: 'Pocket Pin',
        description: 'A shopping list that knows where the shops are.',
        theme_color: '#c9e0d6',
        background_color: '#a9bdcb',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Google Maps tiles/scripts are not cached: the list itself works offline, the map needs signal.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ]
})
