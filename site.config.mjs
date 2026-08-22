/**
 * Configurazione centrale di Pieno.
 *
 * Unica fonte di verità per dominio e base path. Letta da `astro.config.mjs`,
 * dagli endpoint generati (manifest, robots, service worker, sitemap) e dagli
 * script di build.
 *
 * La stessa codebase deve poter essere compilata per GitHub Pages
 * (`/pieno-dati/`) o per un dominio alla radice (`/`) senza toccare i sorgenti:
 * si cambiano solo le environment variable.
 *
 *   SITE_URL=https://matteomoroo.github.io BASE_PATH=/pieno-dati/ npm run astro:build
 *   SITE_URL=https://esempio.it            BASE_PATH=/            npm run astro:build
 */

/** Rimuove le barre finali. `/pieno-dati/` -> `/pieno-dati`, `/` -> `''`. */
function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

/**
 * Base path normalizzato per Astro: sempre con barra iniziale, mai con barra
 * finale, tranne la radice che resta `/`.
 */
function normalizeBase(raw) {
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  const stripped = stripTrailingSlash(withLeading);
  return stripped === '' ? '/' : stripped;
}

/** Origin pubblico, senza barra finale. Es. `https://esempio.it`. */
export const SITE_URL = stripTrailingSlash(
  process.env.SITE_URL ?? 'https://matteomoroo.github.io',
);

/** Base path per Astro. `/` in produzione root, `/pieno-dati` su GitHub Pages. */
export const BASE_PATH = normalizeBase(process.env.BASE_PATH ?? '/pieno-dati/');

/**
 * Prefisso da concatenare ai path assoluti: `''` alla radice, `/pieno-dati`
 * altrimenti. Rende sicura la concatenazione `PREFIX + '/data/stations.json'`
 * in entrambe le configurazioni, senza generare doppie barre.
 */
export const BASE_PREFIX = BASE_PATH === '/' ? '' : BASE_PATH;

/**
 * Identificativo della build, usato per versionare la cache del service
 * worker. In CI arriva dal commit SHA; in locale è un timestamp, così ogni
 * `npm run astro:build` produce una cache nuova e non si resta mai incastrati
 * su una versione vecchia durante lo sviluppo.
 */
export const BUILD_ID =
  process.env.BUILD_ID ??
  process.env.GITHUB_SHA?.slice(0, 7) ??
  new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

/** URL assoluto per un path interno. `absoluteUrl('/mappa')`. */
export function absoluteUrl(path = '') {
  const suffix = path.startsWith('/') ? path : path ? `/${path}` : '';
  return `${SITE_URL}${BASE_PREFIX}${suffix}` || `${SITE_URL}/`;
}
