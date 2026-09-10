const { defineConfig } = require('@playwright/test');

const viewports = [
  ['desktop-1440', 1440, 900],
  ['desktop-1280', 1280, 800],
  ['tablet-landscape', 1024, 768],
  ['tablet-portrait', 768, 1024],
  ['mobile-430', 430, 932],
  ['mobile-390', 390, 844],
  ['mobile-360', 360, 800]
];

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173',
    port: 4173,
    reuseExistingServer: true
  },
  projects: viewports.map(([name, width, height]) => ({
    name,
    use: { browserName: 'chromium', viewport: { width, height } }
  }))
});
