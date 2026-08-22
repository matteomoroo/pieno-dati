/**
 * Sitemap delle pagine stazione, partizionate in blocchi da URLS_PER_SITEMAP.
 * Sono la parte più grande e più preziosa dell'indice di Pieno.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadStations } from '../lib/data/load.ts';
import { stationSlug } from '../lib/geo/stationPage.ts';
import { renderUrlset, chunk, type SitemapEntry } from '../lib/seo/sitemap.ts';
import { absoluteUrl } from '../../site.config.mjs';

export const getStaticPaths: GetStaticPaths = () => {
  const blocks = chunk(loadStations());
  return blocks.map((stations, i) => ({
    params: { page: String(i + 1) },
    props: { stations },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const { stations } = props as { stations: Parameters<typeof stationSlug>[0][] };

  const entries: SitemapEntry[] = stations.map((s) => ({
    path: `/stazione/${stationSlug(s)}`,
    changefreq: 'daily',
    priority: '0.5',
  }));

  return new Response(renderUrlset(entries, (p) => absoluteUrl(p)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
