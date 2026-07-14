import { defineConfig, devices } from '@playwright/test';

declare const process: {
  readonly env: Readonly<{ PLAYWRIGHT_EXECUTABLE_PATH?: string }>;
};

const localBrowser = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox'] }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Die 6×-Masterfläche belegt pro Browserseite deutlich mehr Grafikspeicher.
  // Zwei Worker prüfen weiterhin parallel, ohne den CI-GPU-Prozess zu überfahren.
  workers: 2,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4186',
    trace: 'retain-on-failure',
    launchOptions: localBrowser,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4186',
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: true,
  },
});
