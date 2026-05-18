// Bundle 30 1.A.6 fix-forward — Playwright config for smoke tests.
//
// Separate from playwright.config.js (visual regression) so:
//   - npm run smoke runs the smoke specs only (fast — <30s)
//   - npm run visual continues to run the regression baselines
//   - testDir is tests/smoke/ (greenfield Bundle 30 scaffold)
//
// Environment vars:
//   SMOKE_BASE_URL — override the baseURL (e.g.
//     https://xetonx.github.io/slyght/?cb=<SHA> to smoke the deployed
//     PWA). Defaults to localhost when unset. Set this when running
//     against deployed after a push, per CC manual §3 Deploy-check
//     amendment.
//
// Sample invocations (Windows PowerShell):
//   npm run smoke
//   $env:SMOKE_BASE_URL="https://xetonx.github.io/slyght/?cb=fe3caba"; npm run smoke
//
// Test file pattern: tests/smoke/*.smoke.js

const { defineConfig } = require('@playwright/test');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:4567';
const USE_LOCAL_SERVER = !process.env.SMOKE_BASE_URL;

module.exports = defineConfig({
  testDir: './tests/smoke',
  testMatch: '**/*.smoke.js',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 412, height: 915 },     // Samsung Galaxy S23 Ultra (John's device)
    deviceScaleFactor: 3,
    serviceWorkers: 'block',                    // app registers /slyght/sw.js — neutralize for tests
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
  },
  // Only spawn the local server when SMOKE_BASE_URL is not set
  webServer: USE_LOCAL_SERVER ? {
    command: 'node scripts/serve.js 4567',
    url: 'http://localhost:4567',
    reuseExistingServer: true,
    timeout: 10000,
    stdout: 'ignore',
    stderr: 'pipe',
  } : undefined,
});
