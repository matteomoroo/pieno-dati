/**
 * Web app manifest generato a build time.
 * Era statico in public/ con `/pieno-dati/` hardcoded in start_url, scope e
 * icone: al cambio di dominio la PWA installata avrebbe puntato altrove.
 */
import type { APIRoute } from 'astro';
import { BASE_PREFIX } from '../../site.config.mjs';

export const GET: APIRoute = () => {
  const base = BASE_PREFIX;
  const manifest = {
    name: 'Pieno — Prezzi carburante in Italia',
    short_name: 'Pieno',
    description:
      'Prezzi ufficiali dei carburanti dei distributori in Italia, aggiornati ogni giorno.',
    start_url: `${base}/`,
    scope: `${base}/`,
    id: `${base}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f7f5f0',
    theme_color: '#12303a',
    lang: 'it',
    dir: 'ltr',
    categories: ['travel', 'utilities', 'navigation'],
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: `${base}/icons/icon-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Calcola il risparmio',
        short_name: 'Risparmio',
        url: `${base}/calcola-risparmio`,
        icons: [{ src: `${base}/icons/icon-192.png`, sizes: '192x192' }],
      },
      {
        name: 'Andamento prezzi',
        short_name: 'Andamento',
        url: `${base}/andamento-prezzi`,
        icons: [{ src: `${base}/icons/icon-192.png`, sizes: '192x192' }],
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
};
