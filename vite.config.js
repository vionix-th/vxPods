import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project sites are served from /<repository>/, while local and
  // custom-domain builds remain rooted at /. The deployment workflow supplies
  // VITE_BASE_PATH from the repository name.
  base: process.env.VITE_BASE_PATH ?? '/',
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
});
