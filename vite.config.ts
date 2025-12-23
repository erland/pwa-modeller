import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: `base: './'` makes the built assets work from GitHub Pages sub-paths
// (e.g. https://<user>.github.io/<repo>/) and also from arbitrary static hosts.
export default defineConfig({
  base: './',
  plugins: [react()],
});
