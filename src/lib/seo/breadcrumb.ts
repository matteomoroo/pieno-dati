/**
 * Costruisce dati strutturati JSON-LD per i breadcrumb (schema.org
 * BreadcrumbList). Aiuta i motori di ricerca a capire la gerarchia delle
 * pagine territoriali e a mostrare i breadcrumb nei risultati.
 */

export interface Crumb {
  name: string;
  url: string;
}

export function breadcrumbLd(crumbs: Crumb[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}
