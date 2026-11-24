import { defineConfig } from 'vite';

// Đường dẫn tương đối: bản build chạy được ở bất kỳ thư mục con nào (artifact, GitHub Pages...)
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});
