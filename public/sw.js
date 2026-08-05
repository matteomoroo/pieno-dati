/*
 * Service worker di Pieno.
 * Strategia:
 *  - dati (stations.json, meta.json, ...): network-first, con fallback alla
 *    cache se offline — così i prezzi sono freschi quando c'è rete, ma il sito
 *    resta consultabile offline con l'ultimo dato scaricato;
 *  - pagine e asset (HTML, CSS, JS, icone): stale-while-revalidate — carica
 *    subito dalla cache e aggiorna in background;
 *  - le tile della mappa NON vengono cachate qui (troppe, le gestisce il
 *    browser).
 */

const VERSION = 'pieno-v1';
const APP_CACHE = `${VERSION}-app`;
const DATA_CACHE = `${VERSION}-data`;
const BASE = '/pieno-dati';

// Risorse minime dell'app shell da precaricare.
const PRECACHE = [`${BASE}/`, `${BASE}/manifest.webmanifest`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Non intercettare le tile OSM né domini esterni.
  if (url.origin !== self.location.origin) return;

  // Dati: network-first.
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Pagine e asset: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
