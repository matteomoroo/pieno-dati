/**
 * Sitemap generata manualmente (endpoint Astro).
 * Più affidabile del plugin con base path: elenca home + tutte le pagine
 * territoriali (regioni, province, comuni). Google la usa per scoprire le
 * pagine.
 */
import type { APIRoute } from 'astro';
import { getTerritory } from '../lib/geo/loadTerritory.ts';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const origin = (site?.href ?? 'https://matteomoroo.github.io/').replace(/\/$/, '');
  const root = `${origin}${base}`;

  const urls: string[] = [root]; // homepage

  for (const region of getTerritory()) {
    urls.push(`${root}/prezzi-carburante/${region.slug}`);
    for (const prov of region.province) {
      urls.push(`${root}/prezzi-carburante/${region.slug}/${prov.slug}`);
      for (const comune of prov.comuni) {
        urls.push(
          `${root}/prezzi-carburante/${region.slug}/${prov.slug}/${comune.slug}`,
        );
      }
    }
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`)
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
