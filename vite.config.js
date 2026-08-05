import { defineConfig } from 'vite';

export default defineConfig({
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
