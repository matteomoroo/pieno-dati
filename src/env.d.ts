/// <reference path="../.astro/types.d.ts" />

// Permette di importare fogli di stile (incluso il CSS di MapLibre) senza che
// TypeScript segnali "modulo non trovato".
declare module '*.css';
declare module 'maplibre-gl/dist/maplibre-gl.css';
