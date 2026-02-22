const CACHE_NAME = "biryani-lagbe-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // ✅ GET request শুধুমাত্র
  if (event.request.method !== "GET") {
    return;
  }

  // ✅ chrome-extension URLs ignore করি
  if (event.request.url.startsWith("chrome-extension://")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          // ✅ শুধুমাত্র valid response cache করি
          if (response.status === 200 && response.type !== 'error') {
            const cloned = response.clone();
            // ✅ Try-catch দিয়ে error handle করি
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, cloned).catch(() => {
                  // Silent fail - কোনো error দেখাব না
                });
              })
              .catch(() => {
                // Cache open fail হলে ignore করি
              });
          }
          return response;
        })
        .catch(() => caches.match("/index.html"))
    })
  );
});