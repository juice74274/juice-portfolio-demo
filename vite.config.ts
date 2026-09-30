import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Juice Portfolio Demo: a static, frontend-only app on a fabricated portfolio.
//
// * base: './' makes the built dist/ work from any path, including a subfolder such as a
//   GitHub Pages project site.
// * envDir: false loads no .env file, and the unique envPrefix keeps any VITE_* variable in the
//   shell out of import.meta.env, so nothing from the build machine can reach the bundle.
// * There is no proxy: the app makes no request beyond its own static files.
export default defineConfig({
  plugins: [react()],
  base: './',
  envDir: false,
  envPrefix: 'JUICE_DEMO_PUBLIC_',
  build: { outDir: 'dist' },
  server: { host: 'localhost', port: 5174, strictPort: true },
  preview: { host: 'localhost', port: 4174, strictPort: true },
});
