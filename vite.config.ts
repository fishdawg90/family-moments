import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'build' && !env.VITE_FIREBASE_API_KEY?.trim()) {
    throw new Error(
      'Set VITE_FIREBASE_API_KEY in .env.local or the GitHub Actions build environment.',
    );
  }
  return {
    base: '/family-moments/',
    plugins: [react()],
    build: { sourcemap: false },
  };
});
