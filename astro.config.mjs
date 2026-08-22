import { defineConfig } from 'astro/config';
import { SITE_URL, BASE_PATH } from './site.config.mjs';

// Configurazione Astro per Pieno.
//
// `site` e `base` NON sono più hardcoded: arrivano da site.config.mjs, che li
// legge dalle environment variable SITE_URL / BASE_PATH. Questo permette di
// compilare la stessa codebase per GitHub Pages (/pieno-dati/) o per il
// dominio definitivo (/) senza modificare i sorgenti.
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'ignore',
  build: {
    // Gli asset con hash nel nome, per caching aggressivo.
    assets: 'assets',
  },
  // I dati generati dalla pipeline vivono in public/data/ e vengono copiati
  // as-is nell'output. Astro serve public/ alla radice del sito.
  publicDir: 'public',
});
