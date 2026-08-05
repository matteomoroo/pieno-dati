/**
 * Costruzione dell'indice di ricerca delle località.
 *
 * Funzione pura riusabile: la pipeline (build.ts) la chiama dopo aver prodotto
 * le stazioni, così l'indice è sempre allineato e generato automaticamente nel
 * workflow. Nessun elenco hardcoded: comuni, province e coordinate derivano
 * dalle stazioni.
 */
import type { Station } from '../src/types/pieno.ts';

export interface LocalityEntry {
  q: string;
  name: string;
  prov: string;
  lat: number;
  lng: number;
  count: number;
}

/** Normalizza per il match: minuscolo, senza accenti, trim. */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Costruisce l'indice località dalle stazioni. */
export function buildSearchIndex(stations: Station[]): LocalityEntry[] {
  interface Acc {
    name: string;
    prov: string;
    latSum: number;
    lngSum: number;
    count: number;
  }
  const byComune = new Map<string, Acc>();
  for (const s of stations) {
    if (!s.comune) continue;
    const key = `${normalizeForSearch(s.comune)}|${s.provincia}`;
    const acc = byComune.get(key);
    if (acc) {
      acc.latSum += s.lat;
      acc.lngSum += s.lng;
      acc.count++;
    } else {
      byComune.set(key, {
        name: s.comune,
        prov: s.provincia,
        latSum: s.lat,
        lngSum: s.lng,
        count: 1,
      });
    }
  }
  return [...byComune.values()]
    .map((a) => ({
      q: normalizeForSearch(a.name),
      name: a.name,
      prov: a.prov,
      lat: Math.round((a.latSum / a.count) * 1e5) / 1e5,
      lng: Math.round((a.lngSum / a.count) * 1e5) / 1e5,
      count: a.count,
    }))
    .sort((x, y) => y.count - x.count);
}
