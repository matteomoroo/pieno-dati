/** Sitemap di regioni, province e comuni pubblicati. */
import type { APIRoute } from 'astro';
import { getTerritory } from '../lib/geo/loadTerritory.ts';
import { renderUrlset, type SitemapEntry } from '../lib/seo/sitemap.ts';
import { absoluteUrl } from '../../site.config.mjs';

export const GET: APIRoute = () => {
  const entries: SitemapEntry[] = [];

  for (const region of getTerritory()) {
    entries.push({
      path: `/prezzi-carburante/${region.slug}`,
      changefreq: 'daily',
      priority: '0.8',
    });
    for (const prov of region.province) {
      entries.push({
        path: `/prezzi-carburante/${region.slug}/${prov.slug}`,
        changefreq: 'daily',
        priority: '0.7',
      });
      for (const comune of prov.comuni) {
        entries.push({
          path: `/prezzi-carburante/${region.slug}/${prov.slug}/${comune.slug}`,
          changefreq: 'daily',
          priority: '0.6',
        });
      }
    }
  }

  return new Response(renderUrlset(entries, (p) => absoluteUrl(p)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
