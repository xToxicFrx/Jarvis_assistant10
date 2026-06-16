// ============================================================
// sw.js — minimaler Service-Worker (PWA-Huelle).
//
// Cached die statischen Dateien fuer schnelles/offline Laden.
// /api/* wird NIE gecacht (Auth + persoenliche Daten).
// Kein Push bei geschlossener App (das braeuchte Web-Push).
// ============================================================
const CACHE = "jarvis-v1";
const ASSETS = [
  "/", "/index.html", "/style.css",
  "/js/store.js", "/js/reminders.js", "/js/tools.js", "/js/ui.js", "/js/app.js",
  "/manifest.webmanifest", "/icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API immer direkt ans Netz
  // Network-first: frischer Code online, Cache als Offline-Fallback
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("/index.html")))
  );
});
