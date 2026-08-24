/** Sitemap delle pagine statiche indicizzabili. */
import type { APIRoute } from 'astro';
import { renderUrlset, STATIC_PATHS } from '../lib/seo/sitemap.ts';
import { absoluteUrl } from '../../site.config.mjs';

export const GET: APIRoute = () =>
  new Response(renderUrlset(STATIC_PATHS, (p) => absoluteUrl(p)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
