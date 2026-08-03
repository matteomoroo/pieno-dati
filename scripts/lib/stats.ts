/**
 * Statistiche aggregate.
 *
 * Il vecchio codice calcolava solo la MEDIA nazionale, sensibile agli outlier.
 * Qui aggiungiamo la MEDIANA e teniamo self e servito separati, come richiede
 * lo schema v2.
 */

import type {
  FuelKey,
  FuelStats,
  NationalStats,
  Station,
} from '../../src/types/pieno.ts';
import { FUEL_KEYS } from '../../src/types/pieno.ts';

/** Media aritmetica arrotondata a 4 decimali. */
export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  const sum = values.reduce((a, b) => a + b, 0);
  return round4(sum / values.length);
}

/** Mediana; con lunghezza pari fa la media dei due centrali. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return round4(m);
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Statistiche complete da un array di prezzi. Null se vuoto. */
export function fuelStats(values: number[]): FuelStats | null {
  if (values.length === 0) return null;
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    min: round4(Math.min(...values)),
    max: round4(Math.max(...values)),
  };
}

/**
 * Aggrega le statistiche nazionali da tutte le stazioni, per carburante e
 * per modalità (self / served) separatamente.
 */
export function computeNationalStats(stations: Station[]): NationalStats {
  const selfValues: Record<string, number[]> = {};
  const servedValues: Record<string, number[]> = {};
  for (const k of FUEL_KEYS) {
    selfValues[k] = [];
    servedValues[k] = [];
  }

  for (const s of stations) {
    for (const k of FUEL_KEYS) {
      const fp = s.fuels[k];
      if (!fp) continue;
      if (fp.self != null) selfValues[k].push(fp.self);
      if (fp.served != null) servedValues[k].push(fp.served);
    }
  }

  const out: NationalStats = {};
  for (const k of FUEL_KEYS) {
    const selfStat = fuelStats(selfValues[k]);
    const servedStat = fuelStats(servedValues[k]);
    if (selfStat || servedStat) {
      out[k] = {};
      if (selfStat) out[k]!.self = selfStat;
      if (servedStat) out[k]!.served = servedStat;
    }
  }
  return out;
}

/** Conteggi per carburante e modalità. */
export function computeCounts(
  stations: Station[],
): Partial<Record<FuelKey, { self: number; served: number }>> {
  const out: Partial<Record<FuelKey, { self: number; served: number }>> = {};
  for (const s of stations) {
    for (const k of FUEL_KEYS) {
      const fp = s.fuels[k];
      if (!fp) continue;
      if (!out[k]) out[k] = { self: 0, served: 0 };
      if (fp.self != null) out[k]!.self++;
      if (fp.served != null) out[k]!.served++;
    }
  }
  return out;
}
