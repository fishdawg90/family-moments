const PREFIX = 'family-moments-';
const CACHE = PREFIX + '__BUILD_ID__';
const ROOT = self.registration.scope;
const SHELL = __PRECACHE__;
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Install only succeeds once all profile entrypoints and build assets are cached.
      await cache.addAll(SHELL.map((path) => new URL(path, ROOT).href));
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url),
    root = new URL(ROOT);
  if (
    event.request.method !== 'GET' ||
    url.origin !== root.origin ||
    !url.pathname.startsWith(root.pathname)
  )
    return;
  // Never cache Firebase requests or attachment Blobs. All app assets are build-versioned.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE),
        hit = await cache.match(event.request, { ignoreVary: true });
      if (hit) return hit;
      try {
        return await fetch(event.request);
      } catch {
        if (event.request.mode === 'navigate') {
          const profile = url.pathname.slice(root.pathname.length).split('/')[0];
          return (
            (await cache.match(
              new URL(['giulia', 'nina', 'me'].includes(profile) ? `${profile}/` : '', ROOT).href,
            )) || Response.error()
          );
        }
        return Response.error();
      }
    })(),
  );
});
