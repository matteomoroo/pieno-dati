/**
 * Utility condivise per la generazione delle sitemap.
 *
 * Pieno pubblica oltre 22.000 URL indicizzabili: una sitemap singola sarebbe
 * scomoda da diagnosticare in Search Console e vicina ai limiti di dimensione.
 * Usiamo quindi un sitemap index con file separati per tipo di pagina, e le
 * stazioni partizionate in blocchi.
 */

/** Limite standard del protocollo: 50.000 URL per file. Restiamo larghi. */
export const URLS_PER_SITEMAP = 10_000;

export interface SitemapEntry {
  /** Path interno, senza origin e senza base path. Es. `/stazione/123-eni`. */
  path: string;
  /** Data ultima modifica in formato ISO (solo data). */
  lastmod?: string;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: string;
}

export function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );
}

/** Costruisce un `<urlset>` completo. */
export function renderUrlset(
  entries: SitemapEntry[],
  toAbsolute: (path: string) => string,
): string {
  const body = entries
    .map((entry) => {
      const parts = [`<loc>${escapeXml(toAbsolute(entry.path))}</loc>`];
      if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) parts.push(`<changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority) parts.push(`<priority>${entry.priority}</priority>`);
      return `  <url>${parts.join('')}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Costruisce un `<sitemapindex>`. */
export function renderSitemapIndex(
  paths: string[],
  lastmod: string,
  toAbsolute: (path: string) => string,
): string {
  const body = paths
    .map(
      (p) =>
        `  <sitemap><loc>${escapeXml(toAbsolute(p))}</loc><lastmod>${lastmod}</lastmod></sitemap>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** Divide un elenco in blocchi da `URLS_PER_SITEMAP`. */
export function chunk<T>(items: T[], size = URLS_PER_SITEMAP): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Pagine statiche indicizzabili. Unica fonte di verità, usata anche dai test. */
export const STATIC_PATHS: SitemapEntry[] = [
  { path: '', changefreq: 'daily', priority: '1.0' },
  { path: '/andamento-prezzi', changefreq: 'daily', priority: '0.8' },
  { path: '/calcola-risparmio', changefreq: 'weekly', priority: '0.8' },
];
