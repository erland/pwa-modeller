import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A separate file://-oriented build. Public PWA assets are intentionally excluded;
// the release packager embeds the generated JS/CSS directly into one HTML document.
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
