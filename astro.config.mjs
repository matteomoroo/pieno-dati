import { defineConfig } from 'astro/config';

// Configurazione Astro per Pieno.
//
// Strategia di migrazione graduale: durante la Fase B il nuovo sito Astro
// viene costruito in `dist/` e, in fase di deploy, i suoi file vengono messi
// accanto ai dati generati in `public/data/`. Il vecchio `index.html` resta
// funzionante finché non lo sostituiamo pagina per pagina.
//
// `site` va impostato all'URL pubblico di GitHub Pages: serve a generare
// canonical, sitemap e Open Graph corretti (Milestone 8 — SEO).
export default defineConfig({
  site: 'https://matteomoroo.github.io',
  base: '/pieno-dati',
  trailingSlash: 'ignore',
  build: {
    // Gli asset con hash nel nome, per caching aggressivo.
    assets: 'assets',
  },
  // I dati generati dalla pipeline vivono in public/data/ e vengono copiati
  // as-is nell'output. Astro serve public/ alla radice del sito.
  publicDir: 'public',
});
