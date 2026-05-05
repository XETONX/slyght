// Playwright config for Mission V (visual regression).
// Single worker + sequential = pixel-stable runs. webServer auto-spawns
// scripts/serve.js for the duration of the test run.

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './visual',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // Place baseline images at visual/baselines/<name>.png instead of
  // Playwright's default visual/regression.spec.js-snapshots/.
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:4567',
    viewport: { width: 390, height: 844 },     // iPhone 13 logical size
    deviceScaleFactor: 2,
    serviceWorkers: 'block',                    // app registers /slyght/sw.js — neutralize for tests
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,                 // 0.1% pixel tolerance — survives subpixel jitter
      threshold: 0.2,                           // per-pixel YIQ tolerance
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  webServer: {
    command: 'node scripts/serve.js 4567',
    url: 'http://localhost:4567',
    reuseExistingServer: true,
    timeout: 10000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
