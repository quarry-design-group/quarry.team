/**
 * Service-worker kill-switch — NOT an active service worker for this site.
 *
 * A legacy site generation registered a worker at this exact path that serves
 * the old site offline-first from CacheStorage, surviving the 2026-06 cutover
 * (registrations outlive the sites that create them, and 404-driven
 * unregistration proved unreliable in the field). Browsers carrying that
 * registration fetch THIS file on their next update check; being
 * byte-different, it installs immediately and then destroys the haunting:
 * every CacheStorage bucket deleted, the registration unregistered, and any
 * captive tabs reloaded from the network.
 *
 * Keep this file deployed indefinitely — it is inert for visitors without a
 * legacy registration (nothing on the current site registers a worker) and
 * each remaining haunted browser is cured on its next visit.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const tabs = await self.clients.matchAll({ type: 'window' });
      tabs.forEach((tab) => tab.navigate(tab.url));
    })(),
  );
});
