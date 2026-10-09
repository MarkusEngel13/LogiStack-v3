/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { serviceWorker } from './src/pwa/vitePlugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
