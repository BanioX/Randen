import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { staticHeaders } from './scripts/static-headers.ts';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        // Libraries change rarely, the app often: separate chunks stay cached across releases.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler|cookie-es|@remix-run)[\\/]/,
            },
            { name: 'data', test: /node_modules[\\/](dexie|dexie-react-hooks|zod)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    staticHeaders(new URL('public/_headers', import.meta.url)),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Everything the app needs is precached, so it works in a cellar without reception.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,webmanifest}'],
      },
      manifest: {
        name: 'Randen',
        short_name: 'Randen',
        description: 'Lager, Rezepte, Speisekarte und Zahlen der Küche an einem Ort.',
        lang: 'de-CH',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#f6f4f1',
        background_color: '#f6f4f1',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
