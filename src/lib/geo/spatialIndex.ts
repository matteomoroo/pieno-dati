/**
 * Indice spaziale a griglia per trovare velocemente i distributori vicini.
 *
 * Calcolare la distanza di ogni stazione da tutte le altre sarebbe O(n²)
 * (~470 milioni di operazioni per 21.000 stazioni): troppo lento in build.
 * Con una griglia a celle di ~0.1° raggruppiamo le stazioni per area e
 * cerchiamo solo nelle celle adiacenti. Riduce il lavoro di ordini di grandezza.
 */
import type { Station } from '../../types/pieno.ts';
import { haversineKm } from '../../../scripts/lib/geo.ts';

const CELL = 0.1; // gradi (~11 km di lato)

function key(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
}

export class SpatialIndex {
  private grid = new Map<string, Station[]>();

  constructor(stations: Station[]) {
    for (const s of stations) {
      const k = key(s.lat, s.lng);
      const cell = this.grid.get(k);
      if (cell) cell.push(s);
      else this.grid.set(k, [s]);
    }
  }

  /** Stazioni entro radiusKm da (lat,lng), escludendo opzionalmente un id. */
  near(lat: number, lng: number, radiusKm: number, excludeId?: string): Station[] {
    const cellsToCheck = Math.ceil(radiusKm / (CELL * 78)) + 1; // ~78km per grado
    const clat = Math.floor(lat / CELL);
    const clng = Math.floor(lng / CELL);
    const out: Station[] = [];
    for (let i = -cellsToCheck; i <= cellsToCheck; i++) {
      for (let j = -cellsToCheck; j <= cellsToCheck; j++) {
        const cell = this.grid.get(`${clat + i}:${clng + j}`);
        if (!cell) continue;
        for (const s of cell) {
          if (excludeId && s.id === excludeId) continue;
          if (haversineKm(lat, lng, s.lat, s.lng) <= radiusKm) out.push(s);
        }
      }
    }
    return out;
  }
}
