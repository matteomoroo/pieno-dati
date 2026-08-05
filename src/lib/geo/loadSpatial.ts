/**
 * Indice spaziale in cache per le pagine stazione (build-time).
 */
import { loadStations } from '../data/load.ts';
import { SpatialIndex } from './spatialIndex.ts';
import type { Station } from '../../types/pieno.ts';

let cache: { index: SpatialIndex; stations: Station[] } | null = null;

export function getSpatialIndex(): { index: SpatialIndex; stations: Station[] } {
  if (!cache) {
    const stations = loadStations();
    cache = { index: new SpatialIndex(stations), stations };
  }
  return cache;
}
