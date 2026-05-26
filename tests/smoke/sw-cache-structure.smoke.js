// Bundle 33-cache (OPEN-BUGS #51) — structural smoke for the SW cache fix.
//
// Service-worker runtime is environment-dependent and the smoke harness blocks
// SWs, so this asserts the fix PIECES are present in sw.js + the registration.
// The real update-path proof is John's on-device done-test (deploy a marker →
// open the installed PWA without reinstall → marker updates; + airplane-mode
// offline load). Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SW = fs.readFileSync(path.resolve(__dirname, '../../sw.js'), 'utf8');
const HTML = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

test.describe('Bundle 33-cache — SW fix structure', () => {
  test('sw.js precaches the app shell keyed to CACHE_VERSION', () => {
    expect(SW).toMatch(/const CACHE_VERSION\s*=/);
    expect(SW).toMatch(/caches\.open\(CACHE_VERSION\)/);
    expect(SW).toMatch(/\.addAll\(SHELL\)/);
    for (const asset of ['/slyght/index.html', '/slyght/manifest.json', '/slyght/icon-192.png', '/slyght/icon-512.png']) {
      expect(SW).toContain(asset);
    }
  });

  test('sw.js does NOT precache sw.js itself (must stay self-updatable)', () => {
    const start = SW.indexOf('const SHELL');
    const shellBlock = SW.slice(start, SW.indexOf('];', start));
    expect(shellBlock).not.toMatch(/sw\.js/);
  });

  test('navigation fetch is network-first with cache:reload (defeats HTTP/bfcache staleness)', () => {
    expect(SW).toMatch(/req\.mode === 'navigate'/);
    expect(SW).toMatch(/cache:\s*'reload'/);
  });

  test('sw.js has skipWaiting + clients.claim + version-prune on activate', () => {
    expect(SW).toMatch(/self\.skipWaiting\(\)/);
    expect(SW).toMatch(/self\.clients\.claim\(\)/);
    expect(SW).toMatch(/k !== CACHE_VERSION/);
  });

  test('sw.js lets non-GET (push POST) + cross-origin pass through untouched', () => {
    expect(SW).toMatch(/req\.method !== 'GET'/);
    expect(SW).toMatch(/url\.origin !== self\.location\.origin/);
  });

  test('registration: updateViaCache:none + reg.update + controllerchange; unregister-on-load removed', () => {
    expect(HTML).toMatch(/register\('\/slyght\/sw\.js',\s*\{\s*updateViaCache:\s*'none'\s*\}\)/);
    expect(HTML).toMatch(/reg\.update\(\)/);
    expect(HTML).toMatch(/addEventListener\('controllerchange'/);
    expect(HTML).not.toContain('registrations.forEach(r => r.unregister())');
  });

  test('permanent build-stamp marker + update banner present', () => {
    expect(HTML).toMatch(/id="build-stamp"/);
    expect(HTML).toMatch(/id="sw-update-banner"/);
  });
});
