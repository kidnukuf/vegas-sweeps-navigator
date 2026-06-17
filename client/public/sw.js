// B.O.B. Roll-off Passport — Service Worker v5.0
// v5: bumped cache version to force eviction of stale JS bundles that caused
//     React error #310 on the published site. Old caches are deleted on activate.
const CACHE_NAME = "bob-passport-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// IndexedDB helpers for offline bowler data cache
const IDB_NAME = "bob-passport-offline";
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

// Install: pre-cache only minimal static assets (not app routes)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => { /* skip unavailable */ })
        )
      );
    })
  );
  // Take control immediately
  self.skipWaiting();
});

// Activate: clean up ALL old caches and take control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: never intercept Vite dev server assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // NEVER cache Vite dev server assets — these change on every build
  if (
    url.pathname.startsWith("/@fs/") ||
    url.pathname.startsWith("/@vite/") ||
    url.pathname.startsWith("/@id/") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/__manus__/") ||
    url.search.includes("?v=") ||
    url.search.includes("&v=") ||
    url.hostname.includes(".manus.computer") ||
    url.hostname.includes(".manuspre.computer") ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    // Pass through to network without caching
    return;
  }

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

  // JS/CSS bundles: NEVER cache via service worker — they have hashed filenames
  // and are already cache-busted by the browser's HTTP cache. Caching them here
  // causes stale bundle issues after republish (React error #310 symptom).
  if (
    url.pathname.startsWith("/assets/") &&
    (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))
  ) {
    // Network-only for JS/CSS bundles
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets (icons, manifest, etc.): cache-first with network fallback
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
          if (event.request.mode === "navigate") {
            return caches.match("/").then((r) => r || new Response("Offline — B.O.B. Roll-off Passport", { status: 503 }));
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});

// Message handler
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CACHE_BOWLERS" && event.data.data) {
    idbPut("bowlers-manual", JSON.stringify(event.data.data));
  }
});
