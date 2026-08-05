/**
 * Carica e mette in cache l'albero territoriale in build-time.
 * Le pagine regione/provincia/comune lo usano via getStaticPaths.
 */
import { loadStations } from '../data/load.ts';
import { buildTerritory, type RegionNode } from './territory.ts';

let cache: RegionNode[] | null = null;

export function getTerritory(): RegionNode[] {
  if (!cache) {
    cache = buildTerritory(loadStations());
  }
  return cache;
}
