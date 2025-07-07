import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Incluimos el manifest directamente aquí
      manifest: {
        name: 'StaffSync - Cocina Amore',
        short_name: 'StaffSync',
        description: 'Portal de gestión de personal para Cocina Amore.',
        theme_color: '#B91C1C', // El color principal de tu marca (rojo Amore)
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png', // El navegador buscará este archivo en tu carpeta 'public'
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png', // Y también este
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Importante para que el ícono se vea bien en Android
          }
        ]
      }
    })
  ],
})