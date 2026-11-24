import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Đường dẫn tương đối: bản build chạy được ở bất kỳ thư mục con nào (artifact, GitHub Pages...)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  test: { environment: 'node', include: process.env.BALANCE ? ['tests/balance.heavy.ts'] : ['tests/**/*.test.ts'], testTimeout: 120000 },
});
