/**
 * Sitemap index. Punta ai file per tipo di pagina.
 * Prima questo endpoint conteneva l'intera sitemap ma elencava solo home e
 * pagine territoriali: le 21.567 pagine stazione — il 95% del sito — non
 * erano dichiarate.
 */
import type { APIRoute } from 'astro';
import { getTerritory } from '../lib/geo/loadTerritory.ts';
import { loadStations } from '../lib/data/load.ts';
import { renderSitemapIndex, chunk } from '../lib/seo/sitemap.ts';
import { absoluteUrl } from '../../site.config.mjs';

export const GET: APIRoute = () => {
  const stationPages = chunk(loadStations()).length;
  const paths = ['/sitemap-statiche.xml', '/sitemap-territorio.xml'];
  for (let i = 1; i <= stationPages; i++) paths.push(`/sitemap-stazioni-${i}.xml`);

  const lastmod = new Date().toISOString().slice(0, 10);
  void getTerritory(); // garantisce che il territorio sia caricabile in build

  return new Response(renderSitemapIndex(paths, lastmod, (p) => absoluteUrl(p)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
