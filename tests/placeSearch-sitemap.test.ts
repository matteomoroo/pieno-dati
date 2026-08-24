import { describe, it, expect } from 'vitest';
import { searchPlaces, normalize, type Place } from '../src/lib/geo/placeSearch.ts';
import {
  chunk,
  renderUrlset,
  renderSitemapIndex,
  escapeXml,
  STATIC_PATHS,
  URLS_PER_SITEMAP,
} from '../src/lib/seo/sitemap.ts';

const places: Place[] = [
  { q: 'milano', name: 'Milano', prov: 'MI', lat: 45.46, lng: 9.19, count: 320 },
  { q: 'milano marittima', name: 'Milano Marittima', prov: 'RA', lat: 44.27, lng: 12.35, count: 4 },
  { q: 'roma', name: 'Roma', prov: 'RM', lat: 41.89, lng: 12.49, count: 830 },
  { q: 'sesto san giovanni', name: 'Sesto San Giovanni', prov: 'MI', lat: 45.53, lng: 9.23, count: 18 },
  { q: "reggio nell'emilia", name: "Reggio nell'Emilia", prov: 'RE', lat: 44.7, lng: 10.63, count: 40 },
  { q: "l'aquila", name: "L'Aquila", prov: 'AQ', lat: 42.35, lng: 13.38, count: 24 },
];

describe('ricerca località', () => {
  it('normalizza accenti e maiuscole', () => {
    expect(normalize('Forlì')).toBe('forli');
    expect(normalize('  SAN   BENEDETTO ')).toBe('san benedetto');
  });

  it('ignora le query troppo corte per essere utili', () => {
    expect(searchPlaces(places, 'm')).toEqual([]);
    expect(searchPlaces(places, '')).toEqual([]);
  });

  it('mette prima i nomi che iniziano con la query', () => {
    const result = searchPlaces(places, 'milano');
    expect(result[0]?.name).toBe('Milano');
    expect(result[1]?.name).toBe('Milano Marittima');
  });

  it('a parità di posizione preferisce i comuni con più distributori', () => {
    const result = searchPlaces(places, 'milano');
    expect(result[0]?.count).toBeGreaterThan(result[1]?.count ?? 0);
  });

  it('trova anche le corrispondenze interne al nome', () => {
    const result = searchPlaces(places, 'giovanni');
    expect(result.map((p) => p.name)).toContain('Sesto San Giovanni');
  });

  it('filtra per provincia quando la query la contiene', () => {
    expect(searchPlaces(places, 'milano MI').map((p) => p.name)).toEqual(['Milano']);
    expect(searchPlaces(places, 'milano, RA').map((p) => p.name)).toEqual([
      'Milano Marittima',
    ]);
  });

  it('trova i comuni con apostrofo scritti con o senza apostrofo', () => {
    expect(searchPlaces(places, "reggio nell'emilia").map((p) => p.prov)).toEqual(['RE']);
    expect(searchPlaces(places, 'reggio nell emilia').map((p) => p.prov)).toEqual(['RE']);
    expect(searchPlaces(places, "l'aquila").map((p) => p.prov)).toEqual(['AQ']);
    expect(searchPlaces(places, 'l aquila').map((p) => p.prov)).toEqual(['AQ']);
  });

  it('restituisce un elenco vuoto per query senza corrispondenze', () => {
    expect(searchPlaces(places, 'atlantide')).toEqual([]);
  });

  it('non supera il limite richiesto', () => {
    expect(searchPlaces(places, 'a', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('sitemap', () => {
  it('divide in blocchi che rispettano il limite', () => {
    const items = Array.from({ length: URLS_PER_SITEMAP * 2 + 7 }, (_, i) => i);
    const blocks = chunk(items);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toHaveLength(URLS_PER_SITEMAP);
    expect(blocks[2]).toHaveLength(7);
    expect(blocks.flat()).toHaveLength(items.length);
  });

  it('non perde elementi né crea blocchi vuoti', () => {
    expect(chunk([])).toEqual([]);
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it('produce URL assoluti', () => {
    const xml = renderUrlset([{ path: '/stazione/1-eni' }], (p) => `https://pieno.it${p}`);
    expect(xml).toContain('<loc>https://pieno.it/stazione/1-eni</loc>');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('effettua l\'escape dei caratteri XML', () => {
    expect(escapeXml("a&b<c>d\"e'f")).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
    const xml = renderUrlset([{ path: '/x?a=1&b=2' }], (p) => `https://pieno.it${p}`);
    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/=1&b/);
  });

  it('genera un sitemap index valido', () => {
    const xml = renderSitemapIndex(
      ['/sitemap-statiche.xml'],
      '2026-08-21',
      (p) => `https://pieno.it${p}`,
    );
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('<lastmod>2026-08-21</lastmod>');
  });

  it('dichiara le pagine statiche indicizzabili, homepage inclusa', () => {
    const paths = STATIC_PATHS.map((e) => e.path);
    expect(paths).toContain('');
    expect(paths).toContain('/calcola-risparmio');
    expect(paths).toContain('/andamento-prezzi');
  });

  it('non include pagine di servizio come 404 e offline', () => {
    const paths = STATIC_PATHS.map((e) => e.path);
    expect(paths).not.toContain('/404');
    expect(paths).not.toContain('/offline');
  });
});
