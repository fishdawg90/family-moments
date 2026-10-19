import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: '/family-moments/',
  plugins: [react()],
  build: { sourcemap: false },
});
