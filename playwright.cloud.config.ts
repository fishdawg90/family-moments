import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const browser =
  process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ].find(existsSync)
    : undefined;
export default defineConfig({
  testDir: 'tests/cloud-browser',
  workers: 1,
  timeout: 60000,
  use: {
    viewport: { width: 390, height: 844 },
    launchOptions: browser ? { executablePath: browser } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189 --strictPort',
    url: 'http://127.0.0.1:5189/family-moments/',
    env: { VITE_USE_EMULATORS: 'true', VITE_E2E_MODE: 'false' },
  },
});
