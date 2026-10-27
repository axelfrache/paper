/* Generated at build time. Only the public, versioned application shell is cached. */
const CACHE = "paper-shell-" + __VERSION__;
const ASSETS = __ASSETS__;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(
          ASSETS.map(
            (url) => new Request(url, { cache: "reload", credentials: "omit" }),
          ),
        );
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("paper-shell-") && name !== CACHE)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  )
    return;
  const navigation =
    event.request.mode === "navigate" &&
    !url.pathname.split("/").pop().includes(".");
  const key = navigation ? "/index.html" : url.pathname;
  if (!ASSETS.includes(key)) return;
  event.respondWith(
    (async () => {
      const cached = await (await caches.open(CACHE)).match(key);
      return cached || fetch(event.request);
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "APPLY_UPDATE") return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (windows.length > 1) {
        event.ports[0]?.postMessage({
          error: "Close other Paper windows before updating.",
        });
        return;
      }
      event.ports[0]?.postMessage({ ok: true });
      await self.skipWaiting();
    })(),
  );
});
