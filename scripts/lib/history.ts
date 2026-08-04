/**
 * Cronologia delle medie nazionali e calcolo dei trend.
 *
 * Questo modulo è puro: prende la cronologia esistente e il punto di oggi,
 * restituisce la cronologia aggiornata. La PERSISTENZA (dove il file vive fra
 * un run e l'altro) è responsabilità del workflow, non di qui — vedi
 * docs/decisions/0002-history-persistence.md.
 *
 * Requisiti soddisfatti:
 *  - nessun duplicato per data (rilancio nello stesso giorno = upsert);
 *  - almeno 365 giorni di ritenzione;
 *  - ordinamento cronologico stabile;
 *  - trend derivato realmente dalla serie.
 */

import type {
  FuelKey,
  HistoryPoint,
  NationalStats,
  Trend,
  Trends,
  TrendDirection,
} from '../../src/types/pieno.ts';
import { FUEL_KEYS } from '../../src/types/pieno.ts';

/** Giorni di cronologia da conservare. */
export const HISTORY_RETENTION_DAYS = 400; // >365, con margine

/** Costruisce il punto-cronologia di oggi dalle statistiche nazionali. */
export function buildHistoryPoint(
  date: string,
  stats: NationalStats,
): HistoryPoint {
  const self: Partial<Record<FuelKey, number>> = {};
  const served: Partial<Record<FuelKey, number>> = {};
  for (const k of FUEL_KEYS) {
    const s = stats[k];
    if (s?.self) self[k] = s.self.mean;
    if (s?.served) served[k] = s.served.mean;
  }
  return { date, self, served };
}

/**
 * Aggiorna la cronologia in modo idempotente.
 * - rimuove un'eventuale voce con la stessa data (upsert per rilanci);
 * - inserisce il nuovo punto;
 * - ordina per data crescente;
 * - taglia alle ultime HISTORY_RETENTION_DAYS voci.
 */
export function upsertHistory(
  existing: HistoryPoint[],
  todays: HistoryPoint,
): HistoryPoint[] {
  const filtered = existing.filter((h) => h.date !== todays.date);
  filtered.push(todays);
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  if (filtered.length > HISTORY_RETENTION_DAYS) {
    return filtered.slice(-HISTORY_RETENTION_DAYS);
  }
  return filtered;
}

/**
 * Calcola il trend di un carburante dalla serie delle medie SELF.
 * Confronta l'ultimo punto con quello di ~7 giorni prima (o col più vecchio
 * disponibile se la serie è più corta). Ritorna null se meno di 2 punti.
 */
export function computeTrend(
  history: HistoryPoint[],
  fuel: FuelKey,
): Trend | null {
  const series = history
    .map((h) => ({ date: h.date, v: h.self[fuel] }))
    .filter((p): p is { date: string; v: number } => p.v != null);

  if (series.length < 2) return null;

  const today = series[series.length - 1].v;
  const refIndex = series.length >= 8 ? series.length - 8 : 0;
  const reference = series[refIndex].v;
  const daysBack = series.length >= 8 ? 7 : series.length - 1;

  const deltaCents = round1((today - reference) * 100);

  let direction: TrendDirection;
  if (deltaCents >= 1.0) direction = 'up';
  else if (deltaCents <= -1.0) direction = 'down';
  else direction = 'flat';

  return {
    direction,
    deltaCents,
    daysBack,
    today: round3(today),
    reference: round3(reference),
    points: series.length,
  };
}

/** Calcola i trend per tutti i carburanti presenti nella serie. */
export function computeAllTrends(history: HistoryPoint[]): Trends {
  const out: Trends = {};
  for (const k of FUEL_KEYS) {
    const t = computeTrend(history, k);
    if (t) out[k] = t;
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
