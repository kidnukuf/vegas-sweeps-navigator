// Vegas Sweeps Funtime — Service Worker v3.0
// Offline-first PWA: caches all routes and static assets
// IndexedDB caching for bowler data, graceful offline fallback

const CACHE_NAME = "vegas-sweeps-v3";
const STATIC_ASSETS = [
  "/",
  "/admin",
  "/register",
  "/captain",
  "/doorman",
  "/program-director",
  "/import",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// IndexedDB helpers for offline bowler data cache
const IDB_NAME = "vegas-sweeps-offline";
const IDB_VERSION = 1;
const IDB_STORE = "bowler-cache";

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, data) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ key, data, timestamp: Date.now() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* non-fatal */ }
}

async function idbGet(key) {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result?.data ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// Install: pre-cache all static routes
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-fatal: some routes may not be available at install time
        return Promise.all(
          STATIC_ASSETS.map((url) =>
            cache.add(url).catch(() => { /* skip unavailable */ })
          )
        );
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // SSE stream: never cache, never intercept
  if (url.pathname === "/api/events/stream") {
    return;
  }

  // tRPC API calls: network-first with IndexedDB fallback for read queries
  if (url.pathname.startsWith("/api/trpc/")) {
    const isCacheable = event.request.method === "GET" &&
      (url.pathname.includes("bowlers.adminList") ||
       url.pathname.includes("bowlers.search") ||
       url.pathname.includes("centers.list") ||
       url.pathname.includes("bowlers.stats"));

    if (isCacheable) {
      event.respondWith(
        fetch(event.request.clone())
          .then(async (response) => {
            if (response.ok) {
              const clone = response.clone();
              const body = await clone.text();
              await idbPut(url.pathname + url.search, body);
            }
            return response;
          })
          .catch(async () => {
            // Offline: serve from IndexedDB
            const cached = await idbGet(url.pathname + url.search);
            if (cached) {
              return new Response(cached, {
                status: 200,
                headers: { "Content-Type": "application/json", "X-Served-From": "idb-cache" }
              });
            }
            return new Response(
              JSON.stringify({ error: "OFFLINE", message: "No network. Showing cached data." }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          })
      );
      return;
    }

    // Non-cacheable API calls (mutations): network only
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: "OFFLINE", message: "No network connection. Action unavailable offline." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // Other API calls
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: "OFFLINE", message: "No network connection." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // Static assets: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === "GET") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // For navigation requests, return the cached root
          if (event.request.mode === "navigate") {
            return caches.match("/").then((r) => r || new Response("Offline — Vegas Sweeps Funtime", { status: 503 }));
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});

// Message handler: force update or cache bowler data
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  // Cache bowler data for offline use
  if (event.data?.type === "CACHE_BOWLERS" && event.data.data) {
    idbPut("bowlers-manual", JSON.stringify(event.data.data));
  }
});
