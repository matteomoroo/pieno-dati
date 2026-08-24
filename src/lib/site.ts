/**
 * Helper di URL condivisi lato sorgente Astro.
 *
 * Perché esiste: `import.meta.env.BASE_URL` vale `/pieno-dati` su GitHub Pages
 * ma `/` alla radice. Concatenare direttamente (`BASE_URL + '/data/x.json'`)
 * produce `//data/x.json` in produzione root, che rompe fetch e link.
 * `BASE` è normalizzato a stringa vuota alla radice, così la concatenazione
 * resta corretta ovunque.
 */

/** Prefisso sicuro per la concatenazione: `''` oppure `/pieno-dati`. */
export const BASE: string = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** Path interno completo. `withBase('/mappa')` -> `/pieno-dati/mappa` o `/mappa`. */
export function withBase(path = ''): string {
  const suffix = path.startsWith('/') ? path : path ? `/${path}` : '';
  return `${BASE}${suffix}` || '/';
}

/** Href della homepage, mai stringa vuota. */
export const HOME: string = BASE || '/';

/** URL assoluto, per canonical e Open Graph. */
export function absoluteUrl(site: URL | undefined, path = ''): string {
  const origin = (site?.origin ?? '').replace(/\/+$/, '');
  return `${origin}${withBase(path)}`;
}
