/**
 * robots.txt generato dalla configurazione centrale, così la Sitemap dichiarata
 * segue sempre SITE_URL e BASE_PATH invece di puntare a GitHub Pages.
 */
import type { APIRoute } from 'astro';
import { absoluteUrl } from '../../site.config.mjs';

export const GET: APIRoute = () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
