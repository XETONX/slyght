// SLYGHT v6 - clears old caches on activate
const CACHE_NAME = 'slyght-v6';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network first always - never serve stale
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
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
      icon:               '/icon-192.png',
      badge:              '/icon-192.png',
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
