const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'academy-parity.spec.js',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'academy-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'academy-tablet', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } } },
    { name: 'academy-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } }
  ]
});
