const path = require('path');
const { defineConfig, devices } = require('playwright/test');

const repoRoot = path.resolve(__dirname, '..', '..');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90 * 1000,
  expect: {
    timeout: 10 * 1000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['junit', { outputFile: path.join(repoRoot, 'test-results', 'playwright', 'junit.xml') }],
    ['html', { outputFolder: path.join(repoRoot, 'test-results', 'playwright', 'html-report'), open: 'never' }]
  ],
  outputDir: path.join(repoRoot, 'test-results', 'playwright', 'artifacts'),
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'node scripts/static-server.js',
    cwd: repoRoot,
    url: `${baseURL}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] }
    }
  ]
});
