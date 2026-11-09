import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3333',
    trace: 'on-first-retry',
    permissions: ['notifications'],
    // Allow CI/containers without Playwright's bundled browser to use a system Chromium.
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      ...(process.env.FONTCONFIG_PATH
        ? {
            env: {
              ...process.env,
              FONTCONFIG_PATH: process.env.FONTCONFIG_PATH,
              ...(process.env.FONTCONFIG_FILE ? { FONTCONFIG_FILE: process.env.FONTCONFIG_FILE } : {}),
              ...(process.env.XDG_DATA_DIRS ? { XDG_DATA_DIRS: process.env.XDG_DATA_DIRS } : {}),
            },
          }
        : {}),
    },
  },

  // Démarre un serveur HTTP statique sur le dossier www/ avant les tests
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'android-mobile',
      use: { ...devices['Pixel 7'], permissions: ['notifications'] },
    },
  ],
});
