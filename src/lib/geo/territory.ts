/**
 * Aggregazione territoriale.
 * Costruisce, dalle stazioni, un albero regione -> provincia -> comune con
 * statistiche per carburante (media, mediana, min, max, conteggio) distinte
 * per modalità self/servito. Funzione pura, usata in build-time dalle pagine.
 */

import type { Station, FuelKey } from '../../types/pieno.ts';
import { FUEL_KEYS } from '../../types/pieno.ts';
import { regionOf, toSlug, provinceName } from './regions.ts';

export interface AreaFuelStat {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
}
export type AreaStats = Partial<
  Record<FuelKey, { self?: AreaFuelStat; served?: AreaFuelStat }>
>;

export interface CheapestStation {
  id: string;
  name: string;
  brand: string;
  comune: string;
  price: number;
}

export interface ComuneNode {
  name: string;
  slug: string;
  provincia: string;
  regione: string;
  stationCount: number;
  stats: AreaStats;
  cheapest: Partial<Record<FuelKey, CheapestStation>>;
  lat: number;
  lng: number;
}

export interface ProvinceNode {
  name: string; // sigla
  fullName: string; // nome esteso (es. "Milano")
  slug: string;
  regione: string;
  stationCount: number;
  stats: AreaStats;
  comuni: ComuneNode[];
  lat: number;
  lng: number;
}

export interface RegionNode {
  name: string;
  slug: string;
  stationCount: number;
  stats: AreaStats;
  province: ProvinceNode[];
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function r3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

/** Statistiche per un gruppo di stazioni. */
function statsFor(stations: Station[]): AreaStats {
  const selfVals: Record<string, number[]> = {};
  const servVals: Record<string, number[]> = {};
  for (const k of FUEL_KEYS) {
    selfVals[k] = [];
    servVals[k] = [];
  }
  for (const s of stations) {
    for (const k of FUEL_KEYS) {
      const fp = s.fuels[k];
      if (!fp) continue;
      if (fp.self != null) selfVals[k].push(fp.self);
      if (fp.served != null) servVals[k].push(fp.served);
    }
  }
  const out: AreaStats = {};
  for (const k of FUEL_KEYS) {
    const entry: { self?: AreaFuelStat; served?: AreaFuelStat } = {};
    if (selfVals[k].length > 0) entry.self = mk(selfVals[k]);
    if (servVals[k].length > 0) entry.served = mk(servVals[k]);
    if (entry.self || entry.served) out[k] = entry;
  }
  return out;
}
function mk(vals: number[]): AreaFuelStat {
  return {
    count: vals.length,
    mean: r3(vals.reduce((a, b) => a + b, 0) / vals.length),
    median: r3(median(vals)),
    min: r3(Math.min(...vals)),
    max: r3(Math.max(...vals)),
  };
}

/** Distributore più economico per carburante (prezzo self, fallback served). */
function cheapestFor(
  stations: Station[],
): Partial<Record<FuelKey, CheapestStation>> {
  const out: Partial<Record<FuelKey, CheapestStation>> = {};
  for (const k of FUEL_KEYS) {
    let best: CheapestStation | null = null;
    for (const s of stations) {
      const p = s.fuels[k]?.self ?? s.fuels[k]?.served;
      if (p == null) continue;
      if (!best || p < best.price) {
        best = { id: s.id, name: s.name, brand: s.brand, comune: s.comune, price: p };
      }
    }
    if (best) out[k] = best;
  }
  return out;
}

/**
 * Numero minimo di distributori perché un comune abbia una pagina propria.
 *
 * Scelta deliberata, non un limite tecnico: sotto questa soglia la pagina
 * comunale avrebbe troppo poco contenuto per essere utile a un lettore o
 * credibile per un motore di ricerca (mediane calcolate su una o due
 * stazioni, nessun confronto possibile). Le stazioni dei comuni esclusi
 * contribuiscono comunque alle statistiche di provincia e regione e hanno
 * ognuna la propria pagina stazione: non si perde nulla dall'indice.
 *
 * Effetto sui dati di agosto 2026: 5.265 comuni presenti, 1.068 pubblicati,
 * 4.197 esclusi (di cui 2.232 con un solo distributore).
 */
export const MIN_COMUNE_STATIONS = 5;

/**
 * Costruisce l'albero territoriale completo.
 * I comuni sotto la soglia minima NON producono un nodo comune (niente pagina),
 * ma le loro stazioni contribuiscono comunque a provincia e regione.
 */
export function buildTerritory(stations: Station[]): RegionNode[] {
  // raggruppa per regione/provincia/comune
  type Bucket = { stations: Station[] };
  const regions = new Map<string, Map<string, Map<string, Bucket>>>();

  for (const s of stations) {
    const region = regionOf(s.provincia);
    if (!region) continue; // provincia sconosciuta: esclusa dalle pagine
    if (!regions.has(region)) regions.set(region, new Map());
    const provs = regions.get(region)!;
    if (!provs.has(s.provincia)) provs.set(s.provincia, new Map());
    const comuni = provs.get(s.provincia)!;
    if (!comuni.has(s.comune)) comuni.set(s.comune, { stations: [] });
    comuni.get(s.comune)!.stations.push(s);
  }

  const result: RegionNode[] = [];
  for (const [regionName, provs] of regions) {
    const regionStations: Station[] = [];
    const provinceNodes: ProvinceNode[] = [];

    for (const [provName, comuni] of provs) {
      const provStations: Station[] = [];
      const comuneNodes: ComuneNode[] = [];

      for (const [comuneName, bucket] of comuni) {
        provStations.push(...bucket.stations);
        if (bucket.stations.length < MIN_COMUNE_STATIONS) continue; // soglia
        const lat =
          bucket.stations.reduce((a, s) => a + s.lat, 0) / bucket.stations.length;
        const lng =
          bucket.stations.reduce((a, s) => a + s.lng, 0) / bucket.stations.length;
        comuneNodes.push({
          name: comuneName,
          slug: toSlug(comuneName),
          provincia: provName,
          regione: regionName,
          stationCount: bucket.stations.length,
          stats: statsFor(bucket.stations),
          cheapest: cheapestFor(bucket.stations),
          lat: Math.round(lat * 1e5) / 1e5,
          lng: Math.round(lng * 1e5) / 1e5,
        });
      }

      regionStations.push(...provStations);
      comuneNodes.sort((a, b) => b.stationCount - a.stationCount);
      const pLat =
        provStations.reduce((a, s) => a + s.lat, 0) / (provStations.length || 1);
      const pLng =
        provStations.reduce((a, s) => a + s.lng, 0) / (provStations.length || 1);
      provinceNodes.push({
        name: provName,
        fullName: provinceName(provName),
        slug: toSlug(provName),
        regione: regionName,
        stationCount: provStations.length,
        stats: statsFor(provStations),
        comuni: comuneNodes,
        lat: Math.round(pLat * 1e5) / 1e5,
        lng: Math.round(pLng * 1e5) / 1e5,
      });
    }

    provinceNodes.sort((a, b) => b.stationCount - a.stationCount);
    result.push({
      name: regionName,
      slug: toSlug(regionName),
      stationCount: regionStations.length,
      stats: statsFor(regionStations),
      province: provinceNodes,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
