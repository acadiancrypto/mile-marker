// Offline service worker: app files cache-first; Google sign-in and Drive always go to the network.
// Bump APP_VERSION in js/config.js whenever you change any app file, so phones and PCs pick up the update.
import { APP_VERSION } from "./js/config.js";

const CACHE = "mile-marker-v" + APP_VERSION;
const FONT_CACHE = "mile-marker-fonts";
const FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/auth.js", "js/categories.js", "js/config.js", "js/csv.js", "js/drive.js", "js/expenses.js",
  "js/image.js", "js/merge.js", "js/money.js", "js/names.js", "js/state.js", "js/store.js", "js/sync.js", "js/totals.js",
  "js/ui/badge.js", "js/ui/categories.js", "js/ui/detail.js", "js/ui/form.js", "js/ui/home.js", "js/ui/settings.js",
  "icons/icon.svg", "icons/icon-maskable.svg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-192.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("googleapis.com") && url.hostname !== "fonts.googleapis.com") return;
  if (url.hostname === "accounts.google.com") return;

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }
      catch { return new Response("", { status: 504 }); }
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch {
      if (req.mode === "navigate") return (await caches.match("index.html")) || Response.error();
      return Response.error();
    }
  })());
});
