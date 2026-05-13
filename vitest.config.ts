import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx}',
      'eslint-rules/__tests__/**/*.test.{js,ts}',
    ],
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
