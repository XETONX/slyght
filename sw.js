// SLYGHT service worker — Bundle 33-cache (OPEN-BUGS #51).
// Sibling to the push-reliability fix: push made data PERSIST; this makes code
// DELIVER. A service worker is a script the browser runs between the app and the
// network — it intercepts requests and decides: fetch fresh, or serve from a
// local cache it controls.
//
// The bug it fixes: deployed index.html wasn't reaching John's installed PWA
// without a manual reinstall. Root cause (Gather 2026-05-26): the OLD SW cached
// NOTHING and was a transparent network passthrough, so staleness lived in the
// layers UNDER it — Chrome's HTTP cache + GitHub Pages headers + Android resuming
// the backgrounded PWA's in-memory page instead of re-fetching.
//
// Strategy: NETWORK-FIRST with cache:'reload' for the navigation + shell, so an
// online open ALWAYS gets the freshest index.html (defeats the HTTP/bfcache
// staleness). Precache the shell as the OFFLINE fallback (the old SW had none —
// offline was silently broken). Because online always hits the network, a
// forgotten CACHE_VERSION bump can never pin stale code (the worst sticky risk).
//
// DEPLOY RITUAL: bump CACHE_VERSION below AND the #build-stamp in index.html
// together on every deploy. The build-stamp is the visible "am I on fresh code"
// signal; CACHE_VERSION drives the offline-cache prune. See ADR-bundle-33-cache.
const CACHE_VERSION = 'slyght-2026-05-26-1';
const SHELL = [
  '/slyght/index.html',
  '/slyght/manifest.json',
  '/slyght/icon-192.png',
  '/slyght/icon-512.png',
];

self.addEventListener('install', event => {
  // Precache the app shell for offline. sw.js itself is deliberately NOT in SHELL
  // — caching it would prevent the SW from ever self-updating.
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(SHELL))
      .catch(() => {})            // precache failure must not block activation
      .then(() => self.skipWaiting())  // take over now, don't wait for old tabs to close
  );
});

self.addEventListener('activate', event => {
  // Drop every cache that isn't the current version — clean slate on update.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                  // POSTs (push to worker) pass through untouched
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // cross-origin (fonts, worker, Anthropic API) pass through

  const isNavigation = req.mode === 'navigate';
  if (isNavigation || SHELL.includes(url.pathname)) {
    // NETWORK-FIRST, cache:'reload' bypasses the HTTP cache so we always get the
    // freshest index.html online; refresh the offline copy; fall back to cache offline.
    event.respondWith(
      fetch(req, { cache: 'reload' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('/slyght/index.html')))
    );
    return;
  }
  // Other same-origin GETs (icons, etc.): network-first, best-effort cache fallback.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// Allow the page to trigger an immediate takeover (belt for the update banner).
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ─── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────

self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'SLYGHT', body: event.data.text(), tag: 'slyght' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'SLYGHT', {
      body:               data.body || '',
      icon:               '/slyght/icon-192.png',
      badge:              '/slyght/icon-192.png',
      tag:                data.tag || 'slyght',
      requireInteraction: false,
      actions:            data.actions || [],
      data:               data.data || { url: 'https://xetonx.github.io/slyght/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  const tag    = event.notification.tag;
  const data   = event.notification.data || {};
  const appUrl = data.url || 'https://xetonx.github.io/slyght/';

  if (action === 'no-spend') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wcs => {
        if (wcs.length > 0) {
          wcs[0].postMessage({ type: 'NO_SPEND', tag, ts: Date.now() });
          return wcs[0].focus();
        }
        return clients.openWindow(appUrl + '?action=no-spend&tag=' + encodeURIComponent(tag));
      })
    );
  } else if (action === 'log') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wcs => {
        if (wcs.length > 0) {
          wcs[0].postMessage({ type: 'OPEN_LOG', tag });
          return wcs[0].focus();
        }
        return clients.openWindow(appUrl + '?action=log');
      })
    );
  } else if (action === 'groceries-done' || action === 'groceries') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wcs => {
        if (wcs.length > 0) {
          wcs[0].postMessage({ type: action === 'groceries-done' ? 'GROCERY_DONE' : 'OPEN_LOG', tag });
          return wcs[0].focus();
        }
        return clients.openWindow(appUrl + '?action=' + action);
      })
    );
  } else {
    // Default — open or focus the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wcs => {
        if (wcs.length > 0) return wcs[0].focus();
        return clients.openWindow(appUrl);
      })
    );
  }
});
