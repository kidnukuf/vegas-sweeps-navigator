// B.O.B. Roll-off Passport — Service Worker v7.0
// v7: Network-first for HTML navigation (fixes white screen after publish).
//     Cache version tied to build timestamp so stale caches are always evicted.
//     JS/CSS bundles: network-only (they are already hashed by Vite).
//     API calls: network-first with IDB offline fallback.

// ── IMPORTANT: bump this string on every deploy to evict old caches ──────────
// This is auto-replaced by the build process via the __manus__/version.json
// timestamp. If that fails, the date string below ensures forward progress.
const CACHE_VERSION = "bob-v7-" + (self.__BUILD_TS__ || "20260622");
const CACHE_NAME = CACHE_VERSION;

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

// Install: skip waiting immediately so new SW takes over without delay
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate: delete ALL old caches (any name != current) and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── Never intercept dev/preview server assets ─────────────────────────────
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
    return; // pass through
  }

  // ── SSE stream: never intercept ───────────────────────────────────────────
  if (url.pathname === "/api/events/stream") {
    return;
  }

  // ── HTML navigation: ALWAYS network-first, fall back to cache ─────────────
  // This is the key fix: the HTML shell MUST come from the network so it
  // always references the latest hashed JS/CSS bundle filenames.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            // Update the cache with the fresh HTML
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: serve cached HTML shell if available
          return caches.match(event.request)
            .then((cached) => cached || caches.match("/"))
            .then((cached) => cached || new Response(
              "<html><body style='background:#0d0d0d;color:#ffd700;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h2>You're offline</h2><p>Please reconnect to use B.O.B. Roll-off Passport.</p></div></body></html>",
              { status: 503, headers: { "Content-Type": "text/html" } }
            ));
        })
    );
    return;
  }

  // ── JS/CSS bundles: network-only (Vite hashes filenames, no need to cache) ─
  if (
    url.pathname.startsWith("/assets/") &&
    (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── tRPC API: network-first with IDB offline fallback for read queries ─────
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
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: "OFFLINE", message: "No network connection. Action unavailable offline." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // ── Other API calls: network-only ─────────────────────────────────────────
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: "OFFLINE", message: "No network connection." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // ── Static assets (icons, manifest, fonts): cache-first, network fallback ──
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
        .catch(() => new Response("Offline", { status: 503 }));
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
