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
  testDir: 'tests/browser',
  workers: 1,
  use: {
    viewport: { width: 390, height: 844 },
    launchOptions: {
      ...(browser ? { executablePath: browser } : {}),
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort',
      url: 'http://127.0.0.1:5187/family-moments/',
      env: { VITE_E2E_MODE: 'true' },
      reuseExistingServer: true,
    },
    {
      command:
        'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4187 --strictPort',
      url: 'http://127.0.0.1:4187/family-moments/',
      reuseExistingServer: true,
    },
  ],
});
