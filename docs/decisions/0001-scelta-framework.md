# ADR 0001 — Scelta del framework frontend

Data: 2026-08 · Stato: accettato (per la Fase B, non ancora implementato)

## Contesto

Il frontend attuale è un unico `public/index.html` da ~536 KB con CSS, JS e
un array di comuni (~515 KB) tutto inline. Il prodotto target ha bisogno di:
molte pagine statiche territoriali indicizzabili (regioni, province, comuni,
carburanti, stazioni), prestazioni elevate su mobile, e una mappa fortemente
interattiva.

## Decisione

Adottare **Astro + TypeScript** per il frontend, con MapLibre caricato come
isola solo dove serve.

Motivi:

- le pagine informative e territoriali sono statiche e vanno indicizzate →
  Astro le renderizza in HTML statico a build-time, ottimo per SEO e LCP;
- la mappa è l'unico pezzo pesantemente interattivo → il modello a "islands"
  di Astro permette di caricare MapLibre solo su `/mappa` e sulle schede
  stazione, tenendo il resto a JS quasi zero;
- generazione di migliaia di pagine da dati (`getStaticPaths`) è un caso d'uso
  nativo;
- costi infrastrutturali nulli: output statico servibile da GitHub Pages.

Alternative scartate: un SPA (React/Vue puri) penalizzerebbe SEO e caricamento
iniziale; Next.js introdurrebbe un runtime server non necessario e costi.

## Stato

La pipeline dati (Fase A) è **indipendente dal framework** ed è già stata
implementata e testata. La migrazione del frontend ad Astro è la Fase B e non è
ancora iniziata: il vecchio `index.html` resta funzionante nel frattempo,
leggendo i nuovi file sotto `public/data/`.
