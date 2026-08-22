/**
 * Service worker di Pieno, generato a build time.
 *
 * Era un file statico in `public/sw.js` con `VERSION = 'pieno-v1'` fisso e
 * `BASE = '/pieno-dati'` hardcoded: la cache non veniva mai invalidata e al
 * cambio di dominio la PWA installata sarebbe rimasta bloccata. Ora base path
 * e versione vengono iniettati dalla configurazione centrale.
 */
import type { APIRoute } from 'astro';
import { BASE_PREFIX, BUILD_ID } from '../../site.config.mjs';

export const GET: APIRoute = () => {
  const body = serviceWorkerSource(BASE_PREFIX, BUILD_ID);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // Il service worker stesso non deve mai essere servito da cache lunga,
      // altrimenti il browser non si accorge che ne esiste una versione nuova.
      'Cache-Control': 'no-cache',
    },
  });
};

function serviceWorkerSource(base: string, buildId: string): string {
  return `/*
 * Service worker di Pieno — generato automaticamente, non modificare a mano.
 * Sorgente: src/pages/sw.js.ts
 *
 * Strategie:
 *  - asset con hash (/assets/): cache-first, sono immutabili;
 *  - HTML: network-first, così un deploy nuovo arriva al primo caricamento;
 *  - dataset prezzi: network-first con fallback alla cache, marcato come copia
 *    salvata perché la UI possa dirlo all'utente;
 *  - status.json: network-first, mai servito stantio in silenzio;
 *  - tile della mappa e domini esterni: non intercettati.
 */

const BUILD = '${buildId}';
const BASE = '${base}';
const PREFIX = 'pieno-';
const APP_CACHE = PREFIX + BUILD + '-app';
const DATA_CACHE = PREFIX + BUILD + '-data';
const CURRENT = [APP_CACHE, DATA_CACHE];

const HOME = BASE + '/' ;
const OFFLINE_URL = BASE + '/offline';

// App shell minima. Se una risorsa non è disponibile l'install non deve
// fallire in blocco, altrimenti il service worker non si attiva mai.
//
// Includiamo le pagine strumento (calcolatore e andamento) e l'indice delle
// località: sono il cuore della promessa offline della PWA. Senza precache,
// la primissima navigazione avviene prima che il service worker prenda il
// controllo, quindi quelle pagine non finirebbero mai in cache e l'utente
// che installa l'app e va offline si troverebbe il calcolatore inaccessibile.
const PRECACHE = [
  HOME,
  BASE + '/manifest.webmanifest',
  OFFLINE_URL,
  BASE + '/calcola-risparmio',
  BASE + '/andamento-prezzi',
  BASE + '/data/search-index.json',
  BASE + '/data/status.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(async (cache) => {
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(PREFIX) && !CURRENT.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Permette alla pagina di forzare l'attivazione della versione nuova.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();

  // La pagina ci comunica i propri asset (JS/CSS con hash) appena siamo attivi.
  // Serve perché la primissima navigazione avviene prima che il service worker
  // prenda il controllo: quelle richieste non passano da qui e gli asset non
  // finirebbero mai in cache. Senza, una pagina aperta offline si caricherebbe
  // senza JavaScript, cioè inerte.
  if (event.data && event.data.type === 'CACHE_ASSETS' && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(APP_CACHE).then(async (cache) => {
        await Promise.allSettled(
          event.data.urls.map(async (url) => {
            const already = await cache.match(url);
            if (!already) await cache.add(url);
          }),
        );
      }),
    );
  }
});

/** Segna una risposta come proveniente dalla cache, per la UI. */
function markCached(response) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Pieno-From-Cache', '1');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function networkFirst(request, cacheName) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const copy = fresh.clone();
      caches.open(cacheName).then((c) => c.put(request, copy));
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return markCached(cached);
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    const copy = fresh.clone();
    caches.open(cacheName).then((c) => c.put(request, copy));
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Domini esterni (tile OSM, font): li gestisce il browser.
  if (url.origin !== self.location.origin) return;

  // Asset con hash nel nome: immutabili, cache-first.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req, APP_CACHE));
    return;
  }

  // Icone e immagini statiche: cache-first, cambiano di rado.
  if (/\\.(png|svg|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, APP_CACHE));
    return;
  }

  // Dataset e stato: sempre la rete per prima.
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      networkFirst(req, DATA_CACHE).catch(
        () =>
          new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    return;
  }

  // Navigazioni e HTML: network-first, fallback alla copia salvata e infine
  // alla pagina offline dedicata.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      networkFirst(req, APP_CACHE).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);
        return (
          markCached(offline) ||
          new Response('Sei offline e questa pagina non è stata salvata.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      }),
    );
    return;
  }

  event.respondWith(networkFirst(req, APP_CACHE).catch(() => caches.match(req)));
});
`;
}
