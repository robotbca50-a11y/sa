/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    warmup: { clientFiles: ['./index.html', './src/lib/supabase.ts', './src/lib/api.ts'] },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'zustand',
      'framer-motion',
      '@supabase/supabase-js',
      'lucide-react',
      'leaflet',
    ],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client'],
          supabase: ['@supabase/supabase-js'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
          maps: ['leaflet'],
        },
      },
    },
  },
});
