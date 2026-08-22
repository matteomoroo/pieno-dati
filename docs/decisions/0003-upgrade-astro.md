# 0003 — Rimandare l'upgrade Astro 4 → 7

Data: 2026-08-21
Stato: accettata, attività rimandata

## Contesto

`npm audit` segnala vulnerabilità che si risolverebbero solo con
`npm audit fix --force`, che porta Astro dalla 4.16 alla 7.x — due major di
salto. Lo sprint pre-lancio ha come obiettivo una release stabile.

## Decisione

L'upgrade **non** viene eseguito in questo sprint. Sono stati applicati i soli
fix non-breaking (`npm audit fix`) ed è stata rimossa `@astrojs/sitemap`, non
più usata da quando la sitemap è generata a mano.

## Vulnerabilità residue e perché sono accettabili qui

| Pacchetto | Severità | Perché non sfruttabile in Pieno |
|---|---|---|
| `vitest` (UI server) | critica | La UI di Vitest non viene mai avviata: i test girano con `vitest run`. Dipendenza di sviluppo, assente in produzione. |
| `astro` (`X-Forwarded-Host` riflesso) | alta | Riguarda l'SSR. Pieno è compilato staticamente e servito da Cloudflare: nessun server Astro in esecuzione. |
| `vite` (path traversal in `.map`) | alta | Riguarda il dev server. Non esposto: in produzione ci sono solo file statici. |
| `sharp` / libvips | alta | Usato solo a build time, su un'unica immagine SVG che scriviamo noi. Nessun input utente lo raggiunge. |
| `esbuild` (dev server) | moderata | Come sopra: solo sviluppo. |

Il denominatore comune: sono tutte vulnerabilità di superfici che un sito
statico non espone. Il rischio reale è vicino a zero, ma va rivisto se un
domani si introducesse SSR.

## Attività futura: `Upgrade Astro 4 → 7`

Da fare **dopo** il lancio, con il sito già stabile e la CI verde:

1. leggere le guide di migrazione 4→5, 5→6, 6→7;
2. aggiornare in un branch dedicato, un major alla volta;
3. verificare in particolare: `getStaticPaths` negli endpoint sitemap,
   `import.meta.env.BASE_URL`, il trattamento del CSS negli import dinamici
   (la soluzione con `?url` in `src/lib/map/client.ts` potrebbe non servire
   più), le API dei content collections se nel frattempo verranno usate;
4. rieseguire `npm run verify` e i test E2E su tutti e tre i progetti Playwright;
5. confrontare la dimensione di `dist/` prima e dopo.

Criterio di uscita: `npm audit` senza vulnerabilità alte o critiche, e smoke
test verde su entrambe le configurazioni di base path.
