import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // Divide o bundle em chunks separados para carregamento paralelo
      rollupOptions: {
        output: {
          manualChunks: {
            // Chunk do React (raramente muda, fica em cache no browser)
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // Chunk do Supabase (biblioteca grande, separada do resto)
            'vendor-supabase': ['@supabase/supabase-js'],
            // Chunk de UI/ícones
            'vendor-ui': ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          },
        },
      },
      // Aumenta o aviso de chunk grande para 800KB
      chunkSizeWarningLimit: 800,
    },
  };
});
